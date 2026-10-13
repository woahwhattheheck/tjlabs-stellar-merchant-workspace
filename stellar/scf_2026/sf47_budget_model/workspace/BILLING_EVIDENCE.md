# Billing evidence

Billing evidence explains original milestone, expense and hourly Work charges for one customer and a reviewed service period. It uses the existing Operations case, original billing histories and native Receivables account. Saving an explanation creates an immutable source edition; it does not draft, issue, credit, void, allocate or pay an invoice.

## Open and select

Open the original Operations case and choose **Billing evidence**. Lead and finance operators use the existing staff identity and selected-case access. The local catalog lists original account/customer identities, complete charge chains and saved revisions.

Choose the original account/customer, a title and a customer introduction. Set **Service period starts/ends** separately from **Native account as of**. The account date controls the original customer account export. It is not a substitute for service-period dates, and linked invoice balances are observations at the saved native revision/time, not historical recalculations.

Select each original chain once. Inspect its source dates, prepared/current amount, original invoice IDs and correction history. Choose **Original source dates wholly within period** only when every source period establishes inclusion. Unknown, overlapping or outside dates require **Explicit reviewed inclusion** and an internal reason. No line is automatically prorated and correction histories are never added together as separate billed totals. Native invoices outside the selected explanation stay visibly outside evidence coverage.

Write the customer-facing explanation for every selected chain. The introduction and these explanations will be shared. Supplemental descriptions and quantities are separate explicit choices. These controls affect supplemental source explanation only: unchanged issued invoice/credit documents still contain their original customer-facing descriptions and quantities. They are not document-redaction controls.

## Review and save

Choose **Preview selected evidence**. Review the service period, account cutoff, source inclusion reasons, current native observation revision, correction chain and selected disclosure. Any source-selection or disclosure edit invalidates that preview. Record the original operator and choose **Save this reviewed evidence**.

The desk retains the complete actor-bound request and request ID before sending it. If the response is lost, use **Resume original save**. The backend reopens the exact original request result before any new native read. It does not create another edition. Download the working desk or original request if further receiving is needed.

A documented pre-save refusal retains its original request and error in history. **Revise refused request** is available only for that explicit refusal; correct the selection and preview a fresh request. Transport errors and unknown outcomes stay pending. Do not clear them by inventing another review.

A saved receipt identifies reviewId, revision, sourceId, sourceSha256, case version and original requestId. A later UI refresh failure does not invalidate that receipt. Reopen the saved edition from the revision list or resume the retained request when its response remains uncertain.

## Frozen explanation and current observations

Select an exact saved revision. Its report, original source history, account archive and native document bytes are frozen. **Compare with current observations** performs new reads without replacing the saved edition. If the original source has changed its dates or the native service is unavailable, retain the saved explanation and the explicit comparison outcome.

**Prepare next reviewed revision** copies the earlier selection into a new review. Recheck current source hashes, inclusion reasons and disclosure. Saving appends a revision to the same review; prior sources and original request history remain intact.

## Download, inspect and receive

**Customer evidence ZIP** contains report.html/json/csv, the unchanged full native customer account.tar for the selected account cutoff, linked immutable invoice/credit documents and the original file manifest. The complete account can include other entries outside the explanation's selected service-period chains. The report marks later-dated linked evidence and links directly to the actual invoice/credit HTML. Supplemental source disclosure does not remove issued native document fields.

**Complete internal case ZIP** additionally retains the complete Operations case, frozen private source review, original histories, terms, cost/rate records and selected metadata. It is a private working case and is not a customer attachment.

Both download controls name the exact saved revision and work offline from frozen source. Use **Inspect downloaded evidence ZIP** to independently reopen either actual download, validate its complete original bytes and read the customer-safe report. Inspection is read-only. Browser/API JSON transport remains 32 MiB including base64, so direct browser inspection accepts a ZIP under 24 MiB. The native CLI can inspect complete bundles up to the backend's 64 MiB bound. The customer ZIP cannot be imported as an Operations case. Receive the internal ZIP using the existing explicit Operations import, preserving its original source histories, IDs and requests. The native financial account stays under its existing owner.

**Save working desk/Open saved working desk** preserve selected fields and request/refusal history for the same case and staff context. They are not substitutes for the full internal case export.

## Original HTTP and command-line interfaces

Routes remain under `/api/operations/{caseId}/billing-evidence`:

- GET: local catalog.
- POST `/preview`: exact selected case version, prior review/revision and selection; original native reads only.
- POST `/save`: the same request plus original requestId, actor and expectedPreviewSha256.
- GET `/{reviewId}?revision=N`: selected saved revision; omit revision to read the latest.
- POST `/{reviewId}/compare` with `{"revision":N}`: compare without modifying it.
- GET `/{reviewId}/export.zip?revision=N&audience=customer` or `audience=internal`.
- POST `/inspect` with the complete original ZIP encoded as contentBase64.

The existing Operations CLI adds `billing-evidence-catalog`, `-preview`, `-save`, `-show`, `-compare`, `-export` and `-inspect`. Use the original `--case`; preview/save read the complete request via `--file`, show/compare/export use `--review` and optional `--revision`, export uses `--audience` and `--output`, inspect reads the actual ZIP via `--file`. Requests retain their original shape; do not reconstruct them from normalized report text.

The maintained client exposes billingEvidenceCatalog, billingEvidencePreview, billingEvidenceSave, billingEvidence, billingEvidenceCompare and billingEvidenceInspect. `download('billing-evidence',{caseId,reviewId,revision,audience})` uses the existing complete native download transport. Matching `merchant_grant_billing_evidence*` tools preserve immutable requests and native file receiving; `merchant_grant_export` requires an explicit audience. The existing case-import tool receives only the complete internal handover.

## Complete original producing course

The existing `operations/scf-commercial-changes-receiving-f8c1-20261013/` programme keeps the original archived customer account unchanged, restores its private receiving copy, and completes the original milestone, expense and hourly Work journeys. It then invokes `billing_evidence_course.py` on those same actual three-domain records, freezes and replays the explanation, exports and independently receives it, and verifies that all financial rows remain unchanged.

The adjacent `course/browser-evidence.cjs` operates the actual served desk using the original course's Chromium/Playwright distribution and existing server. It opens the original saved review, compares, operates supplemental disclosure controls, previews a successor, loses one actual successful save response, resumes the exact original request, downloads both audiences and the complete case, reopens both actual ZIPs, and renders the original report plus every linked native HTML document at desktop and 390px. The complete updated case then enters the original independent/cold native receiving and opener phases.

The producing agent must personally open and LOOK at the actual outgoing desk/report/native documents and every retained screenshot. Operate meaningful controls, full downloads and cold reopening in light and dark embedding contexts. Inspect all ZIP contents and all attachments, not only a cover page. Fix concrete defects in the actual product and repeat only the affected journey. Source parsing or a saved screenshot is not a claim of rendered acceptance. Respect Bryce's exclusive local in-app-browser hold; the course must use the existing authorized isolated runtime and current browser owner.

All source, original account/customer inputs, immutable source hashes, actual receipts, screenshots and failure continuations stay together in the existing operation. No new financial writer, statement model, generic receiver or private Git publication is introduced.
