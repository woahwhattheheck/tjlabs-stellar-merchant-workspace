# Portable FRED customer workspaces

Use one complete Operating Source archive to move an economic project, its selected published editions and its editable customer procedure. The archive retains the original project bundle, every selected original publication archive, source descriptor, manifest and reviewed plan. Historical ALFRED/API captures, public-table originals, DDP migration histories and QCEW receiving contexts continue through the maintained native receiver.

## Capture and download from the original workspace

Keep the existing private connection file for the original running workspace. Choose an original handover operation ID and preserve its capture timestamp and project revision.

```sh
starforge fred-workspace handover-export \
  --connection fred-private.json --workspace macro \
  --id customer-handover-20261013 --revision 12 \
  --captured-at 2026-10-13T09:00:00.000Z
starforge fred-workspace handover \
  --connection fred-private.json --workspace macro --id customer-handover-20261013
```

A new export needs the revision and timestamp. Optional `--publication-ids ID,ID` selects original publication operations; an omitted selection follows the native default. To include an edited customer procedure, configure a host input with kind `operating-plan` and use `--plan-input customer-plan --plan-file-sha256 EXACT_SHA`. The JSON input contains the entire ordinary OperatingPlan history. A reopened received workspace can instead use `--use-current-plan true` to retain its current complete customer procedure directly. Choose one of these plan sources; an identical original export retry should use only its retained operation ID. Its FRED source and project-history prefix are verified by the original exporter.

The request returns a compact status while the original host runs. Re-read the same operation until its status reports the retained result. If interrupted, follow `retryAction` and reuse the same operation ID. A completed export is reused; a later economic edition or changed customer procedure uses a new export operation.

Download using the exact SHA256 in `result.archive`:

```sh
starforge fred-workspace handover-download \
  --connection fred-private.json --workspace macro \
  --id customer-handover-20261013 --sha256 ORIGINAL_ARCHIVE_SHA \
  --out customer-handover.tar.gz
```

The client streams the full response, verifies its original length and SHA256, syncs the output and its directory, and publishes a create-only destination. An identical existing archive is accepted on retry. A different existing file is preserved.

## Receive and reopen on another host

Configure the complete archive as a host input alongside the existing receiving workspace connection:

```json
{
  "customer-archive": {
    "path": "./customer-handover.tar.gz",
    "kind": "operating-archive",
    "label": "Reviewed economic customer handover",
    "sha256": "FULL_ARCHIVE_SHA256"
  }
}
```

The receiving workspace provides the private authenticated upload and a retained operation directory. It does not replace that workspace's current project.

```sh
starforge fred-workspace handover-upload \
  --connection receiving-private.json --workspace receiver \
  --id receive-customer-20261013 --input customer-archive --sha256 ORIGINAL_ARCHIVE_SHA
starforge fred-workspace handover-inspect \
  --connection receiving-private.json --workspace receiver --id receive-customer-20261013
starforge fred-workspace handover \
  --connection receiving-private.json --workspace receiver --id receive-customer-20261013
starforge fred-workspace handover-receive \
  --connection receiving-private.json --workspace receiver --id receive-customer-20261013
starforge fred-workspace handover-open \
  --connection receiving-private.json --workspace receiver --id receive-customer-20261013
```

Wait for each retained phase to finish before advancing. Inspection verifies archive members, complete source and publication identities and the procedure's original history. Receiving reopens the same original project under the handover's private destination. Later local customer procedure edits survive receipt of an earlier matching plan. QCEW source contexts remain host-owned and pass unchanged through the native receiver and child workspace.

The open result contains the received workspace's private startup record. Retain it privately and attach the next connection to that original project ID. The originating workspace keeps its own project and operation inventory.

## Installed agent tools

The eight tools are `merchant_fred_handovers`, `merchant_fred_handover`, `merchant_fred_handover_export`, `merchant_fred_handover_upload`, `merchant_fred_handover_inspect`, `merchant_fred_handover_receive`, `merchant_fred_handover_open` and `merchant_fred_handover_download`.

Use configured input aliases for complete archives and procedures. Upload accepts the original alias and optional expected SHA256; a preflight hash and the streaming upload use one stable native file descriptor. Download accepts an exact archive SHA256 and one `outputName` ending in `.tar.gz`; it writes within the host's existing private export directory. The tools return status or saved-file metadata, while complete binary bytes remain in native files. Ordinary small source/procedure tools and publication chunk reads remain available.

The direct typed `FredWorkspaceClient` additionally exposes `operatingHandoverSource` and `operatingHandoverPlan` for the complete retained JSON descriptor and editable procedure. These validate the same original source and history relationship. Do not put archive bytes into JSON tool requests.

## Native file-to-file use

The existing native Operating Plans CLI supports `archive-export`, `archive-inspect` and `archive-receive`. Each takes one complete request JSON file; the result JSON contains metadata and native file paths.

```json
{
  "directory": "/private/original-project",
  "outputDirectory": "/private/customer-export",
  "capturedAt": "2026-10-13T09:00:00.000Z",
  "publicationIds": null,
  "plan": null,
  "expectedProject": {"id": "ORIGINAL_PROJECT_UUID", "revision": 12}
}
```

```sh
starforge fred-operating-plan archive-export --request export.json --out export-result.json
starforge fred-operating-plan archive-inspect --request inspect.json --out inspection-result.json
starforge fred-operating-plan archive-receive --request receive.json --out received-result.json
```

Inspection requests contain `archivePath`, a private inspection `directory`, and optional `expectedArchive:{path,bytes,sha256}`. Receiving requests contain `archivePath`, private `destination`, the same optional exact descriptor, and an omitted or null `qcewSourceContexts`. The QCEW engine reconstructs transient contexts from the original retained captures. Native JavaScript callers may pass their existing Map directly; a JSON request does not encode that Map. No new source acquisition is performed by these handover commands.

The complete native archive limit is 4 GiB plus 128 MiB; original expanded source remains limited to 4 GiB, each JSON descriptor to 32 MiB, and the economic project to 480 MiB. Streaming upload/download avoids allocating an archive-sized JSON string or Buffer. See the native [archive guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/operating/ARCHIVE.md) for the exact on-disk manifest and receiving layout.
