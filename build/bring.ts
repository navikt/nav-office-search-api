import type { PostnrRegisterRow } from '#server/data/files.ts';
import { downloader } from './http.ts';

// Bring's register of every postnummer: a tab separated text file in windows-1252, at an address Bring keeps stable
// for programs that fetch it
export const postnrRegisterUrl = 'https://www.bring.no/postnummerregister-ansi.txt';

const bring = downloader();

const isFourDigits = (value: string) => /^\d{4}$/.test(value);

// The register's rows: postnr, poststed, kommunenr, kommune and kategori, tab separated. Blank lines, like the one the
// file ends with, aren't counted. A line that isn't a complete row is left out and counted. A kategori it doesn't
// know, or a column it doesn't read, doesn't make a row incomplete.
export const parsePostnrRegister = (text: string) => {
	const rows: PostnrRegisterRow[] = [];
	let skippedLines = 0;

	for (const line of text.split('\n')) {
		if (!line.trim()) {
			continue;
		}

		const [postnr = '', poststed = '', kommunenr = '', kommune = '', kategori = ''] = line.trim().split('\t');
		if (isFourDigits(postnr) && poststed && isFourDigits(kommunenr) && kommune && kategori) {
			rows.push({ postnr, poststed, kommunenr, kommune, kategori });
		} else {
			skippedLines++;
		}
	}

	return { rows, skippedLines };
};

// The register as Bring has it now. Rejects when Bring doesn't answer with it.
export const fetchPostnrRegister = async () => {
	const buffer = await bring.get(postnrRegisterUrl, { responseType: 'arrayBuffer' });
	return parsePostnrRegister(new TextDecoder('windows-1252').decode(buffer));
};
