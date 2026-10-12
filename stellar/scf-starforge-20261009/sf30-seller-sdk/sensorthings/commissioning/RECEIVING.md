# Complete original commissioning and receiving programme

`receiving/receive.mjs` operates one original reference from source intake through actual FROST writes, review, correction, compensation, browser operation and complete receiving. It is a persistent operation with retained requests and phase receipts. It uses the same production workspace, original native worker, HTTP host and portable implementation used by the operator.

The operation ID is:

~~~text
DATACOVE-SENSORTHINGS-COMMISSIONING-0C7A-20261012
~~~

The original Hamburg source operation is:

~~~text
SCF_SENSORTHINGS_HAMBURG_NATIVE_1B40_20261012
~~~

## Inputs

| Input | Required identity and meaning |
| --- | --- |
| Complete application tree | Exact selected source commit and a complete file manifest. The executing receiver must belong to that same canonical tree. |
| Original Hamburg recording | 2,965,230 bytes; SHA-256 `34fb0322092a51525e94beda0d6c3b21548b7261d65d80909b27eb6fa6a2d466`; 28 original response bodies. |
| Native Python runtime | Completed `stellar-forge.frost-client-runtime.v1` receipt for original FROST-Python-Client 1.1.53 at `9f41f7794725fced63fcb07e6b33dbc1f897f2bc`. |
| Private target | Original `stellar-forge.frost-reference-target.v1` receipt with its actual loopback FROST service and selected project. |
| Original operator/browser programme | Its source file belongs to the selected complete manifest and exports `receiveBrowser`. |
| Actual browser runtime | Existing Chromium executable and Playwright module path on that host. |
| Operator | The responsible reviewer name retained in this reference operation. |

The two retained Hamburg windows each contain the same 660 unique categorical observations in their accepted source editions. They are not 1,320 different observations. The programme reuses the original source bytes and does not reacquire the public feed.

The source limitations remain explicit. A connector response recording does not establish provider snapshot semantics or missing transport metadata. The known review dispositions retain those limitations; an unrecognized finding stops for source review.

## Complete source manifest

Supply a JSON manifest with exact repository-relative member paths:

~~~json
{
  "source_ref": "ACTUAL_40_CHARACTER_COMMIT_SHA",
  "files": [
    {
      "path": "stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/commissioning/receiving/receive.mjs",
      "git_blob": "ACTUAL_ORIGINAL_GIT_BLOB_SHA",
      "sha256": "ACTUAL_COMPLETE_FILE_SHA256",
      "bytes": 0
    }
  ]
}
~~~

This fragment describes the shape, not a usable one-file manifest. Use the full published application and dependency closure, including the original Hamburg receiver, private store, source adapter, commissioning implementation, HTTP host, browser programme and selected browser assets. Each file needs at least its original Git blob or SHA-256; a provided byte count is verified too. The manifest itself belongs to the operation input and should not contain a recursive self-hash.

The programme validates the complete selection before native writes and again on resume. It rejects a receiver imported from a different source checkout, a changed runtime receipt, another target receipt, a changed operator or a browser module outside the source manifest.

## One invocation

After [RUNTIME.md](RUNTIME.md) has returned the actual client and target receipts and the original asset build is complete:

~~~sh
/absolute/node /absolute/merchant-source/stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/commissioning/receiving/receive.mjs \
  --operation /absolute/private/datacove/complete-reference \
  --source-root /absolute/merchant-source \
  --source-manifest /absolute/private/datacove/source-manifest.json \
  --source-ref ACTUAL_40_CHARACTER_COMMIT_SHA \
  --recording /absolute/original/native-recording.json \
  --runtime-ready /absolute/private/datacove/runtime/runtime-ready.json \
  --target-receipt /absolute/private/datacove/reference-target/target.json \
  --operator "Selected receiving engineer" \
  --acknowledge-reference-writes \
  --browser-module /absolute/merchant-source/stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/commissioning/receiving/browser.mjs \
  --chromium /absolute/existing/chromium \
  --playwright /absolute/existing/playwright-module \
  --max-wait-seconds 7200
~~~

Replace the commit, file and runtime selectors with their actual retained values. The acknowledgement applies only to this selected private reference target. The programme rejects a public or differently shaped target receipt. Customer production work follows the operator's explicit target and reviewed plan.

The exported API accepts the same selection as `receive({operation, sourceRoot, sourceManifest, sourceRef, recording, runtimeReady, targetReceipt, operator, acknowledgeReferenceWrites:true, browserModule, chromium, playwright, resume, maxWaitSeconds})`.

The single process keeps `receiving.lock` until both workspaces and their actual native workers have drained. An already owned operation cannot be started again by another controller.

