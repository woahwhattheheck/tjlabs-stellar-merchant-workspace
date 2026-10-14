# Recurring catalog buyer work

Use this workbench after obtaining complete API responses in the existing API-pass customer. It turns captured product offers into a repeatable catalog, an attention list and comparable price changes. The original customer keeps its purchases, request identities, approvals, allowance and response exports.

Run the source command:

~~~sh
node products/api-customer/catalog-cli.mjs help
~~~

An installed package exposes the same command as **starforge catalog-workflow**. The library exports are **./merchant/api-customer/catalog** and **./merchant/api-customer/catalog/views**.

## Complete a reporting period

1. Save the complete catalog: one target per intended product/variant/retailer, with stable ID, URL, expected identifiers and explicit comparison pack. Keep the source response profile alongside it. Set expected variant whenever SKU or GTIN is reused. Every supplied identifier must agree.
2. Create the reporting period with actual dates and an optional earlier period. Its target population and extraction profile remain fixed in that original edition. Later catalog edits affect future periods.
3. Prepare and execute actual requests through the existing captured-API merchant and API-pass customer. Keep each original request body and request ID. One response may contain several variants; share that original call across those targets.
4. Receive the complete response export and original call detail. Import the whole response with its manifest and request body. The workbench checks response bytes, digest, call status, request body and target URL.
5. Review ambiguous products, variants, sellers, price basis and packs. Save the selected offer, comparison quantity/unit, price basis and a useful reason. Exclusions retain their reason. Source failures remain in attention.
6. Download the full catalog, comparable changes, attention CSV, report and full workspace. Keep original sources and provider usage with this period.
7. Create the next period from the selected earlier period. An unchanged reviewed identity can carry forward. A replacement capture in the same period requires a fresh decision when an earlier review exists.

## Files and initial commands

Use an existing private directory with mode 0700. Mutations create complete new workspace files. Repeating identical complete bytes reopens an existing output; changed work uses a new filename.

Initial input shape; replace the illustrative target with the customer's actual product:

~~~json
{
  "id": "customer-catalog",
  "label": "Customer catalog",
  "targets": [{
    "id": "original-product",
    "label": "Original product and variant",
    "retailer": "Original retailer",
    "url": "https://example.com/product",
    "expected": {"sku": "ACTUAL-SKU", "variant": "ACTUAL-VARIANT", "currency": "USD"},
    "pack": {"quantity": "1", "unit": "retail package"}
  }],
  "profile": {
    "name": "Original extracted response",
    "itemsPointer": "/extractor/result/items",
    "statusPointer": "/info/statusCode",
    "finalUrlPointer": "/info/finalUrl",
    "billingPointer": "/info/billingPoints"
  }
}
~~~

Select the response pointer from the actual extractor contract.

~~~sh
starforge catalog-workflow init \
  --input /private/catalog/catalog.json \
  --out /private/catalog/workspace-001.json
~~~

An operation file contains the action and complete arguments:

~~~json
{
  "action": "plan",
  "arguments": {
    "operationId": "plan-2026-10-week-3",
    "expectedRevision": 1,
    "id": "2026-10-week-3",
    "label": "Weekly catalog review",
    "start": "2026-10-12",
    "end": "2026-10-18",
    "previousPeriodId": null
  }
}
~~~

Use the actual current revision:

~~~sh
starforge catalog-workflow apply \
  --workspace /private/catalog/workspace-001.json \
  --input /private/catalog/period.json \
  --out /private/catalog/workspace-002.json

starforge catalog-workflow inspect \
  --workspace /private/catalog/workspace-002.json
~~~

The apply command accepts saveCatalog, plan, capture and decide. Each operation retains operationId and expectedRevision. The same operation and complete arguments reopen the original result. Changed work under that identity returns a conflict.

## Join the actual API-pass response

Use the original host and actual workspace/profile/call/export identities. The original merchant-api-pass command supplies capture, download and reopen-download. See [OPERATING.md](OPERATING.md) and the [agent contract](../../stellar-forge/mcp-merchant-operator/API_PASS_WORKSPACES.md).

Retain four native files:

| File | Original source |
| --- | --- |
| api-pass-export.json | Complete immutable response manifest |
| response.bin | Complete downloaded response |
| call-detail.json | Original merchant_api_pass_call or client.callDetail result |
| request.json | Exact body selected for the original prepare_request |

The capture input contains operationId, expectedRevision, periodId, targetId, a new stable capture id, original requestId, requestUrl and replaceCaptureId (null for first capture). A replacement explicitly selects the current capture ID.

~~~sh
starforge catalog-workflow import-export \
  --workspace /private/catalog/workspace-002.json \
  --input /private/catalog/capture-input.json \
  --manifest /private/receiving/original-response/api-pass-export.json \
  --response /private/receiving/original-response/response.bin \
  --call /private/catalog/call-detail.json \
  --request-body /private/catalog/request.json \
  --out /private/catalog/workspace-003.json
