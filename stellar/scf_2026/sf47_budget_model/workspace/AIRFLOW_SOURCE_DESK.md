# Airflow source and Customer Installation

Open the existing **Grant Operations → Installations → Airflow source** desk. It receives the complete saved two-edition Airflow handover, keeps every DAG/run review and source member, and prepares a planned Customer Installation from the original commercial Workshare. The existing Installation editor remains the place to review and save the whole assignment.

The commissioning engineer selects the customer's actual saved handover and commercial assignment. They review each source edition, name the included baseline, corrected and following cohorts, retain excluded records with their reasons, and prepare the exact receiving scope. Another engineer can receive the complete source package and case, reopen the selected Installation and continue the customer's next review. This workflow uses the saved handover on an equipped host; DAG execution remains with its original commissioning operation.

## Complete source, commercial assignment and native state

The original `commons.openlineage.airflow-handover.v1` contains its executable operator, full OpenLineage application, workspace state and objects, original plans, sessions, reviews and source identities. The maintained Airflow verifier remains authoritative. The Installation reader also requires at least two distinct saved edition IDs and binds every selected row to:

- Original review path and SHA256.
- Saved edition and exact original plan SHA256.
- DAG, logical date and actual Airflow run identity when available.

A row retains the complete original plan, source/event membership, native task coverage, task runs, execution details and unresolved issues. The desk does not infer completeness from a filename, exit code or user-entered title.

The complete original Workshare document supplies fees, currency, effort, staffing, delivery commitments, prerequisites, milestones and commercial terms. Technical preparation preserves that document. It associates the selected original source and cohort with a **planned** Installation and open receiving checks. Preparation and saving do not record customer acceptance, paid invoices, grant receipts, successful production operation or completion of checks.

## Receive a complete handover

Choose the original Operations case and its actual recording actor. Receive the complete commercial Workshare into a **new** Installation draft first. Existing operated or saved Installations retain their original edition and checks.

In the Airflow source desk, **Choose complete Airflow file** takes the saved original JSON. The browser retains the exact bytes, hash, case context and one stable request before calling the original typed writer. A successful write is read back from the case. If a response is lost, use **Recover original file intake**; keep the same request, observed timestamp and bytes. Do not replace the request or select a different file as recovery.

Typed intake uses `airflow-source.add` and `metadata.airflowHandover`. Its complete nested source is verified before storage and on receiving. The limits are:

| Custody | Limit |
| --- | ---: |
| One complete Airflow handover | 128 MiB |
| Airflow and DCAT typed attachments combined | 256 MiB |
| Ordinary attachments combined | Existing 24 MiB |
| Complete original Operations case | Existing 320 MiB |
| Full browser working-copy JSON | 512 MiB |

The ordinary 8 MiB per-attachment route and existing DCAT/customer-use classes are unchanged. An Airflow source cannot claim another class's marker. Every typed source must remain bound to its original attachment event in the complete case history.

Previously attached complete handovers can be selected directly. **Verify original source** rereads the actual case source and full native report before preparation. The original filename and complete source download remain available.

## Review every edition and preserve working history

Name a working copy. Every original cohort row is present and requires an inclusion/exclusion decision and purpose. Included rows require one explicit role: **baseline**, **corrected**, **following** or **other**. An unfinished **unassigned** role is retained as a draft but cannot be submitted as a complete selection.

Open the complete original review from the row. The source panel includes every operator file, commissioning document, workspace package, application file and object. Text is paged by Unicode code points; binary members are paged by bytes. Complete member downloads reconstruct all pages and verify their original byte length and SHA256, including a retained UTF-8 BOM where present.

Save named checkpoints, fork complete alternatives and open a historical checkpoint as a separate copy. **Download all working copies** contains full source bodies, selections, notes, commercial draft, bindings, preparation, original intake/attachment requests and complete retained history. It is a private customer artifact. Receiving an older same-ID working copy does not overwrite later local work: use the explicit alternative-copy path. A second tab's conflicting save retains the current tab's complete work for download/reconciliation.

