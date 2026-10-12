# Operate and receive governed buyer expenses

This guide carries an original governed purchase through source review, exact
allocation, issued accounting, original accountant return and complete private
project receiving. The original buyer, spending owner, expense Store and
accountant engine remain the owners of those operations.

## 1. Build and select the original product

Choose one complete source commit from this repository. The maintained
`buyer-expenses` recipe includes the complete SF36 application, native buyer,
MCP source and spending modules, accountant application, managed runtime
workers and original portable readers.

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_SELECTED_COMMIT \
  --selection buyer-expenses \
  --out /absolute/private/buyer-finance-release
~~~

Retain the same build directory. Its completed `distribution.json` names the
archive, source commit and SHA-256; `package/manifest.json` binds each original
source file and recipe. If packaging was interrupted, use that same directory
with `--resume`; `--offline` reads already acquired original Git objects. A
different product or commit uses a new selected output.

Prepare and install that exact archive through the original runtime installer:

~~~sh
starforge runtime-install prepare \
  --dir /absolute/private/buyer-finance-runtime \
  --archive /absolute/private/buyer-finance-release/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature mcp --operator

starforge runtime-install install --dir /absolute/private/buyer-finance-runtime
starforge runtime-install inspect \
  --dir /absolute/private/buyer-finance-runtime --load --source
starforge runtime-install run \
  --dir /absolute/private/buyer-finance-runtime -- source
starforge runtime-install run \
  --dir /absolute/private/buyer-finance-runtime -- registrations --source buyer-expenses
~~~

The original source checkout can invoke
`node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs`
in place of `starforge runtime-install`. Use the same install operation and its
maintained recovery commands after interruption.

Use the installed Node 24 and Python 3.11+ on a supported POSIX host. Current
native SQLite reading uses the original Node runtime; original buyer approval,
ledger audit and complete project receiving use their maintained Python
programs. The runtime profile supplies the selected original SDK versions.

## 2. Open the original financial applications

For a managed workspace, attach the selected runtime and open its browser:

~~~sh
starforge runtime-workspace init \
  --workspace /absolute/private/runtime-console \
  --runtime-home /absolute/private/runtimes

starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-console \
  --runtime /absolute/private/buyer-finance-runtime \
  --label "Buyer finance"

starforge runtime-workspace serve \
  --workspace /absolute/private/runtime-console
~~~

Choose **Applications → Buyer expenses**, the attached runtime and the original
private expense directory. An existing original or received workspace reopens;
a new directory creates an expense workspace. Review, save and start that
application through its original managed controls. Its complete private URL is
the application link.

For terminal use:

~~~sh
starforge buyer-expenses \
  --state /absolute/private/buyer-expenses --port 0
~~~

Each installed command can also run through `runtime-install run` and the
selected runtime directory. The original Python launcher uses that same Node
executable for native captures. Stop the current owner before opening the
same workspace under another browser, terminal or MCP host. Managed Stop
drains the original child; the MCP close action names its own instance.

The selected product also carries the existing accounting Applications
provider. Its saved connection and company selection belong to the original
accounting workspace. Use that application's original setup for an existing
accountant destination and authorization.

## 3. Select the real buyer and its financial source

An original SF36 ledger can be registered directly. An original MCP quote
store can supply its saved payment observations. For a governed MCP source,
prepare an owned mode-0600 descriptor with the actual original paths:

~~~json
{
  "schema": "stellar-forge.governed-mcp-expense-input.v1",
  "quoteDirectory": "/absolute/private/original-mcp-buyer",
  "spendingConfigurationFile": "/absolute/private/original-spending-host.json"
}
~~~

The host configuration has the original
`stellar-forge.mcp-spending-host.v1` schema. Its actor, service, ledger,
policy, payer and accepted terms remain the existing native owner's settings.
The descriptor names that owner and quote store. It contains no wallet secret.

For an already reviewed native spending configuration, the existing command
creates the original private launcher module and inspects the exact quote:

~~~sh
starforge mcp-spending setup \
  /absolute/private/original-spending-host.json \
  /absolute/private/original-spending-operator.mjs

starforge mcp-spending status \
  /absolute/private/original-spending-host.json ORIGINAL_QUOTE_UUID
~~~

Use the original buyer's approved operation for purchase and native finality
recovery. The status reader works with the saved native owner and binding.
The [governed source guide](../../stellar/scf-starforge-20261009/sf36-spend-governor/expense-workspace/GOVERNED_MCP.md)
gives the exact host fields and retained request identities.

In Buyer expenses, **Sources** registers the ledger, MCP quote store or governed
descriptor. Registration produces the original complete source capture.
Inspect its source identity, total counts, native rows, full shared-ledger
exposure and current quote/payment state. Accept the actual source edition
with the named reviewer and reason. Refresh produces another retained edition;
the source review compares its complete changes before acceptance.

