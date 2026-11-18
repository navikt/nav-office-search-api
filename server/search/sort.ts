import type { OfficeInfo } from '../data/types.ts';

export const sortOfficeNames = (a: OfficeInfo, b: OfficeInfo) => norskSort(a.name, b.name);

export const norskSort = new Intl.Collator(['no', 'nb', 'nn'], {
	usage: 'sort',
}).compare;