## Sixteen retained phases

1. Verify complete source, actual runtime and private target selections, then copy the exact original recording and receipts into private custody.
2. Receive the original two Hamburg editions through `receiveHamburg`, preserving the original response bodies and 660-row identities without another provider request.
3. Retain explicit review of the known original source-quality limitations. A new finding requires an actual review.
4. Create the commissioning project, retain all selected source rows, and bind the reviewed private target.
5. Inspect the actual target root through the original native client.
6. Retain the complete mapping, prepare its native entity graph, and approve the exact source/target plan.
7. Execute the original create operation, request cancellation after observed completed progress, and resume that same job when needed. If the job already finished before cancellation, retain that actual outcome.
8. Verify all selected original fields and resolved relationships against the target.
9. Inspect the full current target and retain one explicitly authored Thing-description correction with its source and derivation.
10. Review and execute that correction, then verify the changed field through the original client.
11. Compensate the correction by restoring the original description. This reference restores one changed value and deletes no baseline entities.
12. Verify the original 660-observation result again, retain its review, and save the actual source-bound map.
13. Prepare and verify the complete original project handoff, including every historical source, mapping, plan, review and native object. This remains the retained `14-complete-handoff` phase.
14. Operate the complete authenticated original browser against the already-open workspace and server, including downloading that complete original handoff. This remains the retained `13-original-operator-browser` phase. The browser does not create a second workspace, server or commissioning job.
15. Receive it in a fresh workspace; repeat it idempotently; retain a receiving review; return the compatible later project to the original workspace; then confirm that older and repeated packages preserve the later accepted history.
16. Close and reopen both workspaces, verify their complete retained object closure and original complete native outcomes, and confirm that receiving caused no native target replay.

The browser phase is implemented by [receiving/browser.mjs](receiving/browser.mjs); [the complete browser guide](receiving/BROWSER.md) describes its selected source/plan/native/map/history pages, draft reopen, actual downloads and desktop/mobile operation. The execution order above preserves all existing phase IDs and gives the browser a real completed package to receive.

These are full application operations. They do not replace original engine behavior with fixtures or fabricated provider results.

## Resume the same operation

Add `--resume` to the identical invocation and retain the same private directory, source manifest, runtime, target and browser selection.

Every action request is persisted before dispatch. The original operation ID and payload survive a controller interruption. A revision-only rejection before a reservation may refresh the expected revision while retaining its original payload and prior preflight record. An invoked or uncertain target effect is not retried through that path.

An unfinished native write with a saved successful response is completed from that response. An uncertain effect remains awaiting explicit reconciliation; its original resolution and result transition are retained together. Cancelling, compensating and importing an earlier package remain separate explicit actions.

The receiver reopens its original phase receipts. The same final timestamp is committed before publishing its immutable customer result, so a loss between publication and final state save reuses the exact original result. Both complete named delivery archives are read and hashed again before final completion, even on a fully replayed phase sequence. The same final check also verifies the complete browser artifact inventory and closed-browser result. Browser replay keeps its first selected package and original completed result when later project exports are added.

## Complete outputs

The private operation contains:

| Location | Contents |
| --- | --- |
| `operation.json` | Stable selection, current phase, phase identities, decisions and actual terminal state. |
| `inputs/` | Original recording and exact selected runtime, target and source-manifest receipts. |
| `requests/` | Original action requests, actual results and any retained revision preflight continuation. |
| `phases/` | Immutable completed phase results. |
| `browser/` | Original browser binding and selected project/source/job/package, completed result, per-attempt actual downloads and six viewport images. |
| `primary-workspace/` | The actual commissioning workspace and its private native custody. |
| `receiving-workspace/` | Independent receiving workspace with the same reviewed project history. |
| `delivery/*.ndjson.gz` | Complete original and receiving-reviewed project packages, with their original names and byte/SHA identities. |
| `delivery/DERIVATION.json` | Exact original field and explicitly authored correction provenance. |
| `delivery/FINAL-MAP.json` | Final original source-bound native map results. |
| `delivery/CUSTOMER_RESULT.json` | Compact actual completion, input/source/runtime identity, job outcomes, receiving results and final artifact hashes. |

The packages are NDJSON gzip, not tar archives. Receive them through the maintained commissioning handoff action. The portable implementation includes complete historical source and native custody, original source editions, editable application and build recipe, plus selected browser assets and license identities. It excludes host authorization values from the portable project.

The final customer result is created only after all sixteen phases succeed and both complete delivery archives and every completed browser artifact still match their retained identities. A queued, interrupted or pending run is not a successful result. Keep the private journal and browser session material in operator custody; share the complete intended handoff and its path-safe customer result through the original case.
