# Recorded performance through the original Pricing MCP

This workflow connects a completed tariff quotation to a saved usage review, retains the complete comparison and prepares an explicit monthly pricing proposal. The sixteen methods use the existing Pricing provider, alias, model, request lifecycle and retained-file reader.

Open the normal `/performance/` page on the original Pricing host, use the installed `merchant-performance` command, or invoke the original `merchant-mcp pricing` client below. The complete browser/HTTP/native CLI guide is adjacent at `sf97-merchant-revenue-ops/performance/README.md`.

## Original sources and quantity

~~~sh
merchant-mcp pricing open --url "$MERCHANT_MCP_URL" --workspace merchant
merchant-mcp pricing performance-state --url "$MERCHANT_MCP_URL" --workspace merchant
merchant-mcp pricing performance-sources --url "$MERCHANT_MCP_URL" --workspace merchant --limit 50
merchant-mcp pricing performance-source --url "$MERCHANT_MCP_URL" --workspace merchant --version "$USAGE_VERSION"
~~~

The selection ID is a completed tariff selection’s original `pricingRequestId`. Its portfolio preserves the saved tariff plan, comparison, scenario request and resulting native Pricing version. The usage ID is the exact saved Pricing version containing the measured source. Pages return `{items,total,nextAfter}`; supply `nextAfter` as `--after` for continuation.

| Basis | Observed population |
| --- | --- |
| `HTTP_2XX` | Recorded successful HTTP responses for the original selected route. |
| `NATIVE_SUCCESS` | Native events matched to the full original route/payment identity. |
| `INBOX_ACCEPTED` | Matched native events delivered according to the retained journal snapshot. |
| `SERVICE_CONSUMED_REQUESTS` | Requests newly consuming purchased allowance between complete snapshots. |
| `SERVICE_2XX` | Requests with a newly retained successful response, including earlier-consumed result recovery. |

`optionId` can narrow the two native bases to one exact payment identity. Network, asset, recipient and atomic amount remain separate from USD price comparisons. Callback delivery reflects the final retained journal row; that callback can have been recorded after the selected traffic period.

Service capture takes both complete original opening and closing exports. The maintained service-period compiler validates the same entitled order, allowance, request identities, capture order and state transitions. It preserves purchased units separately from request counts. The selected tariff must apply to the observed route ID, method and path; an inner service route uses its independently applicable per-request quote, while the outer prepaid purchase remains separately retained.

A cost edition must bind the exact selected usage version and its report hash. All supplier files, original receipts, normalized book, currency/basis groups and period/coverage declarations are included. Merchant unit assumptions remain separately shown. A native option’s narrower quantity does not relabel a whole-route supplier allocation.

## Preview and immutable save

The full preview input for MCP is:

~~~json
{
  "workspace": "merchant",
  "inputs": {
    "selectionRequestId": "ORIGINAL_PRICING_REQUEST_UUID",
    "usageVersion": "SAVED_USAGE_VERSION_UUID",
    "basis": "NATIVE_SUCCESS",
    "optionId": null,
    "costEdition": null,
    "costBasis": "BILLED",
    "servicePeriodSourceId": null
  }
}
~~~

~~~sh
merchant-mcp pricing performance-preview --url "$MERCHANT_MCP_URL" --input /private/preview.json
merchant-mcp pricing performance-save --url "$MERCHANT_MCP_URL" --input /private/save.json
~~~

Private JSON files use mode 0600. The save body contains `workspace`, a caller-chosen `requestId`, `label`, the returned `performanceSha256` and the exact normalized `inputs`. The preview reply is `{inputs,review}`, with the hash at `review.performanceSha256`.

The immutable `performanceId` equals the original save request UUID. `sourceId` binds the complete portable envelope, including its original first saved time. The numerical performance hash uses the complete original sources without adding a new calculation timestamp. Repeat identical save inputs and UUID after an interrupted reply; the writer checks that original request before recapturing source.

`performance-capture-service` takes `workspace,requestId,label,opening,closing`, with each snapshot `{name,text}` preserving its complete original UTF-8 JSON. The returned SHA-256 `sourceId` supplies `servicePeriodSourceId`. The direct installed CLI can read both snapshots using the file flags described in the adjacent native guide.

## Complete exports and receiving

~~~sh
merchant-mcp pricing performance-capture \
  --url "$MERCHANT_MCP_URL" --workspace merchant --performance-id "$PERFORMANCE_ID"

merchant-mcp pricing performance-download \
  --url "$MERCHANT_MCP_URL" --workspace merchant \
  --performance-id "$PERFORMANCE_ID" --out /private/customer-performance
~~~

The MCP capture returns the native record and immutable manifest. Complete source bytes use the existing retained downloader:

| File | Contents |
| --- | --- |
| `source.json` | Complete portable envelope and every selected original file body. |
| `review.json` | Original saved calculation, population, coverage and source identities. |
| `review.html` | Standalone readable report with neutral industrial styling. |
| `usage.csv` | Exact observed quantities, UTC day/time basis and original review IDs. |
| `manifest.json` | Exact byte count and SHA-256 for all four exports. |

