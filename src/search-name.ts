import { Response } from 'express';
import { Bydel, getBydelerData, getPostStedArray, PostSted } from './data.js';
import { removeDuplicates, normalizeString, SearchHit } from './utils.js';
import {
    fetchOfficeInfoAndTransformResult,
    FetchOfficeInfoProps,
} from './fetch.js';

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
    const fetchProps: FetchOfficeInfoProps[] = [];

    for (const poststed of poststeder) {
        if (poststed.bydeler) {
            for (const bydel of poststed.bydeler) {
                fetchProps.push({
                    geografiskNr: bydel.bydelsnr,
                    hitString: poststed.poststed,
                });
            }
        } else {
            fetchProps.push({
                geografiskNr: poststed.kommunenr,
                hitString: poststed.poststed,
            });
        }
    }

    for (const bydel of bydeler) {
        fetchProps.push({
            geografiskNr: bydel.bydelsnr,
            hitString: bydel.navn,
        });
    }

    const fetchPropsUnique = removeDuplicates(
        fetchProps,
        (a: FetchOfficeInfoProps, b: FetchOfficeInfoProps) =>
            a.geografiskNr === b.geografiskNr
    );

    for (const props of fetchPropsUnique) {
        const officeInfo = await fetchOfficeInfoAndTransformResult(props);

        if (officeInfo) {
            responseData.push(officeInfo);
        }
    }

    return removeDuplicates(responseData);
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
