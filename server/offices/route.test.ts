import { describe, expect, test } from 'vitest';
import { startApp } from '#test/app.ts';
import { installMockFetch } from '#test/fetch.ts';
import { navkontor, norgEnhet, norgEnhetUrl, norgNavkontorerUrl } from '#test/fixtures.ts';

import { expectLookups } from '#test/pdl.ts';

const http = installMockFetch();

const office = { enhetNr: '0315', navn: 'Nav Grünerløkka' };

// The app with Nav Grünerløkka loaded for Oslo (kommune 0301) and Grünerløkka (bydel 030102)
const startAppWithOffices = async () => {
	http.get(norgEnhetUrl, { json: [norgEnhet()] });
	http.get(norgNavkontorerUrl('0315'), { json: [navkontor('0301'), navkontor('030102')] });
	const app = await startApp();
	expect(await app.loadOffices()).toBe(true);
	return app;
};

describe('GET /geoid', () => {
	test('answers the office for a bydelsnummer', async () => {
		const app = await startAppWithOffices();

		const res = await app.get('/geoid?id=030102');

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json');
		expect(await res.json()).toEqual(office);
	});

	test('answers the office for a kommunenummer', async () => {
		const app = await startAppWithOffices();

		const res = await app.get('/geoid?id=0301');

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(office);
	});

	test('accepts a trailing slash', async () => {
		const app = await startAppWithOffices();

		const res = await app.get('/geoid/?id=030102');

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(office);
	});

	test('answers 404 for an id without an office', async () => {
		const app = await startAppWithOffices();

		const res = await app.get('/geoid?id=030199');

		expect(res.status).toBe(404);
		expect(res.headers.get('content-type')).toBe('application/json');
		expect(await res.json()).toEqual({ message: 'No office info found for geoid 030199' });
	});

	test('answers 404 before the offices are loaded', async () => {
		const app = await startApp();

		const res = await app.get('/geoid?id=030102');

		expect(res.status).toBe(404);
	});

	test.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
		'answers 404 for %s, and keeps answering',
		async (id) => {
			const app = await startAppWithOffices();

			const res = await app.get(`/geoid?id=${id}`);

			expect(res.status).toBe(404);
			expect(await res.json()).toEqual({ message: `No office info found for geoid ${id}` });
			expect((await app.get('/geoid?id=030102')).status).toBe(200);
		}
	);

	test.each([
		['without id', '/geoid'],
		['with a repeated id', '/geoid?id=0301&id=030102'],
		['with an id[] parameter', '/geoid?id[]=0301'],
	])('answers 400 %s', async (_, path) => {
		const app = await startAppWithOffices();

		const res = await app.get(path);

		expect(res.status).toBe(400);
		expect(res.headers.get('content-type')).toBe('text/plain; charset=UTF-8');
		expect(await res.text()).toBe("Invalid request - 'id' parameter is required");
	});

	test('ignores an id[] parameter next to id', async () => {
		const app = await startAppWithOffices();

		const res = await app.get('/geoid?id=030102&id[]=0301');

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(office);
	});

	test.each([
		['an empty id', ''],
		['an id that is not a number', 'abc'],
	])('looks up %s, and answers 404 (bug)', async (_, id) => {
		const app = await startAppWithOffices();

		const res = await app.get(`/geoid?id=${id}`);

		expect(res.status).toBe(404);
	});

	test('counts lookups by result', async () => {
		const app = await startAppWithOffices();

		await app.get('/geoid?id=030102');
		await app.get('/geoid?id=0301');
		await app.get('/geoid?id=030199');
		await app.get('/geoid');

		await expectLookups(app, 'geoid', [2, 1, 0, 1]);
	});
});
