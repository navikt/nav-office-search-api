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
    data: {
        sokAdresse: {
            totalHits: number;
            hits: {
                vegadresse: Vegadresse;
            }[];
        };
    };
};

export type PdlSokBydelResponse = {
    data: {
        sokAdresse: {
            aggregations: [
                {
                    fieldName: 'vegadresse.kommunenummer';
                    values: {
                        value: string;
                    }[];
                },
                {
                    fieldName: 'vegadresse.bydelsnummer';
                    values: {
                        value: string;
                    }[];
                },
            ];
        };
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
