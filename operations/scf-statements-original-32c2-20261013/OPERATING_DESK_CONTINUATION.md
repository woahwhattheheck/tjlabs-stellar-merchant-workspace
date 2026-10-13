# Continue the received Statements case through the Operating Desk

This continuation belongs to `scf-statements-original-a0d5-32c2-20261013`. Run it after the complete original Statements programme has independently received its browser account archive and written `navigation-handoff.json`. It uses that exact received workspace, case, supplier invoice and three original bank source IDs.

The account programme remains `operate-original-statements.mjs` with its original Python receiver. This companion opens the existing installed Grant application and follows its maintained navigation, finder, original record editors and named staff sign-in.

## Run the same customer continuation

Keep the completed original operation directory and its private files in place. Its handoff selects the original source root, installed Python and Node, Playwright module, browser executable, received workspace and result descriptor. The companion checks the complete result file's byte count and SHA-256, then checks every selected original product file before opening the workspace.

Run the companion from the same checked-out operation:

```sh
node operations/scf-statements-original-32c2-20261013/continue-operating-desk.mjs \
  /absolute/private/statements-operation/navigation-handoff.json \
  /absolute/private/statements-navigation
```

The first argument is the original completed handoff. The second is an owner-only output directory outside the received customer workspace. Use the same two paths to continue after an interruption. Keep one invocation for this operation at a time; the original account controller must have closed its owner before this continuation starts.

The installed browser uses an attempt-local private temporary directory, following the original account controller's host setup. Browser binaries and Playwright come from the actual handoff.

The same function is available to the existing native operation:

```js
import { runStatementsNavigation } from './continue-operating-desk.mjs';

const result = await runStatementsNavigation({
  handoffFile: '/absolute/private/statements-operation/navigation-handoff.json',
  outputDirectory: '/absolute/private/statements-navigation',
});
```

A successful command exits 0 and returns `complete: true`. A saved interrupted customer journey exits 2; the complete result names its actual phase and error. Invalid input or an unavailable original source exits 1. Reopening an already complete journal returns its exact retained result.

## What the customer operates

### The original case and complete finder

The browser opens the handoff's original independently received case. It pages the complete case index and retains every returned entry key and coverage statement. It locates the actual supplier invoice and all three original bank sources by their saved native IDs.

The keyboard journey uses the original Find in case control and Ctrl-K shortcut, moves from the query into the result list, and restores focus after closing. Filters use the maintained record/source kind and section selectors.

For each CSV, OFX and MT940 source, the browser opens its original metadata and downloads the complete original file. Each download must match the retained case source's byte count and SHA-256. When the native statement metadata links its complete review document, that original review source is downloaded and checked too. Source downloads remain distinct from the finder’s readable metadata.

### Supplier invoice and cash provenance

Find in case opens the original 250 USD supplier invoice through its existing invoice editor. The displayed invoice number, supplier and issued date must match the received case. The companion leaves the editor through its normal Cancel action. The finder shortcut keeps that original editor in control while it is open.

The original TRX1002 cash records are selected by their retained IDs. This includes the original payment and its source-note correction successor when present in the received account. Their full visible details and relationship to the supplier invoice are retained, then navigation continues into the existing Cash desk. Amounts, dates, invoice allocations and original source decisions stay in the account records.

### Saved navigation and phone use

The companion visits Statements, Sources and Supplier invoices, pins Statements, and reloads the original browser page. The same case, pinned shortcut, recent sections and selected invoice section must remain in that browser session. It then opens the original Statements desk and invoice finder at 390 pixels, retaining actual screenshots and document width.

These navigation preferences remain ordinary browser session preferences. The account data is read from the original received workspace throughout.

### Real finance and reviewer sign-ins

The companion uses the existing installation owner's StaffAccess writer to create two uniquely named, non-administrator profiles scoped only to the received case. It signs into each through the actual `/team` page with the original one-time access code.

Finance opens the original account sections and supplier invoice editor. Reviewer opens its original allowed sections and source metadata; the original reviewer view omits the cash/statement sections and invoice writer. Both roles use the actual named recording actor, complete case finder and original bank downloads. Each role also opens the source detail on a phone-sized viewport.

Profile request IDs and public profile identities are kept in the continuation journal. Access codes, session cookies and the private owner URL stay in process. The two operation-owned profiles are revoked through the original StaffAccess writer when the journey closes. Their original access events and revoked profiles remain in the installation's access history.

After an interruption, the same create request resolves its retained profile. If its one-time code was lost or its profile was already revoked, the continuation uses the original revision-checked Rotate action to resume that same profile. It then closes its own profiles again. It never rotates or revokes another operator's profile.

## Retained results

`navigation-continuation.json` is the stable operation journal. It binds the exact handoff SHA-256, received workspace and case, unique role profile identities, original request IDs and current result descriptor. Attempts receive separate directories:

| Output | Purpose |
|---|---|
| `attempt-NNN/navigation-result.json` | Actual phase states, original source/runtime identity, source and screenshot descriptors, role outcomes, completion or interruption |
| `original-received-case.json`, `final-received-case.json` | Complete original case before and after navigation |
| `views/*-complete-finder.json` | Every paged native entry key and the original search coverage |
| `views/*-metadata.txt` | Actual displayed original source detail |
| `views/*-original-invoice-editor.json` | Original editor field values selected from the received invoice |
| `views/*-signed-in-profile.json` | Actual public authenticated profile and case scope |
| `views/navigation-preferences.json` | Original saved navigation before and after browser reload |
| `downloads/` | Complete original source and review bytes with actual hashes |
| `captures/` | Actual desktop and 390-pixel customer views |
| `interrupted.html`, interruption screenshot | Original visible state when a journey stops, with retained private values redacted |

The final case comparison includes the complete programme, native records, retained sources and saved reviews. Those account facts must match the initial received case. Named staff access history lives in its original installation tables and is separately retained by that application.

Keep the complete output alongside the original account result and archive when delivering the customer operation. The handoff and output contain private project paths and should remain in the original private receiving package.

## Source and execution continuity

The original account controller and guide are maintained in merchant PR1021, merge `bc136820a813da771a12b91bb546c2c891355216`. The grouped Operating Desk and complete case finder came through PR909, merge `3593b77055398660762a73f3f198cf87ce220446`. The companion reads the actual installed source identities selected by the completed account handoff rather than replacing them with a different application edition.

The continuation requires that selected installation to contain `operations_navigation.mjs`, `operations_navigation_ui.mjs`, the existing staff sign-in modules, server and CLI. Set the original account programme's `requireNavigation: true` when preparing a new run so its handoff is explicitly tied to the current desk.

The original account owner supplies the actual completed handoff after its native programme closes. The companion's saved result records its own execution; source publication alone does not populate those runtime outcomes.
