# Fixtures

A snapshot of what the server reads, so tests and `pnpm dev` run against data that fits together and is big enough
to pass the load's floors. It is the same snapshot nav-office-search's tests use, so the two can be compared.

| File                        | What it is                                                       | Origin                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `norg/enhet.json`           | NORG `GET /norg2/api/v1/enhet?enhetStatusListe=AKTIV`            | 283 `LOKAL` units from an old dev snapshot, plus five units of other types. Only `enhetNr`, `navn`, `type` and `status` of each; NORG sends more. |
| `norg/navkontorer.json`     | NORG `GET /norg2/api/v1/enhet/navkontorer/<enhetNr>`, by enhetNr | The kommuner and bydeler each office serves, `[{ geografiskOmraade }]`. Derived once from the same snapshot.                                      |
| `xp/office-info.json`       | XP `GET /_/service/no.nav.navno/officeInfo`                      | An earlier dev capture, `{ offices: [{ enhetNr, path }] }`.                                                                                       |
| `files/postnrRegister.json` | What `pnpm build` writes from Bring's register                   | nav-office-search's capture of Bring's file, run through `build/bring.ts` once. Pre-2024 kommune numbers.                                         |
| `files/bydeler.json`        | What `pnpm build` writes from SSB's bydeler                      | SSB's version 1168 (Bydelsinndeling 2020), captured 2026-10-07, without `Uoppgitt`.                                                               |

They agree with each other, even though they are out of date: Tromsø is 5401 here and Nordre Follo 3020. Refresh
them together or not at all.

What the snapshot loads as: 389 areas with an office, 37 bydeler, 357 kommuner and 5136 poststeder. One kommune, two
poststeder and one bydel have no office. `2100` (Svalbard) is served by Nav Tromsø and `2211` (Jan Mayen) by nobody
in NORG, which was checked against dev on 2026-10-08.

`test/snapshot.ts` answers NORG and XP from these files, and `DATA_FILES_DIR` points the server at `files/`.
`test/fixtures.ts` has small answers to build a case from.
