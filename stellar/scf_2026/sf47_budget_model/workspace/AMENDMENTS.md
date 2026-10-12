# Reviewed plan amendments in Grant Operations

Use **Delivery & cash → Plan amendments** in the existing SF47 workspace to change the selected planning baseline of an existing operating case. The original planner remains the source of saved budget, milestone, cost and calendar revisions. This page receives one of those exact revisions, shows the complete comparison, retains an operator review, and applies that selection to the same case.

Recorded work, invoices, invoice allocations, cash, award observations, purchases, delivery outcomes, source attachments and previous reviews keep their original identities. Each amendment edition retains the complete before and selected plans, the case snapshot used for comparison, its changed fields, original record links and explicit decision.

## Select and review the change

1. Save the intended change through the ordinary planner. For a partial amendment, start from the intended baseline, edit only the selected parts, and save that complete native revision. Its original content SHA-256 identifies the proposal.
2. Open the existing Delivery & cash case, then **Plan amendments**. Select **New amendment draft** and the exact saved planning revision. The page shows both the current case baseline and every available original saved revision.
3. Enter an as-of date, reason and decision basis. An internal planning decision can use **Internal plan**. An issuer or customer decision also requires its retained source document, original reference and date. Attach that original file through the case's existing Sources view, then select it here.
4. Choose **Preview complete amendment**. Read the full changed-field table, record-reference conflicts, package amounts and hours, and original payment-derived clocks.
5. Save the proposal. Reopen its saved edition, record **Approve** or **Return for changes**, and retain the recording operator, statement and source references. This is the existing operator's explicit decision; the application does not introduce another authority or review role.
6. For an approved compatible edition, select the acknowledgment and apply that exact edition to the case. The native request binds the case version, amendment edition and hash. The result reports the newly selected plan revision while retaining the original case ID.

A later revision of a proposal is another immutable amendment edition. An applied amendment remains fixed; the next change starts a separate amendment. Historical proposals and decisions remain available from the same page.

## Package identity and commercial exposure

Renaming a package or tranche preserves its original identity. A package referenced by recorded work, an invoice line, a deployment or a saved completion assignment must remain present and keep its original tranche. Existing completion assignments retain their ordered package set. Submitted or accepted outcomes and completed assignments also protect the scope they already record.

The comparison exposes each package's planned amount, recorded invoice amount, recorded payments and recorded hours. It displays the remaining amount or hours and any recorded excess separately. Reducing a budget below recorded invoices, payments or hours therefore leaves that excess visible. Cash allocations remain attached to their original invoices and invoice lines.

These values use the existing native operating report. A remaining planning amount describes the difference from those retained observations; it does not establish an unrecorded contract balance or a bank balance. The selected plan's own calendar start is shown separately from the existing case calendar start. Payment-derived completion clocks are compared in full and must remain unchanged.

## Concurrent edits and interrupted requests

The original native case version is checked inside the same Workspace transaction used by other operations. Saving and reviewing a proposal advance the case version. An unchanged business snapshot keeps the same amendment preview identity across those own workflow events. New work, sources, invoices, cash, completion assignments or other business changes require a fresh comparison and a newly saved proposal edition.

The browser retains each local amendment draft in IndexedDB with its own identity and revision. Another tab cannot silently overwrite that draft. The page preserves later text while a request is in flight.

Before dispatch, the exact native request is retained in the local draft. If its reply is lost, **Retry exact request** sends that same body and request ID. A committed result is recovered through the original native replay mechanism. Its saved amendment identity is applied to the originating draft on normal completion and replay. A later local edit remains local; it cannot create a duplicate proposal merely because the original reply was uncertain.

An authentication failure retains the pending request. Renew access through the existing workspace sign-in and reopen the same draft. A known native rejection can be explicitly resolved while keeping the entered text. Download the complete local draft when handing an unresolved browser operation to the same original operator. If browser retention fails, a persistent recovery panel appears without replacing the visible fields. Its complete download includes proposal inputs, review statement and sources, application note and displayed acknowledgment. **Download fields and reopen saved draft** retains that current selection as a file before loading the original saved browser edition; the native pending request remains available for exact replay.

