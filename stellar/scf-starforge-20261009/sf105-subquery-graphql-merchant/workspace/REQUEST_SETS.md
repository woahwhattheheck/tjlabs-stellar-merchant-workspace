# Saved GraphQL request sets and connected runs

Use this workflow to keep the selected operation/variable cases for an engagement, run them through the original connected source, review the actual returned responses, and hand the complete project to another operator.

A request set contains 1–32 named cases. Each case names an already approved operation and supplies its bounded variable values. Preparing the set uses the same schema, operation and variable admission as the original single-preview action. The set freezes the saved source revision, exact query, variables, source identity and authorization **environment name**. It makes no provider request.

A run selects cases from that immutable set. It allocates each case's original preview UUID before dispatch, then uses the existing SF105 preview handler and workspace writer. Each returned body, HTTP status, native response identity and observed time stays in that original preview. Baseline/candidate selection feeds the existing response comparison and reviewer workflow.

## Browser: complete engagement flow

1. Open the installed **GraphQL merchant workspace**, capture or load the actual source schema, and save the original approved queries and merchant plan. Use the existing field editor and admission review to select the operations you intend to exercise.
2. In **Saved request sets and runs**, choose **Use all saved operations**. This reads actual operation names and their saved plan samples. Edit the case title, purpose and variables for each request. For an eight-operation/24-case engagement, keep three selected variable cases for each operation. **Duplicate case with new case ID** supplies a separate identity; use meaningful stable IDs before saving.
3. Name the set and select **Save named request set**. The native compiler verifies every case against that exact saved source. Unfinished variables JSON remains in the browser draft. Download the draft when it needs to move between browser sessions or hosts.
4. Open the saved set, choose the cases, name the run and select **Start selected original cases**. Enable local-source access only for a deliberately selected local service. The run admission returns promptly, and the page reads its original progress. Starting is the action that sends selected requests.
5. **Pause after current response** lets the original active call finish and leaves later cases untouched. **Cancel current request and pause remaining cases** reaches that same call's abort controller. Both controls carry the exact active attempt ID; a late control cannot act on a newer continuation.
6. Open each case's original response, including data, GraphQL errors, HTTP errors and payment challenges. A completed case means its response was retained. It does not mean the source operation succeeded. HTTP 402 is kept as returned; this workflow does not arrange payment or resend the challenged call.
7. To resume a paused or interrupted run, refresh its current checkpoint and choose **Continue original unstarted cases**. This uses a new attempt ID within the same run. Completed responses are adopted without another request. If the original request exists but its complete response is unavailable, that case remains unresolved and its preview UUID is never resent. Untouched cases can proceed.
8. Save a later source/query/plan revision, then **Copy this set onto the current saved source** and save a new set. The original set and stable case IDs remain available. Run the candidate deliberately.
9. Select a completed baseline checkpoint and candidate checkpoint, choose matching case IDs, and prepare the **original response comparison**. This reads retained previews only. Review the exact numeric values, data/errors, request and schema differences through the existing full-value viewer; retain decisions and reviewer notes there.
10. Prepare the selected request packet or a complete project handover. The receiving operator can inspect the exact packet offline or reopen the full original project and continue authoring, review and local merchant/deployment preparation.

Record intervals come from actual original preview timestamps and include admission, transport and retention. They do not establish a causal performance improvement. Use the underlying response and request records when interpreting an observation.

### Drafts and reconnect

The request editor retains raw variables text, selected cases, comparison choices and unanswered request bodies separately from the schema/query/plan editor. Saving a run checkpoint does not replace later local source edits. The browser retains each mutation's exact request before posting it.

**Original browser requests** exposes the original body, download, same-request retry and original-operation inspection. If a response is uncertain, inspect or retry that exact UUID/body. Do not generate a new start UUID to learn whether the original run was admitted. The native set/run history is also available after the browser closes.

