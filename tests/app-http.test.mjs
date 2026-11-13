import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.NORG_ENHET_API = 'https://norg.example.test';
process.env.PDL_API = 'https://pdl.example.test';
process.env.PDL_DEVELOPMENT_TOKEN = 'development-token';

const { createApp } = await import('../distSrc/app.js');
const { metricsRegistry } = await import('../distSrc/metrics.js');
const { loadNorgOfficeInfo } = await import('../distSrc/norg-office-data.js');

const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const office = { enhetNr: '0101', navn: 'Nav Test' };

let server;
let baseUrl;

// A request the server never answers fails the test instead of hanging it
const get = (path) =>
    fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(2000) });

const assertStillAnswers = async () => {
    const res = await get('/geoid?id=030101');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), office);
};

before(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) =>
        String(input).includes('/navkontorer/')
            ? jsonResponse([{ geografiskOmraade: '030101' }])
            : jsonResponse([{ ...office, type: 'LOKAL' }]);
    try {
        assert.equal(await loadNorgOfficeInfo(), true);
    } finally {
        globalThis.fetch = originalFetch;
    }

    server = createApp(() => true).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
    server.closeAllConnections();
    server.close();
});

for (const id of ['constructor', '__proto__', 'toString']) {
    test(`/geoid?id=${id} answers 404, and the server keeps answering`, async () => {
        const res = await get(`/geoid?id=${id}`);

        assert.equal(res.status, 404);
        assert.deepEqual(await res.json(), {
            message: `No office info found for geoid ${id}`,
        });
        await assertStillAnswers();
    });
}

test('an error thrown in an async route answers 500, and the server keeps answering', async () => {
    const lookups = metricsRegistry.getSingleMetric(
        'nav_office_search_api_lookups_total'
    );
    const originalInc = lookups.inc;
    lookups.inc = () => {
        throw new Error('Simulated failure');
    };

    try {
        for (const path of ['/geoid?id=030101', '/adresse', '/bydel']) {
            const res = await get(path);
            assert.equal(res.status, 500, path);
        }
    } finally {
        lookups.inc = originalInc;
    }

    await assertStillAnswers();
});
