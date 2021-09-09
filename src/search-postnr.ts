import { Response } from 'express';
import { AdresseDataList, fetchTpsAdresseSok } from './fetch.js';
import { removeDuplicates } from './utils.js';
import Cache from 'node-cache';

const oneHour = 3600;

const cache = new Cache({
    stdTTL: oneHour,
});

export const responseFromPostnrSearch = async (
    res: Response,
    postnr: string,
    adresse?: string
) => {
    if (cache.has(postnr)) {
        return res.status(200).send({ hits: cache.get(postnr) });
    }

    const apiRes = await fetchTpsAdresseSok(postnr, adresse);

    if (apiRes.error) {
        console.error(apiRes.message);
        return res.status(apiRes.statusCode).send(apiRes);
    }

    const { adresseDataList } = apiRes;

    if (adresseDataList) {
        const adresseDataListFiltered = removeDuplicates(
            adresseDataList,
            (a: AdresseDataList, b: AdresseDataList) =>
                a.geografiskTilknytning === b.geografiskTilknytning
        );

        cache.set(postnr, adresseDataListFiltered);
        return res.status(200).send({ hits: adresseDataListFiltered });
    }

    return res.status(200).send({ hits: [] });
};
