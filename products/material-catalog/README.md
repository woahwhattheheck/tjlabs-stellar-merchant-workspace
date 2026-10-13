# TokenJunkieLabs Material Catalog Workspace

Turn supplier product files into a reviewed material catalog, recipient delivery and complete customer handover. The workspace retains original source files, maps their fields, compares whole editions, records customer decisions and supplier corrections, and produces BMEcat, native ETIM xChange and 2BA upload packages. The same selected catalog can become an OpenSearch service through the original Stellar merchant runtime.

The industrial browser workspace brings source intake, material browsing and facets, exact quantity conversion, supplier review, recipient effects and delivery files together. Saved query drafts, relevance comparison, merchant preparation, release controls and the generated customer client continue from that workspace. The batch commands and typed MCP client use the same saved editions, corrections and customer history.

## Open from this source repository

Use Node.js 22.16 or newer. Node.js 24 is supported. Catalog storage uses Node's built-in SQLite; the local catalog and source-file operations need no OpenSearch driver package.

From the repository root, install the original schema helper's pinned dependency, then create a private working directory outside this source tree:

```sh
npm install --prefix stellar-forge/payment-auto-catalog --ignore-scripts
mkdir -m 700 ../my-materials
cp stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/examples/source.json ../my-materials/source.json
cp stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/examples/merchant-plan.json ../my-materials/merchant-plan.json

node products/material-catalog/cli.mjs opensearch-workspace \
  --source ../my-materials/source.json \
  --plan ../my-materials/merchant-plan.json \
  --workspace ../my-materials/workspace \
  --port 8447
```

Open the printed local URL and choose **Material catalogs**. Select **New catalog**, retain a supplier file, map its material identifier and other fields, then preview and select the reviewed edition. The included SAP product CSVs and mapping are under `stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/examples/material-catalog/`.

The source declaration names the environment variables used by native OpenSearch requests. Set your selected endpoint and credentials when continuing to source inspection, query capture or the running search merchant. The merchant plan contains the original editable example terms; enter your actual public origin, asset, receiving account and price before native merchant use.

## Installed commands

A release installs the same native command family. The dedicated `starforge-materials` executable accepts these same command names; for example, `starforge-materials opensearch-catalog catalog-state --source SOURCE --workspace DIRECTORY`:

| Command | Customer operation |
| --- | --- |
| `starforge opensearch-workspace` | Open the browser operator workspace |
| `starforge opensearch-catalog` | Read, import and operate retained materials, supplier corrections and recipient files |
| `starforge opensearch-materials-client` | Operate the configured material/supplier MCP workspace and download complete resumable exports |
| `starforge opensearch-prepare` | Prepare the selected merchant and customer client |
| `starforge opensearch` | Preflight or run the prepared merchant |

The dedicated source entry `node products/material-catalog/cli.mjs` forwards these commands and their arguments unchanged. It also provides `doctor`, `source` and `registrations`. Original command processes retain their shutdown and exit behavior.

Read the [customer operating instructions](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/material-catalog/OPERATING.md) for complete edition review, customer decisions, exports, receiving and batch operations. The [native catalog guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/GUIDE.md) documents every mapping form and API.

## Supplier delivery

Choose **Supplier delivery** for a selected material catalog and edition. The source profile determines the recipient workflow:

| Profile | Operating flow and delivery |
| --- | --- |
| Sonepar / ETIM BMEcat 5.0 | Map supplier fields, resolve product findings and deliver the reviewed BMEcat XML |
| ETIM xChange 2.0 | Retain complete source headers and product context, review native FULL or CHANGE effects, and deliver original numeric values in xChange JSON |
| 2BA xChange 2.0 | Review the selected 2BA processing parameters and recipient effects, then create the complete ZIP with its native JSON and `parameters.xml` |

Every submission records its catalog edition, complete recipient profile, reasoned corrections and immutable review. The complete catalog bundle carries those histories with the original source files into the receiving workspace. A later customer decision remains intact when an earlier completed handover is received again.

The [customer operating instructions](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/material-catalog/OPERATING.md) cover the browser and installed commands. The [material MCP guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/mcp-merchant-operator/OPENSEARCH_MATERIALS.md) documents host configuration, typed requests, full exports and download continuation. The [2BA guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/supplier/xchange/2BA_UPLOAD.md) explains processing choices and the recipient upload package.

## Select the material product at installation

The maintained `material-catalog` source recipe packages this workflow with its original merchant, buyer and runtime commands. It includes the selected schema and MCP dependency declarations, browser assets, publisher examples and receiving code. Build from the desired commit:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref COMMIT --selection material-catalog \
  --out ../material-catalog-package
```

Use the returned archive and SHA-256 with the original runtime installer. The [material installation guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/selections/MATERIAL_CATALOG.md) follows source selection, installation, private browser/MCP startup and complete customer receiving. The full Merchant Workspace package also exposes this command family through `starforge-materials`.


## Open a complete handover without a server

Use the [offline catalogue recipient](./recipient/README.md) when a customer needs to inspect a complete material handover directly in a browser. [Material_Catalog_Reader.html](./recipient/Material_Catalog_Reader.html) is the complete built reader; save the file, open it and choose the original catalog-bundle.jsonl. It includes all retained editions, full changes, customer-decision history, supplier records and exact source downloads.

To deliver one HTML containing the original bundle, build it into a new private file:

```sh
node products/material-catalog/recipient/build.mjs \
  --bundle /private/materials/handover/catalog-bundle.jsonl \
  --output /private/materials/handover/Material_Catalog_Complete.html
```

The reader keeps the original bundle and every contained record. Continue editable work with the original browser/CLI/MCP importer described above. The selected material-catalog distribution includes the complete reader source, ready-built blank HTML and receiving course.

## Source and licenses

TokenJunkieLabs maintains this product. Native catalog, OpenSearch and merchant source is retained from its recorded source commit with original relative imports and runtime inputs. The selected product source inventory identifies each original file. The SAP SHINE examples retain their Apache-2.0 license and source index; the WANDS query example retains its original MIT license. Their original publisher records are included beside the files. The ETIM schema, sample data and original license notices remain with the xChange source. The original 2BA parameter XML and ZIP retain their publisher bytes and acquisition record.
