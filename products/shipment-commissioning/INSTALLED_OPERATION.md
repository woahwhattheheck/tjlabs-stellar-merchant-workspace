# Shipment Commissioning Desk — installed operation

The application retains the complete original shipment commissioning editor and replayable journal. Applications opens one private writer around the full eight-view desk. Browser, native and Merchant clients use the same installation and exact saved edition.

## Create, open and resume

Select Shipment Commissioning Desk in Applications. Enter a physical private workspace directory. Supply a label to create an unused workspace; leave the label empty to resume a saved workspace. Applications opens the current private browser link and owns the writer until Stop completes. Restart reuses its original loopback port and retained browser recovery.

For native setup, all paths are absolute:

```sh
node products/shipment-commissioning/installed-cli.mjs init /private/shipment "Shipment commissioning"
node products/shipment-commissioning/installed-cli.mjs course /private/authored-shipment
node products/shipment-commissioning/installed-cli.mjs receive /private/received /private/Shipment_Commissioning_Working.json
node products/shipment-commissioning/managed.mjs --workspace /private/shipment
```

Standalone native writer commands require Applications to be closed. Connected commands attach to the existing writer. The installation identity, physical directory and actual listener are checked on every connection.

## Complete ordinary workflow

1. **Originals:** retain each complete input document or captured JSON output, with its filename, description and actual origin. Raw bytes are immutable; corrections use new original IDs.
2. **Reference:** create ordered named checkpoints with the actual input sequence, document references, expected document-to-shipment bindings, exact typed field values/ownership and readiness/missing-field observations. A named reviewer approves the exact case basis.
3. **Output mapping:** configure JSON Pointers into the actual captured output. Explicit observed-state aliases can map field owners and gate states to the canonical states. The original JSON and mapping edition remain retained.
4. **Runs:** freeze the approved case, method, product edition and conditions. Add a complete output capture for every checkpoint. Previous captures remain; selecting a different capture expires the current run review.
5. **Review:** inspect every required-row denominator, missing/duplicate/unexpected row, protected field and readiness difference. Supply a disposition, owner and explanation for each finding. Uncaptured checkpoints remain uncovered even when they expect zero rows.
6. **Effort:** enter performer, phase, actual interval, active seconds and comparability conditions. One performer's overlapping intervals are refused. Comparisons require the same frozen case, matching recorded phase coverage and comparable measurements.
7. **Handover:** save the complete working file, editable HTML or all-source handover. The managed handover includes every original request and retained saved edition.

Changing a reference requires renewed approval while earlier runs retain their frozen reference. Changing a mapping never changes an earlier capture's mapping. Source identifiers and numeric literal spelling remain exact. The domain's original command journal replays on first validation. The original export function accepts an optional replay flag, defaulting to its full original validation; the cached adapter uses structural validation only after an exact complete journal has already passed replay. All exported member content matches the original exporter byte for byte. A bounded complete-content cache reuses only an identical validated journal or a successor produced by the original immutable apply function.

## Drafts and recovery

A file read that fails metadata, domain or capacity validation is retained as a pending original with exact bytes, filename, media type, full entered metadata, read time and reason. Originals provides ordinary Correct and retry and Download exact original controls; retry works after the browser file control has cleared.

Every form, actor, view and selection travels in the original shipment-review-session.v1 editor. Mutating actions prepare and validate the complete successor before selection. Switching case or mapping retains the full unfinished editor. Browser saves use an atomic compare-and-swap and independently retain conflicting proposals. Explicit saved-branch adoption keeps both complete prior branches.

Existing original browser sessions migrate from tjlabs.shipment-review.v1 into the managed immutable-object store on their first successful installed save; the original database remains intact. A provided portable opening retains the previously saved browser branch before selecting incoming work.

If complete input exceeds capacity, the visible input stays available. Save complete working file downloads its full hash-bound pending carrier. Download pending input and reset forms explicitly downloads the whole input before clearing current forms; prior branches, actor and domain history remain. Continue with a separate installation if the retained domain/history itself exceeds capacity.

Managed save retains one exact original request until its outcome is recovered. After an interrupted response, Recover original request queries that same ID/content before resubmitting. Opening the newest saved edition preserves the full local branch. Stop drains pending writer operations.

## Native commands and Merchant tools

The original native/shipment-commissioning.cjs remains available for workspace-only commands documented in docs/NATIVE.md and docs/COMMANDS.md. The installed CLI additionally supports complete sessions, request recovery and host history:

```sh
node products/shipment-commissioning/installed-cli.mjs inspect /private/shipment
node products/shipment-commissioning/installed-cli.mjs session /private/shipment /private/working.json
node products/shipment-commissioning/installed-cli.mjs connected /private/shipment /private/original-request.json
node products/shipment-commissioning/installed-cli.mjs connected-status /private/shipment /private/original-request.json
node products/shipment-commissioning/installed-cli.mjs desk /private/shipment /private/editable.html
```

Each action request retains schema, installationId, id, baseSha256, actor, at, kind:action and operation. The operation has the same id/actor/at, the exact complete editor expectedHead, its command kind and full payload. Supported kinds are add_original, save_case, review_case, save_contract, create_run, add_capture, select_capture, review_run and record_effort. Their payloads are the original documented value objects. The adapter supplies the actual current domain revision/hash and retains the resulting original command.

Declare Merchant workspace inputs with an exact SHA-256, physical file path and unique alias. shipmentConnection points to a stellar-forge.shipment-host.v1 configuration with workspaces. Each workspace declares directory, optional installationId and inputs keyed by alias. Configuration captures each complete file identity; ingest and receive re-read and verify it before use.

merchant_shipment_status/connect/browser/inspect/preview/action/ingest/receive/export/file/disconnect expose the full workflow. Inspect pins expectedSha256 on each 1–50-row page and supplies the next offset. It includes complete original bytes, cases, mappings, frozen runs/captures, contributing observations, findings, exact effort, full commands and prior editor branches. Ingest retains binary/JSON originals unchanged. Receive accepts an original workspace, full editor, installed carrier or original managed request. Incoming actor context is retained before applying the new receiving actor.

Export requires the exact saved edition. Read every returned byte range and verify total length/SHA. Source-owned DEFLATE compression retains every ordinary path and exact member; the vendor's licence accompanies its full source.
