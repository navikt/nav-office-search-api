import type { SsbBydel } from './files.ts';
import { normalizeString } from './normalizeString.ts';
import type { Offices } from './offices.ts';
import type { Bydel } from './types.ts';

// SSB's bydeler with their offices. A bydel without an office is left out.
export const buildBydeler = (ssbBydeler: SsbBydel[], offices: Offices): Bydel[] =>
	ssbBydeler.flatMap(({ code: bydelsnr, name }) => {
		const officeInfo = offices.get(bydelsnr);
		return officeInfo ? [{ bydelsnr, navn: name, navnNormalized: normalizeString(name), officeInfo }] : [];
	});