A later full handover is compared against the same native workspace. The operator explicitly resolves changed, added and removed records; unchanged choices can be retained. Applying a comparison saves the earlier complete copy in history and invalidates the old preparation/attachment. The new complete selection must be attached before it can prepare a new Installation. No history is silently rewritten.

## Prepare and save the original Installation

1. In **Prepare Installation**, receive the current original Workshare draft. Review the complete preserved document and technical bindings.
2. Enter actual source reference/use authority and actual receiving host/engineer. Do not invent permission, customer decisions or staffing.
3. **Attach exact reviewed cohort** saves the full selection JSON through the original ordinary `source.add` writer. It is a separate source; it does not put its own source ID inside its bytes.
4. Preparation refreshes the original case selection after that attachment while preserving authored bindings. Both original handover and selected-cohort attachments remain bound to the workorder.
5. Review the whole prepared document, source snapshot and original native preview. Download the complete preparation.
6. **Open complete prepared Installation draft** transfers it to the existing Installation editor. Review its full terms, checks and references, add the actual note, preview and save through the original guarded writer.
7. Download the selected Installation and complete case. The actual saved Installation ID, revision and SHA256 are the receiving identity.

A stale case version is a visible conflict. Recover an already committed original request before deciding whether a new reviewed mutation is necessary. A rejected no-effect intake is retained separately; the operator explicitly prepares any new guarded attempt.

## Original command-line entry points

Use the original Grant Operations launcher from the selected complete source. Set the actual source, data and runtime paths, then define this local shell wrapper for the examples. The same commands can be invoked through the original `cli.py`. Obtain IDs, versions and hashes from actual `show`/source output.

```sh
APP_SOURCE=/absolute/received/airflow-package/source
GRANT_DATA=/absolute/private/original-operations
GRANT_PYTHON=/absolute/path/to/python
GRANT_NODE=/absolute/path/to/node
grant() {
  GRANT_AIRFLOW_NODE="$GRANT_NODE" "$GRANT_NODE" \
    "$APP_SOURCE/stellar/scf_2026/sf47_budget_model/workspace/launcher.mjs" \
    --python "$GRANT_PYTHON" "$@"
}

grant operations --workspace "$GRANT_DATA" airflow-source-add \
  --case CASE_ID --expected-version CASE_VERSION \
  --file /absolute/private/airflow-customer-handover.json \
  --expected-sha256 ORIGINAL_HANDOVER_SHA256 \
  --observed-at ORIGINAL_OBSERVATION_TIMESTAMP \
  --actor "Actual receiving operator" \
  --note "Receive the original complete Airflow handover" \
  --request-id ORIGINAL_INTAKE_REQUEST \
  --receipt /absolute/private/airflow-intake-receipt.json

grant operations --workspace "$GRANT_DATA" airflow-source-inspect \
  --case CASE_ID --expected-version CASE_VERSION \
  --source SOURCE_ID --sha256 ORIGINAL_HANDOVER_SHA256 \
  --output /absolute/private/airflow-inspection.json

grant operations --workspace "$GRANT_DATA" airflow-source-member \
  --case CASE_ID --expected-version CASE_VERSION \
  --source SOURCE_ID --sha256 ORIGINAL_HANDOVER_SHA256 \
  --path operator/OPERATING.md --offset 0 --limit 32000

grant operations --workspace "$GRANT_DATA" airflow-source-template \
  --case CASE_ID --expected-version CASE_VERSION \
  --source SOURCE_ID --sha256 ORIGINAL_HANDOVER_SHA256 \
  --document /absolute/private/original-installation-document.json \
  --output /absolute/private/airflow-template.json

grant operations --workspace "$GRANT_DATA" airflow-source-prepare \
  --case CASE_ID --expected-version FRESH_CASE_VERSION \
  --source SOURCE_ID --sha256 ORIGINAL_HANDOVER_SHA256 \
  --document /absolute/private/original-installation-document.json \
  --bindings /absolute/private/complete-bindings.json \
  --cohort-source COHORT_SOURCE_ID --cohort-sha256 COHORT_SHA256 \
  --output /absolute/private/airflow-preparation.json
```

