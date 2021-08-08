import fs from 'fs';
import csv from 'csv-parser';
import { normalizeString } from './utils.js';
import { fetchPostnrRegister } from './fetch.js';
import Cache from 'node-cache';

export type Bydel = {
    bydelsnr: string;
    navn: string;
    navnNormalized: string;
};

export type BydelerMap = { [kommunenr: string]: Bydel[] };

export type PostSted = {
    postnr: string;
    poststedNormalized: string;
    poststed: string;
    kommunenr: string;
    bydeler?: Bydel[];
};

export type PostStedMap = {
    [postnr: string]: PostSted;
};

type PostNrRegisterItem = [
    postnr: string,
    poststed: string,
    kommunenr: string,
    kommune: string,
    kategori: 'B' | 'F' | 'G' | 'P' | 'S'
];

const postnrRegisterCacheKey = 'postnrRegister';
const postNrDataCache = new Cache({
    stdTTL: 3600,
    deleteOnExpire: false,
});

const transformPostnrRegisterData = (rawText: string): PostStedMap => {
    const itemsRaw = rawText.split('\n');

    return itemsRaw.reduce((acc, itemRaw) => {
        const item = itemRaw.split('\t') as PostNrRegisterItem;
        const [postnr, poststed, kommunenr] = item;
        const bydeler = kommuneNrToBydelerMap[kommunenr];

        return {
            ...acc,
            [postnr]: {
                poststedNormalized: normalizeString(poststed),
                postnr,
                poststed,
                kommunenr,
                ...(bydeler && { bydeler }),
            },
        };
    }, {});
};

const bydelerData: Bydel[] = [];

const kommuneNrToBydelerMap: BydelerMap = {};

const loadPostnrData = async () => {
    const result = await fetchPostnrRegister().then(
        transformPostnrRegisterData
    );

    postNrDataCache.set(postnrRegisterCacheKey, result);

    console.log('Finished loading postnr register');
};

const loadBydelerData = () => {
    fs.createReadStream('./data/bydeler.csv', { encoding: 'latin1' })
        .pipe(csv({ separator: ';' }))
        .on('data', (data) => {
            if (data.name !== 'Uoppgitt') {
                const bydel = {
                    bydelsnr: data.code,
                    navn: data.name,
                    navnNormalized: normalizeString(data.name),
                };

                const kommunenr = data.code.substr(0, 4);
                if (!kommuneNrToBydelerMap[kommunenr]) {
                    kommuneNrToBydelerMap[kommunenr] = [];
                }

                bydelerData.push(bydel);
                kommuneNrToBydelerMap[kommunenr].push(bydel);
            }
        })
        .on('end', () => {
            console.log('Finished loading bydeler');
            loadPostnrData();
        });
};

export const getPostStedMap = (): PostStedMap =>
    postNrDataCache.get(postnrRegisterCacheKey) as PostStedMap;

export const getPostStedArray = (): PostSted[] =>
    Object.values(postNrDataCache.get(postnrRegisterCacheKey) as PostStedMap);

export const getBydelerData = (): Bydel[] => bydelerData;

export const loadData = () => {
    loadBydelerData();

    postNrDataCache.on('expired', (key) => {
        if (key === postnrRegisterCacheKey) {
            loadPostnrData();
        }
    });
};
