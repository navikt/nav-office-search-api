import { logger } from '@navikt/navno-logger';
import { describe, expect, test, vi } from 'vitest';
import { startApp, type TestApp } from '#test/app.ts';
import { installMockFetch } from '#test/fetch.ts';
import {
	NAIS_TOKEN_ENDPOINT,
	PDL_GRAPHQL_URL,
	pdlAdresseAnswer,
	pdlBydelAnswer,
	pdlErrorAnswer,
	texasToken,
	vegadresse,
} from '#test/fixtures.ts';
import { expectLookups, pdlFailures } from '#test/pdl.ts';
import { answerSnapshot } from '#test/snapshot.ts';
import type { SearchResultProps } from './results.ts';

const http = installMockFetch();

// Where the offices' pages are in these tests: the name-search goldens were recorded with it
const NAVNO = 'https://www.nav.no';

// A server with the snapshot loaded, as a pod has it once its first load is done. What it asked NORG and XP is
// forgotten, so a test sees only what a search asks.
const startLoaded = async () => {
	vi.stubEnv('NAVNO_ORIGIN', NAVNO);
	answerSnapshot(http);
	const app = await startApp();
	await (await import('#server/data/data.ts')).loadData();
	http.resetCalls();
	return app;
};

type Reply = Parameters<typeof http.post>[1];

const pdlAnswers = (reply: Reply) => {
	http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });
	http.post(PDL_GRAPHQL_URL, reply);
};

const searchOn = async (app: TestApp, query: string) => {
	const res = await app.get(`/search?query=${encodeURIComponent(query)}`);
	return { status: res.status, type: res.headers.get('content-type'), body: (await res.json()) as SearchResultProps };
};

const search = async (query: string) => searchOn(await startLoaded(), query);

const officeNames = (body: SearchResultProps) =>
	body.type === 'postnr' ? body.officeInfo.map(({ name }) => name) : [];

const error = (messageId: string) => ({ type: 'error', messageId });

const office = (name: string, path: string, geoId: string, enhetNr: string) => ({
	name,
	url: `${NAVNO}${path}`,
	geoId,
	enhetNr,
	hitString: '',
});

const jsonLines = (values: unknown[]) => values.map((value) => JSON.stringify(value)).join('\n') + '\n';

describe('a postnummer', () => {
	test('is answered from the loaded data, without asking PDL', async () => {
		const app = await startLoaded();

		const answer = await searchOn(app, '4737');

		expect(answer).toEqual({
			status: 200,
			type: 'application/json',
			body: {
				type: 'postnr',
				postnr: '4737',
				poststed: 'HORNNES',
				poststedNormalized: 'hornnes',
				kommuneNavn: 'EVJE OG HORNNES',
				kommunenr: '4219',
				kategori: 'G',
				officeInfo: [office('Nav Evje og Hornnes', '/kontor/nav-evje-og-hornnes', '4219', '0937')],
			},
		});
		expect(http.calls).toEqual([]);
		expect(await searchOn(app, ' 4737 ')).toEqual(answer);
	});

	test.each(['9170', '8099'])('%s, on Svalbard and Jan Mayen, finds Nav Tromsø', async (postnr) => {
		expect(officeNames((await search(postnr)).body)).toEqual(['Nav Tromsø']);
	});

	test('in a kommune with bydeler gets the offices of the bydeler PDL has addresses in for it, by name', async () => {
		pdlAnswers({ json: pdlBydelAnswer(['030105', '030104']) });

		const { status, body } = await search('0354');

		expect(status).toBe(200);
		expect(officeNames(body)).toEqual(['Nav Frogner', 'Nav St. Hanshaugen']);
		const [asked, ...more] = http.callsTo(PDL_GRAPHQL_URL);
		expect(more).toEqual([]);
		expect(asked?.json()).toMatchObject({
			variables: { criteria: [{ fieldName: 'vegadresse.postnummer', searchRule: { equals: '0354' } }] },
		});
	});

	test('gets an office once, also when two of its bydeler have it', async () => {
		pdlAnswers({ json: pdlBydelAnswer(['030105', '030105', '030104']) });

		expect(officeNames((await search('0354')).body)).toEqual(['Nav Frogner', 'Nav St. Hanshaugen']);
	});

	test('is asked about in PDL when its kommune has no office, and answered without offices', async () => {
		// 3560 is in Hemsedal (3042), which has no office in the snapshot
		pdlAnswers({ json: pdlBydelAnswer([]) });

		const { status, body } = await search('3560');

		expect([status, officeNames(body)]).toEqual([200, []]);
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(1);
	});

	test('leaves out a bydel NORG has no office for', async () => {
		pdlAnswers({ json: pdlBydelAnswer(['030104', '030199']) });

		const { status, body } = await search('0354');

		expect([status, officeNames(body)]).toEqual([200, ['Nav St. Hanshaugen']]);
	});

	test.each(pdlFailures)('answers 502 when PDL %s, not a postnummer without offices', async (_, reply) => {
		pdlAnswers(reply);

		expect(await search('0150')).toEqual({
			status: 502,
			type: 'application/json',
			body: error('errorServerError'),
		});
	});

	test('answers 404 when it is unknown', async () => {
		expect(await search('0000')).toEqual({
			status: 404,
			type: 'application/json',
			body: error('errorInvalidPostnr'),
		});
		expect(http.calls).toEqual([]);
	});
});

