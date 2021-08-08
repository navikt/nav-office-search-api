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

export type Poststed = {
    postnr: string;
    poststedNormalized: string;
    poststed: string;
    kommunenr: string;
    bydeler?: Bydel[];
};

type BydelerMap = { [kommunenr: string]: Bydel[] };

type PostnrRegisterItem = [
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

const transformPostnrRegisterData = (rawText: string): Poststed[] => {
    const itemsRaw = rawText.split('\n');

    return itemsRaw.map((itemRaw) => {
        const item = itemRaw.split('\t') as PostnrRegisterItem;
        const [postnr, poststed, kommunenr] = item;
        const bydeler = kommunenrToBydelerMap[kommunenr];

        return {
            poststedNormalized: normalizeString(poststed),
            postnr,
            poststed,
            kommunenr,
            ...(bydeler && { bydeler }),
        };
    });
};

const bydelerData: Bydel[] = [];

const kommunenrToBydelerMap: BydelerMap = {};

const loadPostnrData = async () => {
    const result = await fetchPostnrRegister().then(
        transformPostnrRegisterData
    );

    postNrDataCache.set(postnrRegisterCacheKey, result);

    console.log('Loaded data from postnr register');
};

export const getPoststedData = (): Poststed[] =>
    postNrDataCache.get(postnrRegisterCacheKey) as Poststed[];

export const getBydelerData = (): Bydel[] => bydelerData;

export const loadData = (onFinish: () => void) => {
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
                if (!kommunenrToBydelerMap[kommunenr]) {
                    kommunenrToBydelerMap[kommunenr] = [];
                }

                bydelerData.push(bydel);
                kommunenrToBydelerMap[kommunenr].push(bydel);
            }
        })
        .on('end', () => {
            console.log('Loaded data for bydeler');
            loadPostnrData().then(() => onFinish());
        });

    postNrDataCache.on('expired', (key) => {
        if (key === postnrRegisterCacheKey) {
            loadPostnrData();
        }
    });
};
