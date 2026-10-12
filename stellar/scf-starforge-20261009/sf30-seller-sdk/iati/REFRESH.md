# Saved IATI publisher refresh

A refresh plan records a reviewed portfolio baseline and the person responsible
for following it. Each run chooses the complete later publisher bodies, states
which bodies replace earlier ones, retains any change to activity or financial
selection, and creates a new original portfolio revision. A named review and a
separate, explicit promotion determine whether that revision becomes the next
baseline.

This is an operator workflow over the existing IATI workspace. It uses the
original source store, parser, activity/transaction/budget builds, portfolio
revisions, comparisons, local HTTP server and installed Applications lifecycle.
It does not add an acquisition service, a background scheduler, a payment action
or a different financial calculation.

## What is retained

The plan keeps its name, owner, state, notes and complete baseline pointer.
That pointer includes the original portfolio ID and revision, definition hash,
source IDs, canonical selection and named review. Editing a plan changes its
metadata or ACTIVE, PAUSED or ARCHIVED state; it never silently moves the baseline.

A run keeps its original plan revision, label, actor and note, the full source
and selection preview, baseline, candidate, full native comparison, row counts,
named review, promotion or cancellation, and every earlier run revision.
Publisher source IDs are SHA-256 hashes of their complete original XML bytes.
Removing a publisher from a later selection does not remove its earlier bytes.

Every action has its own complete request ID, immutable input and input digest.
Native portfolio saves use a deterministic original request ID derived from
that refresh action. The original portfolio method owns the revision check and
the saved native result. Repeating a completed action returns the exact earlier
result, even if the plan or portfolio has subsequently advanced.

## Browser journey

Open the installed IATI Application and choose its publisher refresh view.
The saved source, portfolio and results views remain available.

1. Choose an existing **reviewed** portfolio revision as the initial baseline.
   Give the plan a name and owner. Explain the intended reporting cadence in its
   note; cadence is an operator instruction rather than an automatic schedule.
2. Retain the next complete publisher XML through the original source workflow.
   Choose all source editions for the next candidate, including any unchanged
   publishers.
3. Pair each changed earlier publisher with its selected later edition.
   Pairs contain changed IDs only; unchanged IDs are paired automatically.
   Each earlier and later changed source can occur in at most one pair.
   An intentional source addition or removal requires a source-change note.
4. Review the canonical activity, currency, transaction-type, budget-type and
   date selection. The default is the saved baseline selection. A change requires
   an explicit selection-change note.
5. Preview the complete selection. It shows every retained source identity and
   size, the baseline, changed pairs, unchanged publishers, additions/removals,
   selection changes and original baseline counts. Start binds the exact digest
   of that preview and the current native portfolio revision.
6. The original engine creates all three native collections and the complete
   comparison. Open the original candidate portfolio to inspect its profile,
   full financial records and review issues.
7. Record a named **reviewed** or **needs-correction** decision against the exact
   run and current candidate revision. This creates another original portfolio
   revision with the selected review and retains its comparison.
8. Choose **promote** only when that exact reviewed candidate should become the
   next baseline. Promotion requires the current plan and run revisions, a named
   actor and a note. It appends both a plan revision and a PROMOTED run revision.
   Otherwise cancel the run with a note; all publisher bodies, native editions,
   comparisons and earlier decisions remain.
9. Download the complete refresh ZIP or open its readable HTML report. An
   independent recipient can receive the whole ZIP through the same original
   IATI console and reopen its plan, run and native portfolio history.

The browser saves the full action body and UUID before dispatch. After an
interrupted reply it reads the original request and current status. It resumes
the saved server preparation or repeats the unchanged input only when the
original request is definitely not recorded. A historical receipt is displayed
as a receipt; the current plan and run are then reopened separately.

### States and decisions

