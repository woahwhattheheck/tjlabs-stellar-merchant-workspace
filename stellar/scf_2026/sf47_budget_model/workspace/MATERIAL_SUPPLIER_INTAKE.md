# Original supplier intake in the Material Catalog desk

The Material Catalog desk can start with original supplier files and finish with a complete retained catalogue bundle in the existing Installation workflow. A named browser intake keeps its original bytes, mapping drafts, previews, exact native requests, complete outcomes and frozen bundle. Parsing, source retention, edition calculation and selection use the running Material Catalog workspace. The Grant Operations case receives the completed bundle through its existing source writer.

## Open the complete workflow

1. Start the existing Material Catalog workspace and keep its workspace directory. Its server binds to a selected local port. Read the actual workspace ID from its original session.
2. Add that exact origin, workspace ID and Operations case ID to the operator connection file described below. Set `GRANT_MATERIAL_CATALOGUE_CONNECTIONS` when starting the existing Grant workspace.
3. Open the case’s Material Catalog desk. Choose **Supplier intake**, create a named intake and select the declared catalogue connection. Read its original catalogue state.
4. Retain the complete original file in **Supplier files**, including its format and provenance. The browser archive keeps the bytes before the original native upload. Uploading a CSV sample does not establish that its entire edition is valid; native preview reads the complete source.
5. In **Catalogue mapping**, select an existing catalogue or enter a new catalogue title and tenant, then save the complete original mapping. A BMEcat profile is the native parser’s source/profile suggestion. Review its supplier bindings and transaction mode before using it.
6. Choose **full** or **delta** explicitly, select the exact retained base edition where appropriate, and create a native preview. Review the native source, mapping, count, material and change pages. A delta requires its named full base; the desk never invents a supplier update.
7. Select the reviewed edition using its exact review SHA and current catalogue revision. The original native journal owns this mutation.
8. Capture the complete selected catalogue bundle. The desk validates the original seal and workspace/catalogue/revision/edition/tenant/mapping identities. It freezes the exact first complete bytes before attaching them to the case.
9. Continue the same Source Desk workflow to compare editions, retain the exact source, prepare the Customer Installation and reopen its full handover. Export the complete editable browser archive, including supplier intake history, along with the customer deliverables.

The original Supplier files, Catalogue mapping, Edition review and Native history views share the existing desk’s IndexedDB revision and compare-and-swap save. Existing archives without supplier intake fields remain valid. Each named intake has its own source files and drafts; an unresolved native mutation remains visible and prevents another mutation until the original operation is reconciled.

## Configure an existing local catalogue connection

Use an absolute operator-owned JSON file and pass its path through the existing server environment:

```json
{
  "schema": "stellar-forge.material-catalogue-connections.v1",
  "connections": [
    {
      "id": "supplier-catalogue",
      "title": "Supplier catalogue",
      "origin": "http://127.0.0.1:8447",
      "workspaceId": "REPLACE_WITH_ACTUAL_NATIVE_WORKSPACE_ID",
      "caseIds": ["operation-REPLACE_WITH_ACTUAL_32_HEX_CASE_ID"]
    }
  ]
}
```

The example values are placeholders. Select the actual running native workspace and existing case. The file is read as a complete regular file without following a final symlink; duplicate connection IDs, duplicate case IDs and incomplete/changed reads are rejected. A selected connection is bound to the hash of its complete normalized declaration. Replacing that declaration requires an explicit fresh selection.

For example, start the original services with their existing commands:

```bash
starforge-materials opensearch-workspace \
  --source ORIGINAL_SOURCE.json --plan ORIGINAL_PLAN.json \
  --workspace ORIGINAL_CATALOG_DIRECTORY --port 8447

GRANT_MATERIAL_CATALOGUE_CONNECTIONS=/absolute/operator/material-catalogue-connections.json \
  python3 server.py --workspace ORIGINAL_GRANT_WORKSPACE --port 8790
```

The adapter uses the selected running service; it does not reopen its SQLite database. Its server-owned configuration only accepts a literal `http://127.0.0.1:PORT` origin. Each request reads the original session and verifies the actual native workspace ID. Native mutations use that session’s original token and origin checks. The token, local origin and file path are not returned in browser connection listings. Existing named-staff case access and CSRF controls continue to apply. Delivery leads and finance operators can upload, save, preview and select; the other existing non-contributor case readers can inspect, reconcile and capture the complete bundle.

The read-only connection listing describes configured selections. It does not claim that a declared native service is currently running.

## CLI operating interface

Run these subcommands through the existing Grant workspace `operations` command. `material-intake-connections` needs the case and its expected version. The remaining actions also require the selected connection ID, actual workspace ID and configuration SHA returned by that listing.

