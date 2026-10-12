# QuickBooks browser draft and request recovery

This is the existing `/qbo.html` in the original accounting workspace. It preserves merchant journals and the complete buyer allocation workflow, including every include/exclude decision, exclusion reason, explicit home-currency value, account direction, valuation note and common valuation basis.

The original accounting workspace remains the authority for retained plans, reviews, cancellations, received responses, native posting and accountant returns. Browser storage records the operator's work and exact submitted request so that a reload can continue the same operation.

## Open the correct operator record

1. Open the original accounting workspace address and choose **QuickBooks journal handoff**.
2. Enter the same **Operator / reviewer** reference used for the work. This is an entered command attribution, not a login or new authentication mechanism.
3. Choose **Open operator drafts**. Alternatively select the existing operator from **Saved in this workspace**, then open it.
4. The recovery panel identifies whether the draft is saved, another tab changed it, an original request is pending, or the workspace must reopen.

Each browser record is keyed by the original workspace ID, selected-source digest and entered operator reference. The two workspace fields come from the existing `accountingWorkspaceBinding(directory, state)`; the page does not invent identity from revision numbers or a port.

Opening another operator explicitly opens their separate record. It does not rename or copy the current operator's saved requests. An unresolved request keeps its original operator selected until it is reconciled.

## Prepare and retain a journal

Use the existing source, company and account controls. Browser storage retains:

- The selected original handoff, its actual `handoff.json` byte digest and length, and separate mappings for each exact source edition.
- Complete merchant mappings and selection, or every buyer decision, reason, amount, debit/credit account and valuation note.
- The common buyer valuation basis, journal date, document number, company identity and original complete normalized company export.
- The original plan creation ID and timestamp, current previews, selected plan/response, and separate response files and review/cancellation notes for each retained plan and plan digest.
- A loaded response's filename and complete original JSON text, so a reload does not substitute a snippet or require reselecting the file.

Edits are saved to IndexedDB after a short debounce. **Save browser draft** waits for its save. A navigation warning protects edits that have not finished saving. A failed browser save blocks new submissions; download the record and resolve browser storage before proceeding.

When the original handoff file changes, its earlier mappings remain in the browser record under their original source identity. They are not automatically transplanted to the new source file. A later accountant revision invalidates stale previews while retaining the entered mapping values. Buyer exclusions remain journal-local and leave the original accountant status unchanged.

A reopened native-posting preview always requires the operator to check the posting confirmation again. The page never posts because a draft or checkbox was restored.

## Every mutation is retained before dispatch

The following existing operations use a serializable browser command:

| Operation | Original route / identity |
| --- | --- |
| Retain journal plan | `POST /api/qbo/plans`; original plan ID |
| Review retained plan | `POST /api/qbo/plans/:id/review`; original review ID |
| Cancel unused plan | `POST /api/qbo/plans/:id/cancel`; original cancellation ID |
| Receive complete JSON | `POST /api/qbo/plans/:id/responses`; original response ID |
| Continue accountant return | `POST /api/qbo/plans/:id/responses/:responseId/resume`; original response |
| Post reviewed journal | `POST /api/qbo/plans/:id/post`; original native posting ID |
| Continue native posting | `POST /api/qbo/plans/:id/post/resume`; same native posting ID |

The complete JSON body, exact serialized request bytes, SHA-256, route, kind, actor, workspace/source binding and selected source/plan identity commit to one IndexedDB transaction with the draft and pending marker **before** the HTTP request starts. An interrupted browser cannot replace that pending request with a new ID.

Before the first dispatch, the page rereads the original catalog and rejects a stale revision locally. That local preflight sends no mutation. Once a request has been dispatched, a plain HTTP 400/409, missing record, timeout, invalid JSON or proxy response does not establish that the request can be discarded.

This change introduces no parallel server journal and no provider operation. All original Store, QBO ledger, native posting and response-return methods remain unchanged.

## Reload or recover an uncertain request

