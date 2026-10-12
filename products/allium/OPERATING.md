# Allium data workspace

The Allium product connects the original Explorer query runner and retained data workspace to managed Applications, a typed Node client and 29 merchant tools. The browser and tools share the same server, workspace ID and exclusive source writer. Saved product revisions, acquisitions, dataset snapshots, merchant terms, publisher candidates and buyer configurations remain in the original workspace.

| Product entry | Purpose |
| --- | --- |
| Source selection allium-data-workspace | Selected distribution with Applications, merchant host, native dataset seller, buyer and publisher dependencies |
| starforge allium-explorer | Original approved query compilation, provider run and retained result commands |
| starforge allium-workspace | Original create, serve, status, complete export and import commands |
| starforge allium-managed | Managed original listener with a private connection record |
| Applications → Allium data workspace | Review, save, start, open, stop and reopen that managed application |
| starforge merchant-providers inspect allium-workspaces | Source-owned provider metadata and initialization |
| merchant_allium_* | 29 typed tools over the original workspace and complete customer files |

## Build and install the selected source

Use the full commit that contains this integration from the maintained repository:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_40_CHARACTER_COMMIT \
  --selection allium-data-workspace \
  --out /absolute/private/allium-build
~~~

The builder retains the selected source, declarations, browser routes, package exports and dependency closure in its manifest. Continue an interrupted build with the same output and --resume; --status inspects that original operation.

Install the produced archive using its actual manifest SHA-256:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/private/allium-runtime \
  --archive /absolute/private/allium-build/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/private/allium-runtime
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/private/allium-runtime --load
~~~

The installer records the available Node and Python tools. The original product uses Node 22.16 or later. Run the following starforge commands through the installed package binary or the existing runtime run command. The general build and installation references are retained in distribution/BUILDING.md and distribution/RUNTIME_INSTALL.md.

## Create or receive the original workspace

Keep the workspace, MCP host and customer exports in separate private directories. Existing approved Allium product declarations remain authoritative for query ID, parameters, response contract and credential environment name. The original compiler accepts up to 32 typed fields, 250,000 rows and a 1 MiB provider result, with explicit lower per-product limits.

Create an original workspace:

~~~sh
starforge allium-workspace create \
  --workspace /absolute/private/allium-operator \
  --product /absolute/private/approved-allium-product.json \
  --name "Allium data operations"
~~~

Or receive a complete original workspace export:

~~~sh
starforge allium-workspace import \
  --workspace /absolute/private/allium-customer \
  --bundle /absolute/private/complete-allium-workspace.json
~~~

The native importer checks every file's size, hash, base64 content and the complete manifest, restores the original workspace ID and history, and rebinds its publisher to the new directory. It creates a new destination. Merchant and publisher services start stopped.

## Open it from Applications

Attach the selected READY runtime to the existing runtime workspace, if necessary:

~~~sh
starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-workspace \
  --runtime /absolute/private/allium-runtime \
  --label "Allium data operations"
~~~

In **Applications**, choose **Allium data workspace** and the existing private Allium workspace directory. Choose port 0 for an available local port. For live provider access, select the existing private environment JSON containing the credential environment name used by the approved product. Review and save the application, start it and open its original operator link.

The review retains the directory identity and stable original workspace ID. The workspace's mutable state remains editable between starts. The managed command publishes allium.connection.json privately inside that directory. Its source-owned startup observer authenticates the same listener before attaching the browser link to the saved application operation.

**Stop** retires that exact connection while the source writer is still held, drains the original server requests, merchant and publisher, and releases the original lease. Reopening the same application preserves workspace identity and obtains a new instance ID and private URL.

For a direct managed launch:

~~~sh
starforge allium-managed \
  --workspace /absolute/private/allium-operator --port 0
~~~

The original allium-workspace serve remains available. Typed attachments use the managed launch's private connection file.

## Configure the merchant tools

Create a private JSON file, for example /absolute/private/allium-host.json:

~~~json
{
  "schema": "stellar-forge.allium-workspace-connection.v1",
  "workspaces": {
    "data": {
      "label": "Allium data operations",
      "directory": "/absolute/private/allium-operator",
      "workspaceId": "ACTUAL_ORIGINAL_ALLIUM_WORKSPACE_ID",
      "inputs": {
        "approved-product": {
          "kind": "product",
          "file": "/absolute/private/approved-allium-product.json",
          "sha256": "ACTUAL_64_CHARACTER_SHA256"
        },
        "retained-result": {
          "kind": "result",
          "file": "/absolute/private/original-provider-result.json",
          "sha256": "ACTUAL_64_CHARACTER_SHA256"
        },
        "customer-workspace": {
          "kind": "bundle",
          "file": "/absolute/private/complete-allium-workspace.json",
          "sha256": "ACTUAL_64_CHARACTER_SHA256"
        }
      },
      "launches": {
        "local-review": {
          "label": "Original challenge-only merchant",
          "port": 0,
          "facilitator": null
        }
      },
      "destinations": {
        "customer": {
          "label": "Customer receiving",
          "directory": "/absolute/private/allium-customer"
        }
      }
    }
  }
}
~~~

Replace identity placeholders with the actual source ID and complete file digests. Omit unused inputs and destinations. The optional workspaceId explicitly binds the host alias; every connection authenticates the current instance. Use owner-private files and directories. A changed input requires updating its declared SHA before choosing it in a following operation.

A merchants profile contains the original origin, path, payment object and optional native settings: retentionMs, maxVersions and maxRetainedBytes. Copy reviewed terms from the original merchant configuration. A launches profile selects the local port and original facilitator URL, with allowLocalFacilitator for an explicitly selected local facilitator. The source engine validates the product and merchant terms during the original action.

