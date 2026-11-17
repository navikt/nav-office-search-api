/*
 * Loaded with `node --import` by `pnpm dev`, so the server runs offline, at the hosts .env.development points it at:
 * NORG and XP are answered from the snapshot in test/fixtures (see its README), which the two data files there fit,
 * and PDL and Texas from test/fixtures.ts.
 * MOCKS=false turns this off; the server then needs real values in the shell for what .env.development fakes.
 */

import { mockFetch } from '@itsy/corgi/testing';
import { logger } from '@navikt/navno-logger';
import {
	NAIS_TOKEN_ENDPOINT,
	PDL_GRAPHQL_URL,
	pdlAdresseAnswer,
	pdlBydelAnswer,
	texasToken,
	vegadresse,
} from '#test/fixtures.ts';
import { answerSnapshot } from '#test/snapshot.ts';

if (process.env.MOCKS !== 'false') {
	const http = mockFetch();

	// 283 local offices with their areas, and the offices' pages
	answerSnapshot(http);

	http.post(NAIS_TOKEN_ENDPOINT, { json: texasToken() });

	// /bydel asks PDL for aggregations, /adresse for hits. Both find Grünerløkka, so /geoid has an office for them.
	const adresser = [
		vegadresse({ bydelsnummer: '030102' }),
		vegadresse({ husnummer: 33, husbokstav: null, bydelsnummer: '030102' }),
	];
	http.post(PDL_GRAPHQL_URL, (call) =>
		call.body?.includes('aggregations') ? { json: pdlBydelAnswer(['030102']) } : { json: pdlAdresseAnswer(adresser) }
	);

	http.install();
	logger.info('Mocks: NORG, XP, PDL and Texas are answered from test/fixtures (MOCKS=false turns this off)');
}
