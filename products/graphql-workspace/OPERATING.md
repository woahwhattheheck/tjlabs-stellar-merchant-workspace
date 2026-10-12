# Operate the GraphQL customer product

## Saved setup and original ownership

Initialize one private product directory from either a source definition, an original GraphQL connection, or an existing merchant configuration. The three initialization options are mutually exclusive:

| Input | Result |
| --- | --- |
| --sources | Retains the exact source definition, initializes the original SF105 workspace under the product, and initializes its native merchant operator. |
| --connection | Initializes a native merchant operator for the original GraphQL directory/aliases named by that connection. |
| --configuration | Adopts the selected workspace alias from the existing merchant operator configuration. |

The product setup retains its product UUID, selected alias, configuration and original project directory. It keeps the original source definition bytes and original native records. The saved product identity is published only after the native setup is usable. Failed native initialization stages stay in the original initialization directory; they are never advertised as completed operators.

A product lease protects setup and launcher state. The original SF105 kernel writer lease still protects the GraphQL workspace itself. Starting a separate process against the same GraphQL directory cannot create a second writer. The agent's merchant_graphql_open creates the browser inside its existing native owner. Closing the product closes that same MCP/operator and drains its GraphQL previews, merchants and release consoles.

All source aliases, endpoint URLs, named credential references, runtime settings and host plans keep the original [GraphQL contract](../../stellar-forge/mcp-merchant-operator/GRAPHQL_WORKSPACES.md). Connection changes remain operator work: edit the original connection, inspect it, then make a new Applications review. Ordinary project content changes do not invalidate a reviewed configuration.

## Applications review through reopen

1. Select a complete ready Stellar merchant runtime containing this contribution and the original GraphQL schema dependency.
2. In Applications choose **GraphQL merchant workspace** and the initialized private product directory.
3. Supply the original token environment name and optional private environment JSON. Use port 0 for an available agent listener. The original SF105 browser chooses its own listener.
4. Review the actual product, alias, source list, host plans and configuration files. Save that review into the current native Applications home.
5. Start the saved application. The managed command rechecks the same configuration under its product lease and again after the original browser/agent open. Its accepted startup record contains the reviewed binding and native workspace instance.
6. Open the returned GraphQL browser. The agent endpoint is also retained in the same application result. Use the exact source endpoint and credential already configured for this workspace.
7. Stop through Applications. The original owner drains its accepted operations and closes. A subsequent Start uses the same private directories and project history with new live listener URLs.

Changing only saved queries, project titles, schema captures, previews, packages or release state is normal workspace operation. The launch binding intentionally excludes those mutable contents. Replacing the selected directory, configuration bytes or endpoint/host definitions requires another review.

The original MCP tool merchant_graphql_close closes its selected native workspace inside the host. If an agent deliberately uses that lower-level lifecycle, it should use merchant_graphql_open/status to obtain the newly returned browser URL. Applications Stop/Start remains the product-level lifecycle and updates the stable product connection file.

## Author a real merchant

The existing browser remains the complete editor:

- Create or reopen the original project. Preserve its project ID.
- Capture the selected source schema or retain the actual schema supplied by its operator. The original authoring catalog exposes its real types, fields and argument contracts.
- Select the operation, variables and bounded examples. Apply them to the existing plan while retaining its route, price and payment fields.
- Preview through the configured original endpoint. Keep the returned preview UUID and request/response identity.
- Save the current revision, review the actual merchant contract and prepare its original merchant package. The buyer SDK and nested generated files are part of that package.
- When the source schema evolves, compare the new source with the retained merchant baseline. The original evolution compiler handles operation compatibility and nested input defaults. Save and prepare only against the current native revision.
- Prepare a deployment from the actual retained merchant export, stage it in the original SF82 store, and open its original release console. Activate, start, stop and roll back using the current release identity and selection generation.
- Select a native host plan to prepare its original host packet. Use that packet's own installation/run instructions on the selected target host.

The product does not add payment or deployment shortcuts. These are the same merchant, buyer, deployment and release implementations already present in the installed distribution.

## Agent calls and request recovery

The product connection file is private and remains at:

~~~text
<product-directory>/connection.json
~~~

It records the original product UUID, workspace alias, current browser/MCP URLs and session state. The JavaScript client binds the product UUID and workspace after its first connection, then rereads this file before every request. A different product or alias requires an explicit new client. A restart can change the URL without changing the workspace identity.

