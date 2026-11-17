import { describe, expect, test } from 'vitest';
import type { PostnrRegisterRow } from './files.ts';
import type { Kommune, OfficeInfo, Poststed } from './types.ts';
import { bydelerWithoutOffice, kommunerWithoutOffice, poststederWithoutOffice } from './withoutOffice.ts';

const tromso: OfficeInfo = { name: 'Nav Tromsø', enhetNr: '1902', geoId: '5501', url: '', hitString: '' };

const row = (postnr: string, kommunenr: string): PostnrRegisterRow => ({
	postnr,
	poststed: '',
	kommunenr,
	kommune: '',
	kategori: 'G',
});

const kommune = (kommunenr: string, extra: Partial<Kommune> = {}): Kommune => ({
	kommunenr,
	kommuneNavn: '',
	kommuneNavnNormalized: '',
	...extra,
});

const poststed = (postnr: string, kommunenr: string, officeInfo: OfficeInfo[]): Poststed => ({
	postnr,
	poststed: '',
	poststedNormalized: '',
	kommuneNavn: '',
	kommunenr,
	kategori: 'G',
	officeInfo,
});

describe('kommunerWithoutOffice', () => {
	test('lists register kommuner the load left out, like Svalbard and Jan Mayen before the fix', () => {
		const register = [
			row('9008', '5501'),
			row('9170', '2100'),
			row('9171', '2100'),
			row('8099', '2211'),
			row('0150', '0301'),
		];
		const loaded = [kommune('5501', { officeInfo: tromso }), kommune('0301', { bydeler: [] })];

		expect(kommunerWithoutOffice(register, loaded)).toEqual(['2100', '2211']);
	});
});

describe('poststederWithoutOffice', () => {
	test('lists poststeder without offices, except in kommuner with bydeler', () => {
		const poststeder = [poststed('9008', '5501', [tromso]), poststed('9170', '2100', []), poststed('0150', '0301', [])];
		const loaded = [kommune('5501', { officeInfo: tromso }), kommune('0301', { bydeler: [] })];

		expect(poststederWithoutOffice(poststeder, loaded)).toEqual(['9170']);
	});
});

describe('bydelerWithoutOffice', () => {
	test("lists SSB's bydeler that have no office", () => {
		const ssbBydeler = [
			{ code: '030101', name: 'Gamle Oslo' },
			{ code: '030117', name: 'Marka' },
		];

		expect(bydelerWithoutOffice(ssbBydeler, new Map([['030101', tromso]]))).toEqual(['030117']);
	});
});
