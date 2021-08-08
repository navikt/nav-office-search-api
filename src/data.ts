import fs from 'fs';
import csv from 'csv-parser';
import { normalizeString } from './utils.js';
import { fetchPostnrRegister } from './fetch.js';
import Cache from 'node-cache';

export type GeografiskData = {
    code: string;
    name: string;
    bydeler?: GeografiskData[];
};

type PostNrRegisterItem = [
    postnr: string,
    poststed: string,
    kommunenr: string,
    kommune: string,
    kategori: 'B' | 'F' | 'G' | 'P' | 'S'
];

export type PostNrData = {
    [postnr: string]: {
        poststedNormalized: string;
        kommuneNormalized: string;
        poststed: string;
        kommunenr: string;
        kommune: string;
    };
};

const postnrRegisterCacheKey = 'postnrRegister';
const postNrDataCache = new Cache({
    stdTTL: 3600,
    deleteOnExpire: false,
});

const getBydelerFromKommune = (kommuneNr: string) =>
    bydelerData.filter((bydel) => bydel.code.startsWith(kommuneNr));

const transformPostnrRegisterData = (rawText: string): PostNrData => {
    const itemsRaw = rawText.split('\n');

    return itemsRaw.reduce((acc, itemRaw) => {
        const item = itemRaw.split('\t') as PostNrRegisterItem;
        const [postnr, poststed, kommunenr, kommune] = item;

        return {
            ...acc,
            [postnr]: {
                poststedNormalized: normalizeString(poststed),
                kommuneNormalized: normalizeString(kommune),
                poststed,
                kommunenr,
                kommune,
            },
        };
    }, {});
};

export const getPostNrData = (): PostNrData =>
    postNrDataCache.get(postnrRegisterCacheKey) as PostNrData;

export const getBydelerData = () => bydelerData;

export const getKommunerData = () => kommunerData;

const bydelerData: GeografiskData[] = [];

const kommunerData: GeografiskData[] = [];

const loadPostnrData = async () => {
    const result = await fetchPostnrRegister().then(
        transformPostnrRegisterData
    );

    postNrDataCache.set(postnrRegisterCacheKey, result);

    console.log('Finished loading postnr register');
};

const loadKommunerData = () => {
    fs.createReadStream('./data/kommuner.csv', { encoding: 'latin1' })
        .pipe(csv({ separator: ';' }))
        .on('data', (data) => {
            const bydeler = getBydelerFromKommune(data.code);

            kommunerData.push({
                code: data.code,
                name: normalizeString(data.name),
                ...(bydeler.length > 0 && { bydeler }),
            });
        })
        .on('end', () => {
            console.log('Finished loading kommuner');
        });
};

const loadBydelerAndKommunerData = () => {
    fs.createReadStream('./data/bydeler.csv', { encoding: 'latin1' })
        .pipe(csv({ separator: ';' }))
        .on('data', (data) => {
            if (data.name !== 'Uoppgitt') {
                bydelerData.push({
                    code: data.code,
                    name: normalizeString(data.name),
                });
            }
        })
        .on('end', () => {
            console.log('Finished loading bydeler');
            loadKommunerData();
        });
};

export const loadData = () => {
    loadBydelerAndKommunerData();
    loadPostnrData();
    postNrDataCache.on('expired', (key) => {
        if (key === postnrRegisterCacheKey) {
            loadPostnrData();
        }
    });
};
