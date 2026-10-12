# Merchant receivables and service billing

Operate a merchant's complete invoice and customer-payment cycle in the original private accounting workspace. The product brings customer records, service quotations, issued invoices, payment allocation, credit notes and dated account delivery into one installed operator.

The maintained `merchant-receivables` selection includes the invoice and quotation workflow, typed payment interfaces, Stellar wallet collection, customer payment plans, dated collections, accounting and support commands, their explicit package exports and managed Applications adapters. It uses the existing accounting writer and customer UUIDs, the SF74 quotation engine and the source distribution's installation, lifecycle and recovery. `starforge registrations` shows the inventory in the installed source edition.

## Install the selected product

Use the current maintained repository and an exact commit that contains [the receivables selection](../../stellar/scf-starforge-20261009/distribution/selections/merchant-receivables.json). The source builder packages that commit through the existing Git reader, original browser manifests and dependency collector.

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --ref FULL_COMMIT_SHA \
  --selection merchant-receivables --out /private/receivables-release
~~~

Use the archive path and SHA256 returned by that command. The retained output belongs to that source commit and selection. To continue the same output after interruption:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout \
  --out /private/receivables-release --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /private/receivables-release --status
~~~

The original Runtime workspace also discovers this recipe in **Build a product**. Select **Merchant receivables and Stellar invoice collection**, review its exact source, then open the completed archive in **Source & profile**. The package version includes both the source commit and `selection.merchant-receivables`.

The complete installed accounting, quotation and managed-operator profile uses the existing Linux runtime: Node 22.16+, Python 3.11+, npm, `flock` and the original archive utilities. Prepare the selected original dependencies through the maintained installer:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/receivables-runtime \
  --archive /absolute/returned-package.tgz --sha256 RETURNED_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /private/receivables-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/receivables-runtime --load --source
~~~

The native feature equips the existing Stellar verification/recovery paths; schema and OpenAPI belong to the original source and quotation-support workflows. The installer selects their actual declared versions. An already retained matching dependency graph can be received with its original lock and the installer's `--adopt-existing` option. Use `resume --dir /private/receivables-runtime` to continue that same prepared installation.

The installed package stays in `/private/receivables-runtime/package/`, beside the selected `node_modules/`. Run its original command through that layout:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /private/receivables-runtime -- receivables help
~~~

The remaining examples use the installed `starforge` command. The same arguments can be passed after `runtime-install ... run --`.

## Connect the original accounting workspace

An initialized accounting workspace is reopened using its existing directory:

~~~sh
starforge receivables serve \
  --directory /private/merchant/accounting --port 8448
~~~

For first initialization, select the merchant's actual source outbox, proof directory and accounting terms. Keep the accounting directory outside those input directories:

~~~sh
starforge receivables serve \
  --directory /private/merchant/accounting \
  --outbox /private/merchant/source/outbox \
  --proof-dir /private/merchant/source/proofs \
  --terms /private/merchant/source/terms.json \
  --port 8448
~~~

The original initializer validates the selected private paths and terms before saving. Existing records keep their actual customer, order, report and source identities.

Open the printed local URL. **Customers and statements** opens the original customer manager in that same process. Add or update the customer's billing address, reference and contact details there. Back in receivables, save the issuer name, document prefixes and payment instructions in Settings. The same customer UUID is used for quotations, invoices, receipts and account exports.

In the existing Runtime workspace, attach this installed runtime and use **Applications**:

~~~sh
starforge runtime-workspace init --workspace /private/receivables-operator

starforge runtime-workspace attach \
  --workspace /private/receivables-operator \
  --runtime /private/receivables-runtime --label "Merchant billing"

starforge runtime-workspace serve \
  --workspace /private/receivables-operator --port 8465
~~~

Choose **Merchant receivables**, select the initialized accounting directory, and use Review, Save, Start and Open. The source-owned adapter binds the original workspace ID and source configuration and rechecks them inside the accounting lease. **Merchant accounting** opens the maintained reconciliation/connection workflow; **Merchant support** opens the existing cases and quotation workflow.

One process owns an accounting directory at a time. Use the running process's customer, receivables and **Payment plans** views together. **Customer payment plans** in Applications opens the same combined server directly at its collection desk. Stop that process through its original application before opening the directory with another owner.

## From service quotation to invoice

The original Merchant support desk creates and retains commercial quotations. Its existing commercial guide and command remain packaged:

~~~sh
starforge merchant-commercial --help
~~~

Prepare the quotation from the selected implementation, service and original pricing sources. Review its original calculation and publish the selected edition. Download the complete retained QUOTE material or QUOTE_JSON. The source case retains the separate RESPONSE material for a chosen customer response.

In receivables, choose those original files, select the existing accounting customer, dates and currency precision, then choose a billing scope:

