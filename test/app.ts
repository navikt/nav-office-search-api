import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
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
	const { createApp } = await import('../src/app.ts');
	const { loadNorgOfficeInfo } = await import('../src/norg-office-data.ts');
	const { metricsRegistry } = await import('../src/metrics.ts');

	const server = createApp(isReady).listen(0, '127.0.0.1');
	await once(server, 'listening');
	onTestFinished(
		() =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			})
	);
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	// A request the app never answers fails the test instead of hanging it
	const get = (path: string) => realFetch(`${origin}${path}`, { signal: AbortSignal.timeout(2000) });

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

	return { get, metric, loadOffices: loadNorgOfficeInfo, metricsRegistry };
};

export type TestApp = Awaited<ReturnType<typeof startApp>>;
