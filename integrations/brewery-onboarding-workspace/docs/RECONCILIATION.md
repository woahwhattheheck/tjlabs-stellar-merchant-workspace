# Brewery opening-inventory reconciliation

Use this desk to prepare and compare an inventory migration at a declared cutover. It retains the source item catalogue, exact alias map, opening inventory, signed movements, independent target counts, recipe versions, accounts and order lines. It calculates expected balances in each item's exact base unit and records reviews of the remaining discrepancies.

The independent target count must come from the actual destination or an independently observed source-owner count. Copying the expected calculation into the target would remove the independent comparison. Customer prospect research supplies commissioning questions, not stock quantities or operational source records.

## One complete receiving cycle

1. Agree the actual opening and cutover instants with their explicit UTC offsets. Choose one authoritative system for each movement source. Export the complete relevant opening balances and event IDs.
2. Save the original exports unchanged. If they require normalization into the CSV contracts below, keep the original application exports and the mapping/normalization method in the case's source archive.
3. Define stable item IDs, exact lot IDs and locations. A keg, can, case and bulk beer are separate items when they are separate stock-keeping units. Map each external movement SKU explicitly through its source system.
4. Receive all five required CSVs as one named edition; add the three optional migration families when applicable. The desk validates the whole candidate before adopting it. The browser retains pending source drafts if intake fails.
5. Inspect every bucket, the included/excluded movement ledger and the duplicate report. Review the exact source-linked exceptions with a named person and a concrete reason. Preserve original returned evidence.
6. When a source count, mapping or event changes, receive a new complete edition. The prior sources and review history remain retained. Export the whole workspace and the readable/CSV reconciliation for receiving.

## Source contracts

All sources are UTF-8 CSV, with exact header names and full original text retained. BOM and line endings remain in the saved original. The first five families are required even when an empty header-only source is appropriate.

| Family | Required columns |
|---|---|
| items | item_id,name,kind,base_unit |
| aliases | source_system,source_item_id,item_id |
| opening | row_id,item_id,lot_id,location,quantity,unit |
| movements | event_id,source_system,source_item_id,lot_id,location,occurred_at,quantity,unit |
| target | row_id,item_id,lot_id,location,quantity,unit |
| recipes (optional) | recipe_id,version,ingredient_item_id,quantity,unit,target_yield,target_unit |
| accounts (optional) | account_id,name |
| orders (optional) | line_id,account_id,item_id,quantity,unit,status |

Item kind is a retained nonempty description, such as ingredient, bulk beer or packaging. The item ID carries stock identity; kind does not authorize any unit or product substitution.

Lot ID can be explicitly blank when the source does not track a lot. Location must be explicit. All other key IDs are nonempty. Whitespace in a nonblank ID is retained rather than silently normalized, so source owners should use their actual consistent identifiers.

Opening and target each permit **one independent balance per item + lot + location**. Exact duplicate occurrences of the same row ID and content are counted once and listed. A different row ID for the same balance bucket rejects as a competing count. Combine legitimate count fragments explicitly under the source owner's declared count, and retain the complete fragment originals in the source archive or evidence. The desk does not silently add independent observations.

Movements are uniquely identified by **source_system + event_id**. An identical repeated row is retained in the source and visibly counted once. A repeated identity with conflicting content rejects. Distinct source systems do not magically identify the same economic event: choose an authoritative source and preserve its identity when overlapping exports represent the same movement.

Aliases are keyed by source_system + source_item_id. They must resolve to one existing item. No alias is inferred from a similar name, a matching SKU string or an item description. Conflicting alias rows reject.

## Exact quantities and units

Quantities are decimal strings without thousands separators or scientific notation. The internal arithmetic uses reduced integer rational numbers. It does not use binary floating point for quantities. Displays are exact finite decimals where possible, and exact numerator/denominator fractions otherwise.

| Accepted unit | Dimension | Exact factor to canonical unit |
|---|---|---|
| g | mass | 1g |
| kg | mass | 1000g |
| mg | mass | 0.001g |
| oz | mass, avoirdupois | 28.349523125g |
| lb | mass, avoirdupois | 453.59237g |
| ml | volume | 1ml |
| L | volume | 1000ml |
| us_fl_oz | U.S. liquid volume | 29.5735295625ml |
| us_gal | U.S. liquid volume | 3785.411784ml |
| us_beer_bbl | U.S. beer-volume measure | 117347.765304ml (31 U.S. gallons) |
| each, ea, count | count | 1count |

