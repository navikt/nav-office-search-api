import express, { Request, Response } from 'express';
import { responseFromPostnrSearch } from './search-postnr.js';
import { responseFromNameSearch } from './search-name.js';
import { loadData } from './data.js';
import { validateAndProcessRequest } from './auth.js';

const app = express();
const appPort = 3003;

let isReady = false;

const processRequest = (req: Request, res: Response) => {
    const { postnr, name } = req.query;

    if (typeof postnr === 'string') {
        return responseFromPostnrSearch(res, postnr);
    }

    if (typeof name === 'string') {
        return responseFromNameSearch(res, name);
    }

    return res
        .status(400)
        .send("Invalid request - 'postnr' or 'name' parameter is required");
};

app.get('/api', async (req, res) => {
    const { checkAuth } = req.query;

    if (checkAuth) {
        validateAndProcessRequest(req, res, processRequest);
    } else {
        return processRequest(req, res);
    }
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
    console.log(`JWKS URI: ${process.env.AZURE_OPENID_CONFIG_JWKS_URI}`);
    console.log(
        `Pre-authed apps: ${process.env.AZURE_APP_PRE_AUTHORIZED_APPS}`
    );
    console.log(`Tenant id: ${process.env.AZURE_APP_TENANT_ID}`);

    console.log(
        'Proxies:',
        process.env.HTTP_PROXY,
        process.env.HTTPS_PROXY,
        process.env.NO_PROXY
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
