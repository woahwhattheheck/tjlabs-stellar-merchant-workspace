# Retained customer quotation programmes

Operate one customer quotation from its original Research project through the saved case, quote, revised brief, customer response, frozen paid delivery and realized report. A programme keeps the complete native requests and first replies together. Its handover carries those requests, every selected native file, the full customer case and the frozen Research dossier into the receiving workspace.

The programme uses the existing Research, SF74 commercial, SF97 pricing and SF101/Buyer operations. The original saved-case and dossier receivers apply incoming work to their own histories. The same source programme and each receiving result remain readable after the original connection closes.

## Start with the selected application

Use [Research commissioning](../../../../../products/research/COMMISSIONING.md) to open the existing Research application with its customer case store, original pricing sources and paid-delivery host. Keep the actual Research connection file and dossier directory from that application. The [quotation operating guide](OPERATING.md) covers the original quote editor, pricing controls, customer response, paid publication and realized report.

The installed programme command is:

~~~sh
starforge research-quotes-programme quotes-programme-help
~~~

Every programme command is also available through the maintained Research client:

~~~sh
starforge research-client quotes-programme-help
~~~

In a source checkout, use the original distribution command in place of starforge:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs \
  research-quotes-programme quotes-programme-help
~~~

Select a private directory for this programme. It is separate from the Research dossier directory, case store, individual native operation directories, export directory and receiving directory. The programme stores complete source selections and requests there. Private operating inputs and source paths stay with that retained directory.

## Bind the original customer

The programme definition identifies one existing Research customer project and an intended native case. Save the complete definition as JSON:

~~~json
{
  "schema": "sf88-research-quotation-programme/v1",
  "id": "be0e06b4-f0c2-4f43-8c31-53b6e7ed6e19",
  "name": "Customer evidence update and quotation",
  "dossierId": "d_00000000-0000-4000-8000-000000000001",
  "revision": 12,
  "projectId": "customer-project",
  "caseId": "58108e63-dd26-4353-8889-ad524b797a39",
  "caseMode": "CREATE"
}
~~~

The IDs and revision above illustrate the fields. Use the actual dossier, project and revision returned by the selected application. Allocate a UUID once for the programme and once for a new case, then retain them in this file. With caseMode EXISTING, use the existing native case ID. Programme creation reads the project at the exact selected Research revision and captures the configured case-store identity. An existing case is read through the original commercial interface.

~~~sh
starforge research-quotes-programme quotes-programme-create \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --input /private/programme.json \
  --out /private/programme-created.json

starforge research-quotes-programme quotes-programme-status \
  --programme-directory /private/customer-quotation
~~~

The creation result contains the retained programme input, original project and case selection, Research workspace identity, case-store identity and original pricing/merchant configuration view. A repeat with the same directory reopens those original bytes before accessing the connection. If a still-present input file changes, the command rejects that change; create a new programme definition for a different customer selection.

## Operate complete native phase requests

Each programme step contains one original quotation command. A step name is a stable local identifier, such as case-create, quote-publish, brief-review, brief-apply, customer-response, publication-review, publication-enroll or realized-report. Names contain lowercase letters, digits, dots, underscores or hyphens and start with a letter or digit.

The command input is the original complete JSON request accepted by the quotation client. The programme records the bytes, normalized selection, source binding, attempt and first reply. It preserves native UUIDs, selected case and Research revisions, review digests, complete pricing inputs and actor fields.

| Programme command | Complete native selection | Result used by later work |
| --- | --- | --- |
| create-case | requestId, caseId, dossierId, revision, projectId, briefId and actor | The original SF74 customer case and saved revision. |
| native-case | case ID is supplied by the programme; select action and its full native request | Original draft, quote, customer response, implementation plan, tariff or receiving result. |
| pricing | Original profile, action and full native pricing/cost request | Original merchant pricing version, supplier-cost edition, scenario or repricing result. |
| prepare | Complete case/quote/Research/merchant selection and explicit scope mapping | Reviewed Research brief and the exact input for apply. |
| apply | Original operation id and reviewSha256 | Original revised brief or recorded customer agreement. |
| prepare-response | Applied brief binding, native case response/revision, Research revision, actor and customer identity | Reviewed original customer agreement. |
| prepare-publication | Applied brief binding and the complete frozen delivery selection | Reviewed native Research paid publication. |
| enroll-publication | Original publication id and reviewSha256 | The exact native order, public handoff and paid archive. |
| prepare-report | Original binding/publication, selected purchase IDs, customer revision and optional pricing version/cost edition | Frozen realized report and all original pricing, order, customer and Buyer receiving files. |
| prepare-case-transfer | Original case ID, expected destination revision and complete CASE_RECORD source | Reviewed original CaseStore receiving. |
| apply-case-transfer | Original transfer operation ID and review SHA | Saved native case with original commercial/service histories and receiving provenance. |

