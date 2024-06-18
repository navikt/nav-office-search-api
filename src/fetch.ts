export type ErrorResponse = {
    error: true;
    statusCode: number;
    message: string;
};

export type OkResponse = { error: undefined };

export const errorResponse = (
    code: number,
    message: string,
    url: string
): ErrorResponse => ({
    error: true,
    statusCode: code,
    message: `Error ${code} fetching JSON from ${url} - ${message}`,
});

export const objectToQueryString = (params: object) =>
    Object.entries(params).reduce(
        (acc, [k, v], i) =>
            v !== undefined
                ? `${acc}${i ? '&' : '?'}${k}=${encodeURIComponent(
                    typeof v === 'object' ? JSON.stringify(v) : v
                )}`
                : acc,
        ''
    );

export const fetchJson = async <T>(
    apiUrl: string,
    params?: object,
    headers?: HeadersInit
): Promise<ErrorResponse | T> => {
    const url = `${apiUrl}${params ? objectToQueryString(params) : ''}`;

    try {
        const res = await fetch(url, {
            headers: headers,
        });

        const isJson = res.headers
            ?.get('content-type')
            ?.includes?.('application/json');

        if (res.ok && isJson) {
            return res.json();
        }

        if (res.ok) {
            return errorResponse(500, 'Did not receive a JSON-response', url);
        }

        const errorMsg = (await res.json()).message || res.statusText;

        return errorResponse(res.status, errorMsg, url);
    } catch (e) {
        return errorResponse(500, (e as Error).toString(), url);
    }
};
