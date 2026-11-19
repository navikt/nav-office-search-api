import { isHttpError } from '@itsy/corgi';
import { schema } from '@itsy/corgi/schema';
import { logger } from '@navikt/navno-logger';
import { joinURL } from 'ufo';
import { z } from 'zod';
import { env } from '../env.ts';
import { upstreamClient } from '../upstream.ts';

const norgEnhetApi = joinURL(env.NORG2_ORIGIN, 'norg2/api/v1/enhet');

// NORG sends more about each of these; this is what is read
const enheterSchema = z.array(z.looseObject({ enhetNr: z.string(), navn: z.string(), type: z.string() }));
const navkontorerSchema = z.array(z.looseObject({ geografiskOmraade: z.string() }));

const norg = upstreamClient('norg', { timeout: 10_000, headers: { accept: 'application/json' } });

// NORG is asked once per office
const OFFICES_AT_A_TIME = 8;

// The office NORG has for each kommune and bydel, by kommunenr or bydelsnr. A Map, so an id like "constructor" finds
// nothing.
export type NorgOffices = Map<string, { enhetNr: string; navn: string }>;

// The kommuner and bydeler an office serves, by their numbers (NORG's geografiske områder). Undefined when NORG says
// it has none for the office, which it does with a 404.
const areasOf = async (enhetNr: string) => {
	try {
		const navkontorer = await norg.get(joinURL(norgEnhetApi, 'navkontorer', enhetNr), {
			transform: schema(navkontorerSchema),
		});
		return navkontorer.map(({ geografiskOmraade }) => geografiskOmraade);
	} catch (e) {
		if (isHttpError(e) && e.status === 404) {
			return undefined;
		}
		throw e;
	}
};

// The offices NORG has now: its active local offices, with the areas each serves. Throws when NORG can't tell.
export const fetchNorgOffices = async (): Promise<NorgOffices> => {
	const enheter = await norg.get(norgEnhetApi, {
		query: { enhetStatusListe: 'AKTIV' },
		transform: schema(enheterSchema),
	});
	const localOffices = enheter.filter(({ type }) => type === 'LOKAL');

	const offices: NorgOffices = new Map();
	const withoutAreas: string[] = [];

	for (let i = 0; i < localOffices.length; i += OFFICES_AT_A_TIME) {
		const some = localOffices.slice(i, i + OFFICES_AT_A_TIME);
		// oxlint-disable-next-line no-await-in-loop -- a few offices at a time, so NORG isn't asked for all at once
		const areas = await Promise.all(some.map(({ enhetNr }) => areasOf(enhetNr)));

		// In NORG's order: should it list an area under two offices, the last one gets it
		some.forEach(({ enhetNr, navn }, index) => {
			const geoIds = areas[index];
			if (!geoIds) {
				withoutAreas.push(enhetNr);
				return;
			}
			for (const geoId of geoIds) {
				offices.set(geoId, { enhetNr, navn });
			}
		});
	}

	if (withoutAreas.length > 0) {
		logger.warn('Offices without areas in NORG', { count: withoutAreas.length, enhetNr: withoutAreas.slice(0, 20) });
	}

	return offices;
};
