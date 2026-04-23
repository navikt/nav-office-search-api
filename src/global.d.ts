declare global {
    namespace NodeJS {
        interface ProcessEnv {
            AZURE_APP_CLIENT_ID: string;
            AZURE_OPENID_CONFIG_JWKS_URI: string;
            HTTPS_PROXY?: string;
            NORG_ENHET_API: string;
            PDL_API: string;
            NAIS_TOKEN_ENDPOINT: string;
        }
    }
}

export {};
