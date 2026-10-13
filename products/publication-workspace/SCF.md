# Publication workspace installation

This product installs and operates the complete original public-information publishing application: retained source and procurement records, staff editing and review, frozen resident releases, native WordPress publishing tools, source return, whole backup and independent receiving.

The application remains in its original source layout. The reusable adapter accepts a complete selected source manifest and an original saved workspace; customer source and commercial records remain with that selection.

## Prepare the existing product

Select Python 3.11 or later with the original lxml>=5.3,<7 requirement. Select a private directory and the complete source manifest supplied with the original application. To continue completed staff work, use its exact original workspace recovery ZIP.

~~~sh
starforge publication-workspace prepare \
  --directory /PRIVATE/publication-installed \
  --source-root /PRIVATE/original-publication-source \
  --source-manifest /PRIVATE/Publication_Source.json \
  --workspace-archive /PRIVATE/Original_Workspace_Recovery.zip \
  --python /ABSOLUTE/installed/python3 \
  --actor "Publishing operator" \
  --request-id 91ff9f9b-d024-45f9-bc0b-b26848cf2f54
~~~

The response contains the actual installation UUID, original source edition and saved workspace path. Keep that full response with its original case. Repeating the exact command receives the retained operation. Select a new UUID for an intentional new installation operation.

Inspect or read original state:

~~~sh
starforge publication-workspace inspect --directory /PRIVATE/publication-installed
starforge publication-workspace call --directory /PRIVATE/publication-installed --operation workspace.state
~~~

The complete native JSON contract is in native/API.md. The typed import is @tjlabs/stellar-merchant-workspace/merchant/publication. It accepts directory, sourceDirectory, selected Python and an optional exact installation/source binding. Original large integer identifiers remain decimal strings.

## Use the original applications

In Applications, select the prepared directory for:

| Application | Original operating surface |
| --- | --- |
| Publication staff workspace | Source acquisition, editing, revision history, media, procurement, review, frozen release and native return |
| Publication resident release | The selected complete frozen release produced in that same workspace |
| Publication WordPress editor | The original plugins, theme and editable native site using the selected existing Playground runtime |

Each role has its own resource key, so staff, resident and native services can coexist. Applications owns their direct native process and shutdown. Save/review/start uses the original source edition and installed interpreter. A changed source selection returns to the ordinary current review. Closing an MCP connection leaves these services with Applications.

The staff UI keeps the original application’s controls, table layout and saved source history. Existing source and procurement operations execute through that application. The resident entry requires the exact frozen release identity shown in the staff workspace.

For a terminal launch, select a fresh private ready file:

~~~sh
starforge publication-workspace service \
  --directory /PRIVATE/publication-installed \
  --role operator --port 0 \
  --ready-file /PRIVATE/operator-20261013.json
~~~

## Attach the original WordPress runtime

Select an already installed Node executable, the actual @wp-playground/cli entry module, and the exact complete original WordPress core ZIP. The original runner selects WordPress 7.1.3 and PHP 8.4 and uses its existing local staging restrictions and native publishing/source-return behavior.

The private runtime JSON contains:

~~~json
{
  "node": "/ABSOLUTE/installed/node",
  "playground_module": "/PRIVATE/native-dependencies/node_modules/@wp-playground/cli/index.js",
  "wordpress_zip": "/PRIVATE/original-wordpress-core.zip"
}
~~~

Pass it as --native-config when preparing, or supply those original fields to native.configure. The complete core ZIP is retained inside the installation. Keep the original native engine's python command available on PATH for its normal core extractor.

Supply TJL_LOCAL_WP_PASSWORD through the existing private environment-file selection. The original WordPress operator username and approved local service URL come from its native runner; this adapter never returns the password. Start Publication WordPress editor through Applications, or service --role wordpress with a fresh private ready file. The original source setup activates the maintained plugins and theme before the service is announced.

Source-record edits made in the original native editor return through the existing native export and staff comparison controls. Keep the complete selected native return and source decisions with their original workspace.

