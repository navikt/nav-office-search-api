import type { PostnrRegisterRow } from './files.ts';
import { normalizeString } from './normalizeString.ts';
import type { Offices } from './offices.ts';
import type { Bydel, Kommune } from './types.ts';

// Jan Mayen (2211) has no office of its own and NORG doesn't map it, so it borrows whatever NORG says serves
// Svalbard (2100), today Nav Tromsø. Svalbard itself is mapped in NORG. This used to point both at Tromsø's
// kommunenr, which broke when Tromsø went from 5401 to 5501 in 2024.
const borrowsOfficeFrom = new Map([['2211', '2100']]);

// The register's kommuner, each with its bydeler or, when it has none, with its office. A kommune with neither is
// left out.
export const buildKommuner = (register: PostnrRegisterRow[], bydeler: Bydel[], offices: Offices): Kommune[] => {
	// A bydelsnr starts with its kommunenr
	const bydelerByKommunenr = Map.groupBy(bydeler, ({ bydelsnr }) => bydelsnr.slice(0, 4));
	const names = new Map(register.map(({ kommunenr, kommune }) => [kommunenr, kommune]));
	// By kommunenr: a name search that finds one office through several kommuner shows it under the first of them
	const byKommunenr = [...names].toSorted(([a], [b]) => a.localeCompare(b));

	return byKommunenr.flatMap(([kommunenr, kommuneNavn]): Kommune[] => {
		const kommune = { kommunenr, kommuneNavn, kommuneNavnNormalized: normalizeString(kommuneNavn) };

		// A kommune with bydeler has an office per bydel, not one of its own
		const bydelerInKommune = bydelerByKommunenr.get(kommunenr);
		if (bydelerInKommune) {
			return [{ ...kommune, bydeler: bydelerInKommune }];
		}

		const officeInfo = offices.get(borrowsOfficeFrom.get(kommunenr) ?? kommunenr);
		return officeInfo ? [{ ...kommune, officeInfo }] : [];
	});
};
