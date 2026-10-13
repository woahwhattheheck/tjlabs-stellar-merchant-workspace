# Native H.15 project receiving operation

This operation imports the complete original Federal Reserve H.15 archive and its published DDP-to-FRED crosswalk, retains a whole-package migration, acquires its exact native FRED selections, and produces the complete JSON, CSV and offline HTML receiving files. It then transfers the full project to a separate directory, reopens the original sources and compares every report byte.

The current original files are the 12 October 2026 crosswalk (1,775,573 bytes, SHA256 `536ba3dc62d10f51d70208a6f35aea022bb4d41d9feb2659de22cf649065852d`) and H.15 ZIP (4,285,147 bytes, SHA256 `bb2e439536b7312483db8dafd4770509e1c34dcef692e14e4797bd16d051f24a`). The source directory also contains `Federal_Reserve_Original_Source_Manifest_20261012.json`, which preserves the original provider transfer and archive-member identities (5,097 bytes, SHA256 `cdab478e3241326759a05b624f8b7e828de9b73601ff538fdfc6b16e5a6e6cae`).

Use the complete current `commons/fred-ddp-qcew-e2747-20261012` repository source from `woahwhattheheck/tjlabs-stellar-merchant-workspace`. The source root is the directory above `stellar/`. The shared 41-module capsule `e22a87b9ed17b7491c1f01e8f121c0db7666922c` is the original dependency base; the complete project memory correction is `ac8f03e6c14e12f2d5234d7cef245959f0b3336b`, and the original QCEW family is `c93adbfe9df3a81ecf0864cdf6ce1456ada7c17f`. Use the joined current source, including the source owner's lazy H.15 observations, actual Board status/DOCTYPE support (`d520733efff0ea95bd8720d92372827da5e0ecc4`) and the shared `canonical-stream.mjs` helper. Native project hashing and capacity checks retain their original bytes while avoiding whole temporary JSON copies.

## Prepare the complete original project

```bash
node run.mjs \
  --source-root /workspace/scratch/e2747a1b9eee/fred-ddp-project-runtime \
  --original-directory /workspace/scratch/e2747a1b9eee/federal-reserve-originals \
  --work-directory /workspace/scratch/e2747a1b9eee/fred-ddp-h15-operation \
  --phase prepare
```

The default analyst selection is the complete package over 1 January–31 December 2025, with FRED as-of 12 October 2026, 1,000 rows per original API page and the existing 1,000,000-row capture ceiling. Every package series remains in the plan. The script checks the original two file digests, imports both raw files, replays their compact source-ID continuations and saves the reviewed migration. The complete prepared project is written as `prepared-<migration-id>.json`; its path, digest, source counts and migration summary are returned in the operation log.

`--input /absolute/migration.json` replaces the default migration settings with the declared original `name`, `asOf`, `window`, `decisions`, `bindings`, `pageSize`, `maxRows`, `bookmark` and `note` fields. A plan requiring mapping or period choices is retained in full as `<migration-id>.json` in the same work directory. The same preparation operation can resume after those actual source choices are supplied. Source and completed operation identities remain immutable.

Pass `--bundle /absolute/original-project.json` to continue the completed H.15 customer project or an original county-report project during preparation. When the project already contains the exact Board ZIP/crosswalk, preparation reuses their original capture identities and completed source-operation IDs. It adds the reviewed vintage migration to that same project. `--migration <retained-plan-id>` selects its original source pair if more than one is retained. The original H.15 public-data comparison remains available with its `PUBLIC_TABLE` basis and complete source transport files; the planned API vintage is a separate exact selection. Its complete QCEW family and original report files remain in the same shared project. New county-containing exports use v6; DDP-only exports use v5. The native source-context Map stays in memory and carries the original county CSV selection through export and reopening.

## Complete in the original FRED-equipped environment

Keep the existing FRED API key in its native environment. `--api-key-env` selects its environment-variable name; the default is `FRED_API_KEY`. The runner prints file identities and operation results.

```bash
node run.mjs \
  --source-root /absolute/current-source \
  --work-directory /absolute/original-h15-operation \
  --bundle /absolute/prepared-fred-ddp-migration-plan-<digest>.json \
  --phase complete
```

If preparation and acquisition use the same machine and work directory, omit `--bundle`. If the project contains multiple migration plans, add `--migration fred-ddp-migration-plan-<digest>` for the exact retained plan. This receives and continues the same project; it does not create a new source selection.

The operation makes the original FRED requests through the production `acquireFredDdpMigration` API. By default, it interrupts before the third actual HTTP request after the first two successful responses have completed and been retained by the original source loop. It verifies that the same original operation remains pending, then resumes that operation automatically. This uses the real source responses and the existing journal. `--interrupt-after-responses 0` runs without the deliberate interruption; an already completed original acquisition replays directly.

Completion creates the three full reports under `reports-origin/`, exports `complete-<migration-id>.json`, receives that complete on-disk file into the separate `received/` project and writes the reopened report files under `reports-received/`. The runner checks both raw Board file digests, exact full migration-plan bytes, all JSON/CSV/HTML bytes and the re-exported complete project identity. The completion summary records the actual source, plan, receiving, capture and report identities. Re-running the same operation preserves its first completed artifacts. Complete project files are written incrementally with their original sorted-key JSON bytes and final newline. Retained files are checked in 64 KiB chunks, and the source project graph is released before reading its on-disk receiving copy.

The artifact directory contains private project state and complete originals; keep the repository source and shareable report files separate from the existing environment's credentials. The production CLI and full project guide are at `stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/PROJECT.md`.
