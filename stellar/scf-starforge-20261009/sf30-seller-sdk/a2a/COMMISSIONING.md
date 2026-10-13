# Customer commissioning and receiving

The **Customer commissioning** pane joins a customer’s useful work plan to the original A2A request, approved analytical procedure, complete result edition and recorded receiving decision. The register lives in the same private A2A project, request journal and portable history as the rest of the application.

A plan can describe future work before customers, dates or prices are selected. Preparing a job requires the actual buyer, merchant, source periods, complete source files, accepted procedure catalogue and an attributed review. A receiving decision requires the exact completed native task and every advertised output. The operator’s decision records who reviewed the delivery; the original SF30/SF82 records remain the authority for payment verification and settlement.

The [original workspace guide](OPERATOR.md) covers runtime installation, connection credentials, Agent Card review, native task recovery, seller publication and release. This guide covers the additional customer workflow.

## Start with the current original application

Use the same Node 24 runtime, A2A SDK 1.3.0 installation and private workspace as the original application. No additional package is required. The installed A2A contribution includes this module, its typed API and the complete original commissioning template.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs workspace \
  --workspace /absolute/private/customer-workspace \
  --connections /absolute/private/reviewed-connections.json
~~~

Open the printed local operator URL and select **Customer commissioning**. The existing host token, connection configuration and writer lease still govern the application. A CLI process cannot take the workspace while its original server owns the writer lease.

The optional commissioning fields are absent from older projects. Opening or receiving one of those projects preserves its original history and offers the new pane. Importing a plan or retaining evidence is the first mutation that creates the commissioning register.

## 1. Retain a complete useful work plan

Choose **Download original template**, read the full JSON, and save a customer-specific copy if the work requires changes. The original template defines thirty distinct proposed jobs across ten business days, two independent buyers, two merchant roles and a fourteen-calendar-day illustration. It contains no selected customers, actual source periods, prices, native task results or purchase receipts.

The original arithmetic is three useful jobs in each business day: fifteen for each buyer, twenty complete extraction queries from the first merchant and ten comparison-query/report jobs from the second merchant. There are twenty-five query jobs and five report jobs. P00 is an already existing comparison baseline and is outside those thirty jobs. Customer calendars, source availability and decision owners determine whether that proposed schedule is appropriate. Retain any agreed revision as another complete plan rather than changing the source of an already used plan.

In **Complete commissioning register**, select the entire JSON file, choose **Customer commissioning** or **Explicit reference or demonstration**, and explain the source and attribution. This classification remains attached to the exact plan bytes. A demonstration is not automatically promoted to customer use by later receiving decisions.

The application verifies the plan schema, unique buyer/merchant/period/contract/job IDs, all required references, query/report output kind and one business job per row. It retains the original file, including all fields outside the minimum executable contract. The saved row identifies its SHA-256, source ID and full job count. Importing identical bytes with identical context and attribution returns that original row; identical bytes cannot be relabeled under a different attribution.

Use a separate plan with an explicit reason if the customer changes the job population or required output. Existing requests, tasks and receiving decisions continue to refer to the plan that actually governed them.

## 2. Retain original approval and source files

Upload each complete file through **Retain source or evidence**. Select its purpose:

| Purpose | Retained material |
| --- | --- |
| Customer or workorder approval | The actual approved workorder, reviewed customer instruction or clearly labeled reference realization |
| Source-period input | Complete input files belonging to a selected source period |
| Source or interface contract | Source license, supplied schema, field definitions, approved query/report requirements or input mapping |
| Receiving review or commercial evidence | The named person’s delivery decision, full receiving record, or original commercial record supplied for review |

A file is at most 32 MiB. Larger source populations need the original external source/package workflow or multiple complete named source files; this uploader does not silently truncate a file or retain a selected excerpt as the whole source. Plan JSON is at most 1 MiB.

Filename, media type, full bytes, SHA-256, role, original request and provenance note are retained in the project’s object store and history. The normal source viewer displays text as escaped content and downloads the exact retained bytes. Uploaded HTML does not execute in the operator’s origin.

Upload is an original project mutation. The browser saves its request ID, selected project revision and complete encoded file before sending. An uncertain response keeps that original pending request. Reload or retry it through the existing recovery controls; do not create a new request to guess whether the first upload committed.

## 3. Review actual buyer, merchant and source-period bindings

Choose a retained plan and review each binding needed by the job. Every review requires retained evidence and a reason. A correction appends another approval row. It does not rewrite an earlier approval.

**Buyer.** Record the organization, accountable buyer, named receiving person, exact population, and the basis for treating this buyer as independent. The application retains this as an attributed operator decision. A name in this form is not a new user account or a substitute for the host’s authentication.

