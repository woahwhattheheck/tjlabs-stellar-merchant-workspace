# Merchant tariffs through Pricing MCP

The Merchant Pricing provider exposes the complete tariff workspace through the existing authenticated MCP endpoint, JavaScript client and pricing CLI. A merchant can author graduated or volume schedules, compare their monthly effect, save a tariff plan, select an explicit fixed quote, commit the original scenario and Pricing review, reprice the original payment options, retain a release, and deliver the complete files to another private workspace.

The provider uses the same configured Pricing alias and model as the existing pricing and cost tools. Its original seller, observations, compare-and-swap revisions, saved request identities, release store and file-read lifecycle continue to own those operations.

Read the [native tariff guide](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/README.md) for the browser, HTTP client and installed merchant-tariffs command. [PRICING.md](PRICING.md) covers the original Pricing connection, initial saved review and native price decisions. The complete installed economics product is described in [OPERATING.md](../../products/merchant-economics/OPERATING.md).

## Configure and open the original workspace

Use the endpoint returned by the maintained Merchant MCP launcher and its existing bearer-token environment variable. The examples use MCP_URL for that endpoint and WORKSPACE for a host-declared Pricing alias. The default token variable is MCP_ACCESS_TOKEN.

~~~sh
merchant-mcp pricing status --url "$MCP_URL" --workspace "$WORKSPACE"
merchant-mcp pricing open --url "$MCP_URL" --workspace "$WORKSPACE"
merchant-mcp pricing tariff-state --url "$MCP_URL" --workspace "$WORKSPACE"
~~~

The host's existing pricingConnection selects the seller configuration, private Pricing directory, original observation source and optional retained seller source/release store. This family uses that connection directly. The source-owned registry obtains the new metadata from the existing Pricing declaration.

Tariff authoring starts from a saved original Pricing version. Save the initial commercial review through the normal review-preview and review-save operations in PRICING.md, then choose its version from tariff-state. A saved tariff source includes its original seller, selected route scope, commercial costs and observations.

The SDK opens the selected original alias when it first connects:

~~~js
import { createMerchantTariffClient } from
  '@tokenjunkielabs/starforge-merchant/merchant/tariff-mcp-client';

const client = createMerchantTariffClient({
  url: process.env.MCP_URL,
  workspace: process.env.WORKSPACE,
  tokenEnv: 'MCP_ACCESS_TOKEN'
});
const state = await client.state();
const version = state.pricing.history[0].version;
const source = await client.source(version);
~~~

The maintained package is @tokenjunkielabs/starforge-merchant. The source module is stellar-forge/mcp-merchant-operator/pricing-tariffs-client.mjs; its adjacent declarations import the original tariff domain types.

## Author, compare and save

Every price is a decimal USD string with at most six fractional digits. Quantities are whole numbers from zero through Number.MAX_SAFE_INTEGER, supplied as safe JavaScript integers or canonical integer strings. A schedule has one through 64 tiers; every finite upper boundary is positive and strictly increasing, and the final boundary is null.

Graduated schedules charge each band for the units in that band. Volume schedules apply the selected band's unit price to the whole selected quantity. A complete comparison supports up to 12 tariffs and 24 explicitly selected quantities. The exact native core retains the resulting rational average, an explicit ceiling to a six-decimal fixed quote, its rounding excess, known variable costs and named unknown inputs.

These arithmetic examples show the distinction:

| Schedule and quantity | Monthly tariff total | Chosen uniform request quote | Uniform projected total |
| --- | ---: | ---: | ---: |
| Graduated: first 1,000 at $0.012, remaining 250 at $0.009 | $14.25 | $0.0114 | $14.25 |
| Volume: 1,250 at the second band's $0.009 rate | $11.25 | $0.009 | $11.25 |
| Graduated: first two at $0.010, third at $0.005 | $0.025 | $0.008334 | $0.025002 |
| Volume threshold: 1,000 at $0.012, then 1,001 at $0.009 | $12, then $9.009 | $0.012, then $0.009 | $12, then $9.009 |

