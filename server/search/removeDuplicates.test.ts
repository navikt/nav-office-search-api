import { describe, expect, test } from 'vitest';
import { removeDuplicates } from './removeDuplicates.ts';

describe('removeDuplicates', () => {
	test('without a predicate, keeps the first of each identical value in order', () => {
		expect(removeDuplicates(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
	});

	test('without a predicate, compares objects by reference', () => {
		const office = { enhetNr: '0312' };
		expect(removeDuplicates([office, office, { enhetNr: '0312' }])).toEqual([office, { enhetNr: '0312' }]);
	});

	test('with a predicate, keeps the first item each group of equal items', () => {
		const items = [
			{ enhetNr: '0312', hitString: 'FROGNER' },
			{ enhetNr: '0326', hitString: 'ALNA' },
			{ enhetNr: '0312', hitString: 'OSLO' },
		];

		expect(removeDuplicates(items, (a, b) => a.enhetNr === b.enhetNr)).toEqual([items[0], items[1]]);
	});

	test('handles an empty array', () => {
		expect(removeDuplicates([])).toEqual([]);
		expect(removeDuplicates([], () => true)).toEqual([]);
	});
});