Reuse the same private `--out` directory to resume its original checkpoint. `--manifest-sha256` pins an already inspected manifest; `--chunk-bytes` selects the maintained reader’s supported chunk size. The native HTTP `capture` method returns the entire envelope directly.

~~~sh
merchant-mcp pricing performance-inspect \
  --url "$MERCHANT_MCP_URL" --workspace recipient \
  --source-file /private/customer-performance/source.json

merchant-mcp pricing performance-receive \
  --url "$MERCHANT_MCP_URL" --workspace recipient \
  --source-file /private/customer-performance/source.json
~~~

The portable inspector recomputes original Pricing, tariff, cost and service calculations and verifies all file descriptors. It returns `{id,record,review,files}`; the flattened `files` entries are `{name,bytes,sha256}`. Complete bodies remain in the exported envelope. Receive preserves the original UUID, source ID and timestamp and makes its paired service source available locally.

The received report can be reopened, exported and attached to the original Commercial quote independently. Complete native proposal continuation uses a fresh original Pricing `WORKSPACE_BACKUP` captured after the saved performance and proposal requests, together with the original full tariff portfolio. The backup includes complete performance reviews, paired service sources, capture requests, indexes and proposal/selection intents and results. Restore the original archive into a new private directory, reopen the original Pricing model with its host-selected source paths, and receive the companion tariff portfolio before continuing. `performance-load` then exposes the same original recovery requests and UUIDs on the receiving side. The backup descriptor’s `snapshot.performance` names the required tariff plans and selection requests; the original restore preview includes performance record counts. The measured performance envelope remains immutable as later native proposals are added.

## Explicit monthly proposal and recovery

~~~sh
merchant-mcp pricing performance-proposal \
  --url "$MERCHANT_MCP_URL" --workspace merchant \
  --performance-id "$PERFORMANCE_ID" --proposed-monthly-requests 1500
~~~

The positive monthly quantity is a canonical integer string within the original safe-integer range. The proposal keeps `observedQuantity/observedPeriod` separate from `proposedMonthlyRequests`. It uses the original selected tariff and its original Pricing source, preserving whole-merchant commercial assumptions. Exact tier total, rounded uniform quote and rounding difference are all returned.

Save `performanceId,proposedMonthlyRequests,proposalSha256,requestId,label` through `performance-save-proposal`. The response includes the original saved tariff plan and complete native selection. If current source capture cannot supply a selection, `selectionError` carries the original error while the plan remains saved. Repeating the exact save recovers that plan before obtaining its current selection.

Review every field in `selection.pricingInput.commercial` against `selection.currentPricing.commercial`, including all other routes and shared monthly fixed cost. Then `performance-commit-proposal` accepts `performanceId,proposalRequestId,selection,planRequestId,pricingRequestId` alongside the existing workspace alias. Use the complete original returned selection and retain both original native request UUIDs.

The original tariff writer saves the native scenario and Pricing version using its current revision and source checks. `performance-load` returns complete proposal/selection recovery entries. A `RESUME` entry’s exact `request` can be sent back to the corresponding operation. The completed new tariff selection supplies the normal revised Commercial quote; the performance material preserves the measured quote and its ancestry.

## Original JavaScript client

~~~js
import {
  callMerchantPricing,
  downloadMerchantPerformance,
  inspectMerchantPerformance
} from '@tokenjunkielabs/starforge-merchant/merchant/pricing-client';

const connection = {
  url: process.env.MERCHANT_MCP_URL,
  tokenEnv: 'MCP_ACCESS_TOKEN'
};

const saved = await callMerchantPricing({
  ...connection,
  operation: 'performance-load',
  args: {workspace: 'merchant', performanceId}
});

await downloadMerchantPerformance({
  ...connection,
  workspace: 'merchant',
  performanceId,
  directory: '/private/customer-performance'
});

await inspectMerchantPerformance({
  workspace: 'merchant',
  performanceId,
  directory: '/private/customer-performance'
});
~~~

The existing client preserves input arguments and request IDs. Performance uses the maintained larger MCP response ceiling for complete native records. Complete files retain original manifest/file hashes, private directories, resume checkpoints and `merchant_pricing_file_release` ownership. Closing the Pricing alias drains performance work through its existing pending-operation lifecycle.

## Operation map

| CLI/client operation | Native workspace method |
| --- | --- |
| `performance-state` | `state` |
| `performance-sources` | `sources` |
| `performance-source` | `source` |
| `performance-service-periods` | `servicePeriods` |
| `performance-capture-service` | `captureServicePeriod` |
| `performance-preview` | `preview` |
| `performance-save` | `save` |
| `performance-list` | `list` |
| `performance-load` | `load` |
| `performance-capture` | Complete `capture` → retained manifest |
| `performance-download` | Complete exports through original retained reader |
| `performance-inspect` | `inspect` |
| `performance-receive` | `receive` |
| `performance-proposal` | `proposal` |
| `performance-save-proposal` | `saveProposal` |
| `performance-commit-proposal` | `commitProposal` |

The native calculation, portable source and durable writer live in the original SF97 `performance/` directory. `pricing-performance.mjs` and `catalog/pricing-performance.mjs` delegate those methods through the existing provider. The original `pricing-client.mjs` and `pricing-cli.mjs` retain the complete client and download workflow.