The governed reader joins original quote records to their retained request
binding and the complete original ledger under its existing owner lock.
A missing binding retains the actual exposure and presents a source issue;
repair the original buyer binding, then capture and review that same source.
Other owners' ledger entries remain part of the complete statement.

## 4. Allocate and issue the original period

Create the cost centers and accounting period in the original application.
Inspect the expense row's current basis and source. Supply the recognition
date, reviewer, project, account code and exact atomic-unit allocation lines.

| Original value | Financial use |
| --- | --- |
| Quote amount and creation date | Original requested terms and source date |
| Reserved capacity | Outstanding original shared-ledger exposure |
| Settled actual | Exact native units available for expense allocation |
| Saved native payment observation | Original finality and transfer binding used by the source reader |
| Recognition date | Operator-selected accounting date |
| Store currency or accountant valuation | Explicit original commercial input, kept with its own unit |
| Returned native units | Original verified return allocated against the corresponding purchase |

Allocation lines must sum to the original settled actual. Unlike networks and
assets remain separate groups. Duplicate views of the same original ledger
request contribute once; the source and binding remain available for review.

Open **Period review**. Inspect allocations, outstanding reservations, source
issues, exact groups and original native outcomes. Resolve each displayed
issue with its allowed disposition and a reason. Save a review with the
reviewer's name, role and conclusion. **Issue** uses that exact current review
and preserves a frozen edition.

A subsequent correction reopens the period with a recorded reason and creates
another reviewed edition. Earlier issued documents and their frozen source
remain available.

## 5. Complete the original accountant round trip

From the issued buyer period, export its **buyer accountant source**. The
original accounting workspace imports that exact issued source and retains
typed buyer allocation rows and source hashes. The accountant reviews its
original handoff, returned CSV, references and any explicitly valued
QuickBooks/Xero workflow in the maintained accountant application.

Export the original `buyer-return.json` from that same handoff. In Buyer
expenses, preview it against the exact issued close. Review the native
handoff identity, complete preceding accountant revisions, frozen buyer source
and returned references. Accept the preview with the operator, name, reason
and the explicit prior handoffs being superseded.

The accepted return is stored in the same expense database. Its complete
source packet, row references and earlier accepted returns remain retained;
the issued native amounts stay bound to the original period.

Source receipts and verified merchant returns use the same original expense
workflow. A Woo refund or merchant adjustment packet is first captured and
reviewed, then bound to its original purchase before native returned units
are allocated. The complete project carries its captured packets and the
original refund/accountant source readers.

## 6. Operate the same workspace from MCP and customer code

Declare an owned mode-0600 connection file. Executables and source paths are
host configuration; remote calls select its named aliases:

~~~json
{
  "schema": "stellar-forge.buyer-expense-connection.v1",
  "workspaces": {
    "finance": {
      "directory": "/absolute/private/buyer-expenses",
      "python": "python3",
      "governedQuoteSources": {
        "remote_tools": {
          "path": "/absolute/private/governed-source.json",
          "name": "Original governed MCP purchases",
          "provenance": "The actual original buyer and spending-owner operation.",
          "dataContext": "operational"
        }
      }
    }
  }
}
~~~

Choose the actual data context of that installation. The original application
keeps operational and development source contexts separate.

~~~sh
starforge merchant-mcp init-buyer-expenses \
  --dir /absolute/private/finance-mcp \
  --connection /absolute/private/finance-connection.json

starforge merchant-mcp serve \
  --config /absolute/private/finance-mcp/merchant-mcp.json --port 3211

starforge merchant-mcp expenses tools
~~~

Supply the existing private bearer through its declared environment. The
original stdio transport uses the same saved merchant configuration.

The maintained customer CLI reads each action's exact schema and private
argument file:

~~~sh
starforge merchant-mcp expenses call \
  --url http://127.0.0.1:3211/mcp \
  --action state --arguments /absolute/private/finance-state.json
~~~

For example, the original governed registration arguments are:

~~~json
{
  "workspace": "finance",
  "requestId": "finance-governed-source-001",
  "expectedRevision": 0,
  "governedSource": "remote_tools"
}
~~~

Use the actual current revision and a retained request ID selected for that
operation. The action is `governed_mcp_register`; its named SDK method is
`governedMcpRegister`.

The SDK comes from the same installed original source:

~~~js
import {
  openBuyerExpenseClient,
  downloadBuyerExpenseExport,
  receiveBuyerExpenseProject,
} from '@tokenjunkielabs/starforge-merchant/merchant/buyer-expenses/client';

const client = await openBuyerExpenseClient({
  url: 'http://127.0.0.1:3211/mcp',
  tokenEnv: 'MCP_ACCESS_TOKEN',
});
const state = await client.state({ workspace: 'finance' });
const issued = await client.history({
  workspace: 'finance', kind: 'period', periodId: 'THE_ORIGINAL_PERIOD',
});
~~~

