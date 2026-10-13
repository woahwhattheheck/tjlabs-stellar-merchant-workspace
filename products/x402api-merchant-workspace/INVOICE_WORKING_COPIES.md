# Prepare and receive complete invoice working copies

The Merchant workspace retains named unfinished invoice preparations alongside its existing invoice register. A working copy contains the complete reference, description, selected asset prices, original configured terms and, once submitted, the exact original invoice request. The normal merchant database remains the authority for saved invoices, payment requests, authorizations, settlement, delivery and history.

## Prepare several invoices

Connect to the existing operating merchant and select **New invoice**. The **Invoice working copies** panel lists this merchant’s saved preparations. Choose **New working copy**, give it a useful name and enter the reference, description and exact price for each accepted asset.

Typing saves the complete working copy in this browser’s IndexedDB. **Saved in this browser** appears after the transaction commits. **Save working copy** explicitly finishes the pending save. Incomplete references, descriptions and amounts are retained while preparing; the original positive-price and precision requirements apply when saving the invoice.

Each working copy belongs to one original merchant store and tenant. Its UUID also becomes the original invoice UUID. The panel’s saved selection separates unfinished preparations from requests awaiting an original result and invoices already received. Closing the panel finishes its pending save. Reopening the same browser origin shows the same preparations. Browser storage failures leave entered values on screen with an error and **Download working copy** available.

Review **Retained invoice terms** before submitting. It shows the original public payment origin and complete template, including asset/network/recipient versions and precision. If the current merchant configuration changed, select **Review current terms** and inspect the retained prices against the new options. Options removed from the current configuration are removed from that unsent preparation; newly introduced options start unselected. Download the preceding working copy before adopting changed terms when both editions are needed.

## Save the invoice and receive an interrupted response

Select **Review and save invoice** after reviewing the entered fields and selected payment options. The browser constructs the complete original request and commits it to the same working copy before calling the existing invoice writer. Its fields then stay fixed.

The server checks the optional original expectedTerms against the configuration before creating a new invoice. A replay of an existing invoice checks the same original reference, description, prices and frozen terms and returns that original invoice. Existing clients that omit this additive field continue using their original request format.

A successful return must identify the exact retained invoice and its frozen tenant, terms, prices and payment URL. Only then is its original receipt stored. **Open saved invoice** reads the original current invoice again and opens its payment and delivery desk.

When the response is interrupted or cannot be validated, the same original request remains saved. Reopen its working copy, select **Read original invoice** to recover a saved result, or **Continue original invoice** to submit that exact request to the existing idempotent writer. Refreshing a page, changing tabs or opening a downloaded copy never creates a new request automatically.

The original invoice identity stays fixed through all retries. A configuration mismatch requires the original configured terms to be reconciled with the merchant installation; the retained submitted request can be downloaded for that review. Use **Review current terms** while a preparation is still unsent.

The payment desk continues the received invoice through charge creation, wallet request download, buyer authorization, payment recovery and its completed result. See [PAYMENTS.md](PAYMENTS.md) and [CUSTOMER_DELIVERY.md](CUSTOMER_DELIVERY.md) for that existing lifecycle.

## Open complete copies on another browser

**Download working copy** writes the full JSON, including incomplete fields or an unresolved original request. The file contains the original store/tenant/working-copy identities and the complete reviewed terms. It contains no operator token.

Reconnect to that same merchant and select **Open working copy**. Review its name and whether it carries an original submitted request. Opening commits the full copy before making it the selected editor. An existing identical edition opens the retained local copy. If the same UUID already has different content, the panel preserves both the existing browser record and the selected file and explains the difference; use **Reopen saved revision** to continue the local edition.

Downloaded copies remain useful when moving browsers, changing the server address or receiving another operating installation of the same merchant store. IndexedDB belongs to the browser’s exact origin. The complete merchant project contains the database’s saved invoices and original results; include the separate JSON working-copy files when handing over unfinished invoice preparation.

The complete record limit is 256 KiB measured over the same UTF-8 serialization written by the download. A browser retains up to 128 working copies per original merchant. These bounds include all request, terms and status text. Download and remove completed browser copies to make space.

## Concurrent editing and recovery

