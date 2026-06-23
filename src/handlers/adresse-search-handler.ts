import { Request, Response } from 'express';
import { ErrorResponse } from '../helpers/fetch.js';
import { gql } from 'graphql-request';
import { AdresseForslag, PdlSokAdresseResponse } from '../types/types.js';
import { withPdlTokenRetry, pdlRequest } from '../helpers/pdl-request.js';

const queryError = (statusCode: number, message: string): ErrorResponse => ({
    error: true,
    statusCode,
    message,
});

const toAdresseForslag = (response: PdlSokAdresseResponse): AdresseForslag => ({
    totalHits: response.data.sokAdresse.totalHits,
    hits: response.data.sokAdresse.hits.map((h) => h.vegadresse),
});

const validateQueryString = (query: string): string | null => {
    if (query.length > 150) {
        return 'Query string exceeds maximum length of 150 characters';
    }

    const sanitizedQueryString = query
        .replace(/[^\p{L}\p{N}\s.,-]/gu, '')
        .trim();

    if (!sanitizedQueryString) {
        return 'Query string is empty or invalid';
    }

    return null;
};

const fetchPdlAdresseSok = async (
    query: string
): Promise<PdlSokAdresseResponse | ErrorResponse> => {
    const validationError = validateQueryString(query);

    if (validationError) {
        return queryError(400, validationError);
    }

    const sanitizedQueryString = query
        .replace(/[^\p{L}\p{N}\s.,-]/gu, '')
        .trim();

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

    return withPdlTokenRetry((token) =>
        pdlRequest<PdlSokAdresseResponse>(token, queryDoc, queryVariables)
    );
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

        return res.status(200).send(toAdresseForslag(response));
    } catch (e) {
        console.error('Unexpected error in adresse search handler:', e);
        return res.status(500).send({
            message: 'Internal server error',
        });
    }
};
