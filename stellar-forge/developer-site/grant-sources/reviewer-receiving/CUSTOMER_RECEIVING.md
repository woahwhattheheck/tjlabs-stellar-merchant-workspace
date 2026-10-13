# Reviewer customer receiving and continuing work

The Reviewer opens an existing purchase, keeps its original quote history and complete files, and carries that work into another operator's workspace. Use the Workbench for the original packet and Buyer, the typed Merchant interface for repeatable file delivery, and the Merchant Console for customer profiles, saved requests and reviewed workflows.

The completed receiving records in this release use the unchanged original purchase. They add **zero payment transactions**. Original outcomes, unsuccessful observations, attempt counts and source documents remain part of that purchase.

This is the public evidence edition of the complete customer receiving guide. [README.md](README.md) identifies its exact original source, the maintained installed product and the complete runtime requirements. The six evidence files in this directory are not a standalone installation: the recovered-source runner also requires its original installer, runtime requirements and all thirteen source parts. [RECEIVING-RELEASE.json](RECEIVING-RELEASE.json) preserves the dated results and checkpoint digests while omitting private storage locators.

## 1. Choose the work you are opening

| What you have | Next step | Identity to keep |
| --- | --- | --- |
| The saved current receiving directory | Continue its original runner or open its existing workbench and Merchant configuration | Run, selections, original request UUIDs, revisions and complete result hashes |
| A complete exported reviewer packet | Review its actual bytes in a separately configured receiving workbench, receive that review, then open its saved Buyer | Original packet, quote and result identities; the receiver has its own local review and action history |
| The complete source and original purchase, but no saved editable workspace | Restore the source and run a clearly identified new nonpaying receiving operation | Exact original purchase; a new operation identity |
| A full private filesystem checkpoint | Verify the complete archive and every manifest member before restoring the recorded layout | Original native databases, workbench and operation locations, source/runtime binding and checkpoint hash |

A filesystem checkpoint and a portable reviewer packet are different inputs. The checkpoint preserves the recorded native directory and its history, including absolute location bindings. The packet is the application's supported exchange for another configured workbench. Opening a result summary alone cannot recreate the native database.

For a checkpoint restored to its recorded layout, retain all native regular files and database companions together. Check every path, length, hash and mode against checkpoint-manifest.json. Reject traversal paths, duplicate members, unexpected files and symbolic links in archive data. The nine runtime links in the completed checkpoints are declared references, not bundled packages; select and verify their original installed dependencies before reopening. Do not blindly create links to whatever happens to occupy an old path.

If the recorded source/runtime locations are unavailable, keep that checkpoint intact and use the complete original packet through the supported independent receiving path. This release does not silently rewrite absolute native history into a different filesystem layout.

## 2. Install the complete source once

Authorized operators continuing the original recovered-source runner obtain the entire authenticated source directory at commit b9d4636efe76311666d308dd4323210d4185bd7c, including its installer, requirements and all thirteen required-source parts. The following link identifies that private origin; public installation uses the maintained full product described in [README.md](README.md):

https://github.com/woahwhattheheck/commons/tree/b9d4636efe76311666d308dd4323210d4185bd7c/tools/scf_review_native_resume_20261012

The complete selection is 2,377 files and 29,180,576 original source bytes. It includes the surrounding registered Merchant and Applications modules, the original developer portal assets, current forty-file reviewer edition, licenses and exact purchase. Copying only the reviewer changes does not supply its required native imports.

Choose distinct canonical absolute source and source-operation directories:

~~~sh
python /ABS_TOOLS/RECOVER_REQUIRED_SOURCE.py \
  --source /ABS_WORK/reviewer-source \
  --operation /ABS_WORK/reviewer-source-restoration
~~~

Repeat that exact command after an interrupted source copy. The installer verifies every original body and accepts only the explicitly recorded existing predecessor or current body. It retains replaced preimages and earlier complete source receipts.

Use --verify-only to check a current installation without writing. Installation is offline after the complete source directory is available. It neither opens a Buyer nor issues a payment.

## 3. Select the existing runtime

Use Node 22 or later, an actual Playwright module and Chromium executable. The accepted direct package set is recorded in RUNTIME-REQUIREMENTS.json: Stellar SDK 16.3.1 and x402 2.28.0 are exact selections. The runner can join exact packages from more than one installed node_modules root without copying a fleet-wide toolchain.

~~~sh
python /ABS_TOOLS/RUN_RECOVERED_REVIEWER.py \
  --source /ABS_WORK/reviewer-source \
  --operation /ABS_WORK/reviewer-receiving \
  --node /ABS_RUNTIME/bin/node \
  --playwright /ABS_RUNTIME/node_modules/playwright/index.js \
  --chromium /ABS_BROWSER/chromium \
  --node-modules /ABS_EXISTING_RUNTIME/node_modules \
  --through merchant
