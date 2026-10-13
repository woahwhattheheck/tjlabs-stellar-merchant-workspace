# Native BLS publication and customer receiving

The BLS analyst workspace saves `native-receive` as one original workspace operation. Its controller opens the existing BLS publisher, uses its retained source capture and complete projection contract, publishes through the original dataset version store, and can finish the original SF88 acquisition and Vitality import. The browser, typed client and command line use the same saved request.

## Run the saved operation

Select the source edition in the analyst workspace and record its complete `source_sha256`. Supply the actual reviewer and the source review note. Select any of `laus`, `qcew` and `source_files`; receiving the original raw sources requires `source_files`.

An original request file is:

```json
{
  "id": "nek-bls-native-20261012",
  "input": {
    "source_sha256": "b571a04919fb50655e1fac2810d7eecc9473196024371676cf8783d211d0cc49",
    "projections": ["laus", "qcew", "source_files"],
    "reviewer": "Actual operator name",
    "note": "Reviewed the complete selected NEK source edition and its source receipts."
  }
}
```

The hash above identifies the existing 4BF5 native source declaration. Use the hash returned by the selected analyst workspace when its imported declaration has a different complete identity. The capture identity remains attached to the original capture. Save private files with mode `0600` and workspace directories with mode `0700`.

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/bls-labor/workspace/native-receiving.mjs \
  --workspace /absolute/original/bls-workspace \
  --request /absolute/original/request.json \
  --connection /absolute/original/bls-native.connection.json
