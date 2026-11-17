import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	type BydelerFile,
	bydelerFile,
	checked,
	filesDir,
	type PostnrRegisterFile,
	postnrRegisterFile,
} from '#server/data/files.ts';
import { fetchPostnrRegister } from './bring.ts';
import { fetchBydeler } from './ssb.ts';

// Fewer than this isn't the whole register or the whole list. About half of what they held in November 2026, which
// was 5,112 rows and 38 bydeler.
const floors = { rows: 2500, bydeler: 15 };

const atLeast = (floor: number, count: number, what: string) => {
	if (count < floor) {
		throw new Error(`Too few ${what}: ${count}, where at least ${floor} are expected`);
	}
};

const write = (dir: string, name: string, content: unknown) =>
	writeFile(join(dir, name), `${JSON.stringify(content, null, '\t')}\n`);

// Downloads Bring's register and SSB's bydeler, and writes them where the server reads them. When one of them can't
// be downloaded, or isn't what it should be, this rejects and writes neither.
export const download = async (dir = filesDir) => {
	const fetchedAt = new Date().toISOString();
	const [register, ssb] = await Promise.all([fetchPostnrRegister(), fetchBydeler()]);

	atLeast(floors.rows, register.rows.length, "rows in Bring's register");
	atLeast(floors.bydeler, ssb.bydeler.length, 'bydeler from SSB');

	const postnrRegister: PostnrRegisterFile = checked(postnrRegisterFile, { fetchedAt, ...register });
	const bydeler: BydelerFile = checked(bydelerFile, { fetchedAt, ...ssb });

	await mkdir(dir, { recursive: true });
	await Promise.all([write(dir, postnrRegisterFile.name, postnrRegister), write(dir, bydelerFile.name, bydeler)]);

	return { postnrRegister, bydeler };
};
