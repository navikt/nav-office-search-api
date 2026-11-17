import { expect, test } from 'vitest';
import { buildBydeler } from './bydeler.ts';
import { joinOffices } from './offices.ts';

const offices = joinOffices(
	new Map([['030105', { navn: 'Nav Frogner', enhetNr: '0312' }]]),
	new Map([['0312', '/kontor/nav-frogner']])
);

test('gives the bydeler their offices, and leaves out a bydel without one', () => {
	const bydeler = buildBydeler(
		[
			{ code: '030104', name: 'St. Hanshaugen' },
			{ code: '030105', name: 'Frogner' },
		],
		offices
	);

	expect(bydeler).toEqual([
		{ bydelsnr: '030105', navn: 'Frogner', navnNormalized: 'frogner', officeInfo: offices.get('030105') },
	]);
});
