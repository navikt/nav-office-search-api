import express from 'express';
import { validateAndHandleRequest } from './auth.js';
import { responseFromPostnrSearch } from './search-postnr.js';
import { responseFromGeoIdSearch } from './search-geoid.js';

const app = express();
const appPort = 3003;

app.get('/geoid', async (req, res) =>
    validateAndHandleRequest(req, res, () => {
        const { id } = req.query;

        if (typeof id !== 'string') {
            return res
                .status(400)
                .send("Invalid request - 'id' parameter is required");
        }

        return responseFromGeoIdSearch(res, id);
    })
);

app.get('/postnr', async (req, res) => {
    validateAndHandleRequest(req, res, () => {
        const { postnr, adresse } = req.query;

        if (typeof postnr !== 'string') {
            return res
                .status(400)
                .send("Invalid request - 'postnr' parameter is required");
        }

        return responseFromPostnrSearch(
            res,
            postnr,
            typeof adresse === 'string' ? adresse : undefined
        );
    });
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
