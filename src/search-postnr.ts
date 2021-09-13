import { Response } from 'express';
import { fetchTpsAdresseSok } from './fetch.js';
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
    if (!adresse && cache.has(postnr)) {
        return res.status(200).send({ hits: cache.get(postnr) });
    }

    const adresseSokResponse = await fetchTpsAdresseSok(postnr, adresse);

    if (adresseSokResponse.error) {
        console.error(adresseSokResponse.message);
        return res
            .status(adresseSokResponse.statusCode)
            .send(adresseSokResponse);
    }

    const { adresseDataList } = adresseSokResponse;

    if (adresseDataList) {
        const uniqueHits = removeDuplicates(
            adresseDataList,
            (a, b) => a.geografiskTilknytning === b.geografiskTilknytning
        );

        if (!adresse) {
            cache.set(postnr, uniqueHits);
        }

        return res.status(200).send({ hits: uniqueHits });
    }

    return res.status(200).send({ hits: [] });
};
