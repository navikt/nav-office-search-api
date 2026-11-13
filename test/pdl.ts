import { networkError } from '@itsy/corgi/testing';
import { expect } from 'vitest';
import type { TestApp } from './app.ts';
import { pdlErrorAnswer } from './fixtures.ts';

// The ways a PDL call can fail, as replies for the mocked fetch
export const pdlFailures = [
	['answers an HTTP error', { status: 503, json: pdlErrorAnswer('server_error') }],
	['answers GraphQL errors on HTTP 200', { json: pdlErrorAnswer('bad_request') }],
	['is unreachable', networkError()],
] as const;

// A rejected request: JSON error body, and the mocked fetch never called
export const expectRejected = async (res: Response, error: string, calls: readonly unknown[]) => {
	expect(res.status).toBe(400);
	expect(res.headers.get('content-type')).toBe('application/json');
	expect(await res.json()).toEqual({ error });
	expect(calls).toEqual([]);
};

// Expects lookups for the operation counted as hits, empty, error and invalid, in that order
export const expectLookups = async (app: TestApp, operation: string, expected: [number, number, number, number]) => {
	const counts = await Promise.all(
		['hits', 'empty', 'error', 'invalid'].map((result) =>
			app.metric('nav_office_search_api_lookups_total', { operation, result })
		)
	);
	expect(counts).toEqual(expected);
};

// The 502 PDL failures answer
export const expectPdlFailed = async (res: Response) => {
	expect(res.status).toBe(502);
	expect(res.headers.get('content-type')).toBe('application/json');
	expect(await res.json()).toEqual({ error: 'PDL request failed' });
};
