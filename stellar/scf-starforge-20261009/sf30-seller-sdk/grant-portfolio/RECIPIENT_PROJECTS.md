# Recipient project handover

This workflow takes a **recorded application plan** from the portable Engrant
research desk and creates reviewed project planning in an existing Grant Portfolio
programme. It serves the applicant organisation. The Applications and awards
registers serve grant administrators and are not used here.

The research desk keeps the original organisation profile and funding-context
records, explicit staff-authored eligibility/fit/condition criteria, recorded
decisions, and saved plan editions. A historical funding record is not a current
call, a new eligibility determination, a funding commitment, or a payment. The
recipient import makes none of those inferences.

## Prepare the recipient workspace

Open the existing Grant Portfolio Console. Select the current portfolio revision,
then use Programme delivery to retain the parent programme and the recipient's
partner record. Review the actual identity; the importer does not match
organisations automatically by name, website, or source label.

In the research desk, record the reviewed Pursue decision and then record the
selected application plan edition. Download its complete application-plan JSON.
The selected edition remains tied to its original decision, candidate, criteria
and brief even after later edits in the desk.

## Import in the browser

1. Open **Programme delivery → Import application plan** and select the complete
   recorded application-plan JSON, up to 8 MiB. Choose the retained filename.
2. Read the organisation, candidate, reviewer, rationale, dates and plan edition.
   The complete original profile, criteria and source records are available in
   the same review.
3. Select the existing parent programme and recipient partner. Explicitly confirm
   that the selected partner represents the original organisation. Supply the
   recording actor, new project code, title, owner and project dates.
4. Select the dated tasks that should become programme milestones. Review each
   owner, title, code, progress and programme status. The original task due date
   is retained. A Waiting task requires an explicit programme status; no status
   is silently inferred. A complete milestone requires the source task's actual
   completion date, completion note and 100 percent progress.
5. Review the complete recipient import. Download **Original recipient plan**
   before choosing **Save reviewed project**. Keep that downloaded plan beside
   the original research-plan JSON.
6. The original portfolio operation atomically adds one project, its complete
   source document and the selected milestones. Inspect them through the normal
   Programme position, Workplan, Documents and Revision history views.

Undated tasks and dated tasks that were not selected stay in the complete retained
plan document and are listed in the review. The requested amount, currency,
application deadline, workload estimates, evidence URLs and remaining source
fields are retained in that original document; they are not converted into an
award or ledger row. This version creates a new project and new milestones. It
does not overwrite an existing project or silently merge another plan edition.

## Source and recipient identity

The import hashes the exact received JSON bytes using SHA-256 and verifies those
same bytes during upload and recovery. The research source's source_sha256 is
retained as a **declared source identity**. It is not represented as an independently
recomputed hash of the entire multi-organisation source pack, because the plan
exports one complete selected organisation.

The document's content contains the original lead/candidate/decision/plan IDs and
editions, exact portfolio revision/snapshot, selected programme and partner
IDs/revisions/hashes, project/document IDs and received-file descriptor. Original
candidate IDs up to 12,000 characters remain unchanged. If the complete original
identities exceed the document's bounded metadata field, that field retains the
source-file hash and exact JSON field paths; the raw source and downloaded import
plan still contain every complete identity. A long task completion note likewise
stays in the complete source, with its exact task position linked from the
milestone description. Reviewed destination titles and descriptions keep their
ordinary programme limits without truncating the original handover. The
partner's ID and name also appear in the project description. The existing node
model has no partner field, so this explicit source document is the recipient
binding; no fictitious grant relationship is introduced.

The complete original JSON includes its original organisation profile and all
selected historical source records. Nothing in the import copies those context
records into the native financial table. The normal portfolio export carries the
complete document object and all portfolio revisions; the normal independent
receiver reconstructs the same programme history and source bytes.

## Continue the same import

If the browser closes or a response is lost, select the original source JSON and
the downloaded recipient import plan under **Continue a saved recipient import**.
The client hashes the source again, opens the exact historical portfolio snapshot,
and rebuilds the complete intended action from that original basis. It rejects
changed source bytes, selected identities, task mappings, or action content.

Before dispatch, it looks up the original operation ID. If a request exists, its
complete saved input must match, and the original operation is continued. A
completed request returns its original result without another project. A new
request is permitted only while the originally reviewed portfolio snapshot is
still current. A competing edit requires a new explicit review; it does not cause
an automatic rebase or a second operation under another ID.

The normal Saved operations view remains available for the original request.
The downloaded plan is a complete recovery input, not a substitute for the
workspace's durable request/result journal.

## Native client

Import from the installed source's grant-portfolio/recipient-project.mjs. The
native wrapper uses Node's built-in SHA-256; the browser uses Web Crypto. Both
use the same pure mapping and validation module.

~~~js
import {readFile,writeFile} from 'node:fs/promises';
import {prepareRecipientProject,submitRecipientProject}
  from './grant-portfolio/recipient-project.mjs';

const bytes = await readFile(originalPlanPath);
const portfolio = await client.portfolio(portfolioId, {revision});
const plan = prepareRecipientProject(portfolio, {
  operationId, bytes, filename: 'Application_Plan.json', actor,
  programmeId, partnerId, recipientConfirmed: true,
  project: {
    id: projectId, code: 'APPLICANT-PLAN-01',
    title: reviewedTitle, owner: reviewedOwner,
    description: reviewedDescription, startDate: null, endDate: null
  },
  documentId,
  milestones: [{
    taskId: selectedOriginalTaskId, id: milestoneId,
    code: 'APPLICANT-PLAN-01.T001', title: reviewedTaskTitle,
    owner: reviewedTaskOwner, dueDate: originalTaskDueDate,
    status: 'planned', completedDate: null, progress: '0',
    description: reviewedTaskDescription
  }]
});
await writeFile(retainedImportPlanPath, JSON.stringify(plan,null,2)+'\n', {flag:'wx'});
const request = await submitRecipientProject(client, plan, bytes);
~~~

Supply stable version-four UUIDs for the project, document and each milestone
before preparing the plan. Retain them with the operation. The prepare function
allocates no IDs and does not write or send anything. submitRecipientProject
returns the original client's retained request; use the client's existing
request/wait/resume APIs for its outcome. It does not introduce another writer,
queue, credential store, payment mechanism or external submission.

The native submit function also rebuilds the plan against its exact historical
basis. A self-consistent action hash alone does not authorize arbitrary content.
The original server performs its ordinary atomic revision, document and
relationship validation.

## Correcting work later

Keep a saved plan edition unchanged. Edit the project or milestones through the
original programme records when the implementation plan changes. A revised
external research plan is a following recorded edition; retain it as another
programme document and review any project changes explicitly. Existing archived
codes and record history remain governed by the original programme model.

No automatic grant creation or financial reconciliation is included. If an
external funder later confirms an award, use its actual agreement/source edition
and the existing grant workflow after a separate operator review.

## Receiving and source inclusion

recipient-project-core.mjs, recipient-project.mjs, recipient-project.d.mts and
the browser script/style are included in the maintained source-files selection.
The browser joins use the original Console's authentication, file upload, request
identity and portfolio.save action.

The full receiving course exercises the actual desk and recipient application,
the exact original saved-plan retry, complete project/document/milestone results,
unchanged grant and financial state, full export/independent receive and reopen.
Source parsing or model checks alone are not represented as a completed browser
or native run.
