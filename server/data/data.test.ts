import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '@navikt/navno-logger';
import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { startApp } from '#test/app.ts';
import { installMockFetch } from '#test/fetch.ts';
import { DATA_FILES_DIR, norgEnhetUrl, xpOfficeInfoUrl } from '#test/fixtures.ts';
import {
	answerSnapshot,
	enhetNrOf,
	isNavkontorerRequest,
	norgEnheter,
	norgNavkontorer,
	xpOffices,
} from '#test/snapshot.ts';

const http = installMockFetch();

afterEach(() => {
	vi.useRealTimers();
});

// A server that has loaded nothing yet, with NORG and XP answering from the snapshot, and its metrics as Prometheus
// reads them
const fresh = async () => {
	answerSnapshot(http);
	const app = await startApp();
	const data = await import('#server/data/data.ts');
	const sizes = () => {
		const { offices, bydeler, kommuner, poststeder } = data.referenceData();
		return { offices: offices.size, bydeler: bydeler.length, kommuner: kommuner.length, poststeder: poststeder.size };
	};
	const loads = async () => ({
		success: await app.metric('nav_office_search_api_data_loads_total', { outcome: 'success' }),
		failure: await app.metric('nav_office_search_api_data_loads_total', { outcome: 'failure' }),
	});

	return { ...data, app, sizes, loads };
};

// What the snapshot holds
const LOADED = { offices: 389, bydeler: 37, kommuner: 357, poststeder: 5136 };

// A directory with the snapshot's two files, where the register has only its first rows
const filesWithShortRegister = async (rows: number) => {
	const dir = await mkdtemp(join(tmpdir(), 'data-'));
	onTestFinished(() => rm(dir, { recursive: true, force: true }));

	const register = JSON.parse(await readFile(join(DATA_FILES_DIR, 'postnrRegister.json'), 'utf8'));
	await writeFile(
		join(dir, 'postnrRegister.json'),
		JSON.stringify({ ...register, rows: register.rows.slice(0, rows) })
	);
	await writeFile(join(dir, 'bydeler.json'), await readFile(join(DATA_FILES_DIR, 'bydeler.json')));
	return dir;
};

const emptyDir = async () => {
	const dir = await mkdtemp(join(tmpdir(), 'data-'));
	onTestFinished(() => rm(dir, { recursive: true, force: true }));
	return dir;
};

test('has no data before the first load', async () => {
	const { referenceData } = await fresh();

	expect(() => referenceData()).toThrow('The reference data is not loaded');
});

