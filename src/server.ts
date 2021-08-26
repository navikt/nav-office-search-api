import express from 'express';
import { responseFromPostnrSearch } from './search-postnr.js';
import { responseFromNameSearch } from './search-name.js';
import { loadData } from './data.js';
import { validateAuthorizationHeader } from './auth.js';

const app = express();
const appPort = 3003;

let isReady = false;

app.get('/api', async (req, res) => {
    const { postnr, name, checkAuth } = req.query;

    if (checkAuth) {
        const { authorization } = req.headers;

        if (!authorization) {
            return res.status(401).send('Authorization header required');
        }

        if (!(await validateAuthorizationHeader(authorization))) {
            return res
                .status(401)
                .send('Failed to validate authorization header');
        }
    }

    if (typeof postnr === 'string') {
        return responseFromPostnrSearch(res, postnr);
    }

    if (typeof name === 'string') {
        return responseFromNameSearch(res, name);
    }

    return res
        .status(400)
        .send("Invalid request - 'postnr' or 'name' parameter is required");
});

app.get('/internal/isAlive', (req, res) => {
    return res.status(200).send('Ok!');
});

app.get('/internal/isReady', (req, res) => {
    if (isReady) {
        return res.status(200).send('Ok!');
    }
    return res.status(503).send('Not ready');
});

const server = app.listen(appPort, () => {
    loadData(() => {
        isReady = true;
    });
    console.log(`Client id: ${process.env.AZURE_APP_CLIENT_ID}`);
    console.log(`JWKS URI: ${process.env.AZURE_APP_JWKS}`);
    console.log(
        `Pre-authed apps: ${process.env.AZURE_APP_PRE_AUTHORIZED_APPS}`
    );
    console.log(`Tenant id: ${process.env.AZURE_APP_TENANT_ID}`);
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
