# Zarr workspace

The Zarr workspace turns retained native arrays into reviewed scalar editions for the original dataset publisher. The browser, local CLI, Merchant MCP provider and Applications launcher operate the same source workspace. The original Python engine owns its SQLite revisions, request journal, source capture, array selections, result extraction, reviews and packet restoration. The original dataset publisher owns plans, candidate runs, reviews, publication and buyer handovers.

The workspace accepts complete local Zarr v2 or v3 stores through named host declarations. It never writes to the selected original source. Each imported edition retains the full store bytes and provenance before native inspection. Complete typed results retain their native dtype, exact source coordinates, selection and content SHA-256.

## Install the selected original runtime

Use the complete selected merchant distribution containing the Zarr contribution. Its source includes the Zarr Python requirements, provider, original dataset publisher dependencies, operator assets and this guide. Follow the component README for the exact pinned native dependency installation. The supported native engine is zarr-python 3.4.1; the source CLI checks its installed version. Use an existing Linux host with Node 24 or later supporting the original Node SQLite API and Python 3.12 with the selected requirements.

Keep operated work outside the installed source directory. A virtual environment may be selected explicitly. Preserve its executable path: replacing its symlink with the base Python executable can change the selected environment.

From the source tree, the local entry is:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/zarr/workspace/cli.mjs help
~~~

The selected distribution registers the equivalent command as **zarr-workspace**. Create an original private workspace once:

~~~sh
zarr-workspace init \
  --directory /srv/zarr/workspace \
  --python /srv/zarr/python/bin/python
~~~

Reopen an existing directory with status or serve. Do not initialize over an operated workspace.

## Declare complete inputs and receiving roots

Create a host-owned JSON declaration. Paths are relative to this declaration or absolute. The browser and MCP select named aliases; they cannot supply arbitrary host source paths.

~~~json
{
  "schema": "stellar-forge.zarr-workspace-connections.v1",
  "inputs": [
    {
      "id": "measurement-store",
      "title": "Measurement store — selected source edition",
      "path": "/srv/zarr/input/measurements.zip",
      "kind": "zip",
      "root": "",
      "sha256": "REPLACE_WITH_THE_COMPLETE_64_CHARACTER_SHA256",
      "provenance": {
        "publisher": "The original source owner",
        "source": "The original acquisition reference",
        "edition": "The reviewed source edition"
      }
    },
    {
      "id": "received-authoring",
      "title": "Complete source workspace packet",
      "path": "/srv/zarr/input/Zarr_Workspace.zip",
      "kind": "packet",
      "sha256": "REPLACE_WITH_THE_COMPLETE_64_CHARACTER_SHA256",
      "provenance": {
        "source": "The original completed source-workspace export"
      }
    }
  ],
  "destinations": [
    {
      "id": "customer-authoring",
      "title": "Separate customer authoring workspaces",
      "path": "/srv/zarr/received"
    }
  ]
}
~~~

Replace the SHA placeholders with the actual full-file hashes. ZIP and packet inputs require their complete SHA. For a Zarr ZIP, **root** selects the original store directory inside the complete archive; use an explicit canonical relative prefix. A directory input selects its complete directory and has an empty root.

Create receiving roots beforehand as real directories. Each request creates or reopens its own UUID child under that root, separate from the source workspace and installed code.

An optional host-owned publisher binding adds this property to the declaration:

~~~json
{
  "publisher": {
    "seller": "http://127.0.0.1:8410",
    "resource": "https://the-original-dataset-seller.example/the-reviewed-dataset-resource"
  }
}
~~~

The seller is the exact original loopback HTTP origin, including its port. The resource is its exact advertised public HTTPS URL, without query or credentials. The original dataset buyer-handoff engine validates both. This binding does not start a seller, establish payment terms or make a purchase. The current target must advertise the exact original snapshot-selectable resource before buyer offer preparation succeeds.

## Open the complete operator

~~~sh
zarr-workspace serve \
  --directory /srv/zarr/workspace \
  --connections /srv/zarr/connections.json \
  --python /srv/zarr/python/bin/python \
  --port 8471
~~~

Port 0 lets the original listener select an available loopback port. The compact startup object includes **zarrWorkspace**, the private browser URL. Open that exact URL. Its random token is held in a URL fragment; the browser moves it to local session storage before making authenticated requests.

