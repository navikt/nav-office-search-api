import { Hono } from 'hono';
import { countLookup, type LookupEnv } from '../metrics.ts';
import type { SearchResultProps } from './results.ts';
import { search as answerSearch } from './search.ts';

// Whether a search found an office or an address
const hasHits = (body: SearchResultProps) => {
	switch (body.type) {
		case 'postnr':
			return body.officeInfo.length > 0;
		case 'name':
			return body.hits.length > 0;
		case 'adresse':
			return body.adresser.length > 0;
		default:
			return false;
	}
};

// GET /search?query=: the one search nav-office-search needs, answered as its browser code reads it
export const search = new Hono<LookupEnv>().get('/', countLookup('search'), async (c) => {
	// A repeated query counts as a missing one
	const values = c.req.queries('query');
	const { status, body } = await answerSearch(values?.length === 1 ? values[0] : undefined);

	if (status === 200) {
		c.set('lookupResult', hasHits(body) ? 'hits' : 'empty');
	}

	return c.json(body, status);
});
