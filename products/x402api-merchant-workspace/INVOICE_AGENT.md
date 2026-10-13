# Merchant invoice sources, payment and complete customer delivery

The Merchant invoice agent connects to the existing live Merchant application through its maintained typed operator client. It takes original CSV or JSON bytes through source inspection, a saved import plan, review, creation of the original local invoice drafts, the original charge and buyer authorization, payment reconciliation, complete invoice/result exports, and the original project handover. The received project then opens in the existing Applications intake and review desk.

The maintained server owns the invoice database, import plan, fulfillment and project export. The agent retains complete input requests and delivery files in private host storage. The existing browser, operator CLI and agent therefore operate the same original records.

## Select the original owner

Commission the existing live application with the operator CLI described in OPERATOR_CLIENT.md. Its private connection file contains the original store and tenant UUID, application URL and an environment reference. Record that complete file's SHA-256.

Create an existing private directory for the agent's retained artifacts. Use mode 0700 for its directory and 0600 for configuration and source inputs. All selected paths are normalized absolute paths without symlink parents.

The host declaration is:

~~~json
{
  "schema": "stellar-forge.merchant-invoice-agent.v1",
  "merchants": {
    "delivery": {
      "label": "Delivery merchant",
      "connectionFile": "/private/merchant/connection.json",
      "connectionSha256": "THE_COMPLETE_CONNECTION_FILE_SHA256",
      "tokenEnvironment": "MERCHANT_OPERATOR",
      "exportsDirectory": "/private/merchant/agent-artifacts",
      "sources": {
        "october": {
          "path": "/private/merchant/October_Invoices.csv",
          "name": "October_Invoices.csv",
          "format": "csv",
          "sha256": "THE_ORIGINAL_SOURCE_FILE_SHA256"
        }
      }
    }
  }
}
~~~

Select this file through the Merchant host's merchantInvoiceConnection input. The installed provider is merchant-invoices, its configuration family is merchantInvoices, and its tools begin with merchant_invoice_. The distribution contribution registers it with the same selected x402api-merchant product. Provider discovery loads its catalogue; native source and connection handling load when used.

The sources map is optional. It lets a host select an existing original document by a short name without placing the whole document into an agent request. A caller can instead supply source: {name, format, text}. Every source is checked against the original engine's byte and row capacity. Direct text is limited to 1 MiB of UTF-8; the provider's 8 MiB request envelope allows JSON escaping of those complete bytes.

The connection is selected by its exact file SHA and original store/tenant UUID. Every online call rereads that private connection and the maintained client verifies the server's original owner headers. A newly commissioned address or revised connection is a new explicit host selection. Keep the preceding configuration and its artifacts available for their original delivery records. The same scope is derived from the pinned connection and owner IDs, so an offline artifact reopening uses its original configuration.

## Complete source-to-invoice operation

1. Call merchant_invoice_merchants and select the actual host alias.
2. Call merchant_invoice_context. Receive the full context artifact through merchant_invoice_file and review its configured resource, fulfillment binding, rails, currency precision and current configurationSha256.
3. Call merchant_invoice_source with either sourceFile or source. The original server parser returns the original columns and row count. Receive its full source artifact; preserve the returned source SHA.
4. Choose a stable operation UUID before preparation. Call merchant_invoice_prepare with that UUID, the reviewed configurationSha256 and sourceSha256, the same source selection, and the actual column mapping.
5. Call merchant_invoice_plan and receive the entire artifact. It contains the exact original source, mapping, frozen configuration, every normalized invoice and offered rail, and current status.
6. Review those complete normalized invoices. Call merchant_invoice_run with the original operation and expectedPlanSha256 from that saved plan.
7. Read merchant_invoice_status. COMPLETE means every original invoice is retained with compatible frozen terms. A PARTIAL or CONFLICT status and its complete artifact identify the affected original records.
8. Continue each selected invoice through the payment operation below. Receive the original completed result and complete project handover when available.

