# Copilot Instructions

## Project Overview

Express API (Node.js, TypeScript) that provides office lookup endpoints for a frontend app. It maps geographical IDs and addresses to NAV office information by aggregating data from two external services: NORG (office registry) and PDL (address lookup via GraphQL).

Runs on port 3003. Deployed as a Docker container.

## Architecture

### Data Flow

1. **Startup**: `loadNorgOfficeInfo()` fetches all active local offices from NORG, then for each office fetches its geographical areas. This builds an in-memory `geoIdToEnhetMap` (geoId → `{ enhetNr, navn }`).
2. **Scheduled refresh**: `node-schedule` re-runs `loadNorgOfficeInfo` daily at 05:00. The server reports not-ready (`503`) until the initial load completes.
3. **Request handling**: Endpoints are unauthenticated — access is controlled via NAIS access policies. Outbound calls to PDL use a machine-to-machine token fetched from the NAIS token endpoint.

### Endpoints

| Route                              | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `GET /geoid?id=<geoId>`           | Looks up office info from the in-memory map              |
| `GET /adresse?queryString=<query>` | Freetext address search via PDL GraphQL (sokAdresse)     |
| `GET /internal/isAlive`           | Liveness probe                                           |
| `GET /internal/isReady`           | Readiness probe (503 until data is loaded)               |

### Caching Strategy

- **geoIdToEnhetMap** (office-data.ts): Module-level variable holding the full office→geoId mapping. Rebuilt entirely on each refresh. On partial fetch failure, previous data for that office is preserved.
- **PDL access token** (auth.ts): `node-cache` with TTL derived from token expiry (minus 60s buffer). Invalidated and refreshed automatically on 401 from PDL.

### External Dependencies (APIs)

- **NORG Enhet API** (`NORG_ENHET_API`): Office registry. Used to fetch active offices and their geographical areas (office-data.ts).
- **PDL API** (`PDL_API`): Persondataløsningen GraphQL API. Used for freetext address search via `sokAdresse` (adresse-search-handler.ts). Authenticated with a machine-to-machine Entra ID token obtained from the NAIS token endpoint.

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
- **Key libraries**: `graphql` + `graphql-request` (PDL queries), `node-cache` (token caching), `node-schedule` (cron), `jwks-rsa`, `uuid`

## Build & Run

- `pnpm run build` – Compiles TS to `distSrc/`
- `pnpm run dev` – Build + run with dotenv
- `pnpm run start` – Run compiled JS
- `pnpm run lint` – ESLint

## Deployment

### Why FSS

This app runs in **fss** (fagsystemsonen) because it needs direct network access to PDL, which is available on the internal fss network. The frontend (`nav-office-search` in GCP) calls this API via the `-fss-pub.nais.io` ingress.

### NAIS Configuration

NAIS app manifests live in `.nais/`:

- `config.dev.yaml` – dev-fss cluster config
- `config.prod.yaml` – prod-fss cluster config

Key settings:

- `azure.application.enabled: true` – provisions Azure AD credentials automatically
- `accessPolicy.inbound` – only `nav-office-search` (GCP) is allowed to call this API
- `accessPolicy.outbound` – allows calls to `pdl-api` in the `pdl` namespace
- Observability: logs to OpenSearch, OpenTelemetry auto-instrumentation enabled for Node.js
- Prod runs 2 replicas; dev runs 1

### GitHub Actions Workflows

- **Deploy to prod** (`deploy.prod.yml`): Triggers on push to `main` or manually. Builds, pushes Docker image, deploys to `prod-fss`, then creates a GitHub Release with auto-generated release notes.
- **Deploy to dev** (`deploy.dev.yml`): Manual trigger only (`workflow_dispatch`).
- Both use a shared composite action (`.github/actions/build-and-deploy/action.yml`) that runs: pnpm install → lint → build → prune to prod deps → Docker build+push → nais deploy.

## Conventions

- All local imports use `.js` extension (required for nodenext module resolution)
- Error responses use the `ErrorResponse` type from `fetch.ts` with `{ error: true, statusCode, message }`
- The `fetchJson` helper handles query string building, JSON parsing, and error wrapping (used by NORG calls)
- PDL calls use `graphql-request` directly with typed responses
