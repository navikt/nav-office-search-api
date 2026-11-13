# Copilot Instructions

## Project Overview

Express API (Node.js, TypeScript) that provides office lookup endpoints for a frontend app. It maps geographical IDs and addresses to NAV office information by aggregating data from two external services: NORG (office registry) and PDL (address lookup via GraphQL).

Runs on port 3003. Deployed as a Docker container.

## Architecture

### Layout

```
server/
  main.ts          starts the server: first NORG load, daily refresh, shutdown
  app.ts           the Express app: routes and probes
  env.ts           the environment, checked with zod at startup
  metrics.ts       business metrics
  fetch.ts         fetchJson (NORG) and the ErrorResponse type
  offices/
    offices.ts     the geoId → office map, loaded from NORG
    route.ts       GET /geoid
  pdl/
    adresse.ts     GET /adresse
    bydel.ts       GET /bydel
    client.ts      PDL GraphQL requests, the retry after a 401
    token.ts       the token for PDL from the NAIS token endpoint
    types.ts       PDL's answers and ours
  *.test.ts        next to the code they test
test/              test helpers: the app on a free port, the fetch mock, fixtures
  mocks/dev.ts     answers NORG, PDL and Texas from the fixtures in `pnpm dev`
```

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

- **geoIdToEnhetMap** (`server/offices/offices.ts`): Module-level variable holding the full office→geoId mapping. Rebuilt entirely on each refresh. On partial fetch failure, previous data for that office is preserved.
- **PDL access token** (`server/pdl/token.ts`): `node-cache` with TTL derived from token expiry (minus 60s buffer). Invalidated and refreshed automatically on 401 from PDL.

### External Dependencies (APIs)

- **NORG Enhet API** (`NORG2_ORIGIN`): Office registry. Used to fetch active offices and their geographical areas (`server/offices/offices.ts`).
- **PDL API** (`PDL_ORIGIN`): Persondataløsningen GraphQL API. Used for freetext address search and bydeler via `sokAdresse` (`server/pdl/`). Authenticated with a machine-to-machine Entra ID token for `PDL_TOKEN_TARGET`, obtained from the NAIS token endpoint.

## Metrics

`server/metrics.ts` defines business metrics with `@prometheus-io/client` (the official successor of `prom-client`) on a dedicated registry, exposed at `/internal/metrics` and scraped via `spec.prometheus` in the NAIS manifests. HTTP latency/status is covered by OTel auto-instrumentation and ingress metrics, so app metrics focus on business outcomes:

| Metric                                                      | Type    | Labels                                                                        |
| ----------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `nav_office_search_api_lookups_total`                       | counter | `operation` = geoid/adresse/bydel, `result` = hits/empty/invalid/error        |
| `nav_office_search_api_norg_refresh_total`                  | counter | `result` = success/failure                                                    |
| `nav_office_search_api_norg_last_success_timestamp_seconds` | gauge   | –                                                                             |
| `nav_office_search_api_norg_geoids_loaded`                  | gauge   | –                                                                             |
| `nav_office_search_api_norg_refresh_failed_offices`         | gauge   | – (offices whose areas failed to load in the last refresh; stale data reused) |

The `result` vocabulary and `operation` label deliberately match the nav-office-search frontend (`nav_office_search_*`), which measures the same lookups from the client side. Process metrics come from NAIS, and request latency from OTel/ingress, so they are not duplicated here.

Never use user input (geoIds, addresses, postnummer) as label values – keep cardinality low.

### Alerts

`.nais/alerts.yml` (a `PrometheusRule`, deployed to prod-fss only by `deploy.prod.yml`) covers only what the frontend can't see. The frontend's alerts are the canary for user-facing failures, including PDL outages, and the metrics above are for diagnosing them:

- `NavOfficeSearchApiNorgDataStale`: no successful NORG refresh in 2 days. A failed refresh keeps the pods ready with the previous data, so nothing user-facing notices.
- `NavOfficeSearchApiPdlRejectingRequests`: PDL answers 4xx or GraphQL errors – access policy, Entra config or our queries, so ours to fix. PDL 5xx/network errors are PDL's.

Don't use `{{ }}` in the alert annotations: nais deploy templates every resource with Handlebars.

## Required Environment Variables

`server/env.ts` checks them with zod when the server starts, so a pod with a missing or malformed variable stops before it takes traffic. Nothing else reads `process.env`.

- `NORG2_ORIGIN` – NORG's origin; the code adds `/norg2/api/v1/enhet`
- `PDL_ORIGIN` – PDL's origin; the code adds `/graphql`
- `PDL_TOKEN_TARGET` – the audience of PDL's tokens, e.g. `api://dev-fss.pdl.pdl-api/.default`
- `NAIS_TOKEN_ENDPOINT` – Texas, NAIS's token service (injected by NAIS)
- `PDL_DEVELOPMENT_TOKEN` – (Optional) a token for PDL instead of asking Texas; for local development
- `PORT` – (Optional) defaults to 3003

