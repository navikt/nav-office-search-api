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
