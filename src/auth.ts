import NodeCache from 'node-cache';

const TOKEN_CACHE_KEY = 'pdl-access-token';
const TOKEN_EXPIRY_BUFFER_SECONDS = 60;

type AzureAdTokenPayload = {
    access_token: string;
    expires_in: number;
    token_type: string;
};

const tokenCache = new NodeCache();

const fetchNewAccessToken = async (): Promise<AzureAdTokenPayload> => {
    const { NAIS_TOKEN_ENDPOINT, NAIS_CLUSTER_NAME } = process.env;

    if (!NAIS_TOKEN_ENDPOINT) {
        throw new Error('NAIS_TOKEN_ENDPOINT environment variable is not set');
    }

    const target = `api://${NAIS_CLUSTER_NAME}.pdl.pdl-api/.default`;
    console.log(
        `Fetching new access token from NAIS token endpoint for target: ${target} on ${NAIS_TOKEN_ENDPOINT}`
    );

    const response = await fetch(NAIS_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            identity_provider: 'entra_id',
            target,
        },
    });

    if (!response.ok) {
        throw new Error(
            `Failed to fetch access token - ${response.statusText}`
        );
    }

    const data: AzureAdTokenPayload = await response.json();
    return data;
};

export const getAccessToken = async (): Promise<string> => {
    const cached = tokenCache.get<string>(TOKEN_CACHE_KEY);
    if (cached) {
        return cached;
    }

    console.log('Fetching new access token from NAIS token endpoint');

    const tokenPayload = await fetchNewAccessToken();
    const ttl = Math.max(
        tokenPayload.expires_in - TOKEN_EXPIRY_BUFFER_SECONDS,
        0
    );
    tokenCache.set(TOKEN_CACHE_KEY, tokenPayload.access_token, ttl);

    return tokenPayload.access_token;
};

export const invalidateAccessToken = () => {
    tokenCache.del(TOKEN_CACHE_KEY);
};