1. Reopen the same browser origin and the same operator record.
2. Keep the original workspace and source configuration. The recovery panel restores the full pending command.
3. Choose **Read original saved outcome**. This reads the existing plan and matches its original receipt.
4. If the exact saved receipt is not yet available, keep the pending request. **Retry unchanged request** submits precisely the stored body to the original route.
5. If the server reports that a save is uncertain, use **Workspace recovery** to close and reopen that same original workspace before reading or continuing it.

Receipt matching uses the original API's canonical request hashes for create, review, cancellation and complete response ingestion. Native posting matches its original ID, plan, preview, actor and creation time. An original resume has no independent server receipt: the page reconciles it to the same already retained native operation or response, preserving its literal current status. It does not claim that a particular resume invocation completed merely because its target exists.

A matching saved native operation may still be **RUNNING**, **RETRYABLE**, **UNCERTAIN**, **RECEIVED**, **FAULT** or **CONFLICT**. The existing original posting controls show that status and continue that same operation. The page does not create another post.

A browser outcome is recorded only after the original saved record matches. If its local recording fails, the exact pending command remains available for another read. If the outcome is saved but subsequent view refresh fails, reload uses the saved outcome and original plan selection.

There is deliberately no dismiss-and-forget control for an uncertain submitted request. If a request remains unresolved after an explicit server rejection, preserve its download and use the original workspace's records and recovery procedure. This implementation does not invent a durable non-admission receipt for mutable validation errors.

## Two tabs and different workspaces

An IndexedDB transaction checks the current operator-record version before saving. A competing tab must reload the saved version instead of overwriting it. A browser-local marker permits only one unresolved request across operator records for the same workspace and selected sources. Broadcast notifications explain a changed record; transaction checks remain authoritative if notifications are delayed.

These checks coordinate tabs in the **same browser origin**. They are not a distributed lock across browsers, devices or ports. Original server validation and native request identities remain necessary.

The new page sends these headers on its QBO and accountant requests:

```text
X-Accounting-Workspace-Id: <original workspaceId>
X-Accounting-Sources-Sha256: <original sourcesSha256>
```

The original server validates the supplied pair before dispatch and returns the same pair, plus:

```text
X-Accounting-Reopen-Required: 0 | 1
```

The reopen flag is read at response time from the original Store's commit-uncertainty state. The QBO catalog also adds `binding: {workspaceId, sourcesSha256}` and `reopenRequired`.

Existing non-browser clients that omit both request headers keep their original contract. Supplying only one header or a mismatched pair is rejected. The browser requires the returned binding and does not guess that an older or unreadable response came from the expected workspace. A valid different binding freezes the original record.

QBO/accountant file download links use the same scoped HTTP read before exposing bytes. Drafts, response JSON and source data are never placed in the URL. Ordinary deep links retain only the existing plan/response IDs.

## Download, backup and storage limits

**Download browser record** contains the selected operator's saved context, complete original commands, recorded outcomes and any unsaved draft in that tab. **Download exact request** preserves one pending command. Records from other workspace/source identities are download-only; the page does not silently import or replay them into the current workspace.

These are private operating records and may contain financial source data. Keep them with the original project. They are not proof of a successful posting.

IndexedDB is browser storage, not the complete accounting backup. Clearing site data, changing browser profiles or moving to another origin can remove access to it. The original workspace's full backup/reopen workflow continues to retain authoritative plans, responses, native intents and accountant returns.

The browser accepts an original request up to 32 MiB and a complete draft up to 64 MiB, subject to the browser's available quota. Original company/response validators retain their existing limits. No additional storage service, credential store, upload, callback worker or automatic retry is created.

## Maintainer receiving

Use the original existing accounting receiving operation and its original QBO page. A complete receiving continuation should exercise:

1. Merchant and buyer drafts, including full buyer exclusions/valuation, a company export and loaded response JSON; reload and open the same operator.
2. The same original request after an unreadable response; inspect the saved ID/body before explicit retry.
3. Another tab's version conflict and another operator's pending-marker notice.
4. A reused listener with a different original workspace/source binding; verify no old draft or command is adopted.
5. The original saved native posting/response status and accountant return after reopening the original Store.

No parallel provider account, native posting, server journal or customer operation is needed.
