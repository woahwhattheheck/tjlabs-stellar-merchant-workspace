# Customer price consumer

The existing Prices workbench now includes a complete customer asset-book workflow and a downstream wallet receiver. A saved customer book selects exact assets, decimal quantities, denomination and price-quality rules. A source edition uses one retained current-price collection, computes exact values, and keeps the original provider responses. Review selects the published customer feed. The receiving application can adopt that feed, receive a later edition, reopen the same customer and export the entire history.

The existing catalog, watchlists, current and historical collections, quality review, request pacing, saved continuation and industrial operator remain available. The customer store uses the same owning workspace lock and write queue. Complete workspace export includes its books, editions, reviews and original responses.

## Complete operator journey

Start the delivered application as described in README.md, then open **Customer values**.

1. Create a stable customer ID and name. Paste tab-separated asset, quantity and optional label rows, or load a saved configuration JSON. **Copy saved watchlist** copies exact identifiers into an editable draft with zero quantities.
2. Choose USD or XLM and save the customer asset book. A customer’s revision is separate from its book revision: receiving an edition or saving a review advances the customer revision without rewriting the book.
3. Use **Plan prices for saved book** to prepare the existing batch collector with every configured asset, then start it in Collections. Select that retained batch or another original individual-price collection and receive it into an edition. The page displays every configured asset, exact quantity, original unit price, calculated value, price status, method and observation time. Each source button opens the original response in the existing result viewer.
4. Inspect the change from the previous edition. When both values are available in the same denomination, the comparison separates the quantity effect from the price effect.
5. Enter the reviewer and publish the selected values. The published feed contains the exact edition, asset book and review. The selected-edition JSON and CSV remain available for any saved edition.
6. Collect a later source through the existing Collections workflow, receive it into the same customer and review its change. Prior editions retain the original prices and evaluation times.
7. Export the complete workspace from Handoff. The delivered source reopens the same customer, books, source responses, comparisons and published selection.

If the book changes after an edition, the existing published feed remains attached to its original book and reports currentBookMatches=false. Create an edition with the current book to publish the changed quantities or policy.

## Native field mapping

The provider’s complete captured OpenAPI is in sources/provider.openapi.json. Its original capture identity and source URLs are in sources/provider-capture.json.

| Consumer field | Original source / calculation |
| --- | --- |
| asset | Exact canonical PriceResponse.asset: native, case-sensitive CODE:ISSUER or Soroban contract |
| quantity | Saved customer input string; arithmetic uses fixed-point integers |
| unitPrice | price_usd for USD, price_xlm for XLM; the original string is retained |
| value | Exact quantity × unitPrice when the saved quality rules permit valuation |
| asOf | Original as_of, the time of the price observation |
| updatedAt | Original updated_at, the snapshot refresh time |
| priceStatus / method | Original price_status / method, preserved separately |
| providerPrice | The complete original price object, including all venue/source fields |
| source.response | Original response byte count and SHA-256, with original run/task/attempt |
| totals.pricedSubtotal | Sum of the available position values |
| totals.total | Complete total when every configured position is valued; otherwise null |
| comparison.quantityEffect | (new quantity − previous quantity) × previous unit price |
| comparison.priceEffect | New quantity × (new unit price − previous unit price) |
| comparison.valueDelta | New value − previous value, in the same denomination |
| comparison.comparableValueDelta | Sum of changes for assets with values in both editions |

Both comparison effects sum exactly to valueDelta. Added, removed, newly unavailable, newly available and denomination-changed positions remain explicit.

### Original provider semantics