The mapping retains original source column names:

~~~json
{
  "key": "Invoice group",
  "reference": "Reference",
  "title": "Description",
  "assetId": "Asset ID",
  "amount": "Amount",
  "amountMode": "decimal",
  "invoiceId": "Original invoice UUID"
}
~~~

invoiceId is optional. When supplied, it names the original invoice UUID column. Without it, the original server derives deterministic invoice IDs from the original operation and grouping key. Rows with the same key describe one invoice's distinct payment options. Amounts stay strings. The original parser enforces configured assets, exact decimal precision, positive amounts and consistent grouped invoice fields.

The complete original preparation request is saved before dispatch. It includes the selected source bytes, mapping, configuration digest, operation and owner IDs. Reusing that operation with another request is rejected by the immutable retained request as well as the original engine.

## Recover the same save

A mutation is sent once per explicit call. The provider carries the maintained client's original outcome and recovery selection.

| Returned condition | Continue the original operation |
| --- | --- |
| Success with requestArtifact and plan/status artifact | Receive all artifact bytes and retain their SHA values. |
| outcome UNKNOWN | Read the named recovery tool using the same merchant and operation. The server may already have saved the request. |
| A prepared original operation is visible | Read its complete plan, review the original planSha256, then continue run if appropriate. |
| Preparation needs explicit replay | Call merchant_invoice_resume_prepare with the same operation and requestArtifact.payload.sha256. It reads and resends the exact retained body. |
| A run was interrupted | Read status and the same plan. Resume run with that original planSha256; the original engine retains already-created compatible invoices. |
| outcome RECEIVED with a local publication error | The response reached the caller. The returned received summary and recovery selection identify it; read the same status to retain its complete current artifact. |
| Project preparation was interrupted | Read merchant_invoice_project_status for its original project UUID. Continue that exact original request according to the maintained project state. |

The request artifact ID identifies its metadata record; the payload SHA identifies its exact JSON bytes. resume_prepare takes the payload SHA. Store both in the calling agent's existing case record.

Configuration changes, source changes, incompatible existing invoices and changed review digests keep the original engine's own errors. The complete response is retained as an artifact, while tool summaries preserve the original state, counts, configurationCurrent and any per-invoice interruption.

## Operate the original invoice through payment

The provider exposes 27 tools across source intake, invoice/payment operations, complete retained files and project handover. Payment actions call the original maintained server and its typed client. Each selected invoice keeps its original UUID, frozen resource, prices, charge, authorization and fulfillment identity.

| Tool | Selected original operation |
| --- | --- |
| merchant_invoice_payment | Read the original invoice, history, current payment state and complete payment envelope. Return full review and envelope artifacts. |
| merchant_invoice_charge | Create or receive the invoice's original charge through its existing idempotency key. Save the complete request before dispatch. |
| merchant_invoice_authorize | Submit the buyer's complete original authorization after checking the exact reviewed envelope SHA. |
| merchant_invoice_reconcile | Continue the original invoice according to its current nextActionAt, retained provider responses and delivery state. |
| merchant_invoice_resume_payment | Read and explicitly replay the exact retained charge, authorize or reconcile request for that same invoice. |

### Review and obtain the original charge

Choose an invoice from the reviewed import plan or revision-pinned register. Call merchant_invoice_payment with its invoiceId. Read the entire returned artifact through merchant_invoice_file. The summary includes state, chargeId, paymentId, nextActionAt, lastError and the retained result description where available.

A draft without a charge has no envelope artifact yet. Call merchant_invoice_charge once. The request is stored privately before the POST. The server uses the invoice's original charge idempotency key and original frozen request bytes. If that invoice already has a charge, it returns the same charge.

Read merchant_invoice_payment again. Its envelopeArtifact contains the complete original payment envelope, and envelopeSha256 identifies the exact UTF-8 JSON bytes including the final newline. Receive and verify that entire file before using it. It contains the original request method, URL, content type, body bytes, provider payment requirement, challenge digest and merchant reference.

