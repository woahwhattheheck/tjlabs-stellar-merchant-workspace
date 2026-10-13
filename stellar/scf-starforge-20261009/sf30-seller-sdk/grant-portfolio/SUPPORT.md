# Defect support in the portfolio workspace

This application manages the complete support life of a delivered PMRS application: receiving a report, assigning it, recording acknowledgement, agreeing workaround and correction dates, linking the staff correction, validating the installed release, closing the report and reopening the same case when needed.

Open the original portfolio console, then visit **Support** at /support/ with that console's existing private connection. The interface uses the same portfolio, SQLite workspace, uploaded objects, original request IDs and native application records. It adds no independent case database or background service.

## Service terms and immediate intake

Create a service contract for the reviewed portfolio. Record its service coordinator, component owners, planned acceptance date and original scope source. The default planned date shown for the current SPC implementation is 10 January 2027; change it when the selected agreement differs.

Reports can enter before technical triage, calendar selection or final acceptance. The original receipt time is retained. Missing release or project details can be added during triage. The operator can work the report while the service definition is completed.

The service contract retains twelve months of defect support from actual final acceptance. Record acceptance from its original customer acceptance record. Installation, deployment and internal test completion are separate events. An acceptance amendment needs its actual reason and source; it creates another retained contract revision. An explicit support end must include at least the complete twelve calendar months.

The scope follows the issued RFQ26-10663 support requirement:

- Critical defects have one business day for acknowledgement; other defects have two.
- Workaround and correction timing is recorded from the actual severity-based agreement with SPC.
- Delivered defects remain part of the support obligation. New functionality, material enhancements, new integrations, changed requirements and third-party changes are separate classifications only when the supporting source establishes that scope.
- An internal estimate or support-hour reserve is a planning value. This application imposes no hour cap on the defect obligation.

Use the issued tender and the selected agreement as the original business source. The issuer's tender is available at [RFQ26-10663 — Consultancy for PMRS Power Platform](https://spc.global.ssl.fastly.net/sites/default/files/tenderfiles/2026-10/RFQ26-10663%20-%20Readvertised%20-%20Consultancy%20for%20PMRS%20Power%20Platform.pdf). Keep any later acceptance, scope and calendar agreements with the contract's own references.

## Business-day calendar

The contract lets the operator select the actual service timezone, weekdays, non-working dates and daily service interval. Timezones use installed IANA names. The supported counting rules are explicit:

| Rule | Calculation |
| --- | --- |
| Working time | Accumulate one or two complete stated service-day durations across the selected service intervals. Time outside those intervals does not count. |
| Next business day close | Count the next one or two eligible business dates after the receipt date, and use that date's stated closing time. |

The issued requirement does not define a universal timezone or business-day counting convention. Select the agreed definition. A proposed calendar still gives useful planning dates and is displayed as proposed. It is not silently promoted to an agreed service term.

All clocks begin at the original report receipt. A severity review retains both the earlier and revised calculation. If an earlier agreed deadline had already been missed when reviewed, the board exposes that earlier result as well as the current clock. Changing the contract's calendar does not rewrite every earlier case. **Review clock** applies the selected agreed calendar to the same original receipt and retains the previous calculation.

Timezone calculations use the actual date's offset. Nonexistent local service times are reported for correction; ambiguous opening and closing times retain the complete service interval. A twelve-month acceptance term handles month ends, including leap-day acceptance.

## Complete operator workflow

1. **Receive the report.** Record its original receipt, reported severity, complete description and any reproduction information. Select the known affected release if available. Keep the reporter's actual source.
2. **Triage.** Assign the component and engineering owner, record the scope classification and rationale, and complete reproduction details. Select from the retained native application records for this portfolio.
3. **Record acknowledgement.** Retain the acknowledgement already sent or given, its actual channel, time and correspondence. This action records the communication; it does not send another message.
4. **Agree the plan.** Record the actual agreement time and at least one workaround or correction target. Updated plans create new case revisions.
5. **Record the workaround.** Retain what was supplied and its original supporting result. Earlier workarounds remain available.
6. **Link the correction.** Select the original correction from the staff application's received native history. Open and resolved correction pointers remain distinct. After the engineering work is corrected, select its actual corrected-resolution history.
7. **Validate the release.** Select a completed target installation. Record the performed reproduction/validation, actual test time and passed or failed outcome. Corrected validation reads the original staff resolution and the target solution; it uses their retained identities.
8. **Close the report.** Record the actual reviewed outcome and supporting source. A corrected closure requires passed release validation. A duplicate points to another existing case in this service contract. Separately scoped closure requires the corresponding sourced classification.
9. **Reopen when needed.** Start another report cycle on this same case. Earlier reports, acknowledgements, plans, corrections and closures remain in the editable record.

