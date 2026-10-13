# Invoice & Settlement customer operations

Use the installed `invoice-settlement-customer` command to operate an existing Invoice & Settlement workspace over the maintained authenticated Merchant MCP service. The provider calls the original `openInvoiceSettlementOperator`; programme revisions, source capture, listener delivery, decisions, reconciliation and export retain their original native semantics.

The invoice programme is the original source of invoice and asset rules. Horizon review compares retained original deposits against an explicit account/memo/asset register, and only `horizon.apply` records the operator's individually selected decisions. This integration does not create payments, infer a payer or treat a match as a settled invoice.

## Host configuration and access

The host owner adds an `invoiceWorkspaceConnection` file reference to the existing Merchant configuration, preserving its current release store, sources and other provider entries. Relative paths in that original Merchant file remain relative to that file. For example:

```json
{
  "schema": "stellar-forge.merchant-mcp.v1",
  "name": "Existing merchant",
  "releaseStore": "./releases",
  "exportsDirectory": "./customer-exports",
  "sources": {},
  "invoiceWorkspaceConnection": "./invoice-workspaces.json"
}
```

The separate private declaration contains:

```json
{
  "schema": "stellar-forge.invoice-workspace-connection.v1",
  "workspaces": {
    "invoices": {
      "directory": "./invoice-workspace",
      "label": "Original invoice programme",
      "connectionsFile": "./private-source-connections.json",
      "inputs": {
        "invoice-register": {"file": "./inputs/invoice-register.json", "label": "Reviewed invoice deposit register"},
        "horizon-response": {"file": "./inputs/horizon-response.json", "label": "Complete original Horizon response"}
      }
    }
  }
}
```

Create the workspace and exports directories privately (0700) before opening the provider. Each alias names one canonical directory. Optionally set `expectedWorkspaceId` to the existing native UUID. `connectionsFile` and optional `profileFile` use the original operator formats; keep credentials outside the workspace. Connection values never enter the customer connection file or exported package.

The host activates this configuration through its existing Merchant service lifecycle. Aliases select records; existing Merchant authentication controls access. An alias is not a tenant-specific credential. A partner sharing one authenticated host must retain that host token and deliver the independent offline received copy to a customer, or use an independently authorized service.

The lazy provider declaration is in `providers/invoice-settlement-workspaces.mjs`. Its contribution registers the `invoiceWorkspaces` family automatically. Metadata listing does not open a native workspace. Opening owns one operator per alias; closing requires its observed instance UUID and drains accepted work and retained file readers.

## Install and bind

The distribution selection is `invoice-settlement-customer`. It includes the original invoice application, the complete native settlement/source dependencies, customer CLI, three typed package exports and retained-file writer. Build and install it through the maintained `starforge` distribution/runtime-install commands. Use Node22.16 or newer and the installed Linux `flock` lease owner.

```sh
invoice-settlement-customer connection-template --out connection.json
chmod 600 connection.json
invoice-settlement-customer bind --connection connection.json --out bound.json
invoice-settlement-customer read --connection bound.json --tool status --out opened.json
invoice-settlement-customer read --connection bound.json --tool methods --out native-methods.json
```

Before binding, edit the generated connection file with the existing HTTPS or loopback MCP endpoint, token environment variable name and declared alias. The template has no credential value. Supply the actual credential through that environment variable. Binding returns the observed original workspace UUID. Keep the bound file for every continuation.

## Read and retain the original state

`read` accepts only tools declared read-only. Native reads use the `read` tool and its original method arguments:

```json
{"method":"programme.read","args":{"programmeId":"ORIGINAL-UUID","version":1}}
```

```sh
invoice-settlement-customer read --connection bound.json --tool read --args programme-read.json --out programme.json
invoice-settlement-customer history --connection bound.json --out full-history.json
```

The history command reads all pages at one stable workspace revision and retains each original page. A changed revision is reported rather than represented as one consistent historical read. Other native reads return the complete original response; use source/report/delivery file methods or complete package download for large bodies.

## Plan, run and recover changes

Every customer change has one private local operation directory. Prepare the exact request before dispatch:

```json
{
  "method": "programme.save",
  "args": {
    "requestId": "ORIGINAL-REQUEST-UUID",
    "expectedRevision": 0,
    "definition": {}
  }
}
```

The definition must be the complete original native programme (assets, invoices and settlement rules); the empty object above only shows where the caller's authored definition belongs. Read `methods` and the original native invoice guide for required fields.

```sh
invoice-settlement-customer plan --connection bound.json --directory programme-operation --operation-id programme-v1 --tool change --args programme-change.json
invoice-settlement-customer run --directory programme-operation --out saved-programme.json
invoice-settlement-customer show --directory programme-operation
```

The local plan records the exact connection, original native UUID, request arguments and replay policy. Before the HTTP call, it publishes an entered attempt; after the response, it retains the complete response before completion. Reopening a complete local operation reads those bytes offline, without credentials or network.

The original atomic native methods deduplicate the same request UUID and immutable arguments. Those operations, source import and package export can automatically resume their original request. Expected revision is the original caller's concurrency selection; the provider does not silently refresh it. The native request lookup is:

```json
{"method":"request.status","args":{"requestId":"ORIGINAL-REQUEST-UUID"}}
```

Capture and outbound listener methods also retain their own native pending state. An entered request with an unknown outcome is not automatically dispatched again by the customer CLI. Read its original capture/delivery/request state and follow the original operator recovery contract. If continuing that exact operation is appropriate, use:

```sh
invoice-settlement-customer run --directory original-operation --continue-original
```

