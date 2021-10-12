import { Request, Response } from 'express';
import { getOfficeData } from './office-data.js';

export const geoIdSearchHandler = async (req: Request, res: Response) => {
    const { id } = req.query;

    if (typeof id !== 'string') {
        return res
            .status(400)
            .send("Invalid request - 'id' parameter is required");
    }

    const officeInfo = getOfficeData(id);

    if (!officeInfo) {
        return res.status(404).send({
            message: `No office info found for geoid ${id}`,
        });
    }

    return res.status(200).send(officeInfo);
};
