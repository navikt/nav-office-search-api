import fetch, { HeadersInit } from 'node-fetch';
import Cache from 'node-cache';
import { v4 as uuid } from 'uuid';

// TODO: sett env-vars for disse for dev/prod
const norg2NavkontorApi = 'https://app-q0.adeo.no/norg2/api/v1/enhet/navkontor';
const tpswsAdressesokApi =
    'https://app-q0.adeo.no/tpsws-aura/api/v1/adressesoek';

const bringPostnrRegister = 'https://www.bring.no/postnummerregister-ansi.txt';

const oneDayInSeconds = 24 * 60 * 60;
const postnrRegisterCacheKey = 'postnrRegister';

const cache = new Cache({
    stdTTL: oneDayInSeconds,
});

type ErrorResponse = {
    error: true;
    statusCode: number;
    message: string;
};

const errorResponse = (code: number, message: string, url: string) => ({
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

type TpsPostnrSokResponse = {
    error: undefined;
    adresseDataList: { geografiskTilknytning: string }[];
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

export const fetchOfficesFromGeografiskTilknytning = async (
    geografiskTilknytningArray: string[]
) => {
    const officeInfo = [];

    for (const acc of geografiskTilknytningArray) {
        const gtNumber = geografiskTilknytningArray.indexOf(acc);
        const norg2Res = await fetchJson(`${norg2NavkontorApi}/${gtNumber}`);

        if (!norg2Res.error) {
            officeInfo.push(norg2Res);
        } else {
            console.error(norg2Res.message);
        }
    }

    return officeInfo;
};

export const fetchPostnrRegister = async () => {
    if (cache.has(postnrRegisterCacheKey)) {
        return cache.get(postnrRegisterCacheKey) as string;
    }

    const postnrRegisterData = await fetch(bringPostnrRegister).then((res) =>
        res.text()
    );
    cache.set(postnrRegisterCacheKey, postnrRegisterData);

    return postnrRegisterData;
};
