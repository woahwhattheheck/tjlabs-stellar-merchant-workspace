# Complete donor reporting and customer receiving

This programme continues the existing Grant Portfolio operation through donor report preparation, submission, an actual source/result/evidence correction, acknowledgment, independent customer receiving, a linked correction report and the complete customer return. It borrows three already owned console clients. The existing receiving owner retains the servers, workspaces, browser and native process.

Run it from the complete maintained SDK source. The source manifest must contain donor-reporting, the existing programme/domain/client dependencies, this complete receiving programme and this guide. The programme records all original source file identities before executing business actions. Its selected source commit is retained alongside that exact source inventory.

## Select the actual original case

Use the original customer or internal implementation workspace and its complete exported portfolio ZIP. Retain its exact original portfolio ID, revision and snapshot, source archive path/byte length/SHA256, and the original case authority. The archive must include the selected financial sources, programme hierarchy, indicator observations, evidence documents and their retained history.

The original SPC public-source case contains the two donor-reported XML activities already acquired by the financial owner. Preserve each original transaction occurrence and currency. The report's explicit source, meaning, date and dimensional filters decide what belongs in the selected report. Choose the report's actual scope and period from that original case. Agreement, source references, indicators, review note, recipient and accountable actor are supplied fields.

The source correction in this journey updates existing observations, indicators or evidence documents that contribute to the first report. It retains each actual record ID/revision and its supplied changed fields. At least one correction must concern a contributing original record and must produce a following edition. The first submitted publication remains unchanged while the linked following report reflects its selected current basis.

## Prepare all original actions

The programme has an input preparer so operators do not manually construct six revision-dependent requests. Start with a JSON preparation specification containing the following fields.

| Field | Complete selected value |
| --- | --- |
| operationId | Stable original receiving ID, up to 111 permitted operation characters |
| authorization | Existing case, internal receiving assignment or supplied-action reference |
| sourceCommit | Actual published 40-character source commit |
| connections | Absolute original connection-file paths under producer, recipient and return |
| archive | Absolute original ZIP path, exact bytes and sha256 |
| portfolio | Original id, revision and snapshot |
| actor | Actual recording actor |
| reportId | Optional retained new UUID; otherwise allocated once by preparation |
| correctionReportId | Optional distinct retained new UUID; otherwise allocated once |
| reportFields | Complete selected new report fields, status draft, explicit donorSelection |
| submittedDate | Actual initial submission date in YYYY-MM-DD |
| sourceChanges | Complete original collection/id/expectedRevision/fields corrections |
| correctionReason | Supplied explanation linking the following report |
| correctionFields | Optional reviewed following title/owner/dueDate/recipient/evidence/narrative/selection changes |
| correctionSubmittedDate | Actual following report submission date |

Each connection file is an existing private console connection. The three workspaces must have distinct actual identities. The receiving programme closes its borrowed clients while the original process owner retains the consoles.

reportFields uses the existing report schema from Programme delivery. Keep its actual nodeId, optional grantId, title, owner, reporting interval, due date, recipient, document IDs, narrative, notes and original source references. donorSelection uses the complete existing selection schema described in DONOR_REPORTING.md: selected agreement, financial lines, indicator IDs, result mode, supplied controls, explained exclusions and statement review note.

The following report keeps the first report's project, grant and reporting interval. correctionFields may change its title, owner, due date, recipient, document IDs, narrative, notes, source references and donor selection. The preparer retains the explicit correction reason and links the first submitted report. Backend validation checks every actual relationship and date.

sourceChanges contains only existing observations, indicators or documents. Use the exact original record revision and full supplied changed fields. The producer's original archive must already contain every referenced evidence object. Financial source receiving remains with the original finance operation; this journey demonstrates the report's treatment of a later contributing result/evidence edition.

From the selected SDK source directory:

~~~sh
node grant-portfolio/examples/donor/donor-receiving.mjs \
  --prepare /absolute/original/donor-preparation.json \
  --out /absolute/private/donor-preparation
~~~

This reads the actual selected portfolio and writes one complete donor-receiving-input.json. The original preparation specification is retained beside it. Repeating preparation in that directory reuses the same complete input and report/request IDs. It does not allocate another set.

The exported prepareDonorReceivingInput(client, spec) function offers the same operation to the existing native receiving controller. Retain its returned complete input before invoking runDonorReceiving(). Both APIs use the original authenticated client and portfolio.save contract.

## The six retained programme actions

