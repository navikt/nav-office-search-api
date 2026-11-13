Nodejs/Express-app for lookup av NAV-kontor informasjon fra FSS-tjenester (tps/norg2)

## Utvikling

### Installere pnpm

Dette prosjektet bruker **pnpm** som package manager. Node.js kommer ikke lenger med Corepack (fra Node 25), så installer pnpm selv, for eksempel slik:

```bash
npm install --global pnpm
```

Se https://pnpm.io/installation for andre måter. pnpm leser `packageManager`-feltet i `package.json` og bytter automatisk til riktig versjon.

### Kjøre lokalt

Installer avhengigheter (`@navikt`-pakkene kommer fra GitHub Packages, så npm må være logget inn mot `npm.pkg.github.com`):

```bash
pnpm install
```

Kjør lokalt (Node kjører TypeScript-koden direkte, uten bygg):

```bash
pnpm run dev
```

Appen leser `.env.development`, og `test/mocks/dev.ts` svarer på kallene til NORG, PDL og Texas med testdata, så du trenger ikke naisdevice. For å gå mot de ekte tjenestene, sett `MOCKS=false` og de ekte verdiene i skallet (de vinner over filen), for eksempel:

```bash
MOCKS=false NORG2_ORIGIN=https://app-q2.adeo.no PDL_ORIGIN=https://pdl-api.intern.dev.nav.no PDL_DEVELOPMENT_TOKEN=<token> pnpm run dev
```

## Prodsetting

Lag en PR til main, og merge inn etter godkjenning (En automatisk release vil oppstå ved deploy til main).
