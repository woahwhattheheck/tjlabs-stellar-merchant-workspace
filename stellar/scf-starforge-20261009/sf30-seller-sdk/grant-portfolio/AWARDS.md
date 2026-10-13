# Grant applications and awards

The Applications and awards workspace covers a funding round from published criteria through applications, eligibility and due diligence, assessor assignments, assessments, panel decisions, agreements, claims, and monitoring returns. It uses the existing Grant Portfolio application, its saved operations, source editions, programme records, document objects and complete receiving workflow.

## Start from the actual programme

Open the original saved portfolio and its latest revision. In Programme delivery, create or select the programme or project, applicant partners, programme grant records, and supporting documents. Open Applications and awards and add a funding round.

A round records its own code, title, responsible person, dates, process and criteria. Enter the actual approved criteria. Score criteria need their explicit minimum and maximum. Eligibility criteria describe the question or condition. Optional weights belong to the actual programme rules. Select weighted-sum only when the approved method supplies the required positive weights; otherwise select none. The application does not introduce a ranking rule, quorum or normalized percentage.

Save drafts while preparing the round, then publish the complete edition. The published criteria become part of the retained basis for subsequent application and assessment records. A later correction uses a following edition linked to the earlier record.

## Complete delivery workflow

| Workspace | Work completed | Retained basis |
| --- | --- | --- |
| Funding rounds | Configure and publish the actual application and assessment process | Programme reference, explicit criteria and scoring method |
| Applications | Capture the applicant, project, requested amount and responses; record submission or withdrawal | Published round, original partner and profile edition, answers and documents |
| Eligibility and due diligence | Record separate attributed checks, item outcomes, reasons and evidence | Submitted application, actual criterion references and document editions |
| Assessor assignments | Assign the assessor, capture disclosure and record clearance or recusal | Application, assigning person, dated disclosure and conflict decision |
| Assessments | Record criterion scores, reasons, evidence and recommendation; submit | Original confirmed assignment and the selected published scoring rules |
| Panel decisions | Select contributing checks and assessments; record panel members, conflicts, outcome, reasons and any award amount | Complete contributing editions and explicit panel decision |
| Award agreements | Link the approved decision to the programme grant, recipient and agreement document | Recorded decision, acceptance, terms and programme document edition |
| Claims and reconciliation | Record a submission, then separate review and financial reconciliation returns | Original claim, original agreement, decisions and exact original financial rows |
| Monitoring returns | Record the reporting period, outcomes, actions, reported results and milestones | Original agreement and programme evidence editions |

Each register provides named forms, search, round and application filters, paging, record details and revision history. Repeatable form sections cover criteria, application answers, check items, score rows and panel members. Add missing round criteria fills the actual selected criterion identities while retaining entered answers and scores.

Record actions lead into the next part of the workflow: a published round creates an application; a submitted application creates checks, an assignment or a panel decision; a cleared confirmed assignment creates an assessment; an award decision creates an agreement; and an agreement creates a claim or monitoring return.

The work queue identifies application drafts, missing recorded checks, outstanding panel decisions, unresolved conflicts, missing assessor returns and claims awaiting review or reconciliation. It is a navigation aid over the selected records. The recorded programme process and responsible people determine what action is appropriate.

## Attributed decisions and preserved editions

Every change identifies its editor. Assignments additionally retain the assessor, assigning person, original disclosure, and the person and reason for clearance or recusal. Submitted assessments retain the assigned assessor. Panel decisions identify their members, roles, conflict states and reasons.

Use the existing staff and operational authority arrangements when recording those decisions. Selecting an award status records a decision in the workspace; approval authority remains with the programme's responsible people and configured staff workflow.

Drafts can be edited with the exact current record revision. Published rounds, submitted applications and assessments, confirmed assignments, and recorded checks, decisions, agreements, claims and monitoring returns preserve their final contributing editions. Corrections use Create following edition, which allocates a new record ID, links the earlier edition and starts the new edition as a draft. Closing a published round and withdrawing a submitted application advance only that record's status.

Open Record history to read the original edition in the portfolio revision where it was saved. Earlier partner, criterion, evidence and source editions stay available with the original portfolio history. A later source capture or programme document change does not rewrite an already recorded decision.

## Claims and original financial meaning

A claim submission, its review and its reconciliation are separate records in the Claims and reconciliation register. The review or reconciliation points to the original submission using its claim ID. This preserves the sequence of what was submitted, what was decided and what was matched.

Use Reconcile original financial rows to select rows from the existing portfolio ledger. The server provides each row's original source ID, row key and digest. The selected amount remains a decimal string with its original currency. Its original kind and dimensions remain attached to the reconciliation.

Amounts with different currencies or financial meanings remain separate. A source row's transaction type does not establish that a grant payment was authorized or executed. Record the actual supplied evidence and the attributed reconciliation outcome. The application records and reports these facts; payment initiation belongs to the actual payment system.

Use the existing source intake to receive complete supported source editions before selecting financial rows. A programme-only workspace can prepare its workflow before external financial sources are available. The claims register then retains the submitted and reviewed claim, and the financial reconciliation is added when the actual source rows are available.

