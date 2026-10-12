# Operate and receive a SQL Server data product

Use the original SQL Server workspace for catalog discovery, approved query authoring, native preview, immutable preparation, seller operation and complete transfer receiving. Its browser and merchant tools share one workspace UUID, original source profile, persistent operation journal and process owner.

The examples use the maintained starforge command. For an isolated runtime, prefix them with starforge runtime-install run --dir /private/mssql-runtime-01 --. Retain the actual values returned by the original application and merchant host.

## Retain the database and merchant inputs

Start from the original mssql/examples/source.json. Select the actual server and database, SQL user, named password environment variable and TLS configuration. Preserve source-relative CA bytes when configured. The source's named queries bind original SQL parameter types and native result types.

The private host environment contains the selected password and any existing merchant/facilitator variables. The source file contains the environment variable's name. The Application reviews its source and CA hashes, workspace identity, environment selection and runtime identity before launch.

Keep all SQL authoring paths under the host's owned private directory. The generated public contract and customer export derive from the reviewed merchant plan. Use the native schema and actual merchant terms from the current source; a changed schema or source profile needs a fresh review.

## Initialize and open the original owner

~~~sh
starforge mssql-workspace init \
  --source /private/sqlserver/source.json \
  --state /private/sqlserver/author

starforge mssql-workspace inspect \
  --source /private/sqlserver/source.json \
  --state /private/sqlserver/author
~~~

Keep its workspaceId. Applications presents SQL Server data products with these original settings:

| Setting | Binding |
| --- | --- |
| SQL Server source profile | Exact source JSON and its selected CA. |
| Initialized SQL Server workspace | Original directory and workspace UUID. |
| Original seller release store | Optional existing SF82 store used by this merchant host. |
| Seller and operations ports | Actual local ports; zero selects an available port. |
| Facilitator URL | Existing configured native payment facilitator. |
| Private environment | The selected host file containing named source and merchant variables. |

Review, save and start through the maintained Applications workflow. It verifies the private connection record against the live authenticated listener before Open. A fixed workspace port preserves the browser origin across restarts. The private connection record also follows a newly allocated port.

For direct operation, the original launcher accepts the same source and state:

~~~sh
starforge mssql-workspace \
  --source /private/sqlserver/source.json \
  --state /private/sqlserver/author \
  --port 8441
~~~

Add the original --release-store, --seller-port, --operations-port and --facilitator options when those host selections are ready. Use one original listener for a state directory. Applications owns its selected process; a directly launched owner closes through its existing signals and shutdown path.

## Catalog to prepared seller

1. Open the real database catalog, then choose a schema-qualified table or view.
2. Inspect the original columns and select the output fields, allowed typed filters, deterministic ordering, limits and public route.
3. Enter the actual network, asset, recipient and price for the offer. Review the generated source and public contract.
4. Preview the approved query. The original source retains its native metadata, exact scalar encodings and result limits.
5. Prepare the selected release. Its complete immutable package contains the approved private source, merchant plan, generated public OpenAPI and original customer client.
6. Reopen that release to inspect its exact manifest and current operation. Start and stop the original seller by its returned run identity.
7. Stage the prepared package into the merchant's existing SF82 store when using its retained activation and settlement lifecycle.

Saved workspace history reopens original reviews, operation results, prepared releases and transfers after restart. Review, preview, prepare and export retain a UUID before sending. Retry saved operation keeps that exact request after an uncertain reply. Different choices use a fresh UUID and review.

The native query source preserves exact bigint, decimal, binary and date/time contracts. The complete component guide documents each type and supported typed parameter. Oversized rows or encoded results fail their original operation, and cancellation follows the original SQL Request and pool ownership.

## Attach the merchant tools

Initialize the receiving workspace with its own actual source and state when one is needed. Retain its distinct workspace UUID.

Create the private connection JSON with those actual identities:

~~~json
{
  "schema": "stellar-forge.mssql-workspace-connection.v1",
  "workspaces": {
    "author": {
      "label": "SQL Server author",
      "workspaceId": "ACTUAL_AUTHOR_UUID",
      "consoleUrlFile": "/private/sqlserver/author/operator/connection.json"
    },
    "receiver": {
      "label": "SQL Server receiver",
      "workspaceId": "ACTUAL_RECEIVER_UUID",
      "consoleUrlFile": "/private/sqlserver/receiver/operator/connection.json",
      "deliveries": {
        "incoming": {
          "directory": "/private/sqlserver/managed-receiving/merchant"
        }
      }
    }
  }
}
~~~

Save it as /private/sqlserver/workspaces.json with mode 0600. Delivery aliases identify existing host-owned private receiving locations. A manifestSha256 can additionally pin an alias to one exact export. The original reader also supports the existing Applications application-url.json and verifies its command, native identity and live owner.

Create a private setup JSON:

~~~json
{
  "directory": "/private/sqlserver/merchant-host",
  "connection": "/private/sqlserver/workspaces.json",
  "name": "SQL Server merchant"
}
~~~

~~~sh
starforge mssql-agent init --options /private/sqlserver/setup.json
starforge mssql-agent serve \
  --config /private/sqlserver/merchant-host/merchant-mcp.json \
  --port 3211 --token-env MCP_ACCESS_TOKEN
~~~

Setup creates the original SF82 store under merchant-host/releases, or uses the explicit existing releaseStore in its setup JSON. Configure the author Application with that same store. Unchanged setup reopens its original result.

The merchant host's original OAuth, private console, stdio and client-configuration paths remain available. Inspect the exact source-owned tool schemas with merchant-providers inspect mssql-workspaces. Every scoped tool call supplies workspace and workspaceId. Mutating retained operations also carry their original version-4 operationId.