Attach the complete selected cohort with the existing `grant operations attach` command (its `--help` describes the existing source fields), then reread the actual case version and refresh the template before preparing. The typed CLI stores its exact `.request.json` before mutation and its original receipt afterward. Retry it with the same complete arguments and paths. Inspection/member/template/preparation are read-only and use the same reader as the desk.

## Complete maintained application release

The dedicated `airflow-installation` source selection composes the original `openlineage-workspace` and `grant-workspace` contributions with this source-owned bridge. It includes the complete OpenLineage/Airflow directory, original application provider, full SF47 budget-model parent/calculator/scenario and managed workspace source, SF49 workorders/profile/core, receiving/browser/guide, and maintained runtime/build paths. It preserves the original source registrations and does not replace the general OpenLineage recipe.

Build one exact public source commit using the original builder:

```sh
node "$CHECKOUT/stellar/scf-starforge-20261009/distribution/build.mjs" \
  --repo "$CHECKOUT" --ref EXACT_FULL_COMMIT \
  --selection airflow-installation --out /absolute/private/airflow-source-release \
  --offline --python /absolute/path/to/python
```

If that exact build already exists, continue it with `--resume`. Do not resume a different recipe or commit in the same directory. The original `distribution.json`, `build.json`, package manifest and TGZ retain the actual source selection, every file hash and complete archive identity. `runtime-unpack.py` verifies the complete package; it does not install dependencies or execute the source.

Use the package's actual `package.json.engines` and maintained runtime profile for the selected runtime requirements. The original Airflow source uses Node 22.16 or later; any higher requirement declared by the composed release also applies. The customer source/Installation course uses the original SF47 Python runtime and an equipped Playwright/Chromium browser. It does not need Airflow/provider installation merely to inspect a saved handover. Actual DAG commissioning retains its separate original Python 3.12/Airflow/provider runtime and receiving owner.

## Whole native customer receiving course

The complete course is `airflow-source-desk-receiving.py` plus `airflow-source-desk-browser.mjs`. Supply the actual private case and full selected source decisions, not fabricated success records:

- `schema: stellar-forge.airflow-source-desk-input.v1`
- `operationId`: the actual retained operation ID in `inspection.package.operationId`; the course requires an exact match.
- Actual `caseId`, `planId`, first `expectedVersion`, `actor`.
- Exactly one existing `sourceId` or full saved `sourceFile` pathname, and its `sourceSha256`.
- Complete original commercial Installation `document`.
- Complete `cohort` array containing every exact reference plus `included`, `role`, `purpose`.
- Actual `bindings.source.reference/authority` and `bindings.receiving.host/operator`.
- Optional actual `laterSourceId` and a complete explicit `laterChoices` list for comparison.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 \
  "$CHECKOUT/stellar/scf_2026/sf47_budget_model/workspace/airflow-source-desk-receiving.py" \
  --workspace /absolute/private/original-operations \
  --input /absolute/private/airflow-installation-input.json \
  --directory /absolute/private/airflow-installation-receiving \
  --repository "$CHECKOUT" --ref EXACT_FULL_COMMIT \
  --node /absolute/path/to/node \
  --playwright /absolute/path/to/playwright/index.mjs \
  --chromium /absolute/path/to/isolated-cloud/chromium
