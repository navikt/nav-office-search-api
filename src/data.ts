import fs from 'fs';
import csv from 'csv-parser';
import { normalizeString } from './utils.js';

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

const bydelerData: Bydel[] = [];

const kommunenrToBydelerMap: BydelerMap = {};

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
            onFinish();
        });
};