| Saved state | Meaning | Next supported operation |
|---|---|---|
| Plan ACTIVE | New runs may be previewed and started | Start the explicitly selected next edition |
| Plan PAUSED | New starts are paused | Edit the same plan to ACTIVE when ready |
| Plan ARCHIVED | Retained plan is closed to new starts | Keep its full history or explicitly reactivate |
| Run AWAITING_REVIEW | Original candidate and complete comparison are retained | Review or cancel |
| Run NEEDS_CORRECTION | Named review asks for correction | Review the same exact candidate again or cancel |
| Run REVIEWED | Named review is complete | Promote, revise the review, or cancel |
| Run PROMOTED | Exact candidate became the saved baseline | Start a new run on that baseline |
| Run CANCELLED | Run was closed without promotion | Keep its history and choose a new run |
| Request PREPARED | Full input is retained and one original native step remains unresolved | Resume the same request |
| Request ABANDONED | Explicit decision closed a preparation before any native portfolio save | Keep its request and cancellation history |

Pausing or archiving the plan does not erase an existing run. An already selected
run can still be reviewed, cancelled or explicitly promoted. Starting a second
run while a run is open is rejected. A second plan cannot start an unfinished
run on the same native portfolio while another plan owns one.

## Interpreting change correctly

A new acquisition can have exactly the same publisher SHA-256. An unchanged
comparison is a valid result. A refresh label or acquisition date does not
change the publisher's own generation time or imply a new financial period.

Original counts include sources, activities, transactions, budgets, planned
disbursements retained, review records and excluded financial records. These are
row counts, not monetary totals. The original finance report keeps exact reported
decimal strings grouped by reporting organisation, hierarchy, collection,
currency, financial type and value date; budgets additionally keep status and
their whole period. No exchange-rate assumption or cross-currency total is added.

Native field comparisons cover collections with identical mappings. When a
selection changes, the response explicitly says selectionChanged and retains the
old and new definitions. Collections with different mappings do not receive an
invented keyed comparison. Publisher additions/removals remain explicit coverage
changes. Read the full original portfolio report before interpreting a difference
in row counts as a change in reported finance.

Activity IDs must remain unique in the selected portfolio. If two publisher
editions contain the same activity, the original portfolio validator rejects that
combined candidate. Choose one edition for that activity or change the selection
explicitly and preview again. A rejected native preparation remains recoverable;
it is never silently changed to another source.

## Original CLI

Use the installed command, or the exact selected source with the existing Python
runtime. Both reach the same original workspace:

```sh
starforge dataset-iati --workspace /private/iati refresh-context
python3 /selected/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/cli.py \
  --workspace /private/iati refresh-plans --offset 0 --limit 50
```

Stop the original Application before opening the same workspace through a
standalone CLI command. The workspace has its existing single-owner lease.

### Create the plan

Save a complete JSON file. Replace the placeholders with the exact retained
portfolio ID and its reviewed revision; use a unique request ID once.

```json
{
  "requestId": "publisher-refresh-plan-2026-10",
  "name": "Quarterly publisher finance review",
  "owner": "Named analyst",
  "portfolioId": "<full original portfolio SHA-256>",
  "baselineRevision": 2,
  "state": "ACTIVE",
  "note": "Review the next complete publisher release and retain explicit coverage decisions."
}
```

```sh
starforge dataset-iati --workspace /private/iati refresh-plan-save --file /private/plan.json
starforge dataset-iati --workspace /private/iati refresh-status --plan PLAN_SHA256
```

An edit replaces the metadata deliberately and requires both id and
expectedRevision. It does not accept another portfolioId or baselineRevision.

### Preview and start

```json
{
  "planId": "<plan SHA-256>",
  "expectedPlanRevision": 1,
  "expectedPortfolioRevision": 2,
  "sources": ["<complete selected publisher source SHA-256>"],
  "pairs": [
    {
      "before": "<complete baseline publisher SHA-256>",
      "after": "<complete later publisher SHA-256>"
    }
  ],
  "sourceChangeNote": "",
  "selectionNote": ""
}
```

If the source bytes are unchanged, retain that source in sources and use an empty
pairs array. For multiple publishers, include every selected source and only
the changed replacement pairs. An unpaired earlier/later source is an explicit
removal/addition and needs the source-change note.

```sh
starforge dataset-iati --workspace /private/iati refresh-preview --file /private/preview.json
```

Keep that whole preview input. Add requestId, previewSha256 from the returned
preview, label, actor and optional note to make the start input. Keep all selected
source, pair, selection and revision fields unchanged:

```sh
starforge dataset-iati --workspace /private/iati refresh-start --file /private/start.json
starforge dataset-iati --workspace /private/iati refresh-run --plan PLAN_SHA256 --id RUN_SHA256
```

### Review and promote

A review uses requestId, planId, runId, expectedRevision for the run,
expectedPortfolioRevision for its exact current native candidate, and
review:{status,reviewer,note}. Status is reviewed or needs-correction.
A current portfolio advanced outside the selected run must be inspected and
resolved explicitly; the review never follows mutable latest state.

A promotion uses requestId, planId, runId, expectedRevision,
expectedPlanRevision, actor and note. It promotes the exact reviewed candidate
selected by that run. Its baseline can remain a reviewed historical native
revision even if later unrelated native work exists; that explicit pointer is
preserved in the plan.

```sh
starforge dataset-iati --workspace /private/iati refresh-review --file /private/review.json
starforge dataset-iati --workspace /private/iati refresh-promote --file /private/promote.json
starforge dataset-iati --workspace /private/iati refresh-history --plan PLAN_SHA256 --offset 0 --limit 50
```

Every list response contains snapshot, offset, total, items and nextOffset.
For a later page, pass the same snapshot:

```sh
starforge dataset-iati --workspace /private/iati refresh-run-history \
  --plan PLAN_SHA256 --id RUN_SHA256 --offset 50 --limit 50 --snapshot SNAPSHOT_SHA256
```

If the inventory changes, start a fresh page-zero snapshot. Do not combine pages
from different snapshots.

## Interrupted requests and explicit abandonment

Read the exact original request ID:

```sh
starforge dataset-iati --workspace /private/iati refresh-request --request-id ORIGINAL_ID
starforge dataset-iati --workspace /private/iati refresh-resume --request-id ORIGINAL_ID
```

A PREPARED action retains kind, input, inputSha256, created time and full prepared
selection. Its native field is null, a retained portfolio pointer, or that
pointer plus the complete original comparison. The refresh state remains
PREPARED until its complete run revision is published.

A null native field is not proof that the original native save never happened.
The engine may have committed before the refresh pointer write or response was
lost. Resume calls the original request replay, which returns the exact earlier
portfolio revision before considering the current portfolio head.

A preparation whose native input is definitively unsuitable can be abandoned
with a separate decision containing requestId, planId, pendingRequestId, actor
and note. The original request and cancellation remain. The server only accepts
this decision after checking that no original native save exists for that exact
request. If the native save already succeeded, resume it first and then cancel
the completed run. No source or native history is rolled back.

A failed reply alone never authorizes a changed body under the same request ID.
A request that is definitely NOT_RECORDED can be corrected as a new explicit
selection with its own request ID after a fresh preview. A committed historical
receipt cannot be edited.

## Typed client

The installed export is the existing seller/iati/client surface:

```js
import { connectIatiWorkspace } from '@tokenjunkielabs/starforge-merchant/seller/iati/client';

const client = await connectIatiWorkspace({
  consoleUrlFile: '/private/original-iati-connection.txt',
  timeoutMs: 900000
});
try {
  const status = await client.refreshStatus(planId);
  const preview = await client.refreshPreview(previewInput);
  const receipt = await client.refreshSave('start', {
    ...previewInput,
    requestId: retainedRequestId,
    previewSha256: preview.sha256,
    label: 'Next complete publisher review',
    actor: 'Named analyst'
  });
  const current = await client.refreshStatus(receipt.plan.id);
  const response = await client.refreshExport(current.plan.id, {
    snapshot: current.snapshot
  });
  // Consume the complete Response stream into the caller's selected private file.
} finally {
  await client.dispose();
}
```

The client borrows the existing running console. dispose aborts and drains its
own requests; it does not stop the Application. A cancelled HTTP request can
still have a committed original server action. Reconcile refreshRequest and
refreshStatus before retrying.

Methods cover context, plans, plan, history, runs, run, run history, status,
request, preview, save, resume, export and receive. Page options use snapshot;
the MCP page argument is expectedSnapshot. The TypeScript declarations include
the create/edit plan union, all action inputs, full original native pointers,
preview, run states and receiving response.

Returned export Responses own full streams. Consume or cancel each one. The
original packet upload accepts a complete stream with an exact byte count up to
4 GiB; it is not a JSON/base64 source shortcut.

