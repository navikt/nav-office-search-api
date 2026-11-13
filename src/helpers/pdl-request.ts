import { ClientError, request } from 'graphql-request';
import { getAccessToken, invalidateAccessToken } from './auth.js';
import { ErrorResponse } from './fetch.js';

export const getPdlGraphQLUrl = (): string => {
    const { PDL_API } = process.env;

    if (!PDL_API) {
        throw new Error('PDL_API environment variable is not set');
    }

    return `${PDL_API}/graphql`;
};

// Error-boundry, log the error here but don't send the message downstream
const pdlQueryError = (): ErrorResponse => ({
    error: true,
    statusCode: 502,
    message: 'PDL request failed',
});

// A ClientError's message holds our whole request, with the searched address,
// and PDL's answer. Log only its HTTP status and PDL's error codes.
const logPdlFailure = (description: string, e: unknown) => {
    if (e instanceof ClientError) {
        const codes =
            e.response.errors?.map((error) =>
                String(error.extensions?.code ?? 'unknown')
            ) ?? [];
        console.error(
            `${description}: HTTP ${e.response.status}, error codes: ${codes.join(', ') || 'none'}`
        );
        return;
    }

    console.error(`${description}:`, e);
};

export const pdlRequest = <T>(
    bearerToken: string,
    queryDoc: string,
    queryVariables: Record<string, unknown>
) =>
    request<T>(getPdlGraphQLUrl(), queryDoc, queryVariables, {
        Authorization: `Bearer ${bearerToken}`,
    });

export const withPdlTokenRetry = async <T>(
    requestFn: (token: string) => Promise<T>
): Promise<T | ErrorResponse> => {
    try {
        const token =
            process.env.PDL_DEVELOPMENT_TOKEN || (await getAccessToken());
        return await requestFn(token);
    } catch (e) {
        const is401 = e instanceof ClientError && e.response.status === 401;

        if (is401 && !process.env.PDL_DEVELOPMENT_TOKEN) {
            console.warn('PDL returned 401, retrying with fresh token');
            invalidateAccessToken();
            try {
                const freshToken = await getAccessToken();
                return await requestFn(freshToken);
            } catch (retryError) {
                logPdlFailure('PDL retry after 401 also failed', retryError);
                return pdlQueryError();
            }
        }

        logPdlFailure('PDL request failed', e);
        return pdlQueryError();
    }
};
