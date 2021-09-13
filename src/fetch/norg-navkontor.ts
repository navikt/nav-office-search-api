import Cache from 'node-cache';
import { ErrorResponse, fetchJson } from './fetch-utils.js';

const norg2NavkontorApi = process.env.NORG_NAVKONTOR_API;

const norgCache = new Cache({
    stdTTL: 3600,
});

export type OfficeInfoHit = {
    kontorNavn: string;
    enhetNr: string;
    status: string;
    adressenavn?: string;
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

export const fetchNorgNavkontor = async (
    geografiskNr: string
): Promise<NorgNavkontorResponse | ErrorResponse> => {
    if (norgCache.has(geografiskNr)) {
        return norgCache.get(geografiskNr) as NorgNavkontorResponse;
    }

    const response = await fetchJson(`${norg2NavkontorApi}/${geografiskNr}`);

    if (response.error) {
        console.error(`Fetch error from norg: ${response.message}`);
    } else {
        norgCache.set(geografiskNr, response);
    }

    return response;
};
