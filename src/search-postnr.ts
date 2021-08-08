import { Response } from 'express';
import {
    AdresseDataList,
    fetchOfficeInfoAndTransformResult,
    fetchTpsPostnrSok,
} from './fetch.js';
import { removeDuplicates } from './utils.js';
import Cache from 'node-cache';

const cache = new Cache({
    stdTTL: 3600,
});

export const responseFromPostnrSearch = async (
    res: Response,
    postnr: string
) => {
    if (cache.has(postnr)) {
        return res.status(200).send(cache.get(postnr));
    }

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
            const officeInfo = await fetchOfficeInfoAndTransformResult({
                geografiskNr: adresse.geografiskTilknytning,
                hitString: adresse.poststed,
            });

            if (officeInfo) {
                offices.push(officeInfo);
            }
        }

        cache.set(postnr, offices);

        return res.status(200).send(offices);
    }

    return res.status(200).send([]);
};
