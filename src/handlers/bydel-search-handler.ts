import { Request, Response } from 'express';
import { ErrorResponse } from '../helpers/fetch.js';
import { gql } from 'graphql-request';
import { BydelerForslag, PdlSokBydelResponse } from '../types/types.js';
import { withPdlTokenRetry, pdlRequest } from '../helpers/pdl-request.js';

const sanitizePostnummer = (postnummer: string): string | null => {
    const sanitized = postnummer.replace(/\D/g, '');
    return sanitized.length === 4 ? sanitized : null;
};

const toBydelerForslag = (response: PdlSokBydelResponse): BydelerForslag =>
    response.data.sokAdresse.aggregations[1].values.map((v) => v.value);

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
        return res.status(400).send({ message: 'Postnummer is required' });
    }

    const sanitizedPostnummer = sanitizePostnummer(postnummer);

    if (!sanitizedPostnummer) {
        return res.status(400).send({ message: 'Invalid postnummer' });
    }

    try {
        const response = await fetchPdlBydelSok(sanitizedPostnummer);

        if ('error' in response) {
            return res
                .status(response.statusCode)
                .send({ message: response.message });
        }

        return res.status(200).send(toBydelerForslag(response));
    } catch (e) {
        console.error('Unexpected error in bydel search handler:', e);
        return res.status(500).send({
            message: 'Internal server error',
        });
    }
};
