# Included original publisher sources

## Publisher and source edition

The supplied files come from Elite Digital AI Solutions Ltd, trading as Elite Digital Agency. The original data package identifies version 1.0.0, created 12 August 2026, and the Creative Commons Attribution 4.0 International license.

- Dataset landing page: https://elitedigitalagency.io/open-data/
- Publisher: https://elitedigitalagency.io/
- License: https://creativecommons.org/licenses/by/4.0/
- Published pricing: https://elitedigitalagency.io/data/published-pricing.csv
- Service catalogue: https://elitedigitalagency.io/data/services-catalogue.csv
- Original metadata: https://elitedigitalagency.io/data/datapackage.json

The supplied edition was retained on 12 October 2026. The publisher's capture_date column remains 2026-08-12. The files retain their original UTF-8 text, row order, columns, wording and line endings.

| Installed file | Original bytes | SHA-256 |
| --- | ---: | --- |
| sources/published-pricing.csv | 3558 | 6891cc62b1341ee0cdf601a78e9e04b6232f1c26cc1cdeb8f021a5edc1fa5dcb |
| sources/services-catalogue.csv | 4964 | c225a1e081f783ce20eaf5de222449c03a3d01130ebb9d123b29fcb3673034c9 |
| sources/datapackage.json | 3780 | 6c758cf191a670985e7195752565c8d16169d6be8941f707a50ebd6638adefe2 |

The data package also describes an AI-crawler-policy resource. This supplier source family uses the complete original pricing and service catalogue tables.

## Pricing table

The original pricing file has 23 rows and nine columns: name, path, title, amount_gbp, charity_amount_gbp, period, display, source_url and capture_date. Its business key is name. Several price tiers share a service path, so path is used for catalogue coverage and is not the unique price key.

All amounts are GBP. There are 13 one-off records, five monthly records and five free records. The exact period strings are one-off, month and free. Keep the original display wording alongside the numeric amount: several prices are introduced as a starting price.

Seventeen rows have a blank charity_amount_gbp because the publisher supplies no separate charity rate. The starter website has a published charity amount of 1000. The five free tools have explicit charity and standard amounts of 0. The mapping stores an unpublished charity rate as null and retains each explicit zero as the decimal string "0". The original CSV still preserves the distinction between the blank source cell and every original zero.

## Service catalogue and coverage

The original catalogue has 29 rows and five columns: slug, title, short, section and url. The coverage join uses the full canonical url, compared to https://elitedigitalagency.io plus the original pricing path. It preserves the exact path under the strict-http-path-v1 policy in CATALOGUE_COVERAGE.md.

The complete original edition produces the following coverage:

| Result | Count |
| --- | ---: |
| Original price rows | 23 |
| Original service rows | 29 |
| Price rows matched to catalogue services | 12 |
| Services with at least one matched price row | 7 |
| Services with multiple matched price tiers | 4 |
| Price rows outside this catalogue | 11 |
| Catalogue services without a published price row | 22 |

The price table includes industry packages, subscriptions, charity registration and free tools whose paths are outside this service catalogue. A service without a price row remains an unpriced catalogue service. Keep both complete tables in the report so that recipients can inspect the original scope.

The two files describe complementary current tables. Use the coverage operation for this relationship. A later supplier price comparison uses the prior price source and its actual incoming successor.

## Included canonical mapping

examples/published-pricing.rules.json maps all nine original pricing columns and adds two explicit comparison fields, currency and price_basis.

| Canonical field | Mapping and behavior |
| --- | --- |
| name | Exact original price key; required text |
| path | Exact original service path |
| title | Exact original label |
| amount_gbp | Required nonnegative decimal string |
| charity_amount_gbp | Nonnegative decimal string; original blank maps to null |
| period | Exact one-off, month or free string |
| display | Complete original displayed price wording |
| source_url | Original page URL |
| capture_date | Original valid YYYY-MM-DD capture date |
| currency | Explicit GBP constant on each side |
| price_basis | Explicit dictionary from the current original display strings to from or published |

Numeric differences require currency, period and price_basis to agree. The mapping's published label means the publisher's displayed price without a starting-price prefix; it leaves the original display text available for the recipient's interpretation. The field does not add a commercial guarantee.

The price_basis dictionary contains the complete display strings from this retained edition. When a successor introduces a new display string, select its intended basis in the rules and recompare the retained sources. That change records a predecessor comparison and revision. It preserves the prior saved review and prevents a new pricing basis from being silently inferred.

Canonical decimal values use exact decimal arithmetic. Leading-zero identifiers and original display strings remain text. Null remains distinct from an empty string in the workspace and SQLite snapshot; CSV represents null as an empty cell.

## Complete initial-intake example

examples/published-pricing-intake.workspace.json contains an empty supplier target and the complete original price edition as its incoming source. D156 source intake recorded one use_candidate decision for each of the 23 additions. Each decision retains its item ID, reason, reviewer, time and revision.

This saved example is an initial population of an empty target. Open it to inspect the original incoming rows, explicit canonical mapping, complete decision history and all 23 accepted records. The browser and CLI can export the complete reviewed workspace, changes, accepted CSV, readable HTML and SQLite TEXT snapshot from this same saved case.

The source metadata carries the original publisher, URL, declared capture date, license and source digests. The saved raw CSV is the complete original file listed above. The empty baseline is explicitly identified as an initial target.

## Continue a received project

Run the supplied supplier-report-cli.mjs with serve from the received supplier directory, open its localhost address, and load the adjacent workspace.json. Save a new complete workspace after an explicit review change.

The supplied CLI includes the domain engine, review page, review interface, styles and operating guides in each delivery manifest. The outer complete workflow project also carries the installed source package and the native Analysis workspace. Keep that complete project for rebuilding or installing the workflow. The received supplier directory can continue its own saved review and create the next full supplier delivery.
