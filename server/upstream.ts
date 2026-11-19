import { createUpstreamClient } from '@navikt/navno-server/upstream';
import { metricsRegistry } from './metrics.ts';

// For a request made while a caller waits. nav-office-search gives up after 5 s, so an answer has to come sooner.
export const REQUEST_TIMEOUT_MS = 4000;

// Makes a corgi client for one upstream, counted and timed in the metrics under its name. It throws when the upstream
// doesn't answer 2xx in time, and when an answer fails its schema.
export const upstreamClient = createUpstreamClient({ registry: metricsRegistry, prefix: 'nav_office_search_api_' });
