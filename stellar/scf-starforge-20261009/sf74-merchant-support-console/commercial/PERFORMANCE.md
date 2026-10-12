# Recorded usage and customer pricing revisions

The Commercial workspace carries a complete saved Merchant pricing performance review into the original customer case. An operator can compare the earlier quoted uniform price with its saved tariff schedule at the recorded quantity, then prepare a later quotation with an explicit monthly request volume and either the existing or a revised saved tariff.

The customer, implementation lines, recurring service, scope, payment terms and original quotation history remain in the ordinary quote editor. The original review/publish, customer-response and accepted-implementation commands complete the commercial process.

## Prepare the recorded review in Merchant pricing

Use the saved tariff selection whose pricing source was received into this customer's case. In Merchant pricing, choose the original usage version, quantity basis, optional recorded cost edition and exact route. Preview and save the performance review. Export its complete source JSON.

The source file carries its complete original pricing versions, tariff portfolio, scenario plan, usage observation, selected costs and any service-period source. Receiving recomputes the native review from those originals. A report without the source envelope cannot replace that file.

The performance review must select the original tariff request, plan, comparison, scenario, source version and pricing version used by the measured customer quotation. The uniform USD rate must equal that quote's original route price.

## Complete the workflow in the browser

Open the original saved case at /commercial, then open **Usage and revisions**.

1. In **Receive recorded usage**, choose the earlier saved customer quotation and the complete native performance source file. Review the recorded period, quantity basis, price comparison, original counts and source notes.
2. Choose **Save usage review in this case**. This writes the full source as an original case material. A pending reply keeps its original request and complete file identity. Reselect the same file after reopening and resume that request.
3. Choose a saved usage review. Download its complete native source, case attachment or readable report whenever needed.
4. Select the measured quotation or a later edition in its history. Enter the proposed whole number of **requests per month**.
5. Choose the existing saved tariff, or first receive a revised native pricing selection through **Tariff sources** and choose that newer tariff. It must preserve the measured route ID, method and path.
6. Choose **Prepare revision in quote editor**. Review the customer scope, work, service, route quantities and terms. The draft explicitly names its original parent and saved usage review.
7. Use the ordinary **Review quote** and **Save quote edition** controls. The customer document explains the recorded comparison and the new monthly proposal.
8. Record the customer's response against the exact new quote, then use the original accepted-implementation flow when the response is accepted.

A measured short period never silently becomes a monthly request projection. The operator enters the new monthly volume. The pricing workspace owns changes to the saved pricing scenario; the Commercial desk uses the selected native price.

## What the saved amounts mean

The review preserves separate quantities for HTTP observations, selected native payment options, inbox or fulfillment counts, and source-owned service usage. Its chosen basis identifies the quantity used in the price comparison. The saved uniform quote value, the original tariff schedule value and estimated variable cost are computed for that same quantity.

The delivery journal is the retained snapshot included in the source. A recorded payment status or later callback is not silently reassigned to an event-period cutoff. Recorded cost editions retain their own original period, coverage and alignment. Inspect the source notes when the quote-time and observed payment terms differ.

For a prepaid service, the allowance purchase and inner service requests keep distinct meanings. A comparison of inner service calls uses an independently selected per-request route price for that exact method and path. It does not create a separate purchase payment for every service call or count a recovered response as a newly consumed request.

## Original case model

**openCaseCommercial** exposes four methods:

| Method | Purpose |
| --- | --- |
| previewPerformance | Inspect the full native source against the measured immutable quote and return its review identity. |
| receivePerformance | Retain that reviewed source through the original case commissioning writer. |
| preparePerformanceRevision | Return the ordinary quote draft with explicit monthly volume, target tariff and original quote ancestry. |
| downloadPerformance | Read the complete native SOURCE, complete case ATTACHMENT, or readable REPORT. |

A receiving request includes the original expectedRevision, requestId, operator, complete sourceText and sourceSha256, measured quoteId/quoteSha256, optional explicit tariffSourceId, and the preview's reviewSha256. Keep those exact inputs after an interrupted response. Reusing the same UUID for changed inputs is rejected.

The source is retained as commercial-tariff-performance-source in the ordinary implementation materials. It therefore travels with the original complete case export, recipient receiving and backup/restore. There is no second customer-state writer.

