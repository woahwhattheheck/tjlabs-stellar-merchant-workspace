# Receiving the complete installed Lightdash project

This guide covers two receiving operations over the original commissioning product:

- A customer receives an existing complete handover and opens its included original application and detached workspace.
- The owner of the completed full-Jaffle operation continues that same workspace through the installed project, authenticated MCP and original managed Applications, then receives the same original handover.

The [product guide](README.md) covers selected installation, private host inputs, ordinary authoring and native commissioning. The full original provider programme remains [the original receiving guide](../../business/lightdash-commissioning-workspace-20261012/receiving/README.md). All original 38 application files, source identities and licenses are retained in [SOURCE_LINEAGE.json](SOURCE_LINEAGE.json).

## Keep the identities distinct

| Identity | Meaning |
| --- | --- |
| Installed source commit and `package/manifest.json` SHA256 | The complete selected product, original app and dependency source |
| Original application manifest SHA256 | The unchanged 38-file commissioning application |
| Project ID/directory | Private installed-project preparation and MCP/Applications binding |
| Original workspace UUID | The commissioning SQLite source/native history |
| Edition UUID and complete source manifest | One immutable original source selection |
| Native operation ID and request SHA256 | One original planned dbt/Lightdash action |
| Provider project, preview and query UUIDs | Actual original service identities |
| Handover UUID and original request | A fixed SQLite revision and application/source/content selection |
| Whole ZIP SHA256 | The exact delivered original archive bytes |
| Receiving operation ID/directory | The retained create-only customer receiving and its recovery |

The project and workspace IDs are intentionally separate. Adopting a closed workspace creates an installed project binding over the same original SQLite store. Receiving an archive creates a detached copy with the original workspace identity and retained history; it does not repoint or replace the donor.

## A. Create and download an original handover

Use an already open installed project. Read its actual current revision, choose one UUID for the whole handover and persist that request before calling the original tool:

```javascript
import {randomUUID} from 'node:crypto';
import {connectProject,downloadHandover} from '@tokenjunkielabs/starforge-merchant/products/lightdash/client';

const client=await connectProject('/home/operator/lightdash-project');
try {
  const state=await client.status();
  const selected={
    handoverId:randomUUID(),
    expectedRevision:state.native.metadata.revision,
    includeOperatorPrivate:false
  };
  // Save selected in your private caller state before dispatch.
  await client.createHandover(selected);

  // Read this same UUID until the original result is complete.
  console.log(await client.handoverStatus({handoverId:selected.handoverId}));

  // After its status is SUCCEEDED:
  const delivered=await downloadHandover(client,{
    handoverId:selected.handoverId,
    outputDirectory:'/home/operator/lightdash-delivery',
    includeOperatorPrivate:false
  });
  console.log(delivered);
} finally {
  await client.close();
}
```

The original packager durably selects and fsyncs the SQLite basis before accepting the handover request. Later edits do not change that selected handover. If packaging is interrupted, use `inspectHandover` and then `resumeHandover` on the same UUID. Do not replace the request with the current workspace revision.

`downloadHandover` verifies the original status and transfers both complete files into one UUID directory:

```text
lightdash-delivery/
  ORIGINAL_HANDOVER_UUID/
    Lightdash_Commissioning_Handover.zip
    request.json
```

The original request is transferred byte for byte. Its containing directory must be named with its actual UUID; the original archive verifier uses that binding. The command-line equivalent consumes a private request file:

```json
{
  "handoverId": "THE_ACTUAL_ORIGINAL_HANDOVER_UUID",
  "outputDirectory": "/home/operator/lightdash-delivery",
  "includeOperatorPrivate": false
}
```

```bash
node "$LDW_SOURCE/products/lightdash-commissioning/cli.mjs" \
  download-handover \
  --project /home/operator/lightdash-project \
  --input /home/operator/private/download-handover.json
```

### Complete retained file transfer

The typed downloader uses the existing authenticated Merchant file transport and retained-read engine. It binds the original workspace, file selection, whole SHA256, read ID and offset. It reads bounded 131,072-byte chunks, checks every returned position and writes/fsyncs a durable local prefix before advancing the checkpoint.

A lost response resumes from the saved committed prefix. An expired server read handle is reopened against the same original file identity; it does not select a later artifact or handover. Only an uncommitted tail belonging to that exact local partial is truncated. Completion verifies the entire file SHA256 before publishing it with a create-only link. An existing different final file is preserved and rejected.

