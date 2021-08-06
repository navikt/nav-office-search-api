import express from 'express';
import dotenv from 'dotenv';
import { v4 as uuid } from 'uuid';
import { fetchJson } from './fetch.js';

dotenv.config();

const app = express();
const appPort = 3003;
const appName = 'nav-office-search-api';

const norg2NavkontorApi = 'https://app-q0.adeo.no/norg2/api/v1/enhet/navkontor';
const tpswsAdressesokApi =
    'https://app-q0.adeo.no/tpsws-aura/api/v1/adressesoek';

const generateTpswsHeaders = () => ({
    'Nav-Consumer-Id': appName,
    'Nav-Call-Id': uuid(),
});

const getUniqueAreaNumbers = (adresseDataList) => [
    ...new Set(adresseDataList.map((item) => item.geografiskTilknytning)),
];

const transformAdresseDataListToNavEnheter = async (adresseDataList) => {
    const areaNumbers = getUniqueAreaNumbers(adresseDataList);

    return await areaNumbers.map(
        async (areaNumber) =>
            await fetchJson(`${norg2NavkontorApi}/${areaNumber}`)
    );
};

const tpswsAdresseSokFetch = async (params) =>
    await fetchJson(tpswsAdressesokApi, params, generateTpswsHeaders());

const resultFromPostnr = async (res, postnr) => {
    const apiRes = await tpswsAdresseSokFetch({
        soketype: 'L',
        postnr: postnr,
    });
    console.log(apiRes);

    if (apiRes.error) {
        return res.status(apiRes.statusCode).send(apiRes.message);
    }

    const adresser = !!apiRes.adresseDataList
        ? await transformAdresseDataListToNavEnheter(apiRes.adresseDataList)
        : [];

    return res.status(200).send(adresser);
};

const resultFromAdresse = (adresse) => {
    return [];
};

app.get('/api', async (req, res) => {
    const { postnr, adresse } = req.query;

    if (postnr) {
        return resultFromPostnr(res, postnr);
    }

    if (adresse) {
        return res.status(200).send(resultFromAdresse(postnr));
    }

    return res
        .status(400)
        .send("Invalid request - 'postnr' or 'adresse' parameter required");
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