**Merchant.** Record the organization, original installation ID, exact paid service URL and accountable operator. Use the actual HTTPS service URL; a loopback HTTP URL is available for an explicitly selected reference installation. Credentials, query strings and fragments are rejected. When a receiving review selects an SF30 publication, one of that original publication’s routes must resolve to this exact reviewed URL.

**Source period.** Record an explicit start and end with time zones, the original source-edition ID, every complete source file for that period, the basis for using those inputs, and the selected population. End must be after start. Source files must be previously retained as source-period inputs and must be nonempty. The full file descriptors are frozen into the approval.

The register does not infer a legal permission or license from these fields. It records the supplied basis and evidence so the accountable operator can review the actual commissioned work. In an authored reference receiving exercise, label that realization and retain the genuine original source separately.

### Correcting a binding after preparing a message

If an approval changes before a prepared message is sent, the pane marks the job **Review changed**. Sending that old preparation is blocked. Review the corrected binding and prepare a new original message for the same unsent job; the previous preparation remains in history and the new one identifies what it supersedes.

Once the message has an original send attempt or an adopted task, the register cannot replace it with a fresh task. Continue its existing native request/task through the original task controls. That preserves the actual source and approval that governed the attempt.

## 4. Observe and freeze the original procedure catalogue

Use the existing **Reviewed requests** and **Native tasks** panes to send the selected analytical agent one standard A2A data or text part:

~~~json
{"action":"catalog"}
~~~

Capture every original output, review the complete catalogue result, and freeze that accepted result as a named edition. The commissioning pane only offers a catalogue edition whose original request is exactly this catalogue action and whose complete captured file is the original `catalog.json`.

The catalogue supplies the procedure ID, query/report kind, original workspace ID, saved definition revision, input view versions, allowed parameter behavior, complete output formats and procedure SHA-256. These are selected from retained native source. They are not free-text guesses in the job form.

A query job requires the original complete CSV, JSONL and SQLite selection. A report job requires the original complete CSV, HTML and JSON selection. Procedures that expose fewer formats can still exist in the native catalogue, but they cannot satisfy this register’s complete-output contract.

## 5. Prepare the useful job

Select the planned job and review:

- The actual calendar date.
- Its accepted catalogue edition and observed procedure.
- Every original input view and the source periods that view represents.
- The exact JSON parameter text, if the selected query permits it.
- The original approval/evidence files and the reason this is useful work.

Every selected native view must be mapped once, and every source period required by the planned job must be covered. The register preserves original view names, version IDs and revisions alongside that mapping. A customer approval of a mapping remains visible as a decision; the application does not claim to derive that decision from a source filename alone.

Leave **Original reviewed message** at **Prepare a new original message** for new work. The application creates the original local prepared A2A message in the same transaction as the preparation. Its standard data part is:

~~~json
{"action":"run","procedureId":"the-observed-procedure-id"}
~~~

When supplied, `parametersText` is added as the exact unchanged JSON text. The register preserves the original text, including integers and intentional formatting. It does not parse and reserialize parameters into a different request. The message ID is fixed by the original commissioning request ID.

Then use **Open original request** to inspect and explicitly send it through the existing A2A interface. Preparing a job does not itself send a network request or charge a buyer. All original uncertain-send, native task lookup, same-task resume, cancellation and complete-artifact behavior remains in the existing task workflow.

### Adopting work that already exists

An operator can select an existing reviewed message instead. Its agent selection and exact analytical request must match the retained catalogue and job. The preparation is recorded as **adopted**, with the existing message’s original creation time. It neither resends that message nor changes its native task ID.

This is useful when bringing an accepted historical delivery into the same customer register. Its count remains distinguishable from a job prepared through this workflow. A message can belong to one retained job, and the same agent URL plus native task ID cannot become a second business job by attaching another edition, format or decision.

## 6. Review the complete delivered result

Use the original result workflow to retain every output, review it and freeze the accepted analytical result edition. Select that edition under the job’s **Customer receiving** form. Retain the actual receiving evidence before recording **Accepted complete delivery**, **Changes requested** or **Rejected**.

The register checks the original completed observation and its entire output capture before the decision can commit. It then verifies:

- The original analytical request, selected agent and native task match this preparation.
- `analysis-record.json` and the original task metadata agree on the complete procedure, its SHA-256, unchanged parameters, original workspace, planned calls, native job results and exported files.
- Every file’s original artifact ID/part index, bytes, media type and SHA-256 agrees with the complete native result.
- Query receiving includes complete CSV, JSONL, SQLite and original manifest, with the native complete flag and row count.
- Report receiving includes the original publication and the complete CSV/HTML/JSON export jobs.
- An optional seller publication belongs to this exact result edition and the reviewed merchant service URL.

