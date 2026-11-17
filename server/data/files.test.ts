import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { filesDir, readFiles } from './files.ts';

const fixtures = 'test/fixtures/files';

// A directory with the fixtures' two files, one of them replaced
const filesWith = async (name: string, content: string) => {
	const dir = await mkdtemp(join(tmpdir(), 'files-'));
	onTestFinished(() => rm(dir, { recursive: true, force: true }));

	for (const file of ['postnrRegister.json', 'bydeler.json']) {
		await writeFile(join(dir, file), file === name ? content : await readFile(join(fixtures, file)));
	}
	return dir;
};

test('reads the two files', async () => {
	const { postnrRegister, bydeler } = await readFiles(fixtures);

	expect(postnrRegister.fetchedAt).toBe('2026-11-17T04:17:00.000Z');
	expect(postnrRegister.skippedLines).toBe(0);
	expect(postnrRegister.rows).toHaveLength(5136);
	expect(postnrRegister.rows[0]).toEqual({
		postnr: '0001',
		poststed: 'OSLO',
		kommunenr: '0301',
		kommune: 'OSLO',
		kategori: 'P',
	});
	expect(bydeler.fetchedAt).toBe('2026-11-17T04:17:00.000Z');
	expect(bydeler.validFrom).toBe('2020-01-01');
	expect(bydeler.bydeler).toHaveLength(38);
	expect(bydeler.bydeler[1]).toEqual({ code: '030102', name: 'Grünerløkka' });
});

test('reads them from server/data/files unless told otherwise: where the build writes and what the image copies', () => {
	expect(filesDir).toMatch(/[/\\]server[/\\]data[/\\]files$/);
});

test('rejects when a file is missing', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'files-'));
	onTestFinished(() => rm(dir, { recursive: true, force: true }));

	await expect(readFiles(dir)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('rejects when a file is not what the build writes, and says which file and where', async () => {
	const dir = await filesWith(
		'postnrRegister.json',
		JSON.stringify({
			fetchedAt: '2026-11-17T04:17:00.000Z',
			skippedLines: 0,
			rows: [{ postnr: '184', poststed: 'OSLO', kommunenr: '0301', kommune: 'OSLO', kategori: 'G' }],
		})
	);

	await expect(readFiles(dir)).rejects.toThrow('postnrRegister.json is not as expected at rows.0.postnr');
});

test('rejects when a file is not JSON, and says which file', async () => {
	const dir = await filesWith('bydeler.json', '<!doctype html>');

	await expect(readFiles(dir)).rejects.toThrow('bydeler.json is not JSON');
});
