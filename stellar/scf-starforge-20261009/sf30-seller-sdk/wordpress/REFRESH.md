# Saved WordPress refresh plans

A refresh plan turns a reviewed WordPress edition into a repeatable source update. It retains the source declaration, collection queries, projection, dataset settings and selected merchant product. Each run captures the current native source, builds a complete comparison with the selected baseline and waits for a named review. Approval creates the successor through the original edition builder. Export carries the review and baseline source into the original merchant publisher.

The same workspace owns the browser, CLI, merchant tools, native captures, refresh records and publication. The existing workspace lease and operation journal govern each mutation. Source packets retain the plan, run, report and original refresh recovery requests for another operator.

## Choose the baseline and save a plan

Open the existing source workspace and select a reviewed edition. Check its source, capture, projection and dataset snapshot. A plan requires that exact edition ID and the displayed snapshot. The selected edition must still resolve to its original capture and mapping.

Save `refresh.plan.save` with:

~~~json
{
  "editionId": "ORIGINAL_EDITION_UUID",
  "expectedSnapshot": "ORIGINAL_DATASET_SNAPSHOT",
  "label": "Editorial weekly update",
  "note": "Use the selected editorial collections and approved projection.",
  "merchantId": "ORIGINAL_MERCHANT_UUID",
  "productId": "ORIGINAL_PRODUCT_UUID"
}
~~~

The original action envelope also supplies a new operation UUID and the current workspace revision:

~~~json
{
  "action": "refresh.plan.save",
  "operationId": "NEW_OPERATION_UUID",
  "expectedRevision": 12,
  "input": {
    "editionId": "ORIGINAL_EDITION_UUID",
    "expectedSnapshot": "ORIGINAL_DATASET_SNAPSHOT",
    "label": "Editorial weekly update"
  }
}
~~~

Use actual IDs, snapshot and revision from that workspace. The plan ID is the retained save operation UUID. A plan's original merchant and product selections are optional; export can select existing terms and a product explicitly.

The complete plan records:

| Selection | Retained identity |
| --- | --- |
| Source | Source UUID, declaration SHA-256 and account references. |
| Baseline | Edition, mapping and capture UUIDs; capture SHA-256; dataset snapshot; edition intent and projection hashes. |
| Capture | Original collection queries, selected fields and pagination settings. |
| Projection | Native field paths, output columns, types and missing-value behavior. |
| Dataset | Name, filters, ranges, sorts and declared row, byte, cell and page limits. |
| Merchant product | Original saved terms/product UUIDs and hashes when selected. |

A plan is immutable. To revise a declaration, save another plan with `previousPlanId` pointing to the prior plan. The optional `limits` object can replace `maxPages`, `maxRecords` and `maxBytes` within the original capture engine's supported limits. Collection queries and projection come from the reviewed edition.

## Start and continue the native capture

Call `refresh.run.start` with `{planId,label}`. This selects the plan's original baseline. An optional `baselineEditionId` can select an already approved successor of the same plan.

The run retains its own source and plan identity, baseline, native discovery ID, capture ID and reserved mapping/edition IDs. Only a recorded approval and an existing edition establish that a successor is available. A reserved edition ID alone describes planned work.

The action starts the original native discovery job and returns its `sourceId` and `jobId`. The browser keeps the original workspace open and reads job status. The CLI waits for the started job before closing. Once that job completes, call `refresh.run.advance` with the same run ID. This starts the original capture with the plan's frozen collection selection. Advance again after capture completion to build the complete comparison.

| Stage | Operator action |
| --- | --- |
| `discovering` | Inspect the original discovery job and its native findings. |
| `capturing` | Inspect or continue the original capture; completed captures may still need comparison preparation. |
| `attention` | Read the original error, retained response and retry information. |
| `review_ready` | Read the full comparison, selected source records and candidate identities. |
| `approved` | Inspect the original successor edition and prepare its export. |
| `rejected` | Retain the decision and select the next intended run. |
| `exported` | Continue the original product's publisher and release workflow. |

