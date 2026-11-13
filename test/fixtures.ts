// NORG, PDL and Texas answers in their wire shape, and the hosts the tests point the app at

export const NORG2_ORIGIN = 'http://norg2.test';
export const PDL_ORIGIN = 'http://pdl-api.test';
export const PDL_GRAPHQL_URL = `${PDL_ORIGIN}/graphql`;
export const PDL_TOKEN_TARGET = 'api://test-fss.pdl.pdl-api/.default';
export const NAIS_TOKEN_ENDPOINT = 'http://texas.test/api/v1/token';

// NORG

export type NorgEnhet = {
	enhetId: number;
	navn: string;
	enhetNr: string;
	antallRessurser: number;
	status: string;
	orgNivaa: string;
	type: string;
	organisasjonsnummer: string | null;
	underEtableringDato: string;
	aktiveringsdato: string;
	underAvviklingDato: string | null;
	nedleggelsesdato: string | null;
	oppgavebehandler: boolean;
	versjon: number;
	sosialeTjenester: string | null;
	kanalstrategi: string | null;
	orgNrTilKommunaltNavKontor: string | null;
};

export const norgEnhet = (overrides: Partial<NorgEnhet> = {}): NorgEnhet => ({
	enhetId: 100000001,
	navn: 'Nav Grünerløkka',
	enhetNr: '0315',
	antallRessurser: 0,
	status: 'Aktiv',
	orgNivaa: 'EN',
	type: 'LOKAL',
	organisasjonsnummer: '974778807',
	underEtableringDato: '1970-01-01',
	aktiveringsdato: '1970-01-01',
	underAvviklingDato: null,
	nedleggelsesdato: null,
	oppgavebehandler: false,
	versjon: 12,
	sosialeTjenester: null,
	kanalstrategi: null,
	orgNrTilKommunaltNavKontor: '874778702',
	...overrides,
});

export const navkontor = (geografiskOmraade: string, enhetId = 100000001) => ({
	navKontorId: 1,
	geografiskOmraade,
	enhetId,
	alternativEnhetId: null,
});

export const norgEnhetUrl = `${NORG2_ORIGIN}/norg2/api/v1/enhet`;
export const norgNavkontorerUrl = (enhetNr: string) => `${norgEnhetUrl}/navkontorer/${enhetNr}`;

// PDL

export type Vegadresse = {
	adressenavn: string;
	husnummer: number;
	husbokstav: string | null;
	postnummer: string;
	poststed: string;
	kommunenummer: string | null;
	bydelsnummer: string | null;
};

export const vegadresse = (overrides: Partial<Vegadresse> = {}): Vegadresse => ({
	adressenavn: 'Storgata',
	husnummer: 31,
	husbokstav: 'B',
	postnummer: '0184',
	poststed: 'OSLO',
	kommunenummer: '0301',
	bydelsnummer: '030104',
	...overrides,
});

export const pdlAdresseAnswer = (vegadresser: (Vegadresse | null)[], totalHits = vegadresser.length) => ({
	data: {
		sokAdresse: {
			totalHits,
			hits: vegadresser.map((v) => ({ vegadresse: v })),
		},
	},
});

export const pdlBydelAnswer = (bydelsnumre: string[], kommunenumre = ['0301']) => ({
	data: {
		sokAdresse: {
			aggregations: [
				{ fieldName: 'vegadresse.kommunenummer', values: kommunenumre.map((value) => ({ value, docCount: 10 })) },
				{ fieldName: 'vegadresse.bydelsnummer', values: bydelsnumre.map((value) => ({ value, docCount: 10 })) },
			],
		},
	},
});

export const pdlErrorAnswer = (code: string, message = 'Something went wrong') => ({
	errors: [{ message, locations: [{ line: 2, column: 3 }], path: ['sokAdresse'], extensions: { code } }],
	data: { sokAdresse: null },
});

// Texas

export const texasToken = (accessToken = 'texas-token', expiresIn = 3599) => ({
	access_token: accessToken,
	expires_in: expiresIn,
	token_type: 'Bearer',
});
