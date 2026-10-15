# Complete authored distribution workflow

This course is fictional. It demonstrates the Distribution Lot and Order Study Desk with supplied source records, original document bytes, explicit identity mappings and dated decisions. It does not report results from a customer, reproduce a warehouse platform, or make a QA release decision.

## Open and inspect

Open `examples/complete.study.json` in the desk to inspect the reviewed source comparison. Open `examples/complete.session.json` to resume the complete editable session, including an unfinished CRLF source draft, the retained competing browser branch and the earlier reviewed study. The session's current study has a later note correction; its earlier review remains attached to its exact historical edition.

Start with `examples/distribution-report.md` for the readable business account. The full `examples/complete-report.md` also carries the source comparison and attachment inventory. `examples/complete.analysis.json` retains every machine-readable result. `examples/export-index.json` records the actual 921-member session export produced during verification.

The 39 populated files in `examples/input/` use the application's exact canonical headers. Each is imported on both source and returned sides, producing 78 retained CSV originals. These are complete authored source and returned copies; their identity crosswalks are explicit. The original documents in `examples/originals/` have safe content-hash filenames and a complete ID, time, size and SHA-256 index. All 753 documents are also embedded in the portable study and raw fixture.

## Physical and historical scope

The population covers fictional Meridian Industrial Ingredients, two warehouses and 1 October 2026 from 06:00 to 18:00 UTC, assessed at 2 October 00:00 UTC. It retains five physical lots, one receipt and six original customer order lines. All twelve population members remain present, including a cancelled order and an order with an unresolved customer date rule.

BULK and PACK represent the same specified material. PACK has an explicit product conversion of 25 kg per bag. The repack consumes 80 kg, produces three bags equivalent to 75 kg, and retains an actual 5 kg loss. Product and unit definitions are supplied source inputs, not a universal repacking assumption.

| Lot | Warehouse | Remaining physical kg | Qualification |
|---|---|---:|---|
| A | East | 10 | Released source state |
| B | East | 55 | Includes 5 kg returned quarantine |
| C | East | 30 | Held; ineligible despite earlier expiry |
| D | East | 50 | Two bags after one bag dispatched |
| E | West | 30 | After actual transfer and dispatch |
| E | East | 20 | Actual transfer receipt |

Independent conservation is 220 kg opening stock plus 100 kg receipts, less 5 kg repack loss, less 115 kg gross dispatch, plus 5 kg returned stock, less 10 kg posted writeoff: **195 kg**. A retrospective view during the transfer retains 20 kg in transit outside both warehouse balances.

## Certificate, hold and allocation history

Lot B's first certificate is rejected. Its amended certificate was issued at 09:00 but only available at 11:00; named QA review and release occur at 12:00. The 10:00 proposal stays rejected. The separate 12:10 proposal can use the then-available amendment and release, and freezes the twelve earlier allocation, pick and dispatch records already known at that instant. Later facts do not rewrite the earlier proposal.

Separate accepted East and West decisions retain their own warehouse scope. Frozen decision populations include the operator's complete source context. Named reviews bind exact case, input and proposal hashes. Original certificate SHA-256 values bind the actual retained document bytes, whereas source-input hashes bind exact canonical rows.

The course checks that the held earlier-expiry C lot remains ineligible and that FEFO ranks eligible A before E. Missing customer requirements stay unknown. No actor obtains authority merely because a row currently says accepted; the source carries named procurement, operations, warehouse and QA permissions.

## Orders, money and recurring work

The six retained order lines request 175 kg in total. One actual customer cancellation leaves 165 kg in the noncancelled population. Actual dispatch is 115 kg, with three fully dispatched lines and one partially dispatched line. A 5 kg return leaves 110 kg net physical dispatch. The whole compliant-fill fraction remains unresolved because ORDER-5 has no supplied customer date rule. Physical activity, commercial state and complete compliance are separate results.

The observed GBP amounts are sale 500, credit 50 and writeoff 60. They remain separate categories. The course makes no inference about cash receipt, avoided loss, savings or net benefit.

All twelve population members have observations for both methods across these eight phases:

1. Source capture.
2. Receiving reconciliation.
3. Certificate and QA review.
4. Allocation planning.
5. Exception approval.
6. Dispatch reconciliation.
7. Outcome follow-up.
8. Correction.

The 192 observations total 324 baseline and 300 current active person-minutes, a signed change of −24. QA review rises from five to seven minutes per member, and exception approval from two to three; these increases remain included. This is a complete observed recurring-work comparison for the authored population. Setup effort is not measured here and is not invented as zero. The smaller six-order research teaching example in the customer programme is a separate exercise.

## Reproduce the complete receiving path

From the application source root, run:

```sh
node verification/verify-distribution-course.cjs
```

The entrypoint runs the nine operating checks, four retained business countercases, and seven Core/session paths. It performs the expensive original receiving step once, then passes that complete received object to the application course. It emits a readable JSON receipt and exits unsuccessfully if any retained check fails.

The maintained `distribution-course.cjs` API is:

| Export | Result |
|---|---|
| `build()` | Complete raw records, original documents and declared plan |
| `bindEngine(fixture, Engine)` | Exact source and decision bindings for the raw fixture |
| `optionsFor(fixture, cutoff)` | Counts, source context and original-document lookup |
| `run(Engine)` | Nine actual operating checks and full source summary |
| `receiveFixture(Core, onProgress)` | Imports all originals and CSVs; returns study, fixture, canonical records, document maps and CSV files |
| `buildStudy(Core, onProgress)` | Convenience wrapper returning the received study |
| `runApp(received, Core, Session)` | Seven complete lifecycle checks, reviewed study, reopened session, analysis, reports and actual export index |

The document-ID mapping is deliberate. Original document bytes remain unchanged; received canonical rows use the real IDs assigned by Core. Frozen row hashes and named decision-review digests are recomputed against those exact received rows. `examples/original-document-map.json` preserves the complete mapping.

The verified receiving run imported 753 originals, 78 CSVs and 1,502 explicit attachment links in 38,656 ms. The full Core/session course took another 73,875 ms. These receipts come from executing the exact CommonJS modules in V8. They are not an operating-system Node or rendered-browser receipt. The earlier uncached run stopped after 500 originals, so no complete import speed ratio is claimed. The retained source and command support the application's separate native and browser receiving operation.

## Retained countercases

The four focused business cases ensure that conflicting simultaneous certificate reviews, conflicting simultaneous operations reviews, an unmapped order state and a later unmapped QA state cannot silently retain a previously favourable result. The complete lifecycle course additionally verifies exact selected-source equality, whole population and stock account, unresolved business coverage, digest-bound named review, unfinished draft and branch recovery, full export and stale-review refusal.

All generated artifacts are complete. `CONTRIBUTION_MANIFEST.json` identifies every contribution member by path, UTF-8 byte length and SHA-256; it excludes itself. This contribution joins the application source and does not duplicate or replace its domain implementation.