~~~

Repeat --node-modules in the actual selection order if the required packages are split between existing runtimes. The runner verifies the real package metadata and records the resulting binding. Existing credentials and peer configuration are not copied.

A host without those packages can use the documented --runtime and --npm option pair to prepare one empty owned runtime. The exact commands, normal npm installation/replay and actual lock handling are in README.md. A package download alone is not a successful native import.

The runner verifies five whole-product imports before starting a stage: Workbench, reviewer Merchant runtime, seller releases, Merchant server and Console service. This includes the original portal index, browser module and stylesheet required by the seller release code.

Keep disposable browser files in a directory owned by the current invocation. Persist workspaces, results and screenshots in the selected operation. A transient mount is not a durable checkpoint, and free disk space does not establish free cgroup memory.

## 4. Open the saved original workbench

The workbench is owned by its original controller. A connection configured with allowStart false must be opened by that owner before Merchant use. An Applications-owned workbench is borrowed; closing a Merchant client does not transfer ownership of the Applications controller.

The maintained API is startReviewerWorkbench from stellar/scf_2026/presentation/reviewer/workbench.mjs. For a private direct opening, import that exact module with the verified source root and original workbench directory. The returned startup object gives the URL and private connection-file path without printing the access token.

~~~js
import {startReviewerWorkbench} from './stellar/scf_2026/presentation/reviewer/workbench.mjs';

const workbench = await startReviewerWorkbench({
  directory: '/ABS_OPERATION/workbenches/sender',
  sourceRoot: '/ABS_WORK/reviewer-source'
});
console.log(JSON.stringify(workbench.startup));

let closing;
const close = () => {
  closing ??= workbench.close();
  return closing;
};
process.once('SIGINT', () => close().catch(error => {
  console.error(error.code ?? error.name);
  process.exitCode = 1;
}));
process.once('SIGTERM', () => close().catch(error => {
  console.error(error.code ?? error.name);
  process.exitCode = 1;
}));
~~~

Run this from the complete source with the selected Node/runtime binding. The HTTP listener keeps the process alive until its original close. If a maintained Applications controller already owns this directory, use that controller's existing opening instead of starting the example.

Read the fresh access code from the private workbench-connection.json only for this matching active instance. Enter it in the workbench's connection form. Keep it out of packet files, public URLs, logs, screenshots and source configuration. The connection code belongs to the running instance and changes after a new opening.

Review a selected packet's identity and revision before receiving. Receiving stores the original packet in the native workspace. Opening its Buyer exposes saved history, statuses and complete results. The reviewer restricts Buyer reads to the retained original quotes; this receiving workflow does not create another purchase.

## 5. Open the typed Merchant and customer Console

Declare the original and receiving workbench aliases in a private reviewer connection file. The complete connection schema and explicit allowStart semantics are in the original Merchant guide linked below. Retain the same declaration on reopen.

Initialize the existing Merchant directory through the maintained CLI:

~~~sh
node /ABS_WORK/reviewer-source/stellar/scf_2026/presentation/reviewer/merchant/cli.mjs init \
  --directory /ABS_OPERATION/merchant-client/host \
  --connection /ABS_PRIVATE/reviewer-connections.json
~~~

Use an empty directory for a first initialization or the original completed setup directory with the identical reviewed connection. Do not replace an accepted setup's connection simply to make a later invocation succeed. Initialization preserves the selected native release store.

Open the normal Merchant host with the customer Console enabled:

~~~sh
node /ABS_WORK/reviewer-source/stellar-forge/mcp-merchant-operator/serve.mjs serve \
  --config /ABS_OPERATION/merchant-client/host/merchant-mcp.json \
  --port 3211 \
  --token-env MCP_ACCESS_TOKEN \
  --operator-console-dir /ABS_OPERATION/customer-console/operator
~~~

Provide MCP_ACCESS_TOKEN through the host's private environment. The command contains the environment variable name, never its secret value. Enter the current host token in the Console connection form. It is held in browser memory and cleared on disconnect.

Choose the intended Console profile, then open **Customers → Reviewer customer delivery**. Workbench aliases and supported tools come from the actual selected Merchant configuration. Keep that host fingerprint and profile with the saved request; a different profile must not inherit a stale selection.

The normal operating sequence is:

1. Load configured aliases, select the original workbench and open its current state.
2. Review the bundled original purchase, an explicitly declared host file, or a complete uploaded receiving packet.
3. Inspect the exact review ID/revision, receive it, and open the original saved Buyer.
4. Read the original quote history and choose a quote. Retain its complete result and selected original source documents.
5. Close the Buyer for a coherent new export, then export the selected received packet.
6. Receive the export's manifest and all files into the Customer record. Download the actual packet or result from that completed record.
7. Select a distinct configured receiving workbench and review/receive that same packet there.
8. Reopen the receiver's saved history, verify the original identities and close its Buyer.

