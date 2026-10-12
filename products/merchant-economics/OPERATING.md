# Operate supplier costs, tariffs, recorded usage and customer pricing

Use one saved merchant pricing workspace from its original traffic capture through supplier-source review, cost allocation, graduated and volume tariff comparisons, recorded usage reviews, pricing proposals, customer quotation and receiving. The original customer case carries the selected price into accepted implementation, Service work and complete editable handover. The browser, merchant MCP and CLI use the same sources, immutable editions and revision checks.

This workflow is included in the Stellar merchant product as `revenue-workspace`, `merchant-tariffs`, `merchant-performance` and `merchant-mcp pricing`. Its source and browser use the existing SF97 engine. The MCP interface uses the original merchant MCP runtime. Select the merchant’s existing payment, database or provider runtime separately when starting that merchant.

## Install the complete Merchant economics product

In the maintained runtime workspace, choose **Build a product**, select the reviewed canonical source commit and **Merchant economics**, then use the resulting original archive in **Source & profile**. The committed `merchant-economics` recipe includes the original API merchant, supplier costs, Pricing and Merchant support applications, tariff and recorded-usage operators, scenario/repricing modules, typed clients, performance-backed customer quotations, accepted implementation, Service and buyer/accountant continuation, and seller releases. It retains the original OpenAPI merchant source and package dependencies used by release staging.

The same existing builder accepts this selection:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/canonical-merchant-checkout \
  --ref REVIEWED_CANONICAL_COMMIT \
  --selection merchant-economics \
  --out /absolute/merchant-economics-release
~~~

Use the reviewed full commit in `--ref` and keep the original output for its subsequent resume. The package records its source commit, exact recipe, complete file inventory and archive hash. Continue through the existing [source build](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/SOURCE_BUILDS.md) and [runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) workflow. Select the native SDK and the original `schema`, `openapi` or `mcp` runtime features required by the intended merchant operation. The tariff calculations and local operator use the installed Node runtime and original saved source.

After installation, `starforge registrations --source merchant-tariffs` shows the installed command and original package exports. `starforge merchant-tariffs --help` gives the complete direct-workspace command surface. Existing runtime ownership, private merchant inputs and saved workspace directories carry forward through the same installation.

## 1. Open the merchant’s original pricing workspace

Keep the seller configuration, original observations and private operating state outside the source checkout. Use Node.js 22.16 or later and the local filesystem requirements in the [whole-product operating guide](../merchant-workspace/OPERATING.md). Create the private parent directory with the owner’s ordinary filesystem controls. The workspace creates a new private state directory or reopens its existing one.

~~~sh
starforge revenue-workspace \
  --config /srv/starforge/config/merchant-seller.json \
  --snapshot /srv/starforge/observations/merchant-traffic.json \
  --state /srv/starforge/state/merchant-pricing \
  --port 0
~~~

Use the actual seller configuration and traffic snapshot produced by that seller’s original traffic observer. `--history ORIGINAL_HISTORY_JSON` can accompany a snapshot or supply the retained traffic history alone. Alternatively, select the original live loopback Operations listener with `--ops-url ORIGINAL_OPERATIONS_URL`; do not combine this live selection with snapshot/history files. The [pricing workspace guide](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/WORKSPACE.md) explains the original source and history forms.

Before installation, replace `starforge` with `node stellar/scf-starforge-20261009/distribution/cli.mjs` from this checkout. To use an already installed runtime, run `starforge runtime-install run --dir EXISTING_READY_RUNTIME -- revenue-workspace ...` with the same workspace arguments.

In the installed runtime console, the same workflow is **Applications → New application → Merchant pricing and scenario planning**. Select the original seller, private pricing directory and observation source, use **Review application**, save the application, then **Review start → Start reviewed application**. Applications retains the original process and its normal Stop/reopen lifecycle. The [pricing Applications guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/PRICING_APPLICATIONS.md) gives the selected runtime and managed-source controls.

Startup prints the private pricing `url`, `planningUrl` and `costsUrl`. Open `url`, inspect the original routes and observations, then save the first pricing review. A cost book selects that saved review by its returned `pricingVersion`. The selected seller and observation hashes stay attached to the review.

