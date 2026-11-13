import { networkError } from '@itsy/corgi/testing';
import { describe, expect, test } from 'vitest';
import { startApp } from '#test/app.ts';
import { installMockFetch } from '#test/fetch.ts';
import { NAIS_TOKEN_ENDPOINT, PDL_GRAPHQL_URL, pdlBydelAnswer, pdlErrorAnswer, texasToken } from '#test/fixtures.ts';

const http = installMockFetch();

const bydelerFor = async (postnummer: string) => {
	const app = await startApp();
	return app.get(`/bydel?postnummer=${encodeURIComponent(postnummer)}`);
};

describe('GET /bydel', () => {
	test('answers the bydeler PDL finds for the postnummer', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlBydelAnswer(['030101', '030104']) });

		const res = await bydelerFor('0150');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(await res.json()).toEqual({ bydeler: ['030101', '030104'] });
	});

	test('sends one aggregation query to PDL with the Texas token', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken('texas-token') });
		http.post(PDL_GRAPHQL_URL, { json: pdlBydelAnswer([]) });

		await bydelerFor('0150');

		const [call] = http.callsTo(PDL_GRAPHQL_URL, 'POST');
		expect(call?.headers.get('authorization')).toBe('Bearer texas-token');
		const body = call?.json<{ query: string; variables: unknown }>();
		expect(body?.query).toContain('sokAdresse(paging: $paging, criteria: $criteria, aggregations: $aggregations)');
		expect(body?.variables).toEqual({
			paging: { pageNumber: 1, resultsPerPage: 50 },
			criteria: [{ fieldName: 'vegadresse.postnummer', searchRule: { equals: '0150' } }],
			aggregations: [{ fieldName: 'vegadresse.kommunenummer' }, { fieldName: 'vegadresse.bydelsnummer' }],
		});
	});

	test('trims the postnummer', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlBydelAnswer(['030101']) });

		const res = await bydelerFor(' 0150 ');

		expect(res.status).toBe(200);
		expect(http.lastCall?.json()).toMatchObject({
			variables: { criteria: [{ searchRule: { equals: '0150' } }] },
		});
	});

	test('answers an empty list for a postnummer without bydeler', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlBydelAnswer([]) });

		const res = await bydelerFor('9990');

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ bydeler: [] });
	});

	test('answers an empty list when PDL leaves out the bydel aggregation', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: { data: { sokAdresse: { aggregations: [] } } } });

		const res = await bydelerFor('9990');

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ bydeler: [] });
	});

	test.each([
		['without postnummer', '/bydel', 'Postnummer is required'],
		['with an empty postnummer', '/bydel?postnummer=', 'Postnummer is required'],
		['with a repeated postnummer', '/bydel?postnummer=0150&postnummer=0151', 'Postnummer is required'],
		['with three digits', '/bydel?postnummer=015', 'Invalid postnummer'],
		['with five digits', '/bydel?postnummer=01500', 'Invalid postnummer'],
		['with letters', '/bydel?postnummer=abcd', 'Invalid postnummer'],
		['with a hyphen', '/bydel?postnummer=01-50', 'Invalid postnummer'],
	])('answers 400 %s, without asking PDL', async (_, path, error) => {
		const app = await startApp();

		const res = await app.get(path);

		expect(res.status).toBe(400);
		expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(await res.json()).toEqual({ error });
		expect(http.calls).toEqual([]);
	});

	test.each([
		['answers an HTTP error', { status: 503, json: pdlErrorAnswer('server_error') }],
		['answers GraphQL errors on HTTP 200', { json: pdlErrorAnswer('bad_request') }],
		['is unreachable', networkError()],
	])('answers 502 when PDL %s', async (_, reply) => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, reply);

		const res = await bydelerFor('0150');

		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ error: 'PDL request failed' });
	});

	test('counts lookups by result', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, [
			{ json: pdlBydelAnswer(['030101']) },
			{ json: pdlBydelAnswer([]) },
			{ status: 503, json: pdlErrorAnswer('server_error') },
		]);
		const app = await startApp();

		await app.get('/bydel?postnummer=0150');
		await app.get('/bydel?postnummer=9990');
		await app.get('/bydel?postnummer=0150');
		await app.get('/bydel');
		await app.get('/bydel?postnummer=abc');

		const lookups = (result: string) =>
			app.metric('nav_office_search_api_lookups_total', { operation: 'bydel', result });
		expect(await lookups('hits')).toBe(1);
		expect(await lookups('empty')).toBe(1);
		expect(await lookups('error')).toBe(1);
		expect(await lookups('invalid')).toBe(2);
	});
});
