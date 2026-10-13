# Reporting programmes on Source Tables

A reporting programme keeps a recurring report's complete SQL, effective parameters, calendar, original output editions and delivery outcomes in one editable Source Tables project. Each report can continue into later periods while retaining the earlier query versions, result files, reasoned source corrections, comparisons and recipient handovers.

Use the actual database/reporting provider to execute SQL and its configured scheduler to run due work. This installed programme receives those complete outputs and observations. The existing Source Tables workbench provides field mapping, record decisions, save/reopen and the native merchant workspace. The existing Data Preparation product provides its original SQL/SQLite preparation tools when those are the chosen source workflow.

## Install and open

Node.js 22.16 or later runs the operator. Build from the intended public repository commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD --selection reporting-programmes \
  --out /absolute/packages/reporting-programmes
~~~

Install the returned archive in the intended application directory and keep its source manifest and hash:

~~~sh
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
npx --no-install starforge doctor
npx --no-install starforge reporting-programme help
npx --no-install starforge source-tables serve --port 8787
~~~

Open the printed Source Tables URL. Keep the existing managed application and stable host/port when one is already installed. [Source Tables operating guidance](../OPERATING.md) gives the complete Applications, runtime-transfer, merchant and buyer continuation.

From a full checkout, replace `starforge reporting-programme` below with `node products/source-tables/reporting/programme-cli.mjs`. Every output uses a new path. The CLI writes a complete temporary file in that directory, syncs it, and creates the selected output only if that path is absent. It preserves input files and existing outputs. Create the intended private parent directory before running it.

## Prepare the programme

Start with a `create` request. The complete example `examples/create-programme.example.json` is an operator input template. Replace its declared example fields with the original customer's report agreement and SQL.

Every request has:

| Field | Meaning |
| --- | --- |
| operationId | Stable ID for this exact recording operation; reuse the same full request when recovering its result |
| at | Actual recording timestamp with UTC or numeric offset |
| actor | Recording operator |
| kind | create, define, run, delivery or source |
| input | Complete operation input |
| expectedProjectSha256 | Optional fingerprint from inspect/apply, used to reject a different selected project |

A report definition includes its stable `id`, title, complete meaning, parameter template, source/ownership description, complete SQL file and calendar. Calendar status is `proposed`, `configured` or `manual`; it includes the actual IANA timezone and a complete period/missed-run rule. A configured calendar also retains its actual native schedule ID. An expression is retained literally; the programme does not interpret a provider-specific cron or relative-date language.

Complete file inputs use `filename`, `content`, optional `encoding: utf8|base64` and `mediaType`. Optional `bytes` and `sha256` are checked against the complete body. Filenames are basenames. Binary attachments use canonical padded base64. SQL and reviewed CSV results use UTF-8. The CLI additionally accepts `fromFile` in place of content, relative to the request JSON; it reads that actual complete file and stores its bytes in the project. There is no continuing dependency on the input path after receipt.

~~~json
{
  "operationId": "original-programme-create",
  "at": "2026-10-13T15:00:00Z",
  "actor": "Recording operator",
  "kind": "create",
  "input": {
    "id": "customer-reports",
    "label": "Customer reporting programme",
    "reports": [{
      "id": "invoice-position",
      "title": "Invoice position",
      "meaning": "Replace with the agreed period, inclusion and amount semantics.",
      "parameters": {"as_of": "2026-09-30"},
      "sourceDescription": "Replace with the original database/snapshot and its owner.",
      "calendar": {
        "status": "proposed",
        "timezone": "America/New_York",
        "expression": "0 8 1 * *",
        "rule": "Use the preceding closed month end; resolve a missed due period explicitly."
      },
      "query": {
        "filename": "invoice-position.sql",
        "fromFile": "sql/invoice-position.sql",
        "mediaType": "application/sql"
      }
    }]
  }
}
~~~

~~~sh
starforge reporting-programme apply --request create.json --out programme-01.json
starforge reporting-programme inspect --project programme-01.json
~~~

The returned definition SHA binds the complete SQL, parameters, calendar, source description and its revision. Use that exact SHA when receiving a run. A `define` request uses one complete report definition as its input, retaining the prior revision and a successor linked to it.

Supply the customer's complete existing `starter` inside create.input when this programme belongs to an established merchant. Without it, the unchanged Source Tables generator supplies its original illustrative testnet starter. Select and operate real merchant routes, payment choices and receiving through the original installed workflow before a paid-source operation. Merely creating the reporting project does not purchase data.

## Receive each actual run

Retain the original provider run ID and query version, resolved parameters, complete reporting period, source snapshot identity and observed row count. The report ID and definition SHA select the exact original query definition. Record duration or other provider fields in the provider object when available.

A complete run receives its complete UTF-8 CSV result. The row count must match the original reported total. A failed or truncated run receives its actual original files without turning partial output into a complete result resource. Use null when a failed/truncated provider did not supply a row count. A complete zero-row CSV keeps its header and a reported count of zero.

