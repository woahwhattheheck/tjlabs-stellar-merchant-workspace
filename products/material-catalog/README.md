# TokenJunkieLabs Material Catalog Workspace

Turn supplier product files into a searchable, reviewed material catalog and a customer handover. The workspace retains the original source bytes, maps their fields, compares complete editions, records customer material decisions, and prepares an OpenSearch service with the original Stellar merchant runtime.

The operator workspace includes source upload and portable receiving, material browsing and facets, exact quantity conversion, saved query drafts, relevance comparison, merchant preparation, release controls, and a generated customer client. The same saved workspace is available through the original batch commands.

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
| `starforge opensearch-catalog` | Read, import, export and operate the retained catalog |
| `starforge opensearch-prepare` | Prepare the selected merchant and customer client |
| `starforge opensearch` | Preflight or run the prepared merchant |

The dedicated source entry `node products/material-catalog/cli.mjs` forwards these commands and their arguments unchanged. It also provides `doctor`, `source` and `registrations`. Original command processes retain their shutdown and exit behavior.

Read the [customer operating instructions](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/material-catalog/OPERATING.md) for complete edition review, customer decisions, exports, receiving and batch operations. The [native catalog guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/GUIDE.md) documents every mapping form and API.

## Source and licenses

TokenJunkieLabs maintains this product. Native catalog, OpenSearch and merchant source is retained from its recorded source commit with original relative imports and runtime inputs. The selected product source inventory identifies each original file. The SAP SHINE examples retain their Apache-2.0 license and source index; the WANDS query example retains its original MIT license. Their original publisher records are included beside the files.
