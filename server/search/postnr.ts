import { referenceData } from '../data/data.ts';
import type { OfficeInfo } from '../data/types.ts';
import { bydelsnumreIn } from '../pdl/bydel.ts';
import { removeDuplicates } from './removeDuplicates.ts';
import { errorAnswer, type SearchAnswer } from './results.ts';
import { sortOfficeNames } from './sort.ts';

const postnrQueryRegex = /^\d{4}$/;

export const isPostnrQuery = (query: string) => postnrQueryRegex.test(query.trim());

// A postnummer's poststed with its offices: its kommune's or, in a kommune with bydeler, those of the bydeler PDL has
// addresses in for the postnummer.
export const postnrSearch = async (query: string): Promise<SearchAnswer> => {
	const { poststeder, offices } = referenceData();

	const poststed = poststeder.get(query.trim());

	if (!poststed) {
		return errorAnswer(404, 'errorInvalidPostnr');
	}

	if (poststed.officeInfo.length > 0) {
		return { status: 200, body: { ...poststed, type: 'postnr' } };
	}

	const bydelsnumre = await bydelsnumreIn(poststed.postnr);

	// An error, not a postnummer without offices, which is what it would look like
	if (!Array.isArray(bydelsnumre)) {
		return errorAnswer(bydelsnumre.statusCode === 504 ? 504 : 502, 'errorServerError');
	}

	// A bydel without an office is left out
	const bydelOffices = bydelsnumre
		.map((bydelsnr) => offices.get(bydelsnr))
		.filter((office): office is OfficeInfo => office !== undefined);

	const officeInfo = removeDuplicates(bydelOffices, (a, b) => a.enhetNr === b.enhetNr).sort(sortOfficeNames);

	return { status: 200, body: { ...poststed, type: 'postnr', officeInfo } };
};
