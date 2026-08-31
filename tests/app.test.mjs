import assert from 'node:assert/strict';
import test from 'node:test';
import { createReadinessHandler } from '../distSrc/app.js';

test('readiness remains unavailable until office data is ready', async () => {
    let ready = false;
    const handler = createReadinessHandler(() => ready);
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

    handler({}, response);
    assert.equal(statusCode, 503);
    assert.equal(body, 'I am not ready...');

    ready = true;
    handler({}, response);
    assert.equal(statusCode, 200);
    assert.equal(body, 'I am ready!');
});
