import { isHttpError, isTimeoutError } from '@itsy/corgi';
import { isValidationError, schema } from '@itsy/corgi/schema';
import { httpError, networkError } from '@itsy/corgi/testing';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { startApp } from '#test/app.ts';
import { installMockFetch } from '#test/fetch.ts';
import { failureOf } from './upstream.ts';

const http = installMockFetch();

const OFFICES = 'http://upstream.test/offices';

// The client beside a running copy of the app, so its metrics are read the way Prometheus reads them
const start = async () => {
	const app = await startApp();
	const { upstreamClient } = await import('#server/upstream.ts');

	return {
		upstreamClient,
		requests: (upstream: string, status: string) =>
			app.metric('nav_office_search_api_upstream_requests_total', { upstream, status }),
		timed: (upstream: string) =>
			app.metric('nav_office_search_api_upstream_request_duration_seconds_count', { upstream }),
	};
};

const rejectionOf = (promise: Promise<unknown>) =>
	promise.then(
		() => {
			throw new Error('resolved');
		},
		(e: unknown) => e
	);

describe('upstreamClient', () => {
	test('counts and times each request under the upstream it was made for', async () => {
		http.get(OFFICES, { json: { offices: [] } });
		http.get('http://upstream.test/missing', { status: 404 });
		const { upstreamClient, requests, timed } = await start();
		const pdl = upstreamClient('pdl', { timeout: 1000 });

		expect(await pdl.get(OFFICES)).toEqual({ offices: [] });
		expect(isHttpError(await rejectionOf(pdl.get('http://upstream.test/missing')))).toBe(true);

		expect(await requests('pdl', '2xx')).toBe(1);
		expect(await requests('pdl', '4xx')).toBe(1);
		expect(await timed('pdl')).toBe(2);
		expect(await requests('texas', '2xx')).toBeUndefined();
	});

	test('counts a request that got no answer as a network error', async () => {
		http.get(OFFICES, networkError());
		const { upstreamClient, requests } = await start();

		await expect(upstreamClient('texas', { timeout: 1000 }).get(OFFICES)).rejects.toThrow('fetch failed');

		expect(await requests('texas', 'network_error')).toBe(1);
	});

	test('gives up on an upstream that takes longer than its timeout, and counts that', async () => {
		http.get(OFFICES, { hang: true });
		const { upstreamClient, requests, timed } = await start();

		const failure = await rejectionOf(upstreamClient('pdl', { timeout: 20 }).get(OFFICES));

		expect(isTimeoutError(failure)).toBe(true);
		expect(await requests('pdl', 'timeout')).toBe(1);
		expect(await timed('pdl')).toBe(1);
	});

	test('throws when an answer fails its schema, though the request itself went fine', async () => {
		http.get(OFFICES, { json: { offices: 'none' } });
		const { upstreamClient, requests } = await start();

		const failure = await rejectionOf(
			upstreamClient('pdl', { timeout: 1000 }).get(OFFICES, {
				transform: schema(z.object({ offices: z.array(z.string()) })),
			})
		);

		expect(isValidationError(failure)).toBe(true);
		expect(await requests('pdl', '2xx')).toBe(1);
	});
});

describe('failureOf', () => {
	test('gives only the status of an HttpError, whose message and URL have the query', () => {
		const error = httpError(503, { error: 'PDL svarte ikke' }, { url: 'http://pdl-api.test/graphql?q=storgata+1' });

		expect(failureOf(error)).toEqual({ status: 503 });
	});

	test('gives where and why an answer failed its schema', async () => {
		const failure = await rejectionOf(
			Promise.resolve(
				schema(z.object({ offices: z.array(z.object({ enhetNr: z.string() })) }))({ offices: [{ enhetNr: 315 }] })
			)
		);

		expect(failureOf(failure)).toEqual({
			issues: ['offices.0.enhetNr: Invalid input: expected string, received number'],
		});
	});

	test('passes other errors on, for the logger to show', () => {
		const error = new TypeError('fetch failed');

		expect(failureOf(error)).toBe(error);
		expect(failureOf('oops')).toEqual({ error: 'oops' });
	});
});