For a new case, use its actual Research brief and full actor object:

~~~sh
starforge research-quotes-programme quotes-programme-submit \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --step case-create --command create-case \
  --input /private/case-create.json
~~~

The create-case request must select the same case, dossier and project as the programme. The source Research revision can advance for subsequent work. Later requests carry their actual current native revisions.

The original commercial editor remains available in the browser. Open Customer quotations, select the case, prepare the complete scope and pricing, save the quote draft and publish the intended quotation. Its original save/review/CAS behavior remains in force. To retain a full terminal operation in this programme, pass the same native action and request:

~~~sh
starforge research-quotes-programme quotes-programme-submit \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --step quote-publish --command native-case --action publish \
  --input /private/quote-publish.json
~~~

For pricing, preserve the actual profile and native request:

~~~sh
starforge research-quotes-programme quotes-programme-submit \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --step pricing-version --command pricing --profile research-delivery \
  --action save --input /private/pricing-save.json
~~~

A selected pricing profile must exist in the programme's original case-host configuration. Each underlying operation retains its own original source version, costs, supplier documents and history.

## Review and apply the saved brief

Prepare a complete BRIEF selection from the published native quote. Its request pins the exact case revision, quote ID and digest, original customer project/brief, source Research revision and merchant. The explicit scope component maps the quoted commercial work into the native Research brief. The original compiler supplies the prepared source and resulting native request.

~~~sh
starforge research-quotes-programme quotes-programme-submit \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --step brief-review --command prepare \
  --input /private/brief-review.json \
  --out /private/brief-review-result.json
~~~

Read the whole prepared step:

~~~sh
starforge research-quotes-programme quotes-programme-step \
  --programme-directory /private/customer-quotation --step brief-review
~~~

The native REVIEWED result exposes summary.next with the exact operation ID and review SHA. Apply that same review as a separate programme step:

~~~sh
starforge research-quotes-programme quotes-programme-apply \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --source-step brief-review --step brief-apply \
  --review-sha256 EXACT_REVIEW_SHA256
~~~

The apply helper reads the complete retained review and requires the supplied digest to match. The native quotation engine then invokes the original Research writer. It preserves the source commercial case and quote beside the new brief.

Use the revised brief for actual subsequent customer work. The native Customer updates workspace accepts the retained request, original source intakes, reviewed evidence changes and frozen delivery. The [customer delivery workflow](../customer-updates/OPERATING.md) and installed customer programme retain that complete dossier history. Select the resulting actual frozen delivery ID and revision when preparing publication.

## Record the real customer response

Capture the actual customer response in the original commercial case. Its native response records the quoted revision, disposition, source, observed time and message. A response does not have to arrive through the same transport that created the quote; the original case writer keeps its recorded provenance.

Then submit prepare-response with the applied BRIEF binding ID, saved case revision and response ID, current Research revision, operator actor and the recorded customer identity. The programme validates that the binding belongs to its case, dossier and project. Review and apply the resulting agreement using distinct step names:

~~~sh
starforge research-quotes-programme quotes-programme-submit \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --step customer-response-review --command prepare-response \
  --input /private/customer-response.json

starforge research-quotes-programme quotes-programme-apply \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --source-step customer-response-review --step customer-response-apply \
  --review-sha256 EXACT_RESPONSE_REVIEW_SHA256
~~~

The original Research agreement carries the full native quote and response identity. Existing source and customer records remain available beside it.

## Publish the selected paid delivery

A publication selects a frozen delivery that was prepared under the applied quoted brief. The original quotation engine verifies that relationship before invoking the existing Research Commerce publisher. It preserves the merchant checkout terms, original archived dossier, manifest and native public handoff.

~~~sh
starforge research-quotes-programme quotes-programme-submit \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --step publication-review --command prepare-publication \
  --input /private/publication.json

starforge research-quotes-programme quotes-programme-apply \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --source-step publication-review --step publication-enroll \
  --review-sha256 EXACT_PUBLICATION_REVIEW_SHA256
~~~

The apply helper selects enroll-publication for a PUBLICATION review. The existing merchant/order owner enrolls that exact archive. The original Buyer application operates the received public publication, its reviewed spending limits, native execution and complete file retrieval. Research Commerce then reopens the purchased dossier through its maintained receiver.

Keep the actual publication and purchase IDs. The programme handover includes the complete selected publication files. A realized-report request uses actual retained purchase IDs and the selected original order to report payment and receiving behavior.

## Freeze the realized report