Create the private initializer options file /absolute/private/allium-merchant-setup.json:

~~~json
{
  "directory": "/absolute/private/allium-mcp",
  "connection": "/absolute/private/allium-host.json",
  "name": "Allium data operations"
}
~~~

Initialize and start the existing merchant host:

~~~sh
starforge merchant-providers inspect allium-workspaces
starforge merchant-providers init allium-workspaces \
  --options /absolute/private/allium-merchant-setup.json
starforge merchant-mcp-stdio \
  --config /absolute/private/allium-mcp/merchant-mcp.json
~~~

This prepares the original release store, private customer exports and merchant-mcp.json. Start the ordinary merchant MCP stdio or HTTP host with that configuration using the existing merchant host guide. The alliumWorkspaceConnection configuration input selects this provider. Configuration loading preserves current source and merchant service state.

## Complete operating workflow

1. Call merchant_allium_status, then merchant_allium_connect with the declared workspace alias. Keep the returned workspaceId, instanceId, native revision, product head, acquisition IDs and current merchant configuration ID.
2. Inspect the original product with merchant_allium_revision. Save a reviewed declared product file with merchant_allium_save_product, its SHA, the current expectedHead and a retained operationId. Restore an earlier product with merchant_allium_restore_product.
3. Import complete declared result bytes with merchant_allium_import_result, the SHA, selected product revision and operation ID. For live acquisition, use merchant_allium_start_query. Follow the actual retained acquisition through acquisition, resume_query, collect_query or recover_query with its original provider run ID.
4. Preview the retained dataset with merchant_allium_query. Use original query parameter names and values. Decimal strings remain native source values. merchant_allium_download retains the original result, source declaration, CSV, dataset declaration or provider run file.
5. Configure the merchant with merchant_allium_configure using a host-reviewed profile, acquisition ID, exact prior configuration ID (or null) and operation ID. Start that configuration with merchant_allium_merchant_start and a reviewed launch profile.
6. Use merchant_allium_refresh or merchant_allium_activate with the original snapshot and version revision. Open the original publisher with merchant_allium_publisher and stage the exact acquisition with merchant_allium_stage_publisher. Its browser retains the full candidate, buyer configuration and native review workflow.
7. Call merchant_allium_export with a retained operation ID and current workspace expectedRevision. The native engine checks that revision atomically, stops its merchant and publisher, and exports every original portable file. The managed listener remains available for further work.
8. Read complete files with merchant_allium_file. Follow readId, expectedSha256 and nextOffset until nextOffset is null. The reader closes its descriptor at EOF. A later process reopens the same retained file and SHA at the saved offset. merchant_allium_exports pages saved file metadata.
9. Deliver the complete workspace file and actual SHA. Declare that file as a bundle input on the receiving host, then call merchant_allium_receive with its SHA and declared destination. merchant_allium_received reads its original import history. Repeating a matching completed receive returns the same destination and native import identity.
10. Open the received original workspace in Applications. The customer continues from its original revisions, acquisitions, snapshots, candidates and buyer configurations. Original Node and Python buyer commands remain in this selection for the existing merchant purchase workflow.

Status pages each native collection with its own total and next offset. Repeat expectedRevision when paging a connected state so changed workspaces cannot mix source editions. Complete exported files retain the whole history independently of the status page size.

## Continuation and ownership

The original model supplies operation replay for product saves, restores, imports, provider acquisition setup, merchant configuration and publisher staging. Retain the exact input and operation ID before each action. After an interrupted provider request, inspect its original acquisition and recover its actual provider run.

A completed export operation reopens the exact customer file after reconnect or MCP restart. If transport stopped before export bytes were retained, inspect the original workspace and export its current revision with a new operation ID. Export includes the native merchant/publisher stop operation.

The private managed connection file contains the current operator token and is excluded explicitly from portable export. The original portable mapping still validates every retained customer data file. Instance changes require reconnecting before following mutations.

MCP disconnect and shutdown close the attachment and its file readers. Applications owns the original process, writer lease and service drain. Source file inputs and approved profiles are local configuration. Commercial correspondence continues in the existing Allium partner case.

## Typed Node client

~~~js
import {AlliumWorkspaceClient}
  from '@tokenjunkielabs/starforge-merchant/seller/allium/workspace/connection';

const client = await AlliumWorkspaceClient.connect(
  '/absolute/private/allium-operator/allium.connection.json'
);
try {
  const state = await client.state();
  const product = await client.revision(state.head);
  const acquisition = state.acquisitions.find(item => item.status === 'STAGED');
  if (acquisition) {
    const preview = await client.query({acquisitionId: acquisition.id, query: ''});
    const original = await client.download({acquisitionId: acquisition.id, kind: 'csv'});
    // Retain original.bytes together with original.sha256.
  }
} finally {
  await client.close();
}
~~~

The typed client returns full original responses. Native mutation methods return result and state. Transport bounds response bodies, rejects redirects, authenticates the actual Allium token header and instance, and checks the private connection identity before dispatch. Each logical native action is sent once.

Additional typed exports are seller/allium/workspace/managed and seller/allium/workspace/mcp. Original seller/allium, seller/allium/workspace and seller/allium/workspace/server exports continue to expose the source engine.

## Original source references

- partners/allium-explorer-pilot/README.md
- partners/allium-explorer-pilot/workspace/OPERATING.md
- sf30-seller-sdk/dataset-refresh/
- distribution/runtime-workspace/APPLICATIONS.md
- stellar-forge/mcp-merchant-operator/README.md

The original workshare and retained operator history are coordinated in the existing Allium partner thread. Imported and exported customer inputs keep their original provenance and product contract.
