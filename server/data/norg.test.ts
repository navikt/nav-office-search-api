import { isHttpError, isTimeoutError } from '@itsy/corgi';
import { isValidationError } from '@itsy/corgi/schema';
import { networkError } from '@itsy/corgi/testing';
import { logger } from '@navikt/navno-logger';
import { afterEach, expect, test, vi } from 'vitest';
import { installMockFetch } from '#test/fetch.ts';
import { navkontor, norgEnhet, norgEnhetUrl, norgNavkontorerUrl } from '#test/fixtures.ts';
import { answerSnapshot, isNavkontorerRequest } from '#test/snapshot.ts';
import { fetchNorgOffices } from './norg.ts';

const http = installMockFetch();

afterEach(() => {
	vi.useRealTimers();
});

const frogner = norgEnhet({ enhetNr: '0312', navn: 'Nav Frogner' });
const sagene = norgEnhet({ enhetNr: '0314', navn: 'Nav Sagene' });

test('gives the office of each area, from the active local offices and the areas each serves', async () => {
	answerSnapshot(http);

	const offices = await fetchNorgOffices();

	expect(offices.size).toBe(389);
	expect(offices.get('030101')).toEqual({ enhetNr: '0316', navn: 'Nav Gamle Oslo' });
	expect(offices.get('2100')).toEqual({ enhetNr: '1902', navn: 'Nav Tromsø' });
	// One request for the units, and one for each of the 283 that are local offices. The other five aren't asked about.
	const [units, ...areas] = http.calls.map(({ url }) => url);
	expect(units).toBe(`${norgEnhetUrl}?enhetStatusListe=AKTIV`);
	expect(areas).toHaveLength(283);
	expect(areas).toContain(norgNavkontorerUrl('0316'));
});

test.each(['2211', '', 'constructor', '__proto__'])('finds no office for %j', async (geoId) => {
	answerSnapshot(http);

	expect((await fetchNorgOffices()).get(geoId)).toBeUndefined();
});

test('leaves out a unit that is not a local office', async () => {
	http.get(norgEnhetUrl, { json: [frogner, norgEnhet({ enhetNr: '0387', navn: 'Nav Oslo', type: 'ALS' })] });
	http.get(norgNavkontorerUrl('0312'), { json: [navkontor('030105')] });

	expect([...(await fetchNorgOffices())]).toEqual([['030105', { enhetNr: '0312', navn: 'Nav Frogner' }]]);
});

test('asks about 8 offices at a time', async () => {
	let asking = 0;
	let most = 0;
	http.get(norgEnhetUrl, {
		json: Array.from({ length: 20 }, (_, i) => norgEnhet({ enhetNr: String(1000 + i) })),
	});
	http.get(isNavkontorerRequest, async () => {
		most = Math.max(most, ++asking);
		await new Promise((resolve) => setTimeout(resolve, 2));
		asking--;
		return { json: [] };
	});

	await fetchNorgOffices();

	expect(most).toBe(8);
	expect(http.calls).toHaveLength(21);
});

test('gives an area that two offices list to the last of them, in the order NORG lists the offices', async () => {
	http.get(norgEnhetUrl, { json: [sagene, frogner] });
	http.get(norgNavkontorerUrl('0314'), { json: [navkontor('030103'), navkontor('030105')], delay: 5 });
	http.get(norgNavkontorerUrl('0312'), { json: [navkontor('030105')] });

	const offices = await fetchNorgOffices();

	expect(offices.get('030105')).toEqual({ enhetNr: '0312', navn: 'Nav Frogner' });
	expect(offices.get('030103')).toEqual({ enhetNr: '0314', navn: 'Nav Sagene' });
});

test('takes a 404 for an office to mean it has no areas, and says which offices', async () => {
	const warn = vi.spyOn(logger, 'warn');
	http.get(norgEnhetUrl, { json: [frogner, sagene] });
	http.get(norgNavkontorerUrl('0312'), { json: [navkontor('030105')] });
	http.get(norgNavkontorerUrl('0314'), { status: 404, json: { message: 'Not found' } });

	const offices = await fetchNorgOffices();

	expect([...offices.keys()]).toEqual(['030105']);
	expect(warn.mock.calls).toEqual([['Offices without areas in NORG', { count: 1, enhetNr: ['0314'] }]]);
});

test('says nothing about an office NORG lists no areas for', async () => {
	const warn = vi.spyOn(logger, 'warn');
	http.get(norgEnhetUrl, { json: [frogner] });
	http.get(norgNavkontorerUrl('0312'), { json: [] });

	expect((await fetchNorgOffices()).size).toBe(0);
	expect(warn).not.toHaveBeenCalled();
});

test.each([
	['its units', norgEnhetUrl],
	["one office's areas", norgNavkontorerUrl('0314')],
])('throws when NORG fails to answer with %s', async (_, url) => {
	answerSnapshot(http);
	http.get(url, { status: 500, json: { message: 'Internal Server Error' } });

	await expect(fetchNorgOffices()).rejects.toSatisfy((e) => isHttpError(e) && e.status === 500);
});

test('throws when NORG is unreachable', async () => {
	http.get(norgEnhetUrl, networkError());

	await expect(fetchNorgOffices()).rejects.toThrow('fetch failed');
});

test.each([
	['units', norgEnhetUrl, [{ enhetNr: 312, navn: 'Nav Frogner', type: 'LOKAL' }]],
	['areas', norgNavkontorerUrl('0314'), { geografiskOmraade: '030103' }],
])("throws when the answer isn't %s", async (_, url, json) => {
	answerSnapshot(http);
	http.get(url, { json });

	await expect(fetchNorgOffices()).rejects.toSatisfy(isValidationError);
});

test('gives NORG 10 s to answer', async () => {
	vi.useFakeTimers();
	http.get(norgEnhetUrl, { hang: true });
	let settled = false;

	const failure = fetchNorgOffices()
		.catch((e: unknown) => e)
		.finally(() => {
			settled = true;
		});
	await vi.advanceTimersByTimeAsync(9_999);
	expect(settled).toBe(false);
	await vi.advanceTimersByTimeAsync(1);

	expect(isTimeoutError(await failure)).toBe(true);
});