`comparisonPending:true` means the native capture is complete and the report has yet to be committed. A new explicit Advance completes that step. Status polling uses the GET methods; it does not create repeated advance operations.

A successful advance that launches a background job is a completed launch operation. If its owner later stops, a fresh Advance operation continues the same retained native job. For an uncertain response to an action, first recover the original action UUID and unchanged input. This distinction preserves both the operation result and the original capture.

When a captured response exceeds the original maximum record or byte declaration, the response remains retained with its original cursor. Save a successor plan with appropriate declared limits and start its new capture. This keeps the failed source observation and the revised collection declaration inspectable.

## Review complete source and projection changes

The comparison uses the original edition selection and projection functions. Its baseline is the exact saved edition index; its candidate is the complete selected native capture. Native record identity, native bytes and projected bytes are considered separately.

The retained summary contains:

- `beforeRows` and `afterRows`: selected baseline and candidate record counts.
- `added` and `removed`: records entering or leaving the selected dataset.
- `changed`: retained record keys whose source or projection changed.
- `sourceChanged`: matching keys with different normalized native bytes.
- `projectionChanged`: matching keys with different projected bytes.
- `unchanged`: matching native and projected identities.
- `changeCount`: the complete number of added, removed and changed rows.

A change can affect both source and projection, so those two counts overlap. A record can leave a filtered collection because its native state changed or it was removed; inspect the original collection selection and retained response to interpret the difference.

The report is persisted as four original private files:

| File | Purpose |
| --- | --- |
| `review.json` | Run, plan, baseline, candidate, summary and complete comparison member hashes. |
| `changes.jsonl` | Every changed record key and its before/after native index identities. |
| `changes.csv` | Complete review table for a spreadsheet or downstream operator. |
| `changes.index.json` | Retained byte offsets for page access to the complete JSONL file. |

The report's own SHA-256 is returned as `review.reviewSha256`. The selected native capture is `review.candidate.captureSha256`. Candidate metadata also retains projection hash, row count, encoded CSV bytes, native completion time, collection summaries and findings. The candidate is checked against the same dataset row, byte and cell limits used by the original edition builder before a reviewer approves it.

The comparison API pages the complete retained file. `offset` is a global change ordinal; filtering by `kind` preserves that ordinal. Use returned `nextOffset` for the next page. The default page has 50 rows and the maximum is 500.

Selecting a changed record reads its original native response and projection. The result identifies source, capture, sequence, ordinal and response SHA-256. Visible before/after JSON has a total four-MiB ceiling; an oversized value retains its original byte length and exact source coordinates for a complete response download.

Download the original report through `/api/file?kind=refresh&id=RUN_UUID&name=changes.csv` or the merchant `artifact` tool with the same `kind`, ID and name. The existing merchant manifest and complete-file downloader preserve its complete bytes and hash.

## Approve or reject the exact candidate

Review the native findings, complete change summary and relevant source records. Submit `refresh.run.review` with both displayed identities:

~~~json
{
  "runId": "ORIGINAL_RUN_UUID",
  "expectedReviewSha256": "ORIGINAL_REVIEW_SHA256",
  "expectedCaptureSha256": "ORIGINAL_CAPTURE_SHA256",
  "decision": "approve",
  "reviewer": "Original operator",
  "note": "Reviewed the source changes and the selected dataset projection."
}
~~~

Use `decision:"reject"` to retain a rejection and its reason. The run accepts one final decision. Another source update uses a new run.

Approval retains a pending decision before constructing the successor with the original edition builder. That decision binds the same operation UUID, expected revision, full input, reviewer, report hash and capture hash. The original result envelope then commits the mapping, edition and approved event together.

After an interrupted review, GET the run and inspect `recovery`. When present it is the exact original request:

~~~json
{
  "operationId": "ORIGINAL_OPERATION_UUID",
  "action": "refresh.run.review",
  "expectedRevision": 18,
  "input": {
    "runId": "ORIGINAL_RUN_UUID",
    "expectedReviewSha256": "ORIGINAL_REVIEW_SHA256",
    "expectedCaptureSha256": "ORIGINAL_CAPTURE_SHA256",
    "decision": "approve",
    "reviewer": "Original operator",
    "note": "The original retained note."
  }
}
~~~