describe('a name', () => {
	// Golden file name → query. The files are nav-office-search's, recorded from its /api/search/name.
	test.each([
		['oslo', 'oslo'],
		['nav-oslo', 'nav oslo'],
		['frogner', 'frogner'],
		['tromso', 'Tromsø'],
		['aas', 'ås'],
		['st-hanshaugen', 'st. hanshaugen'],
		['a', 'a'],
		// Found by the office's own name, Nav Unjárga: the register spells the kommune UNJARGGA
		['unjarga', 'unjarga'],
	])('%s finds what nav-office-search finds', async (golden, query) => {
		const { status, body } = await search(query);

		expect(status).toBe(200);
		expect(body).toMatchObject({ type: 'name', input: query });
		await expect(jsonLines(body.type === 'name' ? body.hits : [])).toMatchFileSnapshot(
			`../../test/fixtures/name-search/${golden}.jsonl`
		);
		expect(http.calls).toEqual([]);
	});

	test.each([
		['unjarga', 'Nav Unjárga/Nesseby'],
		['Unjárga', 'Nav Unjárga/Nesseby'],
		['nav unjarga', 'Nav Unjárga/Nesseby'],
	])('finds an office by its own name, with or without its accents: %j', async (query, name) => {
		const { body } = await search(query);

		const offices =
			body.type === 'name' ? body.hits.flatMap(({ officeHits }) => officeHits.map((hit) => hit.name)) : [];
		expect(offices).toContain(name);
	});

	test('groups the offices under the names that match', async () => {
		const { status, body } = await search('frogner');

		expect(status).toBe(200);
		expect(body).toMatchObject({
			type: 'name',
			input: 'frogner',
			hits: [
				{ name: 'Frogner', officeHits: [{ name: 'Nav Frogner', hitString: 'Frogner' }] },
				{ name: 'FROGNER', officeHits: [{ name: 'Nav Lillestrøm', hitString: 'FROGNER' }] },
			],
		});
	});

	test('ignores a "nav " prefix, but keeps the input as written', async () => {
		const app = await startLoaded();

		const withPrefix = await searchOn(app, 'nav oslo');
		const withoutPrefix = await searchOn(app, 'oslo');

		expect(withPrefix.body).toEqual({ ...withoutPrefix.body, input: 'nav oslo' });
	});
});

