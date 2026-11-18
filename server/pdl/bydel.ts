import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { countLookup, type LookupEnv } from '../metrics.ts';
import { type Failure, pdlQuery } from './client.ts';

export const sanitizePostnummer = (postnummer: string): string | null => {
	const sanitized = postnummer.trim();
	return /^\d{4}$/.test(sanitized) ? sanitized : null;
};

const sokBydelQuery = `
	query sokAdresseAggregeringQuery($paging: Paging, $criteria: [Criterion], $aggregations: [Aggregation]) {
		sokAdresse(paging: $paging, criteria: $criteria, aggregations: $aggregations) {
			aggregations {
				fieldName
				values {
					value
				}
			}
		}
	}
`;

// The bydelsnumre of a postnummer's addresses, as an aggregation: its values are the numbers
const sokBydelSchema = z.object({
	sokAdresse: z.object({
		aggregations: z.array(z.object({ fieldName: z.string(), values: z.array(z.object({ value: z.string() })) })),
	}),
});

type SokBydel = z.infer<typeof sokBydelSchema>;

const toBydelerResponse = (response: SokBydel) => {
	const bydelAgg = response.sokAdresse.aggregations.find((a) => a.fieldName === 'vegadresse.bydelsnummer');
	return { bydeler: bydelAgg?.values.map((v) => v.value) ?? [] };
};

const fetchPdlBydelSok = async (postnummer: string): Promise<SokBydel | Failure> => {
	const queryVariables = {
		paging: {
			pageNumber: 1,
			resultsPerPage: 50,
		},
		criteria: [
			{
				fieldName: 'vegadresse.postnummer',
				searchRule: {
					equals: postnummer,
				},
			},
		],
		aggregations: [
			{
				fieldName: 'vegadresse.bydelsnummer',
			},
		],
	};

	return pdlQuery(sokBydelQuery, queryVariables, sokBydelSchema);
};

// The bydelsnumre of the addresses PDL has in a postnummer, for /search
export const bydelsnumreIn = async (postnummer: string) => {
	const response = await fetchPdlBydelSok(postnummer);
	return 'error' in response ? response : toBydelerResponse(response).bydeler;
};

export const bydel = new Hono<LookupEnv>().get('/', countLookup('bydel'), async (c) => {
	// A repeated postnummer counts as a missing one
	const values = c.req.queries('postnummer');
	const postnummer = values?.length === 1 ? values[0] : undefined;

	if (postnummer === undefined || !postnummer.trim()) {
		return c.json({ error: 'Postnummer is required' }, 400);
	}

	const sanitizedPostnummer = sanitizePostnummer(postnummer);

	if (!sanitizedPostnummer) {
		return c.json({ error: 'Invalid postnummer' }, 400);
	}

	const response = await fetchPdlBydelSok(sanitizedPostnummer);

	if ('error' in response) {
		return c.json({ error: response.message }, response.statusCode as ContentfulStatusCode);
	}

	const bydelerResponse = toBydelerResponse(response);
	c.set('lookupResult', bydelerResponse.bydeler.length > 0 ? 'hits' : 'empty');

	return c.json(bydelerResponse);
});
