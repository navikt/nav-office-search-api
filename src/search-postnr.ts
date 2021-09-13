import { Response } from 'express';
import { removeDuplicates } from './utils.js';
import { fetchTpsAdresseSok } from './fetch/tps-adresse-sok.js';

export const responseFromPostnrSearch = async (
    res: Response,
    postnr: string,
    adresse?: string
) => {
    const adresseSokResponse = await fetchTpsAdresseSok(postnr, adresse);

    if (adresseSokResponse.error) {
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

        return res.status(200).send({ hits: uniqueHits });
    }

    return res.status(200).send({ hits: [] });
};
