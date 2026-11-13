import { Hono } from 'hono';
import { metricsRegistry } from './metrics.ts';

// Probes and metrics for NAIS (.nais/config.yml). Not ready until the offices are loaded (main.ts).
export const internal = (isReady: () => boolean) =>
	new Hono()
		.get('/isAlive', (c) => c.text('I am alive!'))
		.get('/isReady', (c) => (isReady() ? c.text('I am ready!') : c.text('I am not ready...', 503)))
		.get('/metrics', async (c) =>
			c.body(await metricsRegistry.metrics(), 200, { 'Content-Type': metricsRegistry.contentType })
		);
