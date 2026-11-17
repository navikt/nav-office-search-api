export const PostnrKategori = {
	GateadresserOgPostbokser: 'B',
	Felles: 'F',
	Gateadresser: 'G',
	Postbokser: 'P',
	Servicepostnummer: 'S',
} as const;

export type PostnrKategori = (typeof PostnrKategori)[keyof typeof PostnrKategori];

export type Poststed = {
	postnr: string;
	poststed: string;
	poststedNormalized: string;
	kommuneNavn: string;
	kommunenr: string;
	bydelsnr?: string;
	kategori: PostnrKategori;
	officeInfo: OfficeInfo[];
};

export type Kommune = {
	kommunenr: string;
	kommuneNavn: string;
	kommuneNavnNormalized: string;
	officeInfo?: OfficeInfo;
	bydeler?: Bydel[];
};

export type Bydel = {
	bydelsnr: string;
	navn: string;
	navnNormalized: string;
	officeInfo: OfficeInfo;
};

export type OfficeInfo = {
	name: string;
	enhetNr: string;
	url: string;
	hitString: string;
	geoId: string;
};
