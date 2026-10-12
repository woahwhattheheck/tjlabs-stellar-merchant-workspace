# Complete customer closing operation

This programme continues the original repository service-period example through the merchant accounting host, authenticated MCP connection, complete customer setup and closing workbench, browser, original file downloads and native cycle reopening. It keeps one private operation directory, including the original inputs, frozen customer reviews, issued statements, current lifecycle snapshots, full customer packets and desktop/phone screenshots.

Run this as the customer closing continuation in the existing SCF Merchant receiving workspace. Use the maintained full Merchant source checkout with the current accounting/MCP integration, service periods, closing cycles and the complete customer setup workbench. The setup routes, original CLI observer, customer dossier module and grouped handover browser asset must be present alongside the cycle UI. The existing tariff/customer and payment/MCP receiving programmes keep their source and operation identities.

## Run in the existing native workspace

Use Node 22 or newer, the existing `tar` and `flock` commands, and an already installed Playwright/Chromium browser. The programme uses private loopback HTTP and the original local accounting implementation. Its accounting inputs come from the checked-in example.

From the full Merchant source root:

```sh
node stellar-forge/mcp-merchant-operator/examples/customer-closing-workbench.mjs \
  --directory /absolute/private/customer-closing-operation \
  --browser-module /absolute/existing/playwright/index.mjs \
  --browser-executable /absolute/existing/chromium
```

Use the actual paths from the receiving host. If that workspace already resolves `playwright` and its browser, omit both browser options. `SCF_BROWSER_MODULE` and `SCF_BROWSER_EXECUTABLE` provide the same selections.

An existing browser owner can call the programme directly:

```js
import {receiveCustomerClosingWorkbench} from './stellar-forge/mcp-merchant-operator/examples/customer-closing-workbench.mjs';

const result = await receiveCustomerClosingWorkbench({
  directory: '/absolute/private/customer-closing-operation',
  browser
});
```

Here `browser` is that owner's existing Playwright Browser. The caller retains ownership of the browser; this operation closes its own contexts. The CLI owns and closes the browser it starts.

Keep the same directory when resuming. The original operation lease prevents concurrent execution in that directory. The original MCP port, local access token, source inputs, customer reference, imported captures, run and cycle labels are retained. Existing customer records, usage imports, original accounting runs and prepared cycles are reopened before another action is considered. A complete result including the grouped customer handover is returned from its retained file. A result from an earlier version continues that same original operation to receive its customer handovers.

## The complete customer journey

The programme imports `buildServicePeriodExample()` from the existing customer statement source. It retains the returned opening and closing JSON byte for byte and preserves every native call state, timestamp, plan, order and payment identity. The original SF98 journal writer stores the example order, and the original accounting workspace captures and reconciles it. The example's opaque payment identity stays distinct from the valid configured example terms; the actual reconciliation classification travels into the statement.

The actual desktop interface creates the example customer, edits its profile, reviews the original order against the completed accounting run, assigns that order, and inspects and imports both complete captures through their declared host aliases. Each action is reviewed in the workbench and retained by the original CLI as its own request and saved result. The programme reopens those same operation identities after interruption. The original typed statement client reads the resulting customer, assignments, captures and complete period report. The programme checks the original example outcomes: three new calls; 15 consumed units, 15 released units and 20 admitted units; one recovered result; and 60 available units at closing.

The actual desktop interface then selects the saved customer, completed accounting run and both captures. It reviews the complete statement and prepares a two-row close: the selected service period and the cumulative closing capture. Each row uses the original accounting engine and its own stable retention request.

During issuance, the receiving programme pauses one original MCP file request for `usage-opening.json`. The native statement has already been retained. The other row completes through the original exporter. The workbench's partial cycle is downloaded, extracted with its original private directory modes, reopened and completed against the original statement identities. Before resuming, the actual Customer handover control downloads the completed cumulative packet with a two-row partial customer register. Repeated preparation reuses that immutable snapshot. The original workbench then resumes its own saved cycle and downloads both completed statements in one customer handover.

The desktop interface next opens the issued period statement and uses its original correction action to prepare and retain the replacement. It reviews and applies withdrawal of the cumulative statement through the same saved customer operation workflow. Refreshing the earlier cycle preserves both original statement IDs and publishes their current `SUPERSEDED` and `WITHDRAWN` statuses. The desktop and phone interfaces open the same saved reviews, issued files, withdrawal history and customer records. Their Customer handover section expands both original rows with the saved pass labels and lifecycle states. A fresh customer packet contains the superseded period and withdrawn cumulative statement; the earlier immutable customer packet stays independently readable.

