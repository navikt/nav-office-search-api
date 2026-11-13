import { readFileSync } from 'node:fs';
import { parseEnv as parseEnvFile } from 'node:util';
import { describe, expect, test, vi } from 'vitest';
import { NAIS_TOKEN_ENDPOINT, NORG2_ORIGIN, PDL_ORIGIN, PDL_TOKEN_TARGET } from '#test/fixtures.ts';
import { parseEnv } from './env.ts';

const valid = {
	NORG2_ORIGIN: 'https://norg2.test',
	PDL_ORIGIN: 'https://pdl-api.test',
	PDL_TOKEN_TARGET: 'api://test-fss.pdl.pdl-api/.default',
	NAIS_TOKEN_ENDPOINT: 'http://texas.test/api/v1/token',
};

test('gives back the configuration, and leaves out what the server has no use for', () => {
	expect(parseEnv({ ...valid, PATH: '/usr/bin', NAIS_CLUSTER_NAME: 'dev-fss' })).toEqual({ ...valid, PORT: 3003 });
});

describe('PORT', () => {
	test.each([
		[undefined, 3003],
		['8080', 8080],
	])('%s means %i', (PORT, port) => {
		expect(parseEnv({ ...valid, PORT }).PORT).toBe(port);
	});

	test.each(['0', '-1', '30.5', 'http', ''])('rejects %j', (PORT) => {
		expect(() => parseEnv({ ...valid, PORT })).toThrow('at PORT');
	});
});

describe('PDL_DEVELOPMENT_TOKEN', () => {
	test('is optional', () => {
		expect(parseEnv(valid).PDL_DEVELOPMENT_TOKEN).toBeUndefined();
	});

	test('is kept when set', () => {
		expect(parseEnv({ ...valid, PDL_DEVELOPMENT_TOKEN: 'token' }).PDL_DEVELOPMENT_TOKEN).toBe('token');
	});

	test('rejects an empty one, which would otherwise mean "ask Texas"', () => {
		expect(() => parseEnv({ ...valid, PDL_DEVELOPMENT_TOKEN: '' })).toThrow('at PDL_DEVELOPMENT_TOKEN');
	});
});

test.each(Object.keys(valid))('requires %s', (name) => {
	expect(() => parseEnv({ ...valid, [name]: undefined })).toThrow(`at ${name}`);
});

test.each(Object.keys(valid))('rejects an empty %s', (name) => {
	expect(() => parseEnv({ ...valid, [name]: '' })).toThrow(`at ${name}`);
});

test.each(['NORG2_ORIGIN', 'PDL_ORIGIN', 'NAIS_TOKEN_ENDPOINT'])('requires %s to be a URL', (name) => {
	expect(() => parseEnv({ ...valid, [name]: 'pdl-api.intern.nav.no' })).toThrow(`at ${name}`);
});

test('reports everything wrong at once, by name', () => {
	expect(() => parseEnv({ ...valid, NORG2_ORIGIN: undefined, PDL_ORIGIN: 'nope' })).toThrow(
		/Invalid environment variables:[\s\S]*at NORG2_ORIGIN[\s\S]*at PDL_ORIGIN/
	);
});

test("doesn't put the values in the message, since it ends up in the logs", () => {
	const message = (() => {
		try {
			parseEnv({ ...valid, PDL_ORIGIN: 'hemmelig-verdi', PDL_DEVELOPMENT_TOKEN: '' });
			return '';
		} catch (e) {
			return (e as Error).message;
		}
	})();

	expect(message).toContain('at PDL_ORIGIN');
	expect(message).not.toContain('hemmelig-verdi');
});

test('stops the server from loading when a variable is missing, before it takes traffic', async () => {
	vi.stubEnv('PDL_ORIGIN', undefined);
	vi.resetModules();

	await expect(import('#server/app.ts')).rejects.toThrow('at PDL_ORIGIN');
});

test('`pnpm dev` reads the hosts test/mocks/dev.ts answers, so it runs offline', () => {
	const file = readFileSync(new URL('../.env.development', import.meta.url), 'utf-8');

	expect(parseEnv(parseEnvFile(file))).toEqual({
		NORG2_ORIGIN,
		PDL_ORIGIN,
		PDL_TOKEN_TARGET,
		NAIS_TOKEN_ENDPOINT,
		PORT: 3003,
	});
});
