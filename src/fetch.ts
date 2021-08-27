import fetch, { HeadersInit } from 'node-fetch';
import Cache from 'node-cache';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import HttpsProxyAgent from 'https-proxy-agent';
import { SearchHit } from './utils.js';

const norg2NavkontorApi = process.env.NORG_NAVKONTOR_API as string;
const tpswsAdressesokApi = process.env.TPS_ADRESSESOK_API as string;

const bringPostnrRegisterUrl =
    'https://www.bring.no/postnummerregister-ansi.txt';

const norgCache = new Cache({
    stdTTL: 3600,
});

// @ts-ignore
const proxyAgent = new HttpsProxyAgent(process.env.HTTPS_PROXY as string);

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

export type FetchOfficeInfoProps = { geografiskNr: string; hitString: string };

type TpsPostnrSokResponse = {
    error: undefined;
    adresseDataList: AdresseDataList[];
};

type NorgNavkontorResponse = {
    error: undefined;
    enhetId: number;
    navn: string;
    enhetNr: string;
    antallRessurser: number;
    status: string;
    orgNivaa: string;
    type: string;
    organisasjonsnummer: string;
    underEtableringDato: string;
    aktiveringsdato: string;
    underAvviklingDato: string;
    nedleggelsesdato: string;
    oppgavebehandler: boolean;
    versjon: number;
    sosialeTjenester: string;
    kanalstrategi: string;
    orgNrTilKommunaltNavKontor: string;
};

type ErrorResponse = {
    error: true;
    statusCode: number;
    message: string;
};

const errorResponse = (
    code: number,
    message: string,
    url: string
): ErrorResponse => ({
    error: true,
    statusCode: code,
    message: `Error ${code} fetching JSON from ${url} - ${message}`,
});

const generateTpsHeaders = () => ({
    'Nav-Consumer-Id': 'nav-office-search-api',
    'Nav-Call-Id': uuid(),
});

const objectToQueryString = (params: object) =>
    Object.entries(params).reduce(
        (acc, [k, v], i) =>
            v !== undefined
                ? `${acc}${i ? '&' : '?'}${k}=${encodeURIComponent(
                      typeof v === 'object' ? JSON.stringify(v) : v
                  )}`
                : acc,
        ''
    );

export const fetchJson = async (
    apiUrl: string,
    params?: object,
    headers?: HeadersInit
) => {
    const url = `${apiUrl}${params ? objectToQueryString(params) : ''}`;

    try {
        const res = await fetch(url, {
            headers: headers,
        });

        const isJson = res.headers
            ?.get('content-type')
            ?.includes?.('application/json');

        if (res.ok && isJson) {
            return res.json();
        }

        if (res.ok) {
            return errorResponse(500, 'Did not receive a JSON-response', url);
        }

        const errorMsg = (await res.json()).message || res.statusText;

        return errorResponse(res.status, errorMsg, url);
    } catch (e) {
        return errorResponse(500, e.toString(), url);
    }
};

export const fetchTpsPostnrSok = async (
    postnr: string
): Promise<TpsPostnrSokResponse | ErrorResponse> => {
    return await fetchJson(
        tpswsAdressesokApi,
        {
            soketype: 'L',
            postnr: postnr,
        },
        generateTpsHeaders()
    );
};

const fetchNorgNavkontor = async (
    geografiskNr: string
): Promise<NorgNavkontorResponse | ErrorResponse> => {
    if (norgCache.has(geografiskNr)) {
        return norgCache.get(geografiskNr) as NorgNavkontorResponse;
    }

    const response = await fetchJson(`${norg2NavkontorApi}/${geografiskNr}`);

    if (response.error) {
        return response;
    }

    norgCache.set(geografiskNr, response);

    return response;
};

export const fetchOfficeInfoAndTransformResult = async ({
    geografiskNr,
    hitString,
}: FetchOfficeInfoProps): Promise<SearchHit | null> => {
    const officeInfoRaw = await fetchNorgNavkontor(geografiskNr);

    if (officeInfoRaw.error) {
        console.error(`Error fetching office info: ${officeInfoRaw.message}`);
        return null;
    }

    return {
        kontorNavn: officeInfoRaw.navn,
        enhetNr: officeInfoRaw.enhetNr,
        status: officeInfoRaw.status,
        hitString: hitString,
    };
};

export const fetchPostnrRegister = async (): Promise<string> => {
    try {
        return await fetch(bringPostnrRegisterUrl, { agent: proxyAgent }).then(
            (res) => {
                if (res.ok) {
                    return res.text();
                }

                throw new Error(
                    `Error fetching postnr register: ${res.status} - ${res.statusText}`
                );
            }
        );
    } catch (e) {
        console.error(`Error fetching postnr register: ${e}`);
        return fs.readFileSync('./data/postnummerregister-ansi.txt', {
            encoding: 'latin1',
        });
    }
};
