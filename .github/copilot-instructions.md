# Copilot Instructions

## Project Overview

Express API (Node.js, TypeScript) that provides office lookup endpoints for a frontend app. It maps geographical IDs and postal numbers to NAV office information by aggregating data from two external services: NORG (office registry) and TPS (address lookup).

Runs on port 3003. Deployed as a Docker container.

## Architecture

### Data Flow

1. **Startup**: `loadNorgOfficeInfo()` fetches all active local offices from NORG, then for each office fetches its geographical areas. This builds an in-memory `geoIdToEnhetMap` (geoId → `{ enhetNr, navn }`).
2. **Scheduled refresh**: `node-schedule` re-runs `loadNorgOfficeInfo` daily at 05:00. The server reports not-ready (`503`) until the initial load completes.
3. **Request handling**: All endpoints require a valid Azure AD Bearer token (base64-encoded JWT, validated via `jwks-rsa`). The token audience must match `AZURE_APP_CLIENT_ID`.

### Endpoints

| Route                                                | Purpose                                     |
| ---------------------------------------------------- | ------------------------------------------- |
| `GET /geoid?id=<geoId>`                              | Looks up office info from the in-memory map |
| `GET /postnr?postnr=<nr>&kommunenr=&husnr=&adresse=` | Proxies to TPS address search API           |
| `GET /internal/isAlive`                              | Liveness probe                              |
| `GET /internal/isReady`                              | Readiness probe (503 until data is loaded)  |

### Caching Strategy

- **geoIdToEnhetMap** (office-data.ts): Module-level variable holding the full office→geoId mapping. Rebuilt entirely on each refresh. On partial fetch failure, previous data for that office is preserved.
- **postnr cache** (postnr-search-handler.ts): `node-cache` with 1-hour TTL. Caches TPS responses keyed by postal number. Bypassed when an `adresse` parameter is provided.

### Authentication

Requests to `/geoid` and `/postnr` go through `validateAndHandleRequest` which:

1. Extracts a base64-encoded Bearer token from the `Authorization` header
2. Validates it as a JWT using JWKS keys from Azure AD
3. Calls the route handler only if validation succeeds

### External Dependencies (APIs)

- **NORG Enhet API** (`NORG_ENHET_API`): Office registry. Used to fetch active offices and their geographical areas. (office-data.ts)
- **TPS Adresse-søk API** (`TPS_ADRESSESOK_API`): Address lookup by postal number, but also addresses (postnr-search-handler.ts).
- Both accessed via an HTTPS proxy (`HTTPS_PROXY`).

## Required Environment Variables

Declared in `src/global.d.ts`:

- `AZURE_APP_CLIENT_ID` – Azure AD app client ID for token validation
- `AZURE_OPENID_CONFIG_JWKS_URI` – JWKS endpoint for token signing keys
- `HTTPS_PROXY` – Proxy URL for outbound HTTPS requests
- `NORG_ENHET_API` – Base URL for NORG office API
- `TPS_ADRESSESOK_API` – URL for TPS address search API

## Tech Stack

- **Runtime**: Node.js with ES modules (`"type": "module"`)
- **Language**: TypeScript (strict mode, nodenext module resolution)
- **Framework**: Express
- **Package manager**: pnpm
- **Linting**: ESLint with typescript-eslint
- **Key libraries**: `jsonwebtoken` + `jwks-rsa` (auth), `node-cache` (TTL cache), `node-schedule` (cron), `uuid`, `https-proxy-agent`

## Build & Run

- `pnpm run build` – Compiles TS to `distSrc/`
- `pnpm run dev` – Build + run with dotenv
- `pnpm run start` – Run compiled JS
- `pnpm run lint` – ESLint

## Deployment

### Why FSS

This app runs in **fss** (fagsystemsonen) because it needs direct network access to TPS (tpsws), which is only available on the internal fss network. The frontend (`nav-office-search` in GCP) calls this API via the `-fss-pub.nais.io` ingress.

### NAIS Configuration

NAIS app manifests live in `.nais/`:

- `config.dev.yaml` – dev-fss cluster config
- `config.prod.yaml` – prod-fss cluster config

Key settings:

- `webproxy: true` – enables the fss HTTPS proxy (injected as `HTTPS_PROXY` env var)
- `azure.application.enabled: true` – provisions Azure AD credentials automatically
- `accessPolicy.inbound` – only `nav-office-search` (GCP) is allowed to call this API
- Observability: logs to OpenSearch, OpenTelemetry auto-instrumentation enabled for Node.js
- Prod runs 2 replicas; dev runs 1

### GitHub Actions Workflows

- **Deploy to prod** (`deploy.prod.yml`): Triggers on push to `main` or manually. Builds, pushes Docker image, deploys to `prod-fss`, then creates a GitHub Release with auto-generated release notes.
- **Deploy to dev** (`deploy.dev.yml`): Manual trigger only (`workflow_dispatch`).
- Both use a shared composite action (`.github/actions/build-and-deploy/action.yml`) that runs: pnpm install → lint → build → prune to prod deps → Docker build+push → nais deploy.

## Conventions

- All local imports use `.js` extension (required for nodenext module resolution)
- Error responses use the `ErrorResponse` type from `fetch.ts` with `{ error: true, statusCode, message }`
- Successful fetch responses are typed with `& OkResponse` (where `error` is `undefined`)
- The `fetchJson` helper handles query string building, JSON parsing, and error wrapping
- The NORG proxy (`HTTPS_PROXY`) is only used explicitly for the JWKS client; the TPS and NORG API calls use the global fetch
