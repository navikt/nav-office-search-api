import { logger } from '@navikt/navno-logger';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { startApp } from '#test/app.ts';
import { installMockFetch } from '#test/fetch.ts';
import {
	NAIS_TOKEN_ENDPOINT,
	PDL_GRAPHQL_URL,
	PDL_TOKEN_TARGET,
	pdlAdresseAnswer,
	pdlErrorAnswer,
	texasToken,
	vegadresse,
} from '#test/fixtures.ts';
import { expectLookups } from '#test/pdl.ts';

const http = installMockFetch();

afterEach(() => {
	vi.useRealTimers();
});

const SEARCH = '/adresse?queryString=Storgata';

const authorizations = () => http.callsTo(PDL_GRAPHQL_URL).map((call) => call.headers.get('authorization'));
const askedOfTexas = () => http.callsTo(NAIS_TOKEN_ENDPOINT).map((call) => call.json<Record<string, unknown>>());

const token = { identity_provider: 'entra_id', target: PDL_TOKEN_TARGET };
const newToken = { ...token, skip_cache: true };

// Every log call in order, as [level, ...args]
const logged = () => {
	const spies = (['debug', 'info', 'warn', 'error'] as const).map((level) => [level, vi.spyOn(logger, level)] as const);
	return () =>
		spies
			.flatMap(([level, spy]) =>
				spy.mock.calls.map((args, i) => ({ order: spy.mock.invocationCallOrder[i] ?? 0, call: [level, ...args] }))
			)
			.toSorted((a, b) => a.order - b.order)
			.map(({ call }) => call);
};

// The server's 4 s deadline in 40 ms, and a record of what it asked for. The tests' own request timeout is left alone.
const shortDeadline = () => {
	const timeout = AbortSignal.timeout.bind(AbortSignal);
	return vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => timeout(ms === 4000 ? 40 : ms));
};

describe('a PDL request', () => {
	test('is one POST of the query and its variables, asking for JSON', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlAdresseAnswer([]) });
		const app = await startApp();

		await app.get(SEARCH);

		const [call, ...more] = http.callsTo(PDL_GRAPHQL_URL);
		expect(more).toEqual([]);
		expect(call?.method).toBe('POST');
		expect(call?.headers.get('content-type')).toBe('application/json');
		expect(call?.headers.get('accept')).toBe('application/json');
		expect(Object.keys(call?.json<object>() ?? {})).toEqual(['query', 'variables']);
	});

	test('after a 401, asks Texas for a token it has not kept and tries once more', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, [{ json: texasToken('token-1') }, { json: texasToken('token-2') }]);
		http.post(PDL_GRAPHQL_URL, [{ status: 401 }, { json: pdlAdresseAnswer([vegadresse()]) }]);
		const app = await startApp();

		const res = await app.get(SEARCH);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ totalHits: 1, adresser: [vegadresse()] });
		expect(authorizations()).toEqual(['Bearer token-1', 'Bearer token-2']);
		expect(askedOfTexas()).toEqual([token, newToken]);
	});

	test('does the same when PDL reports the refused token as a GraphQL error on HTTP 200', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, [{ json: texasToken('token-1') }, { json: texasToken('token-2') }]);
		http.post(PDL_GRAPHQL_URL, [
			{ json: pdlErrorAnswer('unauthenticated') },
			{ json: pdlAdresseAnswer([vegadresse()]) },
		]);
		const app = await startApp();

		const res = await app.get(SEARCH);

		expect(res.status).toBe(200);
		expect(authorizations()).toEqual(['Bearer token-1', 'Bearer token-2']);
		expect(askedOfTexas()).toEqual([token, newToken]);
	});

	test('answers 502 when the new token is refused too, and logs only the status and error codes', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, {
			status: 401,
			json: pdlErrorAnswer('unauthenticated', 'Token rejected for Storgata 31B'),
		});
		const logs = logged();
		const app = await startApp();

		const res = await app.get('/adresse?queryString=Storgata%2031B');

		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: 'PDL request failed' });
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(2);
		expect(logs()).toEqual([
			['warn', 'PDL refused the token, trying once more with a new one'],
			['error', 'PDL request failed', { status: 401, errorCodes: ['unauthenticated'] }],
		]);
	});

	test('asks Texas for a new token at most once a minute, however often PDL refuses', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { status: 401 });
		const app = await startApp();

		await app.get(SEARCH);
		expect(askedOfTexas()).toEqual([token, newToken]);
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(2);

		vi.advanceTimersByTime(59_000);
		expect((await app.get(SEARCH)).status).toBe(502);
		expect(askedOfTexas()).toEqual([token, newToken, token]);
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(3);

		vi.advanceTimersByTime(1000);
		await app.get(SEARCH);
		expect(askedOfTexas()).toEqual([token, newToken, token, token, newToken]);
	});

	test('does not try again with PDL_DEVELOPMENT_TOKEN, which there is only one of', async () => {
		vi.stubEnv('PDL_DEVELOPMENT_TOKEN', 'development-token');
		http.post(PDL_GRAPHQL_URL, { status: 401 });
		const app = await startApp();

		const res = await app.get(SEARCH);

		expect(res.status).toBe(502);
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(1);
	});

	test.each([
		['a token without access', { json: pdlErrorAnswer('unauthorized') }],
		['an HTTP error', { status: 503, json: pdlErrorAnswer('server_error') }],
	])('does not try again after %s', async (_, reply) => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, reply);
		const app = await startApp();

		const res = await app.get(SEARCH);

		expect(res.status).toBe(502);
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(1);
		expect(askedOfTexas()).toEqual([token]);
	});

	test('logs only the status and error codes when PDL fails, not the search or PDL text', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, {
			status: 503,
			json: pdlErrorAnswer('server_error', 'PDL unavailable for Storgata 31B'),
		});
		const logs = logged();
		const app = await startApp();

		await app.get('/adresse?queryString=Storgata%2031B');

		expect(logs()).toEqual([['error', 'PDL request failed', { status: 503, errorCodes: ['server_error'] }]]);
	});

	test('answers 502 when the data is not what the query asks for, and logs where', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: { data: { sokAdresse: { totalHits: 'Storgata 31B', hits: [] } } } });
		const logs = logged();
		const app = await startApp();

		const res = await app.get(SEARCH);

		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: 'PDL request failed' });
		expect(logs()).toEqual([
			[
				'error',
				'PDL request failed',
				{ issues: ['sokAdresse.totalHits: Invalid input: expected number, received string'] },
			],
		]);
	});

	test('does not trust data that comes with errors', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, {
			json: { ...pdlAdresseAnswer([vegadresse()]), errors: pdlErrorAnswer('server_error').errors },
		});
		const app = await startApp();

		expect((await app.get(SEARCH)).status).toBe(502);
	});
});

