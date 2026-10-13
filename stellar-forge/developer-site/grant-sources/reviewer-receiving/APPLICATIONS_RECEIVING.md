# Continue the Reviewer through maintained Applications

This receiver takes a completed Reviewer Workbench and Merchant operation into the maintained Applications controller. It uses the existing received workbench and an explicitly selected, completed runtime installation. It keeps the original Workbench and Merchant result files unchanged and writes a separate Applications journal and result.

The operating path is complete: review and save the application, adopt the selected runtime, start the original workbench, reopen the controller around that same running application, read both complete saved results, stop the original application and Buyer, retain a prepared restart before dispatch, reopen and recover that exact start request, read the same original results through a new private instance, and close/reopen the saved application and release.

This entrypoint does not prepare a runtime or install dependencies. Runtime preparation, installation, adoption, transfer and receiving remain the maintained distribution's existing operations. The application uses the original saved purchase and performs no new payment transaction.

## Why this has its own result

The older optional invocation of WORKBENCH_RECEIVING.mjs with --runtime-directory extends WORKBENCH-RESULT.json. That is appropriate before downstream consumers select the result. Once Merchant and Console have pinned the completed result's digest, extending that file changes their selected input.

APPLICATIONS_RECEIVING.mjs leaves both completed parents intact:

- WORKBENCH-RESULT.json
- merchant-client/MERCHANT-RESULT.json

It retains exact copies under managed-applications/source and records the original run ID, byte counts and SHA-256 values. Its own output is managed-applications/APPLICATIONS-RESULT.json. The original receiving operation, received workbench, packet, quote IDs and Merchant result remain the parents of this additional application lifecycle.

The existing pending Console continues through RUN_RECOVERED_REVIEWER.py --through console. This Applications receiver uses the same operation/controller.lock as the existing native receiving carriers. Run one owned stage at a time.

## Select an actual completed runtime

Use a runtime prepared and completed by the maintained distribution installer. A node_modules directory alone is not an installation descriptor. The selected directory must pass inspectMerchantRuntime, including its original runtime-install plan, frozen profile, package lock, exact source manifest and READY state.

The dependency selection used by the completed Workbench and Merchant receiving is not, by itself, proof of such an Applications installation. Obtain the actual retained installation directory from its current owner or from the existing Runtime workspace's saved runtime selection.

For a read-only inspection using the delivered source:

    export SCF_SOURCE=/absolute/path/to/the/verified/source
    export READY_RUNTIME=/absolute/path/to/the/original/completed/runtime
    export NODE=/absolute/path/to/node

    "$NODE" --input-type=module -e '
      import {pathToFileURL} from "node:url";
      import {join} from "node:path";
      const [source,directory]=process.argv.slice(1);
      const {inspectMerchantRuntime}=await import(pathToFileURL(join(source,
        "stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs")));
      const value=await inspectMerchantRuntime(directory,{load:false});
      process.stdout.write(JSON.stringify(value,null,2)+"\n");
    ' "$SCF_SOURCE" "$READY_RUNTIME"

This inspection is read-only. It returns the actual installation ID, profile identity, lock digest, source commit and manifest digest. The receiver records those values on its first accepted attempt and requires the same selected installation on continuation.

The installation must contain the maintained grant-reviewer application provider. A missing provider or an installation that is not READY is a concrete input error. Continue the original installation or select the correct existing installation; do not fabricate runtime-install.json or mark a dependency directory READY.

The maintained runtime-workspace CLI can also expose the original saved runtime handoff:

    "$NODE" "$SCF_SOURCE/stellar/scf-starforge-20261009/distribution/runtime-workspace/cli.mjs" \
      handoff --workspace /absolute/existing/runtime/workspace --runtime-id ACTUAL_SAVED_RUNTIME_ID

Its saved selection remains owned by that runtime workspace.

## Run against the completed parents

The receiver is delivered beside RECOVER_REQUIRED_SOURCE.py and RUN_RECOVERED_REVIEWER.py under tools/scf_review_native_resume_20261012.