Prepare a complete REALIZED request after the relevant original purchase and receiving operations have returned. It binds the applied brief, paid publication, selected purchase IDs, customer revision and optional native pricing version/supplier-cost edition.

~~~sh
starforge research-quotes-programme quotes-programme-submit \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --step realized-report --command prepare-report \
  --input /private/realized-report.json
~~~

The original report operation freezes its first observed order, purchase and customer records before writing the report. If a pricing/cost selection is present, the full original merchant files and supplier-cost archive accompany it. Later changes in those live workspaces do not silently replace the frozen report.

The programme's native export includes all these report files. It also keeps the original request used to select them, allowing the Python client, local terminal or Merchant operator to reopen the same native operation.

## Resume and replay

An interrupted programme step keeps its exact native request before dispatch. Resume it by its existing local step name:

~~~sh
starforge research-quotes-programme quotes-programme-submit \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --step publication-enroll
~~~

A completed local step returns the first complete saved native reply. An explicit replay uses a new local step name and reaches the original native request again:

~~~sh
starforge research-quotes-programme quotes-programme-replay \
  --connection-file /private/research.connection.json \
  --programme-directory /private/customer-quotation \
  --source-step brief-apply --step brief-original-replay
~~~

The replay retains its lineage and original input. It uses the same native UUID, operation and review selection; the original writer resolves that request against its own history. A replay does not rename a new mutation to look like an old one.

A programme's local result and its native state are distinct. The original prepare step keeps its REVIEWED first reply even after a later apply step completes the operation. The status output shows each retained local step and its native result. The handover chooses the complete applied version when the selected steps contain both replies for the same native operation.

## Create the whole customer handover

The export request pins the original programme and one complete customer delivery:

~~~json
{
  "schema": "sf88-research-quotation-handover-request/v1",
  "requestId": "cbd0559a-4e3d-4d89-ad21-a4d1e9c2b3f1",
  "programmeDirectory": "/private/customer-quotation",
  "caseRevision": "EXACT_ORIGINAL_NATIVE_CASE_REVISION",
  "deliveryId": "ACTUAL_FROZEN_DELIVERY_ID",
  "revision": 24,
  "sourceWorkspace": null,
  "stepIds": null
}
~~~

Set stepIds to null to capture every retained complete step at the start of this export. Set it to an explicit array of step names when carrying a selected completed edition while other work remains in progress. A selected pending step must finish before it can be exported. Preserve at least one original quotation operation in the selection.

caseRevision is the actual saved revision of the complete case being carried. deliveryId and revision identify the original frozen Research delivery. The programme and native receiver check the dossier and project relationship. For an original Europe PMC workspace used by this work, sourceWorkspace can be the exact existing {library, actor, requestId} export selection; it carries the complete source-workspace archive too.

~~~sh
starforge research-quotes-programme quotes-programme-export \
  --connection-file /private/research.connection.json \
  --run-directory /private/quotation-handover-export \
  --input /private/handover.json
~~~

The complete portable directory is /private/quotation-handover-export/package/.

| Package path | Complete retained content |
| --- | --- |
| quotation-programme.json | Exact selected programme/case/delivery identities and the complete per-file byte/SHA manifest. |
| programme/ | Original programme input, source snapshot, selected step requests, attempts and first replies. |
| requests/ | Full original native input files, named by step, ready for the existing Node/Python/terminal client. |
| native/ | Every selected quotation operation and all original review, pricing, supplier-cost, response, order and realized-report files. |
| case/ | The selected whole native case, metadata, workspace/support material and original export operation. |
| customer/ | Complete dossier history, reviewed work snapshot, all four frozen report formats and optional original source workspace. |
| publications/ | Original public publication, native order handoff and exact paid archive for every selected enrolled publication. |
| programme-summary.json | Readable phase index and complete selected source identity. |
| OPERATING.md | The selected customer's full handover index and receiving instructions. |

The complete file roster is frozen before native copies and streams advance. Partial exports resume their original immutable file selections. A completed export verifies and reopens its saved package before reaching the source programme or application, so losing the original connection does not strand the delivery.

## Inspect, relocate and receive

Inspect the original complete bytes:

~~~sh
starforge research-quotes-programme quotes-programme-inspect \
  --package-directory /private/quotation-handover-export/package
~~~

The inspector verifies every manifest member, all native operator inputs/results, the complete saved case export, the original frozen dossier and report history, and each published paid archive. Referenced native members must appear in the same complete roster. A partial or changed package is rejected before either receiving writer is selected.

Relocate the full package with the maintained copy operation:

~~~sh
starforge research-quotes-programme quotes-programme-copy \
  --package-directory /private/quotation-handover-export/package \
  --out-directory /private/customer-quotation-delivery \
  --manifest-sha256 EXACT_PACKAGE_MANIFEST_SHA256
