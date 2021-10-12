import { Request, Response } from 'express';
import Cache from 'node-cache';
import { ErrorResponse, fetchJson } from './fetch.js';

const norg2NavkontorApi = process.env.NORG_NAVKONTOR_API;

const cache = new Cache({
    stdTTL: 3600 * 24,
});

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

const fetchNorgNavkontor = async (
    geografiskNr: string
): Promise<NorgNavkontorResponse | ErrorResponse> => {
    if (cache.has(geografiskNr)) {
        return cache.get(geografiskNr) as NorgNavkontorResponse;
    }

    const response = await fetchJson(`${norg2NavkontorApi}/${geografiskNr}`);

    if (response.error) {
        console.error(`Fetch error from norg: ${response.message}`);
    } else {
        cache.set(geografiskNr, response);
    }

    return response;
};

// Look up office info from norg by one or more geographic ids ("geografisk tilknytning" aka kommunenr/bydelsnr)
export const geoIdSearchHandler = async (req: Request, res: Response) => {
    const { id } = req.query;

    if (typeof id !== 'string') {
        return res
            .status(400)
            .send("Invalid request - 'id' parameter is required");
    }

    const officeInfo = await fetchNorgNavkontor(id);

    if (officeInfo.error) {
        return res.status(officeInfo.statusCode).send({
            message: `No office info returned for ${id} - error: ${officeInfo.message}`,
        });
    }

    return res.status(200).send(officeInfo);
};
