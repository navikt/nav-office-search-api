# Copilot Instructions

## Project Overview

Hono API (Node.js, TypeScript) that provides office lookup endpoints for a frontend app. It maps geographical IDs and addresses to NAV office information by aggregating data from two external services: NORG (office registry) and PDL (address lookup via GraphQL).

The service also builds the reference data the office search needs: each kommune's and bydel's office, the bydeler, the kommuner and every poststed. It is built at start and every morning from NORG, from XP's list of office pages, and from two files the image carries: Bring's register of every postnummer and SSB's list of bydeler. The build downloads those two, since a pod in FSS can't reach Bring. `GET /search` is the office search itself, answered from that data and from PDL. nav-office-search doesn't ask it yet: it still uses `/geoid`, `/adresse` and `/bydel`, which stay until it has switched. A pod is ready once the reference data and the old office map have each loaded.

Runs on port 3003. Deployed as a Docker container.

## Architecture

### Layout

```
build/             what `pnpm build` runs, on the GitHub runner. Not in the image
  main.ts          downloads the two files, or ends the build with the error
  download.ts      fetches both, checks them, writes them to server/data/files
  bring.ts         Bring's postnummer register: its address, encoding and rows
  ssb.ts           SSB's bydeler: the version of the classification that is valid now
  http.ts          the client they download with: 30 s per attempt, two retries
server/
  main.ts          starts the server with @navikt/navno-server's serve(), which has the keep-alive and the shutdown:
                   the NORG load and the reference data load, both again every morning
  app.ts           the Hono app: mounts the routes and navno-server's internal() (/internal/alive, /internal/ready,
                   /internal/metrics), names traces with its traceRoutes(), answers a thrown error with 500
  env.ts           the environment, checked with zod at startup
  metrics.ts       business metrics, and countLookup, the middleware that counts a route's lookups
  schedule.ts      everyMorning: a job at 05:00 UTC, with croner
  upstream.ts      upstreamClient: navno-server's corgi client with a timeout, counted and timed in our metrics
  fetch.ts         fetchJson, which the NORG loader still uses
  data/
    data.ts        the reference data: loadData (all or nothing), the data in use, refreshData for start and 05:00
    norg.ts        NORG on corgi: the active local offices and the areas each serves
    offices.ts     XP's office pages, and NORG's offices joined with them
    bydeler.ts, kommuner.ts, poststeder.ts   build those from the sources
    withoutOffice.ts   the areas a load found no office for, for its log and gauges
    types.ts       the reference data's types, as nav-office-search has them
    normalizeString.ts  folds a name for comparing; nav-office-search's client has the same
    files.ts       the two downloaded files: where they are, their shapes (zod), and reading them
    files/         written by `pnpm build`, not in git
  offices/
    offices.ts     the geoId → office map, loaded from NORG
    route.ts       GET /geoid
  search/
    route.ts       GET /search
    search.ts      the one search: a postnummer, else a name, else an address
    postnr.ts, name.ts, address.ts   the three kinds, as nav-office-search had them
    results.ts     what /search answers with, the types nav-office-search's browser code reads
    sort.ts, removeDuplicates.ts
  pdl/
    adresse.ts     GET /adresse
    bydel.ts       GET /bydel
    client.ts      pdlQuery: one GraphQL query to PDL, with its token, deadline, errors and second try
    token.ts       the token for PDL, from Texas (the NAIS token endpoint)
  *.test.ts        next to the code they test
test/              test helpers: the app on a free port, the fetch mock, fixtures
  fixtures/        a snapshot of NORG, XP and the two data files that fits together (see its README)
  snapshot.ts      answers NORG and XP from that snapshot
  mocks/dev.ts     answers NORG, XP, PDL and Texas in `pnpm dev`
```

### Data Flow

