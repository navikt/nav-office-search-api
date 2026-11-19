import type { PostnrRegisterRow, SsbBydel } from './files.ts';
import type { Offices } from './offices.ts';
import type { Kommune, Poststed } from './types.ts';

const byNumber = (a: string, b: string) => a.localeCompare(b);

// Kommuner in the register that the load couldn't find an office for. They are left out of the kommuner entirely, so
// their postnr and name searches find nothing. Kommuner with bydeler count as found.
export const kommunerWithoutOffice = (register: PostnrRegisterRow[], kommuner: Kommune[]): string[] => {
	const loaded = new Set(kommuner.map(({ kommunenr }) => kommunenr));
	const inRegister = new Set(register.map(({ kommunenr }) => kommunenr));

	return [...inRegister].filter((kommunenr) => !loaded.has(kommunenr)).toSorted(byNumber);
};

// Poststeder without an office after the load. Poststeder in kommuner with bydeler are left out: their offices are
// only looked up per search.
export const poststederWithoutOffice = (poststeder: Iterable<Poststed>, kommuner: Kommune[]): string[] => {
	const withBydeler = new Set(kommuner.filter(({ bydeler }) => bydeler).map(({ kommunenr }) => kommunenr));

	return [...poststeder]
		.filter(({ kommunenr, officeInfo }) => officeInfo.length === 0 && !withBydeler.has(kommunenr))
		.map(({ postnr }) => postnr)
		.toSorted(byNumber);
};

// SSB's bydeler that the load couldn't find an office for
export const bydelerWithoutOffice = (ssbBydeler: SsbBydel[], offices: Offices): string[] =>
	ssbBydeler.map(({ code }) => code).filter((bydelsnr) => !offices.has(bydelsnr));
