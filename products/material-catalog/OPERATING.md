# Material catalog customer operations

This guide follows one retained workspace from supplier intake through a reviewed catalog, customer matching, search service preparation and receiving. Use the same source declaration and private workspace when reopening existing work.

## Start and reopen

Run the source checkout command shown in the product README, or use the installed command:

```sh
starforge opensearch-workspace \
  --source /private/materials/source.json \
  --plan /private/materials/merchant-plan.json \
  --workspace /private/materials/workspace \
  --port 8447
```

The server prints its local address. It opens the existing SQLite workspace and uses its original session and operation journal. Reopening with a different connection profile requires a separate workspace. Store the source declaration, merchant plan and workspace directory together as the selected operating configuration.

To use native OpenSearch capture, set the environment variables named in your declaration. The supplied declaration uses `OPENSEARCH_ENDPOINT`, `OPENSEARCH_USER` and `OPENSEARCH_PASSWORD`. Enter the endpoint and credentials in the operator's environment. Catalog file intake, mapping, edition review and saved matching use the local retained source.

## 1. Retain supplier files and map the material

Choose **Material catalogs → New catalog**, enter a title and tenant identifier, then save the mapping. A catalog keeps that tenant identity across its revisions.

Upload the original CSV, TSV, JSON Lines or JSON document. Select its format, header/column behavior and original publisher or revision. For a JSON document, select the JSON Pointer to its row array. Browser upload computes SHA-256 from bounded file slices before streaming the same selected file. The batch command streams a regular file from its original descriptor.

The material identifier is required. Map the available title, description, part number, manufacturer, category, base unit, sales unit and conversion numerator/denominator. Put supplier account identifiers, prices, currencies and dimensions in named attributes. Keep leading zeros in original identifiers and original decimal strings in source fields.

The field editor supports original header names, JSON Pointers, explicit constants with a reason, text joins, and lookups into another retained source. For dictionary joins, select the exact key columns and any original language or client discriminator. Unit aliases rename an explicitly selected unit; the declared conversion ratio supplies its quantity relationship.

### Included SAP example

Retain `sap-shine-sps11.csv` and select **Map SAP product columns**. The included mapping uses `PRODUCTID`, `NAME`, `DESCRIPTION`, `CATEGORY` and `QUANTITYUNIT`, and preserves `SUPPLIER.PARTNERID` as an attribute. That period belongs to the original column name.

The first and second included releases each contain all 106 published products. Their supplier attribute changes for all 106 products while the material IDs and other selected product fields remain the same. The complete source index and both original licenses are beside the examples.

## 2. Review and select an edition

In **Edition review**, select a retained source and its interpretation:

- **Full catalog replacement** makes that file the complete material set. Choose the prior edition as a comparison base to inspect additions, removals, changes and unchanged rows.
- **Declared upserts and deletes** applies the explicitly mapped operation field to the selected base edition.

Preview the edition, then inspect its counts, original field changes and missing units. Browse the resulting materials before selecting it. Selection names the exact edition and review identity at the expected catalog revision.

For the included example, preview and select the first SAP release. Retain the second release, preview it against the first, and inspect all supplier-only changes. Select the second when the review is complete. A previous retained edition can be selected later as an explicit rollback.

## 3. Review customer material requests

Open **Customer matching**, enter the original customer identifier and description, and search the selected catalog. Category, manufacturer and unit facets come from that exact selected edition. Inspect the candidate's material identifier, original attributes and references.

Record **Approve** or **Reject**, with the operational note you want retained. A decision binds the customer context, catalog revision, selected material and material checksum. Reopen the same context to amend its original decision revision. When the selected material changes, the decision displays **Needs review** and retains the prior record.

The quantity panel accepts the original decimal quantity and selected unit. It returns the exact rational base quantity and a decimal when the ratio terminates. Use that returned quantity in the customer handover or downstream order system.

## 4. Prepare the OpenSearch service

Export `index.json` for the selected mapping and `bulk.ndjson` for the current catalog. `delta.ndjson` carries the actual reviewed changes. Apply the selected files through your existing OpenSearch index-management process.

Choose **Create native search draft** with the intended index and either the baseline or identifier-oriented variant. This creates an ordinary saved query draft in the same workspace. Continue in the existing query view to review its parameters, fields, limits and payment route.