## Documents and evidence

Evidence selectors point to the existing Programme delivery documents. Upload files through that original document workflow, retain their content hash, size, filename and media type, and link the exact document record in the award form. Agreement documents link to the original grant-agreement document record.

Final record publication preserves contributing programme and award record editions. Complete portfolio export includes original document bytes referenced across programme history and frozen award editions. The receiving process verifies those same descriptors and reconstructs the complete saved revision sequence.

## One saved writer and complete handoff

Award changes use the original portfolio.save action. A batch includes the selected portfolio revision, the selected awards revision, the editor, changed record IDs with expected revisions, and any explicit draft archives. Programme and award changes can be saved together in one original transaction, so a newly created programme partner, grant or document can be referenced by an award record in the same batch.

Other portfolio edits retain the saved award model. Derived award tables exist only in revisions that contain awards, which preserves the table identities of earlier portfolio revisions. Source replacement continues through the original source-reconciliation path. Complete portfolio export, independent receive, cold reopen and onward export use the maintained original application.

When a request is interrupted, keep its original operation ID and inspect that saved operation before continuing. The ordinary client exposes request, resume and wait for this purpose. Retrying a completed operation returns its saved result.

## Typed client

Import the original connection from client.mjs and award helpers from awards-client.mjs. Preserve the operation ID alongside the caller's own task.

    import {connectGrantPortfolio} from './client.mjs';
    import {
      awardsBatch, newAwardRecord, reviseAwardRecord,
      followingAwardRecord, saveGrantAwards, saveProgrammeAndAwards,
    } from './awards-client.mjs';

    const client = await connectGrantPortfolio({consoleUrlFile});
    const selected = {portfolioId, revision};
    const original = await client.portfolio(portfolioId, {revision});
    const change = newAwardRecord('rounds', approvedRoundFields, roundId);
    const awards = awardsBatch(editor, original.definition.awards?.revision ?? 0, [change]);
    const request = await saveGrantAwards(client, operationId, selected, awards);
    const completed = await client.wait(request.id);

approvedRoundFields, editor, roundId, portfolioId, revision and operationId are caller-supplied values from the actual programme task. The source contains no default competition, tender, grant scoring or payment policy.

saveProgrammeAndAwards accepts a complete programme change set and an award change set against the same selected portfolio revision. Both are applied by the original saved portfolio action. Existing helpers also remain available for direct savePortfolio calls.

## Read contracts

All selected award reads require the exact portfolio ID and positive revision. Responses identify that revision, its snapshot and the awards revision. Schema reads are independent of a selected portfolio.

| Client method | Selection | Result |
| --- | --- | --- |
| awardsSchema | None | Register fields, required fields and nested form shapes |
| awardsRecord | portfolioId, revision, collection, id | Selected saved record |
| awardsHistory | portfolioId, revision, collection, id | Complete changed editions through the selected revision |
| awardsRound | portfolioId, revision, roundId | Round record, related queues and counts |
| awardsPosition | portfolioId, revision, applicationId | Application, round, checks, assignments, assessments, decisions, agreements, claims, monitoring and retained calculations |
| awardsFinancial | portfolioId, revision, optional offset, limit, search | Original financial row page and server-created exact row references |

HTTP routes are /api/awards/schema, /record, /history, /round, /position and /financial under the same original authenticated loopback console. Financial selection accepts pages of one to 250 rows and also works before the first awards revision.

The existing rows method additionally exposes awards_rounds, awards_applications, awards_checks, awards_assignments, awards_assessments, awards_decisions, awards_agreements, awards_claims, awards_monitoring, awards_positions and awards_calculations.

## Operator inputs and delivery acceptance

An implementation uses the actual approved round, applicant field list, eligibility questions, assessor arrangements, scoring rules, panel authority, agreement template, claim evidence requirements, source editions and monitoring obligations. Configure these from the selected programme material before a live delivery.

Exercise one complete representative case through the original application: publish the round; submit the application; record the checks; resolve assessor disclosure; submit the assessment; record the panel decision; record the agreement; submit and review the claim; select and reconcile actual source rows; record monitoring; create a following edition; inspect history; export; receive into an independent workspace; cold reopen; and export onward.

Read the complete original documents and financial meanings in the recipient workspace. Compare the original portfolio snapshots, record editions and actual source selection. Preserve the original saved operation IDs throughout recovery. Customer acceptance should use the agreed representative cases and the real programme rules for the commissioned implementation.

## Application CSV intake and JSON/CSV exchange

awards-exchange.mjs provides a complete import preview and submission path. Begin with the exact selected portfolio revision and the original published round. Supply the original UTF-8 CSV, the filename, one stable document ID, the recording actor, one original operation ID, an explicit column mapping, and stable application/partner/project identity maps.

