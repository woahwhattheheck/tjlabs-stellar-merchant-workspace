# Client close runbooks and firm portfolio

Operate weekly cash reviews and monthly closes from one saved procedure catalog, selecting the appropriate named procedure set for each period. Continue from the original source files through preparation, review, backup handover and the next period. The firm portfolio adds named staff capacity, client commissioning and a staggered close calendar while each client keeps its own accounting workspace.

Use the **accountant-portfolio** source selection for a complete installed product. The **Client runbooks**, **Client portfolio**, **Merchant accounting** and **Cryptoworth accounting** Applications entries use the same native accounting engine, saved records and writer leases as the command line and merchant tools.

An issued buyer expense period can also open its own original accountant workspace in this selection. The configured MCP host, typed accounting client and saved-operation CLI retain that source, its first handoff, accountant returns, Xero decisions and complete native recovery. Start with [buyer source review and initialization](OPERATING.md#review-an-issued-buyer-period), then use [complete buyer accountant receiving](RECEIVING.md#receive-the-original-buyer-accountant).

## Start here

1. [Install the selected package](INSTALLING.md) from an exact repository commit and retain its original runtime profile and dependency graph.
2. [Configure and operate the firm](OPERATING.md): select the real client workspaces, publish their procedures, assign people, review capacity and complete the close.
3. [Receive a complete handover](RECEIVING.md): retain the original packet, receive each client's history, adopt the local bindings and start the next local period.

The installed command is:

~~~sh
starforge client-close --help
~~~

The package also provides `starforge-close`, which invokes that same original workspace entry point directly. Existing `starforge merchant-accounting-workspace` calls remain valid.

## Weekly cash and monthly close

The complete [procedure-set guide](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/RUNBOOK_PROFILES.md) and [editable weekly/monthly starter](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/examples/weekly-monthly-runbook.json) are installed with this product. The starter has ten original procedures, a six-procedure weekly cash set and an eight-procedure monthly close set. Replace its client, people and instructions with the actual engagement before publishing its immutable edition.

A new period fixes its named set and catalog edition. Preparation, review, assignment handovers, CSV, print and portable receiving use those exact selected procedures. Portfolio calendars carry the same choice into the original client create request; an existing period keeps its saved selection.

## Complete work in one product

| Work | Saved result |
| --- | --- |
| Publish a client's procedures | Immutable editions with stable task identifiers, full instructions, reference links, notes, uploaded resources and optional named procedure sets. |
| Review an issued buyer period | Exact source bytes, expense/credit allocations, named initialization, original first handoff and recoverable client requests. |
| Select a close source | Exact original client files, or a selected accountant handoff and its original or returned revision. |
| Prepare and review | Per-task work and supporting files, complete submitted rounds, returned corrections, reviewer decisions and explicit accepted open items. |
| Hand over responsibility | The original preparer/reviewer/date assignment and every later handover with its full work snapshot and unresolved-item note. |
| Commission a client | The client's real workspace, exact procedure edition, scope, source gaps, named lead/backup/reviewer and reporting instructions. |
| Schedule the firm | Staggered client periods, working-day capacity, holidays and time off, complete allocation preview and recorded handling of capacity conflicts. |
| Dispatch client work | A saved native request with the original client identity, request UUID, source revision and correction chain. |
| Deliver the close | Printable handover, task CSV with stable Runbook/Edition/Period/Task IDs, and complete portable period bytes. |
| Deliver the portfolio | Firm and commissioning histories, calendar editions, prepared commands and complete individually identified native client packets. |
| Continue at the receiver | Read-only received history, explicit local client adoption, and fresh periods using the receiver's actual new source files. |

All work can be completed in the grayscale browser desk. The installed typed clients, MCP tools and prepared-request CLI expose the same native operations. Unknown responses retain the original request for reconciliation; closing and reopening retains the original workspace and operation identities.

## Included interfaces

| Interface | Entry |
| --- | --- |
| Firm browser | `/portfolio.html` on the printed local workspace address. |
| Client browser | `/runbooks.html`, or the same desk mounted at `/portfolio/clients/ALIAS/runbooks.html`. |
| Native CLI | `starforge client-close runbooks ...` and `starforge client-close portfolio ...`. |
| Merchant tools | `merchant_accounting_runbooks_*`, `merchant_accounting_portfolio_*` and the existing accounting/file/maintenance tools. |
| Typed clients | `@tokenjunkielabs/starforge-merchant/merchant/accounting-runbooks`, `.../merchant/accounting-portfolio` and `.../merchant/accounting-platforms`. |
| Managed operation | The original Runtime workspace, Applications review, complete resource selection, saved start/stop and recovery. |
| Existing accounting | Accountant returns, adjustments, statements, QuickBooks/Xero receiving and Cryptoworth remain available through their original paths. |

The complete native guides remain part of the package:

- [Weekly cash/monthly close procedure sets and the complete editable starter](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/RUNBOOK_PROFILES.md).

- [Client runbooks, source choices, review and CLI](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/RUNBOOKS.md).
- [Firm portfolio, calendar, client commands and receiving](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/PORTFOLIO_GUIDE.md).
- [Installed Runbooks client and tools](../../stellar-forge/mcp-merchant-operator/ACCOUNTING_RUNBOOKS.md).
- [Installed Portfolio client, tools and Applications](../../stellar-forge/mcp-merchant-operator/ACCOUNTING_PORTFOLIO.md).
- [Buyer-only configured host, original source and receiving](../../stellar-forge/mcp-merchant-operator/ACCOUNTING_BUYER.md).
- [Buyer, QuickBooks and Xero customer client and saved-operation CLI](../../stellar-forge/mcp-merchant-operator/ACCOUNTING-PLATFORMS-CLIENT.md).

## Original source

This standalone product carries the original client Runbooks from [public PR1813](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/1813) and the complete portfolio from [public PR2068](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2068). [SOURCE_LINEAGE.json](SOURCE_LINEAGE.json) identifies their exact source pins and the standalone foundation's complete file map. Shared server, accounting and Applications joins preserve this repository's existing implementations; the native Runbooks/Portfolio engines and browser source keep their original bytes.

The distribution's own manifest binds the final selected recipe, repository commit, every packaged source file, runtime profile and archive. Use that generated manifest for the particular installed edition. The [named procedure-set feature](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2219) is adopted as one complete controller, browser, native CLI, MCP and typed-client change; its complete source map is appended to the lineage.
