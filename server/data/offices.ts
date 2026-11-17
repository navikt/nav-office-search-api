import { schema } from '@itsy/corgi/schema';
import { logger } from '@navikt/navno-logger';
import { joinURL } from 'ufo';
import { z } from 'zod';
import { env } from '../env.ts';
import { upstreamClient } from '../upstream.ts';
import type { NorgOffices } from './norg.ts';
import type { OfficeInfo } from './types.ts';

const xpOfficeInfoApi = joinURL(env.XP_ORIGIN, '_/service/no.nav.navno/officeInfo');

// What is read of XP's answer. XP lists pages, and one that isn't an office's has no enhetNr, like the directorate's
// contact page.
const officeInfoSchema = z.looseObject({
	offices: z.array(z.looseObject({ enhetNr: z.string().optional(), path: z.string().optional() })),
});

const xp = upstreamClient('xp', { timeout: 30_000, headers: { accept: 'application/json' } });

// Each office's path on nav.no, by enhetNr
export type OfficePaths = Map<string, string>;

// Each kommune's and bydel's office with its page on nav.no, by kommunenr or bydelsnr. A Map, so an id like
// "constructor" finds nothing.
export type Offices = Map<string, OfficeInfo>;

// The office paths XP has now. A page without an enhetNr or a path is left out. Throws when XP can't tell.
export const fetchOfficePaths = async (): Promise<OfficePaths> => {
	const { offices } = await xp.get(xpOfficeInfoApi, { transform: schema(officeInfoSchema) });
	return new Map(offices.flatMap(({ enhetNr, path }) => (enhetNr && path ? [[enhetNr, path] as const] : [])));
};

// NORG's offices with their pages from XP. An office without a page is left out, so its areas have no office, like
// the areas NORG has none for. Those offices are logged, once.
export const joinOffices = (norgOffices: NorgOffices, officePaths: OfficePaths): Offices => {
	const offices: Offices = new Map();
	const withoutPage = new Set<string>();

	for (const [geoId, { enhetNr, navn }] of norgOffices) {
		const path = officePaths.get(enhetNr);
		if (path) {
			// Joined, so the page is on nav.no whatever XP's path starts with
			offices.set(geoId, { name: navn, url: joinURL(env.NAVNO_ORIGIN, path), geoId, enhetNr, hitString: '' });
		} else {
			withoutPage.add(enhetNr);
		}
	}

	if (withoutPage.size > 0) {
		logger.error('Offices without a page in XP', { count: withoutPage.size, enhetNr: [...withoutPage].slice(0, 20) });
	}

	return offices;
};