| Tool family | Operating purpose |
| --- | --- |
| workspaces, status | Select and inspect the original listener and retained identity. |
| catalog | Read native table/view metadata through that owner. |
| review, reviews, review_load | Review exact current choices and reopen saved reviews. |
| preview | Run and retain the approved native query under its UUID. |
| operations, operation | Page and reopen the original committed requests and results. |
| prepare, releases, release | Build or reopen the complete immutable seller. |
| stage | Enter the same configured SF82 store. |
| start, stop | Control the original seller by its current run ID. |
| export, exports | Retain and reopen complete merchant or customer transfers. |
| export_manifest, export_file, export_file_release | Read exact manifest-bound files through the maintained resumable reader. |
| receive | Adopt the complete merchant from a host-declared delivery alias. |

Each name has the merchant_mssql_ prefix. Use the original tool's returned IDs and schema. A direct operator can use the same client:

~~~sh
starforge mssql-agent call \
  --connection /private/sqlserver/workspaces.json \
  --tool merchant_mssql_reviews \
  --input /private/sqlserver/selected-workspace.json
~~~

The input file contains the actual workspace alias and UUID. No additional database worker is created by the attachment.

## Original seller release lifecycle

Use the prepared directory returned by the browser or native prepare command:

~~~sh
starforge releases stage \
  --store /private/sqlserver/merchant-host/releases \
  --id catalog-v1 --mssql-package /private/sqlserver/prepared

starforge releases inspect \
  --store /private/sqlserver/merchant-host/releases --id catalog-v1
~~~

The existing release CLI supplies list, compare, activate, run, stop and rollback. It retains source, CA, public terms, generated client and complete package bytes. The original child owns its startup handshake, process identity, readiness, shutdown and recovery. A prepared release can reopen after its original authoring directory has moved.

## Customer and merchant transfer

Choose Retain complete merchant or Retain customer files in the browser, or call merchant_mssql_export with the exact prepared manifest and selected kind.

A complete merchant export retains workspace metadata and the complete prepared package. A customer export retains the public OpenAPI and five original client files. Mssql_Transfer_Manifest.json names every file, byte count and SHA-256 together with the original workspace, release, export and package identities.

~~~sh
starforge mssql-download inspect \
  --url http://127.0.0.1:3211 \
  --workspace author --workspace-id ACTUAL_AUTHOR_UUID \
  --export-id ACTUAL_EXPORT_UUID --token-env MCP_ACCESS_TOKEN

starforge mssql-download receive \
  --url http://127.0.0.1:3211 \
  --workspace author --workspace-id ACTUAL_AUTHOR_UUID \
  --export-id ACTUAL_EXPORT_UUID \
  --expected-manifest-sha256 ACTUAL_EXPORT_MANIFEST_SHA256 \
  --directory /private/sqlserver/managed-receiving/merchant \
  --token-env MCP_ACCESS_TOKEN
~~~

Repeat the same selection and destination to continue an interrupted transfer. The original reader retains its private checkpoint, completed files and byte offsets, and reopens expired file handles against the same manifest. Keep the entire destination directory together.

After every merchant file is received, call merchant_mssql_receive using the receiver alias, its UUID, the configured incoming delivery alias, the expected manifest digest and the original operation UUID. The receiver checks all file hashes, original prepared manifest, merchant choices and source identity, then adopts the package under its release lease. A matching existing release reopens. A different package under that ID reports a conflict.

Use the generated client README and seller-client.mjs in the customer export. Its exact OpenAPI and public terms remain bound to the original seller. The installed toolkit's existing buyer and facilitator flows own any live payment operation.

## One full managed receiving command

Use the two already running workspaces and their configured merchant host. Save the actual approved choices returned by merchant_mssql_review_load as a private JSON file. Configure:

~~~json
{
  "schema": "stellar-forge.mssql-managed-receiving.v1",
  "directory": "/private/sqlserver/managed-receiving",
  "connection": "/private/sqlserver/workspaces.json",
  "workspace": "author",
  "receiver": {
    "workspace": "receiver",
    "delivery": "incoming"
  },
  "choices": "/private/sqlserver/approved-choices.json",
  "mcpUrl": "http://127.0.0.1:3211",
  "tokenEnv": "MCP_ACCESS_TOKEN",
  "storeReleaseId": "catalog-managed-v1"
}
~~~

~~~sh
starforge mssql-managed-receive \
  --options /private/sqlserver/managed-receiving.json
~~~

The original operation verifies both listeners, reads the native catalog, reviews the actual choices and executes the typed query through MCP. It deliberately loses one completed preview reply, then reopens the same UUID. It prepares and stages the original seller, downloads complete merchant and customer files, receives the merchant in the second workspace, loads the original generated client and checks the seller's original unpaid payment requirement.

The retained directory contains the stable intent, original operation UUIDs, catalog/version, choices, native query result, response-loss record, original files, SF82 stage, receiving result and receiving.json. Repeating unchanged options continues this same operation. Use a new private directory for a different selection.

## Resume, upgrade and support

The original request/result journal survives process and browser restarts. On reacquiring its owner lease, this edition recovers a final file whose original staging-link cleanup was interrupted. It keeps the committed inode, bytes and UUID, then applies the existing strict private-file reads. Unrelated partial stages and source inputs remain available to their original operation.

A live workspace keeps its lease while serving accepted work. Stop it through its current owner before another edition launches the same state. The original Applications startup check binds the actual private listener, source, profile, runtime and workspace identity. Merchant attachments reread the private URL file and verify that identity on each call.

For operator support, retain the runtime source commit and selection, installation/profile/lock identities, workspace UUID, operation and review IDs, release and manifest digests, selected tool input and its actual error, transfer checkpoint and current owner output. Use the complete original merchant export for an authorized merchant receiver and the customer export for a customer. Password values stay with the host environment.
