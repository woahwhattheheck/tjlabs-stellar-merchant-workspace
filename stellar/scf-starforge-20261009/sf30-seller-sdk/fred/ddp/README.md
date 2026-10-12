# DDP package migration and FRED receiving

This operator carries an existing Federal Reserve Data Download Program package into FRED while preserving its original series, observation periods, units and saved selection. The complete package and the Board's complete crosswalk remain attached to the migration. A receiving report compares every selected original observation with the complete returned FRED batches.

The maintained FRED workspace supplies the project, review, publication and delivery workflow. [PROJECT.md](./PROJECT.md) covers those saved project operations. This guide covers original source acquisition, package interpretation, mapping and the complete standalone receiving operation.

## What the migration preserves

The original Board package keeps every source file, filename, exact byte hash, original CSV cell or XML location, series instance, observation string and missing marker. ZIP members and their structure definitions are derived from the retained original archive. The source view exposes the complete frequency inventory and lets the operator filter series by frequency or text before inspecting their observations.

The Board's crosswalk is matched by the exact pair `ddp_release` and `board_series_id`. Every original crosswalk row remains available, including duplicates and additional source columns. A series with several candidate FRED identifiers stays visible for an explicit mapping decision. An exclusion retains the source series and the analyst's reason. The complete package is ready for acquisition once each original series is mapped or explicitly excluded and its selected periods can be interpreted.

Each saved migration also retains the original DDP bookmark and an analyst note. The bookmark records the customer's existing workflow; the original package supplies the series identities. The operator preserves the distinction between a fixed date window and a rolling observation count.

| Window | Board selection | FRED selection |
| --- | --- | --- |
| `source` | Every original package observation | The corresponding period span, with calendar-start padding for source period labels |
| `fixed` | Original observations whose aligned period falls inside the chosen inclusive dates | The same fixed observation dates |
| `last` | The latest selected count of original observations, including missing observations | The actual latest count at the chosen common FRED as-of date |

For a rolling count, the native FRED acquisition reads the original history through the chosen as-of date before selecting the latest observations. It keeps the original request's complete pagination and counts. It does not estimate a lookback period from the desired count.

## Original public sources

The Federal Reserve's [transition announcement](https://www.federalreserve.gov/data/data-download-fred-information.htm) schedules removal of the custom Build Your Package feature during the week of November 9, 2026. It describes a later transition of remaining DDP downloads. The [DDP-to-FRED guide](https://www.federalreserve.gov/data/ddp-fred-user-guide.htm) explains the crosswalk and corresponding FRED downloads.

The native acquisition uses these original public sources:

