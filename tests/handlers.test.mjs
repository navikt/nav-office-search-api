import assert from 'node:assert/strict';
import test from 'node:test';
import {
    adresseSearchHandler,
    validateQueryString,
} from '../distSrc/handlers/adresse-search-handler.js';
import {
    bydelSearchHandler,
    sanitizePostnummer,
} from '../distSrc/handlers/bydel-search-handler.js';

const invokeHandler = async (handler, query) => {
    let statusCode;
    let body;
    const response = {
        status(code) {
            statusCode = code;
            return this;
        },
        send(value) {
            body = value;
            return this;
        },
    };

    await handler({ query }, response);
    return { statusCode, body };
};

test('validates and sanitizes address queries', () => {
    assert.deepEqual(validateQueryString('  Storgata 31B!  '), {
        query: 'Storgata 31B',
    });
    assert.deepEqual(validateQueryString('!@#$'), {
        error: 'Query string is empty or invalid',
    });
    assert.deepEqual(validateQueryString('a'.repeat(151)), {
        error: 'Query string exceeds maximum length of 150 characters',
    });
});

test('accepts only four-digit postal codes', () => {
    assert.equal(sanitizePostnummer('1234'), '1234');
    assert.equal(sanitizePostnummer(' 1234 '), '1234');
    assert.equal(sanitizePostnummer('abcd1234'), null);
    assert.equal(sanitizePostnummer('12-34'), null);
    assert.equal(sanitizePostnummer('123'), null);
});

test('maps successful PDL responses to the public response contracts', async () => {
    const originalFetch = globalThis.fetch;
    const originalPdlApi = process.env.PDL_API;
    const originalDevelopmentToken = process.env.PDL_DEVELOPMENT_TOKEN;
    const vegadresse = {
        adressenavn: 'Storgata',
        husnummer: 31,
        husbokstav: 'B',
        postnummer: '1234',
        poststed: 'Teststed',
        kommunenummer: '0301',
        bydelsnummer: '01',
    };

    try {
        process.env.PDL_API = 'https://pdl.example.test';
        process.env.PDL_DEVELOPMENT_TOKEN = 'development-token';

        globalThis.fetch = async (_input, init) => {
            const requestBody = JSON.parse(init.body);
            const data = requestBody.query.includes(
                'sokAdresseFritekstQuery'
            )
                ? {
                      sokAdresse: {
                          totalHits: 1,
                          hits: [{ vegadresse }],
                      },
                  }
                : {
                      sokAdresse: {
                          aggregations: [
                              {
                                  fieldName: 'vegadresse.bydelsnummer',
                                  values: [{ value: '01' }, { value: '02' }],
                              },
                          ],
                      },
                  };

            return new Response(JSON.stringify({ data }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        };

        assert.deepEqual(
            await invokeHandler(adresseSearchHandler, {
                queryString: 'Storgata 31B',
            }),
            {
                statusCode: 200,
                body: {
                    totalHits: 1,
                    adresser: [vegadresse],
                },
            }
        );

        assert.deepEqual(
            await invokeHandler(bydelSearchHandler, {
                postnummer: '1234',
            }),
            {
                statusCode: 200,
                body: {
                    bydeler: ['01', '02'],
                },
            }
        );
    } finally {
        globalThis.fetch = originalFetch;

        if (originalPdlApi === undefined) {
            delete process.env.PDL_API;
        } else {
            process.env.PDL_API = originalPdlApi;
        }

        if (originalDevelopmentToken === undefined) {
            delete process.env.PDL_DEVELOPMENT_TOKEN;
        } else {
            process.env.PDL_DEVELOPMENT_TOKEN = originalDevelopmentToken;
        }
    }
});

test('maps PDL failures to a 502 handler response', async () => {
    const originalFetch = globalThis.fetch;
    const originalPdlApi = process.env.PDL_API;
    const originalDevelopmentToken = process.env.PDL_DEVELOPMENT_TOKEN;

    try {
        process.env.PDL_API = 'https://pdl.example.test';
        process.env.PDL_DEVELOPMENT_TOKEN = 'development-token';
        globalThis.fetch = async () =>
            new Response(
                JSON.stringify({
                    errors: [{ message: 'PDL unavailable' }],
                }),
                {
                    status: 503,
                    headers: { 'content-type': 'application/json' },
                }
            );

        const response = await invokeHandler(adresseSearchHandler, {
            queryString: 'Storgata 31B',
        });

        assert.equal(response.statusCode, 502);
        assert.match(response.body.error, /PDL unavailable/);
    } finally {
        globalThis.fetch = originalFetch;

        if (originalPdlApi === undefined) {
            delete process.env.PDL_API;
        } else {
            process.env.PDL_API = originalPdlApi;
        }

        if (originalDevelopmentToken === undefined) {
            delete process.env.PDL_DEVELOPMENT_TOKEN;
        } else {
            process.env.PDL_DEVELOPMENT_TOKEN = originalDevelopmentToken;
        }
    }
});
