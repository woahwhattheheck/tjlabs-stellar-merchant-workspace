# Commission document jobs from an existing commerce setup

Use the retained commerce setup to install a document merchant with the existing payer, original operator budget, original facilitator and a specifically selected native price. This is the practical transition from an HTTP commerce installation to the paid Jobs document workflow. The earlier commerce setup does not need to contain a Jobs configuration.

The installed command is `document-merchant commission`. The source checkout also accepts:

~~~sh
node products/document-merchant/cli.mjs commission --help
~~~

The selected source supplies the real merchant origin, asset, recipient, amount, payment flow and facilitator policy. The new document application uses the maintained Jobs seller, Request intake, original checkout and worker. The existing operator workspace remains the owner of its payer and spending ledger.

## 1. Recover the complete original setup

Use the existing native host or restore its complete private archive to the original paths. The retained sf66 setup directory must contain its original `prepared.json`, `seller.json`, `facilitator.json`, `commerce-plan.json`, `operator/` and `session/` together with every file named by `prepared.json`. The original inspector checks all retained files and reopens the existing operator and commerce session before commissioning.

Select the actual directory and installed source:

~~~sh
DOCUMENT_CHECKOUT=/absolute/current/merchant-checkout
DOCUMENT_COMMERCE=/absolute/original/prepared-commerce
DOCUMENT_COMMISSION=/absolute/private/document-commission
DOCUMENT_CUSTOMER=/absolute/original/document-customer
~~~

These are operating variables: replace their values with the actual retained paths. `DOCUMENT_COMMISSION` is this installation's private preparation directory. Keep it distinct from the original commerce directory and its operator. `DOCUMENT_CUSTOMER` is the one original Jobs customer directory to use for the ensuing requests. If that customer already has a complete options file, use it directly in step 3.

An original commerce seller and this document seller cannot own the same native facilitator signer simultaneously. Finish the original seller through its original close operation before starting the commissioned service. The facilitator's existing signer-ownership mechanism handles admission. A stopped or timed-out native process must be reconciled through its original operation before another process acquires that same account.

## 2. Read the original offers

~~~sh
node "$DOCUMENT_CHECKOUT/products/document-merchant/cli.mjs" commission offers \
  --commerce-directory "$DOCUMENT_COMMERCE"
~~~

The response contains the original operator workspace, merchant origin, payer, configured budget and each original offer's `intentId`, route, accept index and complete native terms. Select the intended original offer explicitly:

~~~sh
DOCUMENT_ORIGINAL_INTENT=ACTUAL_ORIGINAL_INTENT_ID
~~~

The terms of that selected offer become the price of one document job. An original commerce intent is a source selection here; commissioning does not replay or replace that prior purchase. Each new document retains its own existing Request, native checkout and Jobs identities under the customer's actual parent task.

This bridge accepts the retained sf66 setup's native Stellar testnet profile. It preserves the exact original amount, asset, recipient, timeout and extra fields. It checks those terms against the complete original facilitator policy. A mainnet deployment uses its existing separately commissioned source and the ordinary document setup/service path.

## 3. Review and prepare the complete installation

Choose the actual rendering provider. The provider IDs are:

| ID | Native service | Source formats |
| --- | --- | --- |
| `mintpdf` | MintPDF at mintpdf.dev | HTML and Markdown |
| `snaplab` | snaplab at snaplab.dev | HTML |
| `pdfmint` | PDFMint at pdf.mintapis.com | HTML and Markdown |

MintPDF anonymous rendering can be selected explicitly with `--anonymous`. Its actual allowance and response determine availability. Omit that option to retain the provider's original bearer-account selection. The separate PDFMint service has its own account and key.

Review, without creating the installation or starting payments:

~~~sh
node "$DOCUMENT_CHECKOUT/products/document-merchant/cli.mjs" commission review \
  --commerce-directory "$DOCUMENT_COMMERCE" \
  --directory "$DOCUMENT_COMMISSION" \
  --intent "$DOCUMENT_ORIGINAL_INTENT" \
  --provider mintpdf --anonymous \
  --customer-directory "$DOCUMENT_CUSTOMER" \
  --seller-port 8431 --customer-port 8432 \
  --operator-port 8433 --operations-port 8434 \
  --out /absolute/private/document-commission-review.json
~~~

Use the existing host's available ports. The selected HTTPS proxy must route the document functions to the seller listener and `/jobs/`, including intake, to the customer listener. Operator and operations listeners remain private.

If the customer already has its own full options JSON, replace `--customer-directory` with:

~~~sh
--customer-options /absolute/private/original-customer-options.json
~~~

