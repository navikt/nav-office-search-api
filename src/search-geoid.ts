import { Response } from 'express';
import { fetchOfficeInfoAndTransformResult } from './fetch.js';

export const responseFromGeoIdSearch = async (res: Response, ids: any) => {
    try {
        const parsedIds = JSON.parse(ids);

        if (!Array.isArray(parsedIds)) {
            return res
                .status(400)
                .send('Invalid request - "ids" must be a string array');
        }

        const hits = [];

        for (const id of parsedIds) {
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
    } catch (e) {
        return res
            .status(500)
            .send(`An error occured while handling the request: ${e}`);
    }
};