0. **Build**: `pnpm build` (`build/main.ts`) downloads Bring's register and SSB's bydeler, checks them (complete rows, at least 2,500 rows and 15 bydeler) and writes `server/data/files/postnrRegister.json` and `bydeler.json`, each with the time it was fetched. A download or a check that fails ends the build, so the previous image keeps running.
1. **Reference data**: `refreshData()` (`server/data/data.ts`) runs at start and at 05:00. `loadData()` asks XP for the office pages and NORG for its active local offices and their areas (8 offices at a time), reads the two files, and builds `offices`, `bydeler`, `kommuner` and `poststeder`. It is all or nothing: when a source fails, or a dataset is below its floor (offices 200, bydeler 15, poststeder 2,500, kommuner 150), the load throws, `Loading data failed` is logged and the data in use stays. With no data in use, as after a first load that fails, the load is tried again every minute until one succeeds. A 404 from NORG for one office means it has no areas. `/search` reads the data, and a pod isn't ready until a load has succeeded. The three older endpoints answer without it. The NORG loader below still runs beside it, so NORG is asked twice.
2. **Startup**: `loadNorgOfficeInfo()` fetches all active local offices from NORG, then for each office fetches its geographical areas. This builds an in-memory `geoIdToEnhetMap` (geoId → `{ enhetNr, navn }`).
3. **Scheduled refresh**: `everyMorning()` (`server/schedule.ts`, croner) re-runs `loadNorgOfficeInfo` and `refreshData` daily at 05:00 UTC, whatever the machine's time zone. A run that throws is logged and the schedule keeps going. The server reports not-ready (`503`) until the office map and the reference data have each loaded once. It never exits over a failed load: it stays not ready and keeps trying.
4. **Request handling**: Functional endpoints do not perform application-level authentication. The public `-fss-pub.nais.io` ingresses are reachable without credentials; `accessPolicy.inbound` only controls internal service-to-service traffic. Outbound calls to PDL use a machine-to-machine token fetched from the NAIS token endpoint.
5. **A PDL lookup** (`pdlQuery` in `server/pdl/client.ts`): asks Texas for the token, posts the query, reads the answer's `errors` first and then checks its `data` against the query's zod schema. The token request, the query and a second try share one 4 s deadline (`REQUEST_TIMEOUT_MS`), since nav-office-search gives up after 5 s. Past the deadline the route answers 504; any other failure is 502. When PDL refuses the token (HTTP 401, or a GraphQL error with code `unauthenticated`), the query is tried once more with a token Texas hasn't kept.

### Endpoints

| Route                              | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `GET /geoid?id=<geoId>`            | Looks up office info from the in-memory map            |
| `GET /adresse?queryString=<query>` | Freetext address search via PDL GraphQL (sokAdresse)   |
| `GET /bydel?postnummer=<nr>`       | Looks up district numbers for a four-digit postal code |
| `GET /search?query=<text>`         | The office search: a postnummer, a name or an address  |
| `GET /internal/alive`              | Liveness probe                                         |
| `GET /internal/ready`              | Readiness probe (503 until both loads have succeeded)  |
| `GET /internal/metrics`            | Prometheus metrics (scraped by NAIS)                   |

Each route module exports its own `Hono` app, which `server/app.ts` mounts with `app.route()`. A route counts its lookup with the `countLookup(operation)` middleware: it sets `c.set('lookupResult', 'hits' | 'empty')` when it answers 200 or 404, and without that a 5xx counts as `error` and a 4xx as `invalid`. Query parameters are read with `c.req.queries()`, so a repeated one counts as missing. Only the root app's `strict: false` makes a trailing slash match, so tests always go through the root app. Paths are case-sensitive. A thrown error reaches `app.onError`, which logs the method and path (never the query) and answers 500.

### The search

`GET /search?query=` (`server/search/`) is what nav-office-search's `/api/search` does today, moved here with its tests, and answers in the shapes its browser code reads (`results.ts`):

- Four digits are a postnummer: its poststed with its kommune's office or, in a kommune with bydeler, the offices of the bydeler PDL has addresses in for it. An unknown one is 404.
- Anything else is tried as a name of a poststed, kommune, bydel or office, from the reference data alone.
- What no name matches is searched for as an address in PDL. Each address carries `officeInfo`: the office of its bydel or, without a bydel, of its kommune, and `null` when that area has none.
- Errors are `{ type: 'error', messageId }`, where `messageId` is one of the four ids nav-office-search has messages for: `errorMissingQuery` (400), `errorInvalidQuery` (400), `errorInvalidPostnr` (404) and `errorServerError` (502 and 504 from PDL, 500 otherwise).

`test/fixtures/name-search/` holds nav-office-search's recorded name searches, which `/search` must answer byte for byte.

### Caching Strategy

- **Reference data** (`server/data/data.ts`): one module-level object, replaced as a whole by a load that succeeds and never changed in place. `referenceData()` throws before the first load.
- **geoIdToEnhetMap** (`server/offices/offices.ts`): Module-level variable holding the full office→geoId mapping. Rebuilt entirely on each refresh. On partial fetch failure, previous data for that office is preserved.
- **PDL access token** (`server/pdl/token.ts`): not kept here. Texas keeps tokens itself and never hands out an expired one, so it is asked for every PDL request. After PDL refuses a token, Texas is asked with `skip_cache: true`, at most once a minute for the whole process, so a PDL that keeps refusing doesn't turn every lookup into a request to Entra ID.