### Submit the buyer's actual authorization

Use the buyer's existing authorized wallet/payment route to review the original selected payment option and produce its authorization for this exact envelope. The provider accepts the complete original printable-ASCII authorization string up to 65,536 characters, within the original server's 70,000-byte encoded JSON-body limit. Quotes and backslashes count at their encoded JSON size. This capacity is checked before reserving a request and again when selecting an original replay; the bytes are never truncated. The provider does not generate a signature, select another account or alter the payment requirement.

Call merchant_invoice_authorize with:

~~~json
{
  "merchant": "delivery",
  "invoiceId": "THE_ORIGINAL_INVOICE_UUID",
  "expectedEnvelopeSha256": "THE_RECEIVED_COMPLETE_ENVELOPE_SHA256",
  "paymentSignature": "THE_BUYER_PROVIDED_ORIGINAL_AUTHORIZATION"
}
~~~

The agent first checks the original server envelope against expectedEnvelopeSha256. A mistyped or stale selection fails before reserving the invoice's immutable authorization request, so the caller can receive and select the actual original envelope. The validated complete request is then retained privately. Immediately before its payment POST, the agent checks that same envelope binding again. A saved authorization request remains bound to its selected original envelope.

This call can authorize a real payment. Use only the buyer's actual authorization for the reviewed invoice. The original server retains its exact bytes before contacting the payment provider. The server accepts an identical replay and rejects another signature for the same invoice.

The complete authorization request is private operating data. Its artifact payload contains the original signature so that the same authorized request can be recovered after interruption. Keep the artifact directory and any whole private workspace handover in the original operator's custody. General call summaries, error messages and the receiving summary expose its artifact identity and SHA, without repeating its signature. The existing operator token remains an environment reference and is absent from those saved requests.

### Continue payment and fulfillment

Read merchant_invoice_payment after every received or uncertain mutation. Respect nextActionAt. Call merchant_invoice_reconcile when the original invoice is due. The server processes its original retained response and payment identifiers, reads the provider's current state as needed, and continues its original fulfillment. A pending provider response can require later reconciliation; the call does not replace the payment or original invoice.

| Original state or condition | Operating continuation |
| --- | --- |
| No charge yet | Review the draft and call charge for that same invoice. |
| CHARGE_UNCERTAIN | Read payment and explicitly continue reconciliation using the original charge request. |
| A charge is retained and authorization is needed | Receive the full original envelope and obtain the buyer's authorization for it. |
| PAYMENT_PENDING or PAYMENT_UNCERTAIN | Retain the current payment record and nextActionAt, then reconcile that same invoice when due. |
| SETTLEMENT_CONFIRMED or FULFILLMENT_PENDING | Continue the original reconciliation/fulfillment workflow and retain its resulting state. |
| FULFILLMENT_INTERRUPTED | Inspect the complete review artifact and original fulfillment condition before continuing the existing workflow. |
| PAYMENT_FAILED or CHARGE_REJECTED | Inspect the complete original provider outcome. Preserve that invoice and its history; do not substitute an authorization or treat it as a paid result. |
| COMPLETE | Receive merchant_invoice_result. It returns the original verified delivery bytes. Reconciliation verifies that retained result. |

The complete review artifact carries the original engine's actual fields and history. Use it if the summarized lastError needs context. The original server owns its due-time logic, webhook processing and terminal-response handling; the agent adds no independent payment scheduler.

### Recover an uncertain payment call

Every payment mutation is explicit. A lost response or a successful response whose original invoice identity cannot be validated returns outcome UNKNOWN with recovery pointing to merchant_invoice_payment for the same merchant and invoiceId. Read that selected status before deciding whether an explicit replay is needed.

If a response was received but publishing its local artifact failed, outcome RECEIVED includes the original received state and the same recovery selection. Reading payment again retains the current complete state; it does not require another payment submission.