The listener is bound to 127.0.0.1. It verifies Host, Origin, bearer token and same-site requests. Its private connection file has mode 0600. Do not forward the private connection or browser token to a public site.

The operator holds a permanent **operator.lock** inode for its listener lifetime. Native source commands separately use the Python engine’s permanent **operation.lock**. Every accepted native command is tracked until its child closes. Stop blocks new requests, closes the original publisher owners, drains accepted work, closes the listener and releases its owned attachment. No lock file is unlinked to force a second owner.

## Work through a complete source edition

### 1. Retain the source

Open **Sources**, choose a declared input and enter an edition title. The browser retains a UUID and complete intent before preparation. It then retains the exact prepared request before Apply.

The native engine copies a ZIP and checks its complete SHA before inspection. A directory source is checked against its complete member inventory before and after capture. Each source shows its arrays, groups, member count, bytes, metadata, original source SHA and provenance.

Inspection uses the original Zarr engine’s per-node metadata, including the full hierarchy. It does not trust stale consolidated hints. A completed ZIP import remains available from its retained bytes without a new external acquisition. An interrupted directory copy may still require its original source.

### 2. Save an explicit array selection

Choose an array from the native hierarchy. Specify each axis as either:

- A single non-negative integer index within the source axis.
- A bounded slice with a non-negative start, exclusive stop and positive step.

A scalar array uses an empty axes array. The browser shows the selected cell count and requires explicit complete-result cell and native-memory allowances. The native engine enforces those limits again.

The selection binds the source SHA and array metadata SHA. It does not replace an earlier selection. Integer geometry outside JavaScript’s exact safe range is rejected by the Node transport before it can be rounded. Use the original Python interface for that source or selection; the native files remain intact.

### 3. Run and inspect the complete result

Run the saved selection once for the desired edition. The original request is retained before extraction. The full result stores its source shape, selected shape, dtype, coordinates, engine identity and every typed value. The browser pages immutable rows while showing the complete population.

| Native kind | What remains exact |
| --- | --- |
| boolean | The original true/false value |
| integer | Decimal text, including integers beyond JavaScript’s safe range |
| float | Numeric text, including negative zero, NaN and infinities |
| text | Original Unicode text |
| bytes | Base64 for the exact byte value |
| complex | Separate typed real and imaginary values |
| datetime, timedelta | Original dtype, exact ticks and display value |
| record | Named typed fields |
| subarray | Original shape and typed component values |

Numeric text is displayed directly. The browser does not silently coerce a retained integer, timestamp or non-finite value into a JavaScript number.

### 4. Review the exact result

Choose **Accept**, **Needs changes** or **Reject**, and record interpretation and limitations. Every review binds the exact result ID and content SHA. Earlier reviews remain in history.

Freezing requires the latest accepted review. A later non-accepted review prevents a new freeze from relying on an older acceptance.

### 5. Freeze a scalar source

Choose an explicit public value type:

- **Text** preserves exact integer/float text and encodes tagged structured values explicitly.
- **Number** requires finite safe values. Large integers, negative zero and non-finite values are rejected; choose text to preserve them.
- **Boolean** requires every selected native cell to be boolean.

The frozen source includes all reviewed rows, original source coordinates, engine/source/result identities and the exact accepted review. The native frozen file uses **text** as its projection label. The original dataset query maps text to the publisher’s **string** type. Build dataset columns from the returned query projection or its named columnTypes entries, not by copying private projection labels.

## Operate the original dataset publisher

Select a frozen edition in **Dataset publisher**. Each version opens one original publisher under **publishers/FROZEN_ID**, with its target under **datasets/FROZEN_ID**. Stored source and target declarations are relative to the publisher workspace so a complete merchant handover can restore them on another host.

The query is **selected**. Columns are **row_id**, **ordinal**, **source_index** and **value**, with scalar types from the original query response. Review the complete dataset contract, query limits and extraction allowances before saving. Extraction requires an explicit original ordering, normally ordinal ascending.

The normal sequence is:

