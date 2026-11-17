import { serve } from '@hono/node-server';
import { logger } from '@navikt/navno-logger';
import type { Cron } from 'croner';
import { createApp } from './app.ts';
import { refreshData } from './data/data.ts';
import { env } from './env.ts';
import { loadNorgOfficeInfo } from './offices/offices.ts';
import { everyMorning } from './schedule.ts';

const appPort = env.PORT;

let isReady = false;
const app = createApp(() => isReady);

const jobs: Cron[] = [];

const refreshOfficeData = async () => {
	if (await loadNorgOfficeInfo()) {
		isReady = true;
	}
};

const server = serve({ fetch: app.fetch, port: appPort, overrideGlobalObjects: false }, () => {
	void refreshOfficeData();
	jobs.push(everyMorning(refreshOfficeData));

	// The reference data for the search. No endpoint reads it yet, and none of them waits for it.
	void refreshData();
	jobs.push(everyMorning(refreshData));

	logger.info('Server listening', { port: appPort });
});

const shutdown = () => {
	logger.info('Server shutting down');
	jobs.forEach((job) => job.stop());

	server.close(() => {
		logger.info('Shutdown complete!');
		process.exit(0);
	});
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
