# Camino Guyane — complete edition receiving and review

This programme receives the complete retained Camino publisher and data.gouv
editions into the existing Analysis application. The original dataset engine
owns immutable tables, editable saved SQL, reports, typed workbooks, complete
workspace export and independent receiving. The programme adds Camino source
meaning and a complete operating course to that application.

Start with [connected receiving](CONNECTED_RECEIVING.md) when continuing the
original equipped-host operation. That caller keeps the full source, original
input files, report/workbook outputs and saved operator work in one lifetime.

## Publish a reviewed edition through Prodige

[Prodige publication](PRODIGE_PUBLICATION.md) reuses the complete original
Analysis export and explicit field mapping to prepare CSV/GeoJSON and the actual
selected instance's append/update requests. It retains the complete documented
contract, exact source files and all paginated target readback. The original
catalogue session owns execution and credentials. The full 61-row original
Camino comparison example is included under prodige-reference.

## Source selection and interpretation

| Edition | Original selection | Retained bytes |
| --- | --- | ---: |
| Publisher | https://api.camino.developpement-durable.gouv.fr/titres?departements=973&format=csv | 1,482,839 |
| Tabular | https://tabular-api.data.gouv.fr/api/resources/df16a407-5292-4f03-b8b7-f028b66b5150/data/csv/?departements__exact=Guyane | 1,516,924 |

The receiver uses the already-retained originals and their actual whole-file
SHA-256 identities. A fresh request to either URL creates a new observation.
The two selected populations can differ: the exact-Guyane tabular filter may
omit a publisher cell containing several departments. Every original field is
preserved as text, including blanks, reference strings, dates, geometry,
names and reported areas. Whole source IDs must be present and unique before
the keyed comparison is imported.

The publisher CSV uses explicit DD-MM-YYYY dates. The retained Samuel title
REST response confirms 2026-04-02 to 2028-04-02 for publisher strings
02-04-2026 to 02-04-2028. The tabular representation reported February dates
for that same title. The course retains both raw representations and their
separately interpreted period quality, uses publisher dates for the timeline,
and records keyed endpoint differences. It never swaps date components
heuristically or overwrites an original.

The related complete tabular column projections contain 1,729 distinct IDs:
1,171 expired titles, 324 closed applications, 154 valide titles, 77 initial
applications and three valide - survie provisoire titles. Those separate
projection observations are retained source material. The complete CSV
programme derives its own actual populations and values; those counts are not
acceptance constants for an independently timed publisher edition.
Counts refer to titles/applications, never operating mines.

The original index contains 21 complete files: both selected CSVs,
catalogue/profile/schema, complete column projections and baseline,
publisher subset/date comparison, Samuel REST response and the actual
published selection/format contracts. Source contracts remain data.
Downloaded JavaScript source is never evaluated.

## Six editable analytical sections

1. **Titles by exact status and type.** Groups original publisher rows without
   merging valide and provisional-survival statuses.
2. **Administrative periods and edition review.** Keeps every title's raw
   publisher dates, nullable interpreted ISO dates, publisher period quality,
   tabular dates/period quality and keyed date comparison. Missing application
   dates remain distinct from invalid or reversed periods.
3. **Reported title area by exact status.** Parses finite decimal tokens
   explicitly, computes exact decimal sums and reports present, missing,
   invalid and nonpositive coverage. Reported km² can overlap; this is neither
   a geographic union nor an active footprint.
4. **Substance occurrence.** Uses the observed semicolon delimiter, preserves
   literal tokens and reports distinct title counts plus occurrence counts.
   Multi-substance titles contribute to several rows.
5. **Organization and territory coverage.** Reports field coverage by status.
   A separate query lists literal organization and territory tokens.
   Municipality labels retain parenthesized area text; names are not inferred
   to be unique legal entities.
6. **Geometry and source quality.** Reports GeoJSON presence, supported
   structure and coordinate ranges alongside date quality and edition
   differences. Full original geometry remains in the source and archive.
   Structural review does not claim polygon topological validity.

Additional saved queries expose both full original tables, every raw-field
difference, organization/territory names and administrative-period review.
Browser previews have explicit limits; the immutable tables and complete
workspace archive retain every row.

## Runtime and source closure

The selected runtime is the coherent source from repository commit
c12e248ac955672d9744163aef526d9ea9547692. The runtime-source.json descriptor
lists all 88 original files, including the maintained CSV parser, Analysis
modules, report/workbook/archive implementations and original browser assets.
The runtime-source.json.gz archive holds that whole source packet:

- Archive: 529,153 bytes; SHA-256
  7845ba47fd9952304f55b199118b7daab60127f918c555fd21784ee1569f2a4e.
- Decoded packet: 2,176,666 bytes; SHA-256
  6cb9bb2d196d80a4b0c3639076050fed4eb0b91259b5ddff5a6405905fb8a995.

The runtime.py helper verifies those complete identities and every original
member before preparing private paths. Use prepare_runtime(...) and
activate_runtime(prepared) in the same Python lifetime as the product.
The receiver uses Linux, Python 3.11 or later and the selected Node executable.
The maintained parser is products/conapi/supplier-report/supplier-report.mjs;
this pure CSV parser needs no npm package or Node 24-specific API. Retain the
actual Node version/path and use the original browser runtime's supported Node
binding for rendered inspection.

Workbook creation uses unchanged openpyxl==3.1.5 and et_xmlfile==2.0.0.
The workbook-runtime.json descriptor retains official package metadata,
original source-release URLs and exact byte/SHA bindings. The helper imports
those unchanged source distributions, or the receiver may supply matching
installed packages. No hosted CI or paid runner is part of this course.

Materialize the selected source under one root, preserving repository
relative paths. No .git directory is required. The Python import root is
stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python. This selected
closure does not install every optional buyer SDK feature.

## Local input contract

The original receiver materializes all 21 retained files before calling the
programme. Short-lived download grants stay in that receiving process.
Its local received.json contains:

~~~json
{
  "schema": "commons.camino-received-inputs.v1",
  "source_index_sha256": "ad6d931300d82418ee297ef7259ae94456dbd8e8621e779bd2c99963e585700f",
  "files": [
    {
      "filename": "the exact original filename",
      "path": "/absolute/private/original/file",
      "bytes": 123,
      "sha256": "the actual complete 64-character hash",
      "reference": "the stable original provider file reference"
    }
  ]
}
~~~

Include all 21 records, not just the illustrative record above. Intake
recomputes every byte count and hash. The original source document carries
copies, meaning, complete parser row/line results, calculation source and
the original input manifest.

## Complete course

After runtime activation, run the original CLI with absolute paths:

~~~sh
python products/camino-guyane/receive.py run \
  --runtime-root /absolute/private/runtime/source \
  --input-manifest /absolute/private/inputs/received.json \
  --work-root /absolute/private/camino/course \
  --operation ORIGINAL_OPERATION \
  --node /absolute/path/to/node
~~~

The completed course writes course/course.json, course/analysis/ and:

- exports/Camino_Report.html
- exports/Camino_Report.json
- exports/Camino_Report_Tables.zip
- exports/Camino_Analysis.xlsx
- exports/Camino_Workbook_Handover.zip
- exports/Camino_Workspace.zip

The report contains all six saved sections. Workbook area totals are exact
decimal text. ISO date cells come only from the explicit nullable derivative
fields. Raw date/reference strings remain in their original tables. Full
geometries remain in source and archive instead of being truncated to fit
Excel's text-cell limit.

The course.json record returns workspace, operation, attempt,
input_binding_sha256, views, queries, report, workbook, complete files[]
identities and the original archive path/bytes/SHA/job ID.
Report name: camino_guyane_report. Workbook name: camino_guyane_workbook.
The six principal saved queries are camino_status_type, camino_timeline,
camino_reported_area, camino_substances, camino_coverage and camino_quality.

Receive the exact archive into an independent absent directory:

~~~sh
python products/camino-guyane/receive.py receive \
  --runtime-root /absolute/private/runtime/source \
  --archive /absolute/private/camino/course/exports/Camino_Workspace.zip \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --target /absolute/private/camino/cold \
  --operation ORIGINAL_OPERATION-cold \
  --node /absolute/path/to/node
~~~

The maintained restore_archive owns extraction and crash recovery. It gets
the exact SHA and a stable derived native operation ID. The command reopens
Analysis and writes /absolute/private/camino/cold-receiving.json with actual
workspace identity and report/workbook revisions.

Open the same cold workspace in its original operator interface:

~~~sh
PYTHONPATH=/absolute/private/runtime/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python \
python -m stellar_forge_buyer.analysis_workspace \
  --database /absolute/private/camino/cold serve --port 0
~~~

