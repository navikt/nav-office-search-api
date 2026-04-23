import { Request, Response } from 'express';
import { ErrorResponse } from './fetch.js';
import { getAccessToken, invalidateAccessToken } from './auth.js';

import { gql, request, ClientError } from 'graphql-request';
import { PdlSokAdresseResponse } from './types/types.js';

const pdlAPI = process.env.PDL_API;
const graphQLUrl = `${pdlAPI}/graphql`;

const queryError = (statusCode: number, message: string): ErrorResponse => ({
    error: true,
    statusCode,
    message,
});

const pdlAdresseSokRequest = (
    bearerToken: string,
    queryDoc: string,
    queryVariables: Record<string, unknown>
) =>
    request<PdlSokAdresseResponse>(graphQLUrl, queryDoc, queryVariables, {
        Authorization: `Bearer ${bearerToken}`,
    });

const fetchPdlAdresseSok = async (
    query: string
): Promise<PdlSokAdresseResponse | ErrorResponse> => {
    const sanitizedQueryString = query.replace(/[^\p{L}\p{N}\s]/gu, '').trim();

    if (!sanitizedQueryString) {
        return queryError(400, 'Query string is empty or invalid');
    }

    console.log('Fetching PDL adresse-sok with query:', sanitizedQueryString);

    const queryDoc = gql`
        query sokAdresseFritekstQuery($paging: Paging, $criteria: [Criterion]) {
            sokAdresse(paging: $paging, criteria: $criteria) {
                totalHits
                hits {
                    vegadresse {
                        adressenavn
                        husnummer
                        husbokstav
                        postnummer
                        poststed
                        kommunenummer
                        bydelsnummer
                    }
                }
            }
        }
    `;

    const queryVariables = {
        paging: {
            pageNumber: 1,
            resultsPerPage: 30,
        },
        criteria: [
            {
                fieldName: 'fritekst',
                searchRule: {
                    contains: sanitizedQueryString,
                },
            },
        ],
    };

    const token = process.env.PDL_DEVELOPMENT_TOKEN || (await getAccessToken());

    try {
        return await pdlAdresseSokRequest(token, queryDoc, queryVariables);
    } catch (e) {
        const is401 = e instanceof ClientError && e.response.status === 401;

        if (is401 && !process.env.PDL_DEVELOPMENT_TOKEN) {
            console.warn('PDL returned 401, retrying with fresh token');
            invalidateAccessToken();
            try {
                const freshToken = await getAccessToken();
                return await pdlAdresseSokRequest(
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

export const adresseSearchHandler = async (req: Request, res: Response) => {
    const { queryString } = req.query;

    if (typeof queryString !== 'string' || !queryString.trim()) {
        return res.status(400).send({
            message: 'Query string is required and must be a non-empty string',
        });
    }

    try {
        const response = await fetchPdlAdresseSok(queryString);

        if ('error' in response) {
            return res
                .status(response.statusCode)
                .send({ message: response.message });
        }

        return res.status(200).send(response);
    } catch (e) {
        console.error('Unexpected error in adresse search handler:', e);
        return res.status(500).send({
            message: 'Internal server error',
        });
    }
};
