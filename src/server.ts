import express from 'express';
import { responseFromPostnrSearch } from './search-postnr.js';
import { validateAndHandleRequest } from './auth.js';
import { responseFromGeoIdSearch } from './search-geoid.js';

const app = express();
const appPort = 3003;

// Look up office info from norg by one or more geographic ids ("geografisk tilknytning" aka kommunenr/bydelsnr)
app.get('/geoid', async (req, res) =>
    validateAndHandleRequest(req, res, () => {
        const { ids } = req.query;

        if (ids) {
            return responseFromGeoIdSearch(res, ids);
        }

        return res
            .status(400)
            .send("Invalid request - 'ids' parameter is required");
    })
);

// Looks up geo-ids covered by the requested postnr, and returns the office info from these ids
app.get('/postnr/:postnr', async (req, res) =>
    validateAndHandleRequest(req, res, () => {
        const { postnr } = req.params;

        if (postnr) {
            return responseFromPostnrSearch(res, postnr);
        }

        return res
            .status(400)
            .send("Invalid request - 'postnr' parameter is required");
    })
);

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
