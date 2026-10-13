# Reviewed adoption of returned comparison work

This operator is part of the original Research workspace. Open the author dossier, choose **Comparisons**, and use **Adopt returned comparison work** below the existing comparison and original-output desks. It uses the existing authenticated listener, original returned-source receiver, dossier journal, portable export, and browser draft database.

## What is adopted

An incoming branch remains an immutable source. A named author selects one exact returned protocol and an explicit set of candidate editions, runs, judgments, and decisions. A complete preview lists every dependency, original source binding, destination identity, and planned native request. Accepting that preview creates ordinary author-side comparison operations. It does not splice foreign history into the author's history, change raw measurements, rerun a model, recompute metrics, or assign the contributor's original review to the accepting operator.

The incoming question and referenced source editions must match the author dossier completely. The preview includes both original and current question records. Missing or different prerequisites are visible findings. Use **Open Returned work review** to review those prerequisites through the maintained source workflow before returning here.

The original return receiver is the only file intake. This pane selects its existing source descriptor and complete branch, including the original filename, SHA256, byte count, ancestor, and incoming head. It has no parallel foreign-file upload.

## Review and destinations

1. Select **Retained returned source**, then **Inspect returned protocols**. The inventory includes every protocol version in that source.
2. Select **Exact incoming protocol** and **Start review of this returned protocol**. This creates a separate working copy bound to the complete inspected author revision and original source.
3. Enter the accepting operator identifier and name, and a substantive adoption review note. Incomplete text is retained as typed.
4. Select the exact candidate, run, judgment, and decision versions. Search and page the complete inventories. Read the original record details; download original raw runs and artifacts where needed.
5. Use **Include recorded dependencies of my selection** to explicitly include the recorded closure. A decision can require judgments, runs, and candidates. A judgment can require runs and its candidate. A run requires its candidate. Preview also checks this closure independently.
6. Choose the author protocol destination:
   - **Create a new author comparison case** creates a new case with the complete returned protocol definition.
   - **Create a protocol successor in an existing case** uses the exact selected current author head. A changed head requires another reviewed basis.
   - **Use an exact existing author protocol** requires the full same definition.
7. Choose each candidate destination. A new candidate is explicit; an existing candidate must have the full same definition in the selected exact author protocol.
8. Choose **Prepare complete adoption review**. Read findings, the original/current question records, every source binding, complete original-to-author mappings, and the ordinary operation sequence.
9. Choose **Freeze this exact adoption request** only for an eligible plan. The complete request includes its original UUID, author revision, actor, review time/note, source selection, targets, and exact preview digest.
10. Choose **Apply or receive original adoption**. Every retry sends that exact retained body. **Look up original adoption result** retrieves the same UUID without creating an operation.

NEW_CASE and NEW candidates are proposed destinations; the preview provides the actual deterministic native identities. The pane does not label a target as accepted until the result's accepted mappings say so.

## Partial acceptance and continuation

The engine first retains a plan and then executes its ordinary requests in order. A lost response can therefore occur after some operations have committed. The browser saves the original request before dispatch and records each observed attempt. A failure leaves it available for same-ID receiving.

**COMPLETE** means the selected plan has all its native receipts. **NEEDS_REVIEW** means an unrelated author edit interrupted the planned revision sequence. **SUPERSEDED** means a separately reviewed continuation exists. These are received results, not transport errors.

For NEEDS_REVIEW, **Review a separate continuation** inspects the current author revision and retains a new draft. Its original source/selection and already accepted mappings are inherited; only remaining operations are replanned. The operator enters a new review note and previews/freezes the continuation explicitly. An inspected historical plan can also start this flow even when its browser draft is absent.

A fresh unsubmitted draft can use **Inspect current author basis in a separate draft**. The old draft remains intact. A frozen request can use that action only after a lookup establishes no retained plan at a strictly later immutable author revision; the action repeats that lookup before proceeding. At that point its original expected revision cannot newly commit. An uncertain request without this evidence stays recoverable under its original identity.

The browser never silently substitutes the current protocol, author revision, or foreign source into a saved draft or frozen request.

## Working copies and another tab

