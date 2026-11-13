import { describe, expect, test } from 'vitest';
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
import { expectLookups, expectPdlFailed, expectRejected, pdlFailures } from '#test/pdl.ts';

const http = installMockFetch();

const search = async (queryString: string) => {
	const app = await startApp();
	return app.get(`/adresse?queryString=${encodeURIComponent(queryString)}`);
};

const sentToPdl = () =>
	http.callsTo(PDL_GRAPHQL_URL, 'POST').map((call) => call.json<{ query: string; variables: unknown }>());

const fritekst = (contains: string) => ({ fieldName: 'fritekst', searchRule: { contains } });
const husnummer = (prefix: string) => ({ fieldName: 'vegadresse.husnummer', searchRule: { wildcard: `${prefix}*` } });

describe('GET /adresse', () => {
	test('answers the addresses PDL finds', async () => {
		const storgata31B = vegadresse();
		const storgata31 = vegadresse({ husbokstav: null, bydelsnummer: null });
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlAdresseAnswer([storgata31B, storgata31], 2) });

		const res = await search('Storgata 31');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(await res.json()).toEqual({ totalHits: 2, adresser: [storgata31B, storgata31] });
	});

	test('sends one sokAdresse query to PDL with the Texas token, 30 hits per page', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken('texas-token') });
		http.post(PDL_GRAPHQL_URL, { json: pdlAdresseAnswer([]) });

		await search('Storgata 31B');

		const [call] = http.callsTo(PDL_GRAPHQL_URL, 'POST');
		expect(call?.headers.get('authorization')).toBe('Bearer texas-token');
		const [body] = sentToPdl();
		expect(body?.query).toContain('sokAdresse(paging: $paging, criteria: $criteria)');
		expect(body?.variables).toEqual({
			paging: { pageNumber: 1, resultsPerPage: 30 },
			criteria: [fritekst('Storgata'), husnummer('31'), fritekst('B')],
		});
	});

	test('answers an empty list when PDL finds nothing', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlAdresseAnswer([]) });

		const res = await search('Finnesikkeveien');

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ totalHits: 0, adresser: [] });
	});

	test('passes a hit without vegadresse on as null (bug)', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlAdresseAnswer([vegadresse(), null]) });

		const res = await search('Storgata');

		expect(await res.json()).toEqual({ totalHits: 2, adresser: [vegadresse(), null] });
	});

	test.each([
		['a single word', 'Storgata', [fritekst('Storgata')]],
		['a house number', 'Storgata 1', [fritekst('Storgata'), husnummer('1')]],
		['a house number with a letter', 'Storgata 31B', [fritekst('Storgata'), husnummer('31'), fritekst('B')]],
		['a lower-case letter', 'storgata 31b', [fritekst('storgata'), husnummer('31'), fritekst('b')]],
		['a number of four digits as text', 'Storgata 1000', [fritekst('Storgata'), fritekst('1000')]],
		['a postnummer first', '0184 Storgata', [fritekst('0184'), fritekst('Storgata')]],
		['extra whitespace', '  Storgata \t 1  ', [fritekst('Storgata'), husnummer('1')]],
		[
			'dots and hyphens',
			'Ole B. Bergers vei-2',
			[fritekst('Ole'), fritekst('B.'), fritekst('Bergers'), fritekst('vei-2')],
		],
		[
			'letters outside a-z',
			'Bjørnstjerne Bjørnsons gate',
			[fritekst('Bjørnstjerne'), fritekst('Bjørnsons'), fritekst('gate')],
		],
		['other characters, deleted', 'Storgata #1!', [fritekst('Storgata'), husnummer('1')]],
		[
			'a comma after the house number, kept in the number (bug)',
			'Storgata 1, Oslo',
			[fritekst('Storgata'), fritekst('1,'), fritekst('Oslo')],
		],
		['a comma after a letter, not split (bug)', 'Storgata 31B,', [fritekst('Storgata'), fritekst('31B,')]],
		['a slash between numbers, joining them (bug)', 'Storgata 1/3', [fritekst('Storgata'), husnummer('13')]],
		['only a comma, sent on (bug)', ',', [fritekst(',')]],
	])('sends criteria for %s', async (_, queryString, criteria) => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlAdresseAnswer([]) });

		expect((await search(queryString)).status).toBe(200);

		expect(sentToPdl()[0]?.variables).toMatchObject({ criteria });
	});

	test.each([
		['without queryString', '/adresse', 'Query string is required and must be a non-empty string'],
		['with an empty queryString', '/adresse?queryString=', 'Query string is required and must be a non-empty string'],
		['with only whitespace', '/adresse?queryString=%20%20', 'Query string is required and must be a non-empty string'],
		[
			'with a repeated queryString',
			'/adresse?queryString=Storgata&queryString=1',
			'Query string is required and must be a non-empty string',
		],
		['with only characters that are not allowed', '/adresse?queryString=!%23%24', 'Query string is empty or invalid'],
		[
			'with more than 150 characters',
			`/adresse?queryString=${'a'.repeat(151)}`,
			'Query string exceeds maximum length of 150 characters',
		],
	])('answers 400 %s, without asking PDL', async (_, path, error) => {
		const app = await startApp();

		await expectRejected(await app.get(path), error, http.calls);
	});

	test('accepts 150 characters', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, { json: pdlAdresseAnswer([]) });

		expect((await search('a'.repeat(150))).status).toBe(200);
	});

	test.each(pdlFailures)('answers 502 when PDL %s', async (_, reply) => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, reply);

		const res = await search('Storgata 31B');

		await expectPdlFailed(res);
	});

	test('counts lookups by result', async () => {
		http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
		http.post(PDL_GRAPHQL_URL, [
			{ json: pdlAdresseAnswer([vegadresse()]) },
			{ json: pdlAdresseAnswer([]) },
			{ status: 503, json: pdlErrorAnswer('server_error') },
		]);
		const app = await startApp();

		await app.get('/adresse?queryString=Storgata');
		await app.get('/adresse?queryString=Finnesikkeveien');
		await app.get('/adresse?queryString=Storgata');
		await app.get('/adresse');
		await app.get('/adresse?queryString=!');

		await expectLookups(app, 'adresse', [1, 1, 1, 2]);
	});
});
