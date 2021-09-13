import { v4 as uuid } from 'uuid';
import Cache from 'node-cache';
import { ErrorResponse, fetchJson } from './fetch-utils.js';

const tpswsAdressesokApi = process.env.TPS_ADRESSESOK_API;

const oneHour = 3600;

const cache = new Cache({
    stdTTL: oneHour,
});

export type AdresseDataList = {
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

type TpsPostnrSokResponse = {
    error: undefined;
    adresseDataList: AdresseDataList[];
};

const generateTpsHeaders = () => ({
    'Nav-Consumer-Id': 'nav-office-search-api',
    'Nav-Call-Id': uuid(),
});

export const fetchTpsAdresseSok = async (
    postnr: string,
    adresse?: string
): Promise<TpsPostnrSokResponse | ErrorResponse> => {
    if (!adresse && cache.has(postnr)) {
        return cache.get(postnr) as TpsPostnrSokResponse;
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
