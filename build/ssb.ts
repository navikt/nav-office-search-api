import { schema } from '@itsy/corgi/schema';
import { z } from 'zod';
import { downloader } from './http.ts';

// SSB's classification of bydeler
export const bydelerClassificationUrl = 'https://data.ssb.no/api/klass/v1/classifications/103';

const ssb = downloader({ accept: 'application/json' });

// The versions of the classification. Each is valid from one 1 January until the next version's; the current one has
// no validTo.
const classificationSchema = z.looseObject({
	versions: z.array(
		z.looseObject({
			validFrom: z.string(),
			validTo: z.string().nullish(),
			_links: z.looseObject({ self: z.looseObject({ href: z.string() }) }),
		})
	),
});

// One version of it
const versionSchema = z.looseObject({
	classificationItems: z.array(z.looseObject({ code: z.string(), name: z.string() })),
});

// What SSB calls a kommune's addresses that are in none of its bydeler
const NO_BYDEL = 'Uoppgitt';

// The bydeler in the version of SSB's classification that is valid now, and the day that version became valid.
// Rejects when SSB doesn't answer, or has no such version.
export const fetchBydeler = async (now = new Date()) => {
	const { versions } = await ssb.get(bydelerClassificationUrl, { transform: schema(classificationSchema) });

	const current = versions.find(
		({ validFrom, validTo }) => now >= new Date(validFrom) && (!validTo || now < new Date(validTo))
	);
	if (!current) {
		throw new Error('SSB has no version of its classification of bydeler that is valid today');
	}

	const { classificationItems } = await ssb.get(current._links.self.href, { transform: schema(versionSchema) });
	return {
		validFrom: current.validFrom,
		bydeler: classificationItems.filter(({ name }) => name !== NO_BYDEL).map(({ code, name }) => ({ code, name })),
	};
};
