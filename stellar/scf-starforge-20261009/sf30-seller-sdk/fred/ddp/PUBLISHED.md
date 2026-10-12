# Complete current publications beside a DDP migration

`starforge fred-ddp-published` carries one complete original Board package from
its saved DDP mapping through full current FRED source collection, exact value
comparison, the original economic project, portable export, independent receiving
and recovery of every original transport. It uses the existing package, crosswalk,
migration, public capture and project APIs. Its public module entries are
`/seller/fred/ddp/published-source`, `/seller/fred/ddp/published-comparison` and
`/seller/fred/ddp/published-programme` beneath `@tokenjunkielabs/starforge-merchant`.

Use Node 22.16 or newer and Python 3 on the original Linux customer host.
Python's standard library performs the first-party collection. Two readers share
a minimum 0.60-second request spacing. A completed source is saved after both its
original metadata HTML and complete observation CSV arrive. Each transport keeps
its original URL, final URL, HTTP status, retrieval time, safe response headers,
whole-file size and SHA256. Resume reuses completed original bytes and their first
retrieval times; collect a later edition in a new intake directory.

## Run the complete original programme

Prepare the original package capture, crosswalk capture and reviewed migration
plan with the existing DDP source and project operations. The plan retains its
original release, source series IDs, complete source indices, mappings, period
rules, explicit scale factors and API as-of selection. Then run:

```sh
starforge fred-ddp-published run \
  --workspace /absolute/customer/h15 \
  --package run/package-capture.json \
  --crosswalk run/crosswalk-capture.json \
  --plan run/complete-migration-plan.json \
  --project retained-project \
  --receive received-project \
  --output current-publication \
  --collect
```

The programme collects every mapped target in the saved plan. The metadata page
at `https://fred.stlouisfed.org/data/SERIES` supplies its original units, frequency,
seasonal adjustment, release, notes, update time and advertised full date range.
The observation transport is
`https://fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES&cosd=START&coed=END`.
Its first and last observation dates must match the metadata's full coverage.
The complete CSV supplies the period population; the metadata HTML's displayed
observation count also travels with the source.

Collection can run on its own and resume before the full programme:

```sh
starforge fred-ddp-published collect \
  --workspace /absolute/customer/h15 --plan run/complete-migration-plan.json
```

Omit `--collect` on a later `run` to consume the complete retained intake directly.
`--intake` selects another collection directory. `--manifest` selects an existing
complete collection manifest. Completed reports verify their original sources,
mapping and actual row-file hashes before reuse. An unfinished comparison is
retained as an interrupted attempt before rebuilding from the already saved
source population. Native project transactions retain their existing operation
identities and revisions throughout recovery.

## Read the complete report

The output directory contains:

| File | Customer use |
| --- | --- |
| `comparison/report.html` | Searchable industrial report with every source series |
| `comparison/comparison.json` | Complete per-series source meaning, coverage, scales, original file identities and row index |
| `comparison/observations.csv` | Every selected Board observation and every unmatched target record |
| `comparison/observations.jsonl` | The same complete population with original member identities and UTF-8 byte offsets |
| `original-project-with-current-publications.json` | Complete original native economic project with the Board sources, migration and all public target captures |
| `programme-summary.json` | Original project identity, receiving result and exact recovered-source population |

The comparison uses the saved source calendar rule and the target's declared
frequency. It preserves original numeric strings and applies the saved exact
source and target scale factors before computing FRED minus Board. Original
member locations use UTF-8 byte offsets with an exclusive end. Weekly and
biweekly dates retain their actual publication convention. Whole source rows and
original target bytes remain recoverable from every reported location.

| Row status | Meaning |
| --- | --- |
| `EQUAL` | Both observations are available and their exactly scaled values agree |
| `DIFFERENT` | Both observations are available and their exactly scaled values differ |
| `BOTH_MISSING` | Both original sources declare the matched period unavailable |
| `MISSING_CHANGED` | Availability differs at a matched period |
| `SOURCE_ONLY` | The saved original source period has no target observation in the selected window |
| `TARGET_ONLY` | The target has a selected-window period absent from the saved source population |

The Board's original `CL_OBS_STATUS` defines `A` as Normal, `NA` as Not available,
`ND` as No data and `NC` as Not calculable. The original H.15 archive uses numeric
`-9999` placeholders for the latter three statuses. Their original numeric strings
and statuses remain in the row, while their declared availability governs
comparison and suppresses sentinel arithmetic. An available `A` observation
keeps its actual numeric value, including a literal `-9999`.

## Receive and recover every original source

The `run` journey imports complete target groups through the existing public-table
capture API. Original HTML and CSV bytes are embedded beside the declared
normalized table representation, including the explicit missing-marker and
metadata-whitespace normalization. Each group retains the public retrieval-date
time basis. Original API vintage selections retain their existing as-of contract.

The complete native project is exported, received into its own destination,
reopened and exported again. Both exports must have the same native bundle
identity. All retained HTML/CSV transports and Board sources are then materialized
and checked against their whole-file SHA256. A separate customer can receive the
self-contained project with:

```sh
starforge fred-ddp-published receive \
  --workspace /absolute/customer/h15 \
  --bundle original-project-with-current-publications.json \
  --project received-project \
  --originals original-sources
```

The ordinary original FRED workspace can reopen the received project, preserve
its private source editions and continue its existing review and publication
operations. Board members materialize under `original-sources/board/CAPTURE_ID`;
FRED transports materialize under `original-sources/fred/SERIES`.

## Full original H.15 programme, 12 October 2026

The actual Board inputs were the complete public
[DDP/FRED crosswalk](https://www.federalreserve.gov/data/documents/DDP-FRED%20Data%20Series%20Crosswalk.csv)
and [H.15 SDMX archive](https://www.federalreserve.gov/releases/h15/data/FRB_h15_xml.zip).
The crosswalk held 50,313 rows across 16 releases. The five-member H.15 archive
contained 263 original series and 924,369 observations spanning 1919–2026.
All 263 targets were collected from the full official FRED publications:

| Complete population | Result |
| --- | ---: |
| Original Board observations | 924,369 |
| Original FRED observations | 823,660 |
| Equal available values | 767,971 |
| Numeric differences | 0 |
| Missing in both sources | 55,689 |
| Availability changes | 0 |
| Source-only unavailable placeholders | 100,709 |
| Target-only records | 0 |

The Board's unavailable rows consisted of 151,575 ND, 4,426 NA and 397 NC periods.
All 767,971 available Board observations matched exactly. The complete original
v5 project carried 27 public captures and recovered all 526 original HTML/CSV
transports, totalling 65,617,257 bytes, after independent receiving. Its export
identity was `493c0a3661f96040deffde5af537e0e6e1459cb9eeb1e09002e54d5eb2e86f75`.
The full report identity was
`fred-current-publication-comparison-60456d69d7a3caf12234e287d4878e70aa7f215a233e12a76d6828d00cc9ea5a`.

The same original source/project/export/receiving journey took 170.45 seconds
with object-identity caching and 56.01 seconds with one immutable parsed package
retained by its fully validated capture digest. Resident memory fell from 1.743 GB
to 1.084 GB. The complete current-publication comparison and customer receiving
journey finished in 123.44 seconds with 1.908 GB resident memory on the cloud
Linux host. These timings refer to the complete original populations above.
