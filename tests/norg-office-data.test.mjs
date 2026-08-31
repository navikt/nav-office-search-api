import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NORG_ENHET_API = 'https://norg.example.test';

const { getOfficeData, loadNorgOfficeInfo } = await import(
    '../distSrc/norg-office-data.js'
);

test('reports whether the NORG office-data refresh succeeded', async () => {
    const originalFetch = globalThis.fetch;

    try {
        globalThis.fetch = async () =>
            new Response(JSON.stringify({ message: 'Unavailable' }), {
                status: 503,
                headers: { 'content-type': 'application/json' },
            });

        assert.equal(await loadNorgOfficeInfo(), false);

        globalThis.fetch = async () =>
            new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });

        assert.equal(await loadNorgOfficeInfo(), true);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('preserves previous office data when a partial refresh fails', async () => {
    const originalFetch = globalThis.fetch;
    let failOfficeAreaRequest = false;

    try {
        globalThis.fetch = async (input) => {
            const url = String(input);

            if (url.includes('/navkontorer/')) {
                if (failOfficeAreaRequest) {
                    return new Response(
                        JSON.stringify({ message: 'Unavailable' }),
                        {
                            status: 503,
                            headers: { 'content-type': 'application/json' },
                        }
                    );
                }

                return new Response(
                    JSON.stringify([
                        {
                            navKontorId: 1,
                            geografiskOmraade: '0301',
                            enhetId: 1,
                            alternativEnhetId: 0,
                        },
                    ]),
                    {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    }
                );
            }

            return new Response(
                JSON.stringify([
                    {
                        type: 'LOKAL',
                        enhetNr: '1234',
                        navn: 'Nav Test',
                    },
                ]),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }
            );
        };

        assert.equal(await loadNorgOfficeInfo(), true);
        assert.deepEqual(getOfficeData('0301'), {
            enhetNr: '1234',
            navn: 'Nav Test',
        });

        failOfficeAreaRequest = true;

        assert.equal(await loadNorgOfficeInfo(), true);
        assert.deepEqual(getOfficeData('0301'), {
            enhetNr: '1234',
            navn: 'Nav Test',
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});