## Native API

The original access token, origin rules, Workspace lease and transaction remain in effect.

| Operation | Native route |
|---|---|
| Current baseline, saved revisions and amendment heads | GET /api/operations/{case}/amendments |
| Complete selected edition and history | GET /api/operations/{case}/amendments/{amendment}?revision={edition} |
| Full comparison | POST /api/operations/{case}/amendment-preview |
| Save, review or apply | POST /api/operations/{case}/command |
| Complete operating case and original planner history | GET /api/operations/{case}/export.zip |

The preview body is:

    {
      "expectedVersion": 12,
      "inputs": {
        "selectedRevision": 4,
        "expectedContentSha256": "<actual native planning content SHA-256>",
        "asOfDate": "2026-10-12",
        "reason": "Retain the selected package estimate and delivery change.",
        "basis": {
          "kind": "INTERNAL_PLAN",
          "reference": "",
          "date": null,
          "sourceIds": [],
          "note": "Recorded internal planning decision."
        }
      }
    }

Every mutation uses the original command envelope:

    {
      "expectedVersion": 12,
      "requestId": "<one original request ID>",
      "actor": "<recording operator>",
      "note": "<reason for this operation>",
      "action": "amendment.save",
      "data": {
        "amendmentId": null,
        "expectedRevision": 0,
        "inputs": "<the complete inputs object used for preview>",
        "expectedPreviewSha256": "<actual returned preview SHA-256>"
      }
    }

For a revised proposal, supply its existing amendmentId and exact expectedRevision. Review data contains amendmentId, expectedRevision, expectedAmendmentSha256, expectedPreviewSha256, decision, statement and sourceIds. Apply data contains amendmentId, expectedRevision, expectedAmendmentSha256 and acknowledgeBaselineChange:true. Use the native response's actual case version and original amendment identifiers rather than the illustrative numbers above.

The headless CLI adds **operations amendments**, **operations amendment-show** and **operations amendment-preview** to the existing workspace entry point. Selection flags are --case, --amendment, optional --revision, --expected-version and --inputs as appropriate. Save/review/apply use the existing **operations command** entry with --action amendment.save, amendment.review or amendment.apply and the original --data, --actor, --request-id, --expected-version and --note selections.

The maintained typed client exposes read('amendments', selection), read('amendment', selection), amendmentPreview(caseId, expectedVersion, inputs), and the same original command(caseId, body). The Merchant operator exposes merchant_grant_amendments, merchant_grant_amendment and merchant_grant_amendment_preview; merchant_grant_case_command carries the three native mutation actions. Original verified model-input references and original request replay remain selected through that provider.

## Complete receiving and historical plans

The ordinary operating-case ZIP now includes amendment-history.json and amendment-changes.csv when a case has amendments. operations.json retains every complete amendment edition. planning.zip still contains the original source and every native planning revision. Existing source files, work/intake originals, invoice and cash records, commercial records, installations, forecasts, portfolios and reviews travel through the same complete export.

Import verifies every amendment hash and edition chain against the native event history, the original planning source and saved revision, the selected business snapshot, review and application. The final selected baseline must join the original case-creation pin through the complete applied chain. Work and invoices created together by original source intake are reconstructed from that intake's exact retained native snapshots.

Older forecasts, portfolios, installations and work/intake selections are checked against the plan that applied at their original case version. Their saved snapshots remain unchanged when the case later adopts a different baseline. A receiving workspace imports the complete case through its ordinary native import and reopens both the current selected plan and all historical amendment editions.

Each case supports up to 50 amendment identities and 300 total editions within a 12 MiB complete amendment-history bound. The original 32 MiB complete operating-bundle bound also applies. A mutation which would exceed that complete export bound rolls back within the original transaction, preserving the previously exportable case.

## Source and operating validation

The implementation is in operations_amendments.py, operations_amendments.mjs and operations_amendments.css, composed into the original Operations, HTTP, CLI, agent client and managed launch source. The grant-operations distribution selects the complete existing SF47 component.

The first source edition is reviewable at the original amendment branch. Native operating and browser receiving outcomes are recorded separately when actually completed; authoring or parsing alone does not establish those outcomes.
