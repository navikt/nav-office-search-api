import { Response } from 'express';
import { fetchOfficeInfoAndTransformResult } from './fetch.js';

// Look up office info from norg by one or more geographic ids ("geografisk tilknytning" aka kommunenr/bydelsnr)
export const responseFromGeoIdSearch = async (res: Response, id: string) => {
    const officeInfo = await fetchOfficeInfoAndTransformResult(id);

    if (officeInfo) {
        return res.status(200).send(officeInfo);
    }

    return res.status(404).send({ message: `No office info found for ${id}` });
};
