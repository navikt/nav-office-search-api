import { referenceData } from '../data/data.ts';
import { searchAddresses } from '../pdl/adresse.ts';
import { errorAnswer, type SearchAnswer } from './results.ts';

// The addresses PDL finds for what someone typed, each with the office of its bydel or, without a bydel, of its
// kommune. An address in an area without an office is still an answer: its office is null.
export const addressSearch = async (query: string): Promise<SearchAnswer> => {
	const found = await searchAddresses(query);

	if ('error' in found) {
		// 400 is a query that leaves nothing to search for. The rest is PDL not answering.
		return found.statusCode === 400
			? errorAnswer(400, 'errorInvalidQuery')
			: errorAnswer(found.statusCode === 504 ? 504 : 502, 'errorServerError');
	}

	const { offices } = referenceData();

	return {
		status: 200,
		body: {
			type: 'adresse',
			adresseQuery: query,
			adresser: found.adresser.map((adresse) => {
				const geoId = adresse.bydelsnummer ?? adresse.kommunenummer;
				return { ...adresse, officeInfo: (geoId && offices.get(geoId)) || null };
			}),
			totalHits: found.totalHits,
		},
	};
};
