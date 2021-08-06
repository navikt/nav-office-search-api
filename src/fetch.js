import fetch from 'node-fetch';

const errorResponse = (code, message, url) => ({
    error: true,
    statusCode: code,
    message: `Error ${code} fetching JSON from ${url} - ${message}`,
});

const objectToQueryString = (params) =>
    params
        ? Object.entries(params).reduce(
              (acc, [k, v], i) =>
                  v !== undefined
                      ? `${acc}${i ? '&' : '?'}${k}=${encodeURIComponent(
                            typeof v === 'object' ? JSON.stringify(v) : v
                        )}`
                      : acc,
              ''
          )
        : '';

export const fetchJson = async (apiUrl, params, headers) => {
    const url = `${apiUrl}${objectToQueryString(params)}`;

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
        return errorResponse(500, e.toString(), url);
    }
};
