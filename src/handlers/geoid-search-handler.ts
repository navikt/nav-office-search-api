import { Request, Response } from 'express';
import { getOfficeData } from '../norg-office-data.js';
import { recordLookup } from '../metrics.js';

export const geoIdSearchHandler = async (req: Request, res: Response) => {
    const { id } = req.query;

    if (typeof id !== 'string') {
        recordLookup('geoid', 'invalid');
        return res
            .status(400)
            .send("Invalid request - 'id' parameter is required");
    }

    const officeInfo = getOfficeData(id);

    if (!officeInfo) {
        recordLookup('geoid', 'empty');
        return res.status(404).send({
            message: `No office info found for geoid ${id}`,
        });
    }

    recordLookup('geoid', 'hits');
    return res.status(200).send(officeInfo);
};