### External Dependencies (APIs)

- **NORG Enhet API** (`NORG2_ORIGIN`): Office registry. Used to fetch active offices and their geographical areas, by the old loader (`server/offices/offices.ts`) and by the reference data (`server/data/norg.ts`).
- **XP** (`XP_ORIGIN`): nav.no's CMS. `/_/service/no.nav.navno/officeInfo` lists each office's page (`server/data/offices.ts`). Reached directly from FSS. A page without an `enhetNr` isn't an office's and is left out.
- **Bring** (`https://www.bring.no/postnummerregister-ansi.txt`) and **SSB** (`https://data.ssb.no/api/klass/v1/classifications/103`): asked by the build only, never by a pod. NAV's gateway blocks Bring for pods in FSS. Bring changes its file for 1 October (the year's postnummer changes, published ahead) and on 1 January (kommune changes); SSB's versions start on a 1 January.
- **PDL API** (`PDL_ORIGIN`): Persondataløsningen GraphQL API. Used for freetext address search and bydeler via `sokAdresse` (`server/pdl/`). Authenticated with a machine-to-machine Entra ID token for `PDL_TOKEN_TARGET`, obtained from the NAIS token endpoint.

## Metrics

`server/metrics.ts` defines business metrics with `@prometheus-io/client` (the official successor of `prom-client`) on a dedicated registry, exposed at `/internal/metrics` and scraped via `spec.prometheus` in the NAIS manifests. HTTP latency/status is covered by OTel auto-instrumentation and ingress metrics, so app metrics focus on business outcomes:

| Metric                                                      | Type      | Labels                                                                             |
| ----------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `nav_office_search_api_lookups_total`                       | counter   | `operation` = geoid/adresse/bydel/search, `result` = hits/empty/invalid/error      |
| `nav_office_search_api_norg_refresh_total`                  | counter   | `result` = success/failure                                                         |
| `nav_office_search_api_norg_last_success_timestamp_seconds` | gauge     | –                                                                                  |
| `nav_office_search_api_norg_geoids_loaded`                  | gauge     | –                                                                                  |
| `nav_office_search_api_norg_refresh_failed_offices`         | gauge     | – (offices whose areas failed to load in the last refresh; stale data reused)      |
| `nav_office_search_api_upstream_requests_total`             | counter   | `upstream` = pdl/texas/norg/xp, `status` = 2xx/4xx/5xx/…, timeout or network_error |
| `nav_office_search_api_upstream_request_duration_seconds`   | histogram | `upstream` (time until the response headers)                                       |
| `nav_office_search_api_data_loads_total`                    | counter   | `outcome` = success/failure                                                        |
| `nav_office_search_api_data_last_success_timestamp_seconds` | gauge     | –                                                                                  |
| `nav_office_search_api_data_load_duration_seconds`          | gauge     | – (the last successful load)                                                       |
| `nav_office_search_api_reference_data_entries`              | gauge     | `dataset` = office_urls/offices/bydeler/postnr_register/kommuner/poststeder        |
| `nav_office_search_api_reference_data_without_office`       | gauge     | `dataset` = kommuner/poststeder/bydeler                                            |
| `nav_office_search_api_pdl_errors_total`                    | counter   | `code` = PDL's GraphQL error code, or other                                        |

The upstream series are for requests made through `upstreamClient()`, and are named as in the frontend. PDL reports some failures as GraphQL errors on HTTP 200, where the upstream counter sees a `2xx`; `pdl_errors_total` counts those, and the errors in an HTTP error's body too.

The nav-office-search frontend (`nav_office_search_*`) passes the answers on unread and counts its searches by status alone (`ok`, `invalid`, `error`), so `hits` and `empty` are only told apart here. Process metrics come from NAIS, and request latency from OTel/ingress, so they are not duplicated here.

Never use user input (geoIds, addresses, postnummer) as label values – keep cardinality low.

### Alerts

`.nais/alerts.yml` (a `PrometheusRule`, deployed to prod-fss only by `deploy.prod.yml`) covers only what the frontend can't see. The frontend's alert is the canary for failed searches, including PDL outages, and the metrics above are for diagnosing them:

- `NavOfficeSearchApiDataStale`: a pod whose last successful reference data load is over 2 days old. A failed load keeps the pods ready with the data from before, so nothing user-facing notices. It takes `min()` over the pods, so one that loads doesn't hide one that doesn't; a pod that has never loaded exports 0 and counts as stale after an hour.
- `NavOfficeSearchApiKommunerWithoutOffice`: the last load found no office for a kommune in Bring's register (`reference_data_without_office{dataset="kommuner"}` above 0), so searches there find none.
- `NavOfficeSearchApiPdlRejectingRequests`: PDL refuses what we send, as more than 5 GraphQL errors with a code other than `server_error` (`pdl_errors_total`), or more than 5 HTTP 4xx answers (the `pdl` upstream series), in 15 minutes. Those are ours to fix: the token, the access to pdl-api, or the query. PDL being down (`server_error`, 5xx, timeouts) isn't counted: the frontend's alert sees the failed searches.
- `NavOfficeSearchApiNoSuccessfulSearches`: no search has found anything (`lookups_total{operation="search",result="hits"}`) for 1.5 hours on a weekday between 08 and 15 UTC. The frontend can't tell a hit from an empty answer, and its error alert can't fire without traffic, so this is also what notices the frontend being down.

Don't use `{{ }}` in the alert annotations: nais deploy templates every resource with Handlebars.

## Required Environment Variables

`server/env.ts` checks them with zod when the server starts, so a pod with a missing or malformed variable stops before it takes traffic. Nothing else reads `process.env`.

- `NORG2_ORIGIN` – NORG's origin; the code adds `/norg2/api/v1/enhet`
- `PDL_ORIGIN` – PDL's origin; the code adds `/graphql`
- `PDL_TOKEN_TARGET` – the audience of PDL's tokens, e.g. `api://dev-fss.pdl.pdl-api/.default`
- `NAIS_TOKEN_ENDPOINT` – Texas, NAIS's token service (injected by NAIS)
- `XP_ORIGIN` – XP's origin; the code adds `/_/service/no.nav.navno/officeInfo`
- `NAVNO_ORIGIN` – nav.no's origin, which an office's path is joined to
- `PDL_DEVELOPMENT_TOKEN` – (Optional) a token for PDL instead of asking Texas; for local development
- `DATA_FILES_DIR` – (Optional) where to read the two downloaded files; for local development and tests. Unset in the image, which has them in `server/data/files`
- `PORT` – (Optional) defaults to 3003

The first three and the two after Texas come from `.nais/vars-*.yml`. Locally, `.env.development` points them at test hosts that `test/mocks/dev.ts` answers, and `DATA_FILES_DIR` at `test/fixtures/files`.

## Tech Stack

