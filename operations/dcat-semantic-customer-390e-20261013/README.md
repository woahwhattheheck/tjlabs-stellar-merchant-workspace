# Original GSA catalog semantic receiving

This operation runs the complete saved GSA catalog case through the installed Merchant DCAT semantic product. It imports the two original 344-record catalogs, retains every file from the original 21-artifact migration result, records an explicit local JSON-LD profile, runs the unchanged semantic worker, reads every native finding and artifact, records an operator acknowledgement, exports the complete workspace, and receives it into an independent local project. It then closes and reopens the recipient, adds a recipient review, exports that following history and verifies that the sender has not changed.

The native engine owns RDF parsing, graph construction, SPARQL and SHACL. The program invokes the actual Merchant workspace model and its existing archive receiver. All inputs are original retained bytes; it does not regenerate the original migration case.

## Source and ownership

The two sources must be available before starting:

1. The complete current Merchant checkout or installed source tree, including the DCAT semantic modules, unchanged vendored semantic worker and the optional original `vendor/dcat-us-binding` profile source.
2. The extracted original GSA migration result directory, whose root contains `originals/`, `01-legacy-migration/`, `02-current-preservation/` and `03-reviewed-candidate/`.

The program includes the full original 21-file recipe, with exact paths, byte counts, hashes and provenance. It verifies every member before creating or changing a customer project. These original files are retained as nonexecuted profile attachments, together with the selected binding's audit, README and license.

The original GSA result is:

- Operation: `DCAT-GSA-MIGRATION-20261012-390E`.
- Complete original archive: `libfile_8bc231519a9c81918b377070c3cfd5ca`, version `file_000000000bbc81f5aba6541f3585e9a1`.
- Archive size: 4,429,949 bytes.
- Archive SHA-256: `461bd4b86f07c711ee42f942f26e50a345ee91e1f40704b60c00c387d2f09e0a`.
- Original archive prefix: `native-results/`.
- Original result manifest SHA-256: `ca6b957dbeb73433df5a0a258bd3c9ee5465fc892e8f5fd4a7ea477fda0d1fef`.

Reuse that existing complete archive or its already verified extraction. One existing worker owns the full customer run. A source review or repeated failed process admission is not a second execution.

The two original catalogs are:

| Edition | Original member | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Legacy 1.1 | `originals/legacy-data.json` | 551,258 | `2eb635ae55e1a42904d084fa97a5bfdff870cf1421695752619de462fa351f46` |
| Current 3.0 | `originals/current-data.json` | 756,457 | `b933be0d3bdf9f076a7ac5e493f71c97c073c6e73dfe1737e332736f24bfc34c` |

Each actual original has 344 top-level dataset members. The program checks this against the complete parsed original while preserving its bytes. This count is not a claim about the catalog currently served by GSA.

## Runtime

Use the existing prepared semantic Python environment. The unchanged original requirements are:

```text
rdflib==7.6.0
pyshacl==0.40.1
cryptography==50.0.1
PyLD==3.3.0
```

The program selects that absolute interpreter through `SCF_DCAT_SEMANTIC_PYTHON`. The original bridge verifies its selected vendor source, starts the existing `semantic_operator.worker`, binds every input by hash and retains process output. Existing migration Python environments are separate; this program does not invoke the migration converter or install dependencies.

Use the current Node runtime accepted by the Merchant application, including the original exact-number JSON parser. The same source tree must include:

```text
stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/
  model.mjs
  archive.mjs
  dcat-workspace.mjs
  dcat-semantic.mjs
  dcat-semantic-native.mjs
  dcat_semantic_prepare.py
  vendor/semantic-operator/source-manifest.json
  vendor/semantic-operator/selected-runtime.json
  vendor/dcat-us-binding/
```

The selected runtime manifest includes the original Python module closure. Whole original source may remain installed alongside that runtime selection. The bridge rejects changed undeclared importable source and compiled Python artifacts.

## Explicit binding and interpretation

The config requires `binding` to be `faithful` or `observed`; no implicit choice is made. Both are optional third-party derived DCAT-US profile sources from `fabio-rovai/dcat-us-binding` at the retained `4f7b9917` source. They are not a replacement for the GSA JSON Schema authority.