| Command | Original operation and selected input |
| --- | --- |
| `material-intake-connections` | List connections configured for this case |
| `material-intake-state` | Read retained catalogues, sources and editions |
| `material-intake-catalog` | Read one original catalogue |
| `material-intake-profile` | Read the native BMEcat profile for one retained source |
| `material-intake-materials` | Read one original edition’s material page and optional search |
| `material-intake-changes` | Read one original edition’s change page |
| `material-intake-operation` | Read the original request journal |
| `material-intake-upload` | Upload an exact file with its complete metadata request |
| `material-intake-save` | Save the complete catalogue mapping at its selected revision |
| `material-intake-preview` | Calculate a full or delta edition with an explicit base |
| `material-intake-select` | Select an exact preview/review SHA at its original revision |
| `material-intake-bundle` | Freeze the complete selected bundle and its capture receipt |

Mutations require `--native-request` with the complete original JSON, and a private `--receipt` filename. Upload additionally requires `--file`. The CLI saves the exact request and source identity before dispatch. A matching original operation is read before replay; its kind and normalized request must match. Original upload format/provenance defaults are normalized by the native catalogue and preserved in comparison.

Bundle capture requires the selected catalogue, revision, active edition, tenant, mapping SHA, output filename and separate receipt filename. The first successful output is frozen. Reopening the same CLI request verifies and reuses those exact bytes; it does not fetch a new export merely to recreate a missing final receipt.

Use the original command’s `--help` for the precise current argument placement. The existing `material-catalog-source` CLI and source writer attach a verified complete capture to the case; the intake adapter does not create another attachment writer.

## Request identity and recovery

Each native mutation is retained before dispatch with an immutable request ID and exact request body. Native `COMPLETE`, `FAILED`, `INTERRUPTED` and `RUNNING` are kept as the original service reports them. A successful outer HTTP exchange can contain a terminal native failure; HTTP 200 alone does not imply that catalogue work completed.

An interrupted browser or CLI should read the original operation or replay the exact same request. The native store rejects reuse of an ID with changed inputs. A failed or interrupted operation stays historical. After reviewing it, an operator can explicitly prepare a new request with a new ID. The desk does not silently replace one.

Preflight failures have a distinct source-bound receipt: `httpStatus: null`, the original `localStatus`, and `dispatchStarted: false` scoped to `this-proxy-attempt`. Its request projection and original Base64 text hash bind the rejected attempt to the retained source. This receipt only establishes that this adapter attempt ended before native POST. An older transport-unknown attempt can still be in flight. A later operation 404, a changed configuration or a later preflight rejection cannot establish that the older attempt never arrived. Only requests whose every attempt is known unsent/unrecorded may be released on that evidence.

The case version is checked immediately before native mutation dispatch. If another case edit completes after the native operation started, the adapter still returns the actual original native result and reports the current case-version difference. Reopen the current case before subsequent writes; do not discard a real native receipt.

## Complete bundle and customer custody

Native export captures its original catalogue/history/source/edition/decision state and produces a sealed complete JSONL bundle. Each new export can have a new `exportedAt` and therefore a new hash. The browser and CLI freeze the first complete selected capture; retries of the original case attachment use those frozen bytes.

The native `intake-custody` reader validates the entire bundle. Its source-workspace, catalogue ID/revision, active edition, tenant and mapping SHA must all equal the operator’s explicit selection. The HTTP response returns its actual SHA256 and byte count and a Base64 UTF-8 identity header. A native export error is returned as JSON and must not be saved as a customer bundle.

Limits retain complete data: supplier file 16 MiB; native upload metadata header 12 KiB; native JSON request 1 MiB; native JSON response 64 MiB; complete catalogue bundle 128 MiB. Material/change pages are explicit, at most 200 rows; the complete export is not limited to one page.

## Receiving and source fixtures

The complete receiving course starts with the actual raw UI, its selected original native host and real publisher source files. Its first frozen bundle determines the following Source Desk input; no predicted export hash is substituted. The same browser then continues the original typed source, comparison, Customer Installation, export and cold-reopen course. CLI commands provide another operating interface; the native course does not repeat the browser’s mutations through the CLI.

The published SAP SHINE SPS11/SPS12 CSVs are both full snapshots. A constant-upsert mapping over an untouched source is an explicitly authored operator interpretation for exercising update semantics; it is not described as a publisher delta. Keep the original full-to-full comparison and source provenance. BMEcat input likewise follows its actual transaction metadata and declared profile.

Follow `MATERIAL_CATALOGUE_OPERATOR.md` and the complete receiver’s recorded opening commands. Keep the original receiving operation and current owner, and incorporate the actual resulting screenshots, opened attachments, preserved journals and complete archive before describing the customer package as ready.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949
