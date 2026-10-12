# SAM.gov opportunity operations — installed product

The `samgov-opportunities` product joins original federal procurement notices, issued documents, qualification and deadline decisions, source comparisons, dataset publication and complete customer receiving. Its managed Application, industrial browser and 30 typed merchant tools use the same saved SAM workspace.

## Entry points

| Work | Entry |
| --- | --- |
| Build a selected installation | **Build a product → SAM.gov opportunity operations**, or `--selection samgov-opportunities` |
| Open the managed browser | **Applications → SAM.gov opportunities** |
| Operate the original source directly | `starforge samgov` |
| Start the managed original listener | `starforge samgov-workspace` |
| Inspect and initialize typed tools | `starforge merchant-providers inspect samgov-workspaces` |
| Start the merchant tool transport | `starforge merchant-mcp-stdio` or the maintained HTTP merchant host |
| Review an opportunity response project | `starforge opportunity` |
| Prepare and operate a notice dataset | The original SAM merchant actions and selected `dataset-refresh`, `merchant`, `releases` and buyer commands |
| Integrate through JavaScript or TypeScript | Twelve paired `./seller/samgov` exports, including `managed`, `connection` and `mcp` |

The [SAM source guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/samgov/README.md) describes the original notice store, capture, review and browser. The [managed Applications and typed receiving guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/samgov/MANAGED_APPLICATIONS.md) gives the complete configuration and tool contracts. The [source contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/samgov/SOURCE-CONTRACT.md) covers GSA requests, original issued files and source representations.

## Build this product from the maintained source

In the existing Runtime workspace, open **Build a product**, select **SAM.gov opportunity operations**, choose the full source commit and review the new owned output directory. Build the selected product and open its returned archive in **Source & profile**.

The source checkout provides the same operation:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --ref ORIGINAL_FULL_COMMIT \
  --selection samgov-opportunities \
  --out /absolute/samgov-release
~~~

Retain the returned archive filename and SHA-256. The archive's manifest binds the original source commit, this selection and its contribution files. This selection includes the complete SAM browser and server, the source-owned Applications and MCP adapters, original retained-file receiving, the opportunity response workspace, dataset publication and the maintained runtime installer.

An interrupted build continues in its original output:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --out /absolute/samgov-release --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/samgov-release --status
~~~

The retained build keeps its source commit and selection. See the [source build guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/SOURCE_BUILDS.md) for original Git receiving and offline continuation.

## Install the selected runtime

Use the maintained Node 22.16+ runtime and its original dependency lock. The complete merchant workflow selects native, schema, OpenAPI, MCP and operator dependencies:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/samgov-runtime \
  --archive /absolute/samgov-release/ORIGINAL_PACKAGE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/samgov-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/samgov-runtime --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/samgov-runtime -- registrations --source samgov

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/samgov-runtime -- merchant-providers inspect samgov-workspaces
~~~

The SAM registration includes `samgov`, `samgov-workspace`, twelve paired SDK exports, Applications provider `samgov` and merchant provider `samgov-workspaces`. Provider inspection identifies family `samgovWorkspaces` and its 30 tools. The selected package also exposes `opportunity` for the original response project.

When using an already prepared runtime, continue its existing installer operation and dependency adoption or offline transfer flow. The [installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) documents those options.

Inspection returns the READY installation's actual sourceRoot. Bind every following command to that private runtime:

~~~sh
SAMGOV_RUNTIME=/absolute/samgov-runtime
SAMGOV_SOURCE_ROOT=/ACTUAL_SOURCE_ROOT_RETURNED_BY_INSPECT
starforge() {
  node "$SAMGOV_SOURCE_ROOT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
    run --dir "$SAMGOV_RUNTIME" -- "$@"
}
~~~

The local function selects the same READY installation from any working directory.

## Open the original SAM application

Register the READY runtime in the existing Runtime workspace. Open **Applications**, choose **SAM.gov opportunities**, and review these settings:

| Setting | Value |
| --- | --- |
| SAM opportunity workspace | The original private SAM directory, or a new directory inside an owned private parent |
| Recording operator | The name to record on source, qualification and handoff actions |
| SAM credential environment name | The existing host variable, normally `SAM_GOV_API_KEY` |
| GSA search endpoint | Leave empty for the production endpoint, or select the original GSA alpha endpoint |
| Opportunity handoff workspace | The existing private opportunity response project directory when that workflow is needed |
| Local port | `0` to choose an available loopback port |
| Private environment JSON | The original private environment file when new provider acquisition needs it |

