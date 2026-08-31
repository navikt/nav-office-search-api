import express, { Request, Response } from 'express';
import { adresseSearchHandler } from './handlers/adresse-search-handler.js';
import { bydelSearchHandler } from './handlers/bydel-search-handler.js';
import { geoIdSearchHandler } from './handlers/geoid-search-handler.js';

export const createReadinessHandler =
    (isReady: () => boolean) => (_req: Request, res: Response) => {
        if (!isReady()) {
            return res.status(503).send('I am not ready...');
        }

        return res.status(200).send('I am ready!');
    };

export const createApp = (isReady: () => boolean) => {
    const app = express();

    app.get('/geoid', async (req, res) => geoIdSearchHandler(req, res));
    app.get('/adresse', async (req, res) => adresseSearchHandler(req, res));
    app.get('/bydel', async (req, res) => bydelSearchHandler(req, res));

    app.get('/internal/isAlive', (_req, res) => {
        return res.status(200).send('I am alive!');
    });

    app.get('/internal/isReady', createReadinessHandler(isReady));

    return app;
};