Enter unit-price quotations, quote basis, known assumptions and intended monthly paid-request targets explicitly. Leave unknown costs unknown. The original observer’s finished HTTP-2xx response count measures successful HTTP responses; provider quota units, paid settlements and bank receipts remain separate records. Original retention and selected-period limits remain visible when a history cannot supply the whole requested period.

Optional `--supplier-usage ORIGINAL_USAGE_JSON` and `--accounting-report ORIGINAL_ACCOUNTING_JSON` expose the selected original context files for capture. Their units and accounting groups retain their original meaning. A provider’s dispatch allowance does not determine its billed monetary cost.

## 2. Retain original supplier documents

Open the printed `costsUrl`, ending in `/economics`. Upload the exact original documents and label each source using its actual purpose:

| Source kind | Use | Interpretation |
| --- | --- | --- |
| `BILL` | Supplier bill or documented charge statement | Actual charge source; preserve any explicit credit-note rows |
| `CREDIT_NOTE` | Supplier’s credit document | Nonpositive credit amounts, kept with their original reference |
| `QUOTE` | Supplier quotation or published tariff | Planning input, separate from actual billed costs |
| `USAGE` | Original provider or seller usage capture | Original measurement and unit context |
| `ACCOUNTING` | Original selected accounting report | Its original financial groups and statement meaning |
| `SUPPORT` | Additional source evidence | Retained supporting document with its own identity |

Each original is immutable and limited to 16 MiB. Its receipt includes exact bytes, SHA-256, source UUID, metadata and original filename. Preserve the original reference, supplier, credential-free source URL and dates where available. A corrected document is a new source with a new UUID; the earlier original and its editions remain available.

A published per-request tariff can support a `QUOTE`. Free credits, discounts, bonuses, failed-request treatment and other billing terms can make tariff multiplied by calls differ from cash paid or a supplier bill. Record the tariff’s original date and source. Do not label that calculation as an observed debit.

## 3. Map the full source and conserve its allocations

For CSV or other delimited originals, select comma, tab, semicolon or pipe and inspect the actual headers. The native reader accepts up to 10,000 rows, 256 columns and 65,536 characters per cell. Map reference, supplier, kind, currency, amount, quantity, unit and description through explicit column or constant rules. Trimming is an explicit mapping choice.

Every original row has a stable `sourceUUID:one-based-row` identity. Keep that identity separate from a supplier’s reference. Include each row or save its explicit exclusion and reason; the complete book retains the original selection and mapping.

Amounts are exact decimal strings with at most six fractional digits, and currency is a three-uppercase-letter code. Bill and quote amounts are nonnegative; credit notes are nonpositive. A bill original can contain explicitly mapped credit-note rows. Keep quantity units alongside the amount rather than treating them as money.

Select the saved pricing review and book period. Review these independent requirements:

- Every route in that pricing review needs a coverage assessment, including routes with no allocated source line.
- Every selected monetary source’s `metadata.period` must exactly equal the book’s `from` and `through` dates.
- The book also needs its explicit `periodAlignment` confirmation and explanation; matching dates alone do not provide that operator confirmation.
- Preserve any configured usage or accounting captures as `contextSourceIds`, with their actual units and scope.

Allocate a line by explicit operator weights or the original selected HTTP-2xx counts. The original engine allocates exact signed amounts deterministically and exposes any remaining amount. Review the line, route allocation and remainder together. Unassigned charges, incomplete route coverage, unknown denominator, negative net cost and unsupported currencies remain visible.

Save the complete book with the current economics revision. The resulting immutable edition contains the selected pricing version, sources, mappings, row dispositions, allocations, coverage, original context and complete report. Later corrections create another edition; they do not rewrite an earlier result.

## 4. Carry a cost decision into pricing

Inspect the edition’s billed and quoted views separately. The native pricing proposal requires eligible USD cost and a usable original HTTP-2xx denominator. A zero or missing denominator cannot produce an eligible positive per-response proposal. When needed, the exact ratio rounds upward to the next micro-USD and retains its rounding remainder.

Preview the proposed cost assumptions, then apply them with the original pricing revision and a retained operation ID. This saves a new original pricing review linked to the cost edition and proposal. It updates the review’s cost assumptions; the merchant’s configured atomic price remains unchanged by this action.

