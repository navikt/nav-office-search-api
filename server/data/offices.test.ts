import { isHttpError } from '@itsy/corgi';
import { isValidationError } from '@itsy/corgi/schema';
import { networkError } from '@itsy/corgi/testing';
import { logger } from '@navikt/navno-logger';
import { describe, expect, test, vi } from 'vitest';
import { installMockFetch } from '#test/fetch.ts';
import { NAVNO_ORIGIN, xpOfficeInfo, xpOfficeInfoUrl } from '#test/fixtures.ts';
import { answerSnapshot } from '#test/snapshot.ts';
import type { NorgOffices } from './norg.ts';
import { fetchOfficePaths, joinOffices, type OfficePaths } from './offices.ts';

const http = installMockFetch();

describe('fetchOfficePaths', () => {
	test("gives each office's path on nav.no, by enhetNr", async () => {
		answerSnapshot(http);

		const officePaths = await fetchOfficePaths();

		expect(officePaths.size).toBe(425);
		expect(officePaths.get('0316')).toBe('/kontor/nav-gamle-oslo');
		expect(http.calls.map(({ url }) => url)).toEqual([xpOfficeInfoUrl]);
		expect(http.lastCall?.headers.get('accept')).toBe('application/json');
	});

	test("leaves out a page that isn't an office's, which XP lists without an enhetNr", async () => {
		http.get(xpOfficeInfoUrl, {
			json: xpOfficeInfo([
				{ path: '/kontor/arbeids-og-velferdsdirektoratet-kontaktinformasjon' },
				{ path: '/kontor/nav-grunerlokka', enhetNr: '0315' },
				{ enhetNr: '0316' },
			]),
		});

		expect([...(await fetchOfficePaths())]).toEqual([['0315', '/kontor/nav-grunerlokka']]);
	});

	test('asks XP at the same address when its origin ends with a slash', async () => {
		vi.stubEnv('XP_ORIGIN', 'http://xp.test/');
		vi.resetModules();
		const withSlash = await import('./offices.ts');
		http.get(xpOfficeInfoUrl, { json: xpOfficeInfo() });

		await withSlash.fetchOfficePaths();

		expect(http.calls.map(({ url }) => url)).toEqual([xpOfficeInfoUrl]);
	});

	test('throws when XP answers an error', async () => {
		http.get(xpOfficeInfoUrl, { status: 503 });

		await expect(fetchOfficePaths()).rejects.toSatisfy(isHttpError);
	});

	test("throws when XP's answer isn't offices", async () => {
		http.get(xpOfficeInfoUrl, { json: { offices: [{ path: '/kontor/nav-grunerlokka', enhetNr: 315 }] } });

		await expect(fetchOfficePaths()).rejects.toSatisfy(isValidationError);
	});

	test('throws when XP is unreachable', async () => {
		http.get(xpOfficeInfoUrl, networkError());

		await expect(fetchOfficePaths()).rejects.toThrow('fetch failed');
	});
});

describe('joinOffices', () => {
	const officePaths: OfficePaths = new Map([['0316', '/kontor/nav-gamle-oslo']]);
	const gamleOslo = { enhetNr: '0316', navn: 'Nav Gamle Oslo' };
	const norgOffices: NorgOffices = new Map([
		['030101', gamleOslo],
		['030102', { enhetNr: '9998', navn: 'Nav Ny' }],
		['030103', { enhetNr: '9999', navn: 'Nav Ukjent' }],
		['030104', { enhetNr: '9999', navn: 'Nav Ukjent' }],
	]);

	test('gives the office of an area, with its page on nav.no', () => {
		const offices = joinOffices(new Map([['030101', gamleOslo]]), officePaths);

		expect([...offices]).toEqual([
			[
				'030101',
				{
					name: 'Nav Gamle Oslo',
					url: `${NAVNO_ORIGIN}/kontor/nav-gamle-oslo`,
					geoId: '030101',
					enhetNr: '0316',
					hitString: '',
				},
			],
		]);
	});

	test.each(['2211', '030199', '', 'constructor', '__proto__'])(
		'finds nothing for %j, which has no office',
		(geoId) => {
			expect(joinOffices(norgOffices, officePaths).get(geoId)).toBeUndefined();
		}
	);

	test('leaves out an office without a page in XP, so its areas have no office, and logs those offices once', () => {
		const error = vi.spyOn(logger, 'error');

		const offices = joinOffices(norgOffices, officePaths);

		expect([...offices.keys()]).toEqual(['030101']);
		expect(error.mock.calls).toEqual([['Offices without a page in XP', { count: 2, enhetNr: ['9998', '9999'] }]]);
	});

	const ny: NorgOffices = new Map([['030102', { enhetNr: '9998', navn: 'Nav Ny' }]]);

	test.each(['/kontor/nav-ny', 'kontor/nav-ny', './kontor/nav-ny'])(
		'joins nav.no and the path %j with one slash',
		(path) => {
			const offices = joinOffices(ny, new Map([['9998', path]]));

			expect(offices.get('030102')?.url).toBe(`${NAVNO_ORIGIN}/kontor/nav-ny`);
		}
	);

	test('keeps the page on nav.no for a path that would name another host when glued on', () => {
		const offices = joinOffices(ny, new Map([['9998', '@evil.test/kontor']]));

		expect(offices.get('030102')?.url).toBe(`${NAVNO_ORIGIN}/@evil.test/kontor`);
	});

	test('logs nothing when every office has a page', () => {
		const error = vi.spyOn(logger, 'error');

		joinOffices(new Map([['030101', gamleOslo]]), officePaths);

		expect(error).not.toHaveBeenCalled();
	});
});
