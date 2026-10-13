# Rumble customer product: grant contribution and operating course

This contribution connects the complete Stellar Prices customer product to the existing SCF application. The customer uses actual retained observations to maintain a reviewed asset book and a downstream value feed. The same original customer can receive another source edition, compare it, publish it, reopen its wallet and hand over its whole source/workspace.

The complete selected application chapter is [rumble-customer.md](../../stellar-forge/developer-site/grant-chapters/rumble-customer.md). Its independent source declaration is [rumble-customer.json](../../stellar-forge/developer-site/grant-products/rumble-customer.json). The actual customer course is retained in [receiving/customer-case.json](receiving/customer-case.json). The complete [OPERATING.md](OPERATING.md) supplies Applications, SDK, MCP, full-file receiving and restart instructions.

## A useful customer task

A wallet, treasury display or customer reporting application needs to know which saved quantities each price describes, when those observations were made, what their original source reported and how a later edition changes the result. This product gives the operator an explicit saved book, original source selection, immutable edition and reviewed publication. Its downstream receiver preserves the complete customer feed, so a receiving application can continue on a later day without rebuilding a spreadsheet or silently changing the original observation.

The original discovery, watchlists, source history and saved runner remain part of the product. An operator can inspect the original response for any row, review its source quality, pause a collection, continue its saved request state and inspect the same customer afterward. Changes to an asset book do not replace the book behind an already published edition.

## Source and field contract

| Field or decision | Complete retained meaning |
| --- | --- |
| Asset identity | Exact provider-native `native`, case-sensitive `CODE:ISSUER`, or Soroban contract identifier. An operator selects the intended original asset; similar labels do not merge identities. |
| Quantity | Saved decimal string. Fixed-point integer arithmetic supports the complete configured quantity and original unit-price strings. |
| Unit price | The original `price_usd` or `price_xlm` string chosen by the book's denomination. The complete price object and original response remain available. |
| Observation and refresh | `as_of` is the observation timestamp; `updated_at` is the snapshot refresh timestamp. Customer price-age policy evaluates the original observation. |
| XLM conversion | The original XLM/USD conversion close has its own timing. Rows retain that timing distinction when the book selects XLM values. |
| Source policy | Carried, older-than-target and unknown observations follow the book's saved explicit choices. Missing requests, unavailable observations and the supplier's zero-price sentinel remain unavailable. |
| Position and total | A permitted position is exact quantity × unit price. Available positions contribute to the priced subtotal. The complete total is present only when all configured positions have usable values. |
| Edition comparison | Quantity effect = (new quantity − previous quantity) × previous price. Price effect = new quantity × (new price − previous price). Together they equal the value change for a comparable position. Added, removed, unavailable and denomination-changed positions remain explicit. |

Each edition selects exactly one named retained run. It never borrows another run's observation to fill a missing row. The saved evaluation time and quality rules freeze that edition's decision, making reopening reproducible. A new evaluation is a new edition.

## Complete operating course

### 1. Receive the original source and customer

Use the complete original customer delivery and its declared byte/hash identity. Receive it into a new private directory through the original unpacker, then inspect the received workspace. Select the retained customer rather than creating another identity.

~~~sh
starforge rumble-workspace unpack --file /private/original/stellar-prices-workbench.json --out /private/received
starforge rumble-workspace inspect --dir /private/received/workspace
~~~

For this existing operated case the workspace is `workspace-a7132ccfd3667385c848c02b`, and the customer is `rumble-wallet-reference-4593`. Its original Workshare is `workshare-dd2046fadcd6ab86f2b842f3`; Delivery is `delivery-ddf471890ee533b17dff6ad9`; handover is `handover-9507fe90cde7cee07e1a8915`.

### 2. Review the saved book

Open **Customer values**. Read the exact asset identifiers, quantities, currency and quality policy. Editing the book uses the displayed current customer revision. Saving creates its own book revision; a prior published edition remains attached to the book it actually valued. The operator can copy a saved watchlist into an editable draft, then enter the intended quantities and review each row.

Before collecting, select **Plan prices for saved book**. This produces the existing provider plan for every configured asset. Review that plan and start it through Collections. The original runner owns pacing, actual attempts, errors, quota continuation and the response store.

### 3. Receive and review a complete edition

Choose the actual saved source run and receive it into the customer with one persistent operation ID. Inspect every position, source response, age/status and comparison. If a request's reply was interrupted, preserve the exact input and operation ID and inspect/replay that original receiving. The engine reconciles an already accepted immutable edition.

