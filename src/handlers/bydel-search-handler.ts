import { Request, Response } from 'express';
import { ErrorResponse } from '../helpers/fetch.js';
import { gql } from 'graphql-request';
import { BydelerResponse, PdlSokBydelResponse } from '../types/types.js';
import { withPdlTokenRetry, pdlRequest } from '../helpers/pdl-request.js';
import { recordLookup } from '../metrics.js';

export const sanitizePostnummer = (postnummer: string): string | null => {
    const sanitized = postnummer.trim();
    return /^\d{4}$/.test(sanitized) ? sanitized : null;
};

const toBydelerResponse = (response: PdlSokBydelResponse): BydelerResponse => {
    const bydelAgg = response.sokAdresse.aggregations.find(
        (a) => a.fieldName === 'vegadresse.bydelsnummer'
    );
    return { bydeler: bydelAgg?.values.map((v) => v.value) ?? [] };
};

const fetchPdlBydelSok = async (
    postnummer: string
): Promise<PdlSokBydelResponse | ErrorResponse> => {
    const queryDoc = gql`
        query sokAdresseAggregeringQuery(
            $paging: Paging
            $criteria: [Criterion]
            $aggregations: [Aggregation]
        ) {
            sokAdresse(
                paging: $paging
                criteria: $criteria
                aggregations: $aggregations
            ) {
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

    return withPdlTokenRetry((token) =>
        pdlRequest<PdlSokBydelResponse>(token, queryDoc, queryVariables)
    );
};

export const bydelSearchHandler = async (req: Request, res: Response) => {
    const { postnummer } = req.query;

    if (typeof postnummer !== 'string' || !postnummer.trim()) {
        recordLookup('bydel', 'invalid');
        return res.status(400).send({ error: 'Postnummer is required' });
    }

    const sanitizedPostnummer = sanitizePostnummer(postnummer);

    if (!sanitizedPostnummer) {
        recordLookup('bydel', 'invalid');
        return res.status(400).send({ error: 'Invalid postnummer' });
    }

    try {
        const response = await fetchPdlBydelSok(sanitizedPostnummer);

        if ('error' in response) {
            recordLookup(
                'bydel',
                response.statusCode < 500 ? 'invalid' : 'error'
            );
            return res
                .status(response.statusCode)
                .send({ error: response.message });
        }

        const bydelerResponse = toBydelerResponse(response);
        recordLookup(
            'bydel',
            bydelerResponse.bydeler.length > 0 ? 'hits' : 'empty'
        );

        return res.status(200).send(bydelerResponse);
    } catch (e) {
        console.error('Unexpected error in bydel search handler:', e);
        recordLookup('bydel', 'error');
        return res.status(500).send({
            error: 'Internal server error',
        });
    }
};
