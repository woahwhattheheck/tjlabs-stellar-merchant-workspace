# Original supplier intake: CLI and complete receiving

The existing Material Catalog is the catalogue writer. SF47 selects a configured
connection, forwards original upload/mapping/preview/selection requests, freezes
a complete verified export, and attaches that file through its original source
writer. The existing Material Source Desk then prepares and saves the original
Customer Installation and its complete portable handover.

The receiving code is preparation for an equipped execution. A source review or
syntax check does not establish native, browser, customer, or producer acceptance.

## Original interfaces and receiving ownership

The server owns GRANT_MATERIAL_CATALOGUE_CONNECTIONS. Its JSON format is
stellar-forge.material-catalogue-connections.v1 with connections containing
id, title, origin, workspaceId and caseIds. The origin is the actual original
http://127.0.0.1:PORT listener. The backend obtains /api/session and checks the
workspace UUID on every exchange. Its ephemeral token remains server-side.

The UI and CLI select the connection ID, actual workspace ID and reviewed
configuration SHA256. They cannot select a filesystem database path, remote
destination or credential. The original runtime retains its SQLite ownership;
SF47 never opens that database to mutate it.

The complete receiving operation launches one original catalogue host and one
original SF47 host. The same existing browser driver operates the raw controls
and the following Source Desk/Installation course. The CLI is an alternative
operator interface, not another mutation sequence during that receiving run.

Preserve any actual accepting runtime/browser owner and original request IDs.
Do not launch a parallel receiving course to replace an unresolved result.

## Complete CLI

These commands are registered in the maintained cli.py operations group:

- material-intake-connections
- material-intake-state, material-intake-catalog, material-intake-profile
- material-intake-materials, material-intake-changes
- material-intake-operation
- material-intake-upload, material-intake-save, material-intake-preview,
  material-intake-select
- material-intake-bundle

Each command accepts --case and --expected-version. Except connections, each
also requires --connection, --workspace-id and --connection-sha256. Connection
discovery returns the current public selection. No token or native path is a
CLI argument.

For example, from the selected SF47 workspace source directory:

~~~sh
python3 cli.py operations --workspace /owned/original-sf47 \
  material-intake-connections --case ACTUAL_CASE --expected-version CURRENT_VERSION

python3 cli.py operations --workspace /owned/original-sf47 \
  material-intake-upload --case ACTUAL_CASE --expected-version CURRENT_VERSION \
  --connection SELECTED_ID --workspace-id ACTUAL_NATIVE_UUID \
  --connection-sha256 REVIEWED_CONFIGURATION_SHA \
  --native-request /owned/original-upload.json --file /owned/original-supplier.csv \
  --receipt /owned/upload-receipt.json
~~~

upload/save/preview/select consume the exact original native request object in
--native-request. Upload additionally consumes --file and verifies the declared
bytes/SHA256 before dispatch. The local request receipt is created before any
native action. Existing receipts must match the same case creation, connection,
original request and original source identity.

Native request shapes:

- Upload: requestId, name, format, bytes, sha256, optional provenance.
- Save: requestId, title, tenantId, mapping; both catalogId and expectedRevision
  when editing an existing catalogue.
- Preview: requestId, catalogId, expectedRevision, sourceId, mode and explicit
  baseEditionId. Use null for the first full edition; delta requires a real
  retained base.
- Select: requestId, catalogId, expectedRevision, editionId and reviewSha256.

Review the complete preview and current mapping before preparing a select
request. The original edition seal binds the source, mapping, base, counts,
tenant, catalogue revision and material root. A source upload is not an approval.

The maintained journal states are RUNNING, COMPLETE, FAILED and INTERRUPTED.
The CLI reconciles the same original operation before dispatch. RUNNING remains
pending. FAILED and INTERRUPTED are terminal: preserve the original result and
prepare a new explicitly reviewed request when appropriate. A changed request
must never reuse an old request ID. Upload comparison accounts for the original
format/provenance defaults and preserves JSON boolean/number distinctions.

A pre-dispatch refusal proves only that particular proxy attempt was not sent.
Its exact projected request and original Base64 identity are retained. It never
proves that an earlier transport-unknown attempt did not reach the native
journal. Reconcile the original request before preparing a replacement.

The original native API can return HTTP 200 with a FAILED/INTERRUPTED operation.
Completion requires the actual native COMPLETE state, not an outer successful
HTTP exchange.

## Freeze before attachment

material-intake-bundle requires --catalog, --catalog-revision, --active-edition,
--tenant and --mapping-sha256, plus --output and --receipt. The backend validates
the entire original bundle and captured header/catalogue against these exact
selections. The CLI saves the request first, writes the first verified complete
bytes, reopens them through original intake-custody, and seals an immutable
receipt. An interrupted write after the bundle but before its receipt is
recovered by validating those same bytes. A completed replay reuses that file.

A new native export may contain a new exportedAt and thus a different SHA256.
Never fetch again merely to recreate a byte identity or overwrite a first
accepted capture.

Attach the frozen file through the unchanged command:

~~~sh
python3 cli.py operations --workspace /owned/original-sf47 \
  material-catalog-add --case ACTUAL_CASE --expected-version CURRENT_VERSION \
  --actor ACTUAL_OPERATOR --request-id ORIGINAL_SOURCE_REQUEST \
  --note "Retain the complete reviewed original catalogue capture." \
  --file /owned/frozen-catalogue.jsonl --expected-sha256 FROZEN_SHA256 \
  --observed-at ORIGINAL_OBSERVATION_UTC --source-url ORIGINAL_SOURCE_LOCATOR \
  --receipt /owned/source-add-receipt.json