- [Complete DDP–FRED crosswalk CSV](https://www.federalreserve.gov/data/documents/DDP-FRED%20Data%20Series%20Crosswalk.csv).
- [Complete H.15 SDMX XML archive](https://www.federalreserve.gov/releases/h15/data/FRB_h15_xml.zip).
- [H.15 package chooser](https://www.federalreserve.gov/datadownload/Choose.aspx?rel=H15) and [H.15 release](https://www.federalreserve.gov/releases/h15/).
- [Original DDP help](https://www.federalreserve.gov/datadownload/help/default.htm), including file formats, labels, frequency and saved-package behavior.
- [DDP and FRED data definitions](https://www.federalreserve.gov/data/documents/ddp-fred-data-definitions.pdf).

DDP describes currently published observations. FRED acquisition records the selected real-time as-of date. The receiving report retains those two source bases, the actual source acquisition timestamps and the original report periods separately.

A source downloaded by the operator retains the actual HTTP URL, final URL, status, selected response headers, acquisition time and complete response bytes. An imported local file retains its actual file-receiving time and original bytes.

## Acquire the complete crosswalk and H.15 source

Use a private directory for each original acquisition. The same directory resumes the same request graph.

```sh
starforge fred ddp capture --kind crosswalk --directory ./ddp-crosswalk
starforge fred ddp capture --kind package --directory ./ddp-h15 --release H15 --format board-sdmx-zip
starforge fred ddp status --directory ./ddp-h15
```

The direct source command has the same arguments:

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/acquisition-cli.mjs capture --kind crosswalk --directory ./ddp-crosswalk
```

Both operations are public Board downloads. Their complete source envelopes are saved as `capture.json`. A complete original response is saved in `progress.json` before package interpretation. The operator preserves completed files if a later source or interpretation step is interrupted. Continue the same command with the same directory; a saved provider retry time is respected.

The default package address is the original H.15 XML archive. Supply `--url`, `--release` and `--format` for another original Board package. Repeat `--supplemental URL` to include actual original XML/XSD structure files that accompany a direct XML source. Schema references are retained in the source model and resolved from the supplied original files.

`source.mjs` exports `captureFredDdpCrosswalk`, `captureFredDdpPackage`, `inspectFredDdpAcquisition` and the matching read/store helpers. All read, store and capture helpers return `{directory,capture,model,reused}`; read helpers take the full `capture.json` path.

## Receive an existing customer package

The workspace accepts a complete retained source envelope or original CSV, SDMX ZIP or SDMX XML. Native equivalents are:

```sh
starforge fred ddp receive --kind crosswalk --input "DDP-FRED Data Series Crosswalk.csv" --directory ./ddp-crosswalk
starforge fred ddp receive --kind package --input ./customer-package.zip --directory ./ddp-customer --release H15 --format board-sdmx-zip
starforge fred ddp receive --kind package --input ./customer-package.csv --directory ./ddp-customer-csv --release H15 --format ddp-csv
```

CSV input supports the original DDP series-in-columns, series-in-rows and sequential-list layouts. Label rows and original cell positions remain attached to their source values. When an original CSV needs explicit layout coordinates, supply `--layout path/to/layout.json`. Row and column coordinates are one based. The layout records the original header, data bounds, period cells, series cells and available metadata cells; it does not replace the source file.

For direct XML, pass `--format board-sdmx-xml` and repeat `--supplemental FILE` for the original structure files. The parser reads Board compact SDMX series and observations and preserves original codelists, enumerations, concept bindings and annotations. It uses their returned labels when they resolve unambiguously.

Inspect the package before saving its migration:

```sh
starforge fred ddp inspect --input ./ddp-customer/capture.json --section series --limit 100
starforge fred ddp inspect --input ./ddp-customer/capture.json --section series --frequency M --query Treasury
starforge fred ddp inspect --input ./ddp-customer/capture.json --section observations --series-id ORIGINAL_PACKAGE_SERIES_ID --limit 100
```

Use the exact frequency code returned in the source inventory. The source retains the Board's actual code and label; the original package series ID identifies one series instance and its position in that package.

## Save a whole-package mapping and migration

The example `examples/h15-migration.json` is an operator configuration. Its original observation values are acquired from the complete source packages.

```sh
starforge fred ddp map --crosswalk ./ddp-crosswalk/capture.json --package ./ddp-customer/capture.json --output ./migration/mappings.json
starforge fred ddp plan --crosswalk ./ddp-crosswalk/capture.json --package ./ddp-customer/capture.json --config ./h15-migration.json --output ./migration/plan.json
starforge fred ddp page --input ./migration/plan.json --section mappings
starforge fred ddp page --input ./migration/plan.json --section acquisitions
```

A mapping decision identifies the original `release` and `boardSeriesId`, chooses `map` with one candidate `fredSeriesId` from that exact crosswalk, or chooses `exclude`, and includes its reason. The saved plan carries every decision, the source identities, the normalized observation window and the exact native FRED selections.

The acquisition list groups up to 50 unique target series into original FRED selections and respects the configured response page size and maximum row capacity. Each original package series keeps its own position and mapping even when several source instances use the same target series. The project operator acquires the complete planned list and returns one immutable receiving report.

## Review source meaning and compare returned values

Unit, unit multiplier, currency, frequency, weekly ending convention and seasonal adjustment travel with the original source. A raw Board `UNIT_MULT` code remains the original code and its supplied definition. A reviewed binding selects a positive exact source or target scale and records the expected returned FRED metadata when the original meanings need reconciliation.

A binding applies to the exact original package series ID. It can retain `periodRule`, `sourceScale`, `targetScale`, `expectedFredUnits`, `expectedFredFrequency`, `expectedFredSeasonalAdjustment` and a reviewed reason. Calendar rules align original period labels to their own month, quarter, half-year or year; they do not calculate another frequency. Duplicate aligned periods stay visible for correction.

The complete receiving operation uses one original native FRED capture for each exact planned selection:

```sh
starforge fred ddp compare --crosswalk ./ddp-crosswalk/capture.json --package ./ddp-customer/capture.json --plan ./migration/plan.json --capture ./fred-batch-1/capture.json --capture ./fred-batch-2/capture.json --output ./migration/receiving.json
starforge fred ddp page --input ./migration/receiving.json --changes-only true --limit 100
```

The comparison retains original Board row order, original FRED row context, both missing states, source-only and target-only periods, and the exact source IDs. Numeric differences use decimal arithmetic. Both raw and scaled differences are **FRED minus Board**. The scaled difference is supplied when the reviewed source meanings agree; the raw difference preserves the original numeric comparison.

| Receiving status | Meaning |
| --- | --- |
| EQUAL / DIFFERENT | Comparable values have equal or different exact scaled decimals |
| BOTH_MISSING / MISSING_CHANGED | Both observations are missing, or the missing state differs |
| SOURCE_ONLY / TARGET_ONLY | A selected period occurs on one side |
| MEANING_REVIEW | Returned source meanings or period alignment need a reviewed binding |
| EXCLUDED / UNMAPPED / AMBIGUOUS | The original package mapping state remains attached to the source |

The saved project produces complete JSON, CSV and offline HTML receiving files. Its full portable bundle carries the original crosswalk, package, migration, returned FRED captures and receiving graph; opening or receiving that bundle rebuilds the source-linked comparison. See [PROJECT.md](./PROJECT.md) for the complete project workflow and original continuation IDs.

## Export and repeat the customer workflow

```sh
starforge fred ddp export --input ./ddp-customer/capture.json --output ./handover/package-capture.json
starforge fred ddp export --input ./ddp-customer/capture.json --raw-file customer-package.zip --output ./handover/customer-package.zip
starforge fred ddp export --input ./migration/receiving.json --output ./handover/receiving.json
```

A complete source output keeps the original envelope. Raw-file export restores the exact original file bytes. Reusing an existing output checks the saved content before returning it. A repeated raw-file receive into its original directory reuses the original received source identity when the complete source bytes and interpretation agree.

A later crosswalk can be compared against the retained earlier crosswalk with `map --before OLD_CAPTURE --crosswalk NEW_CAPTURE --output COMPARISON`. That comparison preserves added, removed, changed and unchanged mapping groups and both sets of original rows. A later customer package and a later FRED as-of date produce another saved migration and receiving, leaving the previous customer handover reproducible.

## Capacity and installed modules

A complete original file or combined package can contain up to 256 MiB of original source bytes. The source envelope is limited to 384 MiB. ZIP receiving supports stored and deflated members, validates their original sizes and CRC32, and permits up to 512 MiB of expanded content and 1,024 members. Source and receiving inspection pages contain up to 1,000 rows, with the complete model retained underneath.

Typed installed exports are `./seller/fred/ddp/files`, `crosswalk`, `package`, `periods`, `migration`, `receiving` and `source` beneath the same DDP prefix. The native command and project operator are installed through the existing FRED contribution. The existing FRED source and publication mechanisms remain the common engine for each planned observation acquisition and customer edition.

## Complete large release packages

Original ZIP and XML imports validate the complete source, every original series and every observation before they become package captures. The SDMX reader retains the original text and observation extents. Series pages use the retained counts and period limits; observation pages expand the requested original range. This allows a complete release to remain available without keeping every expanded observation object in memory at once. The source capture, original file SHA256, ordering, missing markers and public JSON shapes remain the same.

The original H.15 archive received on October 12, 2026 contains 263 series and 924,369 observations. All 263 source series occur in the Board's complete 50,313-row crosswalk. Its included H15_struct.xml and frb_common.xsd define UNIT_MULT as a literal factor: 1 means one, 1000 means thousands, and .01 means hundredths. Use these original definitions when reviewing source meaning. Frequency codes also come from those original structures; for example, 9 means Business day and 129 means Monthly.

For native integrations, read a series' `observations` property once within a series operation and reuse that complete frozen array. It is materialized from the retained source when requested. Package page helpers use exact source extents, and fixed or last-count migration windows retain the selected periods while preserving original row order. An internal call to `validateFredDdpMigrationPlan(value, {copy:false})` or `validateFredDdpReceiving(value, {copy:false})` returns the validated original descriptor reference; the default still returns a copy. Supplying complete source context continues to recompute the full identity from those originals. The shared `canonical-stream.mjs` hashes the same canonical bytes in chunks, so existing source, migration and receiving IDs remain unchanged.