The last row is the actual volume contract's price drop. The comparison retains that boundary behavior. Zero-volume rows remain available for analysis and have no selectable uniform quote.

The following example uses a route from the saved original source. Save the exact mutation body before sending it:

~~~js
import { randomUUID } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';

const routeId = source.routes[0].routeId;
const input = {
  version,
  tariffs: [{
    id: 'graduated-read',
    label: 'Graduated request schedule',
    routeId,
    mode: 'graduated',
    tiers: [
      { upTo: '1000', unitPriceUsd: '0.012' },
      { upTo: null, unitPriceUsd: '0.009' }
    ]
  }],
  volumes: ['0', '1000', '1001', '1250']
};
const preview = await client.preview(input);
const saveRequest = {
  ...input,
  requestId: randomUUID(),
  label: 'Monthly request pricing',
  tariffReviewSha256: preview.review.tariffReviewSha256
};
await writeFile('tariff-save-request.json',
  JSON.stringify(saveRequest, null, 2) + '\n',
  { flag: 'wx', mode: 0o600 });
const saved = await client.save(saveRequest);
~~~

An interrupted save continues from the same file:

~~~js
const retainedSave = JSON.parse(await readFile('tariff-save-request.json', 'utf8'));
const recoveredPlan = await client.save(retainedSave);
~~~

The client captures nested input synchronously before its first await. Caller edits to an input object after invoking save, preview or commitSelection cannot change the in-flight operation.

The corresponding commands use private JSON argument files containing the workspace alias:

~~~sh
merchant-mcp pricing tariff-source --url "$MCP_URL" --workspace "$WORKSPACE" --version "$VERSION"
merchant-mcp pricing tariff-preview --url "$MCP_URL" --input tariff-preview-arguments.json
merchant-mcp pricing tariff-save --url "$MCP_URL" --input tariff-save-arguments.json
merchant-mcp pricing tariff-list --url "$MCP_URL" --workspace "$WORKSPACE"
merchant-mcp pricing tariff-load --url "$MCP_URL" --workspace "$WORKSPACE" --plan-id "$PLAN_ID"
~~~

## Select an explicit fixed quote

Select one saved positive-volume comparison. The original scenario engine computes the complete resulting commercial terms, including every route and the shared monthly fixed cost. The selection also includes the current Pricing revision and current commercial terms so an operator can see the full effect of applying a historical source.

~~~js
const chosen = saved.record.review.comparisons.find(
  row => row.tariffId === 'graduated-read' && row.quantity === '1250'
);
const selection = await client.selection({
  planId: saved.planId,
  comparisonId: chosen.id
});

const commitRequest = {
  selection,
  planRequestId: randomUUID(),
  pricingRequestId: randomUUID()
};
await writeFile('tariff-selection-request.json',
  JSON.stringify(commitRequest, null, 2) + '\n',
  { flag: 'wx', mode: 0o600 });
const committed = await client.commitSelection(commitRequest);
const pricingVersion = committed.pricing.version;
~~~

The selection applies the derived six-decimal uniform price and the selected integer monthly target through the original scenario patch. Actual paid calls continue using the original fixed payment amount. The planned tier total, derived uniform total and rounding excess remain separate fields in the review.

The native workspace retains both complete request bodies before either original writer runs. A resumed commit reuses the scenario planRequestId and the Pricing pricingRequestId. The original Pricing writer resolves a completed request before attempting to reacquire an expired in-memory observation capture. A new save still follows its original seller, capture and current-revision checks.

~~~sh
merchant-mcp pricing tariff-selection --url "$MCP_URL" --workspace "$WORKSPACE" \
  --plan-id "$PLAN_ID" --comparison-id "$COMPARISON_SHA256"
merchant-mcp pricing tariff-commit --url "$MCP_URL" --input tariff-commit-arguments.json
~~~

## Reprice native payment options and retain the release

Use the saved pricingVersion to obtain the original ordered payment options. Each option identifies its existing atomicAmount. Supply the chosen quoteValuations or explicit atomic edits to the original repricing preview, then retain the unchanged preview input, reviewSha256, expectedRevision and requestId for save.