~~~

This uses the existing Operations source.add writer and exact replay. It does
not create a parallel source database.

## Published source course

SUPPLIER_INTAKE_SAP_SOURCE.json supplies the original public input fragment.
The two retained SAP SHINE CSVs each contain all 106 published demonstration
products with the original documented English text join:

- SPS11: 30,283 bytes, SHA256
  ca942c436a490a0585d5f47291a3304763519e07809a18b9ab1474a98639c04d.
- SPS12: 30,177 bytes, SHA256
  9a74650a695c6532c8c9093661b06e94005f212abd017f5a86807d37483a5635.

The original mapping has delta:null. The separate update mapping changes only
the delta declaration to an explicit, reasoned constant-upsert policy. This
applies every unchanged SPS12 snapshot row to the selected complete SPS11 base.
It is an operator-selected application policy over a published full snapshot,
not a supplier-issued delta file. The original snapshot and mapping files remain
unchanged. The known difference is 106 supplier-ID changes; all original source
records remain available to inspection and download.

This course is technical receiving against published demonstration data. It
does not provide a Calcutron, DataXstream or other customer's private input or
record their approval. The original ETIM fixture is T_NEW_CATALOG; it must not
be described as an original update transaction.

The reusable interface also supports the original catalogue formats CSV, TSV,
JSON Lines, JSON row arrays, ETIM xChange JSON and BMEcat XML, within their
maintained parser and profile rules. The SF47 raw upload boundary is 16 MiB.
A complete captured catalogue bundle is bounded at 128 MiB. BMEcat price-only
and product-data transactions remain retained source-only inputs under the
original parser contract; they cannot replace a complete material edition.

## Exact whole receiving invocation

Use the current complete source release selected by the distribution manifest,
an actual existing Operations case with its selected original Workshare document,
the installed Node runtime, existing Playwright and Chromium, and one private
owned receiving directory.

The original input retains schema
stellar-forge.material-catalogue-source-desk-input.v1, operationId, actor, caseId,
planId, expectedVersion, document and the existing scope/observation fields.
Add supplierIntake from SUPPLIER_INTAKE_SAP_SOURCE.json. Set selection and bindings
to empty objects for this raw course; the unchanged native template derives them
from the actual new attachment and original document. Omit sourceId/sourceFile
and the not-yet-produced sourceSha256/edition IDs. This does not fabricate a
native seed: the supplied original document must already retain the genuine
Workshare/source binding required by the maintained preparer.

Review the source fragment. nativeRequestPrefix is an optional descriptive label;
the original UI creates and retains the actual native request UUIDs before dispatch.
Its review.actor, when present, must equal
the original input actor; otherwise the receiver carries that actual actor.
Relative source paths resolve inside the verified complete application.
Absolute paths refer to explicitly selected existing original files and must
match their declared byte counts and SHA256.

~~~sh
python3 material-catalogue-source-desk-receiving.py \
  --workspace /owned/original-sf47 \
  --input /owned/complete-original-supplier-case-input.json \
  --directory /owned/original-supplier-receiving \
  --node /actual/installed/node \
  --playwright /actual/installed/playwright \
  --chromium /actual/installed/chromium \
  --repository /actual/complete-public-checkout \
  --ref EXACT_COMPLETE_SOURCE_COMMIT
~~~

The existing --source-archive/--source-sha256 option can use an already-built,
verified full distribution instead. The receiving code and original unpacker
must match that distribution manifest. Include material_supplier_intake_receiving.py,
operations_material_supplier_intake_cli.py, the backend/UI, this guide and the
source fragment in the same selection.

The receiver preserves exact raw source files and both mappings, starts the
original workspace/server.mjs, obtains its actual workspace UUID, and writes
the private case-bound connection declaration. It refuses a still-active
original owned process on recovery. The same browser then:

1. Opens the configured original connection and inspects its actual state.
2. Uploads the full original file, saves the original mapping, reviews and
   selects the complete full edition.
3. Uploads the unchanged update snapshot, saves the explicit update mapping,
   selects the actual full base, reviews the resulting changes and selects the
   final edition.
4. Freezes and downloads the verified complete bundle, attaches those exact
   bytes through existing source.add, derives the native material template,
   and continues the existing complete Installation/customer course.

Afterward the receiver rereads every original native mutation from the journal,
checks COMPLETE/kind/request identity, original file hashes, mapping and base
semantics, validates the frozen bundle/header/catalogue/embedded inputs, and
compares derived selection/bindings with a fresh native template of the unchanged
original commercial document. The original customer ZIP extraction, complete
material reopen, original Operations export/import/replay and cold Installation
readback then continue through the existing receiver.

The catalogue host is closed only by this owning receiving process. User tabs,
other browser instances, running customer catalogues and other agents' jobs are
outside its lifetime. Source inspection is not permission to start a second
native course.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

### Receiving-specific evidence and ownership

Follow the current actual browser owner/availability instruction and preserve
user tabs and state. The earlier October 13 local-browser reservation was
explicitly released; any later actual ownership change still controls.
Keep the existing original receiving course and return its files and images;
do not introduce watchers, duplicate controllers or automatic restarts.

The report keeps visualReview pending until the producing seat has actually
looked at the returned exact-version images and used the relevant outputs.
Native completion does not imply customer acceptance, commercial agreement,
production deployment authorization or permission to send external mail.
