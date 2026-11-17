import type { PostnrRegisterRow } from './files.ts';
import { normalizeString } from './normalizeString.ts';
import type { Kommune, PostnrKategori, Poststed } from './types.ts';

// A poststed per row of the register, by postnummer, with its kommune's office. One in a kommune with bydeler has none
// here: its bydeler, and their offices, are looked up per search.
export const buildPoststeder = (register: PostnrRegisterRow[], kommuner: Kommune[]): Map<string, Poststed> => {
	const officeByKommunenr = new Map(kommuner.map(({ kommunenr, officeInfo }) => [kommunenr, officeInfo]));
	const poststeder = new Map<string, Poststed>();

	for (const { postnr, poststed, kommunenr, kommune, kategori } of register) {
		const officeInfo = officeByKommunenr.get(kommunenr);

		poststeder.set(postnr, {
			postnr,
			poststed,
			poststedNormalized: normalizeString(poststed),
			kommuneNavn: kommune,
			kommunenr,
			// One Bring adds later is passed on as it is
			kategori: kategori as PostnrKategori,
			officeInfo: officeInfo ? [officeInfo] : [],
		});
	}

	return poststeder;
};
