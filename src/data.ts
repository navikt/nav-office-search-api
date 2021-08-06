import fs from 'fs';
import csv from 'csv-parser';
import { sanitizeText } from './utils.js';
import { fetchPostnrRegister } from './fetch.js';

// TODO: legg til caching på api-fetch fra norg2 og tpsws

export type GeografiskData = {
    code: string;
    name: string;
};

type PostStedData = {
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
fs.createReadStream('./data/bydeler.csv')
    .pipe(csv({ separator: ';' }))
    .on('data', (data) => {
        if (data.name !== 'Uoppgitt') {
            bydelerData.push({
                code: data.code,
                name: sanitizeText(data.name),
            });
        }
    })
    .on('end', () => console.log('Finished loading bydeler'));

export const kommunerData: GeografiskData[] = [];
fs.createReadStream('./data/kommuner.csv')
    .pipe(csv({ separator: ';' }))
    .on('data', (data) =>
        kommunerData.push({
            code: data.code,
            name: sanitizeText(data.name),
        })
    )
    .on('end', () => console.log('Finished loading kommuner'));