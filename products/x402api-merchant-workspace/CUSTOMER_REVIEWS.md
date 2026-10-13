# Customer delivery review and original Support cases

The merchant issues a review desk for one exact invoice edition. The recipient opens that complete HTML without a connection, records attributed feedback, keeps original supporting files and returns the complete JSON through the agreed relationship owner. The merchant compares the issued invoice, current invoice and returned review before recording a disposition. The original Support console carries the same full history in its existing case.

Customer review is separate from invoice payment, authorization, settlement and fulfillment. A customer-entered name is attribution supplied by that person; this file is not an authenticated electronic signature. A merchant disposition records the selected review edition and the operator's reason. It does not alter the original financial outcome.

## Merchant: issue an exact review desk

Open the existing Merchant application and select the original invoice. In **Customer delivery review**, choose **Read customer reviews**, then **Issue review of current invoice**. The server captures the invoice, frozen terms, original activity and available wallet envelope in one original read transaction. It records the selected invoice revision and exact original `invoice.json` bytes, using the same serializer as **Customer delivery → Download customer ZIP**.

Download the issued HTML from **Issued original editions**. Keep its original customer ZIP and delivered result beside it. The complete desk contains the issued invoice and original artifact descriptors; the original result remains in the customer's original delivery. It is not silently copied into a feedback file.

The merchant must use the current connected owner and selected invoice. A concurrent invoice change rejects an uncommitted issue or disposition. That revision check runs inside the same SQLite transaction as the private review record. Project capture pauses new review writes through the existing project lifecycle.

## Recipient: open, inspect and record feedback

Open the issued `Customer_Review_<issue-id>.html` in a browser. It requires no account, provider request or live connection. The actual reviewer and review fields begin empty.

Read **Issued original invoice**, then open the original customer ZIP's `invoice.json` and delivered result with their usual applications. Use **Check an original file** to select those bytes. A matching SHA-256 and byte length are recorded with the file check. The in-browser check supports an original up to 32 MiB; a larger result remains explicitly unverified in this desk and can be checked through the existing original-file tools.

Enter the actual reviewer name, organization, contact and role. Choose the review outcome and describe what was observed. Record invoice and result observations separately.

Add a finding for each distinct question, observation or problem. Select its original artifact, enter the observation and requested follow-up, and choose retained supporting attachments. The complete review supports up to 32 attachments of 8 MiB each, 100 findings and 64 recorded editions, within a 48 MiB complete-file limit. Capacity validation covers every original file, edition and unfinished field before adoption.

Choose **Record this exact review edition** after reviewing the current author and feedback. The recorded edition keeps those fields, original-file checks and attachment references. Later edits form an unfinished alternative; they do not replace a recorded edition. All complete exports retain both.

## Save and independently reopen the whole review

**Save complete copy locally** keeps the complete record in this browser. Each saved copy compares the original opened digest before writing, so another tab's differing save is preserved. When a conflict appears, download the current complete alternative before opening the other saved edition.

**Download complete working JSON** retains all original files, recorded editions and unfinished fields. **Download editable HTML** produces an independent complete desk containing the same current record and application. Open either exported copy to continue the same issue. A malformed or different issued source is rejected before replacing the current work.

**Download complete customer return** requires at least one recorded edition. It includes the full history and any unfinished current draft. The page transmits nothing. Share the selected file through the original agreed relationship owner.

**Print the complete review** prints the full current review and every recorded edition as wrapped text, including all findings, actual reviewer fields, original-file checks, exact attachment references and the complete issued invoice. It does not rely on clipped form controls. Retained binary attachments remain available as original file downloads.

## Merchant: receive, compare and record a disposition

Select the original invoice and choose the returned JSON under **Receive original customer return**. The server accepts it only when its issued source exists in this merchant's private record and its complete immutable review chain is valid. The original returned text and all its bytes remain retained. A repeated identical return keeps its original identity.

Choose the retained return, select an exact recorded edition, enter the merchant reviewer, disposition and reason, then choose **Compare selected return**. Review all three full records: issued original invoice, current invoice and complete returned review. The comparison states whether the invoice changed and whether the return has an unfinished later draft. Entering a different disposition invalidates the ready comparison.

Choose **Record this exact disposition** after that comparison. The server binds the decision to the exact returned file, selected edition, current invoice revision and current review history. The supported dispositions are **follow up**, **accepted** and **declined**. An optional existing Support case UUID records the intended original case join.

## Continue after a lost response

Every mutation has an original UUID and complete retained body. The browser saves that exact request before dispatch. An uncertain response leaves **Receive original pending save** available. This replays the same body and UUID; the original transaction journal returns the prior committed result when it already exists.

A definite rejected request can be closed through **Close rejected request and retain its history**. Its exact request and rejection remain in private work; a new intention uses a new UUID and a fresh source comparison. An uncertain request cannot use that control.

**Save complete private draft** retains unfinished merchant fields without dispatching an operation. **Reopen locally retained review work** continues the stored same-owner, same-invoice record. **Download private review work** transfers the full requests, responses and unfinished disposition to another browser session. These files are private operational records. The operator credential is never included.

The private work limit is 100 MiB and 256 retained requests. The next complete response has reserved capacity before any POST. A record that has reached its limit remains available for saving and downloading; keep it as its complete prior edition.