For an explicit replay, keep the original requestArtifact.payload.sha256:

~~~json
{
  "merchant": "delivery",
  "invoiceId": "THE_ORIGINAL_INVOICE_UUID",
  "action": "authorize",
  "expectedRequestSha256": "THE_ORIGINAL_SAVED_REQUEST_PAYLOAD_SHA256"
}
~~~

Pass this to merchant_invoice_resume_payment. action is charge, authorize or reconcile. The provider reads the original retained request, verifies its exact SHA and invoice identity, and invokes the same maintained action. An authorization replay also repeats the envelope binding check. It never accepts replacement authorization bytes through the resume tool.

Each action has one original private request per selected invoice and pinned connection. Repeating reconcile deliberately uses that same original invoice request while observing the engine's current state. The original server controls whether any provider call is due. Idempotent tool metadata means the original identities and actions are retained; it does not mean the call is read-only. The four payment mutation tools declare openWorld:true because the maintained server may contact the original payment provider.

## Receive complete invoice and project files

| Tools | Original output |
| --- | --- |
| merchant_invoice_register | Revision-pinned invoice page and original selection. Continue its cursor with that same revision. |
| merchant_invoice_invoice | Full original invoice and event history artifact. |
| merchant_invoice_envelope | Original payment request envelope artifact. |
| merchant_invoice_result | Complete verified original retained delivery bytes. |
| merchant_invoice_register_export | Complete original CSV or JSON for the reviewed selection and revision. |
| merchant_invoice_project | Complete original project capability artifact. |
| merchant_invoice_project_begin | One original complete-project request with its retained UUID. |
| merchant_invoice_project_status | Current original export state. |
| merchant_invoice_project_manifest | Complete original source, workspace and reservation inventory. |
| merchant_invoice_project_download | Complete original SHA-verified project ZIP. |

Read project status until the original operation is COMPLETE, then retain its manifest and ZIP. Select that exact archive and SHA through the existing managed x402api-merchant-project-intake application described in PROJECT_INTAKE.md. The merchant_project_* tools in PROJECT_AGENT.md receive that managed selection and review the received invoices and results. The source plan is inside the original workspace and travels in the complete project archive.

Each artifact has a stable artifactId and a payload containing name, content type, byte length and SHA-256. Its metadata also retains the original pinned connection, store and tenant, source kind and relevant operation/invoice/revision.

merchant_invoice_file accepts the artifact ID, expectedSha256, offset and a limit from 1 to 196608 bytes. It returns base64 bytes, current offset, nextOffset and readId. Continue until nextOffset is null. Verify the complete byte count and SHA after decoding. A released or expired descriptor can be reopened using the same artifact, SHA and offset without readId. merchant_invoice_file_release releases that temporary descriptor while the complete artifact remains available.

merchant_invoice_artifacts pages immutable artifacts by artifact ID. These reads work after the live application stops and after the provider reopens. Original file metadata and descriptors are revalidated when selecting retained bytes.

## Typed integration

The underlying supported client is still createMerchantOperatorClient from operator-client.mjs and operator-client.d.mts. It exposes intakeContext, inspectIntakeSource, prepareIntake, readIntake, exportIntake and runIntake alongside inspectInvoice, createCharge, paymentEnvelope, submitPaymentAuthorization, reconcileInvoice, and the complete original result and project methods.

For a configured local host, the same complete consumer can be used directly:

~~~js
import {readMerchantInvoiceConfiguration}
  from './stellar-forge/mcp-merchant-operator/merchant-invoice-connection.mjs';
import {MerchantInvoices}
  from './stellar-forge/mcp-merchant-operator/merchant-invoices.mjs';

const selected = await readMerchantInvoiceConfiguration('/private/merchant/invoice-agent.json');
const invoices = new MerchantInvoices({merchantInvoices:selected});
try {
  const context = await invoices.call('merchant_invoice_context', {merchant:'delivery'});
  console.log(context.native.configurationSha256, context.native.artifact);
} finally {
  await invoices.close();
}
~~~

