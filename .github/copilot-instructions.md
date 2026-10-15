# Copilot Instructions

## Project Overview

Express API (Node.js, TypeScript) that provides office lookup endpoints for a frontend app. It maps geographical IDs and addresses to NAV office information by aggregating data from two external services: NORG (office registry) and PDL (address lookup via GraphQL).

Runs on port 3003. Deployed as a Docker container.

## Architecture

### Data Flow

1. **Startup**: `loadNorgOfficeInfo()` fetches all active local offices from NORG, then for each office fetches its geographical areas. This builds an in-memory `geoIdToEnhetMap` (geoId → `{ enhetNr, navn }`).
2. **Scheduled refresh**: `node-schedule` re-runs `loadNorgOfficeInfo` daily at 05:00. The server reports not-ready (`503`) until a NORG office-data refresh succeeds.
3. **Request handling**: Functional endpoints do not perform application-level authentication. The public `-fss-pub.nais.io` ingresses are reachable without credentials; `accessPolicy.inbound` only controls internal service-to-service traffic. Outbound calls to PDL use a machine-to-machine token fetched from the NAIS token endpoint.

### Endpoints

| Route                              | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `GET /geoid?id=<geoId>`            | Looks up office info from the in-memory map               |
| `GET /adresse?queryString=<query>` | Freetext address search via PDL GraphQL (sokAdresse)      |
| `GET /bydel?postnummer=<nr>`       | Looks up district numbers for a four-digit postal code    |
| `GET /internal/isAlive`            | Liveness probe                                            |
| `GET /internal/isReady`            | Readiness probe (503 until initial load attempt finishes) |
| `GET /internal/metrics`            | Prometheus metrics (scraped by NAIS)                      |

### Caching Strategy

- **geoIdToEnhetMap** (office-data.ts): Module-level variable holding the full office→geoId mapping. Rebuilt entirely on each refresh. On partial fetch failure, previous data for that office is preserved.
- **PDL access token** (auth.ts): `node-cache` with TTL derived from token expiry (minus 60s buffer). Invalidated and refreshed automatically on 401 from PDL.

### External Dependencies (APIs)

- **NORG Enhet API** (`NORG_ENHET_API`): Office registry. Used to fetch active offices and their geographical areas (office-data.ts).
- **PDL API** (`PDL_API`): Persondataløsningen GraphQL API. Used for freetext address search via `sokAdresse` (adresse-search-handler.ts). Authenticated with a machine-to-machine Entra ID token obtained from the NAIS token endpoint.

## Metrics

`src/metrics.ts` defines business metrics with `@prometheus-io/client` (the official successor of `prom-client`) on a dedicated registry, exposed at `/internal/metrics` and scraped via `spec.prometheus` in the NAIS manifests. HTTP latency/status is covered by OTel auto-instrumentation and ingress metrics, so app metrics focus on business outcomes:

| Metric                                                      | Type      | Labels                                                                               |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `nav_office_search_api_lookups_total`                       | counter   | `operation` = geoid/adresse/bydel, `result` = hits/empty/invalid/error               |
| `nav_office_search_api_norg_refresh_total`                  | counter   | `result` = success/failure                                                           |
| `nav_office_search_api_norg_last_success_timestamp_seconds` | gauge     | –                                                                                    |
| `nav_office_search_api_norg_geoids_loaded`                  | gauge     | –                                                                                    |
| `nav_office_search_api_norg_refresh_failed_offices`         | gauge     | – (offices whose areas failed to load in the last refresh; stale data reused)        |

The `result` vocabulary and `operation` label deliberately match the nav-office-search frontend (`nav_office_search_*`), which measures the same lookups from the client side. Process metrics come from NAIS, and request latency from OTel/ingress, so they are not duplicated here.

Never use user input (geoIds, addresses, postnummer) as label values – keep cardinality low.

### Alerts

`.nais/alerts.yaml` (a `PrometheusRule`, deployed to prod-fss only by `deploy.prod.yml`) covers only what the frontend can't see. The frontend's alerts are the canary for user-facing failures, including PDL outages, and the metrics above are for diagnosing them:

