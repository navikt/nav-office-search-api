import { describe, expect, test } from 'vitest';
import { buildBydeler } from './bydeler.ts';
import type { PostnrRegisterRow } from './files.ts';
import { buildKommuner } from './kommuner.ts';
import { joinOffices } from './offices.ts';
import { buildPoststeder } from './poststeder.ts';

// What NORG has (checked against dev on 2026-10-08): Svalbard (2100) is served by Nav Tromsø, Jan Mayen (2211) by
// nobody, and Tromsø has been 5501 since 2024. Oslo has an office per bydel, and Hemsedal (3042) has none here.
const offices = joinOffices(
	new Map([
		['2100', { navn: 'Nav Tromsø', enhetNr: '1902' }],
		['5501', { navn: 'Nav Tromsø', enhetNr: '1902' }],
		['030105', { navn: 'Nav Frogner', enhetNr: '0312' }],
	]),
	new Map([
		['1902', '/kontor/nav-tromso'],
		['0312', '/kontor/nav-frogner'],
	])
);

const row = (postnr: string, poststed: string, kommunenr: string, kommune: string): PostnrRegisterRow => ({
	postnr,
	poststed,
	kommunenr,
	kommune,
	kategori: 'G',
});

const register = [
	row('9170', 'LONGYEARBYEN', '2100', 'SVALBARD'),
	row('8099', 'JAN MAYEN', '2211', 'JAN MAYEN'),
	row('9008', 'TROMSØ', '5501', 'TROMSØ'),
	row('9009', 'TROMSØ', '5501', 'TROMSØ'),
	row('3560', 'HEMSEDAL', '3042', 'HEMSEDAL'),
	row('0255', 'OSLO', '0301', 'OSLO'),
];

const bydeler = buildBydeler([{ code: '030105', name: 'Frogner' }], offices);
const kommuner = buildKommuner(register, bydeler, offices);
const poststeder = buildPoststeder(register, kommuner);

const tromso = { enhetNr: '1902', name: 'Nav Tromsø' };

describe('buildKommuner', () => {
	test.each([
		['2100', 'SVALBARD'],
		['2211', 'JAN MAYEN'],
		['5501', 'TROMSØ'],
	])('kommune %s (%s) is served by Nav Tromsø', (kommunenr, kommuneNavn) => {
		expect(kommuner.find((kommune) => kommune.kommunenr === kommunenr)).toMatchObject({
			kommuneNavn,
			officeInfo: tromso,
		});
	});

	test('gives a kommune with bydeler those, and no office of its own', () => {
		expect(kommuner.find(({ kommunenr }) => kommunenr === '0301')).toEqual({
			kommunenr: '0301',
			kommuneNavn: 'OSLO',
			kommuneNavnNormalized: 'oslo',
			bydeler,
		});
	});

	test('leaves out a kommune without an office, and lists the others once each, by kommunenr', () => {
		expect(kommuner.map(({ kommunenr }) => kommunenr)).toEqual(['0301', '2100', '2211', '5501']);
	});
});

describe('buildPoststeder', () => {
	test.each(['9170', '8099', '9008'])('postnr %s gets Nav Tromsø, its kommune’s office', (postnr) => {
		expect(poststeder.get(postnr)?.officeInfo).toMatchObject([tromso]);
	});

	test.each([
		['0255', 'in a kommune with bydeler'],
		['3560', 'in a kommune without an office'],
	])('postnr %s, %s, gets no office', (postnr) => {
		expect(poststeder.get(postnr)?.officeInfo).toEqual([]);
	});

	test('has a poststed per row of the register', () => {
		expect(poststeder.get('9009')).toEqual({
			postnr: '9009',
			poststed: 'TROMSØ',
			poststedNormalized: 'tromsø',
			kommuneNavn: 'TROMSØ',
			kommunenr: '5501',
			kategori: 'G',
			officeInfo: [expect.objectContaining(tromso)],
		});
		expect(poststeder.size).toBe(register.length);
	});
});
