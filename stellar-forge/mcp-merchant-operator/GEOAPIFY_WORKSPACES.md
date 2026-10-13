# Geoapify workspaces in the merchant operator

The Geoapify provider connects the original private address workspace to the existing merchant MCP. A customer can retain original CSV/JSON rows, submit explicit generic-batch geocoding jobs, inspect all returned candidates, choose coordinates, and deliver frozen native datasets through the original publisher and buyer workflows.

The agent tools and browser borrow the same operator and writer lease. Closing the browser keeps the agent workspace open. Closing the agent workspace drains accepted work and closes its browser and retained downloads. The provider key comes from the host-selected environment, using `GEOAPIFY_API_KEY` by default.

## Install and configure

The distribution contribution is `stellar/scf-starforge-20261009/distribution/contributions/merchant-provider-geoapify-workspaces.json`. The maintained distribution builder discovers its provider metadata and includes the original operator dependencies. It does not require a new central dispatch branch.

Use the original product's installation and receiving guide for the checkout or installed distribution. The provider registry exposes:

```sh
merchant-providers inspect geoapify-workspaces
merchant-providers init geoapify-workspaces --options /absolute/private/geoapify-setup.json
```

On a source checkout the same commands are available through `node stellar-forge/mcp-merchant-operator/provider-cli.mjs`.

The setup JSON selects a **new** merchant directory and an existing private connection file:

```json
{
  "directory": "/absolute/private/geoapify-merchant",
  "connection": "/absolute/private/geoapify-connection.json",
  "name": "Address review and customer datasets"
}
```

The initializer validates the connection, creates the existing release store and customer export directory, writes the private merchant configuration, and reads that configuration through the original provider registry. Existing paths are preserved. Workspace and buyer directories must already exist and be private (0700 on Unix). The connection file must be owned by the current user and private (0600 on Unix).

A complete connection example:

```json
{
  "schema": "stellar-forge.geoapify-workspace-connection.v1",
  "workspaces": {
    "addresses": {
      "label": "Customer address source",
      "directory": "/absolute/private/address-workspace",
      "apiKeyEnv": "GEOAPIFY_API_KEY",
      "timeoutMs": 120000,
      "imports": {
        "original": {
          "label": "Original customer CSV",
          "kind": "intake",
          "file": "/absolute/private/customer-addresses.csv",
          "format": "csv",
          "name": "Customer addresses",
          "provenance": "Customer-authorized original address records",
          "mapping": {
            "text": "address",
            "identity": "customer_id",
            "latitude": "latitude",
            "longitude": "longitude"
          }
        },
        "returned": {
          "label": "Complete retained provider response",
          "kind": "response",
          "file": "/absolute/private/geoapify-response.json",
          "status": 200
        },
        "backup": {
          "label": "Original workspace backup",
          "kind": "package",
          "file": "/absolute/private/starforge-geoapify.json.gz"
        }
      },
      "merchants": {},
      "buyerWorkspaces": {},
      "runtime": {
        "port": 0
      }
    }
  }
}
```

Declare only imports whose original files currently exist. Add a response or package alias when that original file is available. MCP arguments select these aliases; they never choose arbitrary host paths. For structured addresses use `housenumber`, `street`, `postcode`, `city`, `state`, `country` and optional `name` mappings instead of `text`. Latitude and longitude mappings are paired. JSON mappings support explicit nested field paths.

Optional `facilitators` uses the original `stellar-forge.seller-facilitators.v1` schema with named `providers`. Each profile declares its credential-free HTTPS `url`, optional label and 1000–30000ms timeout; explicit loopback profiles can use `allowLocalFacilitator:true`. The native SF82 normalizer validates this configuration before the operator opens. Publisher actions `publisher.facilitators.history`, `inspect`, `review` and `stage` reuse the original retained review and release lifecycle. Exact facilitator review/response files are available through the retained file tool.

Optional merchant profiles retain the original public `origin`, endpoint `path`, and SF30 `payment` configuration. Optional buyer workspaces select their original private directories. The provider passes these declared values to the existing seller compiler and publisher, preserving their validation and financial behavior.

## Operate the complete source