Select the exact completed parent digests before dispatch. Do not substitute a different result under the same operation path.

    export OP=/absolute/path/to/the/original/reviewer/operation
    export MAINTAINED_TOOLS=/absolute/path/to/tools/scf_review_native_resume_20261012
    export PLAYWRIGHT=/absolute/path/to/playwright/index.js
    export CHROMIUM=/absolute/path/to/chromium

    "$NODE" "$MAINTAINED_TOOLS/APPLICATIONS_RECEIVING.mjs" \
      --operation "$OP" \
      --source-root "$SCF_SOURCE" \
      --runtime-directory "$READY_RUNTIME" \
      --playwright "$PLAYWRIGHT" \
      --chromium "$CHROMIUM" \
      --workbench-sha256 EXACT_COMPLETED_WORKBENCH_SHA256 \
      --merchant-sha256 EXACT_COMPLETED_MERCHANT_SHA256

The source directory is the verified full required source selection, including the Reviewer, maintained Runtime workspace, release runtime package and application provider. The new receiver dynamically loads those maintained modules from this selected source.

For the restored nonpaying operation 893f2ff4-9a12-4eb6-8fe2-43d57613be81, the completed parent identities are:

| Parent | Bytes | SHA-256 |
| --- | ---: | --- |
| Workbench14 | 42,014 | 073da3b2b18fe263f4bdb33dd939783d262ba16fa9fd9ed5396e08c0bbee9c82 |
| Merchant12 | 28,347 | a7b05a8fee6ec80575c1a83d4c8c66202bce59f84457c8230bac04287ef922ad |

Those two stages have full editable checkpoints. Their details remain in CUSTOMER_RECEIVING.md and RECEIVING-RELEASE.json. The Applications extension described here has not yet been executed. The Console continuation remains separately pending; this document does not replace its result or claim that its twelve phases have completed.

The 01:35 UTC release record deliberately remains an as-of record of Workbench14, Merchant12 and the Console's first two phases. Applications acceptance requires its own actual result.

## What the receiver checks and retains

Before operating, it reads the complete original Workbench and Merchant results and verifies the explicit digests supplied in the command. It requires both to be COMPLETE, with their owned resources closed and zero new payments. The Merchant result must name the same Workbench run and exact Workbench digest.

It derives the received workbench, selection, exported packet digest, original quote IDs and both full result file identities from those completed parents. It verifies the original workbench header before passing that directory into Applications. It creates no replacement workbench or substitute purchase.

The maintained runtime inspection supplies the selected installation binding. The existing receiveManagedGrantReviewer implementation then owns:

1. Attaching the selected completed runtime.
2. Reviewing and saving one grant-reviewer application with a retained save request UUID.
3. Connecting that application to the original adopted release.
4. Starting the original received workbench and reopening its controller around the same running instance.
5. Stopping that original application and waiting for the original Buyer/workbench ownership to close.
6. Retaining a new PENDING start request, closing/reopening the controller, and recovering the same prepared request.
7. Confirming a new private instance and access code while retaining the original workbench and packet identities.
8. Stopping the original prepared restart and reopening the same saved application/release in a closed state.

At each of the two running instances, the receiver uses the real Reviewer UI to select the retained packet and read/download both complete saved result files. It verifies each file against the original byte count and SHA-256, reads the original native quote status, and captures the results and handover views at desktop and narrow widths.

The browser's modifying workbench requests retain their original request UUIDs before dispatch. Opening a later private instance uses that actual instance identity in its lifecycle request binding. Read-only native MCP calls are limited to the Reviewer's existing history, results, status and saved-result methods.

This programme keeps the Buyer open at the end of each live review so that the maintained Applications Stop must close the actual original application and Buyer. It does not replace that closure with a disconnected page.

## Retained layout

All persistent output stays under the original operation:

    managed-applications/APPLICATIONS-STATE.json
    managed-applications/APPLICATIONS-RESULT.json
    managed-applications/source/WORKBENCH-RESULT.json
    managed-applications/source/MERCHANT-RESULT.json
    managed-applications/downloads/
    managed-applications/screenshots/
    applications/

The applications directory is the existing Runtime workspace owned by the maintained receiving implementation. It holds the saved runtime/application records, original operation IDs, adoption and run histories. The managed-applications directory holds this receiving programme's original inputs, actions, attempts and observations.

