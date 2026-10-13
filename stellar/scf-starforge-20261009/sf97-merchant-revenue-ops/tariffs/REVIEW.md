# Saved tariff review and portable report

Open **Tariffs**, select the original saved pricing review, and calculate a comparison or open a saved tariff plan. The complete reader shows the chosen monthly quantities, the saved commercial baseline, each proposed tariff, and the separately rounded uniform quote.

## Review a comparison

1. Use **Route**, **Tariff**, and **Monthly quantity** to find an outcome. **Show all comparisons** resets the filters. The counter states how many of the original outcomes are visible.
2. Select **Details** on a row. Read its saved baseline and proposed totals, exact charged bands, contribution before fixed costs, rational average, decimal bounds, uniform quote, and next-request behavior.
3. Expand **All saved tariff bands and boundaries** for every original schedule and every finite, representable threshold. Thresholds include quantities beyond the explicit comparison list. Volume pricing applies its selected band's rate to all requests and can reduce total gross across a threshold.
4. Expand **Original saved source** for the plan, source review, request and canonical source identities. An unsaved preview identifies itself as a preview.
5. After saving the plan, **Review this uniform quote** continues the existing selection flow. It presents the complete merchant terms and current capture before the original scenario and pricing writers save anything.

The reader's filters affect this screen only. The saved-plan report and every export include the complete original result. Named studies retain unfinished editor inputs separately; a study may reopen a completed plan while its raw editor contains newer work. Editing an input clears the current calculated reader. Recalculate to review those new inputs.

Opening another saved plan resolves that plan and its pricing source before replacing the current view. A failed source read leaves the previous plan selected. Report actions also match the displayed review hash to the selected saved plan.

## Read the money correctly

All values are taken from the original exact native result. The report does no pricing arithmetic and does not convert monetary strings through floating-point numbers.

- **Saved baseline** means the saved commercial per-request quote, evaluated at the same proposed monthly quantity as the tariff. Original collected payments and observed request counts remain in the source operations review.
- **Proposed tariff** is the exact graduated or volume schedule at that quantity.
- **Proposed uniform quote** is a separate fixed per-request proposal rounded upward to a micro-USD. Its gross, contribution and rounding difference remain separate.
- **Rational average** is authoritative. Its numerator/denominator and the native twelve-place lower and upper display bounds all remain visible.
- **Contribution** deducts fulfilled-request variable costs before shared fixed costs. Per-challenge cost is displayed for context. The original whole-merchant scenario flow evaluates challenge volume and shared monthly fixed costs.
- An unresolved cost remains **Unknown**. A margin can be undefined for zero gross. At zero requests there are no charged bands, no per-request average and no adoptable uniform quote.

The report labels the saved source monthly target separately from the proposed quantity. It retains the source's whole-seller versus selected-route scope, original fixed-cost metadata, baseline price basis, all tariff hashes and the complete comparison IDs.

## Full files

| File | Contents |
| --- | --- |
| report.html | Complete offline review: every outcome, all schedules/boundaries, exact cost and quote meanings, and original source identities. |
| band-charges.csv | Every charged band of every comparison, plus an explicit NO_CHARGED_BANDS row for zero quantity; exact fraction, bounds and uniform quote fields. |
| thresholds.csv | Every finite, representable band boundary, with before/after quantities, totals, signed change and decreases-gross flag. |
| plan.json | Original complete saved plan, unchanged. |
| tariffs.json | Original source version and tariff inputs, unchanged. |
| comparison.csv | Original compact comparison export, unchanged. |

In the detailed CSVs, blank numeric values retain missing or inapplicable native fields. A blank upper bound on a charged band means unlimited. Band numbers are displayed one-based. Canonical negative decimals retain their minus sign; formula-like free text is escaped for spreadsheet import. Import identifiers, quantities and monetary columns as text to preserve every digit. The complete original JSON retains authoritative types and null values.

