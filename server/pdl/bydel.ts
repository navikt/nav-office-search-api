import { gql } from 'graphql-request';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorResponse } from '../fetch.ts';
import { countLookup, type LookupEnv } from '../metrics.ts';
import type { BydelerResponse, PdlSokBydelResponse } from './types.ts';
import { withPdlTokenRetry, pdlRequest } from './client.ts';

export const sanitizePostnummer = (postnummer: string): string | null => {
	const sanitized = postnummer.trim();
	return /^\d{4}$/.test(sanitized) ? sanitized : null;
};

const toBydelerResponse = (response: PdlSokBydelResponse): BydelerResponse => {
	const bydelAgg = response.sokAdresse.aggregations.find((a) => a.fieldName === 'vegadresse.bydelsnummer');
	return { bydeler: bydelAgg?.values.map((v) => v.value) ?? [] };
};

const fetchPdlBydelSok = async (postnummer: string): Promise<PdlSokBydelResponse | ErrorResponse> => {
	const queryDoc = gql`
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
				fieldName: 'vegadresse.kommunenummer',
			},
			{
				fieldName: 'vegadresse.bydelsnummer',
			},
		],
	};

	return withPdlTokenRetry((token) => pdlRequest<PdlSokBydelResponse>(token, queryDoc, queryVariables));
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
