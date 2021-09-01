import { Response } from 'express';
import {
    AdresseDataList,
    fetchOfficeInfoAndTransformResult,
    fetchTpsAdresseSok,
} from './fetch.js';
import { removeDuplicates } from './utils.js';
import Cache from 'node-cache';

const cache = new Cache({
    stdTTL: 3600,
});

export const responseFromPostnrSearch = async (
    res: Response,
    postnr: string,
    adresse?: string
) => {
    // if (cache.has(postnr)) {
    //     return res.status(200).send({ hits: cache.get(postnr) });
    // }

    const apiRes = await fetchTpsAdresseSok(postnr, adresse);

    if (apiRes.error) {
        console.error(apiRes.message);
        return res.status(apiRes.statusCode).send(apiRes.message);
    }

    const { adresseDataList } = apiRes;

    const hits = [];

    if (adresseDataList) {
        const adresseDataListFiltered = removeDuplicates(
            adresseDataList,
            (a: AdresseDataList, b: AdresseDataList) =>
                a.geografiskTilknytning === b.geografiskTilknytning
        );

        for (const adresse of adresseDataListFiltered) {
            const officeInfo = await fetchOfficeInfoAndTransformResult(
                adresse.geografiskTilknytning
            );

            if (officeInfo) {
                hits.push(officeInfo);
            }
        }

        cache.set(postnr, hits);
    }

    return res.status(200).send({ hits });
};
