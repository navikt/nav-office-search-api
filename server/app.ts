import { logger } from '@navikt/navno-logger';
import { internal, traceRoutes } from '@navikt/navno-server';
import { Hono } from 'hono';
import { metricsRegistry } from './metrics.ts';
import { geoid } from './offices/route.ts';
import { adresse } from './pdl/adresse.ts';
import { bydel } from './pdl/bydel.ts';
import { search } from './search/route.ts';

export const createApp = (isReady: () => boolean) => {
	// strict: false matches /geoid/ as well as /geoid. Only the root app honours it.
	const app = new Hono({ strict: false });

	// First, so NAIS's OpenTelemetry names every request's trace after its route
	app.use(traceRoutes());

	app.route('/geoid', geoid);
	app.route('/adresse', adresse);
	app.route('/bydel', bydel);
	app.route('/search', search);
	// Probes and metrics for NAIS (.nais/config.yml). Not ready until the office map and the reference data are loaded
	// (main.ts).
	app.route('/internal', internal({ registry: metricsRegistry, ready: isReady }));

	// Logs the path, not the query, which holds what was searched for
	app.onError((err, c) => {
		logger.error('Request failed', { method: c.req.method, path: c.req.path }, err);
		return c.json({ error: 'Internal server error' }, 500);
	});

	return app;
};