Units are case-sensitive as listed. Unspecified gal, bbl, keg, case, bag or ambiguous fluid-ounce symbols reject. Mass does not convert to volume, and count does not convert to liquid volume. The item base unit must have the same dimension as the source row unit. Count quantities must be integral. A half-barrel keg stock item recorded in each remains a count item; it is not implicitly converted to beer volume.

These exact mass/liquid definitions are based on NIST Handbook44 AppendixC and the TTB's published U.S. beer-barrel definition. The module is an inventory reconciliation tool; the unit table does not calculate excise tax or operate physical brewing equipment.

Opening and target counts must be nonnegative. Movements are signed: receipts positive, removals negative. Zero is allowed and remains explicit. Recipe ingredient quantities and target yield are positive; order quantities are nonnegative.

## Exact time window

Settings use `openingAt` and `cutoffAt`. Values must be full ISO dates/times with seconds and an explicit Z or ±HH:MM UTC offset. Up to nine fractional-second digits are accepted. Invalid calendar dates and unspecified offsets reject.

A movement is included exactly when:

```text
openingAt < occurred_at <= cutoffAt
```

An event at the opening instant belongs to the already-declared opening balance, so it is excluded. An event exactly at cutoff is included. Events before/at opening and after cutoff remain in the complete ledger with their exclusion reason. No timezone, midnight, DST or rounding assumption is made from a date-only string.

## Bucket arithmetic and exceptions

For each exact item/lot/location bucket:

```text
expected = opening + sum(included signed movements)
delta = independent target - expected
```

Missing opening is shown as missing, with an explicit provisional zero baseline solely to display the arithmetic. It always creates a missing-opening exception. A new lot that really began at zero should have an explicit zero opening source row.

Missing target is null, not zero. It creates a missing-target exception and has no numeric delta. Negative expected stock creates a separate exception. Any nonzero target-minus-expected difference creates a quantity-difference exception. A bucket may have more than one exception, such as negative expected stock and a nonzero target difference.

Every quantity includes its exact numerator, denominator and display. The report and CSV retain the item base unit, original row IDs and movement identities.

## Recipes, accounts and open orders

Recipe identity is recipe_id + version. Each ingredient refers to an existing item and is converted only within that item's unit dimension. Multiple versions remain separate. A recipe version must have one consistent target yield, even when equivalent units are used across ingredient rows. A duplicate ingredient identity with conflicting quantity rejects; normalize an intentional repeated-stage ingredient explicitly before migration and retain the original formulation.

Accounts retain stable account IDs and names. Each order line refers to a known account and item, and keeps its literal status and quantity. Orders are migration references, including cancelled or fulfilled statuses when supplied. They do not subtract inventory. Recipes do not consume inventory. Actual draws, transfers, receipts and shipments belong in the signed movement source with stable event IDs.

## Reviewed exceptions and corrected editions

Each review names the exact edition and exception ID, source identity, reviewer and reason. Dispositions are investigate, accept-difference and source-correction-needed.

Accept-difference records a decision to retain the reported discrepancy. It does not erase the delta, recolor the bucket as balanced or rewrite a source count. A correction to a review appends a successor record naming the earlier review. Named original text evidence is retained with bytes and SHA-256.

When the source changes, create a new edition with complete source files and settings. Reviews are not silently carried to a changed source. The old edition's complete sources, numeric differences and review history remain available.

## Continuation format and source safety

The whole JSON workspace is the continuation artifact. It contains an immutable hash-chained operation history and complete original source texts. Reopen validates all source bytes, CSV contracts, item/alias/reference relationships, unit and timestamp rules, command history and review bindings before adoption.

CSV/HTML are useful receiving formats; the complete workspace preserves every edition. Both browser and native callers should retain the previous whole body until the candidate is validated and durably saved. The browser wrapper also retains unfinished drafts. Failed core intake does not create a partial edition.

## API

