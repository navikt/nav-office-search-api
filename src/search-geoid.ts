import { Response } from 'express';
import { fetchOfficeInfoAndTransformResult } from './fetch.js';

export const responseFromGeoIdSearch = async (res: Response, id: string) => {
    const officeInfo = await fetchOfficeInfoAndTransformResult(id);

    if (officeInfo) {
        return res.status(200).send(officeInfo);
    }

    return res.status(404).send({ message: `No office info found for ${id}` });
};
