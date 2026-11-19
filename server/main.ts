import { serve } from '@navikt/navno-server';
import { createApp } from './app.ts';
import { hasReferenceData, refreshData } from './data/data.ts';
import { env } from './env.ts';
import { loadNorgOfficeInfo } from './offices/offices.ts';
import { everyMorning } from './schedule.ts';

let officesLoaded = false;

const refreshOfficeData = async () => {
	if (await loadNorgOfficeInfo()) {
		officesLoaded = true;
	}
};

// Ready once both loads have succeeded: the office map /geoid reads, and the reference data /search reads. A pod
// that has neither yet gets no traffic, and keeps trying.
const app = createApp(() => officesLoaded && hasReferenceData());

// Both loads now, and again every morning
void refreshOfficeData();
void refreshData();
const jobs = [everyMorning(refreshOfficeData), everyMorning(refreshData)];

// Logs the port, and has the team's keep-alive and shutdown on SIGTERM and SIGINT
serve(app, { port: env.PORT, overrideGlobalObjects: false, onShutdown: () => jobs.forEach((job) => job.stop()) });
