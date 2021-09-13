import { Request, Response } from 'express';
import Cache from 'node-cache';
import { v4 as uuid } from 'uuid';
import { removeDuplicates } from './utils.js';
import { ErrorResponse, fetchJson } from './fetch.js';

const tpswsAdressesokApi = process.env.TPS_ADRESSESOK_API;

const cache = new Cache({
    stdTTL: 3600,
});

type AdresseDataList = {
    kommunenummer: string;
    kommunenavn: string;
    adressenavn: string;
    husnummerFra: string;
    husnummerTil: string;
    postnummer: string;
    poststed: string;
    geografiskTilknytning: string;
    gatekode: string;
    bydel: string;
};

type TpsAdresseSokResponse = {
    error: undefined;
    adresseDataList: AdresseDataList[];
};

const generateTpsHeaders = () => ({
    'Nav-Consumer-Id': 'nav-office-search-api',
    'Nav-Call-Id': uuid(),
});

const fetchTpsAdresseSok = async (
    postnr: string,
    adresse?: string
): Promise<TpsAdresseSokResponse | ErrorResponse> => {
    if (!adresse && cache.has(postnr)) {
        return cache.get(postnr) as TpsAdresseSokResponse;
    }

    const response = await fetchJson(
        tpswsAdressesokApi,
        {
            soketype: 'L',
            alltidRetur: true,
            postnr: postnr,
            ...(adresse && { adresse }),
        },
        generateTpsHeaders()
    );

    if (response.error) {
        console.error(`Fetch error from tps adresse-sok: ${response.message}`);
    } else if (!adresse) {
        cache.set(postnr, response);
    }

    return response;
};

export const postnrSearchHandler = async (req: Request, res: Response) => {
    const { postnr, adresse } = req.query;

    if (typeof postnr !== 'string') {
        return res
            .status(400)
            .send("Invalid request - 'postnr' parameter is required");
    }

    const response = await fetchTpsAdresseSok(
        postnr,
        typeof adresse === 'string' ? adresse : undefined
    );

    if (response.error) {
        return res.status(response.statusCode).send(response);
    }

    const { adresseDataList } = response;

    if (adresseDataList) {
        const uniqueHits = removeDuplicates(
            adresseDataList,
            (a, b) => a.geografiskTilknytning === b.geografiskTilknytning
        );

        return res.status(200).send({ hits: uniqueHits });
    }

    return res.status(200).send({ hits: [] });
};
