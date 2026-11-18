import { referenceData } from '../data/data.ts';
import { normalizeString } from '../data/normalizeString.ts';
import type { Bydel, Kommune, OfficeInfo, Poststed } from '../data/types.ts';
import { removeDuplicates } from './removeDuplicates.ts';
import type { NameHit, SearchResultNameProps } from './results.ts';
import { norskSort, sortOfficeNames } from './sort.ts';

const buildOfficeHit = (officeInfo: OfficeInfo, hitString: string): OfficeInfo => ({
	...officeInfo,
	hitString,
});

// Office names are compared normalized, like the query, so "unjarga" finds Nav Unjárga
const officeNameMatches = (officeInfo: OfficeInfo, normalizedQuery: string) =>
	normalizeString(officeInfo.name).includes(normalizedQuery);

const getBydelFromKommune = (kommune: Kommune, normalizedQuery: string) => {
	if (!kommune.bydeler) {
		return [];
	}

	return kommune.bydeler
		.filter((bydel) => {
			return officeNameMatches(bydel.officeInfo, normalizedQuery) || bydel.navnNormalized.includes(normalizedQuery);
		})
		.map((bydel) => buildOfficeHit(bydel.officeInfo, bydel.navn));
};

const findOfficeName = (kommuner: Kommune[], normalizedQuery: string): OfficeInfo[] => {
	// The office names is buried in the kommuner array,
	// so start from there
	let officeHits: OfficeInfo[] = [];
	kommuner.forEach((kommune) => {
		const bydelerOfficeHits = getBydelFromKommune(kommune, normalizedQuery);

		const isMatch = kommune.officeInfo && officeNameMatches(kommune.officeInfo, normalizedQuery);

		const officeHit = kommune.officeInfo && isMatch ? buildOfficeHit(kommune.officeInfo, kommune.kommuneNavn) : null;

		officeHits = officeHit ? [...officeHits, ...bydelerOfficeHits, officeHit] : [...officeHits, ...bydelerOfficeHits];
	});

	return officeHits;
};

const findBydeler = (bydeler: Bydel[], normalizedQuery: string): OfficeInfo[] => {
	const bydelerMatches = bydeler.filter((bydel) => bydel.navnNormalized.includes(normalizedQuery));

	return bydelerMatches.map((bydel) => buildOfficeHit(bydel.officeInfo, bydel.navn));
};

const findPoststeder = (poststeder: Poststed[], normalizedQuery: string): OfficeInfo[] => {
	return poststeder.reduce((matches, poststed) => {
		const isMatch = poststed.poststedNormalized.includes(normalizedQuery) && poststed.officeInfo.length > 0;
		if (!isMatch) {
			return matches;
		}

		return [...matches, ...poststed.officeInfo.map((office) => buildOfficeHit(office, poststed.poststed))];
	}, [] as OfficeInfo[]);
};

const findKommuner = (kommuner: Kommune[], normalizedQuery: string): OfficeInfo[] => {
	return kommuner.reduce((matches, kommune) => {
		const isMatch = kommune.kommuneNavnNormalized.includes(normalizedQuery);
		if (!isMatch) {
			return matches;
		}

		const officeInfo = kommune.bydeler
			? kommune.bydeler.map((bydel) => buildOfficeHit(bydel.officeInfo, kommune.kommuneNavn))
			: kommune.officeInfo
				? [{ ...kommune.officeInfo, hitString: kommune.kommuneNavn }]
				: [];

		return [...matches, ...officeInfo];
	}, [] as OfficeInfo[]);
};

const sortNamesWithQueryFirstBias = (queryNormalized: string) => (a: NameHit, b: NameHit) => {
	const aStartsWithInput = normalizeString(a.name).startsWith(queryNormalized);
	const bStartsWithInput = normalizeString(b.name).startsWith(queryNormalized);

	if (aStartsWithInput && !bStartsWithInput) {
		return -1;
	}

	if (!aStartsWithInput && bStartsWithInput) {
		return 1;
	}

	return norskSort(a.name, b.name);
};

const transformHits = (officeHits: OfficeInfo[], normalizedQuery: string): NameHit[] => {
	const hitsMap: { [name: string]: OfficeInfo[] } = {};

	const officeHitsWithoutDuplicates = removeDuplicates(officeHits, (a, b) => a.enhetNr === b.enhetNr);

	for (const officeHit of officeHitsWithoutDuplicates) {
		const name = officeHit.hitString;
		if (!hitsMap[name]) {
			hitsMap[name] = [];
		}

		hitsMap[name].push(officeHit);
	}

	return Object.entries(hitsMap)
		.map(([name, hits]) => {
			const officeHits = [...hits].sort(sortOfficeNames);

			return {
				name: name,
				officeHits,
			};
		})
		.sort(sortNamesWithQueryFirstBias(normalizedQuery));
};

// The offices found by a name: of a poststed, a kommune, a bydel or an office itself. They are grouped under the name
// that matched, with the names that start with the query first.
export const nameSearch = (query: string): SearchResultNameProps => {
	const { poststeder, kommuner, bydeler } = referenceData();
	const queryWithoutNAVPrefix = query.trim().replace(/^nav /i, '');
	const normalizedQuery = normalizeString(queryWithoutNAVPrefix);

	const hits = transformHits(
		[
			...findPoststeder([...poststeder.values()], normalizedQuery),
			...findKommuner(kommuner, normalizedQuery),
			...findBydeler(bydeler, normalizedQuery),
			...findOfficeName(kommuner, normalizedQuery),
		],
		normalizedQuery
	);

	return { hits, type: 'name', input: query };
};
