import { isTimeoutError } from '@itsy/corgi';
import { Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';
import { createMiddleware } from 'hono/factory';

// Dedicated registry (not the global default) so only our business metrics
// are exposed, and tests can inspect/reset it in isolation.
export const metricsRegistry = new Registry();

export const lookupOperations = ['geoid', 'adresse', 'bydel'] as const;
export type LookupOperation = (typeof lookupOperations)[number];

// Same vocabulary as the nav-office-search frontend's search outcomes
// hits    - valid request with at least one result
// empty   - valid request, but no results (unknown geoid, no address hits, no bydeler)
// invalid - rejected due to missing/invalid input (4xx)
// error   - upstream (PDL) or internal failure (5xx)
export const lookupResults = ['hits', 'empty', 'invalid', 'error'] as const;
export type LookupResult = (typeof lookupResults)[number];

const lookupsCounter = new Counter({
	name: 'nav_office_search_api_lookups_total',
	help: 'Number of lookups handled, by operation and result',
	labelNames: ['operation', 'result'] as const,
	registers: [metricsRegistry],
});

// Initialize all label combinations to 0, so rate()/increase() work from the first scrape
for (const operation of lookupOperations) {
	for (const result of lookupResults) {
		lookupsCounter.inc({ operation, result }, 0);
	}
}

// What a route found, for countLookup. A route sets it with c.set('lookupResult', ...) when it answers 200 or 404.
export type LookupEnv = { Variables: { lookupResult?: 'hits' | 'empty' } };

// Counts the lookup once the route has answered. What the route set wins; without it, the status decides.
export const countLookup = (operation: LookupOperation) =>
	createMiddleware<LookupEnv>(async (c, next) => {
		await next();
		const { status } = c.res;
		const result = c.get('lookupResult') ?? (status >= 500 ? 'error' : status >= 400 ? 'invalid' : 'hits');
		lookupsCounter.inc({ operation, result });
	});

const norgRefreshCounter = new Counter({
	name: 'nav_office_search_api_norg_refresh_total',
	help: 'Number of NORG office data refresh attempts, by result',
	labelNames: ['result'] as const,
	registers: [metricsRegistry],
});

norgRefreshCounter.inc({ result: 'success' }, 0);
norgRefreshCounter.inc({ result: 'failure' }, 0);

const norgLastSuccessGauge = new Gauge({
	name: 'nav_office_search_api_norg_last_success_timestamp_seconds',
	help: 'Unix time of the last successful NORG office data refresh',
	registers: [metricsRegistry],
});

const norgGeoIdsLoadedGauge = new Gauge({
	name: 'nav_office_search_api_norg_geoids_loaded',
	help: 'Number of geoIds currently mapped to an office',
	registers: [metricsRegistry],
});

const norgFailedOfficesGauge = new Gauge({
	name: 'nav_office_search_api_norg_refresh_failed_offices',
	help: 'Number of offices whose geographic areas could not be fetched in the last successful refresh (previous data reused)',
	registers: [metricsRegistry],
});

export const recordNorgRefreshSuccess = (geoIdsLoaded: number, failedOffices: number) => {
	norgRefreshCounter.inc({ result: 'success' });
	norgLastSuccessGauge.setToCurrentTime();
	norgGeoIdsLoadedGauge.set(geoIdsLoaded);
	norgFailedOfficesGauge.set(failedOffices);
};

export const recordNorgRefreshFailure = () => {
	norgRefreshCounter.inc({ result: 'failure' });
};

// Outbound requests made through upstreamClient() (upstream.ts). Named and labelled as in the nav-office-search
// frontend, which counts its own the same way.
export type Upstream = 'pdl' | 'texas' | 'norg' | 'xp';

const upstreamRequestsCounter = new Counter({
	name: 'nav_office_search_api_upstream_requests_total',
	help: 'Outbound requests by upstream and response status class (2xx, 4xx, 5xx, …), timeout or network_error',
	labelNames: ['upstream', 'status'] as const,
	registers: [metricsRegistry],
});

const upstreamDurationHistogram = new Histogram({
	name: 'nav_office_search_api_upstream_request_duration_seconds',
	help: 'Outbound request time until response headers, by upstream',
	labelNames: ['upstream'] as const,
	buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
	registers: [metricsRegistry],
});

// Runs an outbound request and records its status class and how long the answer took. A request that never got an
// answer counts as a timeout or a network_error.
export const observeUpstream = async (upstream: Upstream, request: () => Promise<Response>) => {
	const stopTimer = upstreamDurationHistogram.startTimer({ upstream });
	try {
		const response = await request();
		upstreamRequestsCounter.inc({ upstream, status: `${Math.floor(response.status / 100)}xx` });
		return response;
	} catch (e) {
		upstreamRequestsCounter.inc({ upstream, status: isTimeoutError(e) ? 'timeout' : 'network_error' });
		throw e;
	} finally {
		stopTimer();
	}
};

// The codes PDL gives its GraphQL errors. One it adds later is counted as other.
const pdlErrorCodes = new Set(['unauthenticated', 'unauthorized', 'not_found', 'bad_request', 'server_error']);

const pdlErrorsCounter = new Counter({
	name: 'nav_office_search_api_pdl_errors_total',
	help: "GraphQL errors in PDL's answers, by PDL's error code. PDL reports some failures on HTTP 200",
	labelNames: ['code'] as const,
	registers: [metricsRegistry],
});

for (const code of [...pdlErrorCodes, 'other']) {
	pdlErrorsCounter.inc({ code }, 0);
}

export const recordPdlErrors = (codes: string[]) => {
	for (const code of codes) {
		pdlErrorsCounter.inc({ code: pdlErrorCodes.has(code) ? code : 'other' });
	}
};

// The reference data the search will read (data/data.ts). Named as in the nav-office-search frontend, which loads
// the same data today, so the two can be compared by dataset.
const dataLoadsCounter = new Counter({
	name: 'nav_office_search_api_data_loads_total',
	help: 'Reference data loads (startup and the daily refresh) by outcome: success, or failure when a source failed or the new data was too small. A failed load keeps the data in use.',
	labelNames: ['outcome'] as const,
	registers: [metricsRegistry],
});

dataLoadsCounter.inc({ outcome: 'success' }, 0);
dataLoadsCounter.inc({ outcome: 'failure' }, 0);

const dataLoadDurationGauge = new Gauge({
	name: 'nav_office_search_api_data_load_duration_seconds',
	help: 'Duration of the last successful reference data load',
	registers: [metricsRegistry],
});

const dataLastSuccessGauge = new Gauge({
	name: 'nav_office_search_api_data_last_success_timestamp_seconds',
	help: 'Unix time of the last successful reference data load',
	registers: [metricsRegistry],
});

const referenceDataEntriesGauge = new Gauge({
	name: 'nav_office_search_api_reference_data_entries',
	help: 'Entries in the loaded reference data, by dataset',
	labelNames: ['dataset'] as const,
	registers: [metricsRegistry],
});

const referenceDataWithoutOfficeGauge = new Gauge({
	name: 'nav_office_search_api_reference_data_without_office',
	help: 'Kommuner, bydeler and poststeder the last load could not find an office for',
	labelNames: ['dataset'] as const,
	registers: [metricsRegistry],
});

export const recordDataLoadSuccess = (
	durationSeconds: number,
	entries: Record<string, number>,
	withoutOffice: Record<string, number>
) => {
	dataLoadsCounter.inc({ outcome: 'success' });
	dataLoadDurationGauge.set(durationSeconds);
	dataLastSuccessGauge.setToCurrentTime();

	for (const [dataset, count] of Object.entries(entries)) {
		referenceDataEntriesGauge.set({ dataset }, count);
	}
	for (const [dataset, count] of Object.entries(withoutOffice)) {
		referenceDataWithoutOfficeGauge.set({ dataset }, count);
	}
};

export const recordDataLoadFailure = () => {
	dataLoadsCounter.inc({ outcome: 'failure' });
};