| Scope | Selected charge |
| --- | --- |
| IMPLEMENTATION | The quotation's one-time implementation lines, charged once. |
| RECURRING | Service and planned route-usage lines multiplied by an explicit positive number of monthly periods and a specific period label. |

For recurring charges, use an explicit label such as `October–December 2026` and a count of three. Enter the intended issue and due dates separately.

The compiler checks the original canonical quote seal, draft and calculation review; complete source line totals; and a supplied response's binding to that exact quote edition. It preserves both original case IDs when a receiving case records the response. The accounting customer mapping is explicit.

The resulting invoice is an editable draft. Review the scope, currency precision, purchase order, tax, dates and individual charges before issue. The full mapping retains original line identifiers, quantities, rates, micro-USD extended amounts, selected periods and each rounding difference. Planned usage keeps its original description. The chosen matching ACCEPTED response appears in the retained quote review.

An implementation charge cannot be duplicated by changing a period label. Recurring imports retain their exact quote, customer, scope, period count and label. The complete original quote, chosen response, calculation source and review are downloadable from the invoice's source record. Later manual edits to the imported draft remain visible.

The original SF74 operating documents are included at:

- [Commercial quotation workflow](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/COMMERCIAL.md).
- [Full commercial receiving](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/RECEIVING.md).
- [Receivables source/operator guide](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/README.md).

## Issue and deliver the invoice

Create a manual invoice or continue an imported quotation draft. Monetary fields are decimal strings at an explicit currency precision. Quantities support six decimal places. Line discounts, invoice discounts and tax amounts are explicit.

Save the draft, review its current preview, then issue it. The current customer and issuer details participate in that review. Issuing assigns the configured prefix, issue year and next workspace sequence and creates immutable invoice JSON, a line CSV, printable HTML and its file manifest.

Download the original issued files for the customer's usual delivery channel. The printable invoice displays line and invoice discounts, taxes, dates, payment instructions and the frozen billing identity. Later changes to a customer address or issuer settings leave that issued document's original content intact.

## Receive money and allocate it

Record a payment with the accounting customer, currency and precision, received date, method, reference and amount. The ledger distinguishes the payment's total amount from amounts allocated to invoices. A partial allocation leaves the balance available for that customer's later invoices.

Choose the invoice, amount and effective allocation date. The controller requires matching customer and currency and checks both the selected date and all affected later intervals. A backdated allocation therefore preserves money already used by a later allocation.

A native Stellar settlement can be imported from a completed original accounting report. Select the original ledger event and customer order binding, then enter the commercial-currency valuation and basis. The receipt retains the native report, event, transaction fingerprint, asset and atomic amount. Its existing public-network transfer and official RPC verification remain the payment evidence.

Correct an allocation with a dated release and reason. Its original history remains visible and the receipt becomes available from that date. A receipt or invoice can be voided once applicable allocations have been released. A credited invoice retains its issued credit-note history.

## Credit a customer and close a period

Issue a credit against original invoice lines with explicit net and tax amounts. Cumulative credits cannot exceed those original line amounts. A credit after full payment appears as a customer credit balance.

Choose the as-of date before reviewing balances, invoice details and aging. Amounts remain separate for every currency and precision. The aging table distinguishes current, 1–30, 31–60, 61–90 and 91+ day balances.

Download the complete customer account TAR, including its issued invoice and credit-note files and manifest. JSON, CSV and printable account views are available independently. Customer exports select issued documents effective on the chosen date and the corresponding receipt references and allocation history.

Useful original commands:

~~~sh
starforge receivables state \
  --directory /private/merchant/accounting --as-of 2026-10-31

starforge receivables detail \
  --directory /private/merchant/accounting --id INVOICE_UUID \
  --as-of 2026-10-31

starforge receivables export \
  --directory /private/merchant/accounting --customer CUSTOMER_UUID \
  --as-of 2026-10-31 --out /private/new-october-account
~~~

Exports use a new output directory. The existing customer statements, accounting pricing, native reconciliation and recovery commands remain available in the same installed selection.

## Schedule and collect an invoice balance

Open **Payment plans** from the running receivables navigation. Choose an issued invoice and balance date, enter its installment dates and amounts or generate equal installments, save the draft, review the complete invoice basis and activate the customer schedule. Every edition retains printable HTML, CSV, JSON and its file manifest.

The desk applies the same recorded allocations, releases and credit notes to the dated schedule. It separates overdue, due-today, upcoming, after-horizon and unscheduled amounts by currency and decimal precision. Revised editions preserve earlier schedule files and historical views; a dated cancellation returns the remaining invoice amount to unscheduled collections.

