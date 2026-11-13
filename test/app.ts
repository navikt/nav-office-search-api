import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { onTestFinished, vi } from 'vitest';

// The real fetch, kept before a test file installs corgi's mock as the global, for requests to the app itself
const realFetch = globalThis.fetch;

type Options = {
	isReady?: () => boolean;
};

// A fresh copy of the app on a free port. The office map, the metrics registry and the token cache are module
// state, so every test gets new modules.
export const startApp = async ({ isReady = () => true }: Options = {}) => {
	vi.resetModules();
	const { createApp } = await import('#server/app.ts');
	const { loadNorgOfficeInfo } = await import('#server/offices/offices.ts');
	const { metricsRegistry } = await import('#server/metrics.ts');

	const app = createApp(isReady);
	const port = await new Promise<number>((resolve) => {
		const server = serve(
			{ fetch: app.fetch, port: 0, hostname: '127.0.0.1', overrideGlobalObjects: false },
			(info: AddressInfo) => resolve(info.port)
		);
		onTestFinished(
			() =>
				new Promise<void>((done) => {
					if ('closeAllConnections' in server) {
						server.closeAllConnections();
					}
					server.close(() => done());
				})
		);
	});
	const origin = `http://127.0.0.1:${port}`;

	// A request the app never answers fails the test instead of hanging it
	const request = (path: string, init: RequestInit = {}) =>
		realFetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(2000) });
	const get = (path: string) => request(path);

	// One sample from /internal/metrics; labels in the order the metric declares them
	const metric = async (name: string, labels: Record<string, string> = {}) => {
		const text = await (await get('/internal/metrics')).text();
		const labelText = Object.entries(labels)
			.map(([key, value]) => `${key}="${value}"`)
			.join(',');
		const series = labelText ? `${name}{${labelText}} ` : `${name} `;
		const line = text.split('\n').find((l) => l.startsWith(series));
		return line === undefined ? undefined : Number(line.slice(series.length));
	};

	return { get, request, metric, loadOffices: loadNorgOfficeInfo, metricsRegistry };
};

export type TestApp = Awaited<ReturnType<typeof startApp>>;
