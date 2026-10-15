# Installed Brewery Onboarding

## Open and continue

Select **Brewery onboarding** in Applications. Choose a physical private workspace directory. Supply a new label for an unused directory; existing saved sessions resume. Applications owns the private listener. Open its returned browser link. Stop drains the writer; agent disconnect releases its attachment while Applications continues.

The full original desk receives source families, inspects inventory at cutover, appends source-bound exception reviews and retains complete brewery programme profiles, sources and commissioning notes. Unfinished source/review fields and profile filters survive full working JSON, editable HTML and reopening. Original standalone files and native commands remain available.

Source-file, evidence, intake, review, context and replacement transitions prepare the entire successor and retained preimage before selecting it. Rejected selections restore the displayed choice; rejected file intake leaves the original draft available. Complete prior sessions remain exportable. Browser recovery shares immutable original command workspaces across proposals and uses a transactional expected head. Pending original requests and competing branches remain available for explicit recovery/adoption. Download recovery JSON before moving browsers or devices.

## Original reconciliation contract

Receive five required CSV families: items, aliases, opening, movements and target. Recipes, accounts and orders are optional complete source families. Every received original preserves its exact UTF-8 text, including BOM and CRLF. Read **docs/RECONCILIATION.md** for original columns and rules.

Opening balances and independent target counts bind item, lot and location. Signed movements apply strictly after opening through the cutoff instant. Exact rational mass and volume conversions preserve precision; packaged SKUs remain integer counts. Identical source events count once with both original row references. Conflicting duplicates, aliases and unit mismatches reject. Missing balances/counts remain distinct from measured zero. Recipe versions and open orders remain context; they do not silently become inventory movements.

Exception reviews bind the exact edition source identity and exception. Corrections append while retaining predecessor decisions and complete evidence. Review dispositions do not alter inventory arithmetic. Receive corrected originals in a new source edition.

## Native operations

Use absolute private paths. Close Applications before standalone writer commands. Connected commands attach to its existing writer.

```sh
node cli.mjs init /private/brewery "Project label"
node cli.mjs course /private/authored-brewery
node cli.mjs receive /private/received-brewery /private/Brewery_Working.json
node cli.mjs desk /private/brewery /private/Brewery_Editable.html
node cli.mjs connected /private/brewery /private/Original_Request.json
node cli.mjs connected-status /private/brewery /private/Original_Request.json
node cli.mjs export /private/brewery EXPECTED_SAVED_SHA /private/Brewery_Handover.zip
node native/receive-installed.mjs
```

For full native source intake:

```sh
node cli.mjs ingest /private/brewery /private/Intake_Metadata.json /private/Original_Request.json
```

Metadata is a complete action request. Its operation kind is receive; payload includes id, label, settings={openingAt,cutoffAt}, notes and sources. Each required/selected optional source starts as {file:ABSOLUTE_PRIVATE_PATH,name,sha256}. The command reads all complete originals, verifies hashes and UTF-8, replaces metadata with {name,text}, writes the original complete request before applying, then uses the same canonical writer model.

## Merchant configuration and operations

```json
{"schema":"stellar-forge.brewery-host.v1","workspaces":{"migration":{"directory":"/private/brewery","inputs":{"items":{"file":"/private/items.csv","sha256":"FULL_SHA256"},"working":{"file":"/private/Brewery_Working.json","sha256":"FULL_SHA256"}}}}}
```

Declare each desired original input alias in the same way. Set the Merchant host's breweryConnection to this configuration path. One alias names one physical installation. Inputs are verified on configuration and reread at receiving time.

Call merchant_brewery_connect and status. Pin the saved edition SHA for every paged read, preview and export. Inspect editions, original bytes/rows, buckets, movements, duplicates, recipes, orders, accounts, exceptions and complete review histories. Also read programme profiles/sources, complete editor drafts, backups and original request history. Page until nextOffset is null.

merchant_brewery_ingest accepts sources with each required/selected optional family={sourceInput,sha256}, edition={id,label,settings:{openingAt,cutoffAt},notes}, expectedHead and request={id,baseSha256,actor,at}. The five required families must all be present. merchant_brewery_action accepts receive and review with original core payloads. Each operation repeats original request ID, actor and time and binds the original workspace head.

merchant_brewery_receive accepts complete working carriers, original desk/domain files and complete original requests from declared inputs. A request includes schema=stellar-forge.brewery-request.v1, installationId, id, baseSha256, actor, at, kind and carrier or operation. Retain the complete original before dispatch. Recover uncertain outcomes with the identical request. An original retry returns its original result while preserving later work; stale selections retain a rejection without replacing the selected carrier.

## Complete handover

Save complete handover ZIP exports the host's retained selected edition. Save unfinished work first and retain complete browser recovery for pending proposals. The ZIP contains all maintained source, complete current working carrier, original desk/domain workspaces, all prior sessions, editable HTML with its source bank, every source edition/reconciliation/report/eight CSV projections, exact original and evidence bodies, and host request/edition history.

merchant_brewery_file reads retained ZIPs by exact hash and byte range, including after Applications stops. Read every range and verify total bytes and SHA-256.

Build/install source selection brewery-onboarding-workspace. Its contribution installs brewery-workspace and brewery-managed, plus Applications and Merchant providers and their shared runtime dependencies. GitHub Actions remains disabled.

The installed read adapter has a bounded 32 MiB / 24-entry cache keyed by the entire serialized input and read arguments. Initial results come from the unchanged original engine and returned results are copied. Changed source, history or arguments select distinct entries.