The pane uses the existing transactional protocol draft database with context-prefixed record IDs. Draft writes compare their original stored revision. Immutable source inspections, proposals, previews, requests, and results have exact content hashes. Attempt history is append-only; the first complete receipt and original frozen request cannot be replaced.

Text inputs persist through the same write queue. Source records are verified and cached per opened store, so typing does not repeatedly hash the entire inspected branch. A storage failure leaves the complete visible draft available. Download it or use **Preserve visible adoption work separately**. That action creates a separate draft; it does not overwrite another tab's version.

**Download complete adoption working copy** includes every referenced inspection, preview, request, receipt, and attempt. **Open complete adoption working copy** verifies complete content hashes, context, request/preview relations, source/revision basis, and result identity before import. It does not silently merge two different drafts with the same ID. An exact saved copy reopens; a different existing ID is retained separately.

Working-copy import is bound to the original workspace ID and dossier ID. To move the entire author project to another workspace, use the maintained complete dossier portable export and receive. Accepted native adoption plans, original returned source chunks, comparison operations, raw runs, artifacts, and histories travel in that portable source. Browser working copies are supplementary and retain their own original browser context.

## Complete original downloads

Raw runs and individual artifact downloads use the original source descriptor. The browser checks the declared complete length and SHA256 before making the file available. Adoption JSON and HTML include the full plan, accepting operator, source, accepted mapping, and native receipts. The **original source** export retains the original returned filename and bytes.

The authenticated route supports the maintained portable size limit and streams source exports with final byte/hash verification. This browser's verified in-memory download is limited to 256 MiB and a working-copy JSON to 64 MiB. A larger original source remains available through the installed adoption file/export client or CLI; the browser reports its size boundary without delivering a partial file. No original member is truncated to fit a browser limit.

Read-only complete JSON details expand on demand and release their DOM when closed. The ordinary workflow uses typed forms, selectors, checkboxes and buttons; JSON editing is not required.

## Authenticated route contract

All paths below are below the original `/api/dossiers/{id}/comparison` route. The existing token, Host, Origin, workspace and dossier checks run first.

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/adoptions` | Revision-pinned retained plans and original source descriptors |
| GET | `/adoption/source` | Complete paged source protocol/candidate/run/judgment/decision/source inventory |
| POST | `/adoption/preview` | Exact original proposal; source-bound eligible or ineligible plan |
| POST | `/adoption/reviews` | Same proposal plus previewSha256; original-request receiving before stale checks |
| GET | `/adoption` | Look up exactly one planId or requestId |
| GET | `/adoption/file` | Original raw run or named artifact |
| GET | `/adoption/export` | Complete JSON, HTML, or original returned source |

Request bodies use the canonical 2 MiB adoption limit. Pagination after page zero requires a pinned author revision. File responses include complete Content-Length, X-Content-SHA256, and X-Research-Dossier-Revision. Domain rejection is distinct from an uncertain connection loss. Any partial adoption details returned with a domain failure remain visible through the original error and same-request lookup.

## Installed source and receiving

New browser assets are `public/comparison-adoption.js`, `comparison-adoption-store.js`, and `comparison-adoption.css`. `comparison/adoption-routes.mjs` is registered on the original listener. The existing comparison pane composes this panel, and the app carries full adoption error details and explicit navigation to Returned work. There is no alternate server, database, authentication method, or dispatcher.

The complete browser receiving module, `comparison/adoption-browser-receiving.mjs`, is sequenced by the maintained `comparison/foreground-receiving.mjs` after all original comparison/output phases. It consumes the same retained native adoption course and original author listener. Use the original software receiving fixture explicitly as training input. It must operate complete records and downloads at desktop and 390px widths, preserve exact request/download journals, and inspect accepted work after the maintained portable receive. No rendered or native acceptance is claimed by source review alone.

## Actual output inspection requirement

For final readiness, actually open and use every final HTML/report, original source archive, downloaded raw/artifact member, complete working copy, portable dossier and received project. View or play relevant media where present. Screenshots support this review; screenshots alone do not satisfy it. Record exact original paths/hashes, inspected pages and results, and any material limitation. Do not label a source-only or parsed implementation as a completed browser run.
