import express, { Request, Response } from 'express';
import { responseFromPostnrSearch } from './search-postnr.js';
import { validateAndProcessRequest } from './auth.js';

const app = express();
const appPort = 3003;

app.get('/postnr/:postnr', async (req, res) =>
    validateAndProcessRequest(req, res, (req: Request, res: Response) => {
        const { postnr } = req.params;

        if (postnr) {
            return responseFromPostnrSearch(res, postnr);
        }

        return res
            .status(400)
            .send("Invalid request - 'postnr' parameter is required");
    })
);

app.get('/officeInfo', async (req, res) =>
    validateAndProcessRequest(req, res, (req: Request, res: Response) => {
        const { ids } = req.query;

        if (typeof ids === 'string') {
        }

        if (Array.isArray(ids)) {
        }

        return res
            .status(400)
            .send("Invalid request - 'ids' parameter is required");
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
