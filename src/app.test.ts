import { describe, expect, test, vi } from 'vitest';
import { startApp } from '../test/app.ts';
import { installMockFetch } from '../test/fetch.ts';
import { navkontor, norgEnhet, norgEnhetUrl, norgNavkontorerUrl } from '../test/fixtures.ts';

const http = installMockFetch();

describe('probes', () => {
	test('/internal/isAlive answers 200', async () => {
		const app = await startApp();

		const res = await app.get('/internal/isAlive');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(await res.text()).toBe('I am alive!');
	});

	test('/internal/isReady answers 503 until the app is ready, then 200', async () => {
		let ready = false;
		const app = await startApp({ isReady: () => ready });

		const notReady = await app.get('/internal/isReady');
		expect(notReady.status).toBe(503);
		expect(notReady.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(await notReady.text()).toBe('I am not ready...');

		ready = true;
		const isReady = await app.get('/internal/isReady');
		expect(isReady.status).toBe(200);
		expect(await isReady.text()).toBe('I am ready!');
	});
});

describe('/internal/metrics', () => {
	test('exposes every business metric, with the lookup and refresh series at 0 from the start', async () => {
		const app = await startApp();

		const res = await app.get('/internal/metrics');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
		const body = await res.text();
		for (const operation of ['geoid', 'adresse', 'bydel']) {
			for (const result of ['hits', 'empty', 'invalid', 'error']) {
				expect(body).toContain(`nav_office_search_api_lookups_total{operation="${operation}",result="${result}"} 0`);
			}
		}
		expect(body).toContain('nav_office_search_api_norg_refresh_total{result="success"} 0');
		expect(body).toContain('nav_office_search_api_norg_refresh_total{result="failure"} 0');
		expect(body).toContain('# TYPE nav_office_search_api_norg_last_success_timestamp_seconds gauge');
		expect(body).toContain('# TYPE nav_office_search_api_norg_geoids_loaded gauge');
		expect(body).toContain('# TYPE nav_office_search_api_norg_refresh_failed_offices gauge');
	});
});

describe('errors', () => {
	test('an unknown path answers Express 404', async () => {
		const app = await startApp();

		const res = await app.get('/finnes-ikke');

		expect(res.status).toBe(404);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
	});

	test('an error thrown in an async route answers 500, and the app keeps answering', async () => {
		http.get(norgEnhetUrl, { json: [norgEnhet()] });
		http.get(norgNavkontorerUrl('0315'), { json: [navkontor('030102')] });
		const app = await startApp();
		await app.loadOffices();
		const lookups = app.metricsRegistry.getSingleMetric('nav_office_search_api_lookups_total');
		const inc = vi.spyOn(lookups as unknown as { inc: () => void }, 'inc').mockImplementation(() => {
			throw new Error('Simulated failure');
		});

		for (const path of ['/geoid?id=030102', '/adresse', '/bydel']) {
			expect((await app.get(path)).status, path).toBe(500);
		}

		inc.mockRestore();
		expect((await app.get('/geoid?id=030102')).status).toBe(200);
	});
});