~~~js
const nativeSource = await client.repricingSource(pricingVersion);
const quoteValuations = JSON.parse(await readFile('quote-valuations.json', 'utf8'));
const priceInput = {
  version: pricingVersion,
  sellerSha256: nativeSource.sellerSha256,
  quoteValuations
};
const priceReview = await client.previewRepricing(priceInput);
const priceRequest = {
  ...priceInput,
  requestId: randomUUID(),
  expectedRevision: nativeSource.repricingRevision,
  label: 'Selected merchant request price',
  reviewSha256: priceReview.reviewSha256
};
await writeFile('native-price-request.json',
  JSON.stringify(priceRequest, null, 2) + '\n',
  { flag: 'wx', mode: 0o600 });
const decision = await client.saveRepricing(priceRequest);
~~~

Each valuation contains routeId, paymentIndex, expectedAmount matching the source option's atomicAmount, atomicUnits, usd and an explicit basis. The original quote converter rounds upward to native atomic units and retains the resulting rational USD valuation and excess. For a merchant-supplied valuation of 10,000,000 units per USD, a $0.0114 fixed quote produces 114,000 atomic units.

Positive-volume zero-price planning remains valid; the original paid-amount conversion requires a positive quote and returns its existing QUOTE_PAID_PRICE_REQUIRED error when that condition is absent.

When the original source reports releaseAvailable, the saved original decision can be staged with its exact review hash:

~~~js
const release = await client.stageRepricing({
  decision: decision.decision,
  reviewSha256: decision.reviewSha256
});
~~~

The response preserves the original release view and reports whether that source's release store is the current Merchant operator's release store. The existing merchant_inspect, merchant_compare and original activation controls consume the retained release identity and generation.

The pricing CLI keeps the complete native path:

~~~sh
merchant-mcp pricing tariff-price-source --url "$MCP_URL" --workspace "$WORKSPACE" --version "$PRICING_VERSION"
merchant-mcp pricing tariff-price-preview --url "$MCP_URL" --input native-price-preview-arguments.json
merchant-mcp pricing tariff-price-save --url "$MCP_URL" --input native-price-save-arguments.json
merchant-mcp pricing tariff-price-manifest --url "$MCP_URL" --workspace "$WORKSPACE" --decision "$DECISION"
merchant-mcp pricing tariff-price-stage --url "$MCP_URL" --input native-price-stage-arguments.json
~~~

## Deliver complete files and resume downloads

The three tariff plan files are plan.json, tariffs.json and comparison.csv. Their manifest binds the original plan ID, source Pricing version, tariff review hash and every file's byte count/SHA-256.

The SDK's download, downloadPricing and downloadRepricing methods return complete bytes after reading the original SHA-pinned chunks and verifying the final digest. They share the 18-operation surface with the native HTTP client.

For durable receiving directories, use the original resumable downloader:

~~~js
import {
  downloadMerchantTariffPlan,
  downloadMerchantTariffPricingReview,
  downloadMerchantTariffPortfolio
} from './pricing-tariffs-client.mjs';

const connection = {
  url: process.env.MCP_URL,
  workspace: process.env.WORKSPACE
};
await downloadMerchantTariffPlan({
  ...connection,
  planId: saved.planId,
  directory: '/absolute/private-delivery/tariff-plan'
});
await downloadMerchantTariffPricingReview({
  ...connection,
  version: pricingVersion,
  directory: '/absolute/private-delivery/pricing-review'
});
const portfolioDelivery = await downloadMerchantTariffPortfolio({
  ...connection,
  directory: '/absolute/private-delivery/tariff-portfolio'
});
~~~

The original downloader owns private directories, file publication, the manifest, chunk checkpoints and interrupted-transfer recovery. Invoke it again with the same selected artifact and directory to continue its saved prefix. The final manifest and every complete payload reopen with their original digests.

~~~sh
merchant-mcp pricing tariff-download --url "$MCP_URL" --workspace "$WORKSPACE" \
  --plan-id "$PLAN_ID" --out /absolute/private-delivery/tariff-plan