```

The command uses Node with the repository's `node:sqlite` support and Linux `flock`. Its stdout is one complete `stellar-forge.bls-native-receiving.v1` JSON result. Native errors go to stderr. The analyst workspace runs this command under its saved operation, while its SQLite owner remains open. It closes the selected publisher children first so the controller can acquire those original publisher leases.

## Original plans, runs and publication

Without `input.existing`, the controller pages through the complete saved publisher plan/run history and selects an original plan matching the full source SHA, capture SHA, projection and full column contract. Published runs are preferred. Complete candidates from interrupted runs are recovered through the original publisher. An extraction with no complete candidate retains its failed attempt and starts a new run under the same analyst operation.

To select a particular retained plan or run, add `existing` keyed by projection:

```json
{"existing":{"laus":{"plan_id":1,"run_id":"00000000-0000-4000-8000-000000000001"}}}
```

Replace the illustrative IDs with the IDs from that workspace's original publisher history. All selected plans are checked against the requested complete source and full projection contract.

The controller records review request UUIDs before invoking the original idempotent review API. Publication uses the publisher's current snapshot/revision binding. A saved review is reused while that binding still matches. On restart, the original target is observed and an uncertain completed publication is recovered before another publication. A current source edition is never inferred from only its row count.

## Host connection

`bls-native.connection.json` is local host configuration, excluded from the analyst project's transferable archive. Browser requests carry source, publication and receiving choices; executable paths, account/session selection and seller configuration come from this file.

```json
{
  "schema": "stellar-forge.bls-native-connection.v1",
  "publishers": {
    "source_files": {
      "seller_file": "/absolute/original/source-files-seller.json",
      "runtime": {"port": 43120}
    }
  },
  "customer": {
    "checkout": "/absolute/original/merchant-checkout",
    "session": "/absolute/original/sf88-session",
    "python": "/absolute/python",
    "node": "/absolute/node",
    "delivery": "/absolute/original/sf100-delivery",
    "sources": "/absolute/original/received-bls-sources",
    "timeout": 360,
    "continue_acquisition": true,
    "vitality": {
      "source": "/absolute/original/vitality-source",
      "workspace": "/absolute/original/vitality-workspace",
      "operator": "Actual operator name",
      "catalog": "/absolute/original/vitality-catalog.json",
      "only": ["laus", "qcew-50005", "qcew-50009", "qcew-50019"]
    }
  }
}
```

Declare `publishers.laus` and `publishers.qcew` in the same shape when those existing targets need to be started or their seller releases are requested. `release_directory` can select an existing original staged SF82 release instead of preparing a runtime release from an already published run. An explicitly requested new release still uses `seller_file`.

A running original dataset service is reused. For a stopped store, the controller opens the actual versions, selects a retained published run with that exact query contract, prepares its original SF82 release and starts the same store. The contract may be carried by an earlier published version while an interrupted refresh is being reconciled. An existing staged release is also accepted after the original release inspector verifies it and its target.

Use the original customer session's listener port when the controller starts its seller. A port of zero is suitable when no existing buyer session depends on a fixed listener. Declare the original facilitator URL in `runtime.facilitator` when the seller requires it; local facilitator use follows the existing SF82 `allowLocalFacilitator` setting.

Connection edits are retained as a sequence of configuration hashes in the original native state. Correcting a host runtime path or port can therefore resume the same operation. Every selected publisher, source capture, candidate, target and received source still passes the original engine's identity checks.

## Complete customer receiving

Add `"receive":"sources"` to reconstruct the complete original raw files and capture manifest from the existing SF88 session's delivered `source_files` pages. Add `"receive":"vitality"` to then load those exact files through the original Vitality catalogue and `Workspace.import_source`.

`customer.continue_acquisition: true` first calls the original session's `DatasetAcquisition.run()`. That setting continues the existing host-selected acquisition. The adapter then calls the original `receive_acquisition`; its output must match the requested capture SHA. If the acquisition is already complete, omit the continuation setting and reuse its original delivery.

The selected original checkout supplies `stellar_forge_buyer.datasets`. The adapter checks the module's resolved path, uses the original customer session, preserves all delivered pages and invokes the original BLS and Vitality importers. Each customer attempt retains its complete stdout and stderr separately; its capture identity and receiving result are joined into the analyst operation.

For the selected NEK capture, native receiving should retain the complete LAUS and QCEW source files, definitions and capture receipts. The original county projections contain 408 LAUS rows and 96 QCEW rows across counties 50005, 50009 and 50019. LAUS resident measures, QCEW workplace measures, monthly/M13 periods, suppression and original value text remain part of their full native contracts.

## Releases, resuming and project handover

Add `"releases":["laus","qcew","source_files"]` to prepare selected published seller releases. The original SF82 preparer and inspector retain the dataset CSV, config, source provenance, binding and seller configuration. Each publication has its own retained release directory.

Under `native-publications/OPERATION_ID/`, the controller retains the original request, atomically updated state, complete native publisher IDs, previous reviews, extraction attempts, optional original release packages, optional customer returns and final result. Repeating the completed request returns its saved result after checking its recorded hash. Changing the request requires another saved analyst operation.

Before returning completion, the controller closes every dataset runtime it started and then releases its native operation lease. Services already running before the operation remain owned by their original host. Closing owned services makes their native files available to the analyst workspace's complete project export. The workspace exporter retains the original publisher stores, versioned datasets, capture files and operation histories; host connection paths are configured separately on the receiving host.

The analyst workspace tracks the native child as an owned process group. Closing or interrupting the workspace sends termination to that group, waits for the original controller to close its services and leases, and finishes the worker before closing the analysis database. A process that does not finish after 30 seconds is killed as the same owned group; its saved request and native state remain available for recovery.

When a project is received in another directory, existing release packages and completed operations retain their original bindings as history. An interrupted operation prepares any needed runtime release under a name that includes the current target-directory identity. A retained review is reusable only when its candidate, current target directory and version binding still match. The new local release and review therefore coexist with the original packages and review history. Configure the receiving host's local seller and customer connection before continuing its native operation.

Use the analyst workspace's original project receiving command to reopen a full exported archive in a separate directory. Its archive manifest and saved reports provide the comparison for the original source and operation history. A received completed native operation remains an historical result; any further publication or customer acquisition is a new explicitly selected operation in that workspace.
