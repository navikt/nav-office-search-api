declare global {
    namespace NodeJS {
        interface ProcessEnv {
            AZURE_APP_CLIENT_ID: string;
            AZURE_OPENID_CONFIG_JWKS_URI: string;
            NORG_ENHET_API: string;
            TPS_ADRESSESOK_API: string;
        }
    }
}

export {};
