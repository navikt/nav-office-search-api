import { networkError } from '@itsy/corgi/testing';
import { describe, expect, test } from 'vitest';
import { startApp, type TestApp } from '../test/app.ts';
import { installMockFetch } from '../test/fetch.ts';
import { navkontor, norgEnhet, norgEnhetUrl, norgNavkontorerUrl } from '../test/fixtures.ts';

const http = installMockFetch();

const grunerlokka = norgEnhet({ enhetId: 1, enhetNr: '0315', navn: 'Nav Grünerløkka' });
const sagene = norgEnhet({ enhetId: 2, enhetNr: '0314', navn: 'Nav Sagene' });

const officeFor = async (app: TestApp, geoId: string) => {
	const res = await app.get(`/geoid?id=${geoId}`);
	return res.status === 200 ? ((await res.json()) as { enhetNr: string }).enhetNr : res.status;
};

const refreshes = async (app: TestApp) => ({
	success: await app.metric('nav_office_search_api_norg_refresh_total', { result: 'success' }),
	failure: await app.metric('nav_office_search_api_norg_refresh_total', { result: 'failure' }),
	geoIdsLoaded: await app.metric('nav_office_search_api_norg_geoids_loaded'),
	failedOffices: await app.metric('nav_office_search_api_norg_refresh_failed_offices'),
});

describe('loading offices from NORG', () => {
	test('maps every area of each active local office to that office', async () => {
		const fylkeskontor = norgEnhet({ enhetId: 3, enhetNr: '0200', navn: 'Nav Øst-Viken', type: 'FYLKE' });
		http.get(norgEnhetUrl, { json: [grunerlokka, sagene, fylkeskontor] });
		http.get(norgNavkontorerUrl('0315'), { json: [navkontor('030102', 1)] });
		http.get(norgNavkontorerUrl('0314'), { json: [navkontor('030103', 2), navkontor('030104', 2)] });
		const app = await startApp();

		expect(await app.loadOffices()).toBe(true);

		expect(http.callsTo(norgEnhetUrl)[0]?.query.get('enhetStatusListe')).toBe('AKTIV');
		expect(http.calls.map((call) => call.pathname)).not.toContain('/norg2/api/v1/enhet/navkontorer/0200');
		expect(await officeFor(app, '030102')).toBe('0315');
		expect(await officeFor(app, '030103')).toBe('0314');
		expect(await officeFor(app, '030104')).toBe('0314');
		expect(await refreshes(app)).toEqual({ success: 1, failure: 0, geoIdsLoaded: 3, failedOffices: 0 });
		expect(await app.metric('nav_office_search_api_norg_last_success_timestamp_seconds')).toBeGreaterThan(0);
	});

	test('a refresh replaces the map: an area that moved answers its new office', async () => {
		http.get(norgEnhetUrl, { json: [grunerlokka, sagene] });
		http.get(norgNavkontorerUrl('0315'), [{ json: [navkontor('030102', 1)] }, { json: [] }]);
		http.get(norgNavkontorerUrl('0314'), [{ json: [] }, { json: [navkontor('030102', 2)] }]);
		const app = await startApp();

		await app.loadOffices();
		expect(await officeFor(app, '030102')).toBe('0315');

		expect(await app.loadOffices()).toBe(true);
		expect(await officeFor(app, '030102')).toBe('0314');
	});

	test.each([
		['answers an error', { status: 503, json: { message: 'Service Unavailable' } }],
		['is unreachable', networkError()],
	])('fails when the office list %s', async (_, reply) => {
		http.get(norgEnhetUrl, reply);
		const app = await startApp();

		expect(await app.loadOffices()).toBe(false);

		expect(await officeFor(app, '030102')).toBe(404);
		expect(await refreshes(app)).toEqual({ success: 0, failure: 1, geoIdsLoaded: 0, failedOffices: 0 });
	});

	test('a refresh whose office list fails keeps the offices it had', async () => {
		http.get(norgEnhetUrl, [{ json: [grunerlokka] }, { status: 503, json: { message: 'Service Unavailable' } }]);
		http.get(norgNavkontorerUrl('0315'), { json: [navkontor('030102', 1)] });
		const app = await startApp();
		await app.loadOffices();

		expect(await app.loadOffices()).toBe(false);

		expect(await officeFor(app, '030102')).toBe('0315');
		expect(await refreshes(app)).toEqual({ success: 1, failure: 1, geoIdsLoaded: 1, failedOffices: 0 });
	});

	test("a refresh where one office's areas fail keeps that office's previous areas", async () => {
		http.get(norgEnhetUrl, { json: [grunerlokka, sagene] });
		http.get(norgNavkontorerUrl('0315'), [
			{ json: [navkontor('030102', 1)] },
			{ status: 503, json: { message: 'Service Unavailable' } },
		]);
		http.get(norgNavkontorerUrl('0314'), [{ json: [navkontor('030103', 2)] }, { json: [navkontor('030104', 2)] }]);
		const app = await startApp();
		await app.loadOffices();

		expect(await app.loadOffices()).toBe(true);

		expect(await officeFor(app, '030102')).toBe('0315');
		expect(await officeFor(app, '030103')).toBe(404);
		expect(await officeFor(app, '030104')).toBe('0314');
		expect(await refreshes(app)).toEqual({ success: 2, failure: 0, geoIdsLoaded: 2, failedOffices: 1 });
	});

	test("a first load where one office's areas fail succeeds without that office (bug)", async () => {
		http.get(norgEnhetUrl, { json: [grunerlokka, sagene] });
		http.get(norgNavkontorerUrl('0315'), { status: 503, json: { message: 'Service Unavailable' } });
		http.get(norgNavkontorerUrl('0314'), { json: [navkontor('030103', 2)] });
		const app = await startApp();

		expect(await app.loadOffices()).toBe(true);

		expect(await officeFor(app, '030102')).toBe(404);
		expect(await officeFor(app, '030103')).toBe('0314');
		expect(await refreshes(app)).toEqual({ success: 1, failure: 0, geoIdsLoaded: 1, failedOffices: 1 });
	});

	test.each([
		['no offices', []],
		['no local offices', [norgEnhet({ enhetNr: '0200', type: 'FYLKE' })]],
	])('a refresh with %s succeeds and empties the map (bug)', async (_, offices) => {
		http.get(norgEnhetUrl, [{ json: [grunerlokka] }, { json: offices }]);
		http.get(norgNavkontorerUrl('0315'), { json: [navkontor('030102', 1)] });
		const app = await startApp();
		await app.loadOffices();

		expect(await app.loadOffices()).toBe(true);

		expect(await officeFor(app, '030102')).toBe(404);
		expect(await refreshes(app)).toEqual({ success: 2, failure: 0, geoIdsLoaded: 0, failedOffices: 0 });
	});
});
