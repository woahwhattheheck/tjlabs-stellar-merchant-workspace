# A complete FRED source handover

The FRED Operating Plan is an ordinary editable procedure. Its source package carries the complete existing economic project and the selected original current-publication editions. Capture freezes the retained source; it makes no provider request and executes no customer purchase.

## Capture the retained source

Use an absolute private source project and a separate private output directory. Retain the exact capture timestamp and request for recovery.

```js
import { captureFredOperatingSource } from './source.mjs';

const retained = await captureFredOperatingSource({
  directory: '/private/customer/economic-project',
  outputDirectory: '/private/handover/economic-source',
  capturedAt: '2026-10-13T06:00:00.000Z',
  publicationIds: null
});

```

The timestamp above is an example; set it to the actual capture time. A null publication selection carries every original operation view and every completed edition archive. An explicit array chooses original publication operation IDs. All listing pages are consumed. Incomplete operations retain their original state and view with a null artifact. Completing them remains an explicit action in their original workspace.

The source directory contains:

- `source.json`: complete project inventories, all operation-prefix checkpoints, publication views, exact artifact descriptors and result references.
- `project/project-bundle.json`: the original complete native versioned FRED bundle, including observations, reviews, briefing reports, recurrence, release plans, DDP, ALFRED and QCEW where present.
- `published/<operation-id>/edition-package.tar.gz`: the original complete current-publication archive, copied byte for byte.
- `MANIFEST.json`: exact file paths, lengths and SHA-256 identities.
- `SELECTION.json`: the retained original capture request and frozen publication views.

Capture returns `source`, `sourceFile`, `manifestFile`, `directory`, `projectDirectory: null` and `reused`. The file descriptor returned as `sourceFile` is the selected receiving identity. Keep it with the package.

Current-publication editions are separate from ordinary FRED project export. Each original archive includes the programme inputs, complete original table files, complete row/report files, its original native project and edition manifest. Their source mode and time basis remain the original returned values.

## Inspect and receive

```js
import {
  inspectFredOperatingSourcePackage,
  receiveFredOperatingSource
} from './source.mjs';

await inspectFredOperatingSourcePackage({
  directory: '/private/handover/economic-source',
  expectedSource: retained.sourceFile
});

const received = await receiveFredOperatingSource({
  sourceDirectory: '/private/handover/economic-source',
  destination: '/private/customer/received-economic-source',
  expectedSource: retained.sourceFile,
  plan: completeOperatingPlan
});

```

Inspection reads every selected file and verifies its exact byte identity. It recomputes the descriptor, full inventories, result pointers and complete operation-prefix history from the original bundle.

Receiving uses the original native FRED receiver. The editable native project opens at `received.projectDirectory`, under `project-workspace/`. Completed publication archives are retained, safely extracted into `published-workspaces/<operation-id>/`, and attached through the original completed-programme API. This restores the native report/file browser without collecting observations again. Original request views remain in the source descriptor; the local attachment retains its own valid receiving request.

The optional complete Operating Plan is checked against the carried project lineage before receiving. It is merged with `OPERATING-PLAN.json` through the same prefix-history rules as the editor. A later customer revision remains current when an older plan is received. Divergent histories raise the original receiving conflict. The source receiver never recreates a customer-removed step.

The returned complete receiving result includes `sourceFile`, `manifestFile`, `receiptFile`, `projectDirectory`, completed publication receipts and the retained plan. `RECEIVED.json` retains the fixed source/edition receipt. Original project continuation details remain in `projectReceipt`.

## Continue the same work

Repeat the exact original capture or receive selection in the same destination. Already retained files must have the same bytes. Interrupted extraction checks each retained member before continuing. A completed local publication must match the original result and complete archive.

The descriptor's initial history checkpoint hashes the original project ID and creation time. Every following checkpoint hashes its predecessor and the complete original operation body, including results and abandoned operations. Plan bindings therefore need only the original project ID, revision and checkpoint. The full original chronology remains in the native bundle; the plan can accept later outcomes only from that same history.

## Capacity and private source contexts

Descriptors and manifests each accept up to 32 MiB. The original native project bundle accepts up to 480 MiB, within its own schema's existing limit. The complete selected package accepts up to 4 GiB. Each expanded original publication edition is also limited to 4 GiB. Limits fail explicitly and never truncate inventories or observations. Select a smaller set of complete publication editions when needed; the selected economic project is always complete.

When the existing QCEW export or receive requires private original source contexts, pass its original `qcewSourceContexts` Map through unchanged. Credentials are not added to the handover. The retained project preserves its existing environment-variable binding.

The archive reader accepts the original regular-file USTAR format. It validates original checksums, exact member names, lengths, hashes and complete inventory, and rejects links, redirecting directories and extra files.
