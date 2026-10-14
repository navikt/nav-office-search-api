import { fetchJson, OkResponse } from './helpers/fetch.js';
import {
    recordNorgRefreshFailure,
    recordNorgRefreshSuccess,
} from './metrics.js';

const norgEnhetApi = process.env.NORG_ENHET_API;
const norgNavkontorerApi = `${process.env.NORG_ENHET_API}/navkontorer`;

type GeoIdToEnhetMap = {
    [geoId: string]: NorgEnhetSimple;
};

type NorgEnhet = {
    aktiveringsdato: string;
    antallRessurser: number;
    enhetId: number;
    enhetNr: string;
    kanalstrategi: string;
    navn: string;
    nedleggelsesdato: string;
    oppgavebehandler: boolean;
    orgNivaa: string;
    orgNrTilKommunaltNavKontor: string;
    organisasjonsnummer: string;
    sosialeTjenester: string;
    status: string;
    type: string;
    underAvviklingDato: string;
    underEtableringDato: string;
    versjon: number;
};

type NorgEnhetSimple = Pick<NorgEnhet, 'enhetNr' | 'navn'>;

type NorgEnhetResponse = NorgEnhet[] & OkResponse;

type NorgNavkontorerResponse = {
    navKontorId: number;
    geografiskOmraade: string;
    enhetId: number;
    alternativEnhetId: number;
}[] &
    OkResponse;

const simplifyNorgEnhet = (norgEnhet: NorgEnhet): NorgEnhetSimple => ({
    enhetNr: norgEnhet.enhetNr,
    navn: norgEnhet.navn,
});

let geoIdToEnhetMap: GeoIdToEnhetMap = {};

export const getOfficeData = (geoId: string) => geoIdToEnhetMap[geoId];

// Load office info from norg and refresh the office info map
export const loadNorgOfficeInfo = async () => {
    try {
        console.log('Loading office data from norg...');

        const enhetResponse = await fetchJson<NorgEnhetResponse>(norgEnhetApi, {
            enhetStatusListe: 'AKTIV',
        });

        if (enhetResponse.error) {
            console.error(
                `Fetch error from norg enhet: ${enhetResponse.message}`
            );
            recordNorgRefreshFailure();
            return false;
        }

        const newEnhetMap: GeoIdToEnhetMap = {};
        let failedOffices = 0;

        const lokalEnheter = enhetResponse.filter(
            (item) => item.type === 'LOKAL'
        );

        for (const enhet of lokalEnheter) {
            const kontorerResponse = await fetchJson<NorgNavkontorerResponse>(
                `${norgNavkontorerApi}/${enhet.enhetNr}`
            );

            if (kontorerResponse.error) {
                failedOffices++;
                // Reuse the previous data if fetching new data failed
                Object.entries(geoIdToEnhetMap).forEach(
                    ([geoId, prevEnhet]) => {
                        if (prevEnhet.enhetNr === enhet.enhetNr) {
                            newEnhetMap[geoId] = prevEnhet;
                        }
                    }
                );

                console.error(
                    `Fetch error from norg navkontorer: ${kontorerResponse.message}`
                );
            } else {
                const enhetSimple = simplifyNorgEnhet(enhet);

                kontorerResponse.forEach((item) => {
                    newEnhetMap[item.geografiskOmraade] = enhetSimple;
                });
            }
        }

        geoIdToEnhetMap = newEnhetMap;

        const geoIdsLoaded = Object.keys(geoIdToEnhetMap).length;
        recordNorgRefreshSuccess(geoIdsLoaded, failedOffices);

        console.log(
            `Finished loading office data! Offices for ${geoIdsLoaded} geoids loaded.`
        );
        return true;
    } catch (error) {
        console.error('Error loading office data:', error);
        recordNorgRefreshFailure();
        return false;
    }
};
