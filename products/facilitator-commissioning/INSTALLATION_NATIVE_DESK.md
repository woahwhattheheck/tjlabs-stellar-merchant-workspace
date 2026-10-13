# Customer Installation — native receiving from the same desk

This guide continues a complete saved Customer Installation preparation through the original Grant Operations application. The Customer Installation screen now provides explicit **Preview**, **Save**, **Export**, and **Receive** commands. Each uses the maintained native receiving bridge and its original SF47 writer.

The existing commissioning job, service selection, two facilitator identities, full source population, funded Workshare and complete preparation remain the basis. A preview does not create a saved Installation. Save records the native edition in its original case. Export retains the entire selected native operating case and source. Receive imports that exact archive into the configured independent workspace and reopens its selected Installation and every bound source.

## Configure the two existing services

The host operator adds a named receiving connection to the existing private commissioning setup file. Preserve its current store, provider profiles and buyer templates.

Example structure (replace paths with the actual existing host files):

~~~json
{
  "store": "/absolute/private/original-store",
  "profilesFile": "/absolute/private/original-profiles.json",
  "buyerTemplates": {},
  "installationReceiving": {
    "customer-operations": {
      "title": "Original customer Operations and receiving workspace",
      "file": "/absolute/private/original-installation-host.json"
    }
  }
}
~~~

The selected host file uses the existing schema documented in INSTALLATION_RECEIVING.md:

~~~json
{
  "schema": "stellar-forge.facilitator-installation-receiving-host.v1",
  "directory": "/absolute/private/original-installation-journal",
  "source": {
    "directory": "/absolute/private/original-grant-source",
    "allowStart": false,
    "label": "Original customer Operations"
  },
  "receiving": {
    "directory": "/absolute/private/original-grant-receiver",
    "allowStart": false,
    "label": "Independent customer receiving"
  },
  "preparations": {}
}
~~~

These are private files owned by the current operator, with the original service selections inspected by GrantWorkspaceClient. Both applications must already be running under their existing owners. The browser receives the alias and its display name. It supplies no filesystem path, server URL, credential, shell command or permission to start a service.

The preparations map may remain empty because the desk reconstructs its selected complete preparation through its own original content identities. The original CLI may continue to use its named preparations. Source and receiving workspace bindings must remain distinct. The bridge journal remains associated with those exact original selections. Closing the desk drains its original queue and closes only the clients and bridge lock it constructed; the borrowed applications remain owned by their original operators.

## Prepare and inspect the same Installation

Use INSTALLATION_DESK.md to retain the complete service transfer, actual current Operations case, original Workshare seed, source attachments and operating choices. Open the resulting **prepared Installation** in Customer Installation.

Review its source matching, workorder, assignments, all selected provider authority and complete native document. The screen shows the actual original case and plan versions. Keep missing sources or unresolved customer choices explicit in that original preparation. A changed case or source selection requires a new reviewed preparation; earlier editions remain retained.

The native Preview form selects the existing host alias and records the actual operator, reason and receiving case name. The full command is retained before its first HTTP preparation, using the same browser recovery, per-form draft and cross-tab claim as the existing service workflow. Review the saved command, then apply it.

The original bridge:

1. Copies and verifies the complete preparation against its exact INSTALLATION_PREPARATION.json bytes.
2. Reads the actual selected Operations case and compares its original case and plan basis.
3. Calls the original native Installation preview.
4. Retains the complete returned preview, original document and exact future Save request.

Open the complete native document and original preview in the screen. Download native-preview.json and inspect its validation, source, version and Installation revision. The native response remains the authority.

## Save, export and independently receive

Each phase has a separate explicit command and its own outer operator UUID. All phases refer to the same original receiving-operation UUID. The Save and import request IDs inside that original native operation remain unchanged across replies, retries, restarts and later observation.

**Save.** Review the displayed native observation and apply the Save command. Its payload retains the exact observation SHA. The bridge sends the already retained native Save request with the actual preview SHA and expected original case/Installation revisions. It reopens the saved edition and compares it to the full native preview.

**Export.** After native acceptance, apply Export. The bridge finishes an interrupted saved-edition observation before using the original exporter. Download complete-case.zip. It contains the selected original Installation and complete operating case/source bundle, within the native 32 MiB case-export allowance.

**Receive.** Apply Receive against the configured independent workspace. The bridge reuses its original import request and exact archive bytes. It reopens the selected received Installation, verifies its identity against the saved original and checks the receiving case’s original archive/program provenance and every bound source.

The final screen exposes the full receiving result, original import response and independently received Installation edition. A missing previously accepted edition in an older restored workspace is an actual native refusal. Restore that accepted original workspace and continue its request; an earlier backup is not a reason to create another Installation or case.

## Full original observations and files

Every returned native observation retains its complete original files in the existing commissioning operator’s content-addressed inputs. Large native files are stored as exact 16 MiB parts with a whole-file byte count and SHA256. The same original operator export contains those parts, their immutable observation records, all original commands and exact preparation bindings.

