import { logger } from '@navikt/navno-logger';
import type { Cron } from 'croner';
import { afterEach, expect, test, vi } from 'vitest';
import { everyMorning } from './schedule.ts';

let job: Cron | undefined;

afterEach(() => {
	job?.stop();
	vi.useRealTimers();
});

test("runs at 05:00 UTC, in summer as in winter, whatever the machine's time zone", () => {
	vi.stubEnv('TZ', 'Europe/Oslo');
	job = everyMorning(() => {});

	expect(job.nextRun(new Date('2026-11-14T04:59:59Z'))).toEqual(new Date('2026-11-14T05:00:00Z'));
	expect(job.nextRun(new Date('2026-11-14T05:00:00Z'))).toEqual(new Date('2026-11-15T05:00:00Z'));
	expect(job.nextRun(new Date('2026-07-01T04:00:00Z'))).toEqual(new Date('2026-07-01T05:00:00Z'));
});

test('runs the job then, and not before', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
	vi.setSystemTime(new Date('2026-11-14T04:59:59Z'));
	const run = vi.fn<() => void>();
	job = everyMorning(run);

	await vi.advanceTimersByTimeAsync(999);
	expect(run).not.toHaveBeenCalled();

	await vi.advanceTimersByTimeAsync(1);
	expect(run).toHaveBeenCalledTimes(1);
});

test('logs a run that throws, and keeps to the schedule', async () => {
	const error = vi.spyOn(logger, 'error');
	const failure = new Error('NORG is down');
	job = everyMorning(async () => {
		throw failure;
	});

	await job.trigger();

	expect(error.mock.calls).toEqual([['Scheduled job failed', failure]]);
	expect(job.isRunning()).toBe(true);
	expect(job.nextRun()).toBeInstanceOf(Date);
});
