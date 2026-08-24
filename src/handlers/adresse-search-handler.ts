import { Request, Response } from 'express';
import { ErrorResponse } from '../helpers/fetch.js';
import { gql } from 'graphql-request';
import { AdresseResponse, PdlSokAdresseResponse } from '../types/types.js';
import { withPdlTokenRetry, pdlRequest } from '../helpers/pdl-request.js';

const queryError = (statusCode: number, message: string): ErrorResponse => ({
    error: true,
    statusCode,
    message,
});

const toAdresseResponse = (
    response: PdlSokAdresseResponse
): AdresseResponse => ({
    totalHits: response.sokAdresse.totalHits,
    adresser: response.sokAdresse.hits.map((h) => h.vegadresse),
});

// House numbers with letters need to be split into individual parts.
// Do a crude flatMap so that "Husveien 31B" becomes ["Husveien", "31", "B"]
const splitAddressIntoParts = (address: string): string[] => {
    return address
        .split(/\s+/)
        .flatMap((part) => {
            const husnummerWithLetter = part.match(/^(\d+)([a-z]+)$/i);

            if (husnummerWithLetter) {
                const [, houseNumber, houseLetter] = husnummerWithLetter;
                return [houseNumber, houseLetter];
            }

            return [part];
        })
        .filter((part) => part.trim() !== '');
};

type QuerySegment = {
    fieldName: 'fritekst' | 'vegadresse.husnummer';
    searchRule: Record<string, string>;
};

const fritekstQuerySegmentBuilder = (part: string): QuerySegment => ({
    fieldName: 'fritekst',
    searchRule: { contains: part },
});

const husnummerQuerySegmentBuilder = (part: string): QuerySegment => ({
    fieldName: 'vegadresse.husnummer',
    searchRule: { wildcard: `${part}*` },
});

const buildQuerySegment = (part: string): QuerySegment => {
    if (/^\d{3}$/.test(part)) {
        return husnummerQuerySegmentBuilder(part);
    }

    return fritekstQuerySegmentBuilder(part);
};

type QueryValidationResult =
    | { query: string }
    | { error: string };

export const validateQueryString = (query: string): QueryValidationResult => {
    if (query.length > 150) {
        return {
            error: 'Query string exceeds maximum length of 150 characters',
        };
    }

    const sanitizedQueryString = query
        .replace(/[^\p{L}\p{N}\s.,-]/gu, '')
        .trim();

    if (!sanitizedQueryString) {
        return { error: 'Query string is empty or invalid' };
    }

    return { query: sanitizedQueryString };
};

const fetchPdlAdresseSok = async (
    query: string
): Promise<PdlSokAdresseResponse | ErrorResponse> => {
    const validationResult = validateQueryString(query);

    if ('error' in validationResult) {
        return queryError(400, validationResult.error);
    }

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

    const criteria = splitAddressIntoParts(validationResult.query).map(
        buildQuerySegment
    );

    const queryVariables = {
        paging: {
            pageNumber: 1,
            resultsPerPage: 30,
        },
        criteria,
    };

    return withPdlTokenRetry((token) =>
        pdlRequest<PdlSokAdresseResponse>(token, queryDoc, queryVariables)
    );
};

export const adresseSearchHandler = async (req: Request, res: Response) => {
    const { queryString } = req.query;

    if (typeof queryString !== 'string' || !queryString.trim()) {
        return res.status(400).send({
            error: 'Query string is required and must be a non-empty string',
        });
    }

    try {
        const response = await fetchPdlAdresseSok(queryString);

        if ('error' in response) {
            return res
                .status(response.statusCode)
                .send({ error: response.message });
        }

        return res.status(200).send(toAdresseResponse(response));
    } catch (e) {
        console.error('Unexpected error in adresse search handler:', e);
        return res.status(500).send({
            error: 'Internal server error',
        });
    }
};