The original immutable file reader supports files through 8 GiB and streams archive/native files without loading the complete archive into memory. JSON/control inputs remain bounded separately. Source text, binary source members, original native artifacts, the whole ZIP and the raw handover request use the same scope and exact ID/hash rules.

To receive one saved native artifact:

```json
{
  "selection": {
    "kind": "artifact",
    "operationId": "original-run-chart-operation",
    "artifactId": "THE_ORIGINAL_ARTIFACT_ID"
  },
  "outputDirectory": "/home/operator/lightdash-delivery/query",
  "filename": "original-query.csv",
  "expectedSha256": "THE_ACTUAL_COMPLETE_ARTIFACT_SHA256"
}
```

```bash
node "$LDW_SOURCE/products/lightdash-commissioning/cli.mjs" \
  download --project /home/operator/lightdash-project \
  --input /home/operator/private/download-native-artifact.json
```

The artifact ID comes from the original native result. Its file must remain within that operation's retained native directory and have the declared whole-file identity. Default receiving exposes `native-content`. Operator-private files require both host enablement and the explicit per-request choice.

## B. Receive the original whole handover

Save a private receiving selection from the actual download result:

```json
{
  "schema": "stellar-forge.lightdash-handover-receiving.v1",
  "operationId": "customer-lightdash-handover-001",
  "directory": "/home/customer/lightdash-receiving",
  "runtimeDirectory": "/home/customer/lightdash-runtime",
  "archive": {
    "file": "/home/customer/downloads/ORIGINAL_HANDOVER_UUID/Lightdash_Commissioning_Handover.zip",
    "bytes": 123456,
    "sha256": "REPLACE_WITH_ACTUAL_WHOLE_ARCHIVE_SHA256"
  },
  "requestFile": {
    "file": "/home/customer/downloads/ORIGINAL_HANDOVER_UUID/request.json",
    "bytes": 1234,
    "sha256": "REPLACE_WITH_ACTUAL_RAW_REQUEST_SHA256"
  },
  "allowOperatorPrivate": false,
  "python": "/usr/bin/python3"
}
```

The numeric sizes, UUID directory and SHA256 values above are placeholders. Use the exact whole downloaded identities. The selected runtime must include this product and the same original application manifest as the handover.

```bash
node "$LDW_SOURCE/products/lightdash-commissioning/cli.mjs" \
  prepare-receiving --input /home/customer/private/receiving.json

node "$LDW_SOURCE/products/lightdash-commissioning/cli.mjs" \
  receive --input /home/customer/private/receiving.json

node "$LDW_SOURCE/products/lightdash-commissioning/cli.mjs" \
  inspect-receiving --directory /home/customer/lightdash-receiving
```

`lightdash-receive --input PRIVATE_SELECTION.json` invokes the same complete path. Preparation returns the exact original Python command, selected input file and input digest. External admission/host systems may execute that returned command; do not create a second copy of its business operation.

### What the receiver verifies and opens

1. It verifies the installed full source, all original application files, archive bytes, raw request bytes, original handover/workspace/revision and explicit private-diagnostics choice.
2. It retains the full original selection and takes one permanent receiving lock. The Node child inherits that actual file descriptor and lock identity.
3. It delegates whole ZIP validation and safe create-only extraction to the unchanged original `receiving/handover.py`.
4. It verifies the archive's exact member set, complete manifest and every file's bytes, SHA256 and executable flag. It accepts no symlink, traversal member, duplicate path or additional member.
5. It retains an extraction receipt and a durable pre-open intent before opening the receiving SQLite.
6. It verifies and imports the application included in the ZIP, then opens that included original workspace. The original ID, editions, source inventories, draft overlays, reviews, native plans/results and complete content are compared with the delivered selection.
7. It reopens historical terminal operations through the included original application. A terminal Execute returns the saved result. When omitted private journals make live Inspect unavailable, the original result remains intact and the response records `ORIGINAL_NATIVE_JOURNAL_UNAVAILABLE`.
8. It starts the included original browser server, reads the actual HTML/assets/state and closes the server/model/lease. This is an included-app receiving check. It dispatches no provider operation.
9. It writes the final original receiving result and acceptance record.

The default receiving SQLite has its original host connection detached and retains the original history. Its initial receiving revision is the selected donor revision plus the original detach transition. This transition is produced by the original packager and is distinct from a new source or native operation.