The original customer surface covers source registration/capture/rebind and
review, allocation/coding, period review/close/reopen, accountant preview/return,
retained export and request recovery. Read-only arrays use the original
offset/limit pagination; saved capture and issued exports carry complete
original documents.

Every mutation retains the exact request ID, expected revision and payload.
After a lost response, use `request` for that same workspace/request ID.
The original successful response is committed in the same SQLite transaction
as the financial operation. A same-ID replay recovers it before another
capture, allocation or close. A changed payload requires a deliberate new
operation after current state inspection.

## 7. Export, download and receive the complete project

Export `kind: "project"` at the reviewed current revision under one stable
export ID. The response and `export_status` expose the original completed
manifest. Retain its exact SHA-256 and the project file SHA-256.

~~~sh
starforge merchant-mcp expenses inspect \
  --url http://127.0.0.1:3211/mcp \
  --export finance-project-001

starforge merchant-mcp expenses download \
  --url http://127.0.0.1:3211/mcp \
  --export finance-project-001 \
  --directory /absolute/private/finance-download \
  --manifest-sha256 ORIGINAL_MANIFEST_SHA256

starforge merchant-mcp expenses receive \
  --archive /absolute/private/finance-download/buyer-expense-project.zip \
  --directory /absolute/private/received-finance \
  --sha256 ORIGINAL_PROJECT_SHA256
~~~

The downloader retains the exact endpoint, export, manifest and byte offsets
under its original destination lease. Continue in that same private directory
after interruption.

The trusted installed receiver checks the archive SHA-256, full declared
member set, each file's byte count/hash, supported native SQLite schema,
workspace UUID, revision, source kinds and successful request history.
Its current complete-project limit is 256,000,000 bytes. A matching interrupted
receive continues at its original destination. Repeating the same archive at an
unchanged received destination verifies those original bytes again and returns
the native receipt. After the received project has been edited, keep that work
and choose a new private destination for another receipt of the earlier ZIP.

The project contains:

- The original runnable Python application and browser, native statement and
  MCP/governed binding readers, and original refund/accountant validation code.
- A consistent native expense SQLite backup, complete source captures,
  allocation editions, period reviews, issued documents, accountant returns
  and successful request identities.
- The original project manifest, source hashes and private-opening guide.

The original buyer ledgers, quote stores, purchased result bodies and signing
material stay with their original owners. The received application reads its
saved financial state independently.

Open that received project:

~~~sh
python3 /absolute/private/received-finance/app/sf36-spend-governor/expense-workspace/server.py \
  --state /absolute/private/received-finance/project \
  --node /absolute/path/to/node --port 0
~~~

Inspect its UUID, original revision, retained requests, issued periods and
accountant return. Continue the same customer work there. A later export from
the included original application remains a complete project.

## 8. Reattach a moved or restored original buyer

Saved expense data opens before the source buyer is available. For a later
native refresh, recover the buyer through its original ledger audit,
backup/restore and workspace operation first. Select the actual restored
ledger or updated governed descriptor.

Use **Sources → Rebind**, or `source_rebind` with the matching host alias,
operator and reason. The source type remains the same. The original reader
checks retained quote/request identities, physical ledger identity and accepted
restore ancestry before the new capture can be accepted.

Review that complete capture. Prior issued charges remain frozen and the
restored governed alias does not create another charge for the following
period. A changed buyer or source outside that original continuity requires a
separate original source selection.

## Source and original receiving reference

The governed integration is the complete original upstream
[PR2104](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2104),
merged at `ee47e6141f9824bd7017f57b299df7bd4837debd`. Its maintained entrypoint
is
`stellar-forge/mcp-merchant-operator/buyer-expense-governed-receiving.mjs`.

The completed controlled-development case
`governed-buyer-expense-receiving-f232-20261012` exercised eight original
phases, 39 committed expense operations and five exports on the original
109-file selected source. It preserved the selected 60-unit reservation once
across two views and the other owner's 11-unit exposure, issued the reviewed
40/20 allocations, accepted the original two-row accountant return, and
reopened the received application. Original ledger restore and named
reattachment preserved the prior issued charge.

Those are workflow counts for that retained case. Production commissioning
uses the customer's actual approved buyer, terms, source, reviewer and
accountant destination through the same original applications.

Read the full native source guides for their exact contracts:

- [Governed MCP source and original restore continuity](../../stellar/scf-starforge-20261009/sf36-spend-governor/expense-workspace/GOVERNED_MCP.md).
- [Buyer expense customer SDK/CLI/MCP](../../stellar-forge/mcp-merchant-operator/BUYER_EXPENSES.md).
- [Bookkeeping and original accountant return](../../stellar/scf-starforge-20261009/sf36-spend-governor/expense-workspace/BOOKKEEPING.md).
