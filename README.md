Nodejs/Hono-app for lookup av NAV-kontor informasjon fra FSS-tjenester (tps/norg2)

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

Appen leser `.env.development`, og `test/mocks/dev.ts` svarer på kallene til NORG, XP, PDL og Texas med testdata, så du trenger ikke naisdevice. Postnummerregisteret og bydelene leses fra `test/fixtures/files`, som hører sammen med testdataene fra NORG og XP (se `test/fixtures/README.md`). For å gå mot de ekte tjenestene, sett `MOCKS=false` og de ekte verdiene i skallet (de vinner over filen), for eksempel:

```bash
MOCKS=false NORG2_ORIGIN=https://app-q2.adeo.no PDL_ORIGIN=https://pdl-api.intern.dev.nav.no PDL_DEVELOPMENT_TOKEN=<token> pnpm run dev
```

### Lint, formatering og git-hooks

`pnpm run lint` kjører oxfmt (sjekk), oxlint og `tsc`. `pnpm run format` formaterer.

Git-hookene settes opp av [lefthook](https://lefthook.dev) når du kjører `pnpm install` (`lefthook.yml`): før en commit rettes og formateres filene som er staget, og TypeScript sjekkes; før en push kjøres testene.

Har du en klone fra da prosjektet brukte husky, må den gamle hook-stien fjernes én gang:

```bash
pnpm exec lefthook install --reset-hooks-path
```

### Postnummer og bydeler

Imaget har med seg to filer som bygget laster ned: postnummerregisteret fra Bring og bydelene fra SSB. En pod i FSS når ikke Bring, så de hentes på GitHub-runneren:

```bash
pnpm run build
```

Kommandoen skriver `server/data/files/postnrRegister.json` og `bydeler.json` (ikke i git). Feiler nedlastingen eller kontrollen av innholdet, feiler bygget, og forrige image blir stående. Lokalt trenger du bare å kjøre den hvis du vil se de ekte filene; `pnpm run dev` og testene bruker testkopiene.

Filene blir så nye som siste bygg. «Refresh base image and data files» bygger og deployer prod hver søndag kveld, og hver morgen 1.–7. januar og 1.–7. oktober, når Bring og SSB endrer filene. Den kan også kjøres for hånd fra `main`.

## Prodsetting

Lag en PR til main, og merge inn etter godkjenning (En automatisk release vil oppstå ved deploy til main).

## Rollback

[Roll back prod](https://github.com/navikt/nav-office-search-api/actions/workflows/rollback.prod.yml) -> Run workflow. Uten release-tag rulles det tilbake til releasen før den nyeste; oppgi en tag for å gå lenger tilbake.

Neste push til main deployer main igjen, og det gjør også neste «Refresh base image and data files» (søndag kveld), så revert eller fiks på main før noe annet merges.
