import { ClientError, request } from 'graphql-request';
import { getAccessToken, invalidateAccessToken } from './auth.js';
import { ErrorResponse } from './fetch.js';

const graphQLUrl = `${process.env.PDL_API}/graphql`;

const pdlQueryError = (message: string): ErrorResponse => ({
    error: true,
    statusCode: 502,
    message,
});

export const pdlRequest = <T>(
    bearerToken: string,
    queryDoc: string,
    queryVariables: Record<string, unknown>
) =>
    request<T>(graphQLUrl, queryDoc, queryVariables, {
        Authorization: `Bearer ${bearerToken}`,
    });

export const withPdlTokenRetry = async <T>(
    requestFn: (token: string) => Promise<T>
): Promise<T | ErrorResponse> => {
    const token = process.env.PDL_DEVELOPMENT_TOKEN || (await getAccessToken());

    try {
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
                console.error('PDL retry after 401 also failed:', retryError);
                return pdlQueryError(
                    `PDL request failed after token refresh: ${retryError instanceof Error ? retryError.message : retryError}`
                );
            }
        }

        console.error('PDL request failed:', e);
        return pdlQueryError(
            `PDL request failed: ${e instanceof Error ? e.message : e}`
        );
    }
};
