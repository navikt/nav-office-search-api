import { defineConfig } from 'vitest/config';
import { NAIS_TOKEN_ENDPOINT, NORG_ENHET_API, PDL_API } from './test/fixtures.ts';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		env: {
			// The app reads these from process.env when it needs them
			NORG_ENHET_API,
			PDL_API,
			NAIS_TOKEN_ENDPOINT,
			NAIS_CLUSTER_NAME: 'test-fss',
		},
		// The app logs with console.*; show it only for a failing test
		silent: 'passed-only',
		restoreMocks: true,
		unstubEnvs: true,
	},
});
