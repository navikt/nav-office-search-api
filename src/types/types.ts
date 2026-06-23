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

export type AdresseForslag = {
    totalHits: number;
    hits: Vegadresse[];
};
export type Bydelsnummer = string;
export type BydelerForslag = Bydelsnummer[];
