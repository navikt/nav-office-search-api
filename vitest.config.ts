import { defineConfig } from 'vitest/config';
import {
	DATA_FILES_DIR,
	NAIS_TOKEN_ENDPOINT,
	NAVNO_ORIGIN,
	NORG2_ORIGIN,
	PDL_ORIGIN,
	PDL_TOKEN_TARGET,
	XP_ORIGIN,
} from './test/fixtures.ts';

export default defineConfig({
	test: {
		include: ['server/**/*.test.ts', 'build/**/*.test.ts', 'test/**/*.test.ts'],
		env: {
			// server/env.ts reads these when the app's modules load; test/app.ts loads fresh ones for every test
			NORG2_ORIGIN,
			PDL_ORIGIN,
			PDL_TOKEN_TARGET,
			NAIS_TOKEN_ENDPOINT,
			XP_ORIGIN,
			NAVNO_ORIGIN,
			DATA_FILES_DIR,
		},
		// Under Vitest the logger writes through console, so only a failing test's logs are shown
		silent: 'passed-only',
		restoreMocks: true,
		unstubEnvs: true,
	},
});
