# Resume a saved native04 Performance and financial operation

The original customer case, quotation history, measured usage, Pricing workspace and whole saved archive remain the operating state. The continuation uses the original request files. The completed tariff foundation stays in `original-native`.

This delivery adds two receiving boundaries to the existing operation:

1. `receive-saved-checkpoint.py` restores the selected whole updated archive before the existing caller starts. It retains the original terminal native result and the archive's preceding journal chain.
2. `continue-native04.py` accepts an optional complete Performance source entry and composes it with the original 411-file source graph in a separate directory. The maintained `performance-native.mjs` retains its completed commercial phase before continuing its original Pricing interfaces.

## Receive the current saved case

Call `receive_saved_checkpoint(source, root, original, specification=..., download=..., emit=..., programme_path=...)` from the original private receiving programme. `source` is the fully verified original continuation source directory; `original` is the original saved foundation archive; `root` is this invocation's private receiving directory.

The specification carries the selected actual predecessor operation ID, record path, original registered programme SHA-256, relevant original terminal result fields, Library result/selection, complete archive byte count, member count and SHA-256, and the exact saved financial journal's `startedAt`. Obtain these values from that operation's actual result and selected saved archive.

The download callback is the unchanged `LibraryDownloadWorkflow.run` method already supplied by the private receiver. Keep its credentials and signed transfer URLs in that original private context. The code receives the whole original artifact; it does not use a summary as operating state.

The receiver verifies the complete archive, original foundation/result bytes and Pricing identity before restoring files under the original canonical native04 root. It records the selected predecessor and source in `financial-native-recovery` inside the saved work tree. If file receiving is interrupted, an exact retained prefix can resume. This includes a partially received `FINANCIAL_NATIVE_OPERATION.json`.

If a later local invocation already continued from the selected archive, the receiver follows the original `attempt.previousJournal` path, byte count and SHA-256 chain back to the selected saved journal, verifies the original foundation, and keeps that newer work. Other changed or unrelated files are preserved for reconciliation.

## Select the maintained Performance continuation source

The existing caller's `performanceContinuation` input is optional. When supplied, it has exactly five fields:

| Field | Meaning |
| --- | --- |
| `sourceFile` | Absolute normalized regular local file containing the complete selected `performance-native.mjs` source. |
| `preimage` | Git blob identity of that entry in the original verified 411-file graph. |
| `gitBlob` | Git blob identity of the complete selected source bytes. |
| `bytes` | Complete UTF-8 byte count, between one byte and 1 MiB. |
| `sha256` | SHA-256 of those same complete bytes. |

For this original source graph, the entry is `stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/performance-native.mjs`, with preimage `cc213fc484dca1ac5f57a090ac481ceb11778fc7`.

The input can be assembled from the actual local source bytes:

```python
from pathlib import Path
import hashlib

selected = Path("/private/received-source/performance-native.mjs")
body = selected.read_bytes()
payload["performanceContinuation"] = {
    "sourceFile": str(selected),
    "preimage": "cc213fc484dca1ac5f57a090ac481ceb11778fc7",
    "gitBlob": hashlib.sha1(
        b"blob " + str(len(body)).encode("ascii") + b"\0" + body
    ).hexdigest(),
    "bytes": len(body),
    "sha256": hashlib.sha256(body).hexdigest(),
}
```

The caller first receives and validates its original `WORK/source` graph through the existing source contract. It then checks the selected source entry against the complete declared bytes and original preimage. The other 410 source files are copied unchanged.

The complete composition is retained under `WORK/performance-source/<inventory-sha256>`. `PERFORMANCE_SOURCE.json` records all 411 file identities, the original root, the selected entry and its preimage. A second source check precedes each retained file write. Reopening the same composition reuses its identical files. The original source directory remains available throughout.

Only the Performance invocation uses the selected source directory. The original native/case/output paths, saved commercial requests and selected financial source binding remain in place. The optional composition is recorded in the original attempt log and final whole-work archive.

## Commercial phase and remaining interfaces

The maintained Performance source retains `performance/commercial-phase.json` after the existing commercial, HTTP, complete case/package, recipient and MCP work has closed. The checkpoint contains the original operation and request files, saved source/model versions, quote/document identities, complete material trees and original case revisions.

On reopen it checks that material before calling the existing `runPerformanceInterfaces` with the original envelope, performance request, monthly proposal and committed Pricing request. The original native source and customer packages remain the source of those inputs. A saved empty private service directory can be recreated from its empty tree descriptor after whole-archive receiving; missing nonempty material remains a receiving error.

The original final `performance/flow-result.json` is retained only after the Pricing interfaces finish. Its `completedAt` records that final completion. The financial caller then uses the existing accepted quotation, original receivables writer, issued invoice and recurring service calendar workflow, retaining its full original downloads and exports.

## Continue the original native job history

A native job that actually dispatched and ended with a failed application result keeps that original terminal result. The released operator's pre-dispatch `resume-capacity --recover-failure` facility does not replay a completed application command.

Register this saved-case continuation as an explicitly linked invocation through the same released native operator and shared capacity ledger. Preserve the predecessor's request, process, log, completion and result files. The business operation and request IDs stay with the original saved case.

Use the original whole-operation memory and storage profile, including receiving archives, original source, the additional complete Performance graph and final private archive. The source receiver and composed caller retain all new completed or interrupted output through the existing private saving helpers before returning.
