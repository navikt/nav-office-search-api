import { logger, traceRoute } from '@navikt/navno-logger';
import { Hono } from 'hono';
import { routePath } from 'hono/route';
import { internal } from './internal.ts';
import { geoid } from './offices/route.ts';
import { adresse } from './pdl/adresse.ts';
import { bydel } from './pdl/bydel.ts';

export const createApp = (isReady: () => boolean) => {
	// strict: false matches /geoid/ as well as /geoid. Only the root app honours it.
	const app = new Hono({ strict: false });

	// First, so NAIS's OpenTelemetry names every request's trace after its route
	app.use(async (c, next) => {
		await next();
		traceRoute(routePath(c));
	});

	app.route('/geoid', geoid);
	app.route('/adresse', adresse);
	app.route('/bydel', bydel);
	app.route('/internal', internal(isReady));

	// Logs the path, not the query, which holds what was searched for
	app.onError((err, c) => {
		logger.error('Request failed', { method: c.req.method, path: c.req.path }, err);
		return c.json({ error: 'Internal server error' }, 500);
	});

	return app;
};