merchant-mcp pricing tariff-review-download --url "$MCP_URL" --workspace "$WORKSPACE" \
  --version "$PRICING_VERSION" --out /absolute/private-delivery/pricing-review
merchant-mcp pricing tariff-price-download --url "$MCP_URL" --workspace "$WORKSPACE" \
  --decision "$DECISION" --out /absolute/private-delivery/price-decision
merchant-mcp pricing tariff-portfolio-download --url "$MCP_URL" --workspace "$WORKSPACE" \
  --out /absolute/private-delivery/tariff-portfolio
~~~

All these download commands accept --manifest-sha256 and --chunk-bytes. The native reader permits chunks from one through 196,608 bytes. The existing price-decision downloader includes every original retained source-package file.

## Keep a stable complete portfolio

The bundle tool retains the exact original workspace bundle as a content-addressed private export under the existing Pricing directory. Its portfolioSha256 is the original logical bundle hash. That retained export remains available after later plans are saved and after the MCP owner is reopened.

~~~sh
merchant-mcp pricing tariff-bundle --url "$MCP_URL" --workspace "$WORKSPACE"
merchant-mcp pricing tariff-portfolio-download --url "$MCP_URL" --workspace "$WORKSPACE" \
  --portfolio-sha256 "$PORTFOLIO_SHA256" \
  --out /absolute/private-delivery/tariff-portfolio
~~~

The SDK assembles complete original JSON through those same file reads:

~~~js
const bundle = await client.bundle();
const sameBundle = await client.bundle({ portfolioSha256: bundle.sha256 });
~~~

A portfolio contains complete tariff plans and their retained selection intents/results. Each intent carries both complete native request bodies. The bundle's saved source-version references continue to identify the original Pricing versions and scenario/price-save history.

The provider accepts the native portfolio's 64 MiB maximum plus one MiB for its JSON-RPC wrapper. Downloads keep their original chunk limit. The SDK receives a complete portfolio through verified chunks, so it can transfer the supported native artifact without putting all its contents into a tool-listing or manifest response.

## Export one customer selection

Use the original selection's `pricingRequestId` as `selectionRequestId`. The source-owned bundle operation returns that complete tariff plan and the exact retained selection journal, including both native request UUIDs and the saved result or pending result.

~~~js
const customerPortfolio = await client.bundle({ selectionRequestId: pricingRequestId });
const sameCustomerPortfolio = await client.bundle({
  selectionRequestId: pricingRequestId,
  portfolioSha256: customerPortfolio.sha256
});
~~~

For a complete private download:

~~~sh
merchant-mcp pricing tariff-portfolio-download --url "$MCP_URL" --workspace "$WORKSPACE" \
  --selection-request-id "$PRICING_REQUEST_ID" \
  --out /absolute/private-delivery/customer-tariff
~~~

Retain the returned `portfolioSha256` and original manifest digest when resuming. Supplying both the selection ID and a retained portfolio digest verifies that the saved export contains exactly that selection and its plan. File chunks continue to use only the retained portfolio digest. Existing full-portfolio exports and their original manifest bytes remain stable.

The selected portfolio accompanies the customer's original Pricing backup through the existing Commercial source and receiving workflow. Its plan retains the original quantity comparison, chosen uniform quote and tariff assumptions for later source review.

## Receive the complete merchant workspace

Preserve two artifacts together:

1. The original Pricing WORKSPACE_BACKUP archive, created and restored by the existing economics archive implementation.
2. The complete tariff-portfolio.json exported above, with its original sha256.

The original backup carries the saved Pricing sources, native scenarios and price decisions. The tariff portfolio carries the tariff plans and their exact selection journals. The receiving order joins both histories:

~~~js
import {
  inspectCostWorkspaceRestore, restoreCostWorkspace
} from '../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/economics/archive.mjs';

// From the original already-open Pricing model:
const backupRequest = { kind: 'WORKSPACE_BACKUP', requestId: randomUUID() };
const backup = await originalPricingModel.economics.bundle(backupRequest);
const archive = await originalPricingModel.economics.exportFile(backupRequest.requestId);