Column meanings are supplied by the operator. Map reference, title, legal name and applicant-partner key; then map any project key, profile fields, requested amount and currency, submission date, notes and the actual published criterion keys. Header names are exact and case-sensitive. Every application reference maps to one supplied stable application UUID. Partner and project keys map to their existing programme records.

    import {
      prepareAwardCsvImport, submitAwardCsvImport, exportAwardApplications,
    } from './awards-exchange.mjs';

    const original = await client.portfolio(portfolioId, {revision});
    const plan = prepareAwardCsvImport(original, {
      operationId, csv:originalCsvBytes, filename, documentId, roundId, actor,
      mapping:approvedColumnMapping, identities:retainedIdentityMap,
      status:'draft',
    });

    // Retain and inspect this complete plan before submitting that same action.
    const request = await submitAwardCsvImport(client, plan, originalCsvBytes);
    await client.wait(request.id);

    const saved = await client.portfolio(portfolioId);
    const exchange = exportAwardApplications(saved, {roundId, format:'json'});

The plan contains the exact original CSV hash and length, selected portfolio snapshot, selected round edition, full column mapping, stable record identities through the complete saved action, row count and original operation ID. Import submission verifies the same original CSV bytes, uploads them through the existing document client, and saves the original document plus applications in one portfolio.save action. The document stores the full column mapping and refers to the complete original CSV object.

Draft import supports creating applications or updating their exact original drafts. To import actual submissions, select status submitted and map the actual submission-date column; the original backend then validates all required answers and dates against the selected round. Already recorded application editions use the following-edition workflow.

CSV parsing preserves commas, doubled quotes, embedded line breaks and every amount as a string. Duplicate headers, incomplete quoted fields, inconsistent row widths, repeated application references and conflicting stable IDs are rejected before submission. Original request and record limits still apply. A large intake can be prepared as separate explicit original operations while preserving the same source evidence and caller-owned stable identity map.

JSON exchange retains complete selected rounds and application records, including saved publication data, record revisions, hashes, the portfolio snapshot and awards revision. CSV exchange supplies the application columns, every selected criterion answer, original decimal amounts and record identities. CSV uses spreadsheet-safe cell presentation by default: a leading apostrophe protects a cell that could be interpreted as a formula. The exchange descriptor records that setting. Set spreadsheetSafe false when a receiving machine requires literal CSV values; JSON retains the original structured values in either case.

The bytes field contains the complete output file and sha256 identifies its exact content. Use the original complete portfolio export for documents, all register histories, source packets and independently runnable application delivery alongside these application exchanges.


## Browser CSV intake and application exchange

Open **Applications and awards → Import application CSV** on the latest selected
portfolio revision. The console uses the same portable exchange rules as
`awards-exchange.mjs`; the native client's synchronous public API is unchanged.

1. Select the complete UTF-8 CSV, its retained filename, the published funding
   round, recording actor, and draft or submitted status.
2. Map reference, title, legal name and partner-key columns. Add the project key,
   actual submission date, amount/currency pair, profile fields, notes and the
   published round's question columns as applicable. Original quoted commas,
   multiline cells, decimal strings and UTF-8 content remain unchanged.
3. Match every distinct partner/project key to an existing programme record.
   Search and page through larger intake lists. Review each application identity:
   a new application keeps its allocated UUID throughout this import; a selected
   matching saved draft is updated at its exact record revision.
4. Review the complete mapped applications and original plan. Download the
   plan, then save the reviewed import. The original CSV document and all
   applications use one original `portfolio.save` action.

The browser retains the original operation ID before its first action POST.
It uploads the complete CSV with its SHA-256 and checks the returned descriptor.
The current portfolio ID, revision and snapshot must still match before a new
action is sent. The server retains its ordinary original request and revision
guards.

To continue after closing the browser, open the same portfolio's CSV intake.
Select the original CSV and use **Resume a saved import → Saved import plan**.
The console computes the CSV and action hashes, fetches the plan's actual
historical portfolio revision, and rebuilds the complete import from that CSV,
the explicit mapping and record identities. It compares the whole original plan
before exposing **Continue original import**. An already admitted operation is
looked up by its original ID and must have identical input; the same saved
operation is used even when its completed result preceded an interrupted
refresh. A new unrelated pending operation must be completed first.

Review is explicit: mapping, actor, round, application status, partner/project
identities and create/update choices are visible before saving. The browser
does not place applicant data into local storage. The downloaded complete plan
contains the reviewed application information, so retain it with the original
CSV using the operator's normal applicant-document handling.

**Export applications** is available from any saved awards revision. Select one
round or all rounds, then download JSON or CSV. JSON includes complete original
round/application records and their selected portfolio revision. CSV includes
original record IDs, revisions, hashes, profile, request, evidence references
and criterion answer columns. CSV defaults to protecting formula-like cells;
the operator can explicitly select literal original CSV strings. The download
selection displays its exact byte length and SHA-256.

The portable core performs the same parsing, identity mapping, complete-action
construction and export rendering in both runtimes. Node computes hashes using
`node:crypto`; the browser uses Web Crypto. There is no alternative persistence
engine or duplicated CSV interpretation.

The complete receiving programme now has a source selection containing the
browser exchange modules. Its original source manifest includes every selected
file. The actual saved native receiving return remains the authority for which
source selection and browser journey executed.