1. Call `merchant_geoapify_status` to see declared aliases, then `merchant_geoapify_open` with `{"workspace":"addresses"}`. Save the returned instance ID for closing.
2. Import the original source with `merchant_geoapify_intake`, its declared `sourceImport`, and current `expectedRevision`. Review the returned counts and inspect exact rows with `merchant_geoapify_source`.
3. Use `merchant_geoapify_provider` with action `prepare` and a payload containing current `expectedRevision`, `maximumInputs`, and explicit options. Prepared requests select at most 1000 distinct source-query IDs and retain every original row associated with those queries.
4. Inspect action `request` with the returned job ID. The response includes the exact endpoint, common options, paged input IDs and saved request SHA. Download its full original JSON with `merchant_geoapify_file`, kind `provider-request`.
5. Submit action `run` using that job ID, exact `expectedRequestSha256` and current revision. The native operator records the dispatch before contacting Geoapify. An immediate result or a returned asynchronous job remains attached to this original request.
6. For a pending job, use action `poll` only after its returned `nextPollAt`. The native floor is 60 seconds and respects a later Retry-After. Submission and polling each consume provider quota. An uncertain POST remains available for reconciliation; opening a workspace never resubmits it.
7. Inspect candidates through `merchant_geoapify_review` actions `list` and `query`. The query response pages original rows and source-coordinate comparisons. Record each accepted candidate with the original response SHA, reviewer and reason, or choose `keep-source`.
8. Build a dataset using `merchant_geoapify_edition`, action `build`. Choose `all-source` or `reviewed-only`, a dataset name, and any original scalar fields to carry into native columns. Query the selected edition with `merchant_geoapify_query`, then export it with `merchant_geoapify_export`.

A prepare payload:

```json
{
  "workspace": "addresses",
  "action": "prepare",
  "payload": {
    "expectedRevision": 1,
    "maximumInputs": 500,
    "options": {
      "priority": 0.5,
      "limit": 5,
      "lang": "en",
      "filter": "countrycode:us",
      "bias": "countrycode:none"
    }
  }
}
```

Replace the revision with the one returned by the current workspace. Country filtering is a deliberate source-specific choice. The default bias avoids IP-dependent country prioritization. Prepared options remain part of the retained exact request.

A decision uses `action:"decide"` and a payload with `expectedRevision`, `queryId`, `action:"accept"`, `candidateId`, `expectedResponseSha256`, `reviewer`, `note`, and a coordinate choice. `preserve-source` keeps original coordinates; `fill-missing` fills absent original pairs; `use-provider` selects the reviewed provider pair. Confidence and match type are visible evidence for the reviewer. They do not automatically create a decision.

To reconcile an actual downloaded provider result, declare it as a response import and use provider action `import` with `sourceImport`, original job ID, request SHA and current revision. The native parser binds returned input IDs and job ID to the saved request. To stop pursuing an original job, action `abandon` requires a reviewer and reason and retains its request, attempts and provider ID.

## Saved forms, pagination and exact downloads

`merchant_geoapify_editor` reads or saves the same unfinished forms used by the browser. Save requires the current revision and retains raw input; it does not execute the form. Complete workspace exports include this working state.

Status pages jobs, editions and exports. Each displayed job includes an initial event page; provider action `request` accepts `eventOffset`/`eventLimit` to inspect the rest. Source and review operations accept their explicit offsets. A review list includes initial source-coordinate pages; action `query` accepts `sourceOffset`/`sourceLimit` for the remaining linked records. Full originals remain in the exported package.

For a selected export file, use `merchant_geoapify_file` with kind `source-export`, export ID and the filename returned by the native export. Continue chunks using the returned `readId`, `expectedSha256` and next offset. The maintained retained-file owner snapshots exact bytes and releases the cached read at EOF. Use `merchant_geoapify_file_release` for an unfinished read.

The full `starforge-geoapify.json.gz` package can be exported before a dataset edition exists. It retains original source, requests, response history, candidate decisions, unfinished forms and all retained editions. Restore it into an empty workspace with a declared package alias. Geoapify retains completed provider jobs for 24 hours, so keep actual returned results in the original workspace.

## Publish and deliver through the original merchant

Configure a declared merchant profile, export a selected dataset, then use `merchant_geoapify_publisher` with `publisher.prepare` and that `exportId`. The adapter resolves the native export directory internally. Continue the original preview, draft review, publish, release and buyer actions using their existing IDs and generations.

Release staging receives only the host-declared runtime. Buyer-session creation selects a declared `buyerWorkspace`; the original buyer ledger, limits, quote review, payment and page-attempt records remain authoritative. Original draft/review/buyer/session downloads use the same retained chunk tool.

Open `merchant_geoapify_browser` on the current operator to work through the industrial browser. The returned local URL belongs to that process. The browser and MCP share the original workspace; use the current revision after either saves.

## Receiving and observed product behavior

Follow the repository's current AGENTS.md and original native/browser receiving operation. Open and operate the exact outgoing customer version, inspect its rendered desktop and narrow layouts, open its complete reports, and download/reopen its actual files. Repair visible or interaction defects in the product source. Preserve the existing equipped receiver and continue source implementation while it runs.

Run focused native verification through that original host. Preserve the repository's disabled hosted Actions policy. This provider introduces metadata, a private initializer, and source-specific adapters; it uses the existing dataset, publisher, retained-file and financial implementations.

Provider contracts: [generic batch API](https://apidocs.geoapify.com/docs/batch/), [OpenAPI](https://apidocs.geoapify.com/assets/openapi/specs/batch/batch-api-openapi-specs.json), [geocoding options](https://apidocs.geoapify.com/docs/geocoding/).