This records an explicit continuation and reuses the unchanged request UUID and arguments. It is not a new request or a selection of another invoice. The original native service still enforces its pending-request, delivery-resolution and revision rules.

## Import original source bytes

Inspect the declared input alias:

```sh
invoice-settlement-customer read --connection bound.json --tool inputs --args selected-input.json
```

Here `selected-input.json` contains `{"input":"invoice-register"}`. Prepare an `import` operation with its returned exact SHA256 and complete native source metadata:

```json
{
  "input": "invoice-register",
  "expectedSha256": "ORIGINAL-64-HEX-DIGEST",
  "args": {
    "requestId": "ORIGINAL-REQUEST-UUID",
    "expectedRevision": 2,
    "provider": "document",
    "kind": "horizon-invoice-register",
    "label": "Reviewed original invoice deposit register",
    "contentType": "application/json"
  }
}
```

The provider rereads and hashes the complete configured file, then passes those bytes to the original `source.import` method. Customers cannot choose arbitrary host paths or substitute a body through this tool. Native source captures use the separately configured source aliases and retain original request/response bodies, pagination and source interpretation.

## Review Horizon deposits and reconcile

Read `horizon.review` with the exact programme/version, register source UUID and selected complete Horizon source UUIDs. Preserve the returned review hash. Candidate and ambiguity explanations remain native source facts. Prepare `change` with `method:"horizon.apply"`, that same selection/hash, current expected revision, original request UUID, actor, and individually authored choices/reasons. The native atomic writer rechecks original files and prior decisions before saving any choice.

Read the resulting original decisions; then use the native `reconciliation.create`, `edition.read`, `reconciliation.compare` and `report.create` methods. Source references, integer amounts, partial/overpayment reasons and later corrections stay in their original native history.

## Complete export and independent receiving

Prepare `export` with `{"requestId":"ORIGINAL-UUID","expectedRevision":CURRENT_REVISION,"kind":"workspace"}`. A report export instead uses `kind:"report"` and its original `reportId`; `includeApplication:true` retains the application in that report package.

The provider derives the private destination from the host export root, alias and original request UUID. The returned publication UUID identifies the original export, including its native manifest hash. A lost response continues the same export UUID/request; it cannot silently select a newer workspace.

```sh
invoice-settlement-customer inspect-publication --connection bound.json --publication-id ORIGINAL-EXPORT-UUID
invoice-settlement-customer download --connection bound.json --publication-id ORIGINAL-EXPORT-UUID --directory original-download
invoice-settlement-customer verify --directory original-download --publication-id ORIGINAL-EXPORT-UUID
invoice-settlement-customer receive --directory original-download --publication-id ORIGINAL-EXPORT-UUID --destination received-invoice --request-id ORIGINAL-RECEIVING-UUID
```

Download retains every declared original file, the native `manifest.json`, a customer publication manifest and durable per-file checkpoints. It verifies exact lengths/hashes and canonical nested paths. Interrupted prefixes resume through the maintained retained writer. File leases close when complete or when the client disconnects.

Verification and receiving use no endpoint or credential. The unchanged native receiver verifies application/source/runtime coverage and original workspace history, then records receiving in an independent directory. It pauses inherited active captures/deliveries according to the native receiving contract. The returned result names the received application's CLI and continuing workspace. Open it with:

```sh
node received-invoice/application/source/stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/cli.mjs serve --workspace received-invoice/workspace
```

Use the printed private loopback URL. Keep the original source connections separate; reconnect them only through the original operator configuration and selected native runtime identities.

## Installed JavaScript exports

`@tokenjunkielabs/starforge-merchant/merchant/invoice-settlement/client`,
`@tokenjunkielabs/starforge-merchant/merchant/invoice-settlement/operations`, and
`@tokenjunkielabs/starforge-merchant/merchant/invoice-settlement/download` expose the same functions as the CLI with TypeScript declarations. The actual package name is the one printed by the maintained distribution installation; use that installed name if your selected product overrides it.

A client disconnect drains its in-flight requests and retained reads. It does not stop the saved workspace. Host shutdown owns the operator lifecycle; the explicit `close` tool additionally requires the currently observed instance UUID.

### Original file modes during offline receiving

Downloads remain private files. The receiver creates a separate private `<destination>.invoice-source-<requestId>/` directory, retains the exact original request and manifests, and copies every verified member there before restoring its declared native mode. The original runtime executable and data modes therefore survive without changing the download checkpoint. Keep this source directory with the received workspace for interrupted receiving and offline reopening; a completed source is fully verified before reuse.

## Complete installed receiving programme

The source includes `examples/run-invoice-settlement-customer-receiving.mjs`. Select one private receiving root with the complete committed repository at `source/` beneath it. Run its original programme with the existing Node and Python installations:

```sh
node --max-old-space-size=192 /absolute/customer-receiving/source/stellar-forge/mcp-merchant-operator/examples/run-invoice-settlement-customer-receiving.mjs /absolute/customer-receiving
```

This whole journey builds the selected distribution, installs it through the native runtime installer, opens the authenticated MCP provider, operates an authored loopback Horizon case, retains interrupted original responses, exports and downloads every member, closes the services, then receives and reopens the native workspace offline. Original phase results, request/response records, installed source and complete delivery files stay under that receiving root. Continue with the same root after an interruption; completed native requests retain their original UUIDs and immutable inputs.

The published source has received complete custody and API review. The initial two complete execution admissions (2677 and2694) ended before process creation with `environment_offline409`; neither transmitted source input nor ran a native phase. The eighteen-phase installed result remains pending an available executor. This status is separate from the earlier operated seventeen-phase native Horizon feature.