Publish or reject the displayed edition with reviewer and note at the current customer revision. Publishing selects that exact edition; JSON and CSV can also export a specifically named historical edition. The feed carries the book, original source identity, calculated values, comparison and review.

### 4. Adopt the feed in the receiving application

The supplied wallet model validates the complete original customer/workspace identity. It stores each whole accepted feed and keeps the greatest accepted customer revision as current. Replaying the exact same source returns its retained state. An older first-seen edition remains in history without moving the current view backward. Reusing a revision with changed contents returns a conflict.

~~~js
import {receiveConsumerFeed, walletView} from './wallet.mjs';
const received = receiveConsumerFeed(existingWalletState, completeIncomingFeed);
// Save received.state in the customer's existing durable application storage.
const currentView = walletView(received.state);
~~~

Render quantities, prices and values as exact strings or with a decimal type. Carry quality flags and original observation times alongside each value.

### 5. Continue with a later source

Keep the same customer and receiving wallet. Collect a later source for the saved book, receive and review another edition, then adopt its feed. The comparison exposes quantity and price effects. If an operator has added an asset that was absent from the selected older run, the edition retains that missing coverage until a suitable new source is actually collected.

### 6. Export and reopen the whole product

The Handoff view exports the original source and full workspace: plans, responses, books, editions, reviews and downstream files. The original unpacker verifies every file and receives it into a new directory. Start its delivered source, inspect the same customer and reproduce the published feed. This supports a second operator's useful continuation with the original source still available.

~~~sh
node cli.mjs export --dir ./workspace --out complete-customer-delivery.json
node cli.mjs unpack --file complete-customer-delivery.json --out ./received
node ./received/cli.mjs customer --dir ./received/workspace --customer rumble-wallet-reference-4593
node ./received/cli.mjs customer-values --dir ./received/workspace --customer rumble-wallet-reference-4593 --out reopened-values.json
~~~

## Actual original customer operation

The source-native customer course completed at 2026-10-13T06:22:26.383Z. Its retained original book and first source edition were followed by an actual later provider collection. The browser edited quantities and added a fourth catalogue asset. Receiving the previous source against the expanded book correctly retained one unavailable `NOT_REQUESTED` position. A subsequent complete provider collection covered all four assets, and review published the fourth immutable edition.

| Result | Retained original value |
| --- | --- |
| Customer / book revision | 9 / 2 |
| Final original source run | `run-mv6an1ej-6be8e6141cbd` |
| Final edition | `edition-97fb86edb6fa4fdc59bb082426460b45` |
| Configured positions / valued positions | 4 / 4 |
| Exact computed USD total | `3433488.48159080132517383340231482746201` |
| Complete delivered source and customer | 83 files / 600,540 decoded bytes |
| Published feed SHA-256 | `5a41836a79dccfa3e6e6336dd4f02fbafe63c11a9342ce433941df512759cdd6` |
| Wallet SHA-256 | `68273512dc3d18886c291db4e783768185d68f5f3f4fd547b37d7e7e0ede7483` |
| Independent reopened customer | Same workspace/customer, matching complete feed, exact repeated wallet receiving |
| Browser | Five desktop/phone screens; zero page/local HTTP errors; 390px document in a 390px phone viewport |
| Exact arithmetic cross-check | Thirteen position values and the edition totals matched independently computed decimal arithmetic |

The [complete customer-case record](receiving/customer-case.json) carries every operated phase and all four edition summaries with their original source times, values and comparisons. The full original saved ZIP carries the actual response bytes, customer, source, screenshots and independent receiver.

## Managed Applications, SDK and MCP

The merged40-file installed product adds the original runtime selection and source-owned contribution. The Applications entry opens the existing private workspace and manages one original workbench process. A reviewed launch binds directory identity, workspace ID, listener and process identity; the typed SDK and MCP attach to that same listener. Original customer mutations stay on the existing write queue.

The24 MCP operations cover application attachment, saved customer/edition authoring, provider plan/start/pause/resume/result, full exports and resumable retained files, complete source/workspace receiving and persistent wallet adoption. Each tool uses declared aliases and original file identities. Exports retain intent and exact saved content, so a completed retry returns the same file. The complete operating guide covers private configuration, actual method arguments, staged outcomes and restart.

The installed native continuation starts from this already-completed customer case. Its actual selected-build root correction (`./ui/`) is merged. Its controller resumes the already-created selected-output directory using the maintained builder's supported `resume:true` option. Complete Applications launch, SDK/MCP receiving and managed restart are the next steps of that retained original installation operation.

## Original Installation and paid-service adoption