~~~json
{
  "operationId": "receive-original-run-001",
  "at": "2026-10-13T15:10:00Z",
  "actor": "Recording operator",
  "kind": "run",
  "input": {
    "id": "original-run-001",
    "reportId": "invoice-position",
    "definitionSha256": "EXACT_SHA_FROM_INSPECT",
    "status": "complete",
    "provider": {"runId": "ACTUAL_PROVIDER_RUN_ID", "queryVersion": "ACTUAL_QUERY_VERSION"},
    "period": {"from": "2026-09-01", "through": "2026-09-30", "timezone": "America/New_York"},
    "parameters": {"as_of": "2026-09-30"},
    "sourceSnapshot": "ACTUAL_ORIGINAL_DATABASE_SNAPSHOT",
    "reportedRows": 2,
    "result": {
      "filename": "invoice-position.csv",
      "fromFile": "original-results/invoice-position.csv",
      "mediaType": "text/csv",
      "delimiter": ",",
      "header": true,
      "skipEmptyRecords": false
    },
    "files": [{
      "filename": "provider-run.json",
      "fromFile": "original-results/provider-run.json",
      "mediaType": "application/json"
    }],
    "notes": "Record any actual source or due-period qualification."
  }
}
~~~

The example's two-row count is a template; use the actual original total. An original XLSX/PDF/report attachment can travel in files with encoding base64 while the complete CSV receives the typed table review.

~~~sh
starforge reporting-programme apply --project programme-01.json \
  --request run-001.json --out programme-02.json
~~~

One Source Tables document is maintained per report. Identical bytes from different due periods share the original source edition and remain separate run records, with their own period and resolved parameters. A failed query or a retry of one delivery does not create another useful reporting period.

The engine creates a complete technical review using the selected field mapping. Open the saved project in the actual workbench to inspect the output as the recipient will use it. Technical parsing and typed review are separate from the customer's acceptance and original provider success declaration.

## Review, correct and compare

Open programme-02.json in the installed Source Tables workbench. Select the report result table, review every field's type and meaning, and choose stable key fields. Preserve identifiers and monetary digits using integer-text or decimal-text where appropriate. Retain the reviewed output.

Use the existing record review to retain an attributed replacement, exclusion or restoration with its reason. The original CSV bytes stay intact. A corrected value belongs to its source edition and parsing context. Add the next actual period through reporting-programme apply, open that successor, select the appropriate earlier review and inspect the full comparison. The complete native export contains all original source editions and all retained reviews.

The three reporting register tables are projections of the retained definition, run and delivery records. Their normal view mappings and review history remain editable; changes to original business observations go through the corresponding programme request. Later programme requests regenerate the current register source from those original records. A display correction to a register does not rewrite an original provider observation.

After workbench edits, download its full project JSON before the next CLI action. `inspect` returns the current whole-project fingerprint for an optional expectedProjectSha256. Keep the current complete project and request together when recovering a command. The same operation ID and exact same request returns the current project with all later history intact; different input under that ID is rejected.

## Record actual delivery

A delivery input selects the retained run ID, actual route ID, intended destination, observed outcome and actual timestamp. Status is succeeded, failed, uncertain or suppressed-empty. A succeeded route requires its complete original receipt and a complete run. Empty suppression requires a complete zero-row result. A changed outcome or new attempt uses a new delivery ID and predecessorId linking the earlier attempt for the same run.

~~~json
{
  "operationId": "receive-route-attempt-002",
  "at": "2026-10-13T15:15:00Z",
  "actor": "Recording operator",
  "kind": "delivery",
  "input": {
    "id": "route-attempt-002",
    "runId": "original-run-001",
    "routeId": "ACTUAL_SAVED_ROUTE_ID",
    "destination": "Original approved reporting audience",
    "status": "succeeded",
    "receipt": {
      "filename": "original-delivery-receipt.json",
      "fromFile": "original-results/original-delivery-receipt.json",
      "mediaType": "application/json"
    },
    "notes": "Retain the actual recipient/provider outcome."
  }
}
~~~

For an uncertain original outcome, save uncertain and use the provider's existing recovery/status path before recording another attempt. The programme records these observations; mail, webhooks and report delivery continue through the actual original provider. Recipient authority and any warm-contact instruction stay with that original operation.

## Export and receive the whole handover

~~~sh
starforge reporting-programme export --project programme-reviewed.json \
  --out customer-reporting-handover.zip
~~~

The ZIP contains the original native merchant workspace plus:

- source-tables/project.json: complete editable programme, original tables, mappings, decisions and reviews.
- Original Source Tables source/review/comparison files and its native materials manifest.
- reporting-programme/programme.json: complete SQL definitions, actual runs, deliveries and original request history.
- reporting-programme/originals/SHA256/FILENAME: every complete original SQL, result, receipt and retained attachment, including binary bodies.
- reporting-programme/original-files.json: original-file identity and media metadata.
- reporting-programme/complete-files.json: bytes/hash for every preceding ZIP member; it intentionally excludes itself.