describe('a first load', () => {
	test('of what the snapshot has logs no errors, and one warning per dataset with areas without an office', async () => {
		const warn = vi.spyOn(logger, 'warn');
		const error = vi.spyOn(logger, 'error');
		const { loadData, sizes, loads } = await fresh();

		await loadData();

		expect(sizes()).toEqual(LOADED);
		expect(error.mock.calls).toEqual([]);
		expect(warn.mock.calls).toEqual([
			['No office found', { dataset: 'kommuner', count: 1, numbers: [expect.any(String)] }],
			['No office found', { dataset: 'poststeder', count: 2, numbers: [expect.any(String), expect.any(String)] }],
			['No office found', { dataset: 'bydeler', count: 1, numbers: [expect.any(String)] }],
		]);
		expect(await loads()).toEqual({ success: 1, failure: 0 });
	});

	test('says what it loaded, how long it took and when the build fetched the files', async () => {
		const info = vi.spyOn(logger, 'info');
		const { loadData } = await fresh();

		await loadData();

		expect(info.mock.calls).toEqual([
			['Started loading data'],
			[
				'Finished loading data',
				{
					durationSeconds: expect.any(Number),
					office_urls: 425,
					offices: 389,
					bydeler: 37,
					postnr_register: 5136,
					kommuner: 357,
					poststeder: 5136,
					filesFetchedAt: '2026-11-17T04:17:00.000Z',
				},
			],
		]);
	});

	test('records the size of each dataset, how many areas have no office, and when it succeeded', async () => {
		const { loadData, app } = await fresh();
		const entries = (dataset: string) => app.metric('nav_office_search_api_reference_data_entries', { dataset });
		const withoutOffice = (dataset: string) =>
			app.metric('nav_office_search_api_reference_data_without_office', { dataset });

		await loadData();

		expect(await entries('office_urls')).toBe(425);
		expect(await entries('offices')).toBe(389);
		expect(await entries('bydeler')).toBe(37);
		expect(await entries('postnr_register')).toBe(5136);
		expect(await entries('kommuner')).toBe(357);
		expect(await entries('poststeder')).toBe(5136);
		expect(await withoutOffice('kommuner')).toBe(1);
		expect(await withoutOffice('poststeder')).toBe(2);
		expect(await withoutOffice('bydeler')).toBe(1);
		expect(await app.metric('nav_office_search_api_data_last_success_timestamp_seconds')).toBeCloseTo(
			Date.now() / 1000,
			-1
		);
		expect(await app.metric('nav_office_search_api_data_load_duration_seconds')).toBeGreaterThan(0);
	});

	test('asks XP once, and NORG for its units and for the areas of each local office', async () => {
		const { loadData, app } = await fresh();
		const requests = (upstream: string) =>
			app.metric('nav_office_search_api_upstream_requests_total', { upstream, status: '2xx' });

		await loadData();

		expect(await requests('xp')).toBe(1);
		expect(await requests('norg')).toBe(284);
	});

	test.each([
		['XP fails', xpOfficeInfoUrl, 'office URLs from XP'],
		['NORG fails', norgEnhetUrl, 'offices from NORG'],
	])('fails when %s, and says which source', async (_, url, source) => {
		const { loadData, referenceData, loads } = await fresh();
		http.get(url, { status: 503 });

		await expect(loadData()).rejects.toMatchObject({
			message: `Failed to load ${source}`,
			cause: expect.objectContaining({ status: 503 }),
		});
		expect(() => referenceData()).toThrow('The reference data is not loaded');
		expect(await loads()).toEqual({ success: 0, failure: 1 });
	});

	test("fails when the build's files aren't there, as in an image built without them", async () => {
		vi.stubEnv('DATA_FILES_DIR', await emptyDir());
		const { loadData, referenceData } = await fresh();

		await expect(loadData()).rejects.toMatchObject({
			message: 'Failed to load the files the build downloaded',
			cause: expect.objectContaining({ code: 'ENOENT' }),
		});
		expect(() => referenceData()).toThrow('The reference data is not loaded');
	});

	test.each([
		['XP has no offices', () => http.get(xpOfficeInfoUrl, { json: { offices: [] } }), 'offices', 200],
		['NORG has no offices', () => http.get(norgEnhetUrl, { json: [] }), 'offices', 200],
	] as const)('fails when %s, with the size and the floor', async (_, answer, dataset, floor) => {
		const { loadData, referenceData, loads } = await fresh();
		answer();

		await expect(loadData()).rejects.toMatchObject({
			message: `Too little reference data: ${dataset}`,
			dataset,
			size: 0,
			floor,
		});
		expect(() => referenceData()).toThrow('The reference data is not loaded');
		expect(await loads()).toEqual({ success: 0, failure: 1 });
	});

	test('fails when the register is too short to be the whole of it', async () => {
		vi.stubEnv('DATA_FILES_DIR', await filesWithShortRegister(2499));
		const { loadData } = await fresh();

		await expect(loadData()).rejects.toMatchObject({
			message: 'Too little reference data: poststeder',
			size: 2499,
			floor: 2500,
		});
	});

	test('leaves the areas of an office without a page on nav.no without an office, and logs the office', async () => {
		const error = vi.spyOn(logger, 'error');
		const { loadData, referenceData } = await fresh();
		// Nav Gamle Oslo, the office of bydel 030101
		http.get(xpOfficeInfoUrl, { json: { offices: xpOffices.offices.filter(({ enhetNr }) => enhetNr !== '0316') } });

		await loadData();

		expect(referenceData().offices.has('030101')).toBe(false);
		expect(error.mock.calls).toEqual([['Offices without a page in XP', { count: 1, enhetNr: ['0316'] }]]);
	});
});

