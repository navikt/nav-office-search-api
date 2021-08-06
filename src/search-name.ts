import { Response } from 'express';
import { bydelerData, GeografiskData, kommunerData } from './data.js';
import { sanitizeText } from './utils.js';
import { fetchOfficesFromGeografiskTilknytning } from './fetch.js';

const filterDataAndGetCodesFromNameSearch = (
    dataArray: GeografiskData[],
    name: string
) =>
    dataArray.reduce(
        (acc, item) => (item.name.includes(name) ? [...acc, item.code] : acc),
        [] as string[]
    );

export const responseFromNameSearch = async (res: Response, text: string) => {
    const sanitizedText = sanitizeText(text);

    const bydelerHits = filterDataAndGetCodesFromNameSearch(
        bydelerData,
        sanitizedText
    );

    // TODO: håndter treff på kommuner med bydeler
    const kommunerHits = filterDataAndGetCodesFromNameSearch(
        kommunerData,
        sanitizedText
    );

    console.log(bydelerHits);
    console.log(kommunerHits);

    const offices = await fetchOfficesFromGeografiskTilknytning([
        ...bydelerHits,
        ...kommunerHits,
    ]);

    return res.status(200).send(offices);
};