1. Save a plan. The original saved plan has a numeric ID; its internal folder UUID is a different identity.
2. Start extraction with one retained run UUID. Inspect original progress and the complete candidate.
3. Review that exact candidate against the observed target. A missing target may be explicitly initialized; a running target binds its current snapshot and revision.
4. Publish with the current original review ID. The original version store performs initialization or refresh.
5. Reopen the retained run, candidate, review and target version. If publication lost its response, use original run recovery before another reviewed publication.

The same original publisher owns cancellation, candidate validation, version publication and buyer preparation. The operator does not introduce another publisher database or version engine.

### Publisher request recovery

Every operator write retains its request UUID and complete input before dispatch. The current original publisher supplies durable request receipts for plan saves, candidate reviews and buyer handovers. An exact retry uses that same native request ID and original input.

Extraction uses its original run UUID. Publication uses its exact candidate review. Completed responses return from retained receipts. A partially observed request remains visible under **Publisher request receipts**. Use **Continue same request** and inspect the original run/target recovery.

If the outcome cannot be confirmed, an operator may explicitly close its transport uncertainty with a reason after the original publisher is positively inactive. This preserves the request and observed native history. It does not claim native success or delete a plan, candidate, review or publication.

No fresh publisher write is admitted while another unclosed request for that source remains unresolved, except original recovery/cancellation needed to reconcile it.

### Buyer handover

The host must bind the original running seller and resource. Read its actual buyer offer, then supply required consent and bounded configuration. The original validator checks all identities and limits. Preparation retains the full buyer configuration and original offer hashes; it does not execute a purchase.

## Recover an interrupted native operation

Open **Operations** or use an exact UUID:

~~~sh
zarr-workspace operation --directory /srv/zarr/workspace --id ORIGINAL_UUID
~~~

Status lists the latest 100 operations. Exact UUID lookup reads older requests.

- A complete request returns its original result.
- A running or interrupted request resumes only its saved request and admitted revision.
- A still-held native writer lease prevents another writer.
- If a request will not be completed, use native abandon with a new closure UUID and an explicit reason. The old request and partial material remain retained.

The browser saves each intent and prepared envelope before Apply. Response loss never generates a new UUID. Operations compares its local intent with the original native journal and continues the exact request.

A failed preparation never sent to Apply may be closed locally. A dispatched unknown response cannot be dismissed as “not sent” merely because a temporary lookup did not return a receipt.

The CLI uses the same prepared envelope:

~~~sh
zarr-workspace prepare \
  --directory /srv/zarr/workspace \
  --connections /srv/zarr/connections.json < intent.json > prepared.json

zarr-workspace apply \
  --directory /srv/zarr/workspace \
  --connections /srv/zarr/connections.json < prepared.json

zarr-workspace resume \
  --directory /srv/zarr/workspace \
  --connections /srv/zarr/connections.json \
  --id ORIGINAL_UUID
~~~

For resumed imports, keep the original host input declaration and provenance. Completed retained ZIP bytes do not require another external acquisition.

## Receive and transfer complete authoring work

**Receive & transfer** prepares a complete original source-workspace ZIP with its own retained UUID. It includes:

- The original SQLite workspace and native request history.
- Every retained source store and full member/inspection receipts.
- Saved selections, complete typed result files and all reviews.
- Frozen reviewed scalar source editions and original IDs.

It excludes transient operator attachment files and local-only lease descriptors. Independent receiving recreates its local leases. The packet explicitly excludes publisher stores, dataset targets and deployments. Those belong to the full installed merchant delivery assembled by the product receiving workflow.

Use the source packet for array-authoring portability. Use the full product handover for publisher plans, candidates, dataset versions, installed source, native dependencies and operation-specific delivery.

The browser checks the complete download’s byte count and SHA-256 before offering the ZIP. MCP supports stateless byte ranges, each bound to the same whole-file SHA and verified chunk SHA. A disconnected read can continue from the same offset after reconnecting.

Receiving uses a named packet and separate declared root. An exact retry reopens that same UUID destination through the original receiver, preserving workspace UUID, revision and history. Opening its operator is an explicit subsequent local action.

## Merchant MCP configuration

The source-owned provider uses:

- Provider ID **zarr-workspaces**.
- Family and config key **zarrWorkspaces**.
- Host configuration input **zarrWorkspaceConnection**.
- Tool prefix **merchant_zarr_**.