The existing UI keeps recorded calls in Requests before dispatch. The displayed preview is not a replacement for the complete response file. Source document and result exports download their original bytes; a packet export provides grant-reviewer-packet.json with its retained companion records.

## 6. Receive complete files with the CLI

The same typed client is available from the source CLI. Use the original MCP URL supplied by the running host and its private token environment. These commands can be used without the browser.

Inspect the selected immutable export:

~~~sh
node /ABS_WORK/reviewer-source/stellar/scf_2026/presentation/reviewer/merchant/cli.mjs inspect \
  --url http://127.0.0.1:3211/mcp \
  --token-env MCP_ACCESS_TOKEN \
  --workspace original \
  --export-id ORIGINAL_EXPORT_SHA
~~~

Receive every file into one retained private directory:

~~~sh
node /ABS_WORK/reviewer-source/stellar/scf_2026/presentation/reviewer/merchant/cli.mjs download \
  --url http://127.0.0.1:3211/mcp \
  --token-env MCP_ACCESS_TOKEN \
  --workspace original \
  --export-id ORIGINAL_EXPORT_SHA \
  --manifest-sha256 ORIGINAL_MANIFEST_SHA \
  --directory /ABS_PRIVATE/complete-reviewer-download
~~~

Repeat that exact download command after interruption. The receiver checks the original manifest, files and already retained ranges. Do not change export ID, manifest hash or destination identity as a retry shortcut.

Verify the completed local receiving directory without a network call:

~~~sh
node /ABS_WORK/reviewer-source/stellar/scf_2026/presentation/reviewer/merchant/cli.mjs reopen \
  --workspace original \
  --export-id ORIGINAL_EXPORT_SHA \
  --manifest-sha256 ORIGINAL_MANIFEST_SHA \
  --directory /ABS_PRIVATE/complete-reviewer-download
~~~

The values marked ORIGINAL_* come from the actual selected native return and must be saved with the work. The export ID, whole manifest hash and each file hash are different bindings.

Review the received packet into a configured independent workbench:

~~~sh
node /ABS_WORK/reviewer-source/stellar/scf_2026/presentation/reviewer/merchant/cli.mjs review-file \
  --url http://127.0.0.1:3211/mcp \
  --token-env MCP_ACCESS_TOKEN \
  --workspace receiver \
  --file /ABS_PRIVATE/complete-reviewer-download/grant-reviewer-packet.json \
  --title 'Received original purchase' \
  --request-id SAVED_REVIEW_UUID \
  --expected-sha256 ORIGINAL_PACKET_SHA
~~~

Save the review UUID before the first call and preserve it after a lost reply. Continue receiving/opening through the original returned review ID/revision using the typed client or Console. A full local reopen verifies bytes; it does not itself mutate the independent receiver's native history.

## 7. Install the reviewed operating workflow

The Console offers a fourteen-step delivery recipe and a six-step receiving-only recipe. Preparing a recipe opens the existing Workflow review; it does not dispatch its steps.

The complete delivery keeps the original workbench opening and selection, saved Buyer history/result, explicit Buyer close, immutable export/manifest, independent review/receive and final receiver close. Review the selected host's native contracts and exact workspace aliases before installation.

Retain the installed definition ID, revision, recipe digest, original selected packet, all action UUIDs and actual workflow run ID. The receiver is a distinct configured workbench. The source export UUID can refer to an already accepted export, while new lifecycle UUIDs represent an actually observed new opening or close.

Use the original Workflow pause/resume controls. If starting a run lost its response, recover the retained start action; do not create an unrelated run. Close/reopen the Console only through its original owner and continue the selected saved run after reopening.

The current twelve-phase Console programme exercises this complete workflow, interruption/reopen, full profile export and independent operator receiving. At this release snapshot, that programme has two completed phases and is not yet a completed customer-browser receipt.

## 8. Continue after interruption

| Observed event | Supported continuation |
| --- | --- |
| Source installation stopped | Repeat the same installer and source-operation directory; verify actual preimages/current files |
| A native mutation lost its reply | Open the saved Request and use **Continue exact original request** with its original native UUID, arguments and revision |
| A prior open action replays successfully but the Buyer is now inactive | Read current state, then create a distinct lifecycle intent for the same received selection |
| An export was accepted before the return was lost | Reconcile that original export UUID and immutable bytes; close any later-opened Buyer separately |
| A file transfer stopped | Resume the same export ID, manifest hash and retained destination; verify existing ranges |
| The whole receiving stage stopped | Reconcile its original child/lease and journal, then repeat RUN_RECOVERED_REVIEWER.py for the same operation |
| A process ended with -9 or a screenshot timed out | Retain the actual return code and phase history; inspect owned process closure and resource state before continuation |
| The old editable workspace is absent | Restore an exact complete checkpoint if its layout is available, or start an explicitly new nonpaying receiver from the original packet |