The decision names the receiving person frozen in the buyer approval and separately records the authenticated workspace operator who entered it. Its evidence files, native identities and complete file descriptors remain immutable. A later decision appends another record while preserving earlier decisions.

**Accepted** means that this attributed receiving review accepted the full selected delivery. It does not mean that a payment settled. `settlementStatus` remains `not_evaluated`; verified-settlement counts remain `null`. Use the original SF30/SF82 commercial records for actual payment verification and settlement. Downloading three formats, polling, resubscribing, retrying a request or recording another review does not add a purchase.

## 7. Keep the whole project portable

**Download selected register** returns a JSON report for the currently displayed project revision. It contains the complete plan, approvals, preparations, native task/file references, decisions and derived counts for that revision. It is a readable report; use the original named project handoff to transfer the full editable workspace and original file bytes.

The original portable package includes every commissioning source object and all retained history. Receiving validates commissioning records at each historical snapshot against that snapshot’s original result editions. Fresh receiving, forward receiving, an exact same-package replay and retaining an older package keep their existing semantics. The receiving host still selects its own current connection before network work.

A named old handoff and an old result edition keep their original bytes after later commissioning decisions. The new register does not change an already frozen result packet. Historical views support source downloads and reports, while mutation remains on the current project revision.

## CLI and typed integration

Download the exact template without opening a workspace:

~~~sh
node cli.mjs commission-template --out /absolute/private/customer-plan.json
~~~

Read the current or a selected historical register:

~~~sh
node cli.mjs commissioning --workspace /absolute/private/customer-workspace \
  --id ORIGINAL_PROJECT --revision 12 --out /absolute/private/register-revision-12.json
~~~

Retain a complete evidence file with a reviewed original request ID:

~~~sh
node cli.mjs commission-source --workspace /absolute/private/customer-workspace \
  --id ORIGINAL_PROJECT --revision 12 --request-id reviewed-source-request-01 \
  --input /absolute/private/approved-workorder.pdf \
  --role customer-approval --media-type application/pdf \
  --note "Original customer-supplied approval for the selected workorder."
~~~

The normal `action --input FILE` command accepts the five local actions as `{action,payload}`. Save the exact JSON before invocation and reuse it after an uncertain outcome. The original request lookup precedes current-revision validation; a committed replay returns that request’s retained result.

~~~js
import { openA2AWorkspace } from './workspace.mjs';

const workspace = await openA2AWorkspace({
  directory: '/absolute/private/customer-workspace',
  operator: 'Authorized receiving operator'
});
try {
  const current = workspace.get('ORIGINAL_PROJECT');
  const receipt = await workspace.dispatch('commission_review_delivery', {
    id: current.id,
    expectedRevision: current.revision,
    requestId: 'reviewed-receiving-request-01',
    preparationId: 'ORIGINAL_PREPARATION',
    editionId: 'ORIGINAL_COMPLETE_EDITION',
    decision: 'accepted',
    evidenceSourceIds: ['ORIGINAL_RECEIVING_EVIDENCE'],
    note: 'The named receiver accepted every complete output in this edition.'
  });
  console.log(receipt.state, receipt.result);
} finally {
  await workspace.close();
}
~~~

[commissioning.d.mts](commissioning.d.mts) defines the source, approval, preparation, delivery and report records. [workspace.d.mts](workspace.d.mts) includes all five action payloads. The installed subpath export is `./a2a/commissioning`, under the actual package name in the selected product’s original package manifest.

The same authenticated HTTP dispatch accepts all five actions. Complete evidence uses `POST /api/commissioning/source` with the normal `{action,payload}` envelope and original request identity; other mutations use `POST /api/dispatch`. `GET /api/commissioning?id=PROJECT&revision=N` returns the selected report, and `GET /api/commissioning/template` returns the complete original template.

## Receiving continuation

[receiving/commissioning-register.mjs](receiving/commissioning-register.mjs) consumes the accepted output of the original analytical and merchant programme. It reuses that programme’s complete catalogue, task, source recording, reviewed result and fixed handoffs in an explicitly labeled reference register. It does not send a replacement analytical query, invoke a seller route or create settlement evidence.

The continuation retains the original completed-result input, source manifest and all source hashes before opening its receiving copy. It exercises the actual workspace/API and desktop/mobile pane, a corrected source approval, an unsent message supersession, adoption of the existing native result, complete receiving decisions and fresh/forward/older project handoffs. Its journal retains original action IDs and result candidates across restart. Run it only after the original programme has completed and its owners have closed, using the selected installed source and existing browser runtime. Its result reports reference receiving, adopted task counts and unverified settlements separately.

The exact invocation and required original paths are printed by that entry’s `--help`. Retain the whole output directory and its source manifest together with the original programme’s existing complete source/receiving packages.
