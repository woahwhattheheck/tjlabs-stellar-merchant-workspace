# Committee and evaluation source exchange

Use this workflow to bring a committee register, meeting record, evaluation finding or management response into the existing programme. The original file, explicit field mapping, selected record identities and complete proposed changes travel together. Recording a supplied decision remains an accountable human action in the governance application.

## Prepare the programme and source

Open the original portfolio and its exact revision. Select the existing programme/project node and, when applicable, its original grant. Create predecessor records through the governance screen before importing dependent records: a meeting selects its committee; a decision selects its meeting; a finding selects its evaluation; a management response selects its finding. A follow-up selects exactly one recorded decision or response.

Keep the complete original UTF-8 file. CSV uses the first row as exact, case-sensitive headers. Quoted commas, doubled quotes and embedded newlines survive parsing. JSON uses an explicit RFC 6901 pointer to the complete array of source records, including the empty pointer for a root array. Duplicate JSON keys are rejected. Original JSON numbers remain their exact text rather than rounded JavaScript values.

Each operation selects one register and all records in the selected array/file, up to 2,000. The complete input file is bounded at 8 MiB, its full review plan at 16 MiB, and the original saved action at 1 MiB. Larger work is divided into explicitly selected complete source files and separately retained original operations. Every accepted source file remains downloadable from its original programme document.

## Map the original fields

A mapping rule selects one exact CSV header, one JSON pointer within each original record, or an explicitly supplied constant. Text remains text. For arrays or structured member/source-reference values, select JSON encoding. A blank original cell can explicitly map to null or an empty array. Without that selection, an empty string remains an empty string.

~~~json
{
  "title": {"column":"Meeting title"},
  "owner": {"column":"Accountable owner"},
  "meetingDate": {"column":"Date"},
  "committeeId": {"value":"THE-SELECTED-ORIGINAL-COMMITTEE-UUID"},
  "attendees": {"column":"Attendee JSON","encoding":"json","empty":"array"},
  "nextReviewDate": {"column":"Next review","empty":"null"}
}
~~~

The identifier above illustrates a field location. Select the actual original UUID from the programme; do not submit that literal label.

For JSON, a rule such as {"pointer":"/evaluation/findings"} reads that original value. Use encoding "json" for a supplied JSON array/object. Strings, member names, attributed roles, questions, reasons and source identifiers retain their complete original values. The backend validates actual calendar dates, relationships, scope and final-record completeness before committing.

| Register | Specific fields |
| --- | --- |
| Committees | terms, members, reviewFrequency, nextReviewDate |
| Meetings | committeeId, kind, meetingDate, chair, attendees, agenda, minutes, nextReviewDate |
| Decisions | meetingId, topic, decision, rationale, responsible, dueDate, outcome, issueIds, milestoneIds |
| Evaluations | kind, stage, periodStart, periodEnd, commissionedBy, evaluators, questions, methodology, limitations, summary, issuedDate |
| Findings | evaluationId, question, finding, recommendation, priority, recommendationOwner, dueDate |
| Responses | findingId, respondent, outcome, response, actionPlan, responsible, dueDate, issueIds, milestoneIds |
| Follow-ups | decisionId, responseId, reviewer, reviewDate, outcome, progress, verification, issueIds, milestoneIds, nextReviewDate |

All seven registers also have title, owner, notes, sourceRefs, documentIds, status and recordedDate. The selected node/grant scope and following-edition identity are separate reviewed choices. The adapter adds the original source document to documentIds while preserving existing evidence.

A committee member is a complete object with name and role, plus optional organization and notes. sourceRefs uses the maintained sourceId/entityKey/sha256 triples. Evidence document IDs, issue IDs and milestone IDs select their actual existing programme records. Importing a field does not create a person, role grant, issue, milestone, financial transaction or external notification.

## Choose stable records and editions

Select a nonempty original record key, using a column or JSON pointer. Supply exactly one stable target UUID and expected revision for each distinct source key:

~~~json
{
  "original-record-A":{"id":"ACTUAL-NEW-RECORD-UUID","expectedRevision":0},
  "original-record-B":{"id":"ACTUAL-SAVED-DRAFT-UUID","expectedRevision":3}
}
~~~

A new record has expectedRevision zero. An existing record can be updated only when it is the selected active draft in the same node/grant scope. Its complete current fields are retained, with the mapped changes applied. A recorded edition remains unchanged. To correct one, supply a new UUID, expectedRevision zero and supersedesId pointing to that same-scope recorded predecessor. Its business fields are carried into the following draft, with recording state and date reset. Explicitly mapped status/recordedDate can then record the supplied complete new edition through the original model.