close drains admitted calls and retained descriptors. The shared Merchant provider lifecycle owns the host-level shutdown. Input files, connection files and output artifacts remain private host data; tokens are read from the selected environment and are absent from returned configuration and artifacts.

## Operate the original complete customer case

The existing installed-receiving.mjs --portable course now calls invoice-agent-receiving.mjs during its original live Applications opening. It derives a receiving source from the actual five completed invoice records and their original IDs and offers, freezes that exact source, prepares and explicitly replays the original import, reviews it and runs it through the original engine. The five compatible original invoices stay the same records.

The payment course reads the exact retained authorizations from the original private database snapshot. It reviews each original envelope, calls charge, authorize and reconcile, and explicitly replays each action through its retained request SHA. These already completed invoices keep their original charge, payment, result and signature identities. The existing provider sentinel must observe zero upstream requests, and the original before/after business-table fingerprints must match. The programme generates no new authorization and adds no invoice to this completed customer case.

The same browser creates the original complete project export. The agent reopens that very project operation and receives its identical manifest and whole ZIP. Its complete source, plan, request, invoice, payment review, authorization request, envelope, result, register and project artifacts are downloaded with original SHA checks. A deliberate descriptor release exercises the original resumed-file offset without changing the file identity.

After the actual Applications stop, the programme reopens the retained files through a new provider owner using the same configuration, without contacting the stopped server. The original installed programme then continues its native portable receiving, read-only browser, activation and cold reopening. The existing received-review-receiving.mjs course carries that exact ZIP through managed intake and the separate received-project agent.

Previously completed browser/agent result files remain their original editions. The new payment course is recorded when that original live opening executes the current programme; reopening an older completed result validates its existing files without rewriting its history.

The original receiving input remains the existing five-invoice commissioned archive. Its business-table snapshots, original payments and result bytes are preserved by that same programme. Native completion is recorded only by the original operated result and its complete delivery; source publication and a syntax parse are recorded separately.

## Customer review, merchant disposition and Support

The existing invoice provider also operates the complete customer-review workflow described in [CUSTOMER_REVIEWS.md](CUSTOMER_REVIEWS.md). Its catalogue has 38 tools: the original 27 invoice/payment/project tools and eleven customer-review tools. The original invoice, delivered result, return, merchant disposition and Support case keep their own identities.

Customer-entered names and contact details remain attributed statements. A merchant disposition records the operator's review of one exact returned edition. Neither action changes payment, settlement or fulfillment, and these eleven tools make no external customer contact.

### Select the complete returned file

Add an optional `reviewReturns` map to the same merchant's host declaration:

~~~json
{
  "reviewReturns": {
    "client_return": {
      "path": "/private/merchant/Original_Customer_Return.json",
      "name": "Original_Customer_Return.json",
      "sha256": "THE_SHA256_OF_ALL_ORIGINAL_RETURNED_BYTES"
    }
  }
}
~~~

This is a member alongside `sources`, `connectionFile` and the other existing fields; it is not a separate connection. The map accepts up to 100 explicit file aliases. Each selected file is private, is read without following symlinks, and must match the host's complete SHA. A file cannot be substituted under the same selection. Updating the host selection does not alter any already retained request or artifact.

A review may contain original attachments and can be up to 48 MiB. Select such a file by its host alias. Inline `text` is available for a complete smaller return up to 1 MiB of UTF-8. Choose exactly one of `reviewFile` or `text`; both require `expectedReturnSha256`. Do not truncate a file to fit inline input. The consumer validates the original review, issued invoice/owner identity, every recorded edition and original attachment before retaining a receive request.

### Operate one exact review

