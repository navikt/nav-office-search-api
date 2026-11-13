import { describe, expect, test, vi } from 'vitest';
import { startApp } from '#test/app.ts';
import { installMockFetch } from '#test/fetch.ts';
import {
	NAIS_TOKEN_ENDPOINT,
	PDL_GRAPHQL_URL,
	pdlAdresseAnswer,
	pdlErrorAnswer,
	texasToken,
	vegadresse,
} from '#test/fixtures.ts';

const http = installMockFetch();

const authorizations = () => http.callsTo(PDL_GRAPHQL_URL).map((call) => call.headers.get('authorization'));

const logged = () => {
	const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
	return () =>
		spies
			.flatMap((spy) => spy.mock.calls)
			.map((args) => args.map(String).join(' '))
			.join('\n');
};

describe('a PDL request', () => {
	test('after a 401, gets a new token from Texas and tries once more', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, [{ json: texasToken('token-1') }, { json: texasToken('token-2') }]);
		http.post(PDL_GRAPHQL_URL, [{ status: 401 }, { json: pdlAdresseAnswer([vegadresse()]) }]);
		const app = await startApp();

		const res = await app.get('/adresse?queryString=Storgata');

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ totalHits: 1, adresser: [vegadresse()] });
		expect(authorizations()).toEqual(['Bearer token-1', 'Bearer token-2']);
	});

	test('asks Texas the same way after a 401, so Texas answers its cached token (bug)', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, [{ status: 401 }, { json: pdlAdresseAnswer([]) }]);
		const app = await startApp();

		await app.get('/adresse?queryString=Storgata');

		const [first, second] = http.callsTo(NAIS_TOKEN_ENDPOINT).map((call) => call.json());
		expect(second).toEqual(first);
		expect(second).not.toHaveProperty('skip_cache');
	});

	test('answers 502 when the retry gets a 401 too, and logs only the status and error codes', async () => {
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
		expect(logs()).toContain('PDL retry after 401 also failed: HTTP 401, error codes: unauthenticated');
		expect(logs()).not.toMatch(/Storgata|Token rejected/);
	});

	test('does not retry a 401 with PDL_DEVELOPMENT_TOKEN', async () => {
		vi.stubEnv('PDL_DEVELOPMENT_TOKEN', 'development-token');
		http.post(PDL_GRAPHQL_URL, { status: 401 });
		const app = await startApp();

		const res = await app.get('/adresse?queryString=Storgata');

		expect(res.status).toBe(502);
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(1);
	});

	test('does not retry a refused token that PDL reports as a GraphQL error on HTTP 200 (bug)', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlErrorAnswer('unauthenticated') });
		const app = await startApp();

		const res = await app.get('/adresse?queryString=Storgata');

		expect(res.status).toBe(502);
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(1);
	});

	test('answers 502 when PDL_API is not set, and logs why', async () => {
		vi.stubEnv('PDL_API', undefined);
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		const logs = logged();
		const app = await startApp();

		const res = await app.get('/adresse?queryString=Storgata');

		expect(res.status).toBe(502);
		expect(logs()).toContain('PDL_API environment variable is not set');
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(0);
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

		expect(logs()).toContain('PDL request failed: HTTP 503, error codes: server_error');
		expect(logs()).not.toMatch(/Storgata|PDL unavailable/);
	});
});
