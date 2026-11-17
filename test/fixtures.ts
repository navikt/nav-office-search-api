// NORG, PDL and Texas answers in their wire shape, and the hosts the tests point the app at. At the end, SSB's and
// Bring's answers to the build's download.

export const NORG2_ORIGIN = 'http://norg2.test';
export const PDL_ORIGIN = 'http://pdl-api.test';
export const PDL_GRAPHQL_URL = `${PDL_ORIGIN}/graphql`;
export const PDL_TOKEN_TARGET = 'api://test-fss.pdl.pdl-api/.default';
export const NAIS_TOKEN_ENDPOINT = 'http://texas.test/api/v1/token';
export const XP_ORIGIN = 'http://xp.test';
export const NAVNO_ORIGIN = 'http://navno.test';
// The two files `pnpm build` downloads, as test/fixtures/README.md describes them
export const DATA_FILES_DIR = 'test/fixtures/files';

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

// XP

export const xpOfficeInfoUrl = `${XP_ORIGIN}/_/service/no.nav.navno/officeInfo`;

export const xpOfficeInfo = (
	offices: { path?: string; enhetNr?: string }[] = [{ path: '/kontor/nav-grunerlokka', enhetNr: '0315' }]
) => ({ offices });

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

export const pdlBydelAnswer = (bydelsnumre: string[]) => ({
	data: {
		sokAdresse: {
			aggregations: [
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

// SSB, as the build asks it

export const ssbClassificationUrl = 'https://data.ssb.no/api/klass/v1/classifications/103';
export const ssbVersionUrl = (id: number) => `https://data.ssb.no/api/klass/v1/versions/${id}`;

// A version as the classification lists it. The one that is valid now has no validTo.
export const ssbVersionRef = (id: number, validFrom: string, validTo?: string) => ({
	name: `Bydelsinndeling ${validFrom.slice(0, 4)}`,
	id,
	validFrom,
	...(validTo ? { validTo } : {}),
	lastModified: '2022-04-19T12:49:20.000+0000',
	published: ['nb', 'nn', 'en'],
	_links: { self: { href: ssbVersionUrl(id) } },
});

export const ssbClassification = (
	versions = [ssbVersionRef(919, '2018-01-01', '2020-01-01'), ssbVersionRef(1168, '2020-01-01')]
) => ({
	name: 'Standard for bydelsinndeling',
	id: 103,
	classificationType: 'Klassifikasjon',
	lastModified: '2026-01-07T07:31:55.000+0000',
	versions,
	_links: { self: { href: ssbClassificationUrl } },
});

export const ssbBydel = (code: string, name: string) => ({
	code,
	parentCode: '',
	level: '1',
	name,
	shortName: null,
	notes: null,
});

export const ssbVersion = (
	classificationItems = [ssbBydel('030102', 'Grünerløkka'), ssbBydel('030199', 'Uoppgitt')]
) => ({
	name: 'Bydelsinndeling 2020',
	id: 1168,
	validFrom: '2020-01-01',
	lastModified: '2022-04-19T12:49:20.000+0000',
	published: ['nb', 'nn', 'en'],
	classificationItems,
	_links: { self: { href: ssbVersionUrl(1168) } },
});

// Bring, as the build asks it

export const bringRegisterUrl = 'https://www.bring.no/postnummerregister-ansi.txt';

// The register as Bring sends it: tab separated rows in windows-1252, each ended by a newline
export const bringRegister = (
	rows = [
		['0184', 'OSLO', '0301', 'OSLO', 'G'],
		['1311', 'HØVIKODDEN', '3201', 'BÆRUM', 'G'],
	]
) => ({
	status: 200,
	headers: { 'content-type': 'text/plain' },
	body: Buffer.from(rows.map((row) => `${row.join('\t')}\n`).join(''), 'latin1'),
});