The programme saves the complete customer setup operations, downloads the full cycle and both customer packets, opens the customer index in the actual browser, follows its relative link to the original statement, and downloads the original statement JSON through that index. It checks the original file hashes from the native delivery records. Finally it closes the accounting owner, reopens the original workspace, and reconciles the extracted complete cycle. The same two original statements and one correction remain in the native register. Each grouped customer archive is also extracted into a renamed receiving folder. The original dossier reader verifies every payload SHA and byte length, and the actual browser opens that copied index and follows its relative original statement links. Restarting the workbench retrieves both the earlier and current immutable customer manifests from the same saved snapshot URLs.

## Retained output

| File or directory | Contents |
| --- | --- |
| `operation.json` | Stable original operation identity and example source label |
| `inputs/` | Complete unchanged opening/closing source and configured example terms |
| `original-example/` | All original customer-period example artifacts |
| `accounting/` | Original native accounting state, retained report, sources and statement documents |
| `native-selection.json` | Actual customer, run, opening and closing identities |
| `original-period.json` | Full native period report from the authenticated merchant client |
| `executed-source.json` | Actual source file byte counts, SHA-256 values and Git blob identities |
| `cycles/` | Original frozen reviews, request identities, progress and complete customer deliveries |
| `cycles/customer-operations/` | Original prepared customer, assignment, import and withdrawal requests and saved results |
| `customer-setup-actions.json` | The actual setup operation IDs and observed native outcomes |
| `delivery-interruption.json` | The single original file boundary paused by the receiving operator |
| `partial-cycle.json` | Actual retained/delivered rows at that interruption |
| `downloads/` | Complete customer setup archive, partial and complete cycle archives, original customer packets, grouped handover archives and browser-downloaded statement |
| `reopened-partial-cycle/` | The downloaded partial operation, completed through the original cycle engine |
| `reopened-complete-cycle/` | The downloaded complete cycle, reconciled after native owner reopening |
| `customer-1/`, `customer-2/` | Complete extracted original statement packets with their own `index.html` |
| `customer-handover-partial.json`, `customer-handover-issued.json`, `customer-handover-lifecycle.json` | Actual grouped snapshot identities, source file lists, statuses, counts and unchanged export reuse |
| `customer-handovers/` | Renamed extracted customer folders, each with the readable index, original statement packets, registers and complete manifest |
| `cycles/.customer-dossiers/` | Original workbench's private immutable customer snapshot storage |
| `screenshots/` | Actual desktop review, partial/complete close, grouped customer handovers, reopened customer folders, phone views and original statement |
| `flow-result.json` | Complete native and browser result, current source identities and delivered file manifest |
| `receiving-error.json` | Exact exception and stack for continuation after a source/runtime failure |

Each complete service-period delivery contains the original nine statement files plus the delivery metadata, current status snapshot and printable customer index. The cumulative delivery contains the original five statement files with the same delivery companions. Every extracted file and directory remains private to the receiving owner.

Current status snapshots, screenshots and derived download copies can advance during an unfinished receiving attempt. Original input bytes, frozen customer reviews, statement documents and native request identities remain under their existing native rules.

## Source and integration

The programme consumes the existing exports from `accounting-statement-client.mjs`, `accounting-statement-cycle.mjs`, `accounting-statement-cycle-server.mjs`, `accounting-statement-customer-dossier.mjs`, the original accounting host/catalog, original MCP HTTP handler and original service-period example. The [closing workbench guide](../ACCOUNTING_STATEMENT_WORKBENCH.md) describes ordinary customer operation; the [closing cycle guide](../ACCOUNTING_STATEMENT_CYCLES.md) describes the saved native cycle contract.

Return the retained result, complete customer packets, original cycle archives and screenshots to the existing SCF customer/MCP receiving thread. Continue any source repair in that same operation directory.

The grouped handover appears in `flow-result.json` as `customerDossier`, retaining the partial, issued and lifecycle snapshots and the workbench restart result. It consumes the same original customer, captures, two cycle rows and one correction; each file comparison uses those original delivery identities.
