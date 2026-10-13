# Complete FRED operating handover

A portable handover carries the original economic project, retained observations, saved reviews and reports, recurring briefing history, release and migration work, and selected complete publication editions in one `fred-operating-handover.tar.gz`. An optional editable Operating Plan travels with those originals.

## Prepare and download

Open **History and handover** in the original economic workspace. Prepare a handover from its complete current revision, with the editable procedure when one is being handed over. Select all original publication operations or an explicit set. The source descriptor retains incomplete operation views; every selected complete publication includes its original edition archive.

A reopened received project offers its actual retained customer plan for the next handover. You can retain that complete plan, select an updated plan file, or explicitly choose a source-only handover.

The operation keeps its capture time, project revision, selected editions and complete plan. Resume the same operation after interruption. Use a new operation for a later project revision or an edited customer procedure.

Download the completed archive normally. The browser transfers the file as a stream. It does not load the whole handover into a browser Blob.

## Inspect and receive

Choose the original archive in the receiving workspace. Upload progress tracks the actual transferred bytes. Inspection reads every original member, checks its exact byte length and hash, recomputes the native source graph and validates the carried procedure against the source history.

Review the original project title, revision and inventories. **Receive project** restores its native sources and reports, opens every selected original publication archive through the existing publication engine, and receives the editable procedure. **Open received project** starts the original economic workspace for that restored project.

The receiving operation retains the source and its own working project separately. Repeating it preserves later compatible customer procedure revisions and project history. A divergent plan or changed original archive fails with its actual source error.

## Native operator

The existing installed command supports complete JSON requests:

```sh
starforge fred-operating-plan archive-export --request export.json --out export-receipt.json
starforge fred-operating-plan archive-inspect --request inspect.json --out inspect-receipt.json
starforge fred-operating-plan archive-receive --request receive.json --out receive-receipt.json
```

Export request:

```json
{
  "directory": "/private/economic-project",
  "outputDirectory": "/private/customer-handover",
  "capturedAt": "2026-10-13T09:00:00.000Z",
  "publicationIds": null,
  "plan": null
}
```

Supply the full existing plan object instead of null when the customer procedure belongs in the handover. `publicationIds: null` selects every retained original operation; an array selects exact original operation IDs. `expectedProject: {"id":"original-project-id","revision":3}` optionally binds export to a selected source revision.

Inspection request:

```json
{
  "archivePath": "/private/customer-handover/fred-operating-handover.tar.gz",
  "directory": "/private/customer-inspection",
  "expectedArchive": {
    "path": "fred-operating-handover.tar.gz",
    "bytes": 12345,
    "sha256": "COPY_THE_ACTUAL_EXPORT_RECEIPT_SHA256"
  }
}
```

Use the actual exported byte count and SHA256. The optional `expectedArchive` may be omitted for first inspection; the receiver still validates the complete internal inventory and every original member. A receiving request uses `destination` instead of inspection `directory`. Its usable native project is `destination/received/project-workspace`.

JavaScript exports live at `fred/operating/archive.mjs` with matching declarations. The same functions accept the existing `qcewSourceContexts` Map and AbortSignal without altering source context. Request files should keep secrets out of ordinary procedure notes.

## Complete format and identity

The deterministic regular-file USTAR/gzip archive contains:

- `HANDOVER.json`: complete member inventory, source identity, exact source and manifest descriptors, and optional plan descriptor.
- `source-package/source.json`: original source descriptor, complete inventories and revision history.
- `source-package/MANIFEST.json`: original source-package inventory.
- `source-package/project/project-bundle.json`: complete original versioned project bundle.
- `source-package/published/<operation-id>/edition-package.tar.gz`: each selected completed original edition, unchanged.
- `OPERATING-PLAN.json`: complete editable procedure when supplied.

Original source files, publication archives, versioned project identities and plan revision history are unchanged by compression. The reader accepts the same regular-file USTAR format as the original publication writer, rejects duplicate or redirected members, and verifies every byte against the complete inventory before admitting the handover. Partial receives keep exact complete members for same-operation recovery.

The source-package limit remains 4 GiB; the project bundle limit remains 480 MiB. Complete source descriptors and carried plans each allow 32 MiB. Portable transfer allows 4 GiB plus 128 MiB for descriptors, tar headers and compression overhead. Transfer and compression use streams; receiving still needs disk capacity for the archive, extracted originals and independent working project. Downloads and original inputs stay private.

## Workspace and installed clients

Authenticated routes use the original session and project binding. Export, upload, inspection and receiving retain immutable operation IDs and return their actual state. The workspace lists completed and interrupted handovers; a retry continues its retained original selection.

A raw upload sends `application/octet-stream` to `/api/operating-handover/upload?id=ID&bytes=N`, with optional `sha256`. The installed client can supply a precomputed hash; the browser can stream a File directly. The server computes the actual upload hash and freezes it.

The full download route returns Content-Length and `x-fred-file-sha256`. Browser download tickets are short-lived, single-use links created by the authenticated session. Reopening a received project returns that new workspace's original startup URL and session.

The original directory source APIs remain available; see [SOURCE.md](SOURCE.md). The complete archive is a portable transport over those same capture and receiving engines.