## Complete export and independent receiving

Stop the staff service through Applications, then export the editable original operator package:

~~~sh
starforge publication-workspace export \
  --directory /PRIVATE/publication-installed \
  --kind operator --output /PRIVATE/Publication_Operator.zip \
  --actor "Publishing operator" \
  --request-id 5bd1c9bf-f0ae-4bc3-8dbe-bf51cb328aad
~~~

The original package includes the staff source, workspace recovery ZIP, complete native tools and operating guide. workspace, native-tools and procurement exports use their original complete packagers.

Stop the staff and WordPress services through Applications before the whole installation snapshot:

~~~sh
starforge publication-workspace snapshot \
  --directory /PRIVATE/publication-installed \
  --output /PRIVATE/Publication_Installation.zip \
  --request-id a4692b10-9c2c-4f46-87c5-084a12beefca

starforge publication-workspace receive \
  --directory /PRIVATE/publication-received \
  --archive /PRIVATE/Publication_Installation.zip \
  --python /ABSOLUTE/installed/python3 \
  --actor "Receiving operator" \
  --request-id f6fe3857-9358-436c-a84e-f224e645bdaf
~~~

The receiver opens the original backup through its actual Store. The new installation lives directly at /PRIVATE/publication-received. It retains all prior source editions, complete native site, original archive, source lineage and originating operation records. Configure Applications against that returned directory, reopen the same staff work and produce an onward snapshot when needed.

## Configure the existing Merchant operator

Create an owned private 0600 connection JSON and select it as publicationWorkspaceConnection in the existing Merchant host:

~~~json
{
  "schema": "stellar-forge.publication-workspace-connection.v1",
  "workspaces": {
    "publishing": {
      "label": "Publication workspace",
      "directory": "/PRIVATE/publication-installed",
      "sourceRoot": "/PRIVATE/original-publication-source",
      "sourceManifest": "/PRIVATE/Publication_Source.json",
      "workspaceArchive": "/PRIVATE/Original_Workspace_Recovery.zip",
      "transferDirectory": "/PRIVATE/transfers",
      "python": "/ABSOLUTE/installed/python3"
    }
  }
}
~~~

Add nativeFile to select the private native runtime JSON. An independently receiving alias selects receiveArchive and its actual destination directory. Each directory has one configured alias. Optional binding uses the original installation_id and source_identity.

The 18 merchant_publication tools cover current state and original source verification; whole preparation/source adoption/export/receiving; original records/history/jobs/procurement/native returns; existing runtime configuration; command descriptions and retained lifecycle requests. Host-selected paths stay in the private connection; normal model calls choose an alias, original ID, actor and complete-operation UUID.

## Join the original Customer Installation

The maintained public-information-publication profile is discovered by the existing Installation catalogue. Use its original case/workshare seed, technical bindings, actual merchant/buyer selection and receiving operator. commission.mjs verifies that selected source manifest and prepares the original Installation document and the native local preparation request together.

~~~sh
node products/publication-workspace/commission.mjs \
  --seed /PRIVATE/Original_Installation_Seed.json \
  --bindings /PRIVATE/Original_Bindings.json \
  --selection /PRIVATE/Publication_Selection.json \
  --out /PRIVATE/Publication_Installation_Preparation
~~~

The original seed retains all workshare phases, commissioning terms, funded assignments, acceptance checks and recorded source IDs. The profile supplies the complete technical implementation. The source selection references the actual original workshare and its document source; it does not replace that source with a second commercial case.

Deliver the whole original application, source manifest, editable workspace and procurement outputs, actual native output, installation ZIP, receiving result and the existing operating guide to the original case and its operator.

A multi-role `commands.describe` request derives separate `-operator`, `-resident`, and `-wordpress` ready-file names from its selected filename. A single-role request retains the exact selected path. Receiving through a private connection forwards its selected Node and Playground runtime references; the complete archived core remains the original source.
