import { Request, Response } from 'express';
import Cache from 'node-cache';
import { v4 as uuid } from 'uuid';
import { ErrorResponse, fetchJson, OkResponse } from './fetch.js';

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
    adresseDataList: AdresseDataList[];
} & OkResponse;

const fetchTpsAdresseSok = async (
    postnr: string,
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

export const postnrSearchHandler = async (req: Request, res: Response) => {
    const { postnr, adresse, husnr } = req.query;

    if (typeof postnr !== 'string') {
        return res
            .status(400)
            .send("Invalid request - 'postnr' parameter is required");
    }

    const response = await fetchTpsAdresseSok(
        postnr,
        typeof husnr === 'string' ? husnr : undefined,
        typeof adresse === 'string' ? adresse : undefined
    );

    if (response.error) {
        console.log(`Fetch error from tps adresse-sok - ${response.message}`);
        return res
            .status(response.statusCode)
            .send({ message: response.message });
    }

    return res.status(200).send({ hits: response.adresseDataList || [] });
};