Changing a previously validated reproduction or affected release during triage clears the current validation; the actual earlier test remains in its immutable revision history. Corrected closure then requires validation of the revised selection. A recorded closure cannot precede its actual acknowledgement.

A closed case can still receive an engineering note. A new engineering action on its defect work uses **Reopen**. This keeps the next report's clock distinct from its completed predecessor.

The correction picker reads the original staff capture through the maintained provider. It exposes readable titles, status and project context; it does not ask staff to manufacture history IDs. Release pickers show the actual completed/imported or delivered records for the selected portfolio. Native connection profiles and credentials are not returned by these pickers.

## Whole application handover

**Prepare handover** selects the complete native ALM delivery for the exact reviewed portfolio revision. The outer support ZIP contains:

- The original complete native application ZIP, including its managed and unmanaged solution packages and original receiving material.
- Its original native delivery record, retained again as that same immutable record on receiving.
- A complete current native evidence snapshot, including later installation and staff-correction histories, their original requests, steps, events and already-received provenance. These records can postdate the selected application ZIP.
- The service contract and every contract revision.
- Every included support case, every report cycle and every case revision.
- The actual original completed operation behind each support revision.
- Supporting object bytes referred to by the support history.
- A readable HTML handover and complete editable runtime source from the maintained source list.

Support history and the native evidence tables come from one retained SQLite snapshot for the original delivery operation. The receiver checks every affected-release, installation and correction pointer against these complete native records. The nested application ZIP remains byte-identical; its original native record, archive hash and manifest hash must agree. The selected ZIP is stored once and reused for its native object identity.

Every member is declared with its length and SHA-256. The complete archive is limited to the original application's 4 GiB input limit. The receiver rejects repeated, undeclared, truncated or unsafe paths and checks all members before adopting history. It retains the full source closure declared by `grant-portfolio/source-files.json`.

**Receive handover** checks the complete uploaded ZIP, receives the original native application into the same workspace, then adopts support terms and history in the original workspace transaction. Historical provider requests are not dispatched. Receiving records no new customer acceptance. The received cases remain editable. The same transaction restores the original native delivery wrapper and later native evidence, so release/correction selectors and another complete handover continue to work after an independent reopen.

A later re-export includes the current support work and the complete native application. Receiving the same immutable file again, including in its source workspace, preserves the file descriptor. Each actual receiving request retains its own result; it does not borrow another operation's ID. Existing record revisions must match the incoming originals.

The browser checks complete upload/download bytes. Browsers with direct file saving stream large exports to the selected file. For browsers without that feature, the in-memory download is limited to 256 MiB; use the typed client's streaming file download for larger handovers.

## Typed client

`support-client.mjs` extends the existing original-console client. Its paired `support-client.d.mts` declares every contract, case, source, calendar, release, correction and action payload. Existing original request, wait, resume, upload and streaming download methods remain available.

~~~js
import { connectDefectSupport } from './support-client.mjs';

const support = await connectDefectSupport({
  consoleUrlFile: '/absolute/private/portfolio-connection.json',
});
try {
  const board = await support.supportState({contractId: selectedContractId});
  const current = await support.supportIssue(selectedIssueId);
  const original = await support.noteSupportIssue(originalOperationId, {
    actor: operatorName,
    id: current.id,
    expectedIssueRevision: current.revision,
    text: actualEngineeringUpdate,
    sourceRefs: originalSourceReferences,
  }, {expectedRevision: board.revision});

  const completed = original.state === 'RUNNING'
    ? await support.wait(original.id)
    : original;
  if (completed.state !== 'COMPLETED') {
    throw new Error('Continue the retained original operation: ' + completed.id);
  }

  // After prepareSupportDelivery completes, download the full original object.
  await support.downloadObject(delivery.object, absoluteOutputZip, {
    bytes: delivery.bytes,
  });
} finally {
  await support.dispose();
}
~~~

