# Loaded Bikes catalogue acceptance

This component prepares and reviews the captured public Loaded Bikes product family through the existing migration workbench. It does not create a second migration engine. Native extraction, normalization, DuckDB loading, complete typed parity, business measurement and reviewer decisions remain in the original workbench.

## What the retained source establishes

The initial complete capture contains 20 parent products and all 70 declared variants. Its four selected business tables contain 20 products, 70 variants, 70 ordered option bindings and 49 product/category relationships. Every original JSON response remains retained, including images, descriptions, category and marketing fields outside the selected tables. Two child records returned in parent queries are also present in the variation responses; their complete objects must agree before one business identity is used.

Product IDs and variation IDs are the original WooCommerce identifiers stored as exact text. They are not customer ERP item IDs. A slug is not a unique identifier. Nine parent products and two sellable end-cap variants have an empty SKU in this capture; those empty text values are retained. The original parent/variant link and the option position identify an option binding, rather than the publisher's repeated zero-valued attribute term IDs.

Prices retain exact integer minor units, their original currency and currency scale. An absent or empty source price is unknown, not zero. Variable parent price ranges are retained separately from each variant's actual price. A native price control is a checksum-like business total grouped by currency and scale; it is not revenue, stock valuation or a sum of independently purchasable parent and child items.

Public in-stock, purchasable, on-sale and backorder flags remain booleans. Null low-stock counts remain unknown. The capture supplies no stock on hand, reserved quantities, warehouse allocations or opening inventory valuation. HTML descriptions and entity spellings are preserved as text; the review interface must escape them rather than render publisher HTML.

## Original source → expected tables

`projectExpectedCatalogue(capture)` verifies every raw response's size and SHA-256, reparses the full response using the original exact JSON parser, validates the complete parent/variant closure, and independently constructs all four expected row populations. It does not use the staging adapter's rows.

`verifyLoadedBikesExpected({catalogue, expectedTables})` compares every typed expected cell against that independent original-source projection. It rejects missing or additional tables, missing or duplicate keys, changed source values, incomplete row counts and altered types. Harmless row and column reordering is allowed. This validates the independent original source expectation; it does not claim that a native job ran or that a destination is equal.

Explicit customer corrections belong to a separate reviewed mapping edition. The original expectation and raw source remain unchanged. The staging adapter checks each correction's exact previous value and retains the original key, attributed reviewer and reason. The corrected selection produces its own native input and expected target edition. Correcting a variant's parent does not silently rewrite its option bindings: all related corrections must be explicit, and the original required relationships must still pass.

## Required acceptance versus catalogue interpretation

`buildLoadedBikesAcceptance({pipelinePlan, catalogue, mapping})` returns a `definian.acceptance-input.v1` document for the original `compileAcceptance`, `evaluateAcceptance` and `decideAcceptance` functions.

The selected acceptance has four original business objects and requires their complete original key fields. It requires each variant to belong to a captured product, each option to match both its variant and that variant's parent, and every product/category membership to refer to its product. Full row counts, variants by parent, and exact price controls by currency and scale are required. No catalogue interpretation decision can waive changed source bytes, an absent native table, invalid types, key loss, orphan relationships, native failures or incomplete parity.

`sourceIssues(capture, claims?)` is a separate catalogue interpretation list with stable source-bound issue IDs and original response pointers. The customer may keep the source, attribute an explicit correction, or request missing input. These choices do not change the measured native report and do not authorize cutover.

With the complete semantic companion, all 14 source findings are retained and displayed alongside the conditional-compatibility and production-scope reminders. Current source questions include:

- Nine empty parent SKU strings, two empty sellable end-cap variant SKUs, and the customer's intended parent/variant item mapping.
- Nut-and-bolt kit descriptions that reference LB10073 while no exact matching SKU is present in the captured family. The separately listed nut's different SKU is not silently substituted.
- Fork mount length 110 displayed as 110 cm, and parent/variant weight differences. A plausible unit interpretation is not evidence for a correction.
- A declared 45 mm screw variation omitted from the parent description.
- Wood insert kit variants without published component quantities.
- Reimo rail compatibility described as “can be made” compatible, rather than an unconditional direct-fit statement.

The public mount description explicitly includes a single stud locator, thumb nut and one adaptor set; rails are separately sold. Public kit descriptions can provide actual component quantities and SKUs. These are retained as published retail kit claims. They are not an approved manufacturing BOM, supplier agreement or independently certified installation compatibility.

## Crosswalk and extracted claims

`catalogueCrosswalk({catalogue, claims?})` returns all original item identities, parent identities, original options, source references and verified published claims. Its `destinationId` is null until an actual customer destination identity is supplied. Do not fill it with an invented ERP identifier.

An optional `tjlabs.loaded-bikes.source-claims.v1` document contains `claims` with unique `claim_id`, original `subject_id`, optional `parent_id`, `relation_kind`, `target`, `certainty` and source `evidence`. Every evidence row identifies `response_path`, `response_sha256`, `json_pointer` and an `exact_substring`. The complete original response must contain that exact evidence. Every claim must cite its own original subject. Published retail kit piece counts require an explicit quantity multiplier in the source excerpt. Other sourced quantities retain their original wording, such as pairs, individual units and literal dimensions; their interpretation remains reviewable. A linked product and SKU must match the same retained original item.

Keep direct, conditional and unresolved claims distinct. A cross-sell link is not a compatibility or component assertion. A same-name item does not resolve a missing SKU. Missing wood insert quantities cannot be copied from another kit type.

## What remains a customer input

The captured retail catalogue does not supply the selected ERP, its target identities, supplier master, approved production BOM, stock balances, tax settings or production cutover criteria. Successful loading and acceptance of this selected catalogue is useful migration evidence within that scope. It does not establish full ERP readiness.

The complete review project should retain the raw capture, original mapping and correction history, source-issue decisions, source-linked claims, independent expected tables, actual native selection and job, complete typed observations, measured acceptance report and decisions, plus every original download. Reopening must reproduce the same source and review identities.

## Receiving and human use

Use the maintained Loaded Bikes receiving command supplied with the complete adaptation and its original workbench runtime. Do not replace the original native worker or fabricate source IDs; retain files through the original workspace before compiling a pipeline.

The receiving owner must open and use the exact outgoing project at desktop and narrow width, inspect the source/mapping/review screens, operate the native job and acceptance controls, download and reopen the actual artifacts, and view the rendered result. Pure source projection and compilation checks are not native execution or human acceptance. Preserve any actual native job and resume it through the original recovery path.
