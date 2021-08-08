import { Response } from 'express';
import {
    GeografiskData,
    getBydelerData,
    getKommunerData,
    getPostNrData,
} from './data.js';
import { normalizeString } from './utils.js';
import { fetchOfficeInfo } from './fetch.js';

const filterDataAndGetCodesFromNameSearch = (
    dataArray: GeografiskData[],
    name: string
) =>
    dataArray.reduce((acc, item) => {
        if (item.name.includes(name)) {
            if (item.bydeler) {
                return [...acc, ...item.bydeler.map((bydel) => bydel.code)];
            }

            return [...acc, item.code];
        }

        return acc;
    }, [] as string[]);

export const responseFromNameSearch = async (
    res: Response,
    searchTerm: string
) => {
    const normalizedTerm = normalizeString(searchTerm);

    const bydelerHits = getBydelerData().filter((bydel) =>
        bydel.name.includes(normalizedTerm)
    );

    const poststederHits = Object.entries(getPostNrData()).filter(
        ([postnr, data]) => data.poststedNormalized.includes(normalizedTerm)
    );

    return res.status(200).send([...bydelerHits, ...poststederHits]);
};