Catalog results are compact. Open one original operation to inspect its saved observation. File pages and captures take its snapshotSha256 so a later response cannot silently change a page or download that the reviewer selected. The screen offers **Open latest saved observation** explicitly.

Depending on actual completed phases, files include:

- operation.json, intent.json and the original Save/import requests;
- native-preview.json and native-save.json;
- original-saved-edition.json;
- complete-case.zip;
- native-receive.json and independently-received-edition.json;
- RECEIVED.json;
- every retained original refusal or uncertainty observation exposed by the native bridge.

A native error does not mark its outer command complete. Its returned observation is still retained, including any already accepted native phase. Open that actual observation and recover the pending original command.

Keep the original native receiving journal and the source/receiving workspaces with their existing backup procedures. The complete commissioning transfer carries the original observed files and prepared commands. Active native continuation still requires the original inspected workspace bindings and original bridge journal; a received historical observation does not authorize a replacement workspace or application.

## Interrupted requests and restart

The existing browser retains the exact complete command before POST. On a lost reply:

1. Receive that same outer operation UUID.
2. If the host reports COMPLETE, use its retained receipt.
3. If it reports PENDING or reconciliation required, deliberately apply the same original request.
4. If it reports NOT_FOUND and the browser retains the full request, re-prepare that exact request with the same UUID and body.

The original native bridge handles any lost native Save or import response with its own original request ID. The outer command never invents another ID for that native transaction.

The form draft retains its original job revision, selected preparation and native observation basis. The interface locks mutating and navigation controls during asynchronous capture. Drafts clear only when the same submitted snapshot is accepted. If another tab owns a pending request, recover or deliberately release that original claim first.

Opening the same commissioning transfer on another operator keeps all observed native files readable from exact retained content. A host configuration that points to different source or receiving selections is refused for continuation. Apply current host configuration deliberately to the original services and journal; browser inputs cannot rebind them.

## Authenticated customer and agent interfaces

The existing Merchant provider adds two read operations:

- merchant_commissioning_installation_receivings: compact original operations and named host connections for the same configured job.
- merchant_commissioning_installation_receiving: exact saved observation, preview, saved/received edition or all file pages.

The second takes operationId and snapshotSha256. Keep both fixed across pages and captures. No implicit native action occurs during these reads.

Prepare these commands through the existing merchant_commissioning_prepare / apply / receive protocol:

~~~json
{
  "operationId": "ORIGINAL_OUTER_UUID",
  "expectedRevision": 12,
  "action": "installation-preview",
  "payload": {
    "hostAlias": "customer-operations",
    "preparationOperationId": "ORIGINAL_COMPLETED_PREPARATION_UUID",
    "actor": "Actual recording operator",
    "note": "Actual reviewed Installation reason",
    "receivingName": "Actual receiving case name"
  }
}
~~~

The UUID labels above are explanatory placeholders. Use actual original UUIDs and the actual current job revision.

Later phase payloads contain receivingOperationId and expectedSnapshotSha256. The action is installation-save, installation-export or installation-receive. The native Save/import request remains bound to the original Preview operation regardless of the outer phase UUID.

Capture a full original native file with file.kind = installation-native, its original receiving UUID as id, declared name and exact snapshotSha256. The customer verifies the selected snapshot’s complete file descriptor before streaming the content, then verifies actual bytes and whole-file SHA through EOF. Captured manifests reopen without a live operator. Native files support up to 512 MiB; the native case ZIP keeps its smaller original 32 MiB limit.

## Complete customer operating course

Continue the same accepted customer, paid source, case and installed course. Select the actual completed preparation and configured original host pair. Do not replace missing original acquisition evidence, source case, Workshare seed or provider outcome with example customer data.

Operate the full course: open prepared source and workorder → native Preview → inspect complete native document → Save → reopen accepted original edition → complete case Export → independent Receive → reopen received Installation and every source → receive the original pending/replayed requests → complete operator export and cold reopen with native files intact.

Where the actual original native operation was already accepted, resume it instead of repeating it. Observe genuine refusals, lost replies and existing recovery cases without manufacturing a new purchase or case. Retain all original request and response identities in the same course.

Before presenting this outgoing version, the producing worker must open/run/render and VIEW the actual populated application at desktop/screenshare and narrow/mobile widths. Operate each meaningful control, draft recovery, explicit phase, file download and reopened case, plus relevant empty/loading/error states. Capturing screenshots without viewing them is insufficient.

Literally open/view/play/use every final attachment in its intended form: HTML, PDF, reports, slides, spreadsheets, maps, images, video, audio, archives and working projects. Extract both the native case ZIP and complete operator archive; open their actual contained deliverables and working projects. Inspect the exact final edition. Fix any real styling, layout, clipping, readability, broken-control or incomplete-download defect in the original source and rerun the affected operating step. Preserve source, requests, customer relationships and current ownership throughout.
