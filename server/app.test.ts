import { logger, traceRoute } from '@navikt/navno-logger';
import { describe, expect, test, vi } from 'vitest';
import { startApp } from '#test/app.ts';
import { installMockFetch } from '#test/fetch.ts';
import { navkontor, norgEnhet, norgEnhetUrl, norgNavkontorerUrl } from '#test/fixtures.ts';

vi.mock('@navikt/navno-logger', async (importOriginal) => ({
	...(await importOriginal<typeof import('@navikt/navno-logger')>()),
	traceRoute: vi.fn(),
}));

const http = installMockFetch();

// The app with Nav Grünerløkka loaded for bydel Grünerløkka (030102)
const startAppWithOffice = async () => {
	http.get(norgEnhetUrl, { json: [norgEnhet()] });
	http.get(norgNavkontorerUrl('0315'), { json: [navkontor('030102')] });
	const app = await startApp();
	await app.loadOffices();
	return app;
};

describe('probes', () => {
	test('/internal/isAlive answers 200', async () => {
		const app = await startApp();

		const res = await app.get('/internal/isAlive');

		expect(res.status).toBe(200);
		// Hono leaves a plain 200 to Response, which writes the type without the space
		expect(res.headers.get('content-type')).toMatch(/^text\/plain; ?charset=UTF-8$/);
		expect(await res.text()).toBe('I am alive!');
	});

	test('/internal/isReady answers 503 until the app is ready, then 200', async () => {
		let ready = false;
		const app = await startApp({ isReady: () => ready });

		const notReady = await app.get('/internal/isReady');
		expect(notReady.status).toBe(503);
		expect(notReady.headers.get('content-type')).toBe('text/plain; charset=UTF-8');
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
	test("an unknown path answers Hono's 404", async () => {
		const app = await startApp();

		const res = await app.get('/finnes-ikke');

		expect(res.status).toBe(404);
		expect(res.headers.get('content-type')).toBe('text/plain; charset=UTF-8');
		expect(await res.text()).toBe('404 Not Found');
	});

	test('an error thrown in a route answers 500, is logged without the query, and the app keeps answering', async () => {
		const app = await startAppWithOffice();
		const error = vi.spyOn(logger, 'error');
		const lookups = app.metricsRegistry.getSingleMetric('nav_office_search_api_lookups_total');
		const inc = vi.spyOn(lookups as unknown as { inc: () => void }, 'inc').mockImplementation(() => {
			throw new Error('Simulated failure');
		});

		for (const path of ['/geoid?id=030102', '/adresse', '/bydel']) {
			const res = await app.get(path);
			expect(res.status, path).toBe(500);
			expect(await res.json(), path).toEqual({ error: 'Internal server error' });
		}

		expect(error.mock.calls).toEqual(
			['/geoid', '/adresse', '/bydel'].map((path) => [
				'Request failed',
				{ method: 'GET', path },
				new Error('Simulated failure'),
			])
		);
		inc.mockRestore();
		expect((await app.get('/geoid?id=030102')).status).toBe(200);
	});
});

describe('tracing', () => {
	test('names the trace after the route, not the requested path', async () => {
		const app = await startAppWithOffice();

		await app.get('/geoid/?id=030102');
		await app.get('/internal/isAlive');

		expect(vi.mocked(traceRoute).mock.calls).toEqual([['/geoid'], ['/internal/isAlive']]);
	});
});

// Hono's defaults, where Express answered differently. nav-office-search depends on none of them.
describe('framework defaults', () => {
	test('sends no X-Powered-By and no ETag', async () => {
		const app = await startAppWithOffice();

		const res = await app.get('/geoid?id=030102');

		expect(res.headers.get('x-powered-by')).toBeNull();
		expect(res.headers.get('etag')).toBeNull();
	});

	test('answers OPTIONS with 404', async () => {
		const app = await startAppWithOffice();

		expect((await app.request('/geoid?id=030102', { method: 'OPTIONS' })).status).toBe(404);
	});

	test('matches paths case-sensitively', async () => {
		const app = await startAppWithOffice();

		expect((await app.get('/GEOID?id=030102')).status).toBe(404);
	});

	test('decodes a %-escaped path before matching it', async () => {
		const app = await startAppWithOffice();

		expect((await app.get('/ge%6Fid?id=030102')).status).toBe(200);
	});
});