- **Runtime**: Node.js with ES modules (`"type": "module"`). Node runs the TypeScript directly and strips the types; nothing is compiled. `pnpm build` only downloads the two data files
- **Language**: TypeScript (strict mode, nodenext module resolution)
- **Framework**: Hono on `@hono/node-server`
- **Package manager**: pnpm
- **Linting and formatting**: oxlint, type-aware through `oxlint-tsgolint` (`oxlint.config.ts`: `correctness`, `suspicious` and `perf` as errors, with `no-console` and `typescript/no-explicit-any`); oxfmt (`oxfmt.config.ts`). A finding is fixed in the code; a rule that is turned off or configured says why in the config
- **Git hooks**: lefthook (`lefthook.yml`). Before a commit it runs `oxlint --fix` and oxfmt on the staged files, and `tsc --noEmit` when a TypeScript file is staged; before a push it runs the tests. `pnpm install` puts the hooks in place (`allowBuilds` in `pnpm-workspace.yaml` lets lefthook's install script run). A clone from when husky was used runs `pnpm exec lefthook install --reset-hooks-path` once
- **Key libraries**: `@itsy/corgi` (outbound HTTP to PDL, Texas, XP and NORG's new loader, and the build's downloads), `ufo` (joining URLs), `zod` (the environment, upstream answers, the data files), `croner` (the two daily jobs), `@prometheus-io/client` (metrics), `@navikt/navno-logger` (logging)
- **Packages**: `@navikt/*` come from GitHub Packages (`.npmrc`), so installing needs npm authentication for `npm.pkg.github.com`. `pnpm-workspace.yaml` holds new releases back for 3 days (`minimumReleaseAge`), except `@navikt/*` and `@itsy/*`, which the team publishes itself

## Logging

Log with `logger` from `@navikt/navno-logger`, never `console`. It is called like `console`: a message, then an object of fields and/or an error, e.g. `logger.error('Fetch error from norg navkontorer', { enhetNr, error })`. With `NODE_ENV=production` (the image) it writes one JSON line per call, with the trace id of the OpenTelemetry span the NAIS agent opened; in `pnpm dev` it writes readable lines through `pino-pretty`. `LOG_LEVEL` sets the lowest level (default `info`). Under Vitest it writes through `console` instead, so `silent: 'passed-only'` shows only a failing test's logs; tests assert on logging with `vi.spyOn(logger, …)`.

Keep the message fixed and put values in fields, so the logs can be searched by message. Never log what a user searched for (addresses, postnummer, geoIds) or PDL's error text, which can hold our query.

## Build & Run

- `pnpm run build` – Download Bring's register and SSB's bydeler into `server/data/files` (needs the internet). The image needs it; `pnpm dev` and the tests don't
- `pnpm run dev` – Run `server/main.ts` with `--watch`, offline: it reads `.env.development`, `test/mocks/dev.ts` (loaded with `--import`) answers NORG and XP from the snapshot in `test/fixtures` and PDL and Texas from `test/fixtures.ts`, and the two data files are the snapshot's in `test/fixtures/files`. `MOCKS=false` with real values in the shell goes to the real services
- `pnpm run start` – Run `server/main.ts`
- `pnpm run format` – Format with oxfmt
- `pnpm run lint` – oxfmt check, oxlint, then `tsc --noEmit` over `server/`, `build/`, `test/` and the config files. oxfmt skips `server/data/files`, which is in `.gitignore`
- `pnpm run test` – Vitest on the TypeScript source. Each test starts a fresh copy of the app on a free port (`test/app.ts`) and asks it over HTTP; NORG, PDL and Texas are answered by corgi's `mockFetch` (`test/fetch.ts`, `test/fixtures.ts`). A test file sits next to the code it tests, in `build/` too, where Bring and SSB are answered the same way. Today's wrong behaviour is pinned in tests named `(bug)`

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
- **Refresh base image and data files** (`base-image-refresh.yml`): Sundays 23:17 Oslo time, daily at 05:17 on 1-7 January and 1-7 October, or manually from `main`. Runs `build-deploy-prod.yml`, so prod gets the newest base image and Bring's and SSB's files as they are that day. The January and October weeks are when those files change; a week of days, because neither source says at what hour and GitHub can drop a scheduled run. No release.
- **Deploy to dev** (`deploy.dev.yml`): Manual trigger only (`workflow_dispatch`).
- **PR checks** (`pr-checks.yml`): Runs the build, lint and tests for pull requests to `main`.
- **Dependabot lockfile fix** (`dependabot-lockfile-update.yml`): Regenerates `pnpm-lock.yaml` on Dependabot's pull requests.
- **Roll back prod** (`rollback.prod.yml`): Manual. Redeploys the image of an earlier release to `prod-fss` without building, with the `.nais` files from that release's commit. Without a tag it takes the release before the newest one. A release records its image because `deploy.prod.yml` passes it to `release.yml`. The next push to `main`, and the next "Refresh base image and data files", deploy `main` again. The alerts are not rolled back.
- All workflows use the reusable workflows in `navikt/navno-ci` (`node-build.yml`, `nais-deploy.yml`, `release.yml`, `dependabot-lockfile.yml`), which are built on `navikt/navno-actions`. The build runs: pnpm install → `pnpm run build` (downloads the two data files; pull request checks and Deploy to dev do it too, so every build needs Bring and SSB to answer) → lint → test → reinstall production dependencies → Docker build+push of `package.json`, `node_modules` and `server/`, which now holds the two files (`.dockerignore` keeps the tests out); then `nais-deploy.yml` deploys. Node version comes from `engines.node` in package.json.

## Conventions

- Imports name the `.ts` file, and type-only imports use `import type`. `erasableSyntaxOnly` and `verbatimModuleSyntax` keep the code to TypeScript that Node can strip. Imports across top-level folders use `#server/*` and `#test/*` (package.json `imports`)
- A failed PDL lookup is a `Failure` from `server/pdl/client.ts`, `{ error: true, statusCode, message }`, which the route answers with
- The `fetchJson` helper handles query string building, JSON parsing, and error wrapping (used by NORG calls). New outbound calls use `upstreamClient()` instead
- PDL calls go through `pdlQuery(query, variables, schema)`: GraphQL as a plain POST, the answer's `data` typed by its zod schema. Log a failure with `failureOf()` from `@navikt/navno-server/upstream`, never an `HttpError` itself, whose message has the URL