| Tool | Complete operation |
| --- | --- |
| `merchant_invoice_review_status` | Retain the full original history and read its `reviewVersion` plus current `invoiceRevision`. |
| `merchant_invoice_review_issue` | Retain a stable request UUID, expected history version and selected invoice revision, then issue the original offline review. |
| `merchant_invoice_review_document` | Receive the complete independently editable HTML for its exact `issueId`. |
| `merchant_invoice_review_source` | Inspect the actual returned file, verify its original bytes and retain a source artifact without adding it to the merchant history. |
| `merchant_invoice_review_receive` | Retain the complete request and adopt that returned file into the same original invoice history. |
| `merchant_invoice_review_compare` | Receive the full issued/current invoice comparison and complete returned review, including every recorded edition and unfinished draft. |
| `merchant_invoice_review_decide` | Record the merchant actor, disposition reason and decision against the selected edition and exact current comparison. |
| `merchant_invoice_review_resume` | Explicitly replay the byte-selected original issue, receive or decide request. |
| `merchant_invoice_review_return` | Download the exact original returned JSON bytes. |
| `merchant_invoice_review_support` | Download the whole Support workspace with original issued sources, returns and merchant dispositions. |
| `merchant_invoice_review_response` | Download the actual retained merchant decision as JSON or a complete editable customer response desk. |

Start with `review_status` on the selected invoice. Receive its history artifact using the existing `file` tool. Choose a new request UUID and pass `invoiceId`, `requestId`, `expectedReviewVersion` and `invoiceRevision` to `review_issue`. The native owner checks that revision inside the same transaction that records the issue. Receive `review_document` using the returned issue ID. The existing authorized customer channel handles delivery.

When the customer's actual file returns, use `review_source` with its original SHA. The source result identifies the original issue, complete file size, recorded editions, attachment count and whether the returned working draft differs from its latest recorded edition. Receive the full artifact and examine it. A file without a recorded edition cannot be adopted as a customer return.

Call `review_receive` with that exact source selection, a stable new request UUID and the history version observed through `review_status`. The original native writer retains every return and does not overwrite earlier editions. Then call `review_compare` with the returned `returnSha256`. Its full artifact includes the issued snapshot, current snapshot, complete customer return and attributed edition choices. `invoiceChanged` reports whether the invoice changed after the original issue; the recorded customer text is not relabelled as a review of the newer invoice.

After examining the comparison, pass these fields to `review_decide`:

~~~json
{
  "merchant": "delivery",
  "invoiceId": "ORIGINAL_INVOICE_UUID",
  "requestId": "STABLE_DISPOSITION_REQUEST_UUID",
  "expectedReviewVersion": "REVIEW_VERSION_FROM_COMPARISON",
  "invoiceRevision": "CURRENT_INVOICE_REVISION_FROM_COMPARISON",
  "comparisonSha256": "COMPLETE_COMPARISON_SHA256",
  "returnSha256": "ORIGINAL_RETURNED_FILE_SHA256",
  "editionSha256": "THE_REVIEWED_RECORDED_EDITION_SHA256",
  "actor": "Actual merchant operator",
  "disposition": "follow_up",
  "note": "The actual disposition reason and required clarification.",
  "supportCaseId": "EXISTING_SUPPORT_CASE_UUID"
}
~~~

The supported dispositions are `accepted`, `follow_up` and `declined`. The Support case UUID is optional and refers to the existing case; the agent does not create a second case. The native owner checks the full comparison, invoice revision and history version before recording a new decision. A concurrent change requires a fresh comparison and an explicitly revised request.

Receive `review_support` as a complete file. Open it with the existing Support console or merge it into the selected saved case through its normal revision-checked workflow. The full capsule retains exact invoice source bytes, original returns and attachments, all recorded decisions and unfinished returned work. The original Support save merges immutable history while preserving the case's diagnosis, source slots, commissioning, service work and runtime handoff. The agent exports the file; it does not bypass that case writer.