describe('the deadline', () => {
	test('answers 504 when PDL takes longer than 4 s', async () => {
		const deadline = shortDeadline();
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { hang: true });
		const logs = logged();
		const app = await startApp();

		const res = await app.get(SEARCH);

		expect(res.status).toBe(504);
		expect(res.headers.get('content-type')).toBe('application/json');
		expect(await res.json()).toEqual({ error: 'PDL request timed out' });
		expect(deadline.mock.calls.filter(([ms]) => ms === 4000)).toHaveLength(1);
		expect(logs()).toEqual([['error', 'PDL request failed', expect.objectContaining({ name: 'TimeoutError' })]]);
		expect(
			await app.metric('nav_office_search_api_upstream_requests_total', { upstream: 'pdl', status: 'timeout' })
		).toBe(1);
		await expectLookups(app, 'adresse', [0, 0, 1, 0]);
	});

	test('answers 504 without asking PDL when Texas takes longer', async () => {
		shortDeadline();
		http.post(NAIS_TOKEN_ENDPOINT, { hang: true });
		const logs = logged();
		const app = await startApp();

		const res = await app.get(SEARCH);

		expect(res.status).toBe(504);
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(0);
		expect(logs()).toEqual([
			['error', 'Token request for PDL failed', expect.objectContaining({ name: 'TimeoutError' })],
		]);
	});

	test('is one for the token, the query and the second try', async () => {
		const deadline = shortDeadline();
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, [{ status: 401 }, { hang: true }]);
		const app = await startApp();

		const res = await app.get(SEARCH);

		// The second try is ended by the same deadline: there is only one, and nothing else would end it in time
		expect(res.status).toBe(504);
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(2);
		expect(deadline.mock.calls.filter(([ms]) => ms === 4000)).toHaveLength(1);
	});
});

describe('the metrics', () => {
	test("count PDL's GraphQL errors by code, on HTTP 200 and on an HTTP error", async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, [
			{ json: pdlErrorAnswer('bad_request') },
			{ status: 503, json: pdlErrorAnswer('server_error') },
			{ json: pdlErrorAnswer('quota_exceeded') },
			{ json: { errors: [{ message: 'No code' }], data: null } },
			{ json: pdlAdresseAnswer([]) },
		]);
		const app = await startApp();
		const errors = (code: string) => app.metric('nav_office_search_api_pdl_errors_total', { code });

		for (let i = 0; i < 5; i++) {
			await app.get(SEARCH);
		}

		expect(await errors('bad_request')).toBe(1);
		expect(await errors('server_error')).toBe(1);
		expect(await errors('other')).toBe(2);
		expect(await errors('unauthenticated')).toBe(0);
	});

	test('count and time the requests to PDL and to Texas', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, [{ json: pdlAdresseAnswer([]) }, { status: 503 }]);
		const app = await startApp();
		const requests = (upstream: string, status: string) =>
			app.metric('nav_office_search_api_upstream_requests_total', { upstream, status });

		await app.get(SEARCH);
		await app.get(SEARCH);

		expect(await requests('texas', '2xx')).toBe(2);
		expect(await requests('pdl', '2xx')).toBe(1);
		expect(await requests('pdl', '5xx')).toBe(1);
		expect(await app.metric('nav_office_search_api_upstream_request_duration_seconds_count', { upstream: 'pdl' })).toBe(
			2
		);
	});
});
