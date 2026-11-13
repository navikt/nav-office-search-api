import express, { Request, Response } from 'express';
import { adresseSearchHandler } from './handlers/adresse-search-handler.js';
import { bydelSearchHandler } from './handlers/bydel-search-handler.js';
import { geoIdSearchHandler } from './handlers/geoid-search-handler.js';
import { metricsRegistry } from './metrics.js';

export const createReadinessHandler = (isReady: () => boolean) => (_req: Request, res: Response) => {
	if (!isReady()) {
		return res.status(503).send('I am not ready...');
	}

	return res.status(200).send('I am ready!');
};

export const createApp = (isReady: () => boolean) => {
	const app = express();

	// Express 4 doesn't catch a rejected handler, and an unhandled rejection
	// ends the process. Pass it on to Express, which answers 500.
	app.get('/geoid', (req, res, next) => {
		geoIdSearchHandler(req, res).catch(next);
	});
	app.get('/adresse', (req, res, next) => {
		adresseSearchHandler(req, res).catch(next);
	});
	app.get('/bydel', (req, res, next) => {
		bydelSearchHandler(req, res).catch(next);
	});

	app.get('/internal/isAlive', (_req, res) => {
		return res.status(200).send('I am alive!');
	});

	app.get('/internal/isReady', createReadinessHandler(isReady));

	app.get('/internal/metrics', async (_req, res) => {
		try {
			res.set('Content-Type', metricsRegistry.contentType);
			return res.send(await metricsRegistry.metrics());
		} catch (e) {
			console.error('Failed to collect metrics:', e);
			return res.status(500).send('Failed to collect metrics');
		}
	});

	return app;
};
