# Procurement Savings Reconciliation Study Desk

An offline workbench for a complete procurement savings reconciliation: original source files, approved baseline and terms, actual purchases, explicit allocations, signed adjustments, policy treatment, calculations, procurement submissions and Finance decisions.

## Start

Open Procurement_Savings_Reconciliation_Study_Desk.html in a current browser. The application is self-contained. It embeds its complete source, all original course files and its compression dependency. No server or network request is needed. Use **Open complete authored workflow** to inspect the fictional worked example, or **New study** for actual authorized originals.

The twelve sections cover study scope, CSV intake and mapping, selected editions, observed records, identity maps, supporting originals, complete population and work plan, savings and Finance, initiatives and reconciliation, return comparison, source-bound review, and save/recover. The interface uses monochrome tables, ordinary forms and expandable original details.

Read QUICK_START.md for the operating sequence, DOMAIN_CONTRACT.md for the calculation rules, SCHEMA_REFERENCE.md for every canonical field, and NATIVE.md for the equivalent command-line workflow.

## What the result means

A forecast retains its original planned quantity and submitted amount. A calculated realized price difference uses the supported baseline and actual attributed quantity/amount. Allocated costs and the policy's treatment determine the net result. Documented future-price avoidance is separate. Finance decisions retain the exact submitted version and approved amounts.

Volume, price adherence and price/volume interaction explain the full planned-to-actual spend bridge. They do not become additional savings. Each reporting currency remains separate. Actual and constant-currency calculations retain their original approved rates and FX difference.

Shared purchases require explicit quantity assignments. Shared costs retain the original transaction total, stable allocation key and initiative amount. Duplicate aliases count once; conflicting aliases, over-allocation, unassigned quantities and unallocated costs remain visible.

## Original sources and historical decisions

The 33 canonical source families are editable CSV tables. Each mapping is explicit. Original text, original documents, byte digests, links, availability dates, selected extracts, corrections and review history remain in the study.

The selected CSV must be available by the study cutoff. An earlier decision may be reconstructed from a later retrospective CSV only when the exact referenced original row/version/document was already available at that earlier decision. Later amendments do not approve or support an earlier calculation.

Baseline, mapping and calculation inputs bind exact source row hashes. The named reviews bind exact decision bases. A Finance decision binds the exact submission row. These business decisions are distinct from the application's whole-study source review.

## Complete population and actual work

The consecutive study includes pending, cancelled, rejected, negative, partly realized and unresolved initiatives. Declared source counts and initiative membership are assessed independently. A supported subtotal remains visible when a whole total is unresolved.

Eight work phases cover source capture, supplier mapping, evidence retrieval, reconciliation, exception resolution, procurement submission, Finance review and correction. Compare actual active person-minutes for the same members and methods. Include increased work. Keep setup and unpaired observations visible; do not convert minutes to cash.

## Save and transfer

**Save complete file** downloads the entire session, including unfinished forms, source originals, current study, prior study editions and competing branches. **Download complete export ZIP** adds the report, comparison, selected editable tables, document bytes and recovery index. **Download application source ZIP** returns every embedded application file.

Browser storage uses compare-and-swap to detect another tab's saved branch. Both branches remain available for explicit selection. A failed import retains the candidate. Emergency recovery carries pending forms/imports that cannot fit into the ordinary saved session.

Keep a complete session download before replacing a study or moving computers. The browser session limit is 40 MiB; CSV/document import accepts up to 24 MiB per file and session import up to 64 MiB. These are explicit transport limits, not permission to omit originals from a claimed complete study. Native commands provide directory and ZIP exports.

## Source layout

- core.cjs: complete original capture, field mapping, comparison, document integrity, corrections and review.
- session.cjs: immutable retained objects, history, complete branches, pending forms and recovery.
- procurement-engine.cjs: historical business source interpretation and exact calculations.
- procurement.cjs: study population, result, report, exports and source-binding helpers.
- procurement-effort.cjs: complete matched recurring-work calculation.
- operator/desk.js and operator/render-desk.cjs: operator UI and self-contained compressed HTML.
- native/procurement-desk.cjs: ordinary native operations and deterministic build.
- templates/: all 33 canonical headers.
- examples/, course/ and verification/: authored worked originals, independent balances and executed receiving courses supplied with the final application.
- SOURCE_MANIFEST.json: exact source member byte lengths and SHA-256 digests.

All monetary arithmetic uses rational values. JSON reports retain exact fractions and display decimals. No external rate, guessed allocation or inferred baseline is introduced by the application.