**Download full HTML report** saves one self-contained file. Open the downloaded file offline; its links move between outcomes and the browser's Print command prints the full report. The report uses an explicit light surface and dark text, including cards, tables and source blocks. It contains no remote assets or scripts.

**Print displayed review** prints the current workspace view. Use the downloaded HTML for a complete saved-plan printout. The original JSON and CSV files remain available alongside it.

## Local HTTP and CLI

The original authenticated download route accepts all six filenames:

    GET /api/plans/PLAN_ID/files/report.html
    GET /api/plans/PLAN_ID/files/band-charges.csv
    GET /api/plans/PLAN_ID/files/thresholds.csv

The integrated Pricing workspace uses the existing /api/tariffs prefix and workspace header. The standalone console uses its original Bearer token. Downloads remain attachments with the proper HTML, CSV or JSON content type.

With the same seller, source and private state used to open the native workspace:

    node tariffs/cli.mjs download \
      --config SELLER_JSON --state PRICING_DIRECTORY \
      --snapshot ORIGINAL_SNAPSHOT \
      --plan PLAN_ID --name report.html --output NEW_REPORT.html

Select --history and/or --snapshot, or the original --ops-url, as documented in README.md. Output remains create-only with the original private durable writer. Repeat the command with band-charges.csv or thresholds.csv for detailed tables.

The typed HTTP client supports:

    const html = await tariffClient.report(planId);
    const bands = await tariffClient.report(planId, 'band-charges.csv');
    const thresholds = await tariffClient.report(planId, 'thresholds.csv');

The original download(planId, name) also accepts each file.

## Native Merchant MCP

The existing merchant_pricing_tariff_download and downloadMerchantTariffPlan continue to expose exactly the original three-file plan manifest. Existing downloaded plan directories and checkpoints remain valid.

Use the additive merchant_pricing_tariff_report operation to inspect a complete six-file report manifest, then read its exact files through the original SHA-pinned file owner. Its schema is stellar-forge.merchant-tariff-report-files.v1; planId, version and tariffReviewSha256 identify the original saved result.

The complete original MCP command is:

    merchant-mcp pricing tariff-report-manifest \
      --url MCP_ENDPOINT --workspace ALIAS --plan-id PLAN_ID

    merchant-mcp pricing tariff-report-download \
      --url MCP_ENDPOINT --workspace ALIAS --plan-id PLAN_ID \
      --manifest-sha256 REVIEWED_MANIFEST_SHA --out PRIVATE_REPORT_DIRECTORY

The native downloader writes all six files plus its original manifest/checkpoint. An interrupted transfer resumes the same private directory with the same reviewed manifest. Use a distinct directory from an earlier three-file plan download. A changed source renderer that changes report bytes produces a different report manifest; an older pinned transfer rejects that mismatch instead of mixing editions. Retain the original installed source edition to resume its exact report.

The typed MCP client provides report(planId, name), downloadMerchantTariffReport and inspectMerchantTariffReport. Every chunk keeps the original workspace, report kind, plan ID, manifest SHA, file SHA and byte position. The existing reader owns read leases and release.

## Same original customer receiving course

Continue the SF97 saved merchant case and source-owned receiving operation already used for named studies, original pricing backup, quote recovery and tariff portfolio. The complete plan/report reader is part of that same operation.

Open a saved graduated plan and a volume plan, inspect a nonzero outcome and a zero quantity, filter to one route, inspect a downward threshold and exact fractional average, and open its uniform-quote review. Keep the actual original request identities when continuing a saved quote. Export the complete HTML/CSVs, open the HTML offline, and compare its plan/review IDs and a displayed exact outcome with the source result. Receive the full report through MCP and reopen the same completed directory.

Return actual desktop and narrow screenshots of the complete reader and opened HTML, plus the original outputs, to the existing course thread so the producer can inspect the rendered interface and attachments. Existing private source backup and original native operation stay attached to the customer case.