## HTTP and MCP

The original authenticated HTTP prefix is /api/iati/refresh/. Reads are
context, status?plan=, plans, plan?id=&revision?, history?plan=, runs?plan=,
run?plan=&id=&revision?, run-history?plan=&id= and request?requestId=.
Paged reads accept offset, limit and snapshot. Export uses plan and optional
whole journal snapshot. POST preview accepts the full preview definition.
POST plan-save, start, review, promote, cancel and abandon take their complete
native input object. POST resume takes only requestId. POST receive takes the
whole original ZIP.

The configured Merchant Source Workspaces adapter exposes:

| MCP tool suffix after merchant_source_iati_refresh_ | Selection |
|---|---|
| context | workspace |
| status | workspace, plan |
| plans | workspace, offset/limit/expectedSnapshot |
| plan | workspace, plan, optional revision |
| history | workspace, plan, page |
| runs | workspace, plan, page |
| run | workspace, plan, run, optional revision |
| run_history | workspace, plan, run, page |
| request | workspace, requestId |
| preview | workspace, full definition |
| save | workspace, action, full definition |
| resume | workspace, original requestId |
| export | workspace, plan, optional whole journal expectedSnapshot |

The adapter returns its original {workspace,native} envelope for reads/actions.
Refresh export returns the existing retained-file descriptor with kind refresh.
Use merchant_source_file_read for verified bounded-memory reading and its
original readId/offset continuation. Use merchant_source_file_release to release
that read. The complete ZIP is received through merchant_source_import with
the original configured packet handle or retained exportId/fromWorkspace.
There is no separate refresh file transfer engine.

JSON action input is bounded at 128 KiB. Full native refresh responses are
supported up to the original 64 MiB metadata capacity. The complete packet
retains the original 4 GiB expanded capacity and full-file count limit; exceeding
a declared limit fails explicitly instead of shortening source or history.

## Complete customer handover and receiving

```sh
starforge dataset-iati --workspace /private/iati refresh-export \
  --plan PLAN_SHA256 --snapshot JOURNAL_SHA256 --out /private/IATI_Publisher_Refresh.zip
starforge dataset-iati --workspace /private/receiving init
starforge dataset-iati --workspace /private/receiving refresh-receive \
  --file /private/IATI_Publisher_Refresh.zip
```

The ZIP contains:

- refresh/journal.json: every plan revision, run revision, complete request,
  retained preparation, native pointer, comparison and decision.
- sources/: complete earlier and later XML bodies referenced by the saved plan
  and runs, including a selected pending source that has not yet reached a
  native build.
- portfolios/: the full original portfolio packet through the highest revision
  required by the journal, including a committed native save whose refresh reply
  was lost. It retains original history, requests, full native dataset packets,
  CSV/JSONL/HTML reports and comparisons.
- reports/refresh.html, refresh.json and refresh.csv: readable complete
  baseline, source-selection, run, review and promotion history.
- guides/: this full guide and the original operating and financial-domain
  guides. The software and publisher-data licenses remain distinct.

The receiver verifies every member path, type, size and SHA-256 before use.
It imports original sources and native portfolio packets as immutable
preparation, then replays every original refresh transition against those verified
native requests and results. It regenerates every complete readable report
before publishing the refresh journal and request lookup in one original SQLite
transaction.

Receiving the same packet again is safe. Receiving an earlier compatible packet
after later local work preserves the later plan/run/action history. A different
request, review or baseline at the same original identity is rejected.
A received PREPARED operation remains pending; it is not automatically executed.

The final export uses the same original packet writer, private output lease,
complete staged ZIP and atomic no-replace publication as other IATI handovers.
Interrupted original stages are preserved. The nested portfolio ZIP is cached
by its exact selected history, request and comparison inventory, so unrelated
later portfolio edits do not change a retained refresh handover.

## Original-model receiving procedure

[receiving/REFRESH.md](receiving/REFRESH.md) describes the complete callable
original-model and operator receiving procedure. It uses caller-selected full
publisher files and the actual installed source; it preserves same-operation
request IDs and full outputs. It does not fabricate a next-period source,
rewrite the publisher XML or create a second scheduler.
