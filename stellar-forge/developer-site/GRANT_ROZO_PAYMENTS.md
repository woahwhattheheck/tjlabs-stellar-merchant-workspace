# ROZO contribution to the existing SCF application

Operation: SCF-ROZO-FINANCIAL-APPLICATION-24EA-20261013.

This contribution supplies the complete ROZO operating chapter, measured source registration and publisher/receiving instructions for the existing grant application. The source edition is merged PR1064, `a480c70a6cb4b5dfa89976d2978013af9b70794e`, following the original payment product in PR812. The complete configured-finance release contains 53 source changes and the selected original Accounting/Buyer runtime closure.

## Receive the complete contribution

| File | Original use |
| --- | --- |
| [grant-chapters/rozo-payments.md](grant-chapters/rozo-payments.md) | Whole H2 customer chapter: installation, payment/report, merchant recognition, explicit Buyer ownership, accountant work, full restoration, funded scope and customer measurement. |
| [grant-products/rozo-payments.json](grant-products/rozo-payments.json) | One original product registration with twelve immutable source files and their complete Git blob, byte-count and SHA-256 identities. |
| This guide | Original application composition and complete customer/native receiving sequence. |

The chapter heading is `## ROZO payment operations, financial closing and complete receiving`; its product ID is `rozo-payments`. The original generic customer chapter receiver accepts this H2 inside canonical `# 9A. Current demonstration and operator journey`. The original product-source registry receives the selected source links before public projection.

Open the current canonical manuscript at https://tokenjunkielabs.slack.com/docs/T0BRETUB5TK/F0C86PRE5NF through its existing serial manuscript owner. Receive the whole chapter under #9A before the next H1. If the same heading already exists, compare the complete current section and select the intended following edition. Preserve all other current chapters and the nine-answer front. The received declaration is additive to the existing complete product declaration directory.

The selected grant-reviewer component includes the developer-site source. Keep the original current cumulative source package, saved submission draft and review round. Resolve all paths below from that original operation. The maintained composer discovers the complete declaration automatically when this source edition is selected:

```sh
node stellar-forge/developer-site/grant-compose.mjs \
  --directory /absolute/current-selected-dist \
  --manuscript /absolute/current-canonical.md \
  --source-pins-output /absolute/current-reader-pins.json
```

When receiving this declaration into an already selected older composer, use its existing repeatable `--product-registration /absolute/rozo-payments.json` option, with the whole received file. Select that external file only when `rozo-payments` is absent from the composer's current default declaration directory. The original validator requires one declaration per product. Preserve the retained economic, coastal, financial, customer-closing and Datasette selections; the current source index already supplies those defaults.

The original composer writes `grant.html`, `grant-data/application.md`, `grant-data/product-and-finance.md` and `grant-data/source-index.json`. The existing companion reader discovers the ROZO chapter and provides whole-source download, chapter navigation, search, printing and an offline reader. The whole contribution uses that existing renderer and industrial interface.

Receive the returned complete selected source package through the same saved draft:

```sh
starforge grant-export --draft ORIGINAL_DRAFT \
  --receive-source-package COMPLETE_SELECTED_SOURCE_PACKAGE \
  --out ORIGINAL_SELECTED_EXPORT_DIRECTORY
```

The cumulative owner supplies the actual draft, source package and output paths from its retained operation. Continue its original review and publication with the returned package. Inspect the resulting index: all twelve `rozo-` source IDs belong to `rozo-payments`, each selects the merged source edition above, and `narrative_source.composition.product_source_registrations` binds the complete declaration file. The existing unrelated source records and original financial/capacity plan continue alongside it.

## Select and install the original customer product

Follow [the complete installation guide](../../stellar/scf-starforge-20261009/distribution/selections/ROZO_PAYMENTS.md) at the selected source path `stellar/scf-starforge-20261009/distribution/selections/ROZO_PAYMENTS.md`. The repository-relative commands are:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/source-repository \
  --ref a480c70a6cb4b5dfa89976d2978013af9b70794e \
  --selection rozo-payments --out /absolute/new-source-package

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/rozo-runtime --archive ORIGINAL_ARCHIVE --sha256 ARCHIVE_SHA256 \
  --feature rozo-payments --feature schema --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/rozo-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/rozo-runtime --load --source