~~~

The same four-file import is available in the review screen. The CLI also uses the maintained API-pass manifest parser. Each capture retains complete response text, byte count/hash, source, parsed candidates and original statuses. Importing or inspecting an export sends no API request.

## Open, review and publish

~~~sh
starforge catalog-workflow review \
  --workspace /private/catalog/workspace-003.json \
  --out /private/catalog/catalog-review.html

starforge catalog-workflow report \
  --workspace /private/catalog/workspace-003.json \
  --period 2026-10-week-3 \
  --directory /private/catalog/period-2026-10-week-3
~~~

Open catalog-review.html in a current browser. Select a period, search the full catalog or filter attention rows, inspect candidates and complete original response, and save a decision. Browser edits save the complete compact workspace in IndexedDB under the workspace identity. **Browse browser saves** lists the current save and preserved branches; **Open saved version** explicitly reopens the chosen revision. An edit from a stale tab preserves its own complete branch instead of overwriting newer work. Earlier localStorage saves remain available in that same chooser. **Save complete workspace** and **Save current workbench** create ordinary portable files; **Export expanded workspace** produces a fully expanded JSON edition for direct inspection.

The JSON report contains the complete catalog rows and period summary, and points to catalog-workspace.json for every original capture and operation. The report command writes seven complete files: catalog.csv, changes.csv, attention.csv, catalog-report.json, catalog-report.html, catalog-workspace.json and catalog-review.html. Identical outputs reopen after interrupted publication.

## Comparability

A target becomes ready when one product/offer identity is selected, its exact decimal price and currency exist, its price basis is explicit or reviewed, and extraction warnings are addressed. Both SKU and GTIN must match when supplied. Several offers sharing an identifier require review.

Identity includes product name, SKU, GTIN, source URL, variant, seller, price basis, source pack, currency, offer type and index. Aggregate ranges remain unsupported offers until individual offers are available.

The comparison pack is an explicit quantity/unit. One retail package is valid when physical net content remains unresolved. Shipping weight is never substituted for net content. Member and subscription prices keep their own price basis. Extraction attention and source terms remain with the original candidate.

Changes compare the same identity, currency, price basis and pack. Missing pages are never zero prices. Unit prices use exact decimal integer arithmetic before display; no currency conversion is applied. Percentage change from zero stays empty. CSV cells protect against spreadsheet formulas. Reports escape source text; the workbench displays retained HTML as text.

## Original source and recovery

Direct original public files use source.kind "public-source", actual source URL, complete original text and its SHA-256. The explicitly derived extraction envelope stays separate from original text. If transport statuses were not retained, both remain null. Such files support matching and report development before a provider-executed edition.

Preserve the full event workspace. Each operation links the previous operation hash and retains its full payload. Reopening reconstructs the catalog and periods. After an interrupted write, repeat the original command and output filename. Complete identical files reopen. Unpublished private partial files can be removed after the complete output is recovered.

After native call interruption, use the original API-pass request and recovery controls. After catalog edit interruption, reopen the complete workspace or original browser save. After replacing a source, review its current terms again. Older periods keep their original target populations.

Provider usage reconciles by original workspace/profile/call. Several variant rows can share one response. Actual provider billing points and the account statement determine incurred usage; catalog row counts do not imply paid call counts.

## Shared source storage and larger catalogs

The portable storage envelope keeps repeated response bodies, original source text, extractor functions and large structured values once, addressed by SHA-256. It reconstructs the exact logical workspace before the original event-history checks. Existing expanded files continue to open. Operation identities, revisions, original source strings and logical hashes stay unchanged; packing makes no provider request.

All CLI mutations save this compact form. The same command and browser accept either form. To produce a directly readable complete expanded file:

~~~sh
starforge catalog-workflow unpack --workspace /private/catalog/workspace.json --out /private/catalog/workspace-expanded.json
~~~

Library consumers can use engine.pack(workspace) and engine.unpack(workspace). The create/open/plan/capture/decide/report interfaces keep their ordinary logical results. Pass the packed workspace to catalogReviewHtml when publishing a portable workbench.

Browser saves use transactional IndexedDB. A current revision replaces the saved head only when its prior logical identity still matches; a conflicting tab keeps a separate recoverable branch. Subsequent edits can continue that selected branch. Browser quotas and private browsing policies vary. If storage is unavailable or full, the current complete revision stays open and the screen asks for a complete-file download. The ordinary downloaded workspace carries all original data independently of browser storage.

The CLI accepts complete source/workspace files up to 256 MiB. Runtime memory and source-response sizes determine practical catalog capacity in addition to target count. Share native calls across variants, retain the complete provider originals, and review actual file sizes when agreeing a large customer population. Compact storage reduces repeated source copies; expanded exports intentionally include the full logical representation.