The quote binding stores the recorded period, basis, native source identity, original customer quote, cost view and explicit proposed monthly line. The complete source itself remains original case material rather than being duplicated into every quote edition.

## Native CLI

The installed command is **starforge merchant-commercial performance**. The source entry is commercial/performance-cli.mjs. Private file paths must be absolute and normalized. An existing output is accepted only when its complete bytes already match.

Open the original case first to obtain its current revision, quote and tariff identities:

    starforge merchant-commercial read \
      --cases-dir /private/merchant/cases --case CASE_UUID

Review the complete native source:

    starforge merchant-commercial performance preview \
      --cases-dir /private/merchant/cases --case CASE_UUID \
      --revision CASE_REVISION \
      --source /private/merchant/usage-source.json \
      --quote QUOTE_UUID --quote-sha QUOTE_SHA256 \
      --out /private/merchant/usage-review.json

Save the exact reviewed source:

    starforge merchant-commercial performance receive \
      --cases-dir /private/merchant/cases --case CASE_UUID \
      --revision CASE_REVISION --request-id REQUEST_UUID \
      --actor "Merchant operator" \
      --source /private/merchant/usage-source.json \
      --quote QUOTE_UUID --quote-sha QUOTE_SHA256 \
      --review-sha REVIEW_SHA256

Use the receiving result's current case revision and performanceSourceId to prepare the later quote:

    starforge merchant-commercial performance revision \
      --cases-dir /private/merchant/cases --case CASE_UUID \
      --revision CURRENT_CASE_REVISION --source-id PERFORMANCE_SOURCE_ID \
      --quote QUOTE_UUID --quote-sha QUOTE_SHA256 \
      --monthly-requests 1500 \
      --draft-out /private/merchant/revised-quote.json

Add --target-tariff-source NEW_TARIFF_SOURCE_ID to use a newer native pricing selection already retained in the case. Without it, preparation uses the parent quote's tariff.

Review and publish that ordinary draft with the existing merchant-commercial preview and merchant-commercial publish commands. The draft's parentId names the original quotation being revised.

Download the complete retained usage source:

    starforge merchant-commercial performance file \
      --cases-dir /private/merchant/cases --case CASE_UUID \
      --revision SAVED_CASE_REVISION --source-id PERFORMANCE_SOURCE_ID \
      --kind SOURCE --out /private/merchant/received-usage-source.json

--kind ATTACHMENT exports the source with its immutable customer-quote binding; --kind REPORT exports the readable comparison. **performance list** lists saved reviews at the selected original case revision.

## HTTP and typed client

All four operations use the original loopback Support listener and selected case:

| HTTP POST | Original case method |
| --- | --- |
| /api/cases/:id/commercial/performance-preview | previewPerformance |
| /api/cases/:id/commercial/performance-receive | receivePerformance |
| /api/cases/:id/commercial/performance-revision | preparePerformanceRevision |
| /api/cases/:id/commercial/performance-download | downloadPerformance |

The request body carries the original workspace/case scope; the case ID is selected in the path. The download returns the complete bytes with filename, length and SHA-256 headers.

The installed ./merchant/commercial-performance-client export supplies createCommercialPerformanceClient({url,caseId,workspaceId}). It provides preview, receive, prepareRevision and download, including TypeScript declarations. It verifies the returned workspace/case identity and full downloaded bytes. A receiving transport failure retains an unknown request outcome; reopen the original case or replay the exact receiving request.

## MCP and full files

Use the original Merchant operator's tools:

- merchant_case_commercial_performance_preview
- merchant_case_commercial_performance_receive
- merchant_case_commercial_performance_revision
- merchant_case_commercial_performance_file

The file reader takes the saved case revision, performance source ID and file kind. Continue through nextOffset with the original readId and expectedSha256 until the complete file is received. A cold reopen uses the same revision, selection and expected SHA-256. The existing merchant_case_commercial_file_reads and merchant_case_commercial_file_release tools manage these reads.

The prepared draft proceeds through the existing quotation preview, publish, customer-response and implementation tools. The original merchant_case_export delivers the complete editable customer case with its full retained performance source.