**Recover original saved files** attaches an inspected original set or run checkpoint at the current project revision without issuing source requests. A set prepared before its project attachment can be recovered with its saved-set UUID. The run recovery action also adopts already-retained original previews and leaves subsequent editor revisions intact.

## Installed client and CLI

Install the complete [GraphQL workspace selection](../../../../products/graphql-workspace/PACKAGING.md), then use the same private product directory and original connection:

~~~sh
starforge graphql-product open --dir /srv/private/stellar-graphql
starforge graphql-product projects --dir /srv/private/stellar-graphql
starforge graphql-product call --dir /srv/private/stellar-graphql \
  --tool merchant_graphql_project --request /srv/private/project-selection.json
~~~

The client binds the product's workspace alias automatically and rereads its original connection after restart. Source credential values stay in the server environment. The following commands read a retained JSON request file and pass its exact IDs and revision checks to the native owner:

| CLI command | Native operation | Purpose |
| --- | --- | --- |
| prepare-request-set | merchant_graphql_request_set_prepare | Validate and retain named cases |
| request-set | merchant_graphql_request_set | Inspect original set/source and attachment |
| recover-request-set | merchant_graphql_request_set_recover | Attach an existing original set |
| start-request-run | merchant_graphql_request_run_start | Admit selected cases to the native worker |
| request-run | merchant_graphql_request_run | Read original checkpoint and attempt |
| continue-request-run | merchant_graphql_request_run_continue | Explicitly continue untouched cases |
| control-request-run | merchant_graphql_request_run_control | Pause/cancel one exact attempt |
| recover-request-run | merchant_graphql_request_run_recover | Attach an existing original checkpoint |
| compare-request-runs | merchant_graphql_request_run_compare | Prepare original response comparison |
| request-packet | merchant_graphql_request_packet | Prepare selected immutable files |

Every command uses this form:

~~~sh
starforge graphql-product prepare-request-set \
  --dir /srv/private/stellar-graphql --request /srv/private/request-set.json
~~~

The exported GraphqlProductClient methods use the same names in camel case: prepareRequestSet, inspectRequestSet, recoverRequestSet, startRequestRun, inspectRequestRun, continueRequestRun, controlRequestRun, recoverRequestRun, compareRequestRuns and prepareRequestPacket. Its existing receiveFiles and receiveHandover operations retain their original transport and receiving semantics.

### Exact request shapes

The templates below show field contracts. Substitute the original project, revision, UUIDs, hashes, approved operation names and bounded variables returned by your workspace. The illustrative operation and variables are not a service result.

A saved set:

~~~json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "project": "catalog",
  "expectedRevision": 12,
  "title": "Selected catalog cases",
  "notes": "Retained engagement scope",
  "cases": [
    {
      "id": "products-first-page",
      "title": "Products first page",
      "operation": "Products",
      "variables": { "first": 10 },
      "notes": "Expected client use"
    }
  ],
  "basedOn": null
}
~~~

Copying a set supplies basedOn with its original id and recordSha256. It uses a new set id and the current saved source revision. Preparing or recovering returns the retained set recordSha256 and a current project summary.

A deliberate run through MCP/CLI:

~~~json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "project": "catalog",
  "expectedRevision": 13,
  "source": "indexer",
  "requestSetId": "11111111-1111-4111-8111-111111111111",
  "requestSetSha256": "REPLACE_WITH_ORIGINAL_SET_SHA256",
  "title": "Baseline source observations",
  "caseIds": ["products-first-page"]
}
~~~

source is a host-declared alias. The agent verifies the set's frozen origin, path and authorization environment name against that alias before calling the existing native worker. Local-source permission comes from the host declaration. The native browser API accepts its explicit allowLoopback choice directly; do not put that field in the agent request.

Inspect that exact run:

~~~json
{
  "project": "catalog",
  "runId": "22222222-2222-4222-8222-222222222222"
}
~~~