Read the server's actual private_launch file and open its original private
URL. Use the saved queries, inspect every report section, open exported HTML,
preview each workbook sheet, download/open the exact XLSX and open usable
contents of every complete ZIP. Check the normal presentation width and
relevant narrow width. Retain actual observations in the original operation.

After actual use, save a substantive operator note into revision two:

~~~sh
python products/camino-guyane/receive.py revise \
  --runtime-root /absolute/private/runtime/source \
  --workspace /absolute/private/camino/cold \
  --operation ORIGINAL_OPERATION-review-2 \
  --note 'The actual finding and editorial decision after opening the product.' \
  --node /absolute/path/to/node
~~~

This uses the original report/workbook revision APIs and preserves revision
one. Outputs are cold-revision-2/course.json and
cold-revision-2/exports/Camino_Workspace.zip. Receive that exact archive with
the same receive command into a second absent target, for example
reopened-revision-2, then open/use the actual second revision. The note must
describe the actual review, not the illustrative wording above.

The connected course performs those steps in one retained lifetime. It
pauses at the rendered result for actual observation, receives the operator
note, then continues revision two and final opening. The inspect_original.mjs
script operates the existing application rather than creating a dashboard.

## Recovery and editing

Each phase stores its exact request and selected job before dispatch.
Completed native jobs are reused. Supported interrupted imports and
interrupted/failed workspace exports resume using their original IDs.
A terminal nonresumable phase gets a linked successor ID while retaining
every preceding request/result. The explicit --attempt identifies execution
without invalidating completed phases.

The first source document is bound to all original inputs, complete projected
collections and meaning. A report-only correction reuses that first document
and its truthful original producer. Current implementation bytes are retained
separately in implementation-history. A changed transformation belongs to a
new explicit edition/work root; the prior editable workspace remains intact.

An error after Analysis opens produces failure.json and attempts the original
complete workspace export. Its partial archive stays editable. The outer
receiver preserves source/runtime/input and phase history for continuation.

Initial imports use explicit column mappings, reviewed source revisions and
named-view compare-and-swap. A replay does not replace an operator-edited view
or silently rewrite saved SQL. Continue operator edits through the original
Analysis UI and revision APIs.

## Delivery state and sources

The complete source review used the actual maintained import, report,
workbook, export, restore and revision contracts. Native execution, final
file identities and actual visual use are recorded by the receiving host as
they occur. Source delivery preserves the full runnable course.

Primary source references:

- https://api.camino.developpement-durable.gouv.fr/titres?departements=973&format=csv
- https://tabular-api.data.gouv.fr/api/resources/df16a407-5292-4f03-b8b7-f028b66b5150/data/csv/?departements__exact=Guyane
- https://api.camino.developpement-durable.gouv.fr/rest/titres/m-ar-samuel-2025
- The full 21-file source index retains original catalogue, schema, projections
  and published API/source-contract documents alongside these responses.

## Consumed owner instructions

The following is the complete current repository instruction, carried into
this guide for every source, receiving and rendering worker.

# Repository delivery instructions

Use the current README and the existing product's build/receiving guide. Coordinate through the original implementation and receiving owners, preserve concurrent source, and carry work through its authorized delivery.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

## GitHub Actions zero spend — existing owner instruction

Keep GitHub Actions disabled in this repository's provider settings and preserve the disabled source policy in [.github/hosted-ci-policy.json](.github/hosted-ci-policy.json). Every workflow job must retain the established literal-false condition, including manual dispatch and reusable jobs. Preserve its original condition inside the wrapper, and preserve the complete steps, commands, source and delivery artifacts.

Run focused product work in the existing cloud Linux or original local receiving operation. A public repository, available free minutes, cloud admission failure or a missing green check does not authorize enabling or dispatching hosted Actions. Do not set `HOSTED_CI=on`, add scheduled hosted runs or choose a paid runner. Keep source-native receiving moving with its original owner and saved operation.

Before publishing workflow changes, use the maintained Commons `tools/hosted_ci_gate.py --zero-spend REPO_ROOT` and `--check REPO_ROOT` source operation where that existing runtime is available. Its canonical wrapper is `${{ (false) && (ORIGINAL_CONDITION) }}`; the original condition is retained for native continuation. Provider disablement, the whole-account spending budget and dated billing remain separate controls; preserve current artifacts and their original custody.

This carries Bryce's existing zero-spend instruction from [Commons RULES, CI and spend](https://github.com/woahwhattheheck/commons/blob/main/RULES.md#4-ci-and-spend) into this repository's consumed entry guidance. Original cost coordination: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791755765336589 .
