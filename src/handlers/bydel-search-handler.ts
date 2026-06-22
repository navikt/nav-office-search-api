import { Request, Response } from 'express';
import { ErrorResponse } from '../helpers/fetch.js';
import { getAccessToken, invalidateAccessToken } from '../helpers/auth.js';

import { gql, request, ClientError } from 'graphql-request';
import { PdlSokBydelResponse } from '../types/types.js';

const graphQLUrl = `${process.env.PDL_API}/graphql`;

const queryError = (statusCode: number, message: string): ErrorResponse => ({
    error: true,
    statusCode,
    message,
});

const pdlBydelSokRequest = (
    bearerToken: string,
    queryDoc: string,
    queryVariables: Record<string, unknown>
) =>
    request<PdlSokBydelResponse>(graphQLUrl, queryDoc, queryVariables, {
        Authorization: `Bearer ${bearerToken}`,
    });

const sanitizePostnummer = (postnummer: string): string | null => {
    const sanitized = postnummer.replace(/\D/g, '');
    return sanitized.length === 4 ? sanitized : null;
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

    const token = process.env.PDL_DEVELOPMENT_TOKEN || (await getAccessToken());

    try {
        return await pdlBydelSokRequest(token, queryDoc, queryVariables);
    } catch (e) {
        const is401 = e instanceof ClientError && e.response.status === 401;

        if (is401 && !process.env.PDL_DEVELOPMENT_TOKEN) {
            console.warn('PDL returned 401, retrying with fresh token');
            invalidateAccessToken();
            try {
                const freshToken = await getAccessToken();
                return await pdlBydelSokRequest(
                    freshToken,
                    queryDoc,
                    queryVariables
                );
            } catch (retryError) {
                console.error('PDL retry after 401 also failed:', retryError);
                return queryError(
                    502,
                    `PDL request failed after token refresh: ${retryError instanceof Error ? retryError.message : retryError}`
                );
            }
        }

        console.error('PDL adresse-sok request failed:', e);
        return queryError(
            502,
            `PDL request failed: ${e instanceof Error ? e.message : e}`
        );
    }
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

        return res.status(200).send(response);
    } catch (e) {
        console.error('Unexpected error in bydel search handler:', e);
        return res.status(500).send({
            message: 'Internal server error',
        });
    }
};
