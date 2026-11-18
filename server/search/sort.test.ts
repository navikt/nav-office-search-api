import { describe, expect, test } from 'vitest';
import type { OfficeInfo } from '../data/types.ts';
import { norskSort, sortOfficeNames } from './sort.ts';

describe('norskSort', () => {
	test('sorts Æ, Ø and Å after Z, and "Aa" as Å', () => {
		const names = ['Åsnes', 'Aal', 'Ab', 'Ørsta', 'Æra', 'Zeta', 'Østensjø', 'Øksnes', 'Ålesund', 'Aure'];

		expect(names.toSorted(norskSort)).toEqual([
			'Ab',
			'Aure',
			'Zeta',
			'Æra',
			'Øksnes',
			'Ørsta',
			'Østensjø',
			'Aal',
			'Ålesund',
			'Åsnes',
		]);
	});

	test('puts lowercase before uppercase when letters are otherwise equal', () => {
		expect(['Alna', 'alna'].toSorted(norskSort)).toEqual(['alna', 'Alna']);
	});
});

describe('sortOfficeNames', () => {
	const office = (name: string): OfficeInfo => ({ name, enhetNr: '', url: '', hitString: '', geoId: '' });

	test('sorts offices by name with Norwegian collation', () => {
		const sorted = [office('Nav Østensjø'), office('Nav Alna'), office('Nav Ås'), office('Nav Bjerke')].toSorted(
			sortOfficeNames
		);

		expect(sorted.map(({ name }) => name)).toEqual(['Nav Alna', 'Nav Bjerke', 'Nav Østensjø', 'Nav Ås']);
	});
});
