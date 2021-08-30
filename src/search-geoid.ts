import { Response } from 'express';
import { fetchOfficeInfoAndTransformResult } from './fetch.js';

export const responseFromGeoIdLookup = async (res: Response, ids: any) => {
    if (typeof ids === 'string') {
        const officeInfo = await fetchOfficeInfoAndTransformResult(ids);

        if (!officeInfo) {
            return res
                .status(404)
                .send('No office found for the requested geo-id');
        }

        return res.status(200).send(officeInfo);
    }

    if (Array.isArray(ids)) {
        const hits = [];

        for (const id of ids) {
            const officeInfo = await fetchOfficeInfoAndTransformResult(id);

            if (officeInfo) {
                hits.push(officeInfo);
            }
        }

        if (hits.length === 0) {
            return res
                .status(404)
                .send('No offices found for the requested geo-ids');
        }

        return res.status(200).send(hits);
    }

    return res
        .status(400)
        .send('Invalid request - "ids" must be a string or string array');
};