Use the original scenario page at `planningUrl` for modeled demand, fixed-cost assumptions and price alternatives. Saved scenario estimates retain their selected pricing review and assumptions. Keep modeled revenue separate from observed traffic, paid settlements and actual bills.

When a seller price change is intended, use the original repricing workflow. Select the complete ordered payment choice, enter the exact atomic amount as a string, inspect its preview and save the source-bound decision. The [pricing operating guide](../../stellar-forge/mcp-merchant-operator/PRICING.md) and [planning guide](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/PLANNING.md) describe those native contracts.

For deployment, the pricing workspace can also be opened with its original `--source-package`, existing `--release-store` and selected `--release-runtime` file. Supply that complete source/release selection together. Continue the saved repricing decision through the original retained-release stage, comparison, selection and restart workflow. An economics backup preserves pricing work; external merchant releases and runtimes keep their own operating records.

## 5. Compare graduated and volume tariffs

Start from an original saved pricing review for this merchant. Open **Tariffs** from the Pricing workspace, or **Tariff planning** from its managed Applications entry. You can also launch the same tariff operator directly:

~~~sh
starforge merchant-tariffs \
  --config /srv/starforge/config/merchant-seller.json \
  --snapshot /srv/starforge/observations/merchant-traffic.json \
  --state /srv/starforge/state/merchant-pricing \
  --port 0
~~~

Use the same original pricing directory. It contains the saved pricing versions, scenario history and tariff plans used by this workflow. The command prints the actual private launch URL. Its `#token=...` fragment authorizes that operator session; keep the complete URL with its operator.

Select a saved pricing version and its original route. Name each tariff, choose its mode, and enter ordered tier caps with an open final tier. Prices are nonnegative USD strings with at most six fractional digits. Quantities are whole request counts; canonical integer strings retain their exact value.

| Tariff mode | Calculation |
| --- | --- |
| `graduated` | Charge each used band at that band's price, then add the band subtotals. |
| `volume` | Find the tier containing the total quantity and charge every request at that tier's price. |

The review compares every selected tariff and quantity with the saved original baseline. It shows exact tariff revenue, fulfilled-request variable costs, contribution and margin where the original inputs support them. The tier-boundary review also exposes an all-units discount that would reduce total gross revenue after an additional request.

A graduated total and its chosen uniform quote are separate results. The exact effective unit price retains a numerator and denominator with twelve-decimal display bounds. The selected **UNIFORM** quote rounds upward to six decimal places per request. Review the uniform gross projection and its rounding difference before using that price in the original scenario and pricing workflows. At zero quantity the review remains readable and offers no scenario selection.

### Save a complete tariff plan

The CLI accepts the same input as the browser. A preview JSON contains `version`, `tariffs` and `volumes`. Each tariff contains `id`, `label`, `routeId`, `mode` and `tiers`; each tier contains `upTo` and `unitPriceUsd`. The final `upTo` is `null`. Use the exact saved version and route from the original source.

~~~sh
starforge merchant-tariffs preview \
  --config /srv/starforge/config/merchant-seller.json \
  --snapshot /srv/starforge/observations/merchant-traffic.json \
  --state /srv/starforge/state/merchant-pricing \
  --input /srv/starforge/reviews/tariff-preview-input.json \
  --output /srv/starforge/reviews/tariff-preview.json
~~~

The returned envelope is `{version,sourceLabel,sellerChanged,review}`. To save, retain the original input, add a nonempty `label` and one original request UUID, and set `tariffReviewSha256` to `preview.review.tariffReviewSha256`. Pass that complete JSON to `merchant-tariffs save` with the same workspace flags. The saved plan retains its source, tariff definitions, quantity comparisons and original review hash. Reopen it with `load --plan PLAN_ID`, or use the browser's saved-plan selector.

Each saved plan provides `plan.json`, `tariffs.json` and `comparison.csv`. Use `download --plan PLAN_ID --name comparison.csv --output NEW_FILE` with the same merchant flags to receive the complete original file. Explicit output files are created exclusively; choose a new destination for a new result.

### Carry the selected plan through original pricing

Choose a positive-quantity comparison, then choose **Review**. Inspect the current pricing against the selected source, the original scenario review and the proposed pricing change. The prepared selection binds both original workspaces and their expected revisions.

