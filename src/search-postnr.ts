import { Response } from 'express';
import {
    AdresseDataList,
    fetchOfficeInfoAndTransformResult,
    fetchTpsPostnrSok,
} from './fetch.js';
import { removeDuplicates } from './utils.js';

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
        const adresseDataListFiltered = removeDuplicates(
            adresseDataList,
            (a: AdresseDataList, b: AdresseDataList) =>
                a.geografiskTilknytning === b.geografiskTilknytning
        );

        const offices = [];

        for (const adresse of adresseDataListFiltered) {
            const officeInfo = await fetchOfficeInfoAndTransformResult(
                adresse.geografiskTilknytning,
                adresse.poststed
            );

            if (officeInfo) {
                offices.push(officeInfo);
            }
        }

        return res.status(200).send(offices);
    }

    return res.status(200).send([]);
};
