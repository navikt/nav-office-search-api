import type { OfficeInfo, Poststed } from '../data/types.ts';

// What /search answers with. nav-office-search passes it on to the browser as it is, and has the same types.

export type SearchResultPostnrProps = {
	type: 'postnr';
} & Poststed;

export type NameHit = { name: string; officeHits: OfficeInfo[] };

export type Adresse = {
	adressenavn: string;
	husnummer: number | null;
	husbokstav: string | null;
	postnummer: string;
	poststed: string;
	kommunenummer: string | null;
	bydelsnummer: string | null;
	// The office of its bydel or, without a bydel, of its kommune. Null when that area has none.
	officeInfo: OfficeInfo | null;
};

export type SearchResultNameProps = {
	type: 'name';
	hits: NameHit[];
	input: string;
};

export type SearchResultAdresseProps = {
	type: 'adresse';
	adresseQuery: string;
	adresser: Adresse[];
	totalHits: number;
};

// The ids of the messages nav-office-search shows for an error
export type ErrorMessageId = 'errorMissingQuery' | 'errorInvalidQuery' | 'errorInvalidPostnr' | 'errorServerError';

export type SearchResultErrorProps = {
	type: 'error';
	messageId: ErrorMessageId;
};

export type SearchResultProps =
	| SearchResultPostnrProps
	| SearchResultNameProps
	| SearchResultAdresseProps
	| SearchResultErrorProps;

// What a search answers with: the status and the body
export type SearchAnswer = { status: 200 | 400 | 404 | 500 | 502 | 504; body: SearchResultProps };

export const errorAnswer = (status: SearchAnswer['status'], messageId: ErrorMessageId): SearchAnswer => ({
	status,
	body: { type: 'error', messageId },
});
