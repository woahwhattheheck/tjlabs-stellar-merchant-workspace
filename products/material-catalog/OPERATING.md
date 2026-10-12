# Material catalog customer operations

This guide follows one retained workspace from supplier intake through a reviewed catalog, customer matching, supplier corrections, recipient delivery, search service preparation and complete receiving. Use the same source declaration and private workspace when reopening existing work.

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

Upload the original CSV, TSV, JSON Lines, JSON document or ETIM xChange document. Select its format, header/column behavior and original publisher or revision. For a JSON document, select the JSON Pointer to its row array. For ETIM xChange, choose **ETIM xChange 2.0 document** and **Map ETIM xChange products** so the complete supplier, catalogue and product context travels with the source. Browser upload computes SHA-256 from bounded file slices before streaming the same selected file. The batch command streams a regular file from its original descriptor.

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

## 4. Correct and deliver a supplier submission

Open **Supplier delivery**, select the catalog edition and choose the recipient profile. Save the complete plan before reviewing its products. The plan binds that edition, its field mappings, recipient requirements and any previous delivered review.

For the Sonepar / ETIM BMEcat profile, map the original product fields and configure the actual recipient's languages, countries, parties, classification and unit requirements. Open each reported product, compare its original projection with the current corrected value, and save the complete reasoned correction. Review the saved submission again, then download the reviewed `bmecat.xml`. A complete current catalogue is a `T_NEW_CATALOG` delivery; select the transaction agreed with the recipient.

For **ETIM xChange 2.0**, retain the complete original source context. Review supplier and catalogue headers as whole records. A deliberate header override records its reason. Product corrections use the original product paths; the editor preserves native JSON numbers separately from text identifiers and retains their original decimal spelling. Removing a correction restores the original field and its numeric metadata while preserving other saved corrections.

Choose the actual previous recipient review for a CHANGE message and retain the original reference catalogue version. Supplied CHANGE records are complete records; absent CHANGE records retain their previous state. FULL processes the selected complete catalogue, including missing-product and absent-trade-item effects. Read the **Recipient effects** pages to inspect each original supplier identity and complete before/after product or trade item.

### 2BA processing and upload packages

Choose **2BA · ETIM xChange 2.0** and open **2BA processing and upload package**. Select the intended processing choices and record their reason. These settings cover report routing and language, software/package description, product or trade-item loading, price and attachment handling, explicit mutation processing, original attachment URLs and master GLN conversion.

Save and review the complete plan after changing a processing choice. The review shows both the native message type and effective recipient processing. Inspect skipped records and retained prior subtrees along with the loaded products. Resolve an omitted-attachment choice against the selected previous recipient state before generating the delivery.

Download `parameters.xml`, the native `xchange.json` and `2ba.zip` from the same selected review. The ZIP contains the complete native JSON and the plural `parameters.xml` file. Its XML uses the original downloaded publisher example's case-sensitive `UCProcessParameters` root and `http://www.2ba.nl` namespace. The original publisher XML and ZIP remain beside the code, with their acquisition record and source decisions.

The [2BA processing guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/supplier/xchange/2BA_UPLOAD.md) explains every parameter and the exact attachment/mutation rules. It also documents the original ETIM modelling-class source selection. Use the release required by the selected recipient; each classification or modelling decision remains joined to its acquired source.

Use the recipient's existing 2BA upload account and selected transport for the generated ZIP. Retain its actual processing report against the selected review and delivered file so a later edition can continue from that result.

### Supplier batch commands

The original batch CLI uses the same private source and workspace as the browser:

```sh
starforge opensearch-catalog catalog-supplier-profile \
  --source /private/materials/source.json \
  --workspace /private/materials/workspace --target 2ba-xchange-2.0

starforge opensearch-catalog catalog-supplier-save \
  --source /private/materials/source.json \
  --workspace /private/materials/workspace --request submission.json

starforge opensearch-catalog catalog-supplier-review \
  --source /private/materials/source.json \
  --workspace /private/materials/workspace --request review.json

starforge opensearch-catalog catalog-supplier-export \
  --source /private/materials/source.json \
  --workspace /private/materials/workspace \
  --review REVIEW_ID --review-sha256 REVIEW_SHA256 \
  --format 2ba.zip --output /private/materials/delivery/2ba.zip
```

The submission file contains the complete profile and bindings. The review file supplies the saved plan ID, current revision and original request ID. Use the actual returned review ID and SHA-256 for every export. Read `catalog-supplier-recipient-rows` with the selected review to page through native record effects.

## 5. Prepare the OpenSearch service

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

## 6. Export, receive and continue customer work

Use **Exports and handover** to select the business artifact:

| Format | Contents |
| --- | --- |
| `catalog.csv`, `catalog.jsonl` | The complete selected canonical materials |
| `approved-matches.csv` | The current approved customer material decisions |
| `facets.json` | Facet values and counts from the selected edition |
| `index.json`, `bulk.ndjson`, `delta.ndjson` | OpenSearch index and reviewed document operations |
| `source.json`, `search-client.ts` | The selected search source and client |
| `catalog-bundle.jsonl` | Complete retained catalog and supplier histories, raw source files, customer decisions, corrections, immutable reviews and recipient records |

A supplier review also provides its full review JSON, issues CSV and reviewed product JSONL. Native xChange adds recipient JSONL and impact CSV, followed by the selected xChange JSON; the 2BA profile adds processing XML and the complete upload ZIP. The original BMEcat profile provides its BMEcat XML. Select the formats that belong to that review.