The program verifies these complete original assets:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| Faithful context | 14,228 | `b08b049c2bbb96598bbc0e0c2fe621b8705865dab278a7310ee7ba67a9ec46f6` |
| Observed context | 13,264 | `de133c46e7a4068e134eda175d87c7ea6aefdf95528a99ed6fff9f688a8c4a9b` |
| Generated shapes | 77,273 | `19da736a8018e5d29fcd5c300872eeb2b89bfa1a51cf60923dc6e53eeeb57910` |
| Source audit | 13,667 | `c42b95cb4066c1df5f76e4f5ee5c6a3926819b121b228fbe23573b8566a1a44c` |

The selected context has exactly its `@context` property. Profile documentation and audits remain attachments. The legacy catalog has a remote root context and therefore uses an explicit `replace-root` profile. The current catalog has no root context and uses `require-absent`. Both preserve every original catalog byte; the bridge produces a separate, hash-bound local JSON-LD representation.

The config also requires an explicit `baseIRI`. It applies to relative RDF identifiers in the catalog, shapes and ontologies. The example below uses an operator-selected `https://data.gsa.gov/` base. That choice is retained as a review decision and does not claim that this URL is the original source's declared base.

The original binding's audit records incomplete class/property mappings, including its unbound `Catalog.datasetSeries` property. The program retains this audit. It leaves original `@type` values unchanged and does not rewrite them to force scoped contexts to activate.

The original worker performs:

1. Snapshot of the explicitly derived JSON-LD.
2. An original SPARQL query counting explicit `dcat:Catalog`, `dcat:Dataset` and `dcat:DatasetSeries` instances.
3. Native meta-SHACL and SHACL validation against the selected shapes.

Snapshot triple count, class presence, complete native findings and native conformance are recorded separately. Class presence does not enumerate all SHACL targets. An empty or incompletely mapped graph can conform to the selected shapes. The operator must inspect graph coverage and the retained binding audit before making a semantic acceptance decision.

## Run one complete customer operation

Create a private config file outside both customer projects:

```json
{
  "sourceRoot": "/absolute/merchant-source",
  "domainRoot": "/absolute/original-gsa/native-results",
  "outputDirectory": "/absolute/private/gsa-semantic-customer",
  "binding": "faithful",
  "baseIRI": "https://data.gsa.gov/",
  "python": "/absolute/prepared-semantic-environment/bin/python",
  "limits": {
    "timeout_seconds": 600,
    "memory_mib": 2048
  },
  "sourceCommit": "the selected complete Merchant commit"
}
```

`sourceRoot` is the directory above `stellar/`. For an installed product it is the retained source directory, not the CKAN module directory. `domainRoot` is the exact extracted original archive prefix. Select a private output directory that belongs to this operation.

Then run:

```sh
node operations/dcat-semantic-customer-390e-20261013/run-gsa-semantic-customer.mjs \
  --input /absolute/private/gsa-semantic-input.json
```

The selected commit string is recorded as declared provenance; the program also saves actual hashes of every integration module and both vendor manifests it uses. The original native worker independently binds its source and runtime.

The original model holds the producer project lease while importing, running, reviewing and exporting. It closes that owner before the archive receiver acquires the independent recipient. Native child processes are drained by the original model lifecycle before its lease is released. The recipient is actually closed and reopened between receiving and the local following review.

The program prints a short structured completion record. Its exit code is 0 only when both native attempts completed and the complete transfer, cold reopen and cleanup finished. A completed nonconforming or invalid-shape result can still make the receiving operation complete: it is a complete result to inspect and correct. A failed or interrupted native attempt makes the customer operation incomplete while retaining its exact evidence.

## Saved output

The output contains:

- `selection.json`: complete immutable run configuration and original source selection.
- `actual-source.json`: hashes of the actual integration and vendor manifest files.
- `original-inputs.json`: all 21 original members and their retained source provenance.
- `progress.json`: original launched operation IDs and selected profile, run, catalog and review IDs.
- `operation-<UUID>.json`: complete actual original operation results.
- `producer/`: the complete sender workspace.
- `recipient/`: the independent received workspace.
- `downloads/`: every profile manifest, context, shape, audit, original GSA attachment, native run manifest, native artifact and human review from both sender and recipient.
- `findings/`: every unfiltered page of original native findings, with exact run binding, total and cursor.
- `complete-gsa-semantic.ckanw`: the original complete sender workspace archive.
- `received-gsa-semantic-following.ckanw`: the recipient's complete history with its local receiving note.
- `producer-before-transfer.json`, `recipient-before-cold-reopen.json`, `archive-selection.json`: exact custody and history snapshots.
- `result.json`: completion, cases, native summaries, findings inventory, downloads, receiving identity, cold reopen, local review and cleanup results.

