# Receive and continue an OpenFEMA portfolio installation

Receive the complete product and the original analyst workspace, attach the next operator to its actual UUID, and continue the selected source and customer workflow. The [operating guide](OPERATING.md) covers installation and daily use; this guide follows the files, identities and original operation results through a handover.

## Select the complete handover

| Item | Receiving purpose |
| --- | --- |
| Selected merchant archive and complete SHA-256 | Install the openfema-portfolios source edition and its original contribution |
| Runtime installation record or complete retained runtime transfer | Select the matching source and dependency closure on the receiving host |
| Complete OpenFEMA workspace ZIP and SHA-256 | Restore the original source, analyst, customer and publisher history |
| Complete project-delivery and reconciliation ZIPs | Open the useful programme output and its original customer file independently |
| Original operation IDs and result records | Continue interrupted work and identify what already completed |
| Original customer workorder and host-selected connection inputs | Preserve the actual source scope, receiving analyst and existing service arrangement |

Private session URLs, environment values, keys and host runtime configuration remain with the original host's configuration workflow. The workspace archive and complete customer inputs follow the agreed receiving path for that project.

The adopted component is pinned in [SOURCE_ADOPTION.json](SOURCE_ADOPTION.json). Installation records identify their own actual selected source commit and archive. Keep those identities alongside the workspace UUID, source edition, selected portfolio/version and complete-file hashes; they describe different objects.

## Install and commission the selected runtime

