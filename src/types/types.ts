type Vegadresse = {
    adressenavn: string;
    husnummer: number;
    husbokstav: string | null;
    postnummer: string;
    poststed: string;
    bydelsnummer: string | null;
    kommunenummer: string | null;
};

export type PdlSokAdresseResponse = {
    sokAdresse: {
        totalHits: number;
        hits: {
            vegadresse: Vegadresse;
        }[];
    };
};

export type PdlSokBydelResponse = {
    sokAdresse: {
        aggregations: {
            fieldName: string;
            values: {
                value: string;
            }[];
        }[];
    };
};

export type AdresseResponse = {
    totalHits: number;
    adresser: Vegadresse[];
};
export type Bydelsnummer = string;
export type BydelerResponse = {
    bydeler: Bydelsnummer[];
};
