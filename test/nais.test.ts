import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseEnv } from '#server/env.ts';

const read = (file: string) => readFileSync(new URL(`../.nais/${file}`, import.meta.url), 'utf-8');

const config = read('config.yml');

// What the pods get besides .nais/config.yml's env: NAIS injects Texas' endpoint
const fromPlatform = {
	NAIS_TOKEN_ENDPOINT: 'http://texas.test/api/v1/token',
};

describe.each(['vars-dev.yml', 'vars-prod.yml'])('%s', (file) => {
	const vars = read(file);
	const variable = (name: string) => vars.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1];
	const fromConfig: Record<string, string | undefined> = Object.fromEntries(
		[...config.matchAll(/- name: (\w+)\n\s+value: \{\{(\w+)\}\}/g)].map(([, name, value]) => [name, variable(value)])
	);

	test('gives the server all it needs', () => {
		expect(parseEnv({ ...fromConfig, ...fromPlatform })).toMatchObject(fromConfig);
	});

	test("asks Texas for a token to the PDL in the app's own cluster", () => {
		expect(fromConfig.PDL_TOKEN_TARGET).toBe(`api://${variable('cluster')}.pdl.pdl-api/.default`);
	});
});
