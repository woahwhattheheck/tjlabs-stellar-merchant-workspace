# API provider customer pilots

This package contains three proposed implementation workshares and a runnable technical artifact for original provider captures.

| Provider | Proposed useful result | Fee | Engineering | Delivery slot |
|---|---|---:|---:|---|
| [Nevermined](NEVERMINED.md) | One API purchase/top-up, original usable key, useful request, complete output and same-operation reopen | USD 3,000 | 24 hours | Five business days |
| [AIsa](AISA.md) | One research API query, complete receiving, original request recovery and accurate key-window usage view | USD 2,400 | 20 hours | Five business days |
| [BlockRun](BLOCKRUN.md) | One platform customer result, original account usage/correction view and complete independent receiving | USD 3,000 | 24 hours | Five business days |

The source review identifies documented integration opportunities. Each workshare starts with selection of one actual provider endpoint and customer example. The implementation fees, schedule and payment split are proposals.

## Run the technical example

Use Node.js 18 or later. This package has no third-party runtime dependency.

```sh
node demo.mjs
```

The output is generated from [examples.json](examples.json), whose values are explicitly authored examples. It shows:

- A successful Nevermined PAYG result with zero credit movement remains a PAYG settlement report. An actual USD amount and useful-output acceptance require their separate original evidence.
- Credit settlement retains native credit strings and charge references.
- A 32-day AIsa usage interval becomes two adjacent requests. Captured actual charge totals sum to `1.750000` USD, while usage value sums to `2.400000` USD.
- The original provider-request and historical-top-up outcome remain unassessed by aggregate usage alone.

To inspect a privately retained JSON file:

```sh
node inspect-capture.mjs nevermined /absolute/path/settlement-response.json
node inspect-capture.mjs aisa /absolute/path/key-usage-capture.json
node inspect-capture.mjs aisa-combine /absolute/path/key-usage-captures.json
```

The AIsa capture wrapper is this package's local association:
```json
{
  "selection": {
    "keyReference": "local-account-key-label",
    "startTime": 1788220800,
    "endTime": 1790899200,
    "scope": "key",
    "bucketWidth": "1d"
  },
  "response": {
    "totals": {
      "charged_micros_usd": "1500000",
      "usage_value_micros_usd": "2000000"
    }
  }
}
```

`response` contains the already captured native body; the example above abbreviates it to the documented fields used by the projection. Keep the complete original response in the private operation. The key label records the caller's selection; it is not authentication. `aisa-combine` accepts an array of such captures for one locally identified key and rejects overlapping intervals. It reports uncovered gaps.

For the original Nevermined/AIsa object inputs, numbers larger than JavaScript's safe integer range must arrive as decimal strings. No parser can recover precision already lost in a JSON numeric literal. Missing amounts are rejected instead of treated as zero. Integer micro-USD, including signed values supplied by a native report, is formatted using exact integer arithmetic.

## BlockRun account capture

Run the complete authored example with `node blockrun-demo.mjs`, or inspect an original local wrapper:

~~~sh
node inspect-capture.mjs blockrun /absolute/path/blockrun-capture.json
~~~

`blockrun-projections.mjs` and its declarations are exported under the package's `./blockrun` subpath. The profile takes the original response text, retaining decimal number tokens before interpretation. It preserves a fixed account/window/cursor chain, groups media rows by job, keeps signed corrections and pending amounts, and reports unavailable days and summary cutoffs.

Its authored six-row example has one media-job group, three provider-reported calls and a known total of USD 0.028100000000000001. Calls come from the original summary; a visible poll may belong to a job created before this window. The complete raw capture stays beside the projection for receiving. [Full workflow and source instructions](BLOCKRUN.md)

## How this becomes a complete implementation

The three workshares identify the native provider actions, input owners, engineering allocation, acceptance and complete customer handover. The existing Buyer and API workspace supplies retained original requests, explicit native continuation, selected dataset delivery and portable receiving. The engagement adds the provider-specific connection and customer workflow.

This example module is a read-only projection of captured fields. It performs no network call, payment, key provisioning or local journal mutation. Its output is provider-reported evidence, with payment authority and useful-output acceptance left with their original owners.

Read [NEVERMINED.md](NEVERMINED.md), [AISA.md](AISA.md) or [BLOCKRUN.md](BLOCKRUN.md) for the full scope. [SOURCES.json](SOURCES.json) records the original official pages used for this edition.

## Files

- `provider-projections.mjs` — exact field interpretation, interval planning and aggregate reconciliation.
- `provider-projections.d.mts` — typed inputs and public outputs.
- `inspect-capture.mjs` — private local capture reader: 1 MiB for Nevermined/AIsa, 32 MiB for BlockRun.
- `demo.mjs`, `examples.json`, `example-output.json` — reproducible authored demonstration.
- `NEVERMINED.md`, `AISA.md`, `BLOCKRUN.md` — complete proposed workshares.
- `SOURCES.json` — source and product integration references.

License: MIT, following the repository license.
