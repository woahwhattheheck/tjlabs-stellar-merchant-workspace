# Governed buyer expenses and accountant handover

Carry an original buyer operation through expense review, financial close and a
complete customer handover. This selected product joins the maintained native
buyer and spending owner, SF36 Buyer expenses application, merchant MCP client,
and accountant workspace.

The `buyer-expenses` source selection belongs to this repository and its exact
selected commit. It includes the original application source, browser, Python
readers, governed MCP bindings, accountant return validators and trusted
complete-project receiver. It also receives the original Node Buyer accounting
export through the same source review, period and customer-receiving workflow.

## Work the product completes

| Work | Original application and result |
| --- | --- |
| Operate an approved governed purchase | The original buyer and SF36 spending owner retain the quote, invocation, reservation, dispatch, saved finality and purchased result. Other owners' shared-ledger reservations remain visible. |
| Review financial source editions | Buyer expenses retains full SF36 statements, MCP quote/binding captures or original Node accounting exports, original source identities, pending changes and named acceptance decisions. |
| Import a Node operation outcome | The original exported attempt, evidence and SF36 result stay bound to their immutable carrier. Unpaid and unresolved outcomes remain explicit; finalized actual units enter the existing allocation workflow. |
| Allocate and issue | Exact original settled units are allocated to cost centers, projects and account codes with an explicit recognition date. Period review retains outstanding exposure, exceptions and the complete selected source before issuing a frozen edition. |
| Complete accountant handover | The original accountant workspace receives the issued buyer source, maintains its returned row/revision chain and exports the original buyer return. Acceptance records those references against the same frozen buyer lines. |
| Deliver the complete project | The original project export carries runnable source, a consistent SQLite backup, captures, allocations, review history, issued editions, accountant returns and successful request identities. The trusted receiver verifies and reopens that same project on another host. |

## Select and install

Use the existing builder with the complete committed recipe:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_SELECTED_COMMIT \
  --selection buyer-expenses \
  --out /absolute/private/buyer-finance-release
~~~

The retained build receipt identifies its source commit, source selection,
archive and SHA-256. Continue an interrupted build in its same output directory
with `--resume`. Prepare and install its exact archive through the maintained
runtime installer; the [complete operating guide](OPERATING.md) covers that
workflow and managed Applications.

Host requirements are Linux or another supported POSIX host, Python 3.11 or
newer, and Node 24 for current native capture and buyer operation. The original
runtime profile installs the selected MCP, schema and native Stellar/x402
dependencies. Opening an already received expense project uses its included
Python application and saved database.

For an installed runtime:

~~~sh
starforge buyer-expenses --state /absolute/private/buyer-expenses --port 0
starforge merchant-mcp expenses tools
~~~

The browser is also available as **Applications → Buyer expenses**. Select the
actual private workspace; use the managed Start/Stop controls or the separate
terminal/MCP host as that workspace's owner. The same selected installation
includes the maintained accounting application and its saved authorization and
company selection.

## Source and customer interfaces

The browser, command line and MCP all retain the same workspace revision,
original request ID and source decision. The installed customer SDK is:

~~~js
import {
  openBuyerExpenseClient,
  downloadBuyerExpenseExport,
  receiveBuyerExpenseProject,
} from '@tokenjunkielabs/starforge-merchant/merchant/buyer-expenses/client';
~~~

The original `starforge merchant-mcp expenses` commands operate, inspect,
download and receive exact saved exports. The API exposes the original source
capture/rebind, allocation, period review/issue, accountant return, export and
request-recovery schemas. See [the original customer interface](../../stellar-forge/mcp-merchant-operator/BUYER_EXPENSES.md).

For original Node exports, the browser provides **Sources → Import Node
accounting export**. Configured clients select a declared `nodeSources` alias
through `nodePreview` and `nodeCapture`; the corresponding CLI actions are
`node_preview` and `node_capture`. The same request recovery, exact original
file download and complete-project receiver apply. See the
[Node source operating contract](../../stellar/scf-starforge-20261009/sf36-spend-governor/expense-workspace/NODE_OPERATIONS.md).

The SDK also exposes the original governed statement reader and spending
configuration/binding modules. They retain the original native identity and
financial owner; the complete source is included in the product.

## Financial workflow and recovery

A quote is a source observation. Original reserved capacity, settled actual,
native payment observation and returned units retain their separate meanings.
The application groups units by network and asset; the operator supplies dates,
allocation dimensions and any explicit accountant valuation.

A repeated source view of the same physical ledger/request is one exposure.
The original restore-and-reattach workflow recognizes its reviewed ledger
ancestry while preserving issued charges. A lost response is recovered by its
retained successful request before a caller chooses a new operation.

The complete operating guide follows the full workflow from the original
source to receiving and subsequent source reattachment:

- [Operate, issue and receive the complete project](OPERATING.md).
- [Original Node accounting export intake](../../stellar/scf-starforge-20261009/sf36-spend-governor/expense-workspace/NODE_OPERATIONS.md).
- [Original governed MCP purchase-to-period guide](../../stellar/scf-starforge-20261009/sf36-spend-governor/expense-workspace/GOVERNED_MCP.md).
- [Original Buyer expenses application](../../stellar/scf-starforge-20261009/sf36-spend-governor/expense-workspace/README.md).
- [Bookkeeping and accountant returns](../../stellar/scf-starforge-20261009/sf36-spend-governor/expense-workspace/BOOKKEEPING.md).
- [Original accountant workspace](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/README.md).