Commit that exact prepared selection with the two distinct original request UUIDs: `planRequestId` and `pricingRequestId`. The original scenario and pricing writers return their saved results. If a response is interrupted, keep the same selection and both UUIDs so the original requests can be reconciled and replayed. A changed merchant source or pricing revision needs a current review.

The selected USD quotation then continues through the original repricing actions. Open the saved pricing source, retain every ordered payment option's original route, index, amount and asset scale, and explicitly value the quoted USD against atomic units. Review and save the resulting price decision with its original `reviewSha256`, expected decision revision, label and request UUID. The operator can reopen that saved decision and download its original files. With the original API package and release store configured, stage the retained decision, then use the existing seller-release selection and restart workflow.

The tariff operator exposes the complete source/preview/save/stage continuation through `repricing-source`, `repricing-preview`, `repricing-save` and `repricing-stage`, plus `repricing-download` and `pricing-download` for their original files. The [full tariff operator guide](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/README.md) contains exact request examples, the 17 HTTP methods, TypeScript imports and same-request recovery.

### Use the installed typed client

Import the original HTTP client from the installed package:

~~~js
import { createTariffClient } from "@tokenjunkielabs/starforge-merchant/merchant/tariff-client";

const client = createTariffClient({ url: privateLaunchUrl });
const { review } = await client.preview(previewInput);
~~~

The client captures the launch URL at construction and sends its bearer token to that loopback origin. Its public TypeScript declarations preserve decimal strings and the preview envelope. HTTP errors retain the complete response body, status and headers. Original request IDs and saved workspace bindings pass unchanged to the server.

## 6. Attach the same workspace to an agent

Keep the browser’s existing state directory, seller configuration and observation selection in one private pricing connection file. The connection schema is `stellar-forge.pricing-workspace-connection.v1`; its `workspaces` map gives each selected merchant a stable alias.

~~~json
{
  "schema": "stellar-forge.pricing-workspace-connection.v1",
  "workspaces": {
    "merchant": {
      "label": "Merchant pricing",
      "config": "/srv/starforge/config/merchant-seller.json",
      "directory": "/srv/starforge/state/merchant-pricing",
      "snapshot": "/srv/starforge/observations/merchant-traffic.json",
      "costInputs": {
        "supplier-original": {
          "label": "Selected supplier original",
          "path": "/srv/starforge/sources/supplier-original.csv"
        }
      },
      "costBooks": {
        "current-review": {
          "label": "Selected complete allocation book",
          "path": "/srv/starforge/reviews/cost-book.json"
        }
      }
    }
  }
}
~~~

Use actual paths and source labels. The host declares these files; the caller selects their aliases. Connection and input files must be private regular files. Each input map accepts at most 64 aliases. A source alias can select at most 16 MiB and a complete book alias at most 64 MiB.

Initialize the original merchant MCP operator with that connection and its existing retained-release store:

~~~sh
starforge merchant-mcp init-pricing \
  --dir /srv/starforge/state/merchant-pricing-agent \
  --pricing /srv/starforge/config/pricing-connection.json \
  --release-store /srv/starforge/state/merchant-releases

starforge merchant-mcp serve \
  --config /srv/starforge/state/merchant-pricing-agent/merchant-mcp.json \
  --port 3211
~~~

Supply the incoming token through the configured `MCP_ACCESS_TOKEN` environment variable. If this operator does not yet have a release store, create a new one with the original `starforge releases init --store NEW_PRIVATE_STORE`, then select it in `init-pricing`. Keep a pre-existing store unchanged. Initializing that store does not start a merchant.

Open the selected native pricing handle with `merchant_pricing_open` and `{"workspace":"merchant"}`. Browser and MCP changes then share the original workspace revisions. Use the actual endpoint returned by the server as `MCP_URL`:

~~~sh
starforge merchant-mcp pricing cost-state --url "$MCP_URL" --workspace merchant
starforge merchant-mcp pricing cost-inputs --url "$MCP_URL" --workspace merchant --kind SOURCE
starforge merchant-mcp pricing cost-input --url "$MCP_URL" --workspace merchant \
  --kind SOURCE --input-alias supplier-original
~~~

Inspect the alias’s exact byte count and hash before upload. Save a private request JSON containing the selected alias, inspected identity, truthful metadata and one generated lowercase request UUID, then pass it to `cost-upload --url "$MCP_URL" --input REQUEST_JSON`. Reuse that exact UUID and request after an uncertain response. A committed source reopens from retained bytes even when its authoring file moves.

