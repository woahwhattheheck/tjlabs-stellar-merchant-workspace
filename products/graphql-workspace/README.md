# GraphQL merchant workspace

This customer product opens the original saved GraphQL authoring workspace and its merchant agent from one retained setup. The browser and agent use the same SF105 writer, project IDs, revisions, preview operations, merchant packages, deployment records and SF82 release consoles.

The installed command is **graphql-product**. Its source-owned Applications entry is **GraphQL merchant workspace**. Both call the original merchant provider; they do not create a competing GraphQL implementation.

## Install and initialize

Build the complete **graphql-workspace** source selection and install its original **schema, openapi, graphql and mcp** feature groups with native payment and operator support. [PACKAGING.md](PACKAGING.md) carries the full build → READY installation → customer setup → merchant/deployment → project handover → receiving-machine workflow. The full Stellar merchant distribution remains compatible with the same product. Both editions retain SF105, merchant MCP, the source registry and file transport together.

Run this from the existing installed command:

~~~sh
starforge graphql-product --help
starforge graphql-product init \
  --dir /srv/private/stellar-graphql \
  --sources /srv/private/graphql-sources.json \
  --workspace indexer \
  --name "Stellar indexer merchant"
~~~

The parent directory must exist and be private. The source file is private UTF-8 JSON:

~~~json
{
  "schema": "stellar-forge.graphql-product-sources.v1",
  "sources": {
    "indexer": {
      "label": "Selected GraphQL service",
      "endpoint": {
        "schema": "stellar-forge.subquery-schema-endpoint.v1",
        "origin": "https://indexer.example.com",
        "path": "/graphql",
        "authorizationEnv": "INDEXER_AUTHORIZATION"
      }
    }
  }
}
~~~

Replace the illustrative service origin/path with the source you operate. The endpoint and its authorization environment reference follow the original SF105 contract. Optional runtime and hosts fields use the original [GraphQL workspace connection format](../../stellar-forge/mcp-merchant-operator/GRAPHQL_WORKSPACES.md). Initialization retains the exact definition and calls the original native merchant initializer. An identical interrupted setup continues under its original product identity.

An existing source can be adopted without replacing its saved projects:

~~~sh
starforge graphql-product init --dir /srv/private/stellar-graphql \
  --connection /srv/private/original-graphql-connections.json --workspace indexer
~~~

If the merchant configuration already exists, use --configuration instead of --connection. The exact selected alias and original directory remain authoritative.

## Open the same browser and agent

Set the existing source credential and MCP bearer token in the process environment, or supply the original OAuth resource configuration. Token values are not placed in the product profile.

~~~sh
starforge graphql-product review --dir /srv/private/stellar-graphql
starforge graphql-product open --dir /srv/private/stellar-graphql --port 0
~~~

Startup returns one JSON record containing the native browser URL, authenticated MCP endpoint and the stable private connection file. The browser token belongs to that local session. The original agent can list projects, capture the selected schema, author and preview queries, prepare merchant packages, compare revisions, stage deployments, operate the original release and deliver its exact files.

In **Applications**, choose the ready runtime and **GraphQL merchant workspace**, select this private product directory, then Review → Save → Start → Open. Its review shows the actual source aliases, original project directory, host plans and configuration identities. Stop drains the existing owner; a later Start reopens the same projects and updates the stable connection file.

Use --browser-only to run the original browser without opening an MCP listener. The agent port is then 0; SF105 chooses its own browser port.

## Operate and receive

~~~sh
starforge graphql-product projects --dir /srv/private/stellar-graphql
starforge graphql-product call --dir /srv/private/stellar-graphql \
  --tool merchant_graphql_project --request /srv/private/project-request.json
~~~

The request contains the original tool arguments. The client binds the selected workspace alias automatically and preserves native project, revision, preview and deployment identities. It rereads the same connection after restart and never automatically resends a mutation.

~~~sh
starforge graphql-product receive --dir /srv/private/stellar-graphql \
  --export-id stellar-payments-merchant-r12 \
  --selection /srv/private/native-file-selection.json \
  --out /srv/private/received-merchant-r12
starforge graphql-product inspect-received --dir /srv/private/received-merchant-r12
~~~

Receiving uses the original resumable downloader and native manifest. It delivers selected draft, preview, merchant, evolution, deployment, host, response-comparison, saved-request or complete project-handover files with their original byte identities and nested paths. Offline inspection reopens those files after the source process closes. For continued authoring on a receiving host, select kind handover and use the original browser's Project handover actions or inspect-handover / reopen-handover. The [complete handover guide](HANDOVER.md) covers original history, interrupted receiving, source rebinding and local deployment preparation.

See [OPERATING.md](OPERATING.md) for the complete source-to-merchant workflow, stable request recovery, receiving selections and application ownership.

## Compare returned responses and retain review decisions

The same saved project now supports baseline/candidate response cohorts from
its already completed previews. Compare exact numeric values, data, errors,
HTTP status and original request/schema context; retain per-case decisions and
versioned reviewer notes. The browser, six native comparison tools and dedicated
CLI commands use the original writer and preserve uncertain request UUIDs.

Prepare an offline reviewer packet with every selected response, original
draft and review generation through kind comparison in the existing receiver.
Complete project handover retains that history so the receiving operator can
continue reviews and author the next merchant revision.

The [retained response review guide](../../stellar/scf-starforge-20261009/sf105-subquery-graphql-merchant/workspace/RESPONSE_REVIEW.md)
covers actual browser operation, exact request templates, full-value inspection,
original-result recovery, offline files and continued review after receiving.

## Save cases, run the original requests, compare and receive

The **Saved request sets and runs** browser panel retains named operation/variable
cases against an exact saved source revision. A set can contain up to 32 cases;
the eight-operation/24-case engagement can therefore keep all of its selected
cases together. Each deliberate connected run allocates original preview UUIDs
before it sends a request. Run progress, pause/cancel, explicit continuation,
completed responses and unresolved original requests remain in the same writer.

The installed client and ten dedicated CLI commands operate these same saved
sets and native attempts. Baseline/candidate run selection feeds the existing
response comparison and reviewer workflow without additional source queries.
Prepared packets pin their selected bytes so an interrupted transfer can finish
even after a later run or local edit. Full project handover retains the complete
set/run history, original requests and responses for the receiving operator.

See [REQUEST_SETS.md](../../stellar/scf-starforge-20261009/sf105-subquery-graphql-merchant/workspace/REQUEST_SETS.md)
for the whole browser and installed-client workflow, exact request shapes,
source-selection rules, request recovery and continued work after receiving.
