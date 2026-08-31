import assert from 'node:assert/strict';
import test from 'node:test';
import { ClientError } from 'graphql-request';
import { invalidateAccessToken } from '../distSrc/helpers/auth.js';
import {
    getPdlGraphQLUrl,
    withPdlTokenRetry,
} from '../distSrc/helpers/pdl-request.js';

test('validates and builds the PDL GraphQL URL', () => {
    const originalPdlApi = process.env.PDL_API;

    try {
        delete process.env.PDL_API;
        assert.throws(
            () => getPdlGraphQLUrl(),
            /PDL_API environment variable is not set/
        );

        process.env.PDL_API = 'https://pdl.example.test';
        assert.equal(
            getPdlGraphQLUrl(),
            'https://pdl.example.test/graphql'
        );
    } finally {
        if (originalPdlApi === undefined) {
            delete process.env.PDL_API;
        } else {
            process.env.PDL_API = originalPdlApi;
        }
    }
});

test('maps token endpoint failures to a 502 response', async () => {
    const originalTokenEndpoint = process.env.NAIS_TOKEN_ENDPOINT;
    const originalDevelopmentToken = process.env.PDL_DEVELOPMENT_TOKEN;

    try {
        delete process.env.NAIS_TOKEN_ENDPOINT;
        delete process.env.PDL_DEVELOPMENT_TOKEN;

        const response = await withPdlTokenRetry(async () => {
            throw new Error('Request should not run without a token');
        });

        assert.equal(response.error, true);
        assert.equal(response.statusCode, 502);
        assert.match(
            response.message,
            /NAIS_TOKEN_ENDPOINT environment variable is not set/
        );
    } finally {
        if (originalTokenEndpoint === undefined) {
            delete process.env.NAIS_TOKEN_ENDPOINT;
        } else {
            process.env.NAIS_TOKEN_ENDPOINT = originalTokenEndpoint;
        }

        if (originalDevelopmentToken === undefined) {
            delete process.env.PDL_DEVELOPMENT_TOKEN;
        } else {
            process.env.PDL_DEVELOPMENT_TOKEN = originalDevelopmentToken;
        }
    }
});

test('refreshes the token and retries once after a PDL 401', async () => {
    const originalFetch = globalThis.fetch;
    const originalTokenEndpoint = process.env.NAIS_TOKEN_ENDPOINT;
    const originalClusterName = process.env.NAIS_CLUSTER_NAME;
    const originalDevelopmentToken = process.env.PDL_DEVELOPMENT_TOKEN;
    let tokenRequestCount = 0;
    let pdlRequestCount = 0;

    try {
        process.env.NAIS_TOKEN_ENDPOINT = 'https://token.example.test';
        process.env.NAIS_CLUSTER_NAME = 'dev-fss';
        delete process.env.PDL_DEVELOPMENT_TOKEN;
        invalidateAccessToken();

        globalThis.fetch = async () => {
            tokenRequestCount += 1;
            return new Response(
                JSON.stringify({
                    access_token: `token-${tokenRequestCount}`,
                    expires_in: 3600,
                    token_type: 'Bearer',
                }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }
            );
        };

        const response = await withPdlTokenRetry(async (token) => {
            pdlRequestCount += 1;

            if (pdlRequestCount === 1) {
                assert.equal(token, 'token-1');
                throw new ClientError(
                    { status: 401 },
                    { query: 'query Test { test }' }
                );
            }

            assert.equal(token, 'token-2');
            return 'success';
        });

        assert.equal(response, 'success');
        assert.equal(tokenRequestCount, 2);
        assert.equal(pdlRequestCount, 2);
    } finally {
        invalidateAccessToken();
        globalThis.fetch = originalFetch;

        if (originalTokenEndpoint === undefined) {
            delete process.env.NAIS_TOKEN_ENDPOINT;
        } else {
            process.env.NAIS_TOKEN_ENDPOINT = originalTokenEndpoint;
        }

        if (originalClusterName === undefined) {
            delete process.env.NAIS_CLUSTER_NAME;
        } else {
            process.env.NAIS_CLUSTER_NAME = originalClusterName;
        }

        if (originalDevelopmentToken === undefined) {
            delete process.env.PDL_DEVELOPMENT_TOKEN;
        } else {
            process.env.PDL_DEVELOPMENT_TOKEN = originalDevelopmentToken;
        }
    }
});
