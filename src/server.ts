import express from 'express';
import schedule from 'node-schedule';
import { validateAndHandleRequest } from './auth.js';
import { postnrSearchHandler } from './postnr-search-handler.js';
import { geoIdSearchHandler } from './geoid-search-handler.js';
import { loadNorgOfficeInfo } from './office-data.js';

const app = express();
const appPort = 3003;

app.get('/geoid', async (req, res) =>
    validateAndHandleRequest(req, res, geoIdSearchHandler)
);

app.get('/postnr', async (req, res) =>
    validateAndHandleRequest(req, res, postnrSearchHandler)
);

app.get('/internal/isAlive', (req, res) => {
    return res.status(200).send('I am alive!');
});

app.get('/internal/isReady', (req, res) => {
    return res.status(200).send('I am ready!');
});

const server = app.listen(appPort, async () => {
    await loadNorgOfficeInfo();
    schedule.scheduleJob({ hour: 5, minute: 0, second: 0 }, loadNorgOfficeInfo);

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
