import { Response } from 'express';
import { fetchOfficeInfo, fetchTpsPostnrSok } from './fetch.js';
import { filterDuplicates } from './utils.js';

export const responseFromPostnrSearch = async (
    res: Response,
    postnr: string
) => {
    const apiRes = await fetchTpsPostnrSok(postnr);

    if (apiRes.error) {
        console.error(apiRes.message);
        return res.status(apiRes.statusCode).send(apiRes.message);
    }

    const { adresseDataList } = apiRes;

    if (adresseDataList) {
        const geografiskTilknytningNumbers = filterDuplicates(
            adresseDataList.map((item) => item.geografiskTilknytning)
        );

        const offices = await fetchOfficeInfo(geografiskTilknytningNumbers);

        return res.status(200).send(offices);
    }

    return res.status(200).send([]);
};