The same configured `pricing` provider also exposes the complete tariff workflow through `merchant-mcp pricing tariff-*`. It opens the original Pricing model under the same merchant alias and uses the same saved versions, request IDs, review hashes and original file downloader. The [tariff MCP guide](../../stellar-forge/mcp-merchant-operator/TARIFFS.md) gives all 17 operations, its typed client, complete portfolio file receiving and original pricing continuation.

The [complete cost MCP guide](../../stellar-forge/mcp-merchant-operator/COSTS.md) supplies every upload, mapping, weight, book, proposal, apply and export request schema. Use `cost-source` for paged source review, `cost-mapping` for explicit mappings and `cost-weights` for native allocation. A small complete book can be inline; larger books use the inspected host `BOOK` alias and its exact hash and bytes. Preview and save the same selected book against the current economics revision.

After an ambiguous source, edition or export save, use `cost-request` with its original request UUID and kind `SOURCE`, `EDITION` or `EXPORT`. Pricing application has its own revision and recovery: inspect the original pricing history and the edition’s `pricingLinks`. Keep the cost and pricing identities distinct.

## 7. Receive the complete result and continue work

Choose the handoff required for the actual recipient:

| Delivery | Retained contents |
| --- | --- |
| Original source download | Exact original bytes and its transport manifest |
| Cost-edition download or TAR | Complete native edition, original selected source evidence and native report/export files appropriate to that selection |
| Full workspace backup TAR | Captured pricing versions, repricing decisions, scenarios, cost sources, books, editions and their linked histories |
| Tariff portfolio JSON | Complete saved tariff plans and retained selection intents/results, with their original pricing source references |

The original cost-edition download has eight native files plus `edition-manifest.json`; its transfer also has `manifest.json`. Use the native manifest to select the complete file set. A full workspace backup is bounded by its captured pricing, decision and cost revisions and referenced editions. Previous generated archives and live credentials are excluded. Retain external merchant deployment files and the selected runtime separately.

Through MCP, create `COST_EDITION` or `WORKSPACE_BACKUP` with `cost-export` and a retained request UUID. Inspect the returned original export and its manifest. Download the selected original with the existing CLI:

~~~sh
starforge merchant-mcp pricing cost-download \
  --url "$MCP_URL" --workspace merchant \
  --kind export --id RETURNED_EXPORT_UUID \
  --manifest-sha256 RETURNED_MANIFEST_SHA256 \
  --out /srv/starforge/received/merchant-cost-backup
~~~

Repeat the identical command and destination to continue a retained prefix or reopen a completed download. The CLI checks original lengths and hashes. The export destination contains the original `EXPORT_UUID.tar` and transport manifest; keep them together.

For managed receiving, select the full TAR in Applications’ **Complete pricing and supplier-cost backup** field and a new private pricing directory. **Review application** inspects the entire archive, its hash, bytes, file count, retained source/review/plan counts and target state. Save that application, then **Review start → Start reviewed application** to run the original restoration. Inspect the received histories through its pricing, Supplier costs and Scenario planning links. After receiving completes, the optional backup field can be cleared before moving the handover TAR; keep the restored pricing directory selected.

The same receiving implementation serves the CLI. Inspect the original full TAR and selected new target first, without opening a listener:

~~~sh
starforge revenue-workspace \
  --inspect-cost-workspace /srv/starforge/received/merchant-cost-backup/EXPORT_UUID.tar \
  --state /srv/starforge/state/received-merchant-pricing
~~~

Use the inspection’s actual `sourceArchiveSha256` in the restored start:

~~~sh
starforge revenue-workspace \
  --config /srv/starforge/config/merchant-seller.json \
  --snapshot /srv/starforge/observations/merchant-traffic.json \
  --restore-cost-workspace /srv/starforge/received/merchant-cost-backup/EXPORT_UUID.tar \
  --expected-cost-backup-sha256 REVIEWED_FULL_BACKUP_SHA256 \
  --state /srv/starforge/state/received-merchant-pricing \
  --port 0
~~~

The launcher restores before opening the workspace. The same archive and destination continue an interrupted restore; an incomplete restore is not opened as a completed workspace. Reopen the received source, cost edition, linked pricing review and scenario, then make the next intended change there. An MCP operator can select that received directory through its own existing workspace alias.

