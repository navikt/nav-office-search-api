import express from 'express';
import dotenv from 'dotenv';
import { v4 as uuid } from 'uuid';
import { fetchJson } from './fetch.js';
import fs from 'fs';
import csv from 'csv-parser';

dotenv.config();

// TODO: rydd/refactor

// TODO: konverter alt til a-z
const sanitizeText = (text) => {
    return text.toLowerCase();
};

const bydelerData = [];
fs.createReadStream('src/data/bydeler.csv')
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

const kommunerData = [];
fs.createReadStream('src/data/kommuner.csv')
    .pipe(csv({ separator: ';' }))
    .on('data', (data) =>
        kommunerData.push({
            code: data.code,
            name: sanitizeText(data.name),
        })
    )
    .on('end', () => console.log('Finished loading kommuner'));

const app = express();
const appPort = 3003;
const appName = 'nav-office-search-api';

// TODO: sett env-vars for disse for dev/prod
const norg2NavkontorApi = 'https://app-q0.adeo.no/norg2/api/v1/enhet/navkontor';
const tpswsAdressesokApi =
    'https://app-q0.adeo.no/tpsws-aura/api/v1/adressesoek';

// TODO: ta i bruk for søk på poststed
const bringPostnrRegister = 'https://www.bring.no/postnummerregister-ansi.txt';

const generateTpswsHeaders = () => ({
    'Nav-Consumer-Id': appName,
    'Nav-Call-Id': uuid(),
});

const filterDuplicates = (array) => [...new Set(array)];

const fetchOfficesFromGeografiskTilknytning = async (
    geografiskTilknytningArray
) => {
    return await geografiskTilknytningArray.reduce(async (acc, gtNumber) => {
        const norg2Res = await fetchJson(`${norg2NavkontorApi}/${gtNumber}`);

        if (norg2Res.error) {
            console.error(norg2Res.message);
            return acc;
        }

        return [...acc, norg2Res];
    }, []);
};

const tpswsAdresseSokFetch = async (params) =>
    await fetchJson(tpswsAdressesokApi, params, generateTpswsHeaders());

const resultFromPostnr = async (res, postnr) => {
    const apiRes = await tpswsAdresseSokFetch({
        soketype: 'L',
        postnr: postnr,
    });

    if (apiRes.error) {
        console.error(apiRes.message);
        return res.status(apiRes.statusCode).send(apiRes.message);
    }

    const { adresseDataList } = apiRes;

    if (adresseDataList) {
        const geografiskTilknytningNumbers = filterDuplicates(
            adresseDataList.map((item) => item.geografiskTilknytning)
        );
        const offices = await fetchOfficesFromGeografiskTilknytning(
            geografiskTilknytningNumbers
        );
        return res.status(200).send(offices);
    }

    return res.status(200).send([]);
};

const filterDataAndGetCodesFromNameSearch = (dataArray, name) =>
    dataArray.reduce(
        (acc, item) => (item.name.includes(name) ? [...acc, item.code] : acc),
        []
    );

const resultFromText = async (res, text) => {
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

    const offices = fetchOfficesFromGeografiskTilknytning([
        ...bydelerHits,
        ...kommunerHits,
    ]);

    return res.status(200).send(offices);
};

app.get('/api', async (req, res) => {
    const { postnr, text } = req.query;

    if (postnr) {
        return resultFromPostnr(res, postnr);
    }

    if (text) {
        return resultFromText(res, text);
    }

    return res
        .status(400)
        .send("Invalid request - 'postnr' or 'text' parameter required");
});

app.get('/internal/isAlive', (req, res) => {
    return res.status(200).send('Ok!');
});

app.get('/internal/isReady', (req, res) => {
    return res.status(200).send('Ok!');
});

const server = app.listen(appPort, () => {
    console.log(`Server starting on port ${appPort}`);
});

const shutdown = () => {
    console.log('Server shutting down');

    server.close(() => {
        console.log('Shutdown complete!');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