The top native result receipt is downloaded separately from the native result's own artifact inventory, avoiding recursive self-hashing. All profile assets and run artifacts are validated against their recorded bytes. Large artifacts use the original streaming private-file hasher. A download resumes only when its existing exact prefix matches the same original source; a different partial file is retained and rejected.

These results are private customer data. Keep the complete workspace and all raw source/profile evidence together when delivering them. No bearer URL or email credential is needed by this model-level operation.

## Review, transfer and continued customer work

The programme records `ACKNOWLEDGE` after inspecting each complete native result. This records receipt, not semantic approval. Native `conforms`, target coverage and the original JSON-schema/conservation review remain separate facts, and the active catalog release stays unchanged.

The second immutable profile records its predecessor. Both profiles retain exact context, shapes, base IRI, source audit and all original input files. Each run binds its profile hash and original catalog SHA-256. Its findings and artifacts stay unchanged as later operator reviews are appended.

The recipient retains every profile, run, finding, source, native receipt and review. Its independent local acknowledgement extends the same run's review chain using the exact prior review hash. It does not change the sender or the native output. The following archive carries this added history.

After receiving, open the project through the installed DCAT application or existing `starforge dcat serve` command. The normal semantic controls let the customer inspect full findings and graph coverage, download original artifacts, add a review decision, import a revised profile and start a new explicitly linked attempt. Existing JSON migration, recurring-source acquisition and release cutover remain in their original workspace.

## Recovery and actual execution records

The program saves each returned operation selection before awaiting completion. On a repeated invocation with exactly the same config, it reuses saved completed phases and consults the original workspace for a previously admitted phase. It never invents a successful operation from an absent receipt.

If a native attempt was interrupted, the domain and bridge inventory the retained original files into an interrupted receipt. The program can transfer that evidence, but the actual attempt remains incomplete. Use the normal original retry control to create a new linked run when the operator chooses to retry; do not relabel the old attempt or discard its files.

If process loss occurred before a selected import or profile appeared in saved state, the program reports that its original phase needs reconciliation. Inspect `progress.json` and the original workspace before another mutation. Archive receiving uses its existing exact archive-hash continuation. A completed independent receive can be reopened without retransferring or rerunning native semantic work.

A submitted process call, a source-only review or a pre-CreateProcess environment error is not a native execution. Record the actual admitted process, terminal exit, selected runtime, complete `result.json` and artifact hashes in the existing operation thread. The separate LDA two-host receiving programme remains under its original single-owner request.

## Inspect the exact rendered product and outgoing attachments

Before presenting this project, a demo or its exports as client/prospect ready,
the producing peer must open the exact outgoing application, look at its
rendered screens and use the important controls. The native result above
establishes its recorded API and archive journey. It does not establish that
someone has seen the browser, opened an exported report, or used the outgoing
attachments. Source review, HTTP success, DOM counts, screenshots that nobody
views and another peer's approval do not replace that work.

This is normal completion of the already authorized delivery, with repairs
made in the same work. It adds no separate release permission or repeated
approval ceremony. Bryce's original direction and its all-attachments
clarification are retained at:

- https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
- https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791884278483419

### Open the saved project through the original application

Wait until the programme has closed its project owners. Use the exact selected
source checkout or installed product and the same private environment. Open
one of the actual project paths listed below through the installed command:

~~~sh
starforge dcat serve --workspace /absolute/private/SELECTED_SAVED_PROJECT
~~~

From that same source checkout, the equivalent original entrypoint is:

~~~sh
SCF_DCAT_SEMANTIC_PYTHON=/absolute/prepared-semantic-environment/bin/python \
node /absolute/merchant-source/stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/dcat-cli.mjs \
  serve --workspace /absolute/private/SELECTED_SAVED_PROJECT
~~~

