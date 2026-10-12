# Complete customer closing operation

This programme continues the original repository service-period example through the merchant accounting host, authenticated MCP connection, customer closing workbench, browser, original file downloads and native cycle reopening. It keeps one private operation directory, including the original inputs, frozen customer reviews, issued statements, current lifecycle snapshots, full customer packets and desktop/phone screenshots.

Run this as the customer closing continuation in the existing SCF Merchant receiving workspace. Use the maintained full Merchant source checkout with the current accounting/MCP integration, service periods, closing cycles and workbench. The existing tariff/customer and payment/MCP receiving programmes keep their source and operation identities.

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

Keep the same directory when resuming. The original operation lease prevents concurrent execution in that directory. The original MCP port, local access token, source inputs, customer reference, imported captures, run and cycle labels are retained. Existing customer records, usage imports, original accounting runs and prepared cycles are reopened before another action is considered. A completed result is returned from its retained file.

## The complete customer journey

The programme imports `buildServicePeriodExample()` from the existing customer statement source. It retains the returned opening and closing JSON byte for byte and preserves every native call state, timestamp, plan, order and payment identity. The original SF98 journal writer stores the example order, and the original accounting workspace captures and reconciles it. The example's opaque payment identity stays distinct from the valid configured example terms; the actual reconciliation classification travels into the statement.

The original typed statement client creates or reopens the example customer, assigns its original order, imports both complete captures through their declared host aliases, and reads the complete period report. The programme checks the original example outcomes: three new calls; 15 consumed units, 15 released units and 20 admitted units; one recovered result; and 60 available units at closing.

The actual desktop interface then selects the saved customer, completed accounting run and both captures. It reviews the complete statement and prepares a two-row close: the selected service period and the cumulative closing capture. Each row uses the original accounting engine and its own stable retention request.

During issuance, the receiving programme pauses one original MCP file request for `usage-opening.json`. The native statement has already been retained. The other row completes through the original exporter. The workbench's partial cycle is downloaded, extracted with its original private directory modes, reopened and completed against the original statement identities. The original workbench then resumes its own saved cycle.

The desktop interface next prepares and retains a correction for the period statement. Refreshing the earlier cycle preserves both original statement IDs and publishes the original statement's current `SUPERSEDED` status. The desktop and phone interfaces open the same saved reviews and customer records.

The programme downloads the full cycle and both customer packets, opens the customer index in the actual browser, follows its relative link to the original statement, and downloads the original statement JSON through that index. It checks the original file hashes from the native delivery records. Finally it closes the accounting owner, reopens the original workspace, and reconciles the extracted complete cycle. The same two original statements and one correction remain in the native register.

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
| `delivery-interruption.json` | The single original file boundary paused by the receiving operator |
| `partial-cycle.json` | Actual retained/delivered rows at that interruption |
| `downloads/` | Partial and complete cycle archives, full customer archives and browser-downloaded statement |
| `reopened-partial-cycle/` | The downloaded partial operation, completed through the original cycle engine |
| `reopened-complete-cycle/` | The downloaded complete cycle, reconciled after native owner reopening |
| `customer-1/`, `customer-2/` | Complete extracted customer packets with their own `index.html` |
| `screenshots/` | Actual desktop review, partial/complete close, phone views and customer statement |
| `flow-result.json` | Complete native and browser result, current source identities and delivered file manifest |
| `receiving-error.json` | Exact exception and stack for continuation after a source/runtime failure |

Each complete service-period delivery contains the original nine statement files plus the delivery metadata, current status snapshot and printable customer index. The cumulative delivery contains the original five statement files with the same delivery companions. Every extracted file and directory remains private to the receiving owner.

Current status snapshots, screenshots and derived download copies can advance during an unfinished receiving attempt. Original input bytes, frozen customer reviews, statement documents and native request identities remain under their existing native rules.

## Source and integration

The programme consumes the existing exports from `accounting-statement-client.mjs`, `accounting-statement-cycle.mjs`, `accounting-statement-cycle-server.mjs`, the original accounting host/catalog, original MCP HTTP handler and original service-period example. The [closing workbench guide](../ACCOUNTING_STATEMENT_WORKBENCH.md) describes ordinary customer operation; the [closing cycle guide](../ACCOUNTING_STATEMENT_CYCLES.md) describes the saved native cycle contract.

Return the retained result, complete customer packets, original cycle archives and screenshots to the existing SCF customer/MCP receiving thread. Continue any source repair in that same operation directory.
