Nodejs/Express-app for lookup av NAV-kontor informasjon fra FSS-tjenester (tps/norg2)

## Utvikling

### Installere pnpm

Dette prosjektet bruker **pnpm** som package manager. Node.js kommer med Corepack som automatisk bruker riktig pnpm-versjon:

```bash
corepack enable
```

Corepack leser `packageManager`-feltet i `package.json` og installerer riktig versjon automatisk.

**Merk:** Når Corepack er aktivert, vil `npm`-kommandoer ikke fungere.

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
