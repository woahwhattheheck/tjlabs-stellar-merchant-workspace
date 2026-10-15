# Orkyo import readiness — installed operation

The Applications entry opens the complete maintained Orkyo desk with a private local writer. It preserves original CSV/JSON/XLSX files, complete source editions, exact native row payloads, explicit row reviews, frozen native batches, actual import outcomes, unfinished editor drafts and prior sessions.

## Start or resume

Choose **Orkyo import readiness** in Applications. Set a physical private workspace directory. Supply **New workspace label** only when creating an unused directory; an existing session resumes. Enter **Session operator** before saving managed edits. Applications owns the listener and writer; disconnecting an agent leaves it running, and Stop drains it.

Native equivalents, using absolute private paths:

~~~sh
node cli.mjs init /absolute/private/orkyo "Orkyo import programme"
node managed.mjs --workspace /absolute/private/orkyo
node cli.mjs course /absolute/private/authored-orkyo
~~~

The first two commands create and open a blank workspace. The last creates the explicitly authored receiving example in a separate unused directory. Existing standalone desk copies and domain exports can be received into a fresh directory with node cli.mjs receive DIRECTORY FILE.json; complete working carriers preserve all editor history.

Close Applications before standalone writer commands. The connected and connected-status commands attach to the existing writer using DIRECTORY and ORIGINAL_REQUEST.json. Run node cli.mjs --help for the complete command list. Original standalone source operations remain in desk/cli.mjs.

## Source-native import workflow

| Stage | Complete retained material | Native command |
| --- | --- | --- |
| Intake | Source text or full worksheet-cell JSON, original file bytes and exact tenant/type/site/lookup context | intake |
| Source correction | Complete replacement representation, original editions, old reviews and correction reason | correct-source |
| Row review | Exact row occurrence, complete values, native payload, issue acknowledgements, named reviewer and reason | review |
| Frozen batch | Selected rows, source edition and SHA, receiving context, exact native file and collision explanations | prepare |
| Actual import | Confirmed tenant, actual operator, native route and attempt details | attempt |
| Reconciliation | Exact batch/row, actual target ID when created/existing, reviewer, reason and retained response or lookup | resolve |
| Abandon unused batch | Prepared batch and reason, preserving its complete original | abandon |
| Operating note | Complete title and source text | note |

The accepted native parser and payload adapters remain pinned to the retained upstream commit in SOURCE_CONTRACT.md. Per-page CSV/JSON imports create records and ignore exported IDs. Workbook imports reuse exact workstation codes and create each job again. New physical stations require their actual geometry before the workbook can reuse them. Prepare only unresolved remaining work after every prior uncertain result has been attributed. A successful total count does not identify a row's target ID.

Carry the frozen file through the receiving tenant's actual authorized import route, then reconcile actual returned or lookup IDs in the desk. The authored example labels all sample IDs and responses explicitly.

## Complete editing and recovery

The working carrier preserves every form as text, including unfinished JSON; complete original pending file bytes; selected source, row, batch and outcome binding; selected rows, source search, page and active tab; session operator; emergency copies; and complete prior editor snapshots. Native commands retain this editor state. A source correction retains an affected old row-review draft before resetting its selection against the new source.

**Save complete session** prepares the original request in IndexedDB before sending it to the host. Keep its request ID, base state SHA, actor, time and full successor. **Recover original request** retrieves its original outcome and newest state. Transport interruption leaves the request pending; a definite rejection retains the complete rejected request. Open the newest edition deliberately after a rejected old base.

Two browser openings use compare-and-swap persistence. **Keep this browser branch; retain saved copy** stores both complete preimages, including any other pending request. Every branch is downloadable. Export recovery JSON before changing machine/origin or handling browser storage failure.

Original standalone independent copies remain available in Workspace. **Complete working JSON**, **Editable HTML with source** and **Complete handover ZIP** preserve the managed editor adapter and original desk. A managed handover is served from its retained host edition, and the browser verifies every byte before downloading.

## Native original-file intake

The managed MCP merchant_orkyo_ingest accepts a declared full file hash, original source ID, kind/format, exact target context and expected domain head. XLSX is decoded by the maintained workbook reader using the portable OOXML reader in native Node; original bytes stay separate from the editable representation.

For standalone native intake:

~~~sh
node cli.mjs ingest DIRECTORY INTAKE_META.json ORIGINAL_FILE ORIGINAL_REQUEST_OUTPUT.json
~~~

INTAKE_META.json contains a complete stellar-forge.orkyo-request.v1 action request with its original request metadata and an intake operation. The operation supplies id, actor, at, expectedHead and a payload with sourceId, kind, format, and context; omit artifact. The command reads the complete original, constructs its source artifact, writes the full exact request to the requested unused output path, and applies it. Reconcile that original request through request-status or connected-status.

The host state SHA and Orkyo domain head are different identities. Use the saved state SHA as baseSha256 and the exact event-chain head as operation.expectedHead. The operation ID, actor and time must match its containing request.

## Merchant agent configuration

A stellar-forge.orkyo-host.v1 file declares workspaces keyed by short aliases. Each workspace supplies its private directory, optional exact installationId, readable label, and optional inputs mapping aliases to complete {file,sha256} originals. Paths resolve relative to that configuration file and are checked against the original physical private files.

Select it as orkyoConnection in the normal Merchant configuration. The provider registers merchant_orkyo_status, connect, disconnect, browser, inspect, preview, action, ingest, receive, export and file. Actions and input adoption attach to the existing Applications writer. Reads pin the full saved SHA and page source rows/editions, batch rows/outcomes, original events and managed history to nextOffset null.

Receive accepts complete working carriers, original desk copies, original domain workspaces or exact original request files. The host retains displaced saved editions. Preview can inspect native source behavior, an exact row review, or a complete native command without committing it.

## Full handover

The ZIP includes every source-manifest member and the manifest itself; working carrier, complete desk copy, editable HTML and full domain history; source representations and original binaries for every source edition; every frozen batch and native XLSX/CSV/JSON file; readable report and readiness/outcome CSVs; the pending original file; complete prior editor sessions; and all retained managed requests and editions. EXPORT_MANIFEST.json identifies each file by byte length and SHA-256.

The original Orkyo_Import_Readiness.html remains the previously delivered standalone artifact. Build the current complete-source editable desk with node desk/build-cli.mjs NEW_OUTPUT.html; installed applications and new handovers use the maintained current builder.

Read [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md) for the owner's actual rendered inspection instruction and exact native/browser receiving course. Keep Actions disabled and private customer source outside Git.
