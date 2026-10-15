# Brewery onboarding desk

The desk keeps a brewery's original migration sources together, reconciles inventory at a declared cutover, and retains the decisions made about differences. 

## Open and work

Open **Brewery_Onboarding_Desk.html** to begin with blank inventory sources. Open **Brewery_Worked_Example.html** to inspect an authored count reconciliation before receiving a brewery's own files. Both complete files contain their application and data.

The worked case uses seven items across eight item/lot/location buckets, with ingredient mass, bulk beer volume, keg and case counts, an omitted closing count, and a movement for an unobserved opening bucket. It also includes two recipe versions and an existing account with open and cancelled order lines. Those example quantities belong to the exercise.

The main sequence is:

1. Declare the original opening timestamp and the cutover timestamp, both with an explicit UTC offset.
2. Receive the five required source families and whichever optional families belong to the operation.
3. Inspect inventory differences and the original movement window.
4. Record each review with its source edition, reviewer and explanation.
5. Receive corrections as a new complete edition.
6. Export the complete workspace for continuation and the relevant report/CSVs for review.

The named edition is immutable. An exception review remains beside the numeric difference; it never changes the actual opening count, movement, or independent target observation.

## Source families

| Family | Meaning |
|---|---|
| items | Canonical item identity, name, kind and base unit |
| aliases | Mapping from an actual source system/item ID to the canonical item |
| opening | One declared opening count per item, lot and location |
| movements | Signed actual quantity events, with source system, event ID and timestamp |
| target | One independent observed cutover count per item, lot and location |
| recipes | Optional recipe/version ingredient records and declared target yield |
| accounts | Optional retained account IDs and names |
| orders | Optional original line IDs, account/item references, quantities and statuses |

The intake panel displays the exact CSV headers for each family. Required aliases and movements may be header-only when there are no relevant records. Optional source families are included explicitly. An order requires its referenced account and item. A recipe ingredient requires its item and compatible quantity unit.

Original UTF-8 files are decoded strictly and retain their BOM and line endings. Draft text is preserved in the full workspace. Intake rejects malformed CSV, unknown units, unknown IDs, conflicting repeated identities and ambiguous competing counts before adopting any partial edition.

If a physical stocktake has multiple fragments for one bucket, retain those original records and have the source owner establish a documented combined count. The reconciliation receives that declared count once; distinct actual storage locations remain distinct buckets.

## Units and source identity

The supported explicit units are g, kg, mg, oz, lb, ml, L, us_fl_oz, us_gal, us_beer_bbl, each, ea and count. Unit names are case-sensitive. Ounces and pounds are mass; the US-prefixed fluid units are volume. Conversion crosses only compatible dimensions and retains exact rational arithmetic.

Package and container SKUs are individual count items. A half-barrel keg SKU and a case of twelve cans remain separate items with each as their base unit. To compare their physical beer volume, retain the brewery's actual container specification and packaging movement evidence as separate reviewed source records. The application never infers a container size from its name or invents a packaging transfer.

A movement's identity is its source system plus stable event ID. Identical duplicate rows are retained in the receiving notes and counted once. The same identity with different content is rejected for source correction. Independent opening/target count identities and recipe/version references receive their own checks.

The included window is strictly after opening and through cutover. An event at the opening timestamp is excluded; an event at the cutover timestamp is included. Explicit offsets and fractional seconds are retained. Events outside the window remain visible in the movement export.

## Read the reconciliation

Each inventory row contains the opening count, signed included movements, expected balance, independent target count, target-minus-expected delta, unit and status. Inspect the item/lot/location together.

A missing opening observation remains a missing-opening exception even when the arithmetic uses zero as a provisional baseline. A missing target remains unobserved. A negative expected balance and a nonzero delta remain visible. These are specific source questions for the brewery's reviewer.

In the initial worked case, the beer balance is:

200 L opening + 10 L receipt − 30 L tap draw − 3.785411784 L sample − 1 L at cutover = **175.214588216 L expected**.

The observed target is 174 L, so the delta is **−1.214588216 L**. The repeated tap-draw row counts once. The event at opening and the event just after cutover remain outside the balance.

The hops case starts at 5,000 g, receives one explicitly labelled pound and uses 953.59237 g, leaving 4,500 g. Kegs and cases retain their individual count balances. The recipes and pending order lines stay visible as migration records; they do not create a second inventory subtraction.

## Review and correct

Choose an exception, then record Investigate, Accept difference with explanation, or Source correction needed. Supply a reviewer and a meaningful reason. The optional reference and supporting text record are retained with that decision.

A correction appends a new review linked to its predecessor. Review history stays bound to the exact original source edition. When a count, mapping or event changes, enter a new edition ID and receive the complete revised source set. The earlier edition remains available in the selector.

The CSV menu exports inventory reconciliation, movement window, exceptions, review history, duplicate rows, recipes, accounts or orders. The HTML report includes the selected core analysis and original received sources. **Export full workspace** also includes unfinished intake/review drafts, all editions, the private programme and brewery working notes.

## Save and recover

Save workspace writes the whole working body to browser storage and retains a separate copy. If another tab has changed the saved head, the new proposal is retained independently and the current head remains intact. Restore saved opens the current saved body. Use this copy as current is an explicit decision to advance the saved head to the retained working copy; another intervening change is detected.

Before opening a different workspace or creating a new one, the application retains a dirty current body. If storage is unavailable, export the complete current workspace, then confirm that exact download is saved before replacement. Editing after an export requires another full export for this fallback.

Saved and competing copies can be exported independently. Browser storage belongs to its origin; carry the complete JSON when moving browsers or machines. A stable localhost origin can help when a browser restricts storage for directly opened files:

    python3 -m http.server 8765 --bind 127.0.0.1

Open the delivered desk on that local address. Full-workspace export is available independently of IndexedDB.

New workspace starts a fresh inventory case while retaining the brewery programme and its working notes. The prior complete case remains in retained storage or its confirmed export.

## Implementation and continuation

The maintained source separates the exact reconciliation core, working controller, browser store, operator, styles and build function. Native source receiving and report commands are documented in the accompanying core guide. The complete bank includes all originals, both complete HTML applications and the browser working JSON.

The production operator and controller were executed in the available JavaScript runtime using explicit DOM, storage and download interfaces. The receiving record covers actual review submission, CSV export, failed intake preservation, complete export/reopen, competing copies and malformed import rejection. Keep any actual browser/native receiving results with the source edition used for that run.