The first three come from `.nais/vars-*.yml`. Locally, `.env.development` points them at test hosts that `test/mocks/dev.ts` answers.

## Tech Stack

- **Runtime**: Node.js with ES modules (`"type": "module"`). Node runs the TypeScript directly and strips the types; there is no build step
- **Language**: TypeScript (strict mode, nodenext module resolution)
- **Framework**: Express
- **Package manager**: pnpm
- **Linting and formatting**: ESLint with typescript-eslint; oxfmt (`oxfmt.config.ts`)
- **Key libraries**: `graphql` + `graphql-request` (PDL queries), `node-cache` (token caching), `node-schedule` (cron), `@prometheus-io/client` (metrics)

## Build & Run

- `pnpm run dev` – Run `server/main.ts` with `--watch`, offline: it reads `.env.development`, and `test/mocks/dev.ts` (loaded with `--import`) answers NORG, PDL and Texas from `test/fixtures.ts`. `MOCKS=false` with real values in the shell goes to the real services
- `pnpm run start` – Run `server/main.ts`
- `pnpm run format` – Format with oxfmt
- `pnpm run lint` – oxfmt check, ESLint, then `tsc --noEmit` over `server/`, `test/` and the config files
- `pnpm run test` – Vitest on the TypeScript source. Each test starts a fresh copy of the app on a free port (`test/app.ts`) and asks it over HTTP; NORG, PDL and Texas are answered by corgi's `mockFetch` (`test/fetch.ts`, `test/fixtures.ts`). A test file sits next to the code it tests. Today's wrong behaviour is pinned in tests named `(bug)`

## Deployment

### Why FSS

This app runs in **fss** (fagsystemsonen) because it needs direct network access to PDL, which is available on the internal fss network. The frontend (`nav-office-search` in GCP) calls this API via the `-fss-pub.nais.io` ingress.

### NAIS Configuration

NAIS app manifests live in `.nais/`:

- `config.yml` – the app, a Handlebars template that nais deploy renders
- `vars-dev.yml` – its values for dev-fss
- `vars-prod.yml` – its values for prod-fss
- `alerts.yml` – the alerts, prod only

`test/nais.test.ts` checks that each vars file gives the server a valid environment.

Key settings:

- `azure.application.enabled: true` – provisions Azure AD credentials automatically
- `accessPolicy.inbound` – allows internal service traffic from `nav-office-search` (and `tokenx-token-generator` in dev); it does not protect the public ingresses
- `accessPolicy.outbound` – allows calls to `pdl-api` in the `pdl` namespace
- Observability: logs to OpenSearch, OpenTelemetry auto-instrumentation enabled for Node.js, Prometheus scraping of `/internal/metrics`
- Prod runs 2 replicas; dev runs 1

### GitHub Actions Workflows

- **Build and deploy to prod** (`build-deploy-prod.yml`): Reusable workflow (`workflow_call`) shared by the two below. Builds, pushes Docker image, deploys the app and then `.nais/alerts.yml` to `prod-fss`.
- **Deploy to prod** (`deploy.prod.yml`): Triggers on push to `main` or manually. Runs `build-deploy-prod.yml`, then creates a GitHub Release with auto-generated release notes.
- **Refresh base image** (`base-image-refresh.yml`): Sundays 23:17 Oslo time, or manually from `main`. Runs `build-deploy-prod.yml` so prod gets the newest base image. No release.
- **Deploy to dev** (`deploy.dev.yml`): Manual trigger only (`workflow_dispatch`).
- **Test pull request** (`pr-test.yml`): Runs lint and tests for pull requests.
- All workflows use the reusable workflows in `navikt/navno-ci` (`node-build.yml`, `nais-deploy.yml`, `release.yml`, `dependabot-lockfile.yml`), which are built on `navikt/navno-actions`. The build runs: pnpm install → lint → test (there is no `build` script, so that step is skipped) → reinstall production dependencies → Docker build+push of `package.json`, `node_modules` and `server/` (`.dockerignore` keeps the tests out); then `nais-deploy.yml` deploys. Node version comes from `engines.node` in package.json.

## Conventions

- Imports name the `.ts` file, and type-only imports use `import type`. `erasableSyntaxOnly` and `verbatimModuleSyntax` keep the code to TypeScript that Node can strip. Imports across top-level folders use `#server/*` and `#test/*` (package.json `imports`)
- Error responses use the `ErrorResponse` type from `fetch.ts` with `{ error: true, statusCode, message }`
- The `fetchJson` helper handles query string building, JSON parsing, and error wrapping (used by NORG calls)
- PDL calls use `graphql-request` directly with typed responses
