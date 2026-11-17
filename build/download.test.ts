import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isHttpError } from '@itsy/corgi';
import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import { readFiles } from '#server/data/files.ts';
import { installMockFetch } from '#test/fetch.ts';
import {
	bringRegister,
	bringRegisterUrl,
	ssbBydel,
	ssbClassification,
	ssbClassificationUrl,
	ssbVersion,
	ssbVersionUrl,
} from '#test/fixtures.ts';
import { download } from './download.ts';

const http = installMockFetch();

afterEach(() => {
	vi.useRealTimers();
});

const emptyDir = async () => {
	const dir = await mkdtemp(join(tmpdir(), 'download-'));
	onTestFinished(() => rm(dir, { recursive: true, force: true }));
	return dir;
};

// As many as the download asks for at least: 2,500 rows and 15 bydeler
const rows = (count = 2500) =>
	Array.from({ length: count }, (_, i) => [String(i).padStart(4, '0'), 'OSLO', '0301', 'OSLO', 'G']);
const bydeler = (count = 15) =>
	Array.from({ length: count }, (_, i) => ssbBydel(`0301${String(i + 1).padStart(2, '0')}`, `Bydel ${i + 1}`));

type Reply = Parameters<typeof http.get>[1];

const answer = ({
	register = bringRegister(rows()),
	items = bydeler(),
}: { register?: Reply; items?: ReturnType<typeof ssbBydel>[] } = {}) => {
	http.get(bringRegisterUrl, register);
	http.get(ssbClassificationUrl, { json: ssbClassification() });
	http.get(ssbVersionUrl(1168), { json: ssbVersion(items) });
};

test('writes the two files as the server reads them, in a directory it makes when needed', async () => {
	vi.useFakeTimers({ now: new Date('2026-11-17T04:17:00.000Z'), toFake: ['Date'] });
	answer();
	const dir = join(await emptyDir(), 'files');

	await download(dir);

	const files = await readFiles(dir);
	expect(files.postnrRegister).toEqual({
		fetchedAt: '2026-11-17T04:17:00.000Z',
		skippedLines: 0,
		rows: expect.any(Array),
	});
	expect(files.postnrRegister.rows).toHaveLength(2500);
	expect(files.postnrRegister.rows[1]).toEqual({
		postnr: '0001',
		poststed: 'OSLO',
		kommunenr: '0301',
		kommune: 'OSLO',
		kategori: 'G',
	});
	expect(files.bydeler).toEqual({
		fetchedAt: '2026-11-17T04:17:00.000Z',
		validFrom: '2020-01-01',
		bydeler: expect.any(Array),
	});
	expect(files.bydeler.bydeler).toHaveLength(15);
	expect(files.bydeler.bydeler[0]).toEqual({ code: '030101', name: 'Bydel 1' });
});

test("says how many of Bring's lines were not rows", async () => {
	answer({ register: bringRegister([...rows(), ['Sist oppdatert 1.10.2026']]) });
	const dir = await emptyDir();

	const { postnrRegister } = await download(dir);

	expect(postnrRegister.skippedLines).toBe(1);
	expect((await readFiles(dir)).postnrRegister.skippedLines).toBe(1);
});

test.each([
	['the register is too short', { register: bringRegister(rows(2499)) }, "Too few rows in Bring's register: 2499"],
	['the bydeler are too few', { items: bydeler(14) }, 'Too few bydeler from SSB: 14'],
	[
		'a bydel has no bydelsnummer',
		{ items: [...bydeler(), ssbBydel('0301', 'Oslo')] },
		'bydeler.json is not as expected at bydeler.15.code',
	],
])('rejects and writes neither file when %s', async (_, answers, message) => {
	answer(answers);
	const dir = await emptyDir();

	await expect(download(dir)).rejects.toThrow(message);

	expect(await readdir(dir)).toEqual([]);
});

test('rejects and writes neither file when a download fails', async () => {
	answer({ register: { status: 500, headers: { 'retry-after': '0.001' } } });
	const dir = await emptyDir();

	await expect(download(dir)).rejects.toSatisfy(isHttpError);

	expect(await readdir(dir)).toEqual([]);
});