Use the normal close action when handing ownership to a different process. Keep original request UUIDs, immutable source and edition IDs, saved revisions, archive hashes and completed receive directories with the operating state. These are the continuation points for source correction, pricing review, transfer recovery and the next product runtime.

### Receive tariff plans with their original pricing workspace

Capture the original full workspace backup and the complete tariff portfolio from the same finished merchant selection. Keep both originals together. The portfolio retains tariff definitions, source inputs and reviews plus both original selection request bodies/results. The original pricing, scenario and price-decision files travel in **WORKSPACE_BACKUP**.

Export the complete portfolio from the browser or use the same workspace directly:

~~~sh
starforge merchant-tariffs export \
  --config /srv/starforge/config/merchant-seller.json \
  --snapshot /srv/starforge/observations/merchant-traffic.json \
  --state /srv/starforge/state/merchant-pricing \
  --output /srv/starforge/received/merchant-tariff-portfolio.json
~~~

First inspect and restore the complete original backup using the receiving workflow above and its reviewed archive hash. Reopen that received pricing directory with its original seller and source selection. Then use **Tariff planning → Receive portfolio**, or pass the complete portfolio JSON to the CLI:

~~~sh
starforge merchant-tariffs receive \
  --config /srv/starforge/config/merchant-seller.json \
  --snapshot /srv/starforge/observations/merchant-traffic.json \
  --state /srv/starforge/state/received-merchant-pricing \
  --input /srv/starforge/received/merchant-tariff-portfolio.json \
  --output /srv/starforge/received/tariff-receive-result.json
~~~

The receiver matches each referenced original pricing version and the exact source, request and manifest identities before receiving the plans and selections. Reopen a saved tariff plan, download its original JSON/CSV, reopen the selected original scenario and pricing version, then inspect any saved price decision and its files. Continue ordinary editing and next pricing review in that received directory. An interrupted portfolio receive retains the same complete input and original identities for continuation.

## 8. Carry the selected tariff into a customer quotation

The installed Merchant economics and Merchant Support editions both include the original Pricing and Support applications. A customer can prepare a price, retain its exact tariff basis in the saved case, agree the work, deliver it and reopen the complete result through the same edition.

Open **Applications → Merchant support** using the customer's private case, source and complete-package directories. Keep its existing incident profile; an original profile with an empty `sources` array supports case work before a watcher is attached. The application provides **Commercial quotations** on its verified local listener. Open the saved case and choose **Tariff sources** in the quotation desk.

1. Select the original pricing directory, seller configuration and one saved snapshot or history file. Choose the completed original selection request. Its two saved outcomes identify the scenario plan and the resulting pricing version.
2. Capture that selection into a separate private receiving directory. Keep the original backup request UUID and capture input for recovery. The capture contains the selected portfolio and the complete original pricing backup, including the pricing version created by the selected request.
3. Inspect that retained source, confirm the merchant and route correspondence, and attach it to the current case. The original case engine retains separate request UUIDs for pricing receive, backup attachment and tariff attachment. Reuse those exact inputs when continuing an interrupted response.
4. Choose the attached tariff source in the quotation editor. The editor selects its matching pricing source and original quantity. Add the implementation work, service terms and customer delivery terms, then review and save the complete quotation edition.
5. Record the customer's response against that exact edition. Use **Implementation** to review accepted task and plan changes, preserve current delivery progress, and apply the reviewed scope or change order.
6. Continue the original work, technical and customer receiving. Export the complete case through its existing package controls. In the receiving case, reopen the saved quotation and restore the retained pricing backup before the original tariff portfolio is received.

The selected portfolio retains the original plan and comparison, exact quantity and tier schedule, derived uniform rate, rounding, both request UUIDs and both completed outcomes. The original pricing backup retains their underlying saved files. Together with the case history, quote editions, responses and materials, these form the editable customer handover.

### Keep the saved rate and the later quantity explicit

A positive selected quantity derives a uniform per-request quote from the exact tariff total. The customer quotation displays that saved rate, the original tier total and its rounding difference. A later explicit monthly quantity displays the charge at the saved uniform rate alongside the original tier schedule at that new quantity.