Complete **Review → Save → Connect → Review Start → Start → Open** on that saved application. Open uses the original authenticated native URL. Source directory identity, operator, managed instance, connection file and actual listener state are checked during startup.

For an explicit managed launch:

~~~sh
starforge samgov-workspace \
  --workspace /private/procurement/sam \
  --operator "Procurement operator" \
  --port 0
~~~

Add `--opportunity-workspace /private/procurement/opportunities` when the original response workspace is part of the operation. The selected package includes its `starforge opportunity` command and full [opportunity guide](../../stellar/scf-starforge-20261009/partners/lgndx-opportunity-operations/README.md).

A previously running SAM source owner should close through its original operation before the managed Application acquires that same writer. Applications Stop retires its connection, pauses its owned captures, drains requests and seller hosts, then closes the store. Starting that saved Application again reopens the same source and authored history.

## Attach the merchant tools to that application

Create a private host configuration outside the published source. A workspace alias selects its existing directory. Each received source input selects an exact original file and its SHA-256.

This configuration opens one workspace and makes one complete portable packet available for receiving:

~~~json
{
  "schema": "stellar-forge.samgov-workspace-connection.v1",
  "workspaces": {
    "procurement": {
      "label": "Procurement opportunity source",
      "directory": "./sam",
      "inputs": {
        "original_packet": {
          "label": "Complete original SAM workspace",
          "kind": "packet",
          "file": "./inputs/samgov-portable.json",
          "sha256": "ACTUAL_64_CHARACTER_SHA256"
        }
      }
    }
  }
}
~~~

Replace the file and hash with the actual retained packet. Relative paths resolve against this configuration file. For an existing workspace operated in place, the inputs map can be empty. An optional `workspaceId` binds its existing `sam_...` identity.

