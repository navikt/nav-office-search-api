import { defineConfig } from 'vitest/config';
import { NAIS_TOKEN_ENDPOINT, NORG2_ORIGIN, PDL_ORIGIN, PDL_TOKEN_TARGET } from './test/fixtures.ts';

export default defineConfig({
	test: {
		include: ['server/**/*.test.ts', 'test/**/*.test.ts'],
		env: {
			// server/env.ts reads these when the app's modules load; test/app.ts loads fresh ones for every test
			NORG2_ORIGIN,
			PDL_ORIGIN,
			PDL_TOKEN_TARGET,
			NAIS_TOKEN_ENDPOINT,
		},
		// The app logs with console.*; show it only for a failing test
		silent: 'passed-only',
		restoreMocks: true,
		unstubEnvs: true,
	},
});
