declare global {
    namespace NodeJS {
        interface ProcessEnv {
            HTTPS_PROXY?: string;
            NORG_ENHET_API: string;
            PDL_API: string;
            PDL_DEVELOPMENT_TOKEN?: string;
            NAIS_CLUSTER_NAME: string;
            NAIS_TOKEN_ENDPOINT: string;
        }
    }
}

export {};