~~~js
import { GraphqlProductClient } from
  '@tokenjunkielabs/starforge-merchant/products/graphql-workspace/client';

const client = new GraphqlProductClient({
  connectionFile: '/srv/private/stellar-graphql/connection.json'
});
await client.ready();
const projects = await client.call('merchant_graphql_projects', { limit: 20 });
const project = await client.call('merchant_graphql_project', {
  project: 'stellar-payments',
  includeInput: true
});
~~~

The same client preserves the original tool schemas. Complete GraphQL replies use an explicit 24 MiB response limit on the existing merchant transport; its other retained-file consumers keep their original 2 MiB default. Source errors and canceled requests return through the original MCP result.

For mutations, retain the request JSON before calling. A lost reply does not authorize a different UUID, preview or project revision. Inspect the original current state, use its recovery method where provided, and continue the same retained request. Examples of native identity:

| Work | Identity to retain |
| --- | --- |
| Save/apply operation | Project ID and expected revision |
| Preview | Project ID, preview UUID, selected operation and exact variables |
| Prepare merchant/evolution | Saved project revision and original baseline/export IDs |
| Deployment | Native deployment UUID, generation and original merchant export |
| Release change | Current release ID, digest, generation and native lifecycle request |
| File delivery | Transfer alias and exact native selection/manifest |

The CLI call command reads these same arguments from a private JSON file. It adds only this client's configured workspace alias for tools that require one. It never silently retries a mutation after a timeout.

## Complete selected file receiving

The native transfer alias is separate from merchant, preview and deployment UUIDs. Use a stable alias for one exact selection. Example native selection:

~~~json
{
  "project": "stellar-payments",
  "revision": 12,
  "kind": "merchant",
  "merchantExportId": "11111111-1111-4111-8111-111111111111"
}
~~~

Use the actual IDs returned by your original project in place of the example values. The product calls merchant_graphql_export_prepare with that exact selection and the separate --export-id alias, then reuses the existing inspectGraphqlWorkspaceFiles and downloadGraphqlWorkspaceFiles implementations.

| Kind | Selected original records |
| --- | --- |
| draft | Project and revision; raw schema/query/plan and saved project JSON |
| preview | Project/revision and previewId; original request, response and completed preview |
| merchant | Project/revision and merchantExportId; full original merchant and buyer files |
| evolution | Project/revision and merchantExportId; original revision wrapper and report |
| deployment | Project/revision and deploymentId; retained native generation |
| host | Project/revision, deploymentId and hostId; selected original host packet |

Every transfer includes the unchanged workspace-files.json plus the original graphql-export.json transfer manifest. The native parser and transport retain the exact selection, source references, file SHA-256s, lengths and nested names. They resume verified byte prefixes in the same receiving directory after interruption. A new live read snapshot can continue the same expected file after server restart.

~~~sh
starforge graphql-product inspect-files --dir /srv/private/stellar-graphql \
  --export-id stellar-payments-merchant-r12
starforge graphql-product receive --dir /srv/private/stellar-graphql \
  --export-id stellar-payments-merchant-r12 \
  --manifest-sha256 ACTUAL_INSPECTED_SHA256 \
  --out /srv/private/received-merchant-r12
starforge graphql-product inspect-received --dir /srv/private/received-merchant-r12
~~~

An existing transfer does not need --selection again. The same completed destination is verified and reused. Offline inspection hashes each file against the native manifest without starting a writer, contacting the source, or running generated code. The original merchant/deployment/host README in the received packet remains the executable handoff.

This delivers the complete selected native file set. The original server has no whole-private-workspace import API, and the receiver does not invent one or rewrite saved private history. To reopen ongoing authoring on the same host, retain its original workspace directory and product setup.

## Host requirements and source

Use Linux with util-linux flock, the maintained Node runtime and the complete selected distribution. Install dependencies through the original runtime-install flow; the source tree is not an independent replacement package. A configured real GraphQL endpoint supplies connected previews. Credentials remain named environment references and are never embedded in a distributable example.

Source module ownership remains:

- workspace.mjs / managed.mjs / cli.mjs: this customer setup and launcher.
- application-provider.mjs: this product's additive entry in the original source-owned Applications registry.
- client.mjs: connection continuity and receiving through the original transport.
- SF105 workspace/onboarding/deployment: original authoring and merchant source.
- MerchantGraphqlWorkspaces and its retained file owner: native agent and file-set operations.
- SF82: original deployment/release lifecycle.
