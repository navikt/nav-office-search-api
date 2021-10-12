import { Request, Response } from 'express';
import { fetchJson } from './fetch.js';

const norgEnhetApi = process.env.NORG_ENHET_API;
const norgNavkontorerApi = `${process.env.NORG_ENHET_API}/navkontorer`;

type OfficeInfoMap = {
    [geoId: string]: NorgEnhetTransformed;
};

let officeInfoMap: OfficeInfoMap = {};

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

export const loadNorgOfficeData = async () => {
    console.log('Loading office data from norg...');

    const response = await fetchJson<NorgEnhetResponse>(norgEnhetApi, {
        enhetStatusListe: 'AKTIV',
    });

    if (response.error) {
        console.error(`Fetch error from norg enhet: ${response.message}`);
        return response;
    }

    const lokalEnheter = response.filter((item) => item.type === 'LOKAL');

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

    officeInfoMap = newOfficeInfoMap;

    console.log('Finished loading office data!');
};

// Look up office info from norg by one or more geographic ids ("geografisk tilknytning" aka kommunenr/bydelsnr)
export const geoIdSearchHandler = async (req: Request, res: Response) => {
    const { id } = req.query;

    if (typeof id !== 'string') {
        return res
            .status(400)
            .send("Invalid request - 'id' parameter is required");
    }

    const officeInfo = officeInfoMap[id];

    if (!officeInfo) {
        return res.status(404).send({
            message: `No office info found for geoid ${id}`,
        });
    }

    return res.status(200).send(officeInfo);
};