Use the original capture and relevance views against your configured OpenSearch service. The included WANDS query table preserves all 480 original query records and their original IDs; the source index identifies the complete upstream dataset for an evaluation using its human judgments.

Review the merchant plan's public origin, exact asset, recipient and price, then prepare the saved draft. Preparation retains the source and seller declarations, OpenAPI, documentation and generated customer client. The original release controls reopen that same prepared package.

The original CLI equivalents accept the selected files and prepared directory:

```sh
starforge opensearch-prepare --help
starforge opensearch --help
starforge doctor --native
```

Install the native runtime packages declared by this selected product before starting a paid merchant. The retained declaration pins `@x402/core`, `@x402/stellar` and `@x402/extensions` to 2.28.0 and records the supported Stellar SDK requirement. The merchant retains the original facilitator and settlement lifecycle.

## 5. Export, receive and continue customer work

Use **Exports and handover** to select the business artifact:

| Format | Contents |
| --- | --- |
| `catalog.csv`, `catalog.jsonl` | The complete selected canonical materials |
| `approved-matches.csv` | The current approved customer material decisions |
| `facets.json` | Facet values and counts from the selected edition |
| `index.json`, `bulk.ndjson`, `delta.ndjson` | OpenSearch index and reviewed document operations |
| `source.json`, `search-client.ts` | The selected search source and client |
| `catalog-bundle.jsonl` | Complete retained catalog histories, raw source contents and customer decisions |

Download a complete bundle for a receiving workspace. In the receiver, choose **Import catalog handover** and select that original file. The receiving operation validates the retained identities and bytes, stages the catalog, and records its request outcome.

Keep the original receiving request when retrying a lost reply. Repeating that exact completed import returns its original outcome and preserves legitimate work added afterward, including revised customer notes. A changed file or different import uses a new explicit request.

The portable catalog bundle covers the retained catalog workflow. Keep the receiver's private connection configuration and prepared merchant deployment in their own original operating paths.

## Batch operations

Every command uses the same original source and workspace flags:

```sh
starforge opensearch-catalog catalog-state \
  --source /private/materials/source.json \
  --workspace /private/materials/workspace
```

Mutations read a request JSON file. Retain its `requestId` and the expected catalog or decision revision. Use the existing request to reopen an uncertain result. The original journal rejects conflicting payloads for that identity.

Export the complete current catalog:

```sh
starforge opensearch-catalog catalog-export \
  --source /private/materials/source.json \
  --workspace /private/materials/workspace \
  --catalog CATALOG_ID \
  --format catalog-bundle.jsonl \
  --output /private/materials/handover/catalog-bundle.jsonl
```

Receive that file with a request such as `{"requestId":"customer-catalog-receive-1"}`:

```sh
starforge opensearch-catalog catalog-import \
  --source /private/receiving/source.json \
  --workspace /private/receiving/workspace \
  --file /private/receiving/catalog-bundle.jsonl \
  --request /private/receiving/receive-request.json
```

Read the existing result with `catalog-operation --request-id customer-catalog-receive-1`. The original command reports the saved operation and closes its workspace. Export with `--output -` to stream the original file body to stdout; its JSON receipt goes to stderr.

Run `starforge opensearch-catalog --help` for all read, upload, mapping, review, selection, decision and quantity options. The native catalog guide in the source tree documents the full request fields and HTTP contract.

## Build and install a pinned source release

The repository carries the maintained distribution builder. Select the actual product commit and a new output directory:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . \
  --ref "$(git rev-parse HEAD)" \
  --out ../stellar-merchant-package
```

The command returns the completed archive path and its source identity. Install that exact archive into your chosen runtime with ordinary npm package installation. The package's README, executable and repository metadata come from the committed product declaration.

For an interrupted build, repeat the same output and source with `--resume`. The maintained operation reuses its original source and completed work. `--out DIRECTORY --status` reopens the retained build state. Building uses the original Git, Node, npm and Python tools and performs no application work or payment.

For an upgrade, retain the same private catalog directory and its original connection profile. Install the selected newer package in a separate runtime location, close the earlier operator, and reopen the existing workspace using the new selected executable.