Disposable Chromium data is created in a uniquely owned temporary directory under the selected process TMPDIR. After browser closure, the receiver removes only that directory. Set TMPDIR/TMP/TEMP to an appropriate temporary mount in the same invocation when needed. Persistent results, screenshots, original workbench files and receiving journals remain in the operation directory.

Private access codes stay in the live connection and browser session. They are not put in command arguments or the public result. The programme records the maintained helper's access-code digest and instance identity for rotation checks. Treat original runtime/application connection files and the full editable checkpoint as private working state.

## Resume the same accepted operation

Repeat the same command with the same operation, source, parent digests and runtime directory. Do not create a fresh operation or application solely because a response was interrupted.

The receiving state pins the full runtime identity and original parent results. The existing maintained helper reuses the saved application request, current original run and prepared restart UUID. It reconciles a surviving run through the existing Applications controller and waits for its original Stop.

Attempts retain their own browser errors and closure outcomes. A failed close cannot produce a COMPLETE receipt. Cleanup attempts page, context and browser closure independently; the managed helper separately retains its application/controller cleanup outcomes.

A published Applications result is reconciled before a new launch. Replay verifies the completed six lifecycle milestones, all recorded complete result files and screenshots, and the unchanged Workbench/Merchant parents. It returns REUSED_COMPLETE without stopping or opening an application. That historical completion receipt is not presented as a claim that a later user-started process is currently closed.

If result publication succeeded but the final state update failed, the next invocation verifies that exact result and repairs only this receiving state. If the final result does not exist, it continues the same saved helper record and original runtime operation.

Do not remove controller locks based on an old PID. The maintained kernel leases and Applications recovery own the live process decision.

## Runtime transfer and independent receiving

A runtime installation and a Reviewer packet are different objects:

- The Reviewer packet carries original query configuration, quote identities, saved result bytes and their recorded outcomes.
- The maintained runtime transfer carries the selected distribution source and lock-bound dependency cache.
- A complete private checkpoint carries the editable operator/application/run histories and original layout.

Use the distribution's existing runtime-transfer and Runtime workspace operations for a receiving machine. The source already provides reviewRuntimeTransfer, exportRuntimeTransfer, inspectRuntimeTransfer, beginRuntimeTransferReceive, receiveRuntimeTransferPart, completeRuntimeTransferReceive and installReceivedRuntime. The Runtime workspace CLI exposes transfer-review, transfer-operation, transfer-attach and transfer-continue over their original retained operation IDs.

Do not label a copied node_modules tree as a completed transfer. The receiving runtime must pass its original manifest, source, lock and native load checks. Its new installation identity is a separate explicit receiving selection; it does not silently replace the installation already pinned by an Applications receiving journal.

For the Reviewer packet itself, retain the complete exported packet file and its SHA-256, review it in the receiving workbench, and receive it using the original explicit request. CUSTOMER_RECEIVING.md describes the full customer workflow and typed file client. An independent machine may have new local workbench/application IDs while preserving the packet's original quote IDs and complete result bytes.

The existing Workbench and Merchant checkpoint archives preserve their original absolute layout and external runtime references. They are not a relocatable runtime bundle. Retain the new applications and managed-applications directories in the next complete private checkpoint once this extension has actually completed.

## Completion and delivery

Accept the extension when APPLICATIONS-RESULT.json exists, verifies against the state and original parent hashes, and contains:

- state COMPLETE;
- the same original Workbench run and exact Workbench/Merchant input digests;
- the actual selected installation, source/profile/lock identities and saved application ID;
- saved, connected, retained_launch, original_stop, prepared_restart and closed_reopen milestones;
- both complete original result files from both private instances;
- retained desktop/narrow screenshots and current-attempt error observations;
- ownedBrowserClosed true;
- managed cleanup with ownedApplicationClosed and managedControllerClosed true;
- parentReceiptsPreserved true and newPaymentTransactions zero.

Report an unfinished original runtime, pending launch, interrupted capture or failed cleanup as its actual state. Preserve the historical Workbench/Merchant results and the original Console journal. Publish the new Applications acceptance only after the actual installed-runtime journey and complete private checkpoint are available.

This addition does not change the grant request of 400 hours / $38,000, the original 18-purchase / 411,000-stroop baseline, or any existing compensation claim.
