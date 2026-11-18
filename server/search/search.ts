import { logger } from '@navikt/navno-logger';
import { addressSearch } from './address.ts';
import { nameSearch } from './name.ts';
import { isPostnrQuery, postnrSearch } from './postnr.ts';
import { errorAnswer, type SearchAnswer } from './results.ts';

// One search, whatever was typed: a postnummer finds its poststed with offices. Anything else is tried as a name,
// of a poststed, a kommune, a bydel or an office. What no name matches is searched for as an address.
export const search = async (query?: string): Promise<SearchAnswer> => {
	try {
		if (!query?.trim()) {
			return errorAnswer(400, 'errorMissingQuery');
		}

		if (isPostnrQuery(query)) {
			return await postnrSearch(query);
		}

		const names = nameSearch(query);
		if (names.hits.length > 0) {
			return { status: 200, body: names };
		}

		return await addressSearch(query);
	} catch (e) {
		// Not the query, which can be an address someone typed
		logger.error('Search failed', e);
		return errorAnswer(500, 'errorServerError');
	}
};
