import { Request, Response } from 'express';
import Cache from 'node-cache';
import { ErrorResponse, OkResponse } from './fetch.js';

import { gql, request } from 'graphql-request';
import { PdlSokAdresseResponse } from 'types/types.js';

const pdlAPI = process.env.PDL_API;
const graphQLUrl = `${pdlAPI}/graphql`;

const cache = new Cache({
    stdTTL: 3600,
});

/* const fetchTpsAdresseSok = async (
    postnr: string,
    kommunenr?: string,
    husnr?: string,
    adresse?: string
): Promise<TpsAdresseSokResponse | ErrorResponse> => {
    if (!adresse && cache.has(postnr)) {
        return cache.get(postnr) as TpsAdresseSokResponse;
    }

    const response = await fetchJson<TpsAdresseSokResponse>(
        tpswsAdressesokApi,
        {
            soketype: 'L',
            alltidRetur: true,
            postnr,
            ...(kommunenr && { kommunenr }),
            ...(husnr && { husnr }),
            ...(adresse && { adresse }),
        },
        {
            'Nav-Consumer-Id': 'nav-office-search-api',
            'Nav-Call-Id': uuid(),
        }
    );

    if (response.error) {
        console.error(`Fetch error from tps adresse-sok: ${response.message}`);
    } else if (!adresse) {
        cache.set(postnr, response);
    }

    return response;
};
*/

const queryError = (message: string): ErrorResponse => ({
    error: true,
    statusCode: 400,
    message,
});

const fetchPdlAdresseSok = async (
    query: string
): Promise<PdlSokAdresseResponse | ErrorResponse> => {
    const sanitizedQueryString = query.replace(/[^a-zA-Z0-9\s]/g, '').trim();

    if (!sanitizedQueryString) {
        return queryError('Query string is empty or invalid');
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

    const token = process.env.PDL_DEVELOPMENT_TOKEN;

    try {
        const adresseResponse = await request<PdlSokAdresseResponse>(
            graphQLUrl,
            queryDoc,
            queryVariables,
            { Authorization: `Bearer ${token}` }
        );

        return adresseResponse;
    } catch (e) {
        console.error('PDL adresse-sok request failed:', e);
        return queryError(
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

    const response = await fetchPdlAdresseSok(queryString as string);

    console.log('Adresse search response:', response);

    return res.status(200).send(response);
};