```js
const core = createBreweryCore();
let w = core.create({id:"brewery-cutover",label:"Actual brewery cutover"});
w = core.receive(w,{
  id:"cutover-1",label:"Opening through cutover",
  settings:{openingAt:"2026-10-15T00:00:00-04:00",cutoffAt:"2026-10-15T12:00:00-04:00"},
  sources:{
    items:{name:"items.csv",text:itemsCsv},
    aliases:{name:"aliases.csv",text:aliasesCsv},
    opening:{name:"opening.csv",text:openingCsv},
    movements:{name:"movements.csv",text:movementCsv},
    target:{name:"target.csv",text:targetCsv}
  },
  notes:"Actual source systems, count ownership and normalization method."
});
const analysis = core.analyse(w,"cutover-1");
w = core.review(w,{
  editionId:"cutover-1",exceptionId:analysis.exceptions[0].id,
  disposition:"source-correction-needed",
  reviewer:"Named source owner",reason:"Specific actual correction required.",
  evidence:{name:"returned-note.txt",text:"Complete original returned note."}
});
const portable = JSON.stringify(w,null,2);
const reopened = core.reopen(portable);
```

Mutations return a new workspace. Optional expectedRevision rejects an action prepared against an older body. `editions(w)` returns every complete source set and parsed source tables. `analyse(w,id)` returns buckets, movements, exceptions/current reviews/history, duplicates, recipes, accounts, orders and counts. `csv(w,id,kind)` supports buckets, movements, exceptions, reviews, duplicates, recipes, accounts and orders. `report(w,id)` returns a complete offline HTML report with source and workspace downloads. `sampleSources()` returns the clearly labeled authored full sample; production begins from real sources.

## Native command line

All outputs are create-only. Use a new output file or directory and retain the preceding workspace.

```sh
node native/cli.mjs create --id brewery-cutover --label "Brewery cutover" --out empty.json
node native/cli.mjs receive --workspace empty.json --request intake.json --out received.json
node native/cli.mjs review --workspace received.json --request review.json --out reviewed.json
node native/cli.mjs export --workspace reviewed.json --edition cutover-1 --out new-delivery
node native/receive.mjs new-authored-course-output
```

Intake request files contain id, label, settings, notes and sources. Each sources value is a CSV filename resolved relative to that request file. The CLI reads each original once as strict UTF-8, preserving BOM and line endings. A review request uses the API fields; optional evidencePath reads a complete original evidence text relative to the request file.

An export directory contains full JSON workspace, analysis JSON, standalone report, eight ordinary CSVs, every admitted source original and a byte/hash manifest written last. The tool receives original source exports and produces independently reviewable migration records.

## Complete authored case and hand calculation

The sample uses seven explicitly authored stock items, eight buckets, eight source families and two recipe versions. Fourteen unique movements come from fifteen original rows; one duplicate draw is counted once. Twelve movements are inside the exact window and two are outside.

- Malt: 100kg opening +25kg receipt −10kg use =115kg; target115kg.
- Hops: 5000g +453.59237g (1lb) −953.59237g =4500g; target4500g.
- Bulk beer: 200L +10L −30L −3.785411784L (1U.S.gallon) −1L at cutoff =175.214588216L. Target174L gives delta−1.214588216L.
- Keg SKU: 10each −3each =7each. The open order for2each remains separate.
- Case SKU: 20each −2each =18each.
- Wheat: 5kg −6kg =−1kg, target0kg gives delta+1kg and negative-stock attention.
- New-hop bucket: missing opening is flagged; a receipt100g and target100g agree only on the explicit provisional-zero calculation.
- Empty cans: opening100each; an absent target remains missing rather than zero.

The first edition has five exceptions across four buckets. Reviews and a review correction remain attached to that source. A separately authored corrected edition supplies wheat opening6kg, new-hop opening0g, can target100each and beer target175.214588216L. All eight buckets balance there while the earlier complete discrepancy edition remains intact.

The maintained source receiving course passed23material checks in V8, including exact unit/window arithmetic, duplicate handling, conflicting mappings/counts, review/source identity, corrected editions, and full reopen/CSV/report reproduction. The saved result identifies the actual execution environment. Native CLI and runner are included for the equipped receiving environment.

## Primary references

- NIST Handbook44,2020, AppendixC, General Tables of Units of Measurement: https://www.nist.gov/system/files/documents/2019/11/19/00-20-hb44-final11152019pdf.pdf — exact U.S. liquid/mass reference factors.
- NIST Mass Calibrations, SP250-31: https://www.nist.gov/system/files/documents/calibrations/sp250-31.pdf — exact avoirdupois pound to kilogram relation.
- TTB Beer FAQs, B2: https://www.ttb.gov/beer/beer-faqs/print — one U.S. beer barrel equals31U.S.gallons.
- TTB unit conversion page: https://www.ttb.gov/scientific-services-division/dbmenu1sub5 — gallon/fluid-ounce and pound/ounce relationships; the core uses the exact NIST factors rather than rounded convenience approximations.