The existing Installation receiver accepts the complete customer product as an additional `role:source` file with its actual bytes, SHA, source URL, observation time and media type. It adds the original source IDs to the source and receiving selections. Keep the existing Workshare, commissioning file, plan identity, deployment IDs and task/source/payment/receiving bindings.

Commissioning defines the customer's useful complete unit: one reviewed edition containing every configured position, source coverage and applicable values. A complete collection can require several original provider requests. File chunks and repeated reads retain the same edition identity. The original paid service and grant Operations records retain their own quoted resource, buyer approval, settlement and fulfillment course when a deployment selects this data task.

| Existing funded package | Customer product integration |
| --- | --- |
| Merchant-resource integration, 80h | Select the exact asset-book task, provider source, original output schema, full result scope and receiving application. |
| Authority and handover, 40h | Name source/host/receiving operators and their authorized configuration; receive the same original product on the second operator's host. |
| Provider and ledger deployment, 70h | Bind the selected paid operation to approved ledger/facilitator options and preserve original request/result identities. |
| Deployed threat response, 50h | Exercise the installed access, changed-source, quota, interrupted response and recovery cases through the original owners. |
| Mainnet merchant rollout, 90h | Operate the selected complete task with actual independent merchants/buyers and returned-day use. |
| Production recovery and handover, 70h | Receive, restore and reconcile the whole saved customer, original source, history and unfinished operation. |

These are integration uses inside the canonical six packages, whose total remains USD38,000 for400 prospective hours over150 days. The original plan controls the independent-customer and paid-use milestones.

## Receive this contribution in the existing grant application

1. Retain the current full canonical manuscript and all four reviewer source outputs.
2. Insert the complete single H2 from `grant-chapters/rumble-customer.md` into the current demonstration/operator journey, preserving its exact heading and immutable source links.
3. Receive `grant-products/rumble-customer.json` through the existing Product Sources authoring workspace, or use the original composer with its additional `--product-registration` argument.
4. Inspect the complete source-index preview. The declaration adds its own eight measured/original sources, preserving all unrelated current source rows and product registrations.
5. Compose the current canonical manuscript, then receive all four complete outputs through the existing cumulative saved-draft/review/source-package flow. Keep the edited answers, earlier reviews, selected plan and original Page/Site publication.

~~~sh
node stellar-forge/developer-site/grant-compose.mjs \
  --directory CURRENT_COMPLETE_DIST \
  --manuscript CURRENT_COMPLETE_CANONICAL \
  --product-registration stellar-forge/developer-site/grant-products/rumble-customer.json \
  --source-pins-output CURRENT_SOURCE_PINS
~~~

Use the current selected dist and existing pin options. The original composer loads the installed declaration directory by default; the explicit file option also supports receiving this exact original registration before it enters an installed release. The pure `receiveGrantProductSources` receiver is the same source-index operation used by the browser authoring preview.

## Immutable original sources

[Rumble complete installed customer operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a0658859d26e7bb1641badcd7ea1518dc7b58ab0/products/rumble-fish/OPERATING.md) · [Complete Rumble customer Applications, SDK and MCP implementation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/95ba7bd911a688448fbcc7c27aca704ed57fe75d/stellar/scf-starforge-20261009/partners/rumble-fish-prices/workbench) · [Customer asset book, source editions, exact values and downstream wallet](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a0658859d26e7bb1641badcd7ea1518dc7b58ab0/stellar/scf-starforge-20261009/partners/rumble-fish-prices/workbench/CONSUMER.md) · [Complete captured original Stellar Prices OpenAPI](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a0658859d26e7bb1641badcd7ea1518dc7b58ab0/stellar/scf-starforge-20261009/partners/rumble-fish-prices/workbench/sources/provider.openapi.json) · [Original 23-file customer source identity](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a0658859d26e7bb1641badcd7ea1518dc7b58ab0/stellar/scf-starforge-20261009/partners/rumble-fish-prices/workbench/SOURCE_PROVENANCE.json) · [Whole customer product and maintained runtime dependency selection](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a0658859d26e7bb1641badcd7ea1518dc7b58ab0/stellar/scf-starforge-20261009/distribution/selections/rumble-customer-workspace.json) · [Complete original customer browser routes and directory root](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/95ba7bd911a688448fbcc7c27aca704ed57fe75d/stellar/scf-starforge-20261009/partners/rumble-fish-prices/workbench/browser-assets.json) · [Original Commons discovery, source and customer consumer workbench](https://github.com/woahwhattheheck/commons/tree/1d200771562dd0a39475290b6c0b1a2a0e0c2b3e/opportunities/rumble_fish_prices_workshare_2026/workbench)
