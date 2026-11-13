import schedule from 'node-schedule';
import { createApp } from './app.ts';
import { env } from './env.ts';
import { loadNorgOfficeInfo } from './offices/offices.ts';

const appPort = env.PORT;

let isReady = false;
const app = createApp(() => isReady);

const refreshOfficeData = async () => {
	if (await loadNorgOfficeInfo()) {
		isReady = true;
	}
};

const server = app.listen(appPort, () => {
	void refreshOfficeData();
	schedule.scheduleJob({ hour: 5, minute: 0, second: 0 }, refreshOfficeData);

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