The original command starts the authenticated local listener and prints its
private browser URL. Open that exact URL in the producer's browser; retain the
URL only in the private host session. The existing **DCAT catalog migration**
Applications entrypoint can open the same saved directory. Do not start a
second owner while the programme or an existing Applications instance holds
the project. Close the original server normally before moving to another
project, and preserve its saved state.

Use an actual desktop or screenshare width and a relevant narrow viewport,
for example 390 CSS pixels. Look at the rendered page or open the captured
images at readable size. Inspect the whole screen, including long identifiers,
typed values, tables, explanatory text, controls and download links. Repair
clipping, overflow, broken styles, unreadable contrast or cramped spacing in
the owned source, then reopen the exact repaired version.

The intended presentation is plain and industrial: readable tables, clear
hierarchy, consistent type and spacing, restrained controls and useful labels.
The narrow layout must keep values and actions usable rather than hide the
customer's evidence.

### Use the controls, then reopen what will be delivered

Follow the project-specific journey below using its actual retained IDs.
Navigate between populated panels, change the relevant filters and page
through real rows. Use a search with no matches to see the empty result state.
Inspect initial loading and any actual failed/interrupted attempt if present;
do not relabel a successful attempt or fabricate a native failure for a
screenshot. If a requested state is absent from this real case, say so in the
receiving note. Any additional destructive or state-changing exercise belongs
in an explicitly selected working copy, with its resulting history retained.

Download the files the recipient will receive through the actual browser
controls. Open readable JSON/text/CSV/RDF files in an appropriate viewer and
render HTML reports as documents. Review their complete structure and useful
content, not only their filenames or hashes. For a large machine-readable
artifact, use its normal parser or reader over the full file and examine the
actual relevant records; retain both its full-byte identity and any practical
viewing limit. Keep incomplete response bodies and failure logs labeled as
such. Use the original whole-workspace receiver for .ckanw archives and reopen
the received project; a ZIP inventory alone does not demonstrate this.

Open every outgoing attachment in the form the recipient will use. If the
delivery includes images, open and view them; if it includes video or audio,
play the final exported file and watch/listen through its useful content.
Use natural, clear, high-quality voice/TTS when a narrated video is appropriate.
Only include media that helps explain the actual product. Do not claim an
attachment was used merely because it was generated or copied.

Return the actual desktop and narrow images to the integrating owner/root,
together with the source pin, saved project identity, selected record IDs,
what controls were operated, downloads opened, repairs made and any remaining
limitation. The producer and integrating owner must actually view the images;
a path-only list is insufficient. Keep browser bearer tokens out of images,
shared URLs and published receipts. Retain exact original artifacts privately,
with any intentionally redacted presentation image labeled as a derivative.

Finish with a concise account of the observed product and the corrections
made. Keep native/API completion and rendered/attachment observations distinct
so the recipient can tell what was actually exercised. This work should
improve and complete the delivery, not turn into another broad test bundle.

### Validation producer and recipient journey

For the validation programme, the producer is outputDirectory/producer and
the recipient is outputDirectory/recipient. Open each through the original
application route above after the programme has closed its owners.

In **Semantic validation → Profiles**, select both original profiles and read
their base IRI, context treatment, complete context/shapes/audit and original
GSA attachments. In **Runs**, select the actual legacy and current IDs from
result.json. Inspect the catalogue selection, snapshot and class-count
coverage, native conformance, full finding terms and the recorded
acknowledgements. Keep class presence, shape conformance, original JSON
validation and operator acceptance visibly distinct.

Operate severity/search filters and previous/following findings pages.
Inspect complete typed values and long IRIs at desktop and narrow widths.
Download each selected run record, original native report, graph/provenance,
profile files and review, and open the actual downloaded documents. Look at
rendered native reports when present. An empty findings list is not evidence
that every intended source class was mapped or validated.

Open **Catalogue migration** and **Workspace** to see the preserved source
catalogues and whole-project handover. Use the programme's actual
complete-gsa-semantic.ckanw and received-gsa-semantic-following.ckanw receiving
results, inspect the recipient-local acknowledgement, then close and reopen
that same saved recipient. The normal review control remains available for an
intentional later operator decision; retain its actual history and export a
following archive if used. Keep the original recorded native attempts and
result.json intact.
