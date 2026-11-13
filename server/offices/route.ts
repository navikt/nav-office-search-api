import { Hono } from 'hono';
import { countLookup, type LookupEnv } from '../metrics.ts';
import { getOfficeData } from './offices.ts';

export const geoid = new Hono<LookupEnv>().get('/', countLookup('geoid'), (c) => {
	// A repeated id counts as a missing one
	const ids = c.req.queries('id');
	const id = ids?.length === 1 ? ids[0] : undefined;

	if (id === undefined) {
		return c.text("Invalid request - 'id' parameter is required", 400);
	}

	const officeInfo = getOfficeData(id);

	if (!officeInfo) {
		c.set('lookupResult', 'empty');
		return c.json({ message: `No office info found for geoid ${id}` }, 404);
	}

	c.set('lookupResult', 'hits');
	return c.json(officeInfo);
});