The receive process closes its already acquired child/process group even if a subsequent process-receipt write fails. The child inherits the original lock, so a surviving original writer excludes another receiver. An interrupt is handled within that same owner; the source does not create a background replacement job.

### Open the customer application for work

A successful result identifies `received/package` under the receiving directory. The complete included application is in `received/package/app`, and its original SQLite workspace is `received/package/workspace`.

Use the included original CLI:

```bash
LDW_RECEIVED=/home/customer/lightdash-receiving/received/package

node "$LDW_RECEIVED/app/cli.mjs" state \
  --workspace "$LDW_RECEIVED/workspace"

node "$LDW_RECEIVED/app/server.mjs" \
  --workspace "$LDW_RECEIVED/workspace" \
  --port 0
```

Read the included `START_HERE.html`, original `README.md` and `HANDOVER.md` for that delivered source edition. Configure a recipient-owned connection before planning new native work. The downloaded source/editions/reviews and historical query/content results can be opened while detached.

To use managed Applications and authenticated MCP around this received store, prepare a new installed project that explicitly adopts `received/package/workspace` and its original UUID. Keep the project/control directory outside that workspace. This retains the received original store and uses the same adoption contract as any closed commissioning workspace.

### Receiving after interruption or later customer edits

Repeat the exact same receiving selection and operation directory. Retained input/hash guards reject a different archive, request, application or destination.

Before the first included-app open, the original extractor resumes complete matching members and only reconciles its own exact published partial link when the regular file's device/inode matches the fully verified final member. Unrelated partial or final bytes are preserved and rejected.

After the durable open intent, the receiver does not overwrite the receiving SQLite with the old archive database. It verifies immutable archive/app/source members and the retained acceptance basis, then reopens the existing recipient. Later customer draft edits, source selection and recipient connection changes remain intact. A receiving replay is not a reset operation.

Keep the original archive, raw request and receiving journals until the complete customer receiving is accepted. Ordinary status reads are local. Complete success is recorded as `state: COMPLETE` with `providerDispatch: false`.

## C. Continue the SAME completed full-Jaffle operation through installation

The original full provider/native operation is:

```text
SCF-LIGHTDASH-COMMISSIONING-20261012-14F5
```

Its original source-native programme owns upstream acquisition, selected CLI/dbt/estate identities, two previews, native validation, content backup/promotion/restore, the 18-group regional-sales query, preview cleanup and whole handover. Preserve its actual original result, workspace and private host estate. The installed continuation starts only after that result is `SUCCEEDED`, both previews are stopped, all retained native operations are `SUCCEEDED` and its original detached handover receiving is complete.

The wrapper does not establish these conditions from a source publication or reported row count. It verifies the returned exact result file and opens the same original workspace under its lease.

### Prepare the exact installed continuation input

Use the original result's actual workspace directory/UUID and the installed selected runtime. The project request below is the same `prepareProject` schema; the source/connection declarations may be omitted for this receiving-only adoption because the completed original workspace already retains its configuration.

```json
{
  "schema": "stellar-forge.lightdash-installed-receiving.v1",
  "operationId": "SCF-LIGHTDASH-COMMISSIONING-20261012-14F5",
  "outputDirectory": "/home/operator/original-lightdash/installed-receiving",
  "project": {
    "schema": "stellar-forge.lightdash-project-request.v1",
    "directory": "/home/operator/original-lightdash/installed-project",
    "runtimeDirectory": "/home/operator/lightdash-runtime",
    "title": "Original Lightdash commissioning",
    "workspaceDirectory": "/home/operator/original-lightdash/workspace",
    "expectedWorkspaceId": "THE_ACTUAL_ORIGINAL_WORKSPACE_UUID",
    "allowOperatorPrivate": false,
    "python": "/usr/bin/python3"
  },
  "originalResult": {
    "file": "/home/operator/original-lightdash/result.json",
    "bytes": 123456,
    "sha256": "REPLACE_WITH_ACTUAL_COMPLETE_ORIGINAL_RESULT_SHA256"
  },
  "applicationsDirectory": "/home/operator/runtime-workspace",
  "browser": {
    "module": {
      "file": "/opt/browser/node_modules/playwright-core/index.mjs",
      "bytes": 1234,
      "sha256": "REPLACE_WITH_ACTUAL_ORIGINAL_BROWSER_MODULE_SHA256"
    },
    "executable": {
      "file": "/opt/browser/chrome-headless-shell",
      "bytes": 123456,
      "sha256": "REPLACE_WITH_ACTUAL_ORIGINAL_BROWSER_EXECUTABLE_SHA256"
    }
  }
}
```

