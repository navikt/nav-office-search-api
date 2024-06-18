import { fetchJson, OkResponse } from './fetch.js';

const norgEnhetApi = process.env.NORG_ENHET_API;
const norgNavkontorerApi = `${process.env.NORG_ENHET_API}/navkontorer`;

type GeoIdToEnhetMap = {
    [geoId: string]: NorgEnhetTransformed;
};

type NorgEnhetRaw = {
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

type NorgEnhetTransformed = Pick<NorgEnhetRaw, 'enhetNr' | 'navn'>;

type NorgEnhetResponse = NorgEnhetRaw[] & OkResponse;

type NorgNavkontorerResponse = {
    navKontorId: number;
    geografiskOmraade: string;
    enhetId: number;
    alternativEnhetId: number;
}[] &
    OkResponse;

const transformNorgEnhet = (norgEnhet: NorgEnhetRaw): NorgEnhetTransformed => ({
    enhetNr: norgEnhet.enhetNr,
    navn: norgEnhet.navn,
});

let geoIdToEnhetMap: GeoIdToEnhetMap = {};

export const getOfficeData = (geoId: string) => geoIdToEnhetMap[geoId];

// Load office info from norg and refresh the office info map
export const loadNorgOfficeInfo = async () => {
    console.log('Loading office data from norg...');

    const enhetResponse = await fetchJson<NorgEnhetResponse>(norgEnhetApi, {
        enhetStatusListe: 'AKTIV',
    });

    if (enhetResponse.error) {
        console.error(`Fetch error from norg enhet url: ${norgEnhetApi}: ${enhetResponse.message}`);
        return;
    }

    const newEnhetMap: GeoIdToEnhetMap = {};

    const lokalEnheter = enhetResponse.filter((item) => item.type === 'LOKAL');

    for (const enhet of lokalEnheter) {
        const kontorerResponse = await fetchJson<NorgNavkontorerResponse>(
            `${norgNavkontorerApi}/${enhet.enhetNr}`
        );

        if (kontorerResponse.error) {
            // Reuse the previous data if fetching new data failed
            Object.entries(geoIdToEnhetMap).forEach(([geoId, prevEnhet]) => {
                if (prevEnhet.enhetNr === enhet.enhetNr) {
                    newEnhetMap[geoId] = prevEnhet;
                }
            });

            console.error(
                `Fetch error from norg navkontorer: ${kontorerResponse.message}`
            );
        } else {
            const enhetTransformed = transformNorgEnhet(enhet);

            kontorerResponse.forEach((item) => {
                newEnhetMap[item.geografiskOmraade] = enhetTransformed;
            });
        }
    }

    geoIdToEnhetMap = newEnhetMap;

    console.log(
        `Finished loading office data! Offices for ${
            Object.keys(geoIdToEnhetMap).length
        } geoids loaded.`
    );
};