To adopt a different rate, save a new comparison selection in **Merchant pricing → Tariff planning**, then capture that completed source for a new quote edition. Zero monthly requests give a zero route charge. The source retains the earlier positive selection that established the saved rate.

### Use the original commands and clients

Export only the selected native source with the completed pricing selection request UUID:

~~~sh
starforge merchant-tariffs export \
  --config /srv/starforge/config/merchant-seller.json \
  --state /srv/starforge/state/merchant-pricing \
  --snapshot /srv/starforge/observations/merchant-traffic.json \
  --selection-request-id ORIGINAL_COMPLETED_SELECTION_UUID \
  --output /srv/starforge/receiving/selected-tariff-portfolio.json

starforge merchant-tariffs inspect \
  --config /srv/starforge/config/merchant-seller.json \
  --state /srv/starforge/state/merchant-pricing \
  --snapshot /srv/starforge/observations/merchant-traffic.json \
  --input /srv/starforge/receiving/selected-tariff-portfolio.json
~~~

The source and output paths must be the actual private selections. Omit `--selection-request-id` to export the original full portfolio. Read-only inspection uses the same native preflight as receiving. Original saved pricing and scenario sources must be present in the inspected workspace.

The customer case uses the maintained `starforge merchant-commercial tariffs` actions: `catalog`, `selection`, `capture`, `inspect`, `attach`, `case`, `restore` and `download`. Each uses `--cases-dir` and one private `--input` JSON file; `status` returns the current case and active source operations. The complete [Tariff quotation and customer receiving guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/TARIFFS.md) supplies the exact inputs, complete-package commands and recovery steps.

The installed typed Commercial client is:

~~~js
import { createCommercialTariffClient } from '@tokenjunkielabs/starforge-merchant/merchant/commercial-tariff-client';

const client = createCommercialTariffClient({
  url: originalMerchantUrl,
  caseId: originalCaseId,
  workspaceId: originalWorkspaceSha256
});
const current = await client.status();
const inspected = await client.inspect({
  directory: retainedReceivingDirectory,
  expectedSourceSha256: retainedReceivingSha256
});
~~~

The Pricing HTTP and MCP clients retain the original `bundle`/download methods with optional `selectionRequestId`, plus `inspectPortfolio`. The existing Pricing MCP CLI exposes `tariff-bundle`, `tariff-portfolio-download` and `tariff-inspect`. The existing Support provider exposes the nine `merchant_case_commercial_tariff_*` operations through the same case writer and retained file reader. Native Pricing inspection returns the complete original review; the MCP response presents its typed source and request summary after that same full preflight.

The [Merchant Support product guide](../merchant-support/README.md) connects this quotation to accepted implementation, Service work, buyer/accountant continuation and complete customer receiving. The original [Tariff MCP guide](../../stellar-forge/mcp-merchant-operator/TARIFFS.md) defines selected export, full inspection, manifest and resume behavior.

## 9. Use recorded activity to revise the customer price

Open **Performance** from the original Pricing console. Use the same private Pricing directory and completed tariff selection. Choose the saved original usage version, exact count basis and, when applicable, the original payment-option or supplier-cost edition.

The selected tariff request and observed usage version remain separate. Performance evaluates the original saved uniform price and its graduated or volume curve at that explicitly observed quantity. It retains the original period, counts, native payment source, selected cost basis and full source identities. Service allowance units remain distinct from consumed or successful inner-route requests.

The installed native command opens that same workspace:

~~~sh
starforge merchant-performance \
  --config /absolute/seller.json \
  --state /absolute/pricing \
  --history /absolute/observation-history.json
~~~

Use **Preview** to review the recorded comparison, then save it under one original request UUID and a nonempty label. The complete preview wrapper is `{ inputs, review }`; a native save supplies those normalized `inputs` and `review.performanceSha256`. Its saved `performanceId` is the original save request UUID.

A service basis first captures the complete opening and closing original service snapshots. The native customer-statement compiler supplies the period and its route counts. Choose the retained service source ID when preparing the review.

Use the retained review through the CLI as well:

~~~sh
starforge merchant-performance capture \
  --config /absolute/seller.json --state /absolute/pricing \
  --history /absolute/observation-history.json \
  --performance EXACT_PERFORMANCE_UUID --output /absolute/performance-source.json

