# CRM migration review

This application keeps original contact, company and deal exports, explicit ID crosswalks, field mappings, directed relationship types and delivery-lead decisions together. Its browser, native CLI and merchant tools use the same original comparison/workspace engine.

The fictional worked course starts with 18 complete CSVs and 40 recorded operations: its first rehearsal has 16 findings; corrected originals and mappings produce zero. Both editions remain available. The application compares the selected exports and explicit contract. The delivery lead retains import execution, business-exception acceptance and release decisions.

## Install or use the complete source

Use Linux and Node.js 22.16 or later. The comparison, standalone browser and original file CLI use the standard library only. The managed Merchant integration uses the maintained distribution and original private-directory writer.

From the complete repository:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs --repo . --ref FULL_COMMIT --selection crm-migration --out /private/crm-build
~~~

Use the builder's exact archive and SHA with the existing runtime-install prepare/install workflow, selecting schema, openapi and mcp for agent operation and operator for Applications. The original distribution/RUNTIME_INSTALL.md and runtime-workspace/APPLICATIONS.md travel with this source. An installed command uses starforge; the equivalent source command below is node products/crm-migration/cli.mjs.

Keep source, private workspace, merchant host and exported customer files in separate locations. The managed product uses physical absolute paths, owner-private directories (0700) and original input files (0600). Configuration and credentials stay outside customer bundles.

## Create or receive the original workspace

~~~sh
node products/crm-migration/cli.mjs course /private/crm-course
node products/crm-migration/cli.mjs inspect /private/crm-course

node products/crm-migration/cli.mjs init /private/client-crm client-migration "Client CRM migration"
node products/crm-migration/cli.mjs receive /private/received-crm /private/delivery/workspace.json
~~~

Create or receive into a new directory under an existing private parent. The receiver validates the entire original operation replay and content identity. Repeating receive with identical current content reuses that original; a different existing destination is preserved. A later working edition is not overwritten by retrying an earlier receive.

## Applications and the normal operator workflow

In the installed Runtime workspace, choose Applications → CRM migration review. Select the existing private workspace and port 0, review/save, Start, then Open. The startup observer authenticates the original workspace ID, actual directory identity, private connection and listener instance before accepting its browser link.

1. Enter a recording operator.
2. Import complete original source/target CSVs and crosswalks under new source IDs. Record their export scope and edition.
3. Use Mapping configuration to declare object identifiers, crosswalk columns, compared fields, exact decimal scale, currencies and directed association categories/type IDs.
4. Save a new mapping edition. Create the first comparison and inspect original rows in its findings.
5. Record reasoned corrections or exceptions. Preserve corrected files as later editions, copy the mapping and compare again.
6. Record the lead's decision for that exact rehearsal.
7. Download the workspace, readable reports or complete working bundle. Save offline desk creates an independently editable browser copy. Receive the complete workspace into a separate native directory for its next operator.

Custom association type IDs come from the actual target portal and direction. Labels are readable descriptions. The example type901 is fictional; default unlabelled and primary-company types remain distinct.

Browser actions retain the complete original operation in IndexedDB before dispatch. After a lost response, use Recover saved operation. It resends the same operation ID and body; the native engine returns its original receipt while retaining later work. A confirmed rejected request remains in the browser's request history. Open current host edition deliberately refreshes current saved data after addressing pending work and unsaved forms.

The managed browser writes to the host. Its ordinary workspace/version-import controls are available in the standalone offline desk; the managed application uses a separate native receiving directory for another workspace. An offline copy removes managed connection behavior and contains the complete selected original data and source modules.

Direct launch:

~~~sh
node products/crm-migration/managed.mjs --workspace /private/crm-course --port 0
~~~

Applications Stop and SIGINT/SIGTERM retire that listener's private connection, drain accepted requests, and release the original writer. The same workspace reopens with a new instance. A stale browser must reopen the current link.

## Native operations and complete receiving

Original operation schemas and full examples are in docs/OPERATIONS.md. Each operation contains id, actor, real UTC at, expected_revision, kind and complete payload.

