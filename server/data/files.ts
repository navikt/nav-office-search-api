import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// The two files `pnpm build` downloads: Bring's register of every postnummer and SSB's list of bydeler. The build
// writes them here and the image carries them, since a pod can't reach Bring. Both sides use the shapes below.
export const filesDir = fileURLToPath(new URL('./files', import.meta.url));

const fourDigits = z.string().regex(/^\d{4}$/);

const postnrRegisterSchema = z.object({
	fetchedAt: z.iso.datetime(),
	// Lines of Bring's file that weren't rows, and were left out
	skippedLines: z.number().int().nonnegative(),
	rows: z.array(
		z.object({
			postnr: fourDigits,
			poststed: z.string().min(1),
			kommunenr: fourDigits,
			kommune: z.string().min(1),
			// B, F, G, P or S today. One Bring adds later doesn't make a row unreadable.
			kategori: z.string().min(1),
		})
	),
});

const bydelerSchema = z.object({
	fetchedAt: z.iso.datetime(),
	// The day the version of SSB's classification they are from became valid, e.g. 2020-01-01
	validFrom: z.iso.date(),
	// code is the bydelsnummer: the kommunenummer and two more digits
	bydeler: z.array(z.object({ code: z.string().regex(/^\d{6}$/), name: z.string().min(1) })),
});

export type PostnrRegisterFile = z.infer<typeof postnrRegisterSchema>;
export type PostnrRegisterRow = PostnrRegisterFile['rows'][number];
export type BydelerFile = z.infer<typeof bydelerSchema>;
export type SsbBydel = BydelerFile['bydeler'][number];

export const postnrRegisterFile = { name: 'postnrRegister.json', schema: postnrRegisterSchema };
export const bydelerFile = { name: 'bydeler.json', schema: bydelerSchema };

// The file's content if it has the shape, and otherwise an error that names the file and the first thing wrong with it
export const checked = <Schema extends z.ZodType>(file: { name: string; schema: Schema }, content: unknown) => {
	const parsed = file.schema.safeParse(content);
	if (!parsed.success) {
		const [{ path, message }] = parsed.error.issues;
		throw new Error(
			`${file.name} is not as expected at ${path.join('.') || 'the top'}: ${message} (${parsed.error.issues.length} in all)`
		);
	}
	return parsed.data;
};

const read = async <Schema extends z.ZodType>(dir: string, file: { name: string; schema: Schema }) => {
	const text = await readFile(join(dir, file.name), 'utf8');
	try {
		return checked(file, JSON.parse(text));
	} catch (e) {
		// JSON.parse's own error doesn't say which file
		throw e instanceof SyntaxError ? new Error(`${file.name} is not JSON`, { cause: e }) : e;
	}
};

// Both files, checked. Rejects when one is missing or isn't what the build writes.
export const readFiles = async (dir = filesDir) => {
	const [postnrRegister, bydeler] = await Promise.all([read(dir, postnrRegisterFile), read(dir, bydelerFile)]);
	return { postnrRegister, bydeler };
};