The [pinned provider contract](https://github.com/rumblefishdev/stellar-prices-api/tree/5109d3937af8cb2211a4ef0cff4c417595be0718) and the complete captured live OpenAPI define these behaviors:

- Decimal strings preserve the provider’s precision. Quantities accept up to 60 integer and 30 fractional digits; arithmetic preserves the full product and sum. Published values and CSV contain decimal strings. Display software should retain them as text or use an exact decimal type.
- A price of "0" is the provider’s unavailable-price sentinel. An unpriced observation has no usable market price. Neither becomes a zero-valued position.
- as_of measures the USD price observation. updated_at measures snapshot refresh. The saved price-age target applies to as_of at the edition’s evaluation time.
- Carried values can be part of the provider’s normal hourly USD conversion cadence. The default book permits carried prices, with a 7,200-second target.
- price_xlm divides the USD price by a separately dated XLM/USD close. Every XLM-valued row carries this timing note; it does not imply a single contemporaneous conversion.
- Unknown status, unknown observation time and older-than-target prices remain visible. The customer book explicitly selects whether to include these available numeric prices. Unpriced and zero-sentinel values always remain unavailable.
- Each edition selects only its named retained run. A later not_found result, missing request or incomplete request cannot be filled by a previous run’s price.

All age and quality decisions are frozen in the edition. Reopening a historical edition reproduces the original calculation. Receive another edition when the operator wants another evaluation.

## Customer configuration

Save this complete input as customer.json, replacing the example name, reference and positions as appropriate:

~~~json
{
  "consumerId": "wallet-reference",
  "expectedRevision": 0,
  "configuration": {
    "name": "Wallet price integration",
    "customerReference": "Configured customer environment",
    "currency": "USD",
    "positions": [
      {"asset": "native", "quantity": "1250.1250000", "label": "Native balance"}
    ],
    "quality": {
      "maxAgeSeconds": 7200,
      "allowCarried": true,
      "allowOlder": false,
      "allowUnknown": false
    }
  }
}
~~~

Use expectedRevision=0 to create a customer. For later changes, read its current revision. Repeated exact assets are rejected so each asset’s quantity has one unambiguous source mapping.

~~~sh
node cli.mjs customer-save --dir ./workspace --input customer.json
node cli.mjs customer --dir ./workspace --customer wallet-reference
node cli.mjs customers --dir ./workspace
~~~

The customer save advances only the consumer area. It does not overwrite the original discovery, selection, historical-window or provider configuration.

## Receive, review and export an edition

Use an actual saved current-price run ID from inspect or the operator. Save the following as edition.json:

~~~json
{
  "consumerId": "wallet-reference",
  "expectedRevision": 1,
  "sourceRunId": "run-REPLACE-WITH-SAVED-ID",
  "name": "Wallet values / current collection",
  "note": "Configured asset quantities and selected original price collection",
  "operationId": "wallet-reference-first-source"
}
~~~

The sourceRunId placeholder must be replaced by the exact lowercase saved run ID. operationId identifies this receiving request. If its response is interrupted, replay the same complete input and operationId; an already committed edition is returned without creating another. A reused operationId with different input is rejected.

~~~sh
node cli.mjs customer-edition --dir ./workspace --input edition.json
~~~

Read the returned customer revision and edition ID. Save review.json using those exact values:

~~~json
{
  "consumerId": "wallet-reference",
  "expectedRevision": 2,
  "editionId": "edition-REPLACE-WITH-SAVED-ID",
  "decision": "publish",
  "reviewedBy": "Receiving operator",
  "note": "Asset quantities, coverage and source timing reviewed"
}
~~~

~~~sh
node cli.mjs customer-review --dir ./workspace --input review.json
node cli.mjs customer-values --dir ./workspace --customer wallet-reference --out published-values.json
node cli.mjs customer-values --dir ./workspace --customer wallet-reference --format csv --out values.csv
~~~

An explicit --edition ID exports that historical edition; without it, the published edition is selected. decision=reject records the decision and clears the published pointer if that exact edition was published.

## The downstream wallet receiver

wallet.mjs is the receiving application model. It validates the complete source feed and original customer identity, adopts its exact position values, and retains previous inputs. Its current view exposes the customer reference, positions, totals, comparison, review and source observation times.

The receiver uses the source customer revision as its ordering key. Replaying an identical source revision returns the same state. An older previously unseen feed is retained in history while the current view stays on the newer revision. Reusing a source revision with changed content or sending another customer/workspace into this receiver produces an explicit conflict.

The CLI persists each complete received state into a new file:

~~~sh
node cli.mjs receive-values --file published-values.json --out wallet-state-1.json
node cli.mjs receive-values --file later-published-values.json --prior wallet-state-1.json --out wallet-state-2.json
~~~

The second state contains both whole original feeds. Reopen it in the receiving application:

~~~js
import { readFile } from 'node:fs/promises';
import { receiveConsumerFeed, walletView } from './wallet.mjs';

const existing = JSON.parse(await readFile('wallet-state-1.json', 'utf8'));
const incoming = JSON.parse(await readFile('later-published-values.json', 'utf8'));
const received = receiveConsumerFeed(existing, incoming);
// Persist received.state in the customer's existing application storage.
const view = walletView(received.state);
for (const position of view.positions) {
  // Render value and unitPrice as exact strings, with flags and asOf alongside them.
  console.log(position.asset, position.quantity, position.value, position.currency);
}
~~~

A receiving application that only needs the direct feed can import verifyConsumerValues from consumer.mjs. The full asset-book/edition/review identities travel in that feed.

## Application API

All HTTP operations use the existing private operator capability and loopback service. The provider key remains in the owning runtime. No new provider transport is introduced.

| Method / path after /_prices/api/ | Purpose |
| --- | --- |
| GET consumers | Customer summary list |
| GET consumer?consumerId=… | Saved customer, book, editions and reviews |
| POST consumer | Save configuration with expectedRevision |
| POST consumer/edition | Receive one saved source run with operationId |
| GET consumer/edition?consumerId=…&editionId=… | Complete immutable edition |
| POST consumer/review | Publish/reject an exact edition |
| GET consumer/output?consumerId=… | Published complete feed |
| GET consumer/output?consumerId=…&editionId=…&format=csv | Explicit historical edition or CSV |

openWorkbench exposes the same methods as saveConsumer, consumer, consumers, createConsumerEdition, consumerEdition, reviewConsumerEdition and consumerOutput. See the complete declarations in consumer.d.mts and runner.d.mts.

## Source and restart behavior

The customer area lives under workspace/consumers/<consumerId>. Books, editions and reviews are immutable records. An atomically replaced customer head selects the current book, saved editions and published feed. Changes use the original workspace queue and owning-process lock; stale customer revisions are rejected before writing.

The complete existing delivery includes every source file in package.json, all customer records and all original provider responses. Run:

~~~sh
node cli.mjs export --dir ./workspace --out complete-customer-delivery.json
node cli.mjs unpack --file complete-customer-delivery.json --out ./received
node ./received/cli.mjs customer --dir ./received/workspace --customer wallet-reference
node ./received/cli.mjs customer-values --dir ./received/workspace --customer wallet-reference --out reopened-values.json
~~~

The workspace’s original ID is preserved. New collection resumes through the existing Prices client with its runtime API key, rate pacing, request budget, classified provider outcomes and saved continuation.
