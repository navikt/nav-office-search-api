import { logger } from '@navikt/navno-logger';
import { Cron } from 'croner';

// Runs a job every morning at 05:00 UTC, whatever the machine's time zone. A run that throws is logged, and the
// schedule keeps going. Stop the job on shutdown.
export const everyMorning = (job: () => void | Promise<void>) =>
	new Cron('0 0 5 * * *', { timezone: 'Etc/UTC', catch: (e) => logger.error('Scheduled job failed', e) }, job);