```

Use the builder's original archive and hash. The installation requires the declared Node 24+, Python 3.11+, npm and flock; actual provider SDK connections retain their original separately selected runtimes. Continue an interrupted installation in its same directory. The original Applications provider receives that runtime, actual ROZO workspace, private connection file and selected merchant Accounting/Buyer aliases.

## Continue the same payment and finance operation

The original payment/native programme is `ROZO-MERCHANT-SETTLEMENT-COMMISSIONING-20261012`, receiving handoff 1791849686.821759 in the original ROZO company parent: https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791835190459309. Its configured-finance continuation is `ROZO-MERCHANT-SETTLEMENT-FINANCE-20261013`, delivered at https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791864126833589.

Use that operation's actual accepting host, original progress and completed payment/Applications outputs. A sealed sender continues through its original active receiving workspace. The finance programme uses the existing configured Accounting and Buyer owners and their actual private configuration; it retains the exact original source and money decisions.

Prepare the following finance plan from the actual original report. Commands below use the installed `starforge`; its original runtime `run --dir ... -- rozo-payments` route is equivalent:

```sh
starforge rozo-payments finance-plan \
  --workspace /private/rozo/workspace --merchant-config /private/merchant.json \
  --accounting merchant-books --buyer purchasing --directory /private/finance-draft \
  --report-id ORIGINAL_REPORT_ID --report-sha256 ORIGINAL_REPORT_SHA \
  --actor "Selected finance operator" --source-details /private/source-details.json \
  --operation-id ROZO-MERCHANT-SETTLEMENT-FINANCE-20261013
```

`source-details.json` contains exactly `name`, `provenance` and `dataContext`. Use the original controlled fixture's development context for its existing native demonstration. The read-only plan saves the complete source, context and draft. Select the actual dates, period definitions, account allocations, evidence acknowledgements and merchant movement for the browser step. Buyer participation requires actual selected source-payment movement IDs/bases, purchase owners, references and reasons. With no chosen Buyer purchases, retain the explicit reference-only or absent Buyer selection allowed by the actual plan.

Select existing centres and the complete intended labels, resolve original period issues, and retain an explicit accountant REVIEWED note. Use the configured original Accounting recovery stateRoot/backupRoot and passphrase environment. Confirm that external writers have stopped before its complete backup. Choose `handover: false` for a working export or `true` for the explicit permanent custody transfer. The full [FINANCE.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments/FINANCE.md) contract governs the complete reviewed plan and any original configured source alias.

```sh
starforge rozo-payments native-finance \
  --workspace /private/rozo/workspace --config /private/rozo/connections.json \
  --merchant-config /private/merchant.json --accounting merchant-books --buyer purchasing \
  --plan /private/reviewed-finance-plan.json --directory /private/finance-operation \
  --chromium /existing/runtime/chrome-headless-shell \
  --playwright-module /existing/runtime/playwright/index.mjs \
  --python /existing/runtime/python3
```

Resume using the same retained plan and directory. The native programme preserves accepted requests, completes merchant and Buyer closes, creates/returns both original accountant handoffs, operates the finance form's lost-response recovery, visits all five finance views and records the selected desktop/narrow viewports. It then produces the complete encrypted Accounting backup, full Buyer/ROZO archives and independent received-source verification.

Retain `FINANCE_RESULT.json`, `FINANCE_RECEIVED.json`, both browser phase results, `FINANCE_PACKAGE_RECEIPT.json` and the complete `Rozo_Finance_Complete.zip`. The package receipt supplies the actual final bytes/hash:

```sh
starforge rozo-payments receive-finance \
  --archive /delivery/Rozo_Finance_Complete.zip --sha256 ORIGINAL_ZIP_SHA \
  --directory /private/received-finance-package --receiver /private/cold-finance \
  --python /existing/runtime/python3
```

Receiving verifies every complete member, original workspace/origin identities, source/capture/review/close history, accountant returns, original request fingerprints and file hashes. Configured QuickBooks host recovery uses the original authenticated profile, recovery factory and relocation mapper; secret values remain in the encrypted backup or existing environment. Retain the existing passphrase delivery with the selected private recipient.

## Current implementation and received outcomes

The twelve declared source bodies are from the merged configured-finance release. All 53 changed bodies in that release were independently matched to their raw Git file identities; its merge preserved those complete bodies.

The maintained product registry, customer projector/chapter receiver and complete companion renderer were executed directly from their original JavaScript source in the functions V8 runtime. Review used the complete retained companion and source index: all 256 existing source records and all 64 original chapters remained exact, all twelve ROZO sources were received, the new complete chapter rendered once, and repeated intake returned the same source register. These operations validate the actual original pure composition path.

The native payment/Applications and configured-finance programmes continue in the original receiving operation. At this contribution's source boundary, no whole native completion has returned. Update the chapter's operated result from that operation's actual saved installation, native result, receiving result and complete archive. The product's full execution instructions and sources are available above.

## Carry later editions into the same application

A following product edition updates this registration's explicit selected commit and measured `editions`, together with the chapter's immutable links. Preserve its stable product and source IDs, prior original source package, actual saved draft and customer operation. Obtain every declared digest from the complete selected original body.

Reconcile completed reusable implementation against the original six prospective packages at award. Keep customer acceptance, useful purchases, source capture, accounting events and accountant review tied to their original economic identities. The existing $38,000 / 400-hour / 150-day plan supplies the funding scope; provider reports, ledger outcomes, purchased outputs and customer responses supply the actual operating results.