// Restore with the existing host-selected private destination:
const restoreReview = await inspectCostWorkspaceRestore({
  archive: archive.path,
  directory: receivingDirectory
});
await restoreCostWorkspace({
  archive: archive.path,
  directory: receivingDirectory,
  expectedArchiveSha256: restoreReview.sourceArchiveSha256
});
~~~

Declare the restored directory as an original Pricing alias through the maintained host configuration, retaining the matching seller and observation source. Then receive the complete portfolio through that alias:

~~~sh
merchant-mcp pricing tariff-inspect --url "$RECEIVING_MCP_URL" \
  --workspace "$RECEIVING_WORKSPACE" \
  --portfolio-file /absolute/private-delivery/tariff-portfolio/tariff-portfolio.json
merchant-mcp pricing tariff-receive --url "$RECEIVING_MCP_URL" \
  --workspace "$RECEIVING_WORKSPACE" \
  --portfolio-file /absolute/private-delivery/tariff-portfolio/tariff-portfolio.json
~~~

The read-only `inspectPortfolio(bundle)` SDK method and `tariff-inspect` command run the original native source preflight on the entire input. The MCP reply uses schema `stellar-forge.merchant-tariff-portfolio-inspection.v1`: `portfolioSha256`, the native `sourceReviewSchema`, plan/selection counts, each original plan and source-version identity, and each selection's original scenario/Pricing request and saved-result identities. This compact reply keeps large portfolios within the existing JSON-RPC reply ceiling. The native HTTP client returns its full `TariffPortfolioInspection`; the MCP SDK declares the distinct `MerchantTariffPortfolioInspection` result. Complete original portfolio bytes remain available through the retained download protocol.

The native receiver recomputes complete reviews against the restored saved sources, validates each original tariff save identity, binds the two native mutation bodies to the retained selection, and matches completed scenario/Pricing requests to their original records and manifests before registering the portfolio. Existing exact records are reused. The same original selection request then reopens its saved Pricing result.

The complete installed receiving and encrypted merchant recovery procedures remain in the economics and captured-API product guides. This source join uses those existing restorers and private aliases.

## Exact tool and SDK map

| Native client method | MCP tool | Result |
| --- | --- | --- |
| state | merchant_pricing_tariff_state | Original Pricing state and saved tariff operations |
| source | merchant_pricing_tariff_source | Saved source version and commercial inputs |
| preview | merchant_pricing_tariff_preview | Complete exact tariff review wrapper |
| save | merchant_pricing_tariff_save | Original saved tariff plan/result |
| list | merchant_pricing_tariff_list | Saved plans and selection recovery records |
| load | merchant_pricing_tariff_load | Complete original tariff plan |
| selection | merchant_pricing_tariff_selection | Full native selection and commercial preview |
| commitSelection | merchant_pricing_tariff_commit_selection | Original scenario and Pricing save results |
| download | merchant_pricing_tariff_download | Manifest or original plan file chunks |
| bundle | merchant_pricing_tariff_bundle | Retained full or selected original portfolio manifest/chunks; SDK returns complete JSON |
| inspectPortfolio | merchant_pricing_tariff_inspect_portfolio | Validated original portfolio digest and plan/source/request identities |
| receive | merchant_pricing_tariff_receive | Native complete-portfolio receiving result |
| repricingSource | merchant_pricing_tariff_repricing_source | Original ordered native payment options |
| downloadRepricing | merchant_pricing_tariff_download_repricing | Original decision/source manifest or file chunks |
| downloadPricing | merchant_pricing_tariff_download_pricing | Original Pricing manifest or file chunks |
| previewRepricing | merchant_pricing_tariff_repricing_preview | Native atomic review and quote conversion |
| saveRepricing | merchant_pricing_tariff_repricing_save | Original retained price decision |
| stageRepricing | merchant_pricing_tariff_repricing_stage | Original retained release result |

For the four manifest/file tools, view defaults to manifest. File reads use view:file, an exact file name and expectedManifestSha256. Continue with readId, expectedSha256 and nextOffset, or reopen the same digest and offset after expiry. The existing merchant_pricing_file_release releases a temporary read. The SDK and complete downloader perform this protocol directly.