- `NavOfficeSearchApiNorgDataStale`: no successful NORG refresh in 2 days. A failed refresh keeps the pods ready with the previous data, so nothing user-facing notices.
- `NavOfficeSearchApiPdlRejectingRequests`: PDL answers 4xx or GraphQL errors – access policy, Entra config or our queries, so ours to fix. PDL 5xx/network errors are PDL's.

Don't use `{{ }}` in the alert annotations: nais deploy templates every resource with Handlebars.

## Required Environment Variables

Declared in `src/global.d.ts`:

- `NORG_ENHET_API` – Base URL for NORG office API
- `PDL_API` – Base URL for PDL API (GraphQL endpoint appended as `/graphql`)
- `NAIS_TOKEN_ENDPOINT` – NAIS token endpoint for machine-to-machine tokens (provided by NAIS runtime)
- `NAIS_CLUSTER_NAME` – Cluster name used to construct the PDL token audience (provided by NAIS runtime)
- `PDL_DEVELOPMENT_TOKEN` – (Optional) Skips NAIS token exchange; used for local development

## Tech Stack

- **Runtime**: Node.js with ES modules (`"type": "module"`)
- **Language**: TypeScript (strict mode, nodenext module resolution)
- **Framework**: Express
- **Package manager**: pnpm
- **Linting**: ESLint with typescript-eslint
- **Key libraries**: `graphql` + `graphql-request` (PDL queries), `node-cache` (token caching), `node-schedule` (cron), `@prometheus-io/client` (metrics)

## Build & Run

- `pnpm run build` – Compiles TS to `distSrc/`
- `pnpm run dev` – Build + run with dotenv
- `pnpm run start` – Run compiled JS
- `pnpm run lint` – ESLint
- `pnpm run test` – Build and run the Node.js test suite

## Deployment

### Why FSS

This app runs in **fss** (fagsystemsonen) because it needs direct network access to PDL, which is available on the internal fss network. The frontend (`nav-office-search` in GCP) calls this API via the `-fss-pub.nais.io` ingress.

### NAIS Configuration

NAIS app manifests live in `.nais/`:

- `config.dev.yaml` – dev-fss cluster config
- `config.prod.yaml` – prod-fss cluster config

Key settings:

- `azure.application.enabled: true` – provisions Azure AD credentials automatically
- `accessPolicy.inbound` – allows internal service traffic from `nav-office-search` (and `tokenx-token-generator` in dev); it does not protect the public ingresses
- `accessPolicy.outbound` – allows calls to `pdl-api` in the `pdl` namespace
- Observability: logs to OpenSearch, OpenTelemetry auto-instrumentation enabled for Node.js, Prometheus scraping of `/internal/metrics`
- Prod runs 2 replicas; dev runs 1

### GitHub Actions Workflows

- **Deploy to prod** (`deploy.prod.yml`): Triggers on push to `main` or manually. Builds, pushes Docker image, deploys to `prod-fss`, then creates a GitHub Release with auto-generated release notes.
- **Deploy to dev** (`deploy.dev.yml`): Manual trigger only (`workflow_dispatch`).
- **Test pull request** (`pr-test.yml`): Runs lint, build, and tests for pull requests.
- All workflows use the reusable workflows in `navikt/navno-ci` (`node-build.yml`, `nais-deploy.yml`, `release.yml`, `dependabot-lockfile.yml`), which are built on `navikt/navno-actions`. The build runs: pnpm install → build → lint → test → reinstall production dependencies → Docker build+push; then `nais-deploy.yml` deploys. Node version comes from `engines.node` in package.json.

## Conventions

- All local imports use `.js` extension (required for nodenext module resolution)
- Error responses use the `ErrorResponse` type from `fetch.ts` with `{ error: true, statusCode, message }`
- The `fetchJson` helper handles query string building, JSON parsing, and error wrapping (used by NORG calls)
- PDL calls use `graphql-request` directly with typed responses
