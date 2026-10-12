# Installed gRPC product: complete workspace migration

The installed `grpc-merchant` product carries the whole native workspace migration flow through its existing browser, agent and saved Console. The `grpc-merchant` source selection includes `grpc-workspace-transfer`, the complete archive helper, typed client, browser assets and original source engines.

## Open the existing product

Use the original `grpc-merchant init`, `review` and `open` commands described in [Operating guide](OPERATING.md). In the native browser, select **Workspace migration** to capture all saved work, review its file inventory, receive a selected archive and open the received project.

The existing handles file can include a `destinations` map and archives of kind `workspace-transfer`:

```json
{
  "schema": "stellar-forge.grpc-product-handles.v1",
  "captures": {},
  "files": {
    "archive": {
      "path": "/srv/grpc/delivery/grpc-workspace.tar.gz",
      "kind": "workspace-transfer",
      "sha256": "ACTUAL_ARCHIVE_SHA256"
    }
  },
  "reflections": {},
  "destinations": {
    "received": {
      "directory": "/srv/grpc/received",
      "label": "Received native workspace"
    }
  }
}
```

Initialization, inspection, launch review and managed Applications preparation preserve these declarations in the original source binding. A later handle change uses the ordinary product review/launch flow.

## Forward the original native commands

```sh
grpc-merchant transfer list --dir /srv/grpc/product \
  --output /srv/grpc/migration/list.json

grpc-merchant transfer capture --dir /srv/grpc/product \
  --input /srv/grpc/migration/capture-input.json \
  --output /srv/grpc/migration/capture.json

grpc-merchant transfer read --dir /srv/grpc/product --id CAPTURE_UUID \
  --output /srv/grpc/migration/capture-current.json

grpc-merchant transfer files --dir /srv/grpc/product --id CAPTURE_UUID --limit 250
```

Save the actual list binding and new capture UUID in the input before invoking. The installed forwarder reads this product's original `consoleUrlFile` and invokes `runGrpcTransferCli`; full connection capabilities stay in private files.

The same forwarder supports download, upload, upload-status, inspect, receive, receipt, open, close and cancel. `open` requires a private `--output` file for the received editor's new link. Complete arguments are in the selected source's `grpc/transfer/RECEIVING.md`.

The offline `archive-inspect` and `archive-receive` commands can run directly without an open product:

```sh
grpc-merchant transfer archive-receive --id RECEIVING_UUID \
  --archive /srv/grpc/delivery/grpc-workspace.tar.gz \
  --directory /srv/grpc/received \
  --sha256 ARCHIVE_SHA256 --bytes ARCHIVE_BYTES \
  --manifest-sha256 NATIVE_MANIFEST_SHA256 \
  --output /srv/grpc/migration/received.json
```

## Receive a complete merchant export

First create and retain one `merchant_grpc_transfer_export` result through the product's existing agent. Preserve its export ID, outer export-manifest hash, native capture manifest hash and archive hash/length.

```sh
grpc-merchant receive-workspace --dir /srv/grpc/product \
  --export-id ORIGINAL_EXPORT_SHA256 \
  --out /srv/grpc/customer-download --destination /srv/grpc/received \
  --id ORIGINAL_RECEIVING_UUID \
  --manifest-sha256 OUTER_EXPORT_MANIFEST_SHA256 \
  --transfer-manifest-sha256 NATIVE_MANIFEST_SHA256 \
  --archive-sha256 ARCHIVE_SHA256 --archive-bytes ARCHIVE_BYTES
```

This receives both complete files with the existing resumable transport, then publishes and reopens the native workspace at the explicit destination. Repeat the exact command after an interruption. The receiver's original receipt identifies the same archive and destination and preserves later valid edits there.

`grpc-merchant receive` can also download the saved two-file export without creating a new workspace. `inspect-received` verifies the selected full files and archive inventory. `receive-workspace` adds the explicit native destination and complete original-engine validation.

## Typed product interface

The existing product client exposes the full sequence:

| Method | Result or effect |
| --- | --- |
| `workspaceTransfers(page)` | Current binding and saved captures/receipts |
| `captureWorkspace(input)` | Original immutable capture |
| `workspaceCapture(id, section)` | Saved summary or complete manifest |
| `workspaceFiles(input)` | Full inventory pages |
| `uploadWorkspaceArchive(input)` / `workspaceUpload(id)` | Original archive intake and durable position |
| `inspectWorkspaceArchive(selection)` | Complete original archive descriptor |
| `receiveWorkspaceInHost(input)` | Host-declared destination receiving |
| `workspaceReceiving(id)` | Receipt and current destination binding |
| `openReceivedWorkspace(input)` / `closeReceivedWorkspace(id)` | Original received editor lifecycle |
| `cancelWorkspaceTransfer(id)` | Settled cancellation of its original active operation |
| `exportWorkspace(input)` | Immutable two-file merchant export |
| `receiveWorkspace(input)` | Full download plus explicit native receiving |

The declarations in `client.d.mts` retain the original archive, manifest, binding, paging and receiving types. Existing methods for calls, streaming, upgrades, health and incidents continue on the same product client.

## Continue in the received project

A received directory is a complete native workspace. Initialize a new product profile selecting that directory, then review/open it with the ordinary installed workflow. Its original revisions, saved calls, observations, incident history, preparations and release source are available together.

The old runtime launch and path-bound release receiving records remain historical observations. A newly opened product acquires its own writer lease and source binding. Supply the recorded environment names through the new operator environment when using upstream or release functions.

The same selected distribution carries the original nine-phase operations receiving and the complete migration continuation. Their native result artifacts record the source commit, original operation IDs, full file hashes, received revisions and final owned-resource closure.