Add compact:true for small progress reads. A full inspection returns the run record, recordSha256, history, attachedGeneration, any next retained checkpoint, the original request set and the native job. Explicit generation and expectedRecordSha256 select historical checkpoint identity.

Pause or cancel:

~~~json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "project": "catalog",
  "runId": "22222222-2222-4222-8222-222222222222",
  "attemptId": "REPLACE_WITH_ORIGINAL_ACTIVE_ATTEMPT_UUID",
  "action": "pause"
}
~~~

A continuation uses a new caller id, the same project/runId/source, current expectedRevision, inspected expectedGeneration and expectedRecordSha256. Repeat that same continuation body to recover its original admission; do not create a successor attempt until the previous worker has finished retaining its completion.

Run recovery uses project, runId, current expectedRevision, selected generation and expectedRecordSha256. Set recovery uses project, requestSetId, current expectedRevision and recordSha256. These actions read existing native files.

Run comparison uses:

~~~json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "project": "catalog",
  "expectedRevision": 27,
  "title": "Selected baseline and candidate responses",
  "baseline": {
    "runId": "REPLACE_WITH_BASELINE_RUN_UUID",
    "generation": 4,
    "recordSha256": "REPLACE_WITH_BASELINE_CHECKPOINT_SHA256"
  },
  "candidate": {
    "runId": "REPLACE_WITH_CANDIDATE_RUN_UUID",
    "generation": 4,
    "recordSha256": "REPLACE_WITH_CANDIDATE_CHECKPOINT_SHA256"
  },
  "caseIds": ["products-first-page"]
}
~~~

Both sides must retain completed original previews for each selected case ID. The resulting comparison is operated through the existing comparison, comparison-changes, review-comparison, pending-comparison and recover-comparison commands. Up to 32 retained pairs are supported so a 24-case engagement remains one cohort.

## Exact files and complete receiving

A native request packet selects project, revision and exactly one requestSetId or runId. A run may additionally select an original generation. Its offline index includes all selected cases and actual response bodies, the original admitted queries/variables/source revisions, completed and pending-only preview files, and original attempts and controls.

Through the installed file receiver, use a selection such as:

~~~json
{
  "project": "catalog",
  "revision": 27,
  "kind": "requests",
  "runId": "REPLACE_WITH_ORIGINAL_RUN_UUID",
  "generation": 4
}
~~~

~~~sh
starforge graphql-product receive --dir /srv/private/stellar-graphql \
  --export-id catalog-baseline-r27 \
  --selection /srv/private/request-files-selection.json \
  --out /srv/private/received-baseline
starforge graphql-product inspect-received --dir /srv/private/received-baseline
~~~

The original exporter retains its native manifest and complete packet before publishing the transfer descriptor. The existing downloader pins those bytes, file identities, offsets and read leases. Reuse the same export alias, expected manifest and output directory for a partial download. Later source edits, run continuations or browser restarts do not substitute another selected file set. Open index.html from the complete received folder for the offline case/response index.

For continued authoring, select kind handover instead. The [original handover workflow](../../../../products/graphql-workspace/HANDOVER.md) retains every committed project revision and its request-set/run generations, original request and response files, attempt/control inputs, response comparisons and merchant/deployment source. Receiving validates those references and copies the original bytes before publishing the selected head. Existing later local revisions remain intact.

Reopening the received project never starts a run. If the original request was retained without a complete response, its exact case remains unresolved. Prepare a deliberately new run when another observation is wanted. Existing merchant and deployment packets retain their source bindings; use the original deployment compiler to prepare the receiving host's new local packet.

Native limits remain explicit: 32 cases, 256 checkpoints per run, 128 attempts/controls, 64 KiB variables per case, 2 MiB set/run records, 2 MiB returned preview bodies, 8 MiB per transferred file, and the existing 512-native-file/256 MB transfer envelope. Larger engagements can retain separate complete sets/runs. These limits constrain actual storage and requests; the UI does not silently discard a case or truncate a response.
