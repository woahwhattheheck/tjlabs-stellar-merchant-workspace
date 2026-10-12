# Original DDP package migration in the economic-report project

The DDP workspace takes a complete retained Board package and its original Board-to-FRED crosswalk through a reviewed migration, the planned native FRED acquisitions, a complete comparison, and portable receiving. Every original package series stays visible, including reviewed exclusions and separate Board series that map to the same FRED target. The resulting native captures join the existing analyst review, recurring briefing, release-watch and merchant workflow.

Use the [source guide](./README.md) for original Board acquisition and CSV/SDMX import. The Board [data catalogue](https://www.federalreserve.gov/data.htm), [original crosswalk CSV](https://www.federalreserve.gov/data/documents/DDP-FRED%20Data%20Series%20Crosswalk.csv), and [H.15 SDMX archive](https://www.federalreserve.gov/releases/h15/data/FRB_h15_xml.zip) identify the public source inputs. FRED's [series observations API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) defines the native observation acquisition used by the existing economic project.

## A complete operator workflow

Open an existing private FRED project in the [economic workspace](../README.md). The browser accepts complete retained source envelopes and original CSV, SDMX XML or ZIP files. An original archive can retain its accompanying structure/schema files. CSV imports retain the chosen original row, column or list layout and actual cell coordinates.

1. Retain the original Board crosswalk. Acquire the official HTTPS CSV or import its complete source envelope.
2. Retain the original package. Inspect its release, frequencies, series identities, observations and original source metadata. The original bytes, filename and actual acquisition provenance remain in the capture.
3. Name the migration and choose its FRED as-of date and observation-window policy. Retain an original customer bookmark and context note when they explain how the package was used.
4. Review the whole package mapping. A mapping decision uses the exact release and Board series identity. A selected target must be an original crosswalk candidate; an exclusion retains the analyst's reason.
5. Preview and save the full migration. The preview identity binds the project, raw package, raw crosswalk, reviewed decisions, period/meaning bindings, window and native acquisition selections.
6. Acquire the saved migration. The operation completes every planned FRED batch, prepares the complete comparison files and adopts the original captures and receiving together.
7. Review observation differences and source meaning. Download the complete HTML, CSV or JSON, and use the returned native capture IDs in the existing analyst and recurring-report workflow.
8. Export the complete project and receive it in another private directory. The receiver restores the original source envelopes, plans, native acquisitions, report models and original comparison bytes.

The Board package represents the current-published values captured in that file. The FRED acquisition has its separately retained as-of selection. Both are visible in the comparison; a later FRED selection does not rewrite the original Board snapshot.

## Window and meaning choices

| Choice | Retained behavior |
| --- | --- |
| Source periods | Preserve the original selected package periods and source ordering. |
| Fixed dates | Retain an explicit start and end date for the observation comparison. |
| Last observations | Retain the original observation count, including missing markers. |
| Map | Bind one original release/Board series pair to a reviewed original crosswalk candidate. |
| Exclude | Keep the original series and the analyst's explicit exclusion reason in the migration. |
| Period rule | Use exact dates, months, quarters, half-years or years without silently resampling values. |
| Reviewed scale | Retain positive exact decimal source and target scales with the analyst's reason. |
| Expected FRED meaning | Compare returned units, frequency and seasonal adjustment with the reviewed expected metadata. |
| Bookmark and note | Retain the original customer context as plan input; the bookmark is a reference string. |

A plan is ready for acquisition when each original series is mapped or explicitly excluded, selected periods form a valid window, and at least one target acquisition exists. The preview keeps unresolved mapping rows available for review. Returned FRED units, frequency and seasonal adjustment are evaluated after their original metadata has been acquired.

The acquisition deduplicates target IDs while preserving original source series in the receiving. Two Board series that resolve to one FRED target remain two distinct original series with their own metadata, source observations and comparison rows.

## Native commands

The installed dispatcher and the direct module run the same project operations:

~~~sh
starforge fred ddp-sources --project /absolute/private/economic-project
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/project-cli.mjs --help
~~~

Source acquisition and imports use explicit operation IDs and the project revision being reviewed:

~~~sh
starforge fred ddp-crosswalk-acquire \
  --project /absolute/private/economic-project \
  --id board-crosswalk-oct12 --expected-revision 1 \
  --out /absolute/private/crosswalk-import-result.json

starforge fred ddp-package-import \
  --project /absolute/private/economic-project \
  --id original-board-package --expected-revision 2 \
  --input /absolute/private/original-package-capture.json \
  --out /absolute/private/package-import-result.json
~~~

The source guide describes creating the complete original package envelope from raw CSV/SDMX. These commands consume that envelope directly. The import results return the retained crosswalk/package identity and its source summary.

Use actual returned identities in a migration configuration:

~~~json
{
  "packageId": "fred-ddp-package-<original package digest>",
  "crosswalkId": "fred-ddp-crosswalk-<original crosswalk digest>",
  "name": "Customer Board package migration",
  "asOf": "2026-10-12",
  "window": { "kind": "source" },
  "decisions": [],
  "bindings": [],
  "pageSize": 1000,
  "maxRows": 1000000,
  "bookmark": null,
  "note": "Retain the package's original reporting purpose and the analyst's review context."
}
~~~

An explicit mapping decision has `release`, `boardSeriesId`, `action`, a reviewed `note`, and `fredSeriesId` for a mapping. An explicit meaning binding has the original package `seriesId`, a `periodRule`, positive decimal `sourceScale` and `targetScale`, optional expected FRED units/frequency/seasonal adjustment, and its review note. The browser and full preview show the source values needed for those choices.

Preview the complete plan, then save those exact inputs and the returned preview identity:

~~~sh
starforge fred ddp-migration-preview \
  --project /absolute/private/economic-project \
  --migration-config /absolute/private/migration-config.json \
  --section mappings --limit 100 \
  --out /absolute/private/migration-preview.json

starforge fred ddp-migration-save \
  --project /absolute/private/economic-project \
  --id reviewed-package-migration --expected-revision 3 \
  --migration-config /absolute/private/migration-config.json \
  --preview-id "RETURNED_PREVIEW_ID" \
  --out /absolute/private/migration-save-result.json
~~~

A page controls the visible rows. The preview identity covers the complete plan, including every source series, mapping decision and native acquisition batch.

Acquire the whole saved migration:

~~~sh
starforge fred ddp-migration-acquire \
  --project /absolute/private/economic-project \
  --id acquire-reviewed-package --expected-revision 4 \
  --migration "SAVED_MIGRATION_ID" \
  --out /absolute/private/migration-acquisition-result.json
~~~

The existing project's `apiKeyEnv` selects the FRED key from the process environment. Each planned batch uses the original `captureFred` acquisition with the exact retained normalized selection. The whole operation returns `migrationId`, `receivingId`, the receiving summary, ordered `captureIds`, the operation ID and the new revision.

Inspect and export the result:

~~~sh
starforge fred ddp-receiving \
  --project /absolute/private/economic-project \
  --receiving "SAVED_RECEIVING_ID" \
  --changes-only 1 --limit 100

starforge fred ddp-receiving-file \
  --project /absolute/private/economic-project \
  --receiving "SAVED_RECEIVING_ID" \
  --format html --out /absolute/private/ddp-comparison.html
~~~

Use `--format csv` or `--format json` for the other complete original files. Full source and plan files have their own `ddp-crosswalk-file`, `ddp-package-file` and `ddp-migration-file` commands. Output files are created exclusively, so a named prior deliverable remains intact.

## Receiving and the offline comparison

The comparison retains every original row and one complete meaning record per source series. It records the original package observation, actual FRED observation and capture identity, original period text, normalized comparison period, and exact raw/converted differences.

| Status | Meaning |
| --- | --- |
| EQUAL | Compatible meaning and equal exact converted values. |
| DIFFERENT | Compatible meaning and different exact converted values. |
| BOTH_MISSING | Both original observations retain a missing value. |
| MISSING_CHANGED | The original missing/value state differs. |
| SOURCE_ONLY | An original selected Board observation has no matching selected target observation. |
| TARGET_ONLY | A selected FRED observation has no matched original source observation. |
| MEANING_REVIEW | Source/target meaning or period matching needs explicit analyst review. |
| EXCLUDED | The original series is retained with a reviewed exclusion. |
| UNMAPPED | The original series has no resolved target in the migration preview. |
| AMBIGUOUS | The original series retains unresolved candidate mappings in the preview. |

Resolve the preview's unmapped or ambiguous series before whole-package acquisition. Differences are **FRED minus Board**. Exact decimal arithmetic preserves the original numeric strings; a converted difference is present only when the retained source/target meaning is compatible. The raw difference is available separately. The complete receiving retains original missing markers and source coordinate/attribute records.

The offline HTML includes all receiving data once and pages the visible table in groups of 100. Filter by original series, comparison status, period or value; open an observation's original-row detail to inspect both source rows, their meaning record and source provenance. Its CSV and JSON download buttons export the complete comparison, including rows outside the visible filter.

Three files are retained in a fixed order:

| File | Content |
| --- | --- |
| `ddp-receiving.json` | Complete immutable receiving model, including source, captures, meanings, observations and summary. |
| `ddp-receiving.csv` | Complete ordered observation comparison with original rows, source/target meaning and exact differences. |
| `ddp-receiving.html` | Complete offline reader with filters, source details and full CSV/JSON export. |

Each project receiving summary retains `rendererVersion`, plus each file's path, content type, byte count and SHA256. The initial renderer is `FRED_DDP_RECEIVING_V1`. Its preparation pins the renderer and exact file descriptions before writing members; project adoption occurs after all members complete. A future renderer can add a new version while preserving the original implementation for saved results.

The receiving files are prepared in the private project. The acquired source captures remain available for the existing separately reviewed analyst briefing and merchant publication flow.

## Recovery and replay

Source import stages the complete immutable source before the compact project transaction. The pending import stores only `crosswalkId` or `packageId`. If the connection is interrupted, read the current project operation and continue the same ID/revision with that retained source identity. A continuation uses its original staged source and keeps large package bytes out of browser session storage.

A saved migration's pending payload contains the complete normalized external inputs and the preview ID. The browser can resend that original request after reconnecting. Reusing an operation ID with different reviewed inputs returns the existing project's conflict response.

Whole-package acquisition has one project operation. Each native batch uses a deterministic directory under that operation and the original source acquisition's retained response progress. The operation's small progress file records completed batch identities and the active batch. SIGINT/SIGTERM stops acquisition through its abort signal; the next identical operation resumes those original directories. Successful batches remain available if a later batch needs a provider retry.

After a migration has a complete retained receiving, another acquisition action for that same immutable plan returns the original receiving and capture identities. Choose a new migration plan/as-of selection when the reporting purpose needs another source edition.

## Complete portable project v5 and v6

A project with DDP work exports the following complete digest identity:

~~~text
schema
state
captures
publicationPlans
briefings
releaseCaptures
releasePlans
ddpCrosswalks
ddpPackages
ddpMigrations
ddpReceivings
~~~

The schema is `stellar-forge.fred-project-bundle.v5`; `bundleSha256` is the existing canonical digest of those complete fields. The original observation, publication, briefing and release arrays stay present, including empty arrays. DDP raw source envelopes carry original file bytes and acquisition provenance; migration entries carry full immutable plans; receiving entries carry complete immutable comparison models.

A project can also retain the county labor-market product described in the [QCEW guide](../qcew/README.md). Its original `qcew` field contains the complete `stellar-forge.fred-qcew-extension.v1` source and edition inventories. New QCEW-containing exports use `stellar-forge.fred-project-bundle.v6` and retain every field above plus `qcew`. The four DDP arrays are empty when that county project has no DDP work. A project with both products includes both complete source and report families. The original state determines which adopted families must be present; empty arrays cannot replace an adopted DDP family.

Earlier v5 QCEW files remain readable with their exact original digest: a QCEW-only v5 file has its `qcew` field and omits the four DDP arrays; a combined v5 file retains both families. Receiving checks the complete fields of that original version. A new export of a received county project uses v6, while its source and report identities stay unchanged. A DDP-only project continues to export exact v5.

The shared pure `validateFredDdpProjectBundle` verifies original source inventories, rebuilt plans, exact planned native selections, complete rebuilt receiving models, comparison file identities and the original source/save/acquisition chronology. Both the project receiver and installed operator use that implementation. A receiving directory restores the same original source/plan graph, writes the comparison files with their retained renderer, checks their byte identities and commits the original project state.

The original QCEW state and extension validators check county source, profile, CPI observation and edition relationships before receiving writes begin. Its existing receiving helper restores the complete original edition files before the shared project state commits. Both products use the same operation journal, project lock and revision sequence; `transactFredProject` exposes that original transaction for the county workflow. `exportFredProject` and `receiveFredProject` accept the original optional `qcewSourceContexts` Map, keyed by source capture SHA, so one native operation can reuse its validated CSV union across reports, export and reopening. Those process-local contexts are excluded from project files and digest identities.

Existing projects continue to use their original v1-v4 formats when they have neither DDP nor QCEW work. Recurring briefing versions, saved reviews, release watches, source snapshots, county report files and merchant publication inputs retain their existing identities.

A complete original DDP source envelope has a 384 MiB reader capacity; original package files and supplemental files together have a 256 MiB source-byte capacity. Complete v5 and v6 project transfers have a 480 MiB capacity. The private source files and individual complete comparison files remain independently downloadable.

## Integration points

`ddp/project-state.mjs` owns the additive persistence family. Original `project.mjs` binds it to the existing private transaction, capture adoption, versioned export/receive and project view. The public typed project interface is `ddp/project-types.d.mts`; its named values correspond to the original `project.mjs` exports. The distribution's `./seller/fred/ddp/project` entry points to that original runtime.

`ddp/project-validation.mjs` is the shared pure graph validator. `ddp/receiving-report.mjs` owns the versioned offline files. `ddp/project-cli.mjs` supplies the native commands and handles cancellation inside `runFredDdpProjectCommand`, including when called through the installed dispatcher. The browser and installed workspace operator call the same project operations.

Use the [recurring briefing guide](../briefing/TEMPLATES.md) and [release-project guide](../releases/PROJECT.md) to turn adopted observations into later report editions and release-driven reporting work.
