import { describe, expect, test } from 'vitest';
import { normalizeString } from './normalizeString.ts';

describe('normalizeString', () => {
	test.each([
		['đ', 'd'],
		['ŋ', 'n'],
		['š', 's'],
		['ŧ', 't'],
		['û', 'u'],
		['ù', 'u'],
		['ú', 'u'],
		['ü', 'u'],
		['ö', 'ø'],
		['á', 'a'],
		['à', 'a'],
		['â', 'a'],
		['ã', 'a'],
		['ä', 'a'],
		['.', '-'],
	])('%s → %s', (input, expected) => {
		expect(normalizeString(input)).toBe(expected);
	});

	test.each([
		// Real names from the postnummerregister and NORG
		['GÁIVUOTNA KÅFJORD', 'gaivuotna kåfjord'],
		['PORSANGER PORSÁNGU PORSANKI', 'porsanger porsangu porsanki'],
		['Nav Unjárga/Nesseby', 'nav unjarga/nesseby'],
		['Grünerløkka', 'grunerløkka'],
		['St. Hanshaugen', 'st- hanshaugen'],
		['ÅS', 'ås'],
		['TROMSØ', 'tromsø'],
		['BÆRUM', 'bærum'],
		// Uppercase is lowered before mapping
		['ŊÁŠ', 'nas'],
		// Characters outside the map are left alone
		['Béla', 'béla'],
	])('%s → %s', (input, expected) => {
		expect(normalizeString(input)).toBe(expected);
	});

	test('returns an empty string for empty input', () => {
		expect(normalizeString('')).toBe('');
	});
});
