import { Counter, Gauge, Registry } from '@prometheus-io/client';

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

export const recordLookup = (
    operation: LookupOperation,
    result: LookupResult
) => {
    lookupsCounter.inc({ operation, result });
};

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

export const recordNorgRefreshSuccess = (
    geoIdsLoaded: number,
    failedOffices: number
) => {
    norgRefreshCounter.inc({ result: 'success' });
    norgLastSuccessGauge.setToCurrentTime();
    norgGeoIdsLoadedGauge.set(geoIdsLoaded);
    norgFailedOfficesGauge.set(failedOffices);
};

export const recordNorgRefreshFailure = () => {
    norgRefreshCounter.inc({ result: 'failure' });
};
