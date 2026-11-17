import { isValidationError } from '@itsy/corgi/schema';
import { expect, test } from 'vitest';
import { installMockFetch } from '#test/fetch.ts';
import {
	ssbBydel,
	ssbClassification,
	ssbClassificationUrl,
	ssbVersion,
	ssbVersionRef,
	ssbVersionUrl,
} from '#test/fixtures.ts';
import { fetchBydeler } from './ssb.ts';

const http = installMockFetch();

test("gives the bydeler of the version that is valid now, without SSB's entry for no bydel", async () => {
	http.get(ssbClassificationUrl, {
		json: ssbClassification([ssbVersionRef(919, '2018-01-01', '2020-01-01'), ssbVersionRef(1168, '2020-01-01')]),
	});
	http.get(ssbVersionUrl(1168), {
		json: ssbVersion([
			ssbBydel('030101', 'Gamle Oslo'),
			ssbBydel('030102', 'Grünerløkka'),
			ssbBydel('030199', 'Uoppgitt'),
		]),
	});

	expect(await fetchBydeler()).toEqual({
		validFrom: '2020-01-01',
		bydeler: [
			{ code: '030101', name: 'Gamle Oslo' },
			{ code: '030102', name: 'Grünerløkka' },
		],
	});
	expect(http.calls.map(({ url }) => url)).toEqual([ssbClassificationUrl, ssbVersionUrl(1168)]);
});

test('takes the new version from the day it becomes valid, which is the day the old one ends', async () => {
	http.get(ssbClassificationUrl, {
		json: ssbClassification([ssbVersionRef(1168, '2020-01-01', '2028-01-01'), ssbVersionRef(2001, '2028-01-01')]),
	});
	http.get(ssbVersionUrl(1168), { json: ssbVersion([ssbBydel('030101', 'Gamle Oslo')]) });
	http.get(ssbVersionUrl(2001), { json: ssbVersion([ssbBydel('030116', 'Ny bydel')]) });

	expect(await fetchBydeler(new Date('2027-12-31T23:59:59Z'))).toEqual({
		validFrom: '2020-01-01',
		bydeler: [{ code: '030101', name: 'Gamle Oslo' }],
	});
	expect(await fetchBydeler(new Date('2028-01-01T00:00:00Z'))).toEqual({
		validFrom: '2028-01-01',
		bydeler: [{ code: '030116', name: 'Ny bydel' }],
	});
});

test('rejects when SSB has no version that is valid now', async () => {
	http.get(ssbClassificationUrl, { json: ssbClassification([ssbVersionRef(399, '2002-01-01', '2004-01-01')]) });

	await expect(fetchBydeler()).rejects.toThrow(
		'SSB has no version of its classification of bydeler that is valid today'
	);
});

test("rejects when the version isn't a list of bydeler", async () => {
	http.get(ssbClassificationUrl, { json: ssbClassification() });
	http.get(ssbVersionUrl(1168), { json: { classificationItems: [{ code: 30101, name: 'Gamle Oslo' }] } });

	await expect(fetchBydeler()).rejects.toSatisfy(isValidationError);
});