starforge merchant-performance inspect \
  --config /absolute/seller.json --state /absolute/pricing \
  --history /absolute/observation-history.json \
  --input /absolute/performance-source.json --output /absolute/performance-inspection.json
~~~

The complete performance envelope carries its original Pricing version files, selected tariff portfolio, scenario plans, selected cost-edition sources and any full paired service source. Its maximum is 48 MiB. Inspection returns the recomputed review and complete file descriptors; capture and `source.json` retain the original bodies. The other native downloads are `review.json`, `review.html` and `usage.csv`.

### Prepare the explicit native monthly proposal

Enter the proposed monthly request count as a positive canonical integer string. The proposal retains that horizon separately from the observed period. Its original source version is the saved tariff source used by the selection.

Preview the proposal, save its exact `proposalSha256` and complete request under one UUID, then inspect the returned original Tariff plan and selection. A saved plan remains available when current Pricing state requires refreshing its selection. Replay the same proposal-save request to continue that retained plan.

Commit the returned complete selection with its original `proposalRequestId` and distinct native scenario and Pricing request UUIDs. The existing owners retain the expected Pricing revision, original snapshot and both request bodies. Reopen the saved performance record's proposal and selection operations when resuming.

For complete native receiving, capture a new original Pricing `WORKSPACE_BACKUP` after the performance review and its proposal requests have been saved, and retain the complete companion tariff portfolio. Restore the backup through the existing receiver, receive that portfolio through the original Tariff owner, then reopen Performance over the same restored Pricing directory. The backup retains the saved performance reviews, service sources and proposal/selection history; repeat an existing operation with its exact saved request and UUID. The immutable performance envelope also supports inspection, export and Commercial material on its own.

### Carry the review into the saved customer case

In **Merchant support → Commercial quotations → Usage and revisions**, select the original measured quote and full performance source. Preview the exact native source against the quote's selected tariff and saved uniform price, then save it as an original case material. Retain the original case revision, request UUID, source hash and reviewed binding after an interrupted response.

Choose the saved usage review, the measured quote or a later edition in its history, and an explicit whole number of requests per month. Use the existing tariff, or choose a newer native pricing selection already received through **Tariff sources** for the same original route, method and path.

**Prepare revision in quote editor** returns the ordinary quote draft with its original parent and saved performance binding. Review the customer's work, service, scope and payment terms in that editor, then use the original quote review/publish, customer-response and accepted-implementation workflow. The complete case package carries the retained performance material with its original quote history.

The original commands are:

~~~sh
starforge merchant-commercial performance list --help
starforge merchant-commercial performance preview --help
starforge merchant-commercial performance receive --help
starforge merchant-commercial performance revision --help
starforge merchant-commercial performance file --help
~~~

Use the [complete Performance operator guide](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/performance/README.md) for all sixteen native methods, typed HTTP calls, exact request files, service sources and proposal continuation. The [Commercial performance guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/PERFORMANCE.md) covers the original case commands, quote revision, full source downloads and customer receiving.

The installed typed exports are `./merchant/performance-client` and `./merchant/commercial-performance-client`. The original Pricing and Support MCP providers expose the corresponding native operations through their existing registrations.

## Continue the original complete receiving operation

The [merchant economics receiving operation](../../operations/merchant-economics-receiving-20261012/README.md) retains the portable driver, exact published source-file manifest, original request identities, input hashes and continuation procedure for the completed Linkup quotation workspace. It restores the original full backup, exercises the native MCP and CLI cost/pricing/file workflows, and reopens the received state. The operation uses the retained observations and original cost allocation; its own saved report records each receiving stage and the actual outcome.

## Original implementation and detailed contracts

- [Pricing workspace and source selection](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/WORKSPACE.md)
- [Supplier-source, cost-book and archive contracts](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/economics/README.md)
- [MCP and CLI costs, files and recovery](../../stellar-forge/mcp-merchant-operator/COSTS.md)
- [Original pricing, scenario and repricing operations](../../stellar-forge/mcp-merchant-operator/PRICING.md)
- [Tariff planning, typed client and original pricing continuation](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/README.md)
- [Applications inspection, receiving and normal reopen](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/PRICING_APPLICATIONS.md)
- [Whole merchant product](../merchant-workspace/OPERATING.md)