## Continue in the existing Support case

Choose **Download full Support workspace**. In the existing SF74 Support console, open the intended saved case and use **Customer delivery reviews → Complete merchant review Support workspace**. Review the original invoice and history counts, then choose **Merge reviewed customer history into this case**.

This merges the optional customer review history into the current case draft. Existing diagnostic captures, raw terms, runtime support, service agreements, commissioning records and metadata remain in the same case. Save the case with the original **Save case** control. Concurrent case revisions retain the original conflict handling.

The Support section shows every attributed return, recorded edition, unfinished current review and merchant disposition. Download the exact original returned JSON or its original attachments there. Full workspace export, case-source package and independent case receiving carry the complete review capsule. The case-store save merges retained immutable histories before digest/replay comparison and returns the actual saved history to the browser.

A different merchant or invoice cannot be merged into that capsule. Keep a separate appropriate original case for that invoice.

## Typed client and CLI

The existing `createMerchantOperatorClient` exposes `customerReviews`, `issueCustomerReview`, `receiveCustomerReview`, `compareCustomerReview`, `decideCustomerReview`, `downloadCustomerReview`, `downloadCustomerReturn` and `downloadCustomerReviewSupport`. It preserves the connected store/tenant, bounds the complete response, verifies downloaded bytes and publishes to a private create-only destination.

Use the existing operator connection file and credential environment variable. The following commands read the selected original owner:

```sh
starforge x402api-merchant-operator customer-reviews --connection /private/connection.json --id ORIGINAL_INVOICE_UUID --out /private/reviews.json
starforge x402api-merchant-operator customer-review-issue --connection /private/connection.json --request /private/exact-issue-request.json --out /private/issue-result.json
starforge x402api-merchant-operator customer-review-document --connection /private/connection.json --id ORIGINAL_INVOICE_UUID --operation ORIGINAL_ISSUE_UUID --out /private/Customer_Review.html
starforge x402api-merchant-operator customer-review-receive --connection /private/connection.json --request /private/exact-return-request.json --out /private/return-result.json
starforge x402api-merchant-operator customer-review-compare --connection /private/connection.json --id ORIGINAL_INVOICE_UUID --revision ORIGINAL_RETURN_SHA256 --out /private/comparison.json
starforge x402api-merchant-operator customer-review-decide --connection /private/connection.json --request /private/exact-decision-request.json --out /private/decision-result.json
starforge x402api-merchant-operator customer-review-support --connection /private/connection.json --id ORIGINAL_INVOICE_UUID --out /private/Support_Workspace.json
```

An issue request contains `invoiceId`, `requestId`, `expectedReviewVersion` from the current review history and `invoiceRevision` from the original delivery preview. A receive request contains those first three fields and `text`, the exact complete customer-return text. A decision adds the reviewed `comparisonSha256`, current `invoiceRevision`, `returnSha256`, selected `editionSha256`, `actor`, `disposition`, `note` and optional `supportCaseId`.

Retain that full request file before invoking its mutation. On `UNKNOWN`, replay the same request file. A response received but not saved is reported as `RECEIVED` with the complete result; do not treat output publication failure as a new business operation. Existing different output files are preserved.

## Complete original operating course

`customer-review-receiving.mjs` is joined to the existing `installed-receiving.mjs` programme. It uses the original five completed invoice identities, the existing customer ZIP and actual commissioned result. The course creates one exact review, operates its independent recipient HTML, retains two findings, original supporting bytes and an unfinished following draft, exercises local competing saves, prints the complete review, independently reopens editable HTML, receives and replays the original return and disposition, interrupts an actual replay response and receives that exact pending request, saves and reopens an unfinished merchant disposition, opens the same Support case, exports its whole case-source package and independently receives it.

The earlier completed Merchant project ZIP remains retained. In portable mode the course also exports the same current project after customer review, then independently receives, activates, replays receiving and re-exports that complete follow-on project. Both received databases must retain the exact customer review and request tables. The new private tables are retained by the original full SQLite export/fingerprint. The receiving programme separately checks the original financial/business tables remain identical and the review tables survive the cold reopen. No provider request or new invoice is introduced. The existing provider sentinel remains at zero.

All attempts and complete artifacts stay inside the same private original receiving directory. A completed recipient phase validates its retained files before reuse. A new uncompleted browser attempt uses its own directory. Original source/request IDs and accepted case artifacts remain unchanged.

### Inspect the complete delivery

Before describing this delivery as ready for a customer, the producer must open and LOOK at the actual desktop and narrow screenshots, complete printed PDF pages, issued invoice, original result and every selected outgoing attachment. Capture alone is insufficient.

Operate the important populated, empty, loading, rejection, competing-save and recovery controls. Confirm both findings and all long text appear in the printed review, the 390-pixel view has readable wrapped controls, independent JSON/HTML reopen retains unfinished fields, and the exact Support case/export retains the original return and attachments. Inspect the usable contents of any outgoing ZIP. Keep internal receiving screenshots out of customer attachments unless requested.

Source validation and the authored programme remain distinct from an actual native/browser result. The programme records `AWAITING_PRODUCER_LOOK` until the producer has inspected the real rendered outputs. Existing customer communication remains with its original relationship owner.