All example host paths and byte counts must be replaced with actual original selections. The browser module must expose the original Playwright-compatible Chromium interface. The executable and module are verified from their complete file identities. The Runtime Workspace directory is an existing original runtime-workspace, not the commissioning SQLite directory.

Create/select that runtime workspace through its maintained original `runtime-workspace` CLI/model if one is not already present. The installed receiver attaches the exact selected runtime through that same original model and creates one managed Lightdash application with retained review/save request IDs.

```bash
node "$LDW_SOURCE/products/lightdash-commissioning/installed-receiving.mjs" \
  --input /home/operator/private/lightdash-installed-receiving.json
```

Or use `lightdash-project installed-receive --input FILE` / `lightdash-installed-receive --input FILE` through the original installed dispatcher.

### Complete receiving stages

| Stage | Actual receiving work |
| --- | --- |
| Original basis | Verify the exact completed result, original workspace ID, baseline/candidate editions, all original native IDs/digests and stopped previews |
| Installed shared lifetime | Open the installed project; authenticate to its actual MCP host; verify the complete tool catalog and shared browser state |
| Exact source/content reads | Transfer the complete reviewed regional-sales model and chart, compare original source editions, and transfer original native query outputs |
| Historical query replay | Execute only the already `SUCCEEDED` original query operation; require its complete native result to remain identical |
| Whole handover | Download the exact original ZIP and raw request through retained chunks and verify their whole identities |
| First managed lifetime | Original Applications review/save/adoption/Start; verified startup and browser/MCP reopen; Stop the exact owned run |
| Second managed lifetime | Close/reopen the original runtime-workspace, deliberately review a new Start, verify the same original workspace and Stop that exact run |
| Customer receiving | Receive the same original archive into a separate private destination and open its included application and detached original workspace |
| Original final reopen | Reopen the original installed project once more, verify all original source/native identities and close it cleanly |

Desktop and mobile browser images are retained with exact file hashes for the installed and managed lifetimes. They show the actual original UI at the returned URL. No substitute page or source-only screenshot counts as the original receiving result.

The source programme requires the exact 189-file candidate of the original full-Jaffle run. It reads the saved accepted target-query UUID from that native result, rather than inventing a query ID or treating expected fixture values as returned data.

### Original managed lifecycle recovery

Before each Start, the receiver durably saves the original review and UUID. A lost response is reconciled using that same original Applications run/history. Ownership is retained before the first awaited Start/recover call, so cleanup can stop the exact acquired run after an interruption.

An incomplete invocation records its exact cleanup run/terminal identity. On the next invocation it reconciles any still-active original managed run before trying to open the direct project over the same workspace. Only after positive stop does it create a new reviewed UUID for a deliberate reopen. The old request/history is preserved.

The receiver never stops an unrelated application or another run. If the exact original run is still draining, it returns an incomplete state that requires continuation of that same retained operation. Original resource keys prevent overlapping project/workspace owners.

The permanent receiving lock excludes a concurrent receiver. The final result records the original basis, original complete native result hashes, installed source identity, saved Applications histories, browser file identities and included-app receiving result. Its explicit facts are `providerDispatch: false`, `newQuery: false` and `newPayment: false`.

## Operating limits and current acceptance

The public source cohort and private project inputs are different artifacts. The selected source archive contains the complete application, wrapper, dependency/source manifest and guides. It does not contain the original warehouse, Lightdash server database or operator credentials. The customer handover contains the original packager's complete selected workspace and app. A program source ZIP alone is not that customer handover.

Default customer archives include selected native content/results. Full organization backup, warehouse snapshot, optional unrelated Lightdash resources and host installation transfer are outside the original commissioning archive contract. Retain actual server/CLI/dbt versions and image digests in the original host receiving record.

The completed local application check established original source parsing, actual browser HTTP and SQLite configuration/close/reopen. The full native estate run and this installed continuation remain tied to the same actual original operation until their returned result records establish completion. Preserve their precise state; do not infer a provider or managed-run result from this guide.