Duplicate source keys, two rows choosing one UUID, missing identity entries and unused entries are rejected. This prevents a row from quietly becoming another record. Any intervening portfolio, governance or draft edit produces the original revision conflict.

## Review and retain the full plan

The complete plan contains:

- Original source byte length, SHA-256, filename and media type.
- Exact portfolio ID, revision and snapshot.
- Whole source selection, column/pointer/constant rules and identity map.
- Every original selected row, its source key/index, current draft or predecessor identity, and full proposed change.
- The complete original portfolio.save action, operation ID and action SHA-256.

Retain the plan JSON and original source bytes before submission. The original document stores the complete mapping and source receipt; the saved governance records keep that document among their evidence.

Before every submission or reopening, the exchange reads the plan's original historical portfolio revision, reconstructs the complete plan from the same bytes, and compares every part. Editing only a preview, action, identity, scope, mapping or source invalidates the plan. Preparing a changed import is an explicit new review with a new operation/document selection.

## Native client

Import the maintained connection from client.mjs and the exchange helpers from governance-exchange.mjs. The supplied source file is a Uint8Array, including a Node Buffer. The input contains operationId, actor, filename, documentId, nodeId, optional grantId, collection, selection, recordKey, mapping and identities.

~~~js
import {connectGrantPortfolio} from './client.mjs';
import {
  prepareGovernanceImport,
  reopenGovernanceImportPlan,
  submitGovernanceImport,
  exportGovernanceRecords,
} from './governance-exchange.mjs';

const client = await connectGrantPortfolio({consoleUrlFile});
try {
  const portfolio = await client.portfolio(portfolioId, {revision});
  const plan = await prepareGovernanceImport(portfolio, reviewedInput, originalBytes);
  // Save the complete plan and originalBytes in the caller's owned operation.
  const reopened = await reopenGovernanceImportPlan(client, plan, originalBytes);
  const admitted = await submitGovernanceImport(client, reopened, originalBytes);
  const completed = admitted.state === 'COMPLETED'
    ? admitted
    : await client.wait(plan.action.operationId);
  const saved = await client.portfolio(completed.result.id, {
    revision: completed.result.revision,
  });
  const exchange = await exportGovernanceRecords(saved, {
    collection: reviewedInput.collection,
    format: 'json',
  });
  // Save exchange.content using exchange.filename/bytes/sha256.
} finally {
  await client.dispose();
}
~~~

The original upload verifies the complete source hash and length. The source document change and governance changes use one portfolio.save transaction. The exchange does not open a second database or transaction. A repeated exact operation is reconciled by the original Workspace, which returns its saved result before applying later revision checks.

On an uncertain response, retain the plan and use the existing request/resume/wait controls. Reopening this plan selects its original historical revision, so later unrelated edits do not replace its source basis. Submitting the same complete plan retains the same original operation identity. A changed input is a different operation, not a retry.

## Browser integration

Import createGovernanceExchange from /governance-exchange-core.mjs and inject the browser's native SHA-256 implementation:

~~~js
const exchange = createGovernanceExchange({
  sha256: async bytes => Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    value => value.toString(16).padStart(2, '0'),
  ).join(''),
});
~~~

Its methods are inspect, prepare, verify, reopen, submit and exportRecords. The browser and Node wrapper call this same source. prepare captures the complete portfolio, input and source bytes before its first await; reopen and submit likewise freeze their selected plan/source before network work. The host owns its file-read generation, dirty editor, pending operation, download URL and client lifetime. It should retain the complete plan before forwarding the action and keep navigation changes from replacing a pending editor.

The original console serves governance-exchange-core.mjs, awards-exchange-core.mjs and /stellar-expert/exact-json.mjs. The last route serves the already selected maintained parser from ../stellar-expert/exact-json.mjs; there is no second JSON implementation.

## Complete exports and receiving

JSON exchange includes all selected complete records with their original revisions, hashes, generated frozen evidence and publication fields. Select one collection or all seven. Scope filters are explicit node/grant choices.

CSV exports one selected register. Its columns contain every business field, record metadata and any generated fields found in the selected records. Arrays, objects and frozen evidence are serialized completely in their cells. Spreadsheet-safe presentation prefixes cells that could be interpreted as a formula; its descriptor records this choice. Choose spreadsheetSafe:false only when a receiving machine needs literal original strings. JSON always preserves the structured values.

