import fs from 'fs';
import csv from 'csv-parser';
import { sanitizeString } from './utils.js';
import { fetchPostnrRegister } from './fetch.js';

export type GeografiskData = {
    code: string;
    name: string;
    bydeler?: GeografiskData[];
};

export type PostStedData = {
    postnr: string;
    poststed: string;
    kommunenr: string;
    kommune: string;
    kategori: 'B' | 'F' | 'G' | 'P' | 'S';
};

export const getPostNrData = async (): Promise<PostStedData[]> =>
    await fetchPostnrRegister().then((text) => {
        const rows = text.split('\n');
        return rows.flatMap((row) => {
            const cols = row.split('\t');
            return {
                postnr: cols[0],
                poststed: cols[1],
                kommunenr: cols[2],
                kommune: cols[3],
                kategori: cols[4] as PostStedData['kategori'],
            };
        });
    });

export const bydelerData: GeografiskData[] = [];

export const kommunerData: GeografiskData[] = [];

const getBydelerFromKommune = (kommuneNr: string) =>
    bydelerData.filter((bydelNr) => bydelNr.code.startsWith(kommuneNr));

const loadKommunerData = () => {
    fs.createReadStream('./data/kommuner.csv')
        .pipe(csv({ separator: ';' }))
        .on('data', (data) => {
            const bydeler = getBydelerFromKommune(data.code);

            kommunerData.push({
                code: data.code,
                name: sanitizeString(data.name),
                ...(bydeler && { bydeler }),
            });
        })
        .on('end', () => {
            console.log('Finished loading kommuner');
        });
};

const loadBydelerData = () => {
    fs.createReadStream('./data/bydeler.csv')
        .pipe(csv({ separator: ';' }))
        .on('data', (data) => {
            if (data.name !== 'Uoppgitt') {
                bydelerData.push({
                    code: data.code,
                    name: sanitizeString(data.name),
                });
            }
        })
        .on('end', () => {
            console.log('Finished loading bydeler');
            loadKommunerData();
        });
};

loadBydelerData();