describe('an address', () => {
	test('is what no name matches: PDL is asked, and each address gets the office of its bydel or kommune', async () => {
		const inFrogner = vegadresse({ bydelsnummer: '030105' });
		const inEvje = vegadresse({ adressenavn: 'Storgata', kommunenummer: '4219', bydelsnummer: null });
		pdlAnswers({ json: pdlAdresseAnswer([inFrogner, inEvje], 412) });

		expect(await search('storgata 1')).toEqual({
			status: 200,
			type: 'application/json',
			body: {
				type: 'adresse',
				adresseQuery: 'storgata 1',
				adresser: [
					{ ...inFrogner, officeInfo: office('Nav Frogner', '/kontor/nav-frogner', '030105', '0312') },
					{
						...inEvje,
						officeInfo: office('Nav Evje og Hornnes', '/kontor/nav-evje-og-hornnes', '4219', '0937'),
					},
				],
				totalHits: 412,
			},
		});
		expect(http.callsTo(PDL_GRAPHQL_URL)).toHaveLength(1);
	});

	test.each([
		['in a bydel without an office, whatever its kommune has', { kommunenummer: '4219', bydelsnummer: '030199' }],
		['in a kommune without an office', { kommunenummer: '3042', bydelsnummer: null }],
		['on Jan Mayen, which NORG has no office for', { kommunenummer: '2211', bydelsnummer: null }],
		['with neither number', { kommunenummer: null, bydelsnummer: null }],
	])('gets no office when it is %s', async (_, numbers) => {
		pdlAnswers({ json: pdlAdresseAnswer([vegadresse(numbers)]) });

		const { status, body } = await search('storgata 1');

		expect(status).toBe(200);
		expect(body).toMatchObject({ type: 'adresse', adresser: [{ ...numbers, officeInfo: null }] });
	});

	test('is answered with an empty list when PDL finds nothing', async () => {
		pdlAnswers({ json: pdlAdresseAnswer([]) });

		expect((await search('ukjent adresse 1')).body).toEqual({
			type: 'adresse',
			adresseQuery: 'ukjent adresse 1',
			adresser: [],
			totalHits: 0,
		});
	});

	test.each(pdlFailures)('answers 502 when PDL %s', async (_, reply) => {
		pdlAnswers(reply);

		expect(await search('storgata 1')).toEqual({
			status: 502,
			type: 'application/json',
			body: error('errorServerError'),
		});
	});

	test('answers 400 when nothing of it can be searched for, without asking PDL', async () => {
		expect(await search('#!?')).toEqual({ status: 400, type: 'application/json', body: error('errorInvalidQuery') });
		expect(http.calls).toEqual([]);
	});

	test('is not logged when PDL fails', async () => {
		const logs = (['info', 'warn', 'error'] as const).map((level) => vi.spyOn(logger, level));
		pdlAnswers({ status: 503, json: pdlErrorAnswer('server_error', 'No hits for kirkeveien 99') });

		await search('kirkeveien 99');

		expect(JSON.stringify(logs.flatMap((log) => log.mock.calls))).not.toMatch(/kirkeveien/i);
	});
});

describe('GET /search', () => {
	test.each([
		['without a query', '/search'],
		['with an empty query', '/search?query='],
		['with a blank query', '/search?query=%20'],
		['with the query twice', '/search?query=4737&query=0150'],
	])('answers 400 %s', async (_, path) => {
		const app = await startLoaded();

		const res = await app.get(path);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual(error('errorMissingQuery'));
		expect(http.calls).toEqual([]);
	});

	test('accepts a trailing slash', async () => {
		const app = await startLoaded();

		expect((await app.get('/search/?query=4737')).status).toBe(200);
	});

	test('counts searches by result: hits, empty, error and invalid', async () => {
		const app = await startLoaded();
		pdlAnswers([{ json: pdlBydelAnswer([]) }, { json: pdlAdresseAnswer([]) }, { status: 503 }]);

		await searchOn(app, '4737');
		await searchOn(app, 'oslo');
		await searchOn(app, '3560');
		await searchOn(app, 'ukjent adresse 1');
		await searchOn(app, 'storgata 1');
		await searchOn(app, '0000');
		await app.get('/search');

		await expectLookups(app, 'search', [2, 2, 1, 2]);
	});

	test('answers 500 before the reference data is loaded, and says why in the log', async () => {
		const logged = vi.spyOn(logger, 'error');
		const unloaded = await startApp();

		expect(await searchOn(unloaded, '4737')).toEqual({
			status: 500,
			type: 'application/json',
			body: error('errorServerError'),
		});
		expect(logged.mock.calls).toEqual([
			['Search failed', expect.objectContaining({ message: 'The reference data is not loaded' })],
		]);
	});
});
