import { Response } from 'express';
import { fetchNorgNavkontor, OfficeInfoHit } from './fetch/norg-navkontor.js';

export const fetchOfficeInfoAndTransformResult = async (
    geografiskNr: string
): Promise<OfficeInfoHit | null> => {
    const officeInfoRaw = await fetchNorgNavkontor(geografiskNr);

    if (officeInfoRaw.error) {
        console.error(`Error fetching office info: ${officeInfoRaw.message}`);
        return null;
    }

    return {
        kontorNavn: officeInfoRaw.navn,
        enhetNr: officeInfoRaw.enhetNr,
        status: officeInfoRaw.status,
    };
};

// Look up office info from norg by one or more geographic ids ("geografisk tilknytning" aka kommunenr/bydelsnr)
export const responseFromGeoIdSearch = async (res: Response, id: string) => {
    const officeInfo = await fetchOfficeInfoAndTransformResult(id);

    if (officeInfo) {
        return res.status(200).send(officeInfo);
    }

    return res.status(404).send({ message: `No office info found for ${id}` });
};
