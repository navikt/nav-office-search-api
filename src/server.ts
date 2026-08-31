import express from 'express';
import schedule from 'node-schedule';
import { adresseSearchHandler } from './handlers/adresse-search-handler.js';
import { bydelSearchHandler } from './handlers/bydel-search-handler.js';
import { geoIdSearchHandler } from './handlers/geoid-search-handler.js';
import { loadNorgOfficeInfo } from './norg-office-data.js';

const app = express();
const appPort = 3003;

let isReady = false;

const refreshOfficeData = async () => {
    if (await loadNorgOfficeInfo()) {
        isReady = true;
    }
};

app.get('/geoid', async (req, res) => geoIdSearchHandler(req, res));
app.get('/adresse', async (req, res) => adresseSearchHandler(req, res));
app.get('/bydel', async (req, res) => bydelSearchHandler(req, res));

app.get('/internal/isAlive', (_req, res) => {
    return res.status(200).send('I am alive!');
});

app.get('/internal/isReady', (_req, res) => {
    if (!isReady) {
        return res.status(503).send('I am not ready...');
    }

    return res.status(200).send('I am ready!');
});

const server = app.listen(appPort, () => {
    void refreshOfficeData();
    schedule.scheduleJob(
        { hour: 5, minute: 0, second: 0 },
        refreshOfficeData
    );

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