To receive original notice, history and issued resource documents, declare an input with `kind: "action"`. Its file contains exactly `action` and `payload`, using the original `import_notice`, `import_capture` or `retain_resource` contract. Preserve original document bytes, URLs, filenames, acquisition times and response metadata. The [managed guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/samgov/MANAGED_APPLICATIONS.md#2-declare-the-mcps-original-workspace-and-inputs) describes those declarations and optional merchant profiles. Keep native mutation request IDs and expected revisions in the tool call.

Use private directories and files, normally 0700 and 0600 on Linux. The host configuration reads the selected original paths and verifies their file identity.

Create the merchant setup file:

~~~json
{
  "directory": "/private/procurement/sam-merchant",
  "connection": "/private/procurement/sam-workspaces.json",
  "name": "Procurement opportunity operator"
}
~~~

Then initialize and start the existing transport:

~~~sh
starforge merchant-providers init samgov-workspaces \
  --options /private/procurement/sam-merchant-setup.json

starforge merchant-mcp-stdio \
  --config /private/procurement/sam-merchant/merchant-mcp.json
~~~

The initializer prepares the original release store, merchant configuration and customer export directory. Exact repeated setup reuses that configuration. MCP attaches to the Applications-owned SAM listener through its private connection.

Call `merchant_samgov_status` with `{}`, then `merchant_samgov_connect` with:

~~~json
{"workspace":"procurement"}
~~~

Use the returned source identity, revision and native instance for the ongoing operation. `merchant_samgov_browser` opens that same source in the browser.

## Complete the source-to-customer workflow

### 1. Receive or capture the original source

Open an existing workspace in place, or receive its completed original packet through `merchant_samgov_receive`:

~~~json
{
  "workspace": "procurement",
  "sourceImport": "original_packet",
  "expectedSourceSha256": "ACTUAL_64_CHARACTER_SHA256"
}
~~~

The native importer retains the source identity, complete object set, editions and authored history. Exact repeated receiving follows its matching-history rules.

Use `merchant_samgov_import` for a declared source-action file. New source capture uses the original saved query and capture ID: `merchant_samgov_save_query`, `merchant_samgov_create_capture`, then `merchant_samgov_capture_run`. Read the same capture's actual progress with `merchant_samgov_capture_status`. Pause or increase that retained capture's capacity through its corresponding control when needed.

### 2. Review the exact notice and its changes

Page retained editions with `merchant_samgov_record` and open a selected row with `merchant_samgov_notice`. The row keeps its original notice, description, issued files and source references.

Record qualification, owner, notes and any reviewed deadline with `merchant_samgov_review_notice`. A reviewed deadline includes a timestamp with an explicit offset, its IANA timezone and the reason for that interpretation. Compare retained editions with `merchant_samgov_compare` and record the actual disposition with `merchant_samgov_review_change`.

Each native mutation uses a stable `requestId` and the current `expectedRevision`. Retain the original request before sending. A repeated exact request returns its original result; a different intended edit uses a new request ID and the latest revision.

### 3. Prepare an opportunity response or notice dataset

Save the selected notice IDs with `merchant_samgov_save_selection`. A named handoff from `merchant_samgov_create_handoff` freezes its original selection, revision and source files.

For a response project, `merchant_samgov_prepare_opportunity` receives that selected notice and its issued files into the configured original opportunity workspace. Continue with the returned project ID, project revision and source bindings. Open `starforge opportunity` for the existing requirements, responses, teaming decisions and project handoff workflow.

For a dataset, `merchant_samgov_prepare_merchant` selects one host-declared payment and route profile. Start the resulting original publication with `merchant_samgov_merchant_start`, inspect its actual offer with `merchant_samgov_buyer_review`, then prepare the selected buyer intent with `merchant_samgov_buyer_prepare`. The existing buyer account and execution workflow consumes that preparation.

### 4. Export the complete editable handoff

Call `merchant_samgov_export` with a saved request ID, format `portable`, and the original positive revision or named handoff ID. The exporter streams the actual native bytes into the merchant's private customer export directory and returns their original filename, byte count, media type and SHA-256.

HTML, Markdown, notices CSV, reviews CSV, changes CSV and sources CSV use the same fixed source selection. A repeated export request returns its completed descriptor. List retained results with `merchant_samgov_exports`.

Download an original export with `merchant_samgov_file`:

~~~json
{
  "workspace": "procurement",
  "kind": "export",
  "id": "RETURNED_EXPORT_ID",
  "expectedSha256": "RETURNED_ORIGINAL_SHA256",
  "offset": 0,
  "limit": 196608
}
~~~

Decode and append each returned base64 chunk at its returned offset. Continue with `readId`, `file.sha256` and `nextOffset` until `nextOffset` is null. Verify the complete received byte count and SHA-256. The same reader serves retained original source files with `kind: "source"`.

After an MCP restart, reopen the same export ID and SHA at the saved offset with a new read. Completed exports remain available while the SAM Application is stopped.

### 5. Receive and reopen the customer's workspace

Preserve the complete portable file in the receiving installation and declare it as that receiver's original packet input. Start its selected SAM Application, connect the alias, and call `merchant_samgov_receive` using that file's exact hash.

Read the received workspace identity, full source editions, qualification decisions and handoffs. Stop and start the same saved Application to reopen it; reconnect MCP to the returned current instance. The browser and tools then operate the received editable source history.

## The 30 SAM tools

| Operation | Tools |
| --- | --- |
| Attach and inspect | `merchant_samgov_status`, `merchant_samgov_connect`, `merchant_samgov_disconnect`, `merchant_samgov_browser` |
| Read retained source | `merchant_samgov_record`, `merchant_samgov_notice`, `merchant_samgov_compare` |
| Save and continue acquisition | `merchant_samgov_save_query`, `merchant_samgov_create_capture`, `merchant_samgov_resize_capture`, `merchant_samgov_capture_run`, `merchant_samgov_capture_status`, `merchant_samgov_capture_pause`, `merchant_samgov_capture_resources` |
| Receive original input | `merchant_samgov_import`, `merchant_samgov_receive` |
| Review and select | `merchant_samgov_review_notice`, `merchant_samgov_review_change`, `merchant_samgov_save_selection`, `merchant_samgov_create_handoff` |
| Prepare the response project | `merchant_samgov_prepare_opportunity` |
| Publish and prepare the buyer | `merchant_samgov_prepare_merchant`, `merchant_samgov_merchant_start`, `merchant_samgov_merchant_stop`, `merchant_samgov_buyer_review`, `merchant_samgov_buyer_prepare` |
| Retain and receive delivery files | `merchant_samgov_export`, `merchant_samgov_exports`, `merchant_samgov_file`, `merchant_samgov_file_release` |

## Continue an interrupted operation

The original saved Application retains start and stop ownership. MCP disconnect releases its attachment and read handles; use Applications Stop to close the native server and its owned captures or sellers.

When a native mutation response is interrupted, inspect the retained source and continue the same request ID and input. For a changed native instance, inspect its saved application outcome and reconnect the same alias. An interrupted export or file read keeps its original selection, export ID, SHA and byte offset.

The [managed recovery table](../../stellar/scf-starforge-20261009/sf30-seller-sdk/samgov/MANAGED_APPLICATIONS.md#6-recover-the-same-application-and-request) maps each original response to its continuation.