The complete Merchant project archive retains the two original customer-review/request tables along with invoices, payments, attachments and source. The existing project tools can therefore hand over the operated workspace after the review operation.

### Return the recorded merchant response

Use `merchant_invoice_review_response` with `merchant`, `invoiceId`, the actual retained `decisionId`, and `format: "json"` or `"html"`. It reads the original decision and downloads complete verified bytes into the same private artifact store. The JSON identifies the exact prior customer edition and original returned file; the HTML includes the original customer record, earlier editions, attachments, unfinished draft and selected response.

The recorded disposition reason and merchant reviewer appear in the customer-facing download. Review them before sharing through the existing relationship owner. This read-only operation sends no message. Private native request IDs and the optional Support case UUID are omitted.

The recipient can import the JSON into the original desk while preserving entered work, or open the complete response HTML. The following recorded customer edition references the original response hash. When that return is selected through `reviewReturns` and received normally, the same native writer checks the response against its actual decision. Original response bytes, prior editions and later unfinished work survive Support and full-project exports. See [the complete response workflow](CUSTOMER_REVIEWS.md#merchant-response-and-following-customer-review).

### Recover the same review request

The private request is saved before any review POST. For `receive`, that request contains the complete original returned text; changing or removing the host input later cannot change a pending request. For `decide`, it contains the exact selected edition, comparison, actor, disposition reason and optional original case ID.

If the result is `UNKNOWN`, inspect `review_status` for the same invoice. Use `review_resume` with the original `action`, invoice UUID, request UUID and `requestArtifact.payload.sha256` when explicitly receiving that save. The native journal checks its original saved request before current-state guards, so an already completed save returns its original response even if the current history version subsequently advanced. Never substitute the new history version inside that old request.

A `RECEIVED` result with an artifact publication error means the native response reached the consumer. Its retained summary and recovery selection remain available; the same exact request can receive the original outcome again. A definite native version/source conflict remains the original native error. Inspect the history before preparing any replacement operation.

The complete requests, response artifacts, original returned bytes, comparisons, HTML and Support files remain available through the existing paged `artifacts` and `file` tools after the server stops. Review downloads verify the original owner's response, full byte count and SHA, then publish an immutable private artifact. No customer source or authorization is placed in a metadata-only summary.

### Continue the original operating case

`customer-review-agent-receiving.mjs` consumes the completed original customer-review course. It selects the exact retained issue, receive and decision request/result files; replays all three through this provider; compares the original native responses; receives the original review HTML, returned JSON and full Support workspace; and verifies the unchanged five invoices and review history. When the original course includes the merchant-response chapter, it also receives both exact response formats and validates their retained original bytes. The agent course generates no customer return, new invoice, payment authorization or replacement request identity.

The normal installed programme adds one original managed opening for this agent course after the customer-review browser course. It stops that owner through the existing Applications lifecycle, then reopens every retained artifact without a server or credential. The same installed operation still requires zero provider calls, unchanged business-table fingerprints, complete project receiving and cold reopening.

An installation whose original `complete.json` was already saved can operate this addition explicitly with `--review-agent-continuation`. Run the current `installed-receiving.mjs` with the exact original `--repo`, `--source-commit`, `--original`, `--root`, browser paths and `--portable` selection, adding only that flag. Keep `--source-commit` at the original installation's source: the new consumer is selected by the current script and its separately retained complete 129-file source inventory, including the original receiving script.

That continuation records the SHA of the original completion and customer-review course, the selected consumer source inventory, original owner/invoice and exact request files. It reopens the same saved Application with its original installed source, operates the original native journal and stops that process. Its separate completion receipt follows offline artifact checks and unchanged original database fingerprints. The original root completion, source selection, customer-review completion and browser results remain intact. Repeating the continuation verifies its original stopped process and full saved files.

Source review and explicit journal replay are recorded as such. Actual native acceptance and the producer's inspection of the original customer HTML, complete print output, attachments and exported files remain part of the original receiving delivery.
