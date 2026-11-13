import { networkError } from '@itsy/corgi/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { startApp } from '#test/app.ts';
import { installMockFetch } from '#test/fetch.ts';
import { NAIS_TOKEN_ENDPOINT, PDL_GRAPHQL_URL, PDL_TOKEN_TARGET, pdlBydelAnswer, texasToken } from '#test/fixtures.ts';

const http = installMockFetch();

afterEach(() => {
	vi.useRealTimers();
});

const pdlAnswers = () => http.post(PDL_GRAPHQL_URL, { json: pdlBydelAnswer(['030101']) });

describe('the token for PDL', () => {
	test('asks Texas for an Entra ID token for PDL_TOKEN_TARGET', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken('texas-token') });
		pdlAnswers();
		const app = await startApp();

		expect((await app.get('/bydel?postnummer=0150')).status).toBe(200);

		const [call] = http.callsTo(NAIS_TOKEN_ENDPOINT, 'POST');
		expect(call?.headers.get('content-type')).toBe('application/json');
		expect(call?.json()).toEqual({ identity_provider: 'entra_id', target: PDL_TOKEN_TARGET });
		expect(http.lastCall?.headers.get('authorization')).toBe('Bearer texas-token');
	});

	test('reuses the token until 60 s before it expires', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		http.post(NAIS_TOKEN_ENDPOINT, [{ json: texasToken('token-1', 3600) }, { json: texasToken('token-2', 3600) }]);
		pdlAnswers();
		const app = await startApp();

		await app.get('/bydel?postnummer=0150');
		vi.advanceTimersByTime(3539 * 1000);
		await app.get('/bydel?postnummer=0150');
		expect(http.callsTo(NAIS_TOKEN_ENDPOINT)).toHaveLength(1);

		vi.advanceTimersByTime(2 * 1000);
		await app.get('/bydel?postnummer=0150');
		expect(http.callsTo(NAIS_TOKEN_ENDPOINT)).toHaveLength(2);
		expect(http.lastCall?.headers.get('authorization')).toBe('Bearer token-2');
	});

	test('keeps a token that expires within 60 s forever (bug)', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken('token-1', 60) });
		pdlAnswers();
		const app = await startApp();

		await app.get('/bydel?postnummer=0150');
		vi.advanceTimersByTime(24 * 60 * 60 * 1000);
		await app.get('/bydel?postnummer=0150');

		expect(http.callsTo(NAIS_TOKEN_ENDPOINT)).toHaveLength(1);
		expect(http.lastCall?.headers.get('authorization')).toBe('Bearer token-1');
	});

	test('uses PDL_DEVELOPMENT_TOKEN instead of Texas when it is set', async () => {
		vi.stubEnv('PDL_DEVELOPMENT_TOKEN', 'development-token');
		pdlAnswers();
		const app = await startApp();

		expect((await app.get('/bydel?postnummer=0150')).status).toBe(200);

		expect(http.callsTo(NAIS_TOKEN_ENDPOINT)).toHaveLength(0);
		expect(http.lastCall?.headers.get('authorization')).toBe('Bearer development-token');
	});

	test.each([
		['answers an error', { status: 500, json: { error: 'server_error' } }],
		['is unreachable', networkError()],
	])('answers 502 without asking PDL when Texas %s', async (_, reply) => {
		http.post(NAIS_TOKEN_ENDPOINT, reply);
		const app = await startApp();

		const res = await app.get('/bydel?postnummer=0150');

		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: 'PDL request failed' });
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(0);
	});
});