Create a private mode-0600 configuration:

~~~json
{
  "schema": "stellar-forge.zarr-workspaces.v1",
  "workspaces": {
    "measurements": {
      "label": "Original measurement authoring",
      "directory": "/srv/zarr/workspace",
      "workspaceId": "THE_ORIGINAL_WORKSPACE_UUID",
      "workspaceSha256": "THE_ORIGINAL_STORAGE_IDENTITY_SHA256"
    }
  }
}
~~~

Obtain the actual identity with:

~~~sh
zarr-workspace inspect-workspace \
  --directory /srv/zarr/workspace \
  --python /srv/zarr/python/bin/python
~~~

Supply that configuration to the original Merchant host’s source-owned **zarrWorkspaceConnection** input. The declaration reader resolves the host file; model-facing tools select only named aliases.

Call **merchant_zarr_status**, then **merchant_zarr_connect**. The attachment checks the private connection, original workspace UUID/storage identity and actual server instance. It never starts another server.

Tools cover preparation/apply, original operation/resume, complete typed result pages, frozen source verification, original publisher actions, complete source packet export/receive and immutable file ranges. Read-only progress and cancellation remain available during extraction. Disconnect drains accepted attachment calls and leaves application ownership intact.

## Applications

The original catalog entry is **Zarr workspace**, ID **zarr-workspace**. Select its existing private directory, host connection declaration, absolute installed Python executable and optional loopback port. The shared fields also support a private environment JSON.

Review and save through the original Applications model. Preparation binds the complete component file hashes, original directory/SQLite identity, workspace UUID, declaration hash and Python path. Its resource key prevents two original Applications operations from owning the same workspace.

The retained command is:

~~~text
zarr-workspace serve
  --directory ORIGINAL_DIRECTORY
  --connections ORIGINAL_CONNECTIONS
  --python ORIGINAL_PYTHON
  --source-directory SELECTED_ZARR_SOURCE
  --source-sha256 COMPLETE_SOURCE_SHA
  --workspace-identity ORIGINAL_STORAGE_SHA
  --connections-sha256 ORIGINAL_DECLARATION_SHA
  --startup-json
~~~

The original shared runner may append port and environment handling. Startup is one compact JSON line with schema **stellar-forge.zarr-workspace-startup.v1**, status **ZARR_WORKSPACE_READY** and private URL **zarrWorkspace**.

The observer verifies the reviewed source and actually launched release source, original workspace identity, private connection and live instance. It records the actual URL through the shared observer. An open port alone is not accepted as ownership.

**Stop** closes the actual owned command, original publisher work and listener. A later Start creates a new runtime instance against the same workspace. It does not initialize another source database or discard request history.

## Interfaces and limits

The native CLI emits one complete JSON response. The Node bridge bounds native JSON output at 64 MiB and JSON requests at 1 MiB. The original Python engine separately enforces complete source, per-member, selected-cell, native-memory and result-file limits.

| Operation | Authenticated route |
| --- | --- |
| Original status | GET /api/status |
| Exact native request | GET /api/operations/UUID |
| Complete result page | GET /api/results/SHA?offset=0&limit=100 |
| Reviewed scalar source | GET /api/frozen/SHA |
| Prepare / apply | POST /api/prepare and POST /api/apply |
| Same native resume | POST /api/resume |
| Original publisher | POST /api/publisher |
| Publisher receipt history | GET /api/publisher-requests |
| Same publisher recovery | POST /api/publisher-request/recover |
| Workspace export / receive | POST /api/export and POST /api/receive |
| Complete downloads | GET /api/files |
| Immutable byte range | GET /api/files/UUID/read?offset=0&limit=262144 |

Health returns only the fixed original service identity and readiness. It does not expose source or operation data.

## Source and receiving status

This implementation composes the original zarr-python engine, retained source workspace and dataset publisher. Public source contains no customer credentials or private customer data.

The component’s shared original receiving workflow is the authority for executed results and complete merchant handover. Source parsing or startup alone does not claim publication or purchase. Inspect its retained result for the exact source inputs, original workspace UUID/revision, completed results, reviewed frozen editions, publisher runs and full archive identities.
