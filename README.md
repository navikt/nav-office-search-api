Nodejs/Express-app for lookup av NAV-kontor informasjon fra FSS-tjenester (tps/norg2)

## Utvikling

### Installere pnpm

Dette prosjektet bruker **pnpm** som package manager. Node.js kommer ikke lenger med Corepack (fra Node 25), så installer pnpm selv, for eksempel slik:

```bash
npm install --global pnpm
```

Se https://pnpm.io/installation for andre måter. pnpm leser `packageManager`-feltet i `package.json` og bytter automatisk til riktig versjon.

### Kjøre lokalt

Installer avhengigheter:

```bash
pnpm install
```

Bygg applikasjonen:

```bash
pnpm run build
```

Kjør lokalt:

```bash
pnpm run dev
```

## Prodsetting

Lag en PR til main, og merge inn etter godkjenning (En automatisk release vil oppstå ved deploy til main).