Download a complete bundle for a receiving workspace. In the receiver, choose **Import catalog handover** and select that original file. The receiving operation validates the retained identities and bytes, stages the catalog, and records its request outcome.

Keep the original receiving request when retrying a lost reply. Repeating that exact completed import returns its original outcome and preserves legitimate work added afterward, including revised customer notes. A changed file or different import uses a new explicit request.

The portable catalog bundle covers the retained catalog workflow. Keep the receiver's private connection configuration and prepared merchant deployment in their own original operating paths.

## Material and supplier MCP client

A configured merchant MCP host exposes the same retained material and supplier operations. In its original OpenSearch connection file, add `materialInputs` aliases for the actual complete input files and receiving bundles, using their byte counts and SHA-256 values. The workspace alias selects that private host configuration. The [material MCP guide](../../stellar-forge/mcp-merchant-operator/OPENSEARCH_MATERIALS.md) includes the complete host schema and every typed request field.

Use the maintained material client through either executable:

```sh
starforge opensearch-materials-client tools

starforge opensearch-materials-client open \
  --url MCP_URL --workspace CATALOG_ALIAS

starforge opensearch-materials-client material-list \
  --url MCP_URL --workspace CATALOG_ALIAS \
  --input catalog-list.json --all-pages

starforge opensearch-materials-client supplier-review \
  --url MCP_URL --workspace CATALOG_ALIAS --input review-request.json

starforge opensearch-materials-client download-export \
  --url MCP_URL --workspace CATALOG_ALIAS \
  --export-id ORIGINAL_EXPORT_ID \
  --expected-manifest-sha256 ORIGINAL_MANIFEST_SHA256 \
  --directory /private/materials/received-delivery

starforge opensearch-materials-client close \
  --url MCP_URL --workspace CATALOG_ALIAS
```

`STARFORGE_MCP_URL` can supply the endpoint. The default token environment variable is `MCP_ACCESS_TOKEN`; the existing host owns its token configuration. Input JSON omits `workspace`, which the client binds to the selected alias. `tools` prints the complete supported schemas without connecting.

Read the original operation state before consuming a mutation result. Retain its exact request ID and JSON after a lost reply. Lists and histories have original continuation fields; `--all-pages` follows them through the complete selection. Use direct records or full exports for a complete mapping, source, product or profile.

Export requests select complete files from a catalog edition or immutable supplier review. The returned manifest identifies every filename, byte count and SHA-256. Keep the same download directory and manifest after interruption: the client verifies its saved prefix and continues those original file offsets. A completed export reopens its own files after later source changes.

The installed `./clients/opensearch-material` module and adjacent TypeScript declarations expose the same methods. The browser, source CLI, typed client and recipient handover all operate the same retained model.

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
  --selection material-catalog \
  --out ../stellar-merchant-package
```

The command returns the completed archive path, SHA-256 and source identity for the material-catalog selection. Its original source recipe includes the material/supplier commands, MCP host and client, native merchant and buyer commands, required runtime/browser files, publisher examples and complete receiving source. The package's README, executables and repository metadata come from the committed product declaration.

Prepare the catalog runtime with the maintained installer and the returned archive. Select the `schema` feature for the local catalog, operator workspace and generated schema validation. Add the `mcp` feature when running the merchant MCP host or typed material client. Use a new runtime directory whose parent already exists:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /srv/starforge/runtimes/materials \
  --archive /srv/starforge/releases/RETURNED_ARCHIVE.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 \
  --feature schema

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /srv/starforge/runtimes/materials
```

Preparation retains the exact archive and chooses its declared dependency versions. Installation uses npm's normal registry or the selected cache. The source package and dependencies live inside that private runtime; the catalog workspace remains in its existing state directory.

Launch the installed command against the same saved catalog:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /srv/starforge/runtimes/materials -- \
  opensearch-workspace \
  --source /srv/starforge/config/materials-source.json \
  --plan /srv/starforge/config/materials-plan.json \
  --workspace /srv/starforge/state/materials \
  --port 8447
```

Use absolute configuration and workspace paths when launching through the runtime installer. Its child process runs from the selected runtime directory. Replace `opensearch-workspace` with any catalog command and its arguments for batch operation. A conventional npm installation exposes the executable declared by that selected recipe, including `starforge`. The complete Merchant Workspace distribution also declares `starforge-materials`; from a material-only selected runtime, use `starforge opensearch-materials-client` for the same client.

For paid merchant execution, include `--native` and the required features when preparing a new runtime, then keep the merchant's configured payment terms and endpoint environment with that runtime. Run `runtime-install --help` for the complete installer options.

If an installation is interrupted, use `runtime-install resume --dir DIRECTORY` for its retained operation. Use `runtime-install inspect --dir DIRECTORY --load --source` to inspect that installed source and selected dependencies. The generated runtime runbook names its source and dependency roots.

For an interrupted build, repeat the same output and source with `--resume`. The maintained operation reuses its original source and completed work. `--out DIRECTORY --status` reopens the retained build state. Building uses the original Git, Node, npm and Python tools and performs no application work or payment.

For an upgrade, retain the same private catalog directory and its original connection profile. Install the selected newer package in a separate runtime location, close the earlier operator, and reopen the existing workspace using the new selected executable.