## Retained identity reference

| Identity | Meaning |
| --- | --- |
| tariffReviewSha256 | Exact source-bound tariff inputs and comparisons, excluding generatedAt |
| planId / tariff save requestId | Original immutable tariff save |
| comparisonId | Exact tariff/route/quantity selection |
| selectionSha256 | Native scenario/Pricing input binding; live display fields remain outside it |
| planRequestId | Original scenario save request |
| pricingRequestId | Original Pricing save request |
| selectionRequestId | The same Pricing request UUID when exporting its selected tariff plan and journal |
| Pricing version / revision | Original saved review and compare-and-swap history |
| Price decision / reviewSha256 | Original saved native amount decision and exact reviewed conversion |
| portfolioSha256 | Logical digest of the complete native plans and selection journals |
| manifestSha256 | SHA-256 of the exact UTF-8 manifest bytes |
| File sha256 | SHA-256 of the complete original file bytes |

## Source ownership

[pricing-tariffs.mjs](pricing-tariffs.mjs) borrows the existing MerchantPricing model, retained-file reader and release renderer. [catalog/pricing-tariffs.mjs](catalog/pricing-tariffs.mjs) contains the complete 18-tool metadata and command map. [pricing-tariffs-client.mjs](pricing-tariffs-client.mjs) uses the original authenticated transport and resumable downloader; its [declarations](pricing-tariffs-client.d.mts) reuse the original native tariff types.

The original Pricing runtime, catalogue, provider declaration, client and CLI each contain a narrow source join. They keep the original configuration key, source-owned registry, model ownership, request drainage and private file-read lifetime. The native [tariff workspace](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/workspace.mjs) remains the authority for saves, native selection recovery and portfolio receiving.


## Complete saved-plan report

The original tariff plan artifact remains exactly plan.json, tariffs.json and comparison.csv. A complete readable report is available as a separate artifact from the same plan and exact review.

Call merchant_pricing_tariff_report with the existing workspace alias and planId. Default view:manifest returns stellar-forge.merchant-tariff-report-files.v1, source version, tariffReviewSha256 and all six file identities. view:file uses the same file, expectedManifestSha256, expectedSha256, readId, offset and limit contract as the original file reader. The existing owner drains/releases those reads.

The report includes report.html, band-charges.csv, thresholds.csv and the original three plan files. Its HTML contains every proposed quantity, graduated charged band or selected volume band, exact rational average and decimal bounds, separate rounded uniform quote, source baseline/cost meanings and complete original identities. There is no new pricing calculator.

    merchant-mcp pricing tariff-report-manifest \
      --url MCP_ENDPOINT --workspace ALIAS --plan-id PLAN_ID

    merchant-mcp pricing tariff-report-download \
      --url MCP_ENDPOINT --workspace ALIAS --plan-id PLAN_ID \
      --manifest-sha256 REVIEWED_SHA256 --out PRIVATE_REPORT_DIRECTORY

Use a separate private directory from a three-file plan download. The original retained downloader resumes interrupted transfers with exact manifest/file hashes. It rejects changed report bytes after a source-renderer edition change; keep the original installed source to resume that edition. Completed received files stay complete in their own directory.

The module pricing-tariffs-client.mjs exports downloadMerchantTariffReport and inspectMerchantTariffReport; MerchantTariffClient.report(planId, name) reads any original report file. The original pricing-client.mjs re-exports these operations.

Open report.html offline to read or print all outcomes. The source browser filters affect only the screen. The detailed CSVs retain exact strings, explicit zero-quantity rows and canonical signed decimal changes; import these columns as text to preserve long quantities and decimal digits. The original JSON retains authoritative types and null values.

Continue the existing SF97 saved-case native course with actual desktop/narrow browser frames, full report export/reopen, same-directory interrupted MCP download recovery and source identity comparison. The original scenario, pricing and native quote writers remain the selection authorities. Full operator instructions are in ../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/tariffs/REVIEW.md.