A live lease remains with its original owner. Do not delete locks or use a PID from an unrelated process namespace as evidence that an owner is stale. Preserve the old failed/interrupted attempt even when its later continuation succeeds.

When extending the complete receiving runner from Merchant to Console, reuse every original argument and change only the selected end stage:

~~~sh
python /ABS_TOOLS/RUN_RECOVERED_REVIEWER.py \
  --source /ABS_WORK/reviewer-source \
  --operation /ABS_WORK/reviewer-receiving \
  --node /ABS_RUNTIME/bin/node \
  --playwright /ABS_RUNTIME/node_modules/playwright/index.js \
  --chromium /ABS_BROWSER/chromium \
  --node-modules /ABS_EXISTING_RUNTIME/node_modules \
  --through console
~~~

Completed preceding stages are checked and reused. The same Console journal is continued. The full runner's final result requires all three original result bindings, exact phase counts, closed owned resources and zero new payment transactions.

## 9. Completed receiving supplied with this release

These observations belong to run **893f2ff4-9a12-4eb6-8fe2-43d57613be81**, which was created after the workspace replacement. Earlier run 9611199b-4793-400b-a85d-f1efcc3ba1e7 remains historical.

| Stage | Actual result | Full editable checkpoint |
| --- | --- | --- |
| Workbench | Fourteen phases complete; all owned browser/workbench/application resources closed; result 42,014 bytes, SHA256 073da3b2b18fe263f4bdb33dd939783d262ba16fa9fd9ed5396e08c0bbee9c82 | 1,327,915 bytes, SHA256 d6d0a9e7cdc8908eab32a0ed874795cf489ae87b8d929d29981a186dce010f5e; 96 native files and nine runtime references |
| Merchant | Twelve phases complete; owned Merchant/workbenches closed; result 28,347 bytes, SHA256 a7b05a8fee6ec80575c1a83d4c8c66202bce59f84457c8230bac04287ef922ad | 1,576,468 bytes, SHA256 173ce7f82292d64e8095cb9cdcf0979c860c10f75f176d4df86b6671229e46e3; 184 native files and nine runtime references |
| Console | Original profile and original source/intake complete; third phase interrupted with return code -9; no final Console result | The latest saved complete checkpoint is Merchant12; the active Console journal retains its two completed phases |

The completed editable checkpoints remain with the original authorized operating owner. Obtain the selected full archive through that owner's authenticated handover and verify the complete byte count, SHA-256 and member manifest shown above. This public evidence edition contains no private download URL or storage identifier.

The Merchant checkpoint includes the same operation's earlier Workbench files. Use its manifest to select the actual completed stage. Neither archive silently claims custody of Console work performed after that checkpoint.

The final finite observation found no visible Node/Chromium child. The interruption occurred while the shared cgroup reported additional OOM kills. This is the recorded operating boundary, not a Console12 PASS. The same Console continuation remains selected.

## 10. Handover contents and the next operator

Retain the following together:

- Complete source selection/index and every bounded source part.
- Actual runtime requirements, real package/version binding and native import result.
- Original purchase/packet bytes and their SHA256.
- Complete native result records and any independent receiving results.
- Native workspaces, SQLite/WAL companions, object stores, request and action histories.
- Completed file-transfer manifests, original file bodies and immutable export identities.
- Actual workflow definition/revision, installed recipe and retained run.
- Whole private checkpoint manifest, archive SHA256 and saved file identity.
- Original interrupted attempts and later continuation receipts.

A customer handover should identify what the operator can open now, which exact file is transferred and which original records it contains. A later completed Console release can add its actual result and checkpoint as a successor while preserving these completed Workbench/Merchant records.

The source and receiving work joins the existing reviewer contribution. It does not change the established 400-hour / $38,000 application request or the original 18-purchase / 411,000-stroop baseline.

## Original maintained interfaces

- [Merchant provider, typed client and connection guide](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/e1f679aea37c9dd34c72acc43121ffa870e83cd3/stellar/scf_2026/presentation/reviewer/merchant/README.md).
- [Customer Console workflow, recipes and response recovery](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/e1f679aea37c9dd34c72acc43121ffa870e83cd3/stellar-forge/mcp-merchant-operator/console/CUSTOMER_REVIEWER.md).
- [Complete reviewed source and native runner](https://github.com/woahwhattheheck/commons/tree/b9d4636efe76311666d308dd4323210d4185bd7c/tools/scf_review_native_resume_20261012).