The preparer keeps the original complete name, notes, sources and review fields in every save. It selects the precise next portfolio/programme revisions and the actual original record revisions.

1. **draft** creates the supplied new donor report and reads its complete live statement.
2. **submit** records its submitted date and freezes its selected statement in the original report publication.
3. **source-correction** applies the supplied contributing observation, indicator or evidence correction. Both historical and current reads of the earlier report must return the complete original frozen statement.
4. **acknowledge** changes the initial report's existing status and preserves its publication exactly.
5. **correction-draft** occurs in the independently received customer workspace. It creates the supplied following draft, linking and explaining the earlier submitted report.
6. **correction-submit** freezes that following report and retains the earlier statement SHA256 and original report relationship.

The first four actions execute on the producer. The following two execute on the recipient after the complete portfolio has been exported, received and compared. Every request retains its original operation ID and complete payload before dispatch.

The raw receiving input schema is stellar-forge.donor-receiving.v1. It has producerSteps ordered draft, submit, source-correction, acknowledge, and recipientSteps ordered correction-draft, correction-submit. Each item contains phase and request. The preparer supplies these full requests from the actual selected case.

Each saved action remains within the existing one MiB request limit. The complete six-action receiving input supports up to eight MiB. Original source archives use the existing streaming four GiB transfer contract.

## Run the complete receiving journey

Start the three selected consoles through their existing native/process owner and invoke:

~~~sh
node grant-portfolio/examples/donor/donor-receiving.mjs \
  --input /absolute/private/donor-preparation/donor-receiving-input.json \
  --out /absolute/private/donor-receiving
~~~

The operation receives the original archive into the producer, checks the selected original portfolio, executes its four retained report actions, and reads every original portfolio revision and report history. It exports producer-delivery.zip, receives it independently and compares the recipient's complete historical portfolios and original statement against the producer.

The customer then makes the linked correction through its two retained actions. Replaying the earlier receive must keep that later customer edition and workspace revision unchanged. recipient-return.zip contains the resulting whole portfolio, source packets, historical records, retained requests, original evidence and selected runtime source.

A third independent workspace receives that complete return. Every portfolio revision is compared against the customer workspace, and both report histories/statements are reopened. The programme returns the original and corrected statement identities alongside the two full archives and all complete output files.

## Completed work and interruption recovery

receiving-input.json and source-selection.json retain the complete original input and source selection. Every request is saved before dispatch. The existing Workspace admits the same operation before checking later revisions, allowing an exact retry to recover its original accepted result.

An interrupted or failed request is stored as a separate content-addressed observation. Its later completed result has a distinct retained output. A failed observation therefore cannot occupy the path needed for a later successful continuation.

Each completed stage retains its exact input/source binding, complete result and all preceding output-file identities. On resume, the programme rereads and checks those files before adopting the completed stage. It carries all those outputs into the final report, including the existing whole archives and history files.

Run the same command with the same input, source and output directory after the original request or transport recovers. Earlier accepted requests retain their original IDs and results. A genuinely changed input belongs to a separately selected operation and output directory; the original output is preserved.

COMPLETE.json is written after all seventeen ordered phases finish and borrowed clients close. Reopening it verifies the complete source/input selection, expected phase sequence, required output set, final portfolio/report selections, original archive, both complete output archives and every retained file identity. It checks the same three workspace identities and the selected original/corrected report reads, then returns the existing completed result.

The complete client/server lifetime remains with the original receiving controller. This programme neither installs a runtime nor starts replacement consoles. An interrupted invocation retains its original partial artifacts and actual request state for that owner's continuation.

## Operator and browser handoff

The application exposes the same reports in Programme delivery. Open the original report, its exact submitted revision and full statement. Reopen it after the supplied source correction; inspect the linked following report in the customer edition. The existing donor designer supports complete financial/observation rows, controls, reviewed exclusions and original evidence.

Download the complete JSON and printable HTML from that screen, or use donor_reporting_cli.py against the original stopped workspace for the same exact report read. Keep the existing browser owner when exercising desktop and phone layouts.

The receiving directory includes the complete live/frozen statement JSON at each selected stage, every report's historical records, all portfolio revisions, original requests, accepted results, the two complete archives and a final reusable result. Use those files with the original case, source commit and caller's execution receipt for customer handover.

For the SPC/ERP365 work, join the current original programme/public-source receiving assignment. Its existing process and browser owners select the actual financial source, programme and supplied report/correction fields, and append the completed result to that same opportunity. The companion governance receiving programme uses the same application and original Workspace semantics.
