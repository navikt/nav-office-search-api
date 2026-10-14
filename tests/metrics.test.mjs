import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NORG_ENHET_API = 'https://norg.example.test';
process.env.PDL_API = 'https://pdl.example.test';
process.env.PDL_DEVELOPMENT_TOKEN = 'development-token';

const { metricsRegistry } = await import('../distSrc/metrics.js');
const { createApp } = await import('../distSrc/app.js');
const { geoIdSearchHandler } =
    await import('../distSrc/handlers/geoid-search-handler.js');
const { adresseSearchHandler } =
    await import('../distSrc/handlers/adresse-search-handler.js');
const { bydelSearchHandler } =
    await import('../distSrc/handlers/bydel-search-handler.js');
const { loadNorgOfficeInfo } = await import('../distSrc/norg-office-data.js');

const metricValue = async (name, labels = {}) => {
    const metric = await metricsRegistry.getSingleMetric(name).get();
    const match = metric.values.find((v) =>
        Object.entries(labels).every(([k, val]) => v.labels[k] === val)
    );
    return match?.value ?? 0;
};

const lookups = (operation, result) =>
    metricValue('nav_office_search_api_lookups_total', { operation, result });

const invokeHandler = async (handler, query) => {
    const response = {
        status() {
            return this;
        },
        send() {
            return this;
        },
    };
    await handler({ query }, response);
};

const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const withFetch = async (fetchImpl, fn) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
        await fn();
    } finally {
        globalThis.fetch = originalFetch;
    }
};

test('exposes pre-initialized business metrics on /internal/metrics', async () => {
    const server = createApp(() => true).listen(0);

    try {
        await new Promise((resolve) => server.once('listening', resolve));
        const { port } = server.address();
        const res = await fetch(`http://127.0.0.1:${port}/internal/metrics`);
        const body = await res.text();

        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /text\/plain/);
        assert.match(
            body,
            /nav_office_search_api_lookups_total\{operation="geoid",result="empty"\} 0/
        );
        assert.match(
            body,
            /nav_office_search_api_norg_refresh_total\{result="failure"\} 0/
        );
    } finally {
        server.close();
    }
});

test('counts geoid lookup outcomes', async () => {
    await withFetch(
        async (input) =>
            String(input).includes('/navkontorer/')
                ? jsonResponse([{ geografiskOmraade: '030101' }])
                : jsonResponse([
                      { enhetNr: '0101', navn: 'Nav Test', type: 'LOKAL' },
                  ]),
        () => loadNorgOfficeInfo()
    );

    await invokeHandler(geoIdSearchHandler, { id: '030101' });
    await invokeHandler(geoIdSearchHandler, { id: '999999' });
    await invokeHandler(geoIdSearchHandler, {});

    assert.equal(await lookups('geoid', 'hits'), 1);
    assert.equal(await lookups('geoid', 'empty'), 1);
    assert.equal(await lookups('geoid', 'invalid'), 1);
});

test('counts adresse and bydel lookup outcomes', async () => {
    let pdlData;

    await withFetch(
        async () => jsonResponse({ data: pdlData }),
        async () => {
            pdlData = {
                sokAdresse: { totalHits: 1, hits: [{ vegadresse: {} }] },
            };
            await invokeHandler(adresseSearchHandler, {
                queryString: 'Storgata 1',
            });

            pdlData = { sokAdresse: { totalHits: 0, hits: [] } };
            await invokeHandler(adresseSearchHandler, {
                queryString: 'Finnesikke',
            });
            await invokeHandler(adresseSearchHandler, { queryString: '!@#$' });

            pdlData = {
                sokAdresse: {
                    aggregations: [
                        {
                            fieldName: 'vegadresse.bydelsnummer',
                            values: [{ value: '01' }],
                        },
                    ],
                },
            };
            await invokeHandler(bydelSearchHandler, { postnummer: '0150' });

            pdlData = { sokAdresse: { aggregations: [] } };
            await invokeHandler(bydelSearchHandler, { postnummer: '9990' });
            await invokeHandler(bydelSearchHandler, { postnummer: 'abc' });
        }
    );

    await withFetch(
        async () => jsonResponse({ errors: [{ message: 'down' }] }, 503),
        async () => {
            await invokeHandler(adresseSearchHandler, {
                queryString: 'Storgata 1',
            });
            await invokeHandler(bydelSearchHandler, { postnummer: '0150' });
        }
    );

    assert.equal(await lookups('adresse', 'hits'), 1);
    assert.equal(await lookups('adresse', 'empty'), 1);
    assert.equal(await lookups('adresse', 'invalid'), 1);
    assert.equal(await lookups('adresse', 'error'), 1);

    assert.equal(await lookups('bydel', 'hits'), 1);
    assert.equal(await lookups('bydel', 'empty'), 1);
    assert.equal(await lookups('bydel', 'invalid'), 1);
    assert.equal(await lookups('bydel', 'error'), 1);
});

test('records NORG refresh health', async () => {
    const successesBefore = await metricValue(
        'nav_office_search_api_norg_refresh_total',
        {
            result: 'success',
        }
    );

    await withFetch(
        async () => jsonResponse({ message: 'Unavailable' }, 503),
        () => loadNorgOfficeInfo()
    );

    assert.equal(
        await metricValue('nav_office_search_api_norg_refresh_total', {
            result: 'failure',
        }),
        1
    );

    const beforeSuccess = Date.now() / 1000;

    await withFetch(
        async (input) => {
            const url = String(input);
            if (url.endsWith('/navkontorer/0102')) {
                return jsonResponse({ message: 'Unavailable' }, 503);
            }
            if (url.includes('/navkontorer/')) {
                return jsonResponse([
                    { geografiskOmraade: '030101' },
                    { geografiskOmraade: '030102' },
                ]);
            }
            return jsonResponse([
                { enhetNr: '0101', navn: 'Nav A', type: 'LOKAL' },
                { enhetNr: '0102', navn: 'Nav B', type: 'LOKAL' },
            ]);
        },
        () => loadNorgOfficeInfo()
    );

    assert.equal(
        await metricValue('nav_office_search_api_norg_refresh_total', {
            result: 'success',
        }),
        successesBefore + 1
    );
    assert.equal(
        await metricValue('nav_office_search_api_norg_geoids_loaded'),
        2
    );
    assert.equal(
        await metricValue('nav_office_search_api_norg_refresh_failed_offices'),
        1
    );
    assert.ok(
        (await metricValue(
            'nav_office_search_api_norg_last_success_timestamp_seconds'
        )) >= Math.floor(beforeSuccess)
    );
});