These exchanges complement the original full portfolio archive. The complete archive carries every source packet, document byte stream, record history, retained operation and application source. Use the original export, independent receive and cold reopen for a complete customer transfer. A CSV/JSON register is useful for evaluator review and onward editing; its receipt is not a substitute for the full history package.

## Operating profile

Programme frequency, evaluation questions, terms, quorum, selection authority and response expectations come from the selected actual project and agreement. Record the supplied people and decisions, then use the original accountable staff/native authority where deployment requires it.

For the SPC issued example, lifecycle VI names steering review at least annually through a closure meeting, while XII names mid-term and terminal evaluation through management response. Those are retained source requirements. The customer's validated inception artefacts set the actual committee, schedule, questions and process. The tender-specific original requirements and proposed field profile remain in the private opportunity case beside the full issued documents.

## Browser source desk

Open **Import original CSV/JSON** in Governance and evaluation. Select the original programme/project and optional grant, the register, recording actor and complete local file. The document download filename must use the maintained simple filename characters; the complete working file also retains the original local filename.

Choose CSV or JSON explicitly. For JSON, enter the pointer to the complete records array. **Inspect complete source / reopen mapping** exposes the original fields. For each target field choose an exact header/pointer, a supplied constant JSON value, or the original/default value. Structured lists and committee members use complete JSON values. Header suggestions come from that original CSV.

Choose a distinct original record key and **Build / reopen complete identity map**. Every source row receives a retained new UUID. For a row that updates a saved draft, choose **Existing draft** and select the actual record; its current revision is retained. A correction to a recorded edition selects **Following recorded edition** and the actual predecessor. The resulting new UUID remains stable throughout this review.

**Prepare complete original plan** retains the whole source, input, identities and preview before enabling submission. The preview pages through every row in groups of twenty; the complete plan can also be expanded or downloaded. Errors stay visible inside the open dialog. File reads, preparation and submission keep the selected controls busy until the exact operation settles.

**Keep complete working file** saves the source bytes and all fields in this browser's workspace/portfolio journal. **Download complete working file** creates one JSON file containing the complete original source encoding and plan. Opening the source desk automatically restores its saved working file, including a pending original plan. **Reopen saved source working file** also restores the original bytes and historical revision; a downloaded file can be opened through the adjacent control. These working files supplement the original server records and never create a second portfolio.

**Submit / reopen this original plan** verifies the same whole historical plan, retains its pending state, uploads the complete original document and invokes the original action. Pending or completed plans keep their selected fields locked. A continuation uses that same identity. **Start a separately reviewed import** first reconciles any pending request's terminal state, offers its complete prior working file for download, and opens a new current-revision selection. A running or unresolved original request stays selected.

Current register **CSV** and **JSON** exports use the same complete exchange factory, including generated frozen evidence. Use the application's original complete portable handoff for source files, all editions and customer transfer.

### Console mounting contract

Load web/governance-exchange.js alongside the existing governance console. Construct the component once using the same host helpers:

~~~js
const exchange = GrantGovernanceExchange({
  state, node, button, field, table, api, runOriginal, currentEdit, render,
});
// Buttons in the existing governance toolbar:
await exchange.open(register, {nodeId, grantId});
await exchange.export(register, 'csv', {
  ...(nodeId ? {nodeId} : {}),
  ...(grantId ? {grantId} : {}),
});
await exchange.export(register, 'json');
// Before final host disposal, after its accepted operation settles:
await exchange.close();
~~~

The source dialog owns its file-read lifetime, accepted operations, browser working journal and temporary download URLs. Closing a busy dialog waits for the user to keep it open until that operation settles; host disposal reports an explicit busy/dirty refusal instead of abandoning an accepted request. Final close drains its owned promises and closes the opened journal. The main host retains the original server/client and business writer. The source script dynamically imports the shared browser core at /governance-exchange-core.mjs.

The browser journal uses its original workspace/portfolio key and a transaction-local revision check. A concurrent tab cannot overwrite a later complete working file; reopen the retained edition to continue. Field-only drafts can be kept and reopened before selecting a source. Preparation and pending requests always require the complete original bytes. A different working file cannot replace a retained pending request. Busy interaction uses an enclosing disabled fieldset, preserving each control's own paging and selection state as controls are created.