~~~

This copies the complete original files. Repeat it with the same destination to finish a stopped copy or reopen the same retained package.

The receiving workflow first retains that entire package in its own private operation directory. It prepares the original case transfer against the destination's actual native case revision, plus the exact frozen customer/dossier selection. The result contains the full review and its digest. The receiving command consumes that review and invokes the original case writer and Research receiver. The returned result identifies the actual destination case revision, dossier, project and delivery.

~~~sh
starforge research-quotes-programme quotes-programme-receive-prepare \
  --connection-file /private/customer-research.connection.json \
  --run-directory /private/customer-quotation-receiving \
  --package-directory /private/customer-quotation-delivery \
  --manifest-sha256 EXACT_PACKAGE_MANIFEST_SHA256 \
  --input /private/receiving.json

starforge research-quotes-programme quotes-programme-receive \
  --connection-file /private/customer-research.connection.json \
  --run-directory /private/customer-quotation-receiving \
  --review-sha256 EXACT_COMPLETE_RECEIVING_REVIEW_SHA256
~~~

The receiving input binds the actual destination returned by its Research status and quotation configuration:

~~~json
{
  "schema": "sf88-research-quotation-programme-receiving/v1",
  "requestId": "a5f2537f-19f7-46c0-a50a-c4fc0760b69c",
  "expectedWorkspaceId": "ACTUAL_DESTINATION_RESEARCH_WORKSPACE_ID",
  "expectedCasesWorkspaceId": "ACTUAL_DESTINATION_CASE_WORKSPACE_SHA256",
  "expectedRevision": null,
  "sourceActor": null
}
~~~

Use configuration.cases.workspaceId for the expected case workspace. Set expectedRevision to null for a new local case; otherwise use that destination case's current original revision. The original case ID comes from the complete source package and remains the target ID. Set sourceActor to the receiving operator's recorded name when the handover contains an original Europe PMC source-workspace archive.

The [original case-transfer workflow](OPERATING.md) defines the complete native review. Existing commissioning and service histories are reconciled by the maintained CaseStore writer. The dossier is received through the original Research handover engine. Both results retain their actual destination identities.

A stopped case save, lost reply or partial dossier receipt keeps the original input, review and completed phase result. Repeat receive with the same operation directory and review SHA. The original case request resolves its saved result before later destination revisions; the original customer receiver resolves its retained dossier and source-workspace inputs. The full receiving result is retained after both native phases finish.

Read it again without an active source connection:

~~~sh
starforge research-quotes-programme quotes-programme-receiving \
  --run-directory /private/customer-quotation-receiving
~~~

Use the returned destination workspace, case, dossier and project to create a new EXISTING programme there. That subsequent programme records the actual receiving workspace identity. The original source programme remains intact and can still replay its own original requests.

## Use the typed native API

Import the maintained functions from the installed source or their distribution export aliases:

~~~js
import {
  createResearchQuoteProgramme,
  submitResearchQuoteProgramme,
  applyResearchQuoteProgrammeReview,
  replayResearchQuoteProgramme,
  readResearchQuoteProgramme
} from './customer-quotes/programme.mjs';
import {
  createResearchQuoteHandover,
  inspectResearchQuoteHandover,
  copyResearchQuoteHandover
} from './customer-quotes/programme-files.mjs';
~~~

Pass the original ResearchWorkspaceClient, or an async factory returning that client, as client. A completed operation reaches its retained local result before invoking the factory. The programme borrows the client; the caller owns its lifetime and closes it after all accepted work settles.

The .d.mts declarations cover the complete programme definition, native phase union, retained step/result/source metadata, full package selection and file roster. Receiving declarations expose the exact native transfer and customer result. Original quotation/client fields remain available in the underlying native records.

For the Python counterpart, requests/<step>.json is the exact original input used by the Node programme. programme/steps/<step>/operation/ retains the original request workspace and first reply. native/<operation>/ carries the original operation and complete frozen files. Use those inputs with the same source connection for an original request replay, or use the receiving result and its destination identities for new customer work.

## Lifetime and source behavior

The CLI installs its signal owner before opening the client. A signal aborts active transport work, then drains the existing client and every acquired owner. A failed closer stays retained for another signal/retry and keeps the process alive until the same owner closes. Final output is awaited inside that lifetime. The existing Research application remains attached.

Each programme mutation uses its original private operating lease. Native case, pricing, customer, publication and Buyer operations continue to use their own writers and request histories. Complete file exports and receiving use the maintained create-only publishers and full SHA/size checks. Matching stopped publication files are completed as their original operations; completed native inputs and results are retained unchanged.