describe('a refresh', () => {
	const loaded = async () => {
		const server = await fresh();
		await server.loadData();
		return server;
	};

	test('that fails keeps the data in use, and leaves the time of the last success', async () => {
		const { loadData, referenceData, loads, app } = await loaded();
		const lastSuccess = () => app.metric('nav_office_search_api_data_last_success_timestamp_seconds');
		const inUse = referenceData();
		const succeededAt = await lastSuccess();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(Date.now() + 86_400_000);
		http.get(xpOfficeInfoUrl, { status: 503 });

		await expect(loadData()).rejects.toThrow('Failed to load office URLs from XP');

		expect(referenceData()).toBe(inUse);
		expect(await loads()).toEqual({ success: 1, failure: 1 });
		expect(await lastSuccess()).toBe(succeededAt);
	});

	test('that gets too little keeps the data in use', async () => {
		const { loadData, referenceData, sizes } = await loaded();
		const inUse = referenceData();
		http.get(xpOfficeInfoUrl, { json: { offices: [] } });

		await expect(loadData()).rejects.toThrow('Too little reference data: offices');

		expect(referenceData()).toBe(inUse);
		expect(sizes()).toEqual(LOADED);
	});

	// However many fewer than in use: a refresh is checked against the floors only, like a first load
	test('takes fewer offices, and the kommuner without them, as when kommuner merge', async () => {
		const { loadData, sizes, loads } = await loaded();
		const kommunenumre = Object.values(norgNavkontorer)
			.flat()
			.map(({ geografiskOmraade }) => geografiskOmraade)
			// Svalbard's office also serves Jan Mayen, so it stays: each kommunenr gone takes one kommune away
			.filter((geoId) => geoId.length === 4 && geoId !== '2100')
			.sort();
		const gone = new Set(kommunenumre.slice(0, 40));
		http.get(isNavkontorerRequest, (call) => ({
			json: (norgNavkontorer[enhetNrOf(call)] ?? []).filter(({ geografiskOmraade }) => !gone.has(geografiskOmraade)),
		}));

		await loadData();

		expect(sizes()).toEqual({ ...LOADED, offices: 349, kommuner: 317 });
		expect(await loads()).toEqual({ success: 2, failure: 0 });
	});

	test('takes what NORG has now for an office that had areas and has none any more', async () => {
		const { loadData, referenceData } = await loaded();
		expect(referenceData().offices.has('030101')).toBe(true);
		const gamleOslo = norgEnheter.find(({ navn }) => navn === 'Nav Gamle Oslo')?.enhetNr ?? '';
		http.get(isNavkontorerRequest, (call) =>
			enhetNrOf(call) === gamleOslo ? { status: 404 } : { json: norgNavkontorer[enhetNrOf(call)] ?? [] }
		);

		await loadData();

		expect(referenceData().offices.has('030101')).toBe(false);
	});
});

describe('refreshData, as the server runs it at start and every morning', () => {
	test('loads the data', async () => {
		const { refreshData, sizes } = await fresh();

		await refreshData();

		expect(sizes()).toEqual(LOADED);
	});

	test("logs a load that fails, and doesn't reject", async () => {
		const error = vi.spyOn(logger, 'error');
		const { refreshData, referenceData } = await fresh();
		http.get(norgEnhetUrl, { status: 503 });

		await expect(refreshData()).resolves.toBeUndefined();

		expect(error.mock.calls).toEqual([
			['Loading data failed', expect.objectContaining({ message: 'Failed to load offices from NORG' })],
		]);
		expect(() => referenceData()).toThrow('The reference data is not loaded');
	});

	const askedXp = () => http.callsTo(xpOfficeInfoUrl).length;

	test('tries a first load that fails again every minute, until one succeeds', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { refreshData, referenceData, sizes } = await fresh();
		http.get(xpOfficeInfoUrl, [{ status: 503 }, { status: 503 }, { json: xpOffices }]);

		await refreshData();
		await vi.advanceTimersByTimeAsync(59_999);
		expect(askedXp()).toBe(1);

		await vi.advanceTimersByTimeAsync(1);
		await vi.waitFor(() => expect(askedXp()).toBe(2));
		expect(() => referenceData()).toThrow('The reference data is not loaded');

		await vi.advanceTimersByTimeAsync(60_000);
		await vi.waitFor(() => expect(sizes()).toEqual(LOADED));
		expect(askedXp()).toBe(3);

		// And then not again
		await vi.advanceTimersByTimeAsync(600_000);
		expect(askedXp()).toBe(3);
	});

	test('makes one retry a minute, also when the morning load fails beside it', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { refreshData } = await fresh();
		http.get(xpOfficeInfoUrl, { status: 503 });

		await refreshData();
		await refreshData();
		expect(askedXp()).toBe(2);

		await vi.advanceTimersByTimeAsync(60_000);
		await vi.waitFor(() => expect(askedXp()).toBe(3));
		await vi.advanceTimersByTimeAsync(59_000);
		expect(askedXp()).toBe(3);
	});

	test('leaves a refresh that fails until the next morning, since the data in use stays', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { refreshData, sizes } = await fresh();
		await refreshData();
		http.get(xpOfficeInfoUrl, { status: 503 });

		await refreshData();
		await vi.advanceTimersByTimeAsync(600_000);

		expect(askedXp()).toBe(2);
		expect(sizes()).toEqual(LOADED);
	});
});