~~~sh
node products/crm-migration/cli.mjs apply /private/crm-course /private/operation.json
node products/crm-migration/cli.mjs workspace /private/crm-course /private/delivery/workspace.json
node products/crm-migration/cli.mjs export /private/crm-course ACTUAL_WORKSPACE_SHA /private/delivery/crm.zip
node products/crm-migration/cli.mjs desk /private/crm-course /private/delivery/crm.html
~~~

Close the managed server before standalone writes. While it runs, use the browser, typed client, merchant tools or the connected command with the same operation file:

~~~sh
node products/crm-migration/cli.mjs connected /private/crm-course /private/operation.json
~~~

The ZIP retains original CSVs, all mappings, every rehearsal/report/decision, the complete replayable workspace and operation list, and a full member manifest. Export selects the exact current workspace SHA. Repeated exports of the same edition reproduce identical bytes. Files are retained by content hash under the original private workspace; they remain readable after Stop. The output writer reuses identical existing bytes and refuses to replace a different file.

Native and browser exports use reversible encoded member paths. Original filenames and IDs remain in the workspace; every original CSV retains its exact bytes. A local 256MiB request/archive limit is explicit; an over-limit operation fails rather than shortening data. This storage ceiling does not promise any particular high-volume comparison performance.

## Customer-agent setup and operation

Prepare the owner-private host configuration:

~~~json
{
  "schema": "stellar-forge.crm-host.v1",
  "workspaces": {
    "delivery": {
      "label": "Client CRM conversion",
      "directory": "/private/client-crm",
      "workspaceId": "client-migration",
      "inputs": {
        "contacts": {
          "file": "/private/originals/contacts.csv",
          "sha256": "ACTUAL_FULL_ORIGINAL_SHA256"
        }
      }
    }
  }
}
~~~

An input alias selects a complete existing file at its full SHA. Reconfigure the original host declaration deliberately for a later input edition. Agent tool parameters cannot supply arbitrary host paths or server origins.

Initialize the existing merchant host with an options file:

~~~json
{
  "directory": "/private/crm-merchant",
  "connection": "/private/crm-host.json",
  "name": "CRM migration delivery"
}
~~~

~~~sh
starforge merchant-providers inspect crm-migration
starforge merchant-providers init crm-migration --options /private/crm-setup.json
starforge merchant-mcp-stdio --config /private/crm-merchant/merchant-mcp.json
~~~

The source-owned provider exposes nine tools:

| Tool | Operation |
| --- | --- |
| merchant_crm_status | List declared aliases/inputs or current connected workspace summary |
| merchant_crm_connect | Authenticate the actual existing application instance |
| merchant_crm_disconnect | Release this attachment |
| merchant_crm_browser | Return the private current browser link |
| merchant_crm_inspect | SHA-bound pages of sources, mappings, run summaries, original operation receipts, findings or rows |
| merchant_crm_ingest | Complete host-declared CSV through the original ingest operation |
| merchant_crm_action | Original configure, compare, review or decide operation |
| merchant_crm_export | Retain the complete selected customer ZIP |
| merchant_crm_file | Read exact retained ZIP bytes by SHA and nextOffset, including while the application is stopped |

Keep the same operation ID, expected revision and complete payload after uncertainty. The host saves an immutable archive edition before atomically selecting its new current file. A retry reopens current disk state, recognizes the original operation and retains later editions. Failed validation does not change the original state. The writer lease is shared by native and managed operation.

The typed client exports CrmClient.connect(directory, {workspaceId, instanceId}), status(), workspace(), apply(operation), export(expectedSha256), file(fileId,offset,limit), browser() and close(). Its selected connection is rechecked before every request. Reconnect after an instance change. close() releases the attachment; Applications owns server shutdown.

## Source and receiving

README.md describes the standalone desk. docs/INPUT_CONTRACT.md, OPERATIONS.md and CUTOVER.md preserve the original semantic and lead-operating contracts. RECEIVING.md gives the complete installed course, including actual rendered use.

The original pure core and whole course execute in V8. The integrated store also executed an actual lost-commit-response → replay → later comparison → original-operation replay course with injected file/lease primitives; the retained result states that runtime explicitly. The equipped Linux receiving course runs the actual filesystem, HTTP, Applications, merchant and browser integration.