Build or receive the original archive using selection openfema-portfolios, then use the exact archive and SHA with runtime-install prepare/install/inspect as shown in [OPERATING.md](OPERATING.md#1-install-the-maintained-product). The source recipe selects:

- The original openfema contribution, with four operating commands, the Public Assistance application and 41 merchant tools.
- The complete 69-file OpenFEMA component, including the browser's own asset manifest, typed client, full data integration, recorded examples and native receiving sources.
- The shared runtime installation, Applications, merchant, native publisher and buyer components.
- Explicit dataset and publisher helpers used by the original runtime imports.

A READY runtime is the source/dependency selection for the managed application and merchant host. A retained runtime-install attempt is resumed in the same directory. An upgrade or a received runtime uses its own maintained installation record and then opens the existing analyst workspace through Applications.

Inspect registrations from the installed package:

~~~sh
npx --no-install starforge registrations --source openfema
npx --no-install starforge merchant-providers inspect openfema-workspaces
~~~

The application provider is openfema-public-assistance. It selects openfema-workspace, preserves the existing UUID during preparation, and accepts the original OPENFEMA_READY startup after checking the exact directory, source and host inputs. The merchant provider reads the original private connection and uses the running service.

## Restore the original complete workspace

Stop any process that currently owns the intended destination. Restore into a new owned private directory under an existing private parent:

~~~sh
npx --no-install starforge openfema inspect-backup \
  --archive /absolute/private/OpenFEMA_Complete_Workspace.zip

npx --no-install starforge openfema restore \
  --archive /absolute/private/OpenFEMA_Complete_Workspace.zip \
  --workspace /absolute/private/openfema-received

npx --no-install starforge openfema view \
  --workspace /absolute/private/openfema-received
~~~

Inspection reads the archive's complete member inventory and original workspace identity. Restore validates the bytes and prepares the destination with the original restore operation. The same archive and destination can continue that original restoration; a different archive or identity remains a distinct selection.

The resulting workspace preserves its UUID, original source objects, portfolio version hashes, reviews, acceptances, customer files and completed operations. Native publisher paths are relocated through the existing publisher restoration engine. Historical release bytes remain retained, and its returned release mapping identifies the current release bindings on the receiving host.

After the CLI closes, open **Applications → Public Assistance portfolios** and select this actual directory. Use the returned URL and workspace UUID in the private merchant connection. A changed process, port or session is compatible with the same original UUID; a different workspace requires its own explicit host selection.

If the handover includes an existing buyer inbox or merchant runtime, select those original inputs through the host's maintained configuration workflow. Inspect the restored release mapping and actual current generation before operating a publisher.

## Inspect the analyst result before continuing

In the received workspace:

1. Read the selected source edition and its complete dataset metadata, scope and refresh observations.
2. Open the exact selected portfolio version and each of its six tables.
3. Read the retained review and acceptance records, including applicant choices and exclusions.
4. Open Data integration and inspect the original destination mapping, mapping review, customer reconciliation and selected analyst imports.
5. Open the complete project delivery, readable report and customer file.
6. Inspect the existing operation result before continuing any interrupted request.

A complete source edition may have declarations while its funded-project table is empty. The retained source context and customer-only/pre-obligation records remain available. The original DR4935 receiving exercised that state; DR4724 provides the complete populated 195-project example.

The complete DR4724 report and six CSV tables are included under the component's examples/recorded-dr4724 directory. Their manifest binds the exact original output. The complete original source bundle is a separate identified input: 605,029 decoded bytes, SHA-256 580f2b88274a9d74070d03b636840863a11ab3c21270da9d8a63840524b58077. Use the original custodian's complete bundle when operating that saved case.

## Run the original complete merchant project exchange

This command operates a running workspace through its existing merchant attachment. It keeps the full destination schema, original customer CSV, selected analyst decisions, every resulting delivery and the complete workspace archive in one retained receiving directory.

### Declare original file inputs

The host owns the complete mapping JSON and UTF-8 customer CSV. Inspect each with the installed original client:

~~~sh
npx --no-install starforge openfema-mcp input \
  --kind mapping \
  --file /absolute/private/destination-mapping.json \
  --label "Programme destination schema"

npx --no-install starforge openfema-mcp input \
  --kind customer_csv \
  --file /absolute/private/customer-projects.csv \
  --label "Complete programme project register"
~~~

Merge the returned entry objects under deliveryInputs in the selected workspace's private connection. For example:

~~~json
{
  "deliveryInputs": {
    "programme-mapping": {
      "path": "/absolute/private/destination-mapping.json",
      "kind": "mapping",
      "name": "destination-mapping.json",
      "label": "Programme destination schema",
      "sha256": "ACTUAL_COMPLETE_MAPPING_SHA256"
    },
    "programme-register": {
      "path": "/absolute/private/customer-projects.csv",
      "kind": "customer_csv",
      "name": "customer-projects.csv",
      "label": "Complete programme project register",
      "sha256": "ACTUAL_COMPLETE_CSV_SHA256"
    }
  }
}
~~~

Use the full original mapping and CSV. The provider accepts mapping files and customer CSVs up to 16 MiB each, with up to 2 MiB of original schema evidence and up to 250,000 CSV rows. It validates the declared whole-file hash before sending the original file to the workspace. Models select these aliases; private paths stay in host configuration.

Reload the original merchant connection after a host configuration change. The workspace list returns the selected aliases, names, kinds and hashes.

### Preserve one complete exchange plan

Choose the actual original portfolio version, mapping and customer input. Save an original exchange ID and a new private output directory:

~~~sh
npx --no-install starforge runtime-install run \
  --dir /absolute/private/openfema-runtime -- \
  openfema-merchant-exchange \
  --url ACTUAL_MCP_URL \
  --workspace public-assistance \
  --version ACTUAL_ORIGINAL_PORTFOLIO_VERSION \
  --mapping-package programme-mapping \
  --customer-file-package programme-register \
  --operation ORIGINAL_EXCHANGE_OPERATION_ID \
  --reviewer "Receiving analyst" \
  --mapping-note "Reviewed the complete destination specification and source-field conventions." \
  --out /absolute/private/programme-exchange \
  --token-env MCP_ACCESS_TOKEN
~~~

This completes the full exchange with the existing analyst decisions. To apply selected valid CSV analyst proposals as part of the same planned exchange, include --rows with their actual distinct CSV data-row numbers and --review-note with the receiving decision. Row 1 is the header. Inspect the customer's complete input and its original reconciliation when deciding those rows; the native engine validates each proposal against the current portfolio and exported review baseline.

The saved plan binds the original UUID, portfolio version, mapping/customer aliases, reviewer, notes and selected rows. Repeat the exact command and output directory to continue an interrupted action or download. A later review decision or different customer file uses its own new exchange plan.

The programme performs the original sequence:

| Phase | Complete original result |
| --- | --- |
| Mapping and field review | Saved mapping, complete specification and review of the exact mapping SHA |
| Initial delivery | Complete target CSV, mapping, native portfolio and report |
| Customer receiving | Original CSV bytes, all reconciliation rows and source/analyst differences |
| Selected analyst review | New native portfolio version when valid rows were explicitly selected |
| Reviewed delivery | Complete next delivery with the selected original customer base |
| Comparison | Full source, scope, money and analyst differences |
| Workspace handover | Complete native workspace ZIP received into the merchant's original exports |
| Local receiving | All selected original files downloaded and reopened through the maintained downloader |

Its merchant-exchange-result.json links original native IDs, operation results, complete file selections and local receiving directories. The following directories include the useful complete outputs:

- mapping-file: original destination contract.
- initial-delivery-file: complete first project ZIP.
- customer-reconciliation-document and customer-reconciliation-files: every proposed review row and the original customer CSV.
- reviewed-delivery-document and reviewed-delivery-files: complete next programme delivery and selected customer base.
- delivery-comparison-document and delivery-comparison-files: complete comparison and associated original portfolios.
- complete-workspace: OpenFEMA_Complete_Workspace.zip.

The result's workspaceArchive.selection is a stable file selection in the original merchant receiving store. If the native archive action completed while file receiving is still in progress, continue that same saved request until its complete archive is retained. Then use the restore command above.

## Receive complete original files independently

The typed client and CLI inspect an immutable selection, save its manifest, download all original bytes and reopen the completed file set offline.

~~~sh
npx --no-install starforge runtime-install run \
  --dir /absolute/private/openfema-runtime -- \
  openfema-mcp inspect \
  --url ACTUAL_MCP_URL \
  --workspace public-assistance \
  --kind export --id ACTUAL_ORIGINAL_EXPORT_ID \
  --token-env MCP_ACCESS_TOKEN

npx --no-install starforge runtime-install run \
  --dir /absolute/private/openfema-runtime -- \
  openfema-mcp download \
  --url ACTUAL_MCP_URL \
  --workspace public-assistance \
  --kind export --id ACTUAL_ORIGINAL_EXPORT_ID \
  --workspace-id ACTUAL_ORIGINAL_WORKSPACE_UUID \
  --manifest-sha256 ACTUAL_INSPECTED_MANIFEST_SHA256 \
  --out /absolute/private/received-project-export \
  --token-env MCP_ACCESS_TOKEN

npx --no-install starforge openfema-mcp reopen \
  --out /absolute/private/received-project-export \
  --manifest-sha256 ACTUAL_INSPECTED_MANIFEST_SHA256
~~~

Choose kind workspace and the returned stable workspace selection ID to receive the full saved archive. Other original kinds include source, portfolio, receipt, mapping, delivery, reconciliation and delivery-comparison. Use --file with an exact returned member name for one file; omit it to receive every member in the selected manifest.

The existing transfer journal preserves prefix progress, immutable manifest identity and exclusive local ownership. Repeating the same download continues its same directory. The endpoint identity is the workspace UUID, so an ordinary native listener restart can preserve the transfer.

Offline reopen validates the complete file set against its retained manifest. Restoring the native workspace is the separate original restore operation. Both outcomes appear in a complete installation handover.

A direct file_read call returns a held read ID, original filename/content type/bytes/SHA, offset, next offset and base64 bytes. Continue that original handle and release it when finished. A new read after expiry uses the same original file SHA and actual offset. The original reader and downloader enforce the complete 1 GiB transfer budget and bounded chunks.

## Continue original actions and publication

Read the existing native operation by its original ID after an interrupted reply. Each unchanged request retains its original payload and expected revision; the native journal resolves an existing exact operation before applying the current revision check. Inspect an unknown outcome through the same owner before selecting another operation.

A publisher change also uses the actual original generation. A portfolio review uses its original version and record. Customer review imports preserve the source edition and check the current analyst fields against the earlier exported baseline. These original concurrency controls apply equally to browser, CLI and merchant clients.

A completed native buyer result is received through the existing inbox and intent IDs. The product retains all five original SF88/SF100 customer files and the dataset provenance. The original commissioning operation, payment terms and owner remain its operating authority.

## Use the retained native receiving programme with its original case

The component includes examples/native-portfolio-receiving.mjs. It is the complete original DR4724 receiving programme, with original-source hash and case expectations, original HTTP/merchant/CLI operating paths, complete-file continuation, native workspace archive and independent restore/reopen.

When continuing that original programme, use its existing receiving directory and pinned source/input selection:

~~~sh
node /absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/openfema/examples/native-portfolio-receiving.mjs \
  --bundle /absolute/private/OpenFEMA_DR4724_Original_Source.json \
  --directory /absolute/private/original-openfema-receiving \
  --source-ref ORIGINAL_SELECTED_SOURCE_COMMIT
~~~

Its optional --terms-file and --release-runtime select the existing original merchant terms/runtime. Its --inbox and --intent-ids-file select existing completed buyer intents together. Browser receiving uses both --chromium and --playwright with actual installed paths. Read its original native-portfolio-receiving.json first; a completed report returns its retained result, and an interrupted programme preserves its selection and native operation IDs.

The separate testnet-commissioning.mjs belongs to the original SCF-OPENFEMA-PORTFOLIO-3BDA-20261012 operation and carries its historical source pins, purchase selection and host journal. Continue it with that original owner and source cohort. The maintained operator and merchant-exchange command above are the current reusable product interfaces.

The original project-exchange source was delivered in public PR2563 after the native 41-tool/29-action mapped customer-file and complete archive/reopen workflow. The maintained adoption keeps those original production bytes, source/customer decisions and programme identities intact while supplying the selected installation and receiving entrypoints.
