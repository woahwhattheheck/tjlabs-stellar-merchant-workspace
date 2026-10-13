# Configured ROZO sources in Buyer expenses

The maintained Buyer MCP provider, typed client and `expenses` CLI operate the original SF36 expense Store. A configured source is a private, SHA-pinned original ROZO finance file. A caller explicitly chooses its purchases for each preview and capture. The provider does not infer ownership from a merchant report.

## Host configuration

Add `rozoSources` to an existing workspace in the private `stellar-forge.buyer-expense-connection.v1` configuration:

```json
{
  "schema": "stellar-forge.buyer-expense-connection.v1",
  "workspaces": {
    "buyer": {
      "directory": "./original-buyer",
      "rozoSources": {
        "report": {
          "sourceFile": "./sources/customer-report.json",
          "sourceSha256": "<exact lowercase SHA-256 of the original bytes>",
          "name": "Reviewed ROZO purchases",
          "provenance": "Original saved report and explicit buyer ownership",
          "dataContext": "development"
        }
      }
    }
  }
}
```

Keep the configuration and original source private to their owner. Relative source paths resolve against the configuration file. The source must be an owned regular file, opened without following a file symlink, of 1–67,108,864 bytes; its SHA must match on each call. The source filename is its basename, no directory, at most 240 native characters, with no leading/trailing whitespace. Operational and development data use their corresponding native workspace context.

The existing `merchant_buyer_expense_workspaces` result lists the alias, source SHA, name, provenance, data context and filename. It does not expose the host path. Use the existing `merchant_buyer_expense_open` action to open this workspace.

## Preview, capture and review

Call `merchant_buyer_expense_rozo_preview` with:

```json
{
  "workspace": "buyer",
  "rozoSource": "report",
  "operator": "Named buyer operator",
  "purchaseSelection": {
    "schema": "stellar-forge.rozo-buyer-selection.v1",
    "sourceId": "<rozo- followed by the exact original 64-hex identity>",
    "purchases": [
      {
        "movementId": "<rozo-movement- followed by the original 64-hex identity>",
        "basisSha256": "<the exact reviewed movement basis>",
        "purchaseOwner": "Named buyer",
        "purchaseReference": "Original purchase reference",
        "reason": "Why this original source payment belongs to the buyer"
      }
    ]
  }
}
```

Copy these identities from the original ROZO finance source inspection. The selection is required, including an explicit empty `purchases: []` for reference-only intake. It permits up to 10,000 unique original source-payment movements. Fees and destination payouts remain separate merchant facts. Each purchase retains a nonempty owner (240 characters), reference (500) and reason (6,000). The native validator checks exact source identity, movement identity, current basis and purchase kind.

The provider sends `purchaseSelection` as the unchanged native `selection` alongside the exact source bytes, filename, configured metadata and operator. It checks the full maximum capture envelope against the native 96,000,000-byte request limit before preview. A preview cannot pass solely because it omits the subsequent request ID and hash.

Retain the whole preview and its `preview_sha256`. Call `merchant_buyer_expense_rozo_capture` with the same preview arguments plus the original `requestId`, inspected `expectedRevision` and `previewSha256`. The existing Store returns its original mutation response `{revision, result, request_id}`. Its result contains the original source and capture IDs. Capture review stays separate: call `merchant_buyer_expense_capture_review` with the retained capture ID, an explicit ACCEPT or REJECT decision, named reviewer, reason and current revision.

A repeated source/selection may reopen an existing current accepted or pending capture according to the native preview. The owner does not introduce a second capture journal or rewrite earlier decisions.

## Recovery and lifecycle

Keep the original argument JSON before dispatch. If a response is lost, use the existing `merchant_buyer_expense_request` with the same request ID. The original Store reports `state: "COMMITTED"`, the original fingerprint/operation and saved response. The provider preserves that response. Do not reconstruct native request fingerprints in another serializer: the Store uses its own sorted ASCII-escaped canonical JSON.

A missing request result does not establish that an uncertain operation failed. Reconcile the original operation and preserve the exact body and ID. A retry rereads the configured source and requires the original bytes/SHA. If that configured file changed or disappeared, recover the saved native request instead of submitting a replacement capture.

Preview, capture, review and export use the existing alias lane and server lifetime. The root's `withRozoFinanceWorkspace` callback remains intact, sharing this same original owner with the product finance workflow. Closing drains admitted callbacks and requests using the established owner lifecycle.

## Expense status, labels and periods

The `items` action exposes `ROZO_UNRESOLVED` in its exact status filter. Pending, unmeasured or undated purchases retain unresolved status. Provider-confirmed native units remain provider evidence, with no inferred chain proof, reservation, payment or foreign-exchange amount.

Asset-label schemas distinguish existing ordinary assets from ROZO identities. Ordinary labels retain their original 200-character network/asset, 24-character symbol and 0–30 decimal limits. ROZO labels allow the complete JSON identities built from original chain/network and token-address/precision, a symbol of up to 40 characters and decimals 0–36. The native Store still checks exact retained asset membership and original precision. The protocol and advertised tool schema use the same alternatives.

Continue through the existing cost-center, coding, period review/close, accountant source/return and complete-project workflows. This integration changes neither allocation arithmetic nor source evidence classification.

## Original-file export and complete receiving

Use the existing `export` action with `kind: "rozo-report"`, the original capture as `recordId`, and a stable `exportId`. The provider reads the native capture summary, verifies its ROZO kind and ID, then reads `/api/captures/<id>/rozo-original`. File size and SHA must match the retained capture before publication.

The retained download uses the safe canonical filename `original-rozo-finance-source.json`. Its complete bytes are unchanged. The manifest carries the exact captured `originalFilename` separately, avoiding collisions with the retained downloader's control files. Typed download/inspection metadata carries that original filename too. Both the full native capture and complete Buyer project preserve the original intake filename and purchase selection.

Use the existing `manifest`, `file`, `file_release`, `inspect` and `download` operations for immutable, SHA-pinned ranged transfer. Complete-project export continues to require the inspected workspace revision. Receive a complete project with the maintained native receiver and its original Node source validator; receiving never dispatches a payment or recaptures a live source.

## Existing CLI and typed client

```sh
expenses tools
expenses call --url MCP_URL --action rozo_preview --arguments preview.json --output preview-result.json
expenses call --url MCP_URL --action rozo_capture --arguments retained-capture.json --output capture-result.json
expenses call --url MCP_URL --action request --arguments retained-request-id.json
expenses call --url MCP_URL --action export --arguments retained-source-export.json
expenses inspect --url MCP_URL --export original-rozo
expenses download --url MCP_URL --export original-rozo --directory PRIVATE_DIRECTORY
```

Use actual private files with mode 0600, actual endpoint and retained IDs. The dynamic CLI and typed client discover these actions from the same catalogue; typed method names are `rozoPreview` and `rozoCapture`. The typed client continues to expose `call` for every existing action.

Only ROZO preview/capture argument files may use the larger 96,000,000-byte file limit. Ordinary action argument files keep the original 2,000,000-byte limit. The native source-plus-selection and existing MCP transport limits still apply; a larger argument-file allowance does not bypass either boundary.

## Source integration

Apply the complete owner postimage over the root's current Buyer owner containing `withRozoFinanceWorkspace`, and apply the complete catalogue, protocol, client and CLI postimages together. The native ROZO intake, Store unresolved-status correction, original reader dependency closure and trusted receiving files belong to the same cumulative product selection. Preserve later peer work through a current-source merge before publication.