Each browser save checks the exact saved revision in one IndexedDB read/write transaction. A second tab working from an older revision receives a conflict instead of replacing another person’s work. Its entered fields remain in that tab.

Download the entered copy if it is needed, then use **Reopen saved revision** to inspect the current retained fields. The explicit confirmation identifies the replacement. **New working copy** creates a separately identified preparation after the current one has been saved; it never turns an unresolved original request into another invoice.

Invalid entered fields remain visible with their error, and invoice submission is disabled until they are corrected or the operator explicitly reopens the saved revision. The page warns before closing while a save or unsaved change remains. Disconnecting removes the operator credential and preserves the current valid editor in the page session for reconnection to its original merchant. Committed copies remain in IndexedDB independently. Browser quota or storage errors should be resolved while keeping the complete downloaded copy and current page available.

**Remove browser copy** requires explicit confirmation. It removes only that local preparation; an unresolved submitted request must first receive its original invoice. The server invoice, its business history and separately downloaded JSON remain under their existing lifecycles.

Older versions stored a pending invoice request only under the tenant ID in tab session storage. The panel exposes that original payload under **Earlier tab request**. **Read earlier invoice** receives it only when the current original merchant already has an exact matching invoice. The earlier payload is removed only after its complete bound working copy is retained. **Download earlier request** preserves the original payload while reconnecting to its merchant.

## Source and integration

The implementation uses the existing authenticated merchant server and /api/orders writer:

| Source | Responsibility |
| --- | --- |
| web/invoice-drafts.mjs | Complete portable record, exact decimals, reviewed terms, request and saved-invoice matching. |
| web/invoice-draft-store.mjs | Original owner-scoped IndexedDB selection, atomic revision checks and durable request custody. |
| web/invoice-working.mjs | The existing screen’s prepare, save, reopen, conflict, download and request recovery workflow. |
| workspace.mjs | Additive exact reviewed-term check inside the original invoice serialization. |
| invoice-working-receiving.mjs | Complete same-case browser operation invoked by the original installed programme. |

The normal static assets and both full portable source selections include the complete new workflow and this guide. The typed CreateInvoiceInput accepts optional expectedTerms: { publicOrigin, template }; the existing client sends its exact input without reconstruction. Existing server identity headers, authorization, project-capture coordination and invoice request IDs remain in place.

## Continue the original installed case

Use the existing installed-receiving.mjs invocation from [INSTALLED_RECEIVING.md](INSTALLED_RECEIVING.md), with the same original archived case and current complete source. The new course is called by each live opening in that programme. Received project review keeps its existing read-only experience.

The course prepares an unfinished working copy from the first actual original invoice, saves/downloads it, reloads the same origin and opens the downloaded edition. It creates another local preparation, opens two actual browser tabs on the original saved copy, and retains a competing edit after the original revision advances.

For mutation recovery it derives a complete pending request from the already retained first invoice and permits the browser to submit only that exact original body. The original server returns its existing completed invoice; the course loses one actual response shape, downloads the unresolved working copy, reloads and resubmits the same original request. The five original invoices and existing provider-free receiving configuration remain selected.

Every course invocation uses its own output directory. The original installed receiving result includes all complete JSON downloads and actual desktop/narrow screenshots; its existing completion validator verifies those saved files when reopening a completed run. Browser contexts and the original browser are closed by the same existing programme.

## Inspect the complete delivery

Before describing the outgoing application or attachments as ready for a customer, the producer opens and operates the exact final application at desktop and narrow widths and directly looks at the actual rendered screens. Review the empty selection, populated incomplete copy, exact retained terms, two-tab conflict, interrupted request, original received invoice and storage/error states that occur in the actual operation.

Open every outgoing working-copy JSON through the actual **Open working copy** control in its original merchant. Open the delivered application ZIP and its usable source/application contents, operate the recovered selected invoice, and inspect the customer invoice HTML and original completed attachment through the existing customer-delivery course. For images and PDFs, view the actual rendered image/pages with the available viewer. Download and reopen each selected outgoing format.

Inspect the actual screenshots and files for unreadable text, clipping, overflow, missing controls, styling and misleading state. Correct concrete defects within this same source and operation, then reopen the repaired deliverable. Capturing screenshots or checking DOM values supplies useful operating results; producer viewing completes the visual review.