Replay that envelope unchanged through the existing action endpoint. The original operation journal resolves a previously completed result or continues the retained decision. A transported source packet carries that request and its result when present.

## Export and publish the approved successor

Call `refresh.run.export` with the run ID, reviewer and optional note. The plan's existing merchant and product selections are used by default. Supply `merchantId` or `productId` to select other existing records explicitly.

The exporter checks the approved report, original capture and selected merchant/product identity, then creates a normal content export through the original workspace. Its retained source includes the plan, run, decision, complete comparison, prior baseline mapping/edition and source captures. The export freezes that exact source-file selection before writing its original manifest so an uncertain retry cannot pick up later refresh events.

The export record includes:

~~~json
{
  "refresh": {
    "planId": "ORIGINAL_PLAN_UUID",
    "runId": "ORIGINAL_RUN_UUID",
    "reviewSha256": "ORIGINAL_REVIEW_SHA256",
    "baselineSnapshot": "ORIGINAL_BASELINE_SNAPSHOT",
    "candidateCaptureSha256": "ORIGINAL_CANDIDATE_CAPTURE_SHA256"
  }
}
~~~

Use the returned workspace export UUID with the existing `publisher.prepare` action. Review and publish the original draft, select its original snapshot, and operate its SF82 release. The existing seller activation, rollback, native receiving and SF88 customer acquisition remain the product's publication and delivery path.

An approved successor can become the baseline of the next run by selecting its edition ID. The complete plan history keeps the relationship between each source update, named review and exported product.

## Browser, CLI and merchant interfaces

The existing browser exposes saved plans, current runs, complete comparison pages, selected native source and projection, named decisions, exports and original recovery. Use the same source workspace URL and authenticated session.

The direct CLI accepts the five actions through its existing retained request flags:

~~~sh
starforge-merchant wordpress act \
  --dir /private/wordpress/catalog \
  --action refresh.run.advance \
  --input /private/requests/advance.json \
  --operation ORIGINAL_OPERATION_UUID \
  --expected-revision ORIGINAL_WORKSPACE_REVISION
~~~

The input file contains `{"runId":"ORIGINAL_RUN_UUID"}`. Select a fresh operation UUID for an intentional next step; recover an uncertain action with its original UUID and input.

The four read methods are available from the original workspace and corresponding CLI/merchant surfaces:

| Workspace method | HTTP route | Merchant suffix |
| --- | --- | --- |
| `refreshPlan(id)` | `GET /api/refresh-plan?id=...` | `refresh_plan` |
| `refreshRun(id)` | `GET /api/refresh-run?id=...` | `refresh_run` |
| `refreshChanges(id,{offset,limit,kind})` | `GET /api/refresh-changes?id=...&offset=0&limit=50&kind=all` | `refresh_changes` |
| `refreshRecord(id,key)` | `GET /api/refresh-record?id=...&key=...` | `refresh_record` |

Every mutation uses the existing `POST /api/act`, workspace revision and retained UUID. The merchant typed client exposes all 29 tools and 38 original action field sets in `merchant/CLIENT.md`. Its full-value reader handles large report metadata using the original immutable JSON export.

## Receive and continue a complete source workspace

Pause active native captures before the original `source.packet` action. Its packet retains refresh plans, runs, decisions, report files, export selections, events and the original five refresh action journals. It also keeps the original sources, captures, mappings, editions and merchant terms. The receiver checks every file and hash, operation identity, retained revision, and result association before installing the same workspace.

Use the existing packet receiver or publish the complete source through `source.files` and the original SF88 file projection. Both receiver paths accept the same refresh operation subset and preserve the exact workspace UUID and original request identities.

After receiving, inspect the same plan and run. Recover a retained decision or export from its exact request. Continue an interrupted original capture through a fresh explicit Advance for that same run and capture ID. Once an approved successor is exported, resume the existing publisher product through its own original operation and release identities.
