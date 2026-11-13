/*
 * Loaded with `node --import` by `pnpm dev`, so the server runs offline: NORG, PDL and Texas are answered from
 * test/fixtures.ts, at the hosts .env.development points the server at.
 * MOCKS=false turns this off; the server then needs real values in the shell for what .env.development fakes.
 */

import { mockFetch } from '@itsy/corgi/testing';
import { logger } from '@navikt/navno-logger';
import {
	NAIS_TOKEN_ENDPOINT,
	PDL_GRAPHQL_URL,
	navkontor,
	norgEnhet,
	norgEnhetUrl,
	norgNavkontorerUrl,
	pdlAdresseAnswer,
	pdlBydelAnswer,
	texasToken,
	vegadresse,
} from '#test/fixtures.ts';

if (process.env.MOCKS !== 'false') {
	const http = mockFetch();

	// One office, for Oslo and for bydel Grünerløkka
	http.get(norgEnhetUrl, { json: [norgEnhet()] });
	http.get(norgNavkontorerUrl('0315'), { json: [navkontor('0301'), navkontor('030102')] });

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
	logger.info('Mocks: NORG, PDL and Texas are answered from test/fixtures.ts (MOCKS=false turns this off)');
}