Open source-tables/project.json from the complete delivered workspace through `reporting-programme inspect` and the installed Source Tables workbench. Continue the same programme with the next actual period, preserve its earlier review as the comparison baseline, and export the complete successor. Include the selected installed source archive or the existing full runtime transfer so the recipient has the same commands and editable UI.

An individual source file is limited to 16 MiB and a complete project to the original 128 MiB receiving limit. Source Tables retains up to 64 table resources, so the three programme registers leave room for 61 report documents. Each selected native resource has the generator's original 1 MiB output limit; use the existing database/dataset workflow for larger publications. Full original request bodies are retained as well as original files; allow for that complete history in storage planning.

## DataRunner's existing installation programme

Use the original [DataRunner commissioning profile and guide](../../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/DATARUNNER_REPORTING.md) for account selection, source custody, complete query testing, reports, channels, due-period continuation and independent receiving. This product supplies its retained output/period handover. It uses files from the actual supported DataRunner query/CLI/export workflow and keeps the original account-owned schedule as the execution authority.

The prepared Harbor evaluation in the original private company case contains three complete SQL files and its 2026-09-17 fictional source declaration. Preserve its invoice-cohort, cutoff and integer-cent semantics; stock is the current connected snapshot, not a historical stock series. Its schedule worksheet is proposed until selected and inspected in the real reporting account. Count queries from the actual selected month: October 2026 has 31 days and 22 weekdays, giving 1 + 31 + 22 = 54 scheduled invocations for the proposed monthly/daily/weekday combination, before actual previews/retries/other account work.

Original operator and source bodies travel through that same commissioning case. When an existing recipient desk exports complete programme requests, apply them to this same project and original source version. Existing commercial editions, sent correspondence and customer package history stay with the maintained customer record.

## Receive the original DataRunner reporting desk

Use the complete `datarunner.report-handover.v2` download from the original customer desk. The maintained `receive-desk` path resolves query-definition hashes through the original programme engine. It receives every historical run from its own full snapshot, then retains the current prepared query definitions separately. A later imported CSV or SQL edit cannot replace an earlier run's output.

Create a small recording context once and retain it beside that exact handover:

~~~json
{"operationId":"original-desk-receive-001","at":"2026-10-13T15:20:00Z","actor":"Recording operator"}
~~~

~~~sh
starforge reporting-programme receive-desk \
  --source DataRunner-report-handover.json --context receive-context.json \
  --project programme-current.json --out programme-next.json
~~~

Omit --project only when creating the original installed programme. The context may include expectedProjectSha256 from inspect and, for a new project, the original complete starter. Reuse the same full source and context to recover the same receive. The adapter works in memory and publishes only its final complete project through the CLI's create-only output.

It checks each historical snapshot hash, report/provider identity, original result identity and full CSV count through the same engine. Original provider run IDs are retained in provider.runId; the native run key binds the desk source, report and original run together so two reports can retain identical provider ID text safely. A changed full record under an already received original run is rejected. Every original desk handover travels as a complete UTF-8 source file in the project and native archive, including unfinished run forms, current unrecorded imports and calendar planning.

A desk recipient declaration is retained with its run. Complete route IDs and receipts enter through the ordinary delivery operation. The current desk does not supply enough route/receipt fields to infer a succeeded native delivery.

The API is `receiveDeskHandover(project, handoverText, context)` from `@tokenjunkielabs/starforge-merchant/reporting-programmes/desk`. Supply the actual source text to retain its exact bytes; an object input is retained as its complete formatted JSON. The adapter preserves relative original file paths in the full handover and keeps their basename plus hash in the native originals directory.

A source request can also retain complete independent account/export material:
`{operationId, at, actor, kind:"source", input:{description, files:[completeFile]}}`.
It appends the source files and full request without declaring a provider run or delivery.

## JavaScript integration

Import `@tokenjunkielabs/starforge-merchant/reporting-programmes` in the selected installation, or this directory's programme.mjs from a full checkout.

~~~js
import {applyProgramme, programmeIdentity, exportProgramme} from
  '@tokenjunkielabs/starforge-merchant/reporting-programmes';

const result = await applyProgramme(currentProject, completeRequest);
const identity = await programmeIdentity(result.project);
const handover = await exportProgramme(result.project);
// Persist result.project and handover.bytes through the existing owned writer.
~~~

The API accepts complete body-bearing files; fromFile expansion belongs to the CLI. Import/reopen validates original SQL and file identities, definition chains, run/output row counts, complete Source Tables reviews, delivery relationships and complete request identities. The typed interface is programme.d.mts.

## Original installed and rendered receiving

Continue the original DataRunner/Source Tables receiving owner. Build the exact committed selection, create the prepared project, open it in the existing actual workbench at desktop and narrow width, inspect its three definition/register tables and use a real selected result. Review field meaning, retain a reasoned correction, receive a later result edition, compare, save/reopen and export the complete ZIP. Open the delivered project, SQL and each original report attachment. Run the same actual provider period through the chosen original account when its source is selected; keep the returned provider and destination observations with the same request. Return actual rendered observations and material repairs to the original thread.

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

