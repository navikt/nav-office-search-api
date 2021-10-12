import { fetchJson } from './fetch.js';

const norgEnhetApi = process.env.NORG_ENHET_API;
const norgNavkontorerApi = `${process.env.NORG_ENHET_API}/navkontorer`;

type OfficeInfoMap = {
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

type NorgEnhetResponse = NorgEnhetRaw[] & { error: undefined };

type NorgNavkontorerResponse = {
    navKontorId: number;
    geografiskOmraade: string;
    enhetId: number;
    alternativEnhetId: number;
}[] & { error: undefined };

const transformNorgEnhet = (norgEnhet: NorgEnhetRaw): NorgEnhetTransformed => ({
    enhetNr: norgEnhet.enhetNr,
    navn: norgEnhet.navn,
});

let geoIdToOfficeInfoMap: OfficeInfoMap = {};

export const getOfficeData = (geoId: string) => geoIdToOfficeInfoMap[geoId];

// Load office info from norg and refresh the office info map
export const loadNorgOfficeInfo = async () => {
    console.log('Loading office data from norg...');

    const enhetRespnse = await fetchJson<NorgEnhetResponse>(norgEnhetApi, {
        enhetStatusListe: 'AKTIV',
    });

    if (enhetRespnse.error) {
        console.error(`Fetch error from norg enhet: ${enhetRespnse.message}`);
        return enhetRespnse;
    }

    const lokalEnheter = enhetRespnse.filter((item) => item.type === 'LOKAL');

    const newOfficeInfoMap: OfficeInfoMap = {};

    for (const enhet of lokalEnheter) {
        const kontorerResponse = await fetchJson<NorgNavkontorerResponse>(
            `${norgNavkontorerApi}/${enhet.enhetNr}`
        );

        if (!kontorerResponse.error) {
            const enhetTransformed = transformNorgEnhet(enhet);

            kontorerResponse.forEach((item) => {
                newOfficeInfoMap[item.geografiskOmraade] = enhetTransformed;
            });
        } else {
            console.error(
                `Fetch error from norg navkontorer: ${kontorerResponse.message}`
            );
        }
    }

    geoIdToOfficeInfoMap = newOfficeInfoMap;

    console.log(
        `Finished loading office data! ${Object.keys(
            geoIdToOfficeInfoMap.length
        )} offices loaded.`
    );
};
