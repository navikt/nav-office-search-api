import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '@navikt/navno-logger';
import { expect, onTestFinished, test, vi } from 'vitest';

// The report as the server runs it at start, with DATA_FILES_DIR as given
const reportFiles = async (dir: string) => {
	vi.stubEnv('DATA_FILES_DIR', dir);
	vi.resetModules();
	return (await import('./reportFiles.ts')).reportFiles();
};

test('says what the two files hold and when the build fetched them', async () => {
	const info = vi.spyOn(logger, 'info');

	await reportFiles('test/fixtures/files');

	expect(info.mock.calls).toEqual([
		[
			'Read the downloaded files',
			{
				postnr: 5,
				postnrSkippedLines: 0,
				postnrFetchedAt: '2026-11-17T04:17:00.000Z',
				bydeler: 2,
				bydelerValidFrom: '2020-01-01',
				bydelerFetchedAt: '2026-11-17T04:17:00.000Z',
			},
		],
	]);
});

test("logs that the files can't be read, and doesn't reject, since nothing depends on them yet", async () => {
	const error = vi.spyOn(logger, 'error');
	const dir = await mkdtemp(join(tmpdir(), 'files-'));
	onTestFinished(() => rm(dir, { recursive: true, force: true }));

	await expect(reportFiles(dir)).resolves.toBeUndefined();

	expect(error.mock.calls).toEqual([
		['Failed to read the downloaded files', expect.objectContaining({ code: 'ENOENT' })],
	]);
});