The full original options are preserved, including roots, timeouts, storage and nested checkout configuration. Its `checkout.operatorWorkspace` must be the same original commerce operator. Its configured buyer runtime must be the installed runtime. When selecting only a customer directory, commissioning writes the normal original workspace options with that directory and the existing operator; opening that workspace later reuses its original catalog and roots.

Read the complete review's `selectionSha256`, native terms, provider, directory choices and environment-variable names. Prepare the exact reviewed selection:

~~~sh
node "$DOCUMENT_CHECKOUT/products/document-merchant/cli.mjs" commission prepare \
  --commerce-directory "$DOCUMENT_COMMERCE" \
  --directory "$DOCUMENT_COMMISSION" \
  --intent "$DOCUMENT_ORIGINAL_INTENT" \
  --provider mintpdf --anonymous \
  --customer-directory "$DOCUMENT_CUSTOMER" \
  --seller-port 8431 --customer-port 8432 \
  --operator-port 8433 --operations-port 8434 \
  --expected-selection ACTUAL_REVIEW_SELECTION_SHA256 \
  --out /absolute/private/document-commission-prepared.json
~~~

Repeat the same complete prepare command after an interrupted preparation. It retains the original review, exact generated files and original document setup. It does not initialize another payer, reset an operator budget, create a substitute ledger or dispatch the renderer.

A new provider, different original price, changed source, different customer or changed port selection belongs in a newly reviewed installation directory. Existing customer Requests and Jobs retain their original setup and output sources.

### Complete prepared files

| Path inside the commissioning directory | Use |
| --- | --- |
| `commissioning.json` | Full selected source, exact original terms and complete generated file bodies |
| `native-factory.mjs` | Original facilitator adapter with one explicit service owner |
| `merchant/` | Original complete document application, jobs.json, provider, setup, examples and merchant state |
| `customer-options.json` | Complete original Jobs customer options with nested checkout/operator |
| `case-document-options.json` | Direct input for the existing Case Desk customer PDF workflow |
| `composition-options.json` | Direct settings for the installed Document production service |

The customer source root is `CUSTOMER/artifacts/document-compositions`, within the original customer's allowed artifact tree. Provider credentials and native signer values remain environment values on the existing operator host. The review and preparation expose their selected variable names.

Inspect the complete retained installation:

~~~sh
node "$DOCUMENT_CHECKOUT/products/document-merchant/cli.mjs" commission inspect \
  --directory "$DOCUMENT_COMMISSION"
~~~

## 4. Start the original merchant service

Load the original signer variables through the host's maintained private environment. For a bearer renderer, retain its configured provider-key variable there too. Then start the original service in that same environment:

~~~sh
node "$DOCUMENT_CHECKOUT/products/document-merchant/cli.mjs" commission serve \
  --directory "$DOCUMENT_COMMISSION" \
  --expected-selection ACTUAL_REVIEW_SELECTION_SHA256
~~~

The command returns one complete JSON startup line with the actual original seller, customer, operator and operations addresses, instance ID, process ID, selected origin, route map and customer-options paths.

The process keeps running as the service owner. Its generated native factory acquires the original facilitator signer only when the original Jobs seller starts. The native SDK owns verification and settlement. Jobs owns durable admission, paid activation, worker execution, cancellation and receiving.

Route the actual existing public HTTPS origin as returned by the service:

| Public path | Actual original listener |
| --- | --- |
| `/documents/html` and, when configured, `/documents/markdown` | Returned `seller` address |
| `/jobs/`, including `/jobs/intake/v1/` | Returned `customer` address |
| Original operator and operations addresses | Existing private operator environment |

Preserve any other current proxy routes. The service does not rewrite the proxy or start another public tunnel. If the retained public origin is unavailable, restore its existing host/proxy through that original operation.

Stop with Ctrl-C or the original process owner. The bridge first closes the original Jobs listeners and worker, then drains the original native facilitator. If accepted settlement work outlasts its ordinary grace interval, it waits for that work before releasing signer ownership. A later start uses the same installation, merchant state and original payer budget.

The generated factory is owned by `commission serve`; use that command so its facilitator lifetime is explicitly drained. Ordinary pre-existing document installations continue to use their original `launch` or Applications configuration.

## 5. Fulfill the customer's actual source

The merchant service stays running while the separate customer process operates its original workspace. Only one process opens that customer at a time.

### Existing Case Desk edition

Use the existing Commons checkout and the saved customer programme's actual workspace. Choose the saved pack and edition using its original Lead Pack state. The private options file is ready:

~~~sh
DOCUMENT_COMMONS=/absolute/current/commons
DOCUMENT_CASE_WORKSPACE=/absolute/original/case-desk-workspace
DOCUMENT_CASE_OPTIONS="$DOCUMENT_COMMISSION/case-document-options.json"
DOCUMENT_PACK=ACTUAL_SAVED_PACK_ID
DOCUMENT_EDITION=ACTUAL_SAVED_EDITION_ID
~~~

Prepare the complete selected customer HTML:

~~~sh
node "$DOCUMENT_COMMONS/tools/revenue_owner_console_20261010/lead_document_cli.mjs" prepare \
  --workspace "$DOCUMENT_CASE_WORKSPACE" \
  --options "$DOCUMENT_CASE_OPTIONS" \
  --pack "$DOCUMENT_PACK" --edition "$DOCUMENT_EDITION" \
  --reviewed-by "Existing operator" \
  --out /absolute/private/customer-pdf-prepared.json
~~~

Read the returned `selected.operation_id`, `selected.plan_sha256` and actual full native price. Continue that operation:

~~~sh
node "$DOCUMENT_COMMONS/tools/revenue_owner_console_20261010/lead_document_cli.mjs" run \
  --workspace "$DOCUMENT_CASE_WORKSPACE" \
  --options "$DOCUMENT_CASE_OPTIONS" \
  --pack "$DOCUMENT_PACK" \
  --operation ACTUAL_RETURNED_OPERATION_ID \
  --plan-sha256 ACTUAL_RETURNED_PLAN_SHA256 \
  --attach \
  --out /absolute/private/customer-pdf-received.json
~~~

The original customer flow stages the exact edition HTML, executes its native checkout, receives all four required output files, and attaches the complete PDF to the original case item. It keeps that item's original pinned HTML URL. Reuse the same operation for interrupted rendering or receiving. The complete Commons `LEAD_DOCUMENTS.md` covers file download, Collection export and separate attachment review.

### Customer batch or dataset/template production

Use `customer-options.json` with the maintained [batch workflow](BATCHES.md). For the complete browser, open the same customer through Document production:

~~~sh
node "$DOCUMENT_CHECKOUT/products/document-merchant/cli.mjs" compose serve \
  --workspace-options "$DOCUMENT_COMMISSION/customer-options.json" \
  --provider mintpdf \
  --merchant-origin ACTUAL_RETAINED_HTTPS_ORIGIN
~~~

Use the same actual provider selected above. The original authenticated customer host returns its document page. Complete CSV/JSON data and HTML/Markdown templates become source-bound document requests; native price review, fulfillment, full receiving and customer Collection export remain the original operations. Close this customer browser before using the customer CLI on the same state.

## 6. Continue the original receiver command

The original native operation's entry point accepts the retained-commerce path directly:

~~~sh
node operations/scf-document-merchant-20261012/native-run.mjs \
  "$DOCUMENT_CHECKOUT" --commerce offers \
  --commerce-directory "$DOCUMENT_COMMERCE"
~~~

After selecting the actual original intent, use the same entry with `--commerce review`, `prepare`, `inspect` or `serve` and the complete options above. It delegates to the installed command. The earlier three-positional-argument Jobs-config receiver remains available for an operator that already has that original Jobs configuration.

Keep the original saved customer store, exact pack/edition, original task reference and the selected funded operator together. The current native owner returns its actual accepted run, original quote and complete customer PDF receiving. A rendered page count, supplier unit, native document purchase and completed parent task remain distinct quantities.

## Recovery

| Returned condition | Continue the same operation |
| --- | --- |
| Original setup file or recorded hash differs | Recover the complete original retained source before inspecting again |
| Original intent is absent or ambiguous | Read `commission offers` and select the exact retained intent |
| Customer options choose another operator/runtime | Use the full options of the original customer and selected funded operator |
| Original source or selected settings changed | Keep the existing installation; review a new installation for the changed source |
| Original facilitator signer is busy | Finish or reconcile its actual current owner, then start this same commissioned service |
| Renderer reports authentication, capacity or allowance failure | Inspect the original supplier account and original retained Jobs result |
| Native payment or response is uncertain | Continue the original Checkout recovery and accepted job; retain the same request |
| Full PDF receiving is interrupted | Receive the existing job and retain all original source/output identities |
| Service stops during native work | Its original close and facilitator drain retain ownership until accepted work completes |

The operating [document guide](OPERATING.md), [batch guide](BATCHES.md), [composition guide](COMPOSITION.md) and [ordered PDF guide](ASSEMBLY.md) remain the downstream customer workflows.
