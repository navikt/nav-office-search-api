import { Response } from 'express';
import { bydelerData, GeografiskData, kommunerData } from './data.js';
import { sanitizeString } from './utils.js';
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

export const responseFromNameSearch = async (res: Response, text: string) => {
    const sanitizedText = sanitizeString(text);

    const kommunerHits = filterDataAndGetCodesFromNameSearch(
        kommunerData,
        sanitizedText
    );

    const bydelerHits = filterDataAndGetCodesFromNameSearch(
        bydelerData,
        sanitizedText
    );

    console.log(bydelerHits);
    console.log(kommunerHits);

    const offices = await fetchOfficeInfo([...bydelerHits, ...kommunerHits]);

    return res.status(200).send(offices);
};