The [complete payment-plan operating guide](../merchant-payment-plans/README.md) covers schedule preparation, collections, customer files, recovery and the installed HTTP/CLI interfaces. This receivables selection includes that same implementation, command, browser assets and managed **Customer payment plans** application. The `merchant-payment-plans` selection packages the same accounting and quotation dependencies with the payment-plan guide as its product entry.

## Continue after interruption or upgrade

Each receivables mutation retains the named operator, current accounting revision and original request ID. Draft updates also retain their expected version; issue retains the reviewed preview hash.

When a request's outcome is uncertain, retain that exact pending request. The operator disables another mutation until the original outcome is resolved. If the accounting writer requests reopening, stop and reopen the same original directory, then retry the same request ID and content. The saved accounting journal determines whether it already completed.

An edited draft remains parked when changing selection or importing a quotation, and can be resumed. A stale accounting revision requires reviewing the current saved state before applying a subsequent change.

All receivables state is under the original `workspace.json.receivables`; customer identities remain under `workspace.json.customerStatements`. Issued documents and source-quotation files use the existing private `exports/` tree. The maintained accounting backup captures those files with the workspace.

For an upgrade, prepare a new runtime for the selected new source archive, retain the old runtime and original accounting directory, then use the maintained runtime compare/recovery workflow. Stop the prior owner, review the same accounting binding in the new application, and reopen the existing issued documents and dated account.

## Programmatic interfaces

| Package export | Original interface |
| --- | --- |
| `@tokenjunkielabs/starforge-merchant/merchant/receivables` | ReceivablesWorkspace over an open AccountingWorkspace. |
| `@tokenjunkielabs/starforge-merchant/merchant/receivables/core` | Exact invoice/credit compilation, balances, aging and customer rendering. |
| `@tokenjunkielabs/starforge-merchant/merchant/receivables/quote-import` | Pure original quotation/response-to-draft compilation. |
| `@tokenjunkielabs/starforge-merchant/merchant/receivables/client` | Typed HTTP client for the same operation and file contracts. |
| `@tokenjunkielabs/starforge-merchant/merchant/receivables/server` | Complete loopback server or handler over the existing open workspace. |

Use the actual package name shown by the installed `package.json` and retain the suffixes above. The original distribution exports are explicit; `starforge registrations --source merchant-receivables` prints this product's command, client, browser and Applications registrations.

## Collect an invoice through a Stellar wallet

Open an issued invoice and use **Stellar payment requests** to prepare collection terms. The review binds the request to the original customer, invoice document and current amount due. Choose the public network or test network, the merchant's exact receiving account, the asset and amount in Stellar units, and the amount of the commercial invoice that the transfer will settle. When the asset value differs from the invoice currency, retain the agreed valuation in the request.

Issue the reviewed request, then share its wallet link or original `payment-request.html` document. Each request has its own invoice-bound memo. The operator can issue separate partial collection requests, inspect saved returns, cancel replaced instructions and download the original request and full receiving record.

After the customer sends the payment, record the transaction hash returned by their wallet and use **Receive**. The native verifier uses the original Stellar RPC catalogue and official SDK to check the ledger transaction's network, destination, payer constraint when selected, asset issuer, exact amount, memo and successful operation result. It supports classic payments, strict-send and strict-receive path payments, and fee-bump transactions reported by either their inner or outer hash.

A verified public-network transfer produces an original customer receipt and dated invoice allocation. Both fee-bump hash identities participate in duplicate detection. Full native proof is retained as original private files and hydrated for downloads; the accounting journal keeps a compact reference. Test-network receiving remains visible as a verified test observation. All original invoice documents retain their issued content as payments and balances change.

The [complete payment request guide](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/PAYMENT_REQUESTS.md) covers browser operation, CLI requests, the typed HTTP client, exact file names and recovery of interrupted work.

## Original native exercise

The product includes one complete private-file exercise:

~~~sh
node stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/EXERCISE.mjs
~~~

It uses the actual accounting workspace and original SF74 commissioning, quote review, seal and document producer. It creates its own private temporary accounting directory and completes invoice issue, payments and dated allocations, credit, historical release/backdating checks, one-time and recurring quote imports, exact source downloads, customer export, close/reopen and actual HTTP requests.

The same programme is retained under `SCF-MERCHANT-RECEIVABLES-DFF77-20261012`. Its complete 65-member source capsule, including the original license, is Git blob `87452bd68e4208e6d48ed18bcdea24dcf3da1152` in `woahwhattheheck/public-commons-sprint-2026`. The capsule contains the full UTF-8 body and original Git identity for every member. Its selected exercised path uses Node builtins.

[Source lineage](SOURCE_LINEAGE.json) retains the exact adopted public product, original accounting dependency files and existing quotation/customer source identities. The original accounting, SF74, native transfer and distribution owners continue to maintain those components.