`supportState` returns page totals and the matching report summary from the original database. `supportContract` and `supportIssue` select current or explicit retained revisions. `supportHistoryPages` walks the original sequence and detects a changing total. Release and correction methods expose original records through authenticated read routes.

The action methods cover all fifteen operations. Payloads carry the selected contract/case revision. Optional `expectedRevision` binds the original whole-workspace admission and commit. A changed revision requires reading the current record before proposing the next action.

## Interrupted work

The browser saves the original in-flight operation and its complete input in session storage for this workspace; it does not store the connection token there. **Check result** reads that same request. **Resume original** continues it or submits its unchanged retained input only after the original request is absent.

An explicit rejected request that was never admitted can be dismissed after the original request lookup confirms its absence. A failed admitted request remains in workspace history. Closing its pending banner does not erase that history. Recovery controls are serialized while submission/check/resume is in flight. Every returned request must match the saved original operation ID, complete input and workspace; stale responses cannot replace or dismiss a newer pending request. The browser confirms it can persist the complete pending input before admission, and keeps an operation pending if clearing that recovery record fails. Completed responses are applied to the interface once.

The Node client follows the same original request model: on an interrupted action response, call `request(originalOperationId)` before `resume` or a same-input submission. Do not create a different ID to retry an uncertain action.

## Composition with the original application

These are additive support files. The maintained composition owns shared `workspace.py`, `server.py`, `client.mjs`, their types, CLI and source list.

The support extension supplies:

| Hook | Responsibility |
| --- | --- |
| `ACTIONS` | The fifteen original support action names. |
| `initialize(workspace)` | Add support tables through the existing workspace transaction helper. |
| `validate_action(workspace, input)` | Validate the selected support payload. |
| `prepare_action(workspace, request)` | Prepare the complete operation outside the final business-state transaction. |
| `commit_action(workspace, request, prepared)` | Commit in the transaction already owned by the original Workspace. |
| `read_http(workspace, path, query)` | Return the authenticated support JSON/file route response. |
| `static_routes()` | Serve the exact Support HTML, JS, CSS and streaming-hash module. |

The core keeps its exclusive writer, original operation journal, request recovery and workspace revision. Support also checks its own record revision and contract binding at commit.

The composed Workspace binds `support_correction_resolver(reference)` to the maintained staff resolver and `support_correction_options(portfolio_id, offset=0, limit=100)` to the maintained read-only history picker. Both read the same actual original staff history. The support receiver uses `dataverse_portable.adopt_receiving(workspace, prepared)` inside the existing transaction so it does not invent an additional native-action parent.

Register all ten support files in the full original source list, including `web/support-hash.js` and this guide. The streaming hash module bundles the retained MIT-licensed js-sha256 source, with its complete upstream license and attribution.

## Verification and native programme

Check the complete composed application: original support intake and triage, acknowledgement clock across a weekend/non-working date, actual staff correction selection, actual completed target installation, passed validation, closure, reopening, complete export, two independent receivers and continued editing after a cold reopen.

Keep local operator workflow exercises visibly identified as such. Their purpose is to exercise the real application and receiving code. Customer acceptance, a sent acknowledgement and a completed target deployment retain their own actual original records. The SPC native programme supplies its three CCS pilots, sourced Flagship input and original role/approval/correction work; support consumes the returned native history and installation instead of issuing parallel tenant writes.

### Acceptance amendments and current coverage

The board assesses coverage at the report cycle’s original receipt time using the latest selected service contract and returns that contract revision. It also retains the case’s recorded assessment. Recording or amending acceptance therefore updates current board coverage without rewriting any original case revision, receipt time, acknowledgement clock or completed operation. The complete handover report assesses against its frozen selected contract and shows the recorded assessment alongside it.