```

A recipient of the already-built complete source TGZ can provide `--source-archive ORIGINAL_TGZ --source-sha256 ORIGINAL_TGZ_SHA256` instead of rebuilding. The source commit remains exact. The receiver and original unpacker must match that release's manifest. The course validates the pure complete source tree before importing the application, sets `PYTHONDONTWRITEBYTECODE`, and operates the application from that selected source.

The same directory owns its lease, source build, stable browser origin, complete input hash, retained native command bodies, original reports and artifacts. A lost typed-intake reply is exercised after the actual original write returns; the desk must recover the same request. Every original member is read to completion and checked against its original bytes. The course operates the complete cohort, attachment, preview and native Installation save, downloads/reopens full working copies, preserves later alternatives and performs a cold browser reopen. It then exports the original case, imports it into an independent initialized original workspace, verifies both full source attachments and exact saved Installation, replays the original import and cold-reopens the result.

On interruption, preserve the entire original directory and original command; do not create a fresh operation. The report records the actual error and leaves completed phases and request IDs intact. The selected source TGZ, full manifest, distribution/build/pack records, original unpacker, input/scenario, complete handover, working copies, case/Installation exports, actual logs and browser images are saved in **Airflow_Source_Installation_Complete.zip**. Credentials, browser profile and live database/lock files are excluded; their portable complete exports are retained. No third-party destination is implied by creating this private archive.

## Recipient reopening

Read the actual TGZ SHA256, commit and manifest from the complete receiving output. Verify/extract with the original retained unpacker, then set the real source directory explicitly:

```sh
python3 runtime-unpack.py \
  --archive Airflow_Installation_Source.tgz \
  --sha256 ORIGINAL_TGZ_SHA256 --out /absolute/received/airflow-package

APP_SOURCE=/absolute/received/airflow-package/source
export GRANT_AIRFLOW_NODE=/absolute/path/to/node
PYTHONDONTWRITEBYTECODE=1 python3 "$APP_SOURCE/stellar/scf_2026/sf47_budget_model/workspace/cli.py" \
  init --workspace /absolute/private/received-airflow-operations

PYTHONDONTWRITEBYTECODE=1 python3 "$APP_SOURCE/stellar/scf_2026/sf47_budget_model/workspace/cli.py" \
  operations --workspace /absolute/private/received-airflow-operations import \
  --file /absolute/received/Complete_Operations_Case.zip \
  --name "Received Airflow Installation" --actor "Actual recipient" \
  --request-id ORIGINAL_RECIPIENT_IMPORT_REQUEST

PYTHONDONTWRITEBYTECODE=1 python3 "$APP_SOURCE/stellar/scf_2026/sf47_budget_model/workspace/cli.py" \
  serve --workspace /absolute/private/received-airflow-operations --port 8468
```

The recipient case receives its native destination ID. The original source IDs, Installation ID/revision, selected full document and event lineage remain retained. Open the actual selected Installation and all usable case contents. Browser working copies belong to their original case context: retain them as original editable artifacts and reopen them in their original case; do not silently relabel pending requests into the independent destination.

## Receiving results and browser custody

The retained report identifies the actual handover operation, selected application commit, native requests, saved Installation and independent receiving result. `COMPLETE` means that the operating steps returned; its `visualReview` remains **PENDING_PRODUCING_SEAT_OPEN_AND_LOOK** until the producing seat opens and views the actual images and outputs.

The existing E258/7AD4 provider commissioning operation, **SCF-AIRFLOW-PROVIDER-COMMISSIONING-E258-20261012**, is one original producer of saved input. Its source/runtime/case and receiving owner remain with that operation. The customer course accepts any complete supported handover whose retained operation matches its supplied input.

Bryce reserved the local Codex in-app browser from **2026-10-13 16:00 UTC** for his meeting and subsequently explicitly released it in coordination message **1791908979.290839** and original Eco reply **1791908982.177009**. That temporary reservation is now released. Preserve existing user tabs/state and the original receiving operation; do not repurpose a demo tab without an actual task need. This course uses its own retained browser profile and stable origin on the original equipped host. No new native Airflow operation is introduced.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

GitHub Actions remain disabled. Use the original equipped receiving operation; do not enable hosted workflows or spend controls for this course.
