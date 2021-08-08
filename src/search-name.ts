import { Response } from 'express';
import { Bydel, getBydelerData, getPostStedArray, PostSted } from './data.js';
import { removeDuplicates, normalizeString, SearchHit } from './utils.js';
import { fetchOfficeInfoAndTransformResult } from './fetch.js';

const findBydeler = (term: string) => {
    return getBydelerData().filter((bydel) =>
        bydel.navnNormalized.includes(term)
    );
};

const findPoststeder = (term: string): PostSted[] => {
    const results = getPostStedArray().reduce(
        (acc, item) =>
            item.poststedNormalized.includes(term) ? [...acc, item] : acc,
        [] as PostSted[]
    );

    return removeDuplicates(
        results,
        (a: PostSted, b: PostSted) => a.kommunenr === b.kommunenr
    );
};

const generateResponseData = async (
    poststeder: PostSted[],
    bydeler: Bydel[]
): Promise<SearchHit[]> => {
    const responseData: SearchHit[] = [];
    const addIfNotNull = (officeInfo: SearchHit | null) =>
        officeInfo && responseData.push(officeInfo);

    for (const poststed of poststeder) {
        if (poststed.bydeler) {
            for (const bydel of poststed.bydeler) {
                addIfNotNull(
                    await fetchOfficeInfoAndTransformResult(
                        bydel.bydelsnr,
                        poststed.poststed
                    )
                );
            }
        } else {
            addIfNotNull(
                await fetchOfficeInfoAndTransformResult(
                    poststed.kommunenr,
                    poststed.poststed
                )
            );
        }
    }

    for (const bydel of bydeler) {
        addIfNotNull(
            await fetchOfficeInfoAndTransformResult(bydel.bydelsnr, bydel.navn)
        );
    }

    return responseData;
};

export const responseFromNameSearch = async (
    res: Response,
    searchTerm: string
) => {
    const normalizedTerm = normalizeString(searchTerm);

    const poststederHits = findPoststeder(normalizedTerm);

    const bydelerHits = findBydeler(normalizedTerm);

    const responseData = await generateResponseData(
        poststederHits,
        bydelerHits
    );

    return res.status(200).send(responseData);
};
