# CouchDB data products

Operate selected CouchDB documents as a reviewed data product from one private workspace. Capture the actual native response pages, document revisions, conflicts, opaque change sequences and selected attachment bytes. Inspect original JSON values, save typed field mappings, publish through the existing dataset writer, prepare and operate a seller through SF82, generate its original customer client, and receive the complete workspace on another host.

The browser, CLI, managed Applications entry and merchant tools share the same workspace identity and saved operation UUIDs. Native reads belong to the original capture; later extraction and publication use its retained bytes.

## Install and open

Use a Linux operator host with Node 24 or newer, Python 3, Git/npm for the original installation, and util-linux flock. CouchDB can remain on its existing selected host. Node fetch uses the existing host's certificate trust; the connection profile retains credential environment variable names.

Build the complete selected product from an explicit source commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --ref ACTUAL_COMMIT --selection couchdb --out /private/couchdb-build
~~~

Retain the returned original archive path, SHA-256, source commit and selection identity. Use the maintained runtime installer:

~~~sh
starforge runtime-install prepare \
  --dir /private/couchdb-runtime \
  --archive /private/downloads/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 --native --feature mcp --operator
starforge runtime-install install --dir /private/couchdb-runtime
starforge runtime-install inspect --dir /private/couchdb-runtime --load --source
starforge runtime-install run --dir /private/couchdb-runtime -- registrations --source couchdb
starforge runtime-install run --dir /private/couchdb-runtime -- merchant-providers inspect couchdb-workspaces
~~~

CouchDB acquisition uses the native HTTP protocol and the installed Node runtime. The original native selection supplies the seller's Stellar dependencies; mcp supplies the existing merchant host. An equipped host can use the installer's original offline cache/adoption workflow. Keep its retained preparation and lock when resuming installation.

Initialize a private workspace, retain its returned UUID, then start the same source:

~~~sh
starforge runtime-install run --dir /private/couchdb-runtime -- \
  couchdb-workspace init --directory /private/couchdb/author
starforge runtime-install run --dir /private/couchdb-runtime -- \
  couchdb-workspace serve --directory /private/couchdb/author \
  --expected-workspace-id ORIGINAL_WORKSPACE_UUID --port 0
~~~

Open the printed private URL. Its capability token belongs to that actual listener. The private connection.json in the workspace records its current instance, URL, source identity and PID.

For managed operation, attach the READY runtime in the original Runtime workspace and select **CouchDB data products** under Applications. Choose the initialized workspace and the private JSON environment file containing its existing credentials. Review and save the application, review its start, and open the returned original URL. Stop, restart, upgrade and roll back through that same Applications owner. The source-owned startup observer checks the original workspace file, reviewed arguments and actual live authenticated listener.

## Select the actual source

In **Source**, edit the complete secret-free connection JSON and save it. The examples below are editable source shapes; choose the real database, document IDs and original environment variables.

~~~json
{
  "schema": "stellar-forge.couchdb-connection.v1",
  "baseUrl": "http://127.0.0.1:5984",
  "database": "documents",
  "auth": {
    "kind": "basic",
    "usernameEnv": "COUCHDB_USER",
    "passwordEnv": "COUCHDB_PASSWORD"
  },
  "selection": {
    "kind": "ids",
    "ids": ["invoice:1001", "invoice:1002"]
  },
  "attachments": {"mode": "all"}
}
~~~

Authentication supports none, basic, bearer and the original AuthSession cookie through named environment variables. HTTPS server URLs preserve certificate validation. Requests stay on the selected original origin and do not follow redirects.

| Selection | Original operation |
| --- | --- |
| ids | POST native _all_docs keys in deterministic pages; preserve every selected ID, missing row, winning revision and included original document. |
| range | Read a selected native document-key range using the last exact key as the next page anchor. startKey, endKey and inclusiveEnd retain the chosen range. |
| changes | Read the normal native _changes feed with included documents and all_docs revision style. Preserve each raw sequence token and exact continuation. The last returned winning revision for a repeated ID is the captured row. |

A changes profile can choose IDs and an original since value. The captured endSequence contains its exact JSON, kind and query representation; use that complete record when configuring a new continuation. Selecting a previous retained capture keeps its full source closure. The logical source identity excludes only the advancing sequence, so edition comparison remains bound to the same database and selection.

Attachments may select none, all or explicit names entries containing documentId and name. Each retained body is fetched against its exact captured document revision. The source keeps its native digest, content type, declared lengths and the received SHA-256; unavailable or compacted revisions remain explicit original outcomes.

Before/after database metadata and the native server identity travel with the capture. Concurrent database changes, missing documents, deleted rows and conflicts are visible in the capture counts and field review. A multi-page capture describes its actual selected revisions; the saved query review explicitly records which original conditions the operator accepted.

Default limits include 100 rows per page, 250,000 selected documents, 64 MiB per response, 128 MiB per attachment, 1 GiB total acquisition and 30 seconds per request. Each profile carries its actual effective limits. The retained request, document index and complete native JSON each have a 256 MiB ceiling checked before publication. Supported larger document selections must also fit that original serialized request. A stopped acquisition retains its request, accepted pages and attachment bytes under the same operation UUID.

## Review fields and exact values

Choose a complete capture, inspect its documents/attachments, and select **Inspect complete fields**. The mapping view lists original JSON pointers, kinds, missing counts and actual examples. Select output columns and choose their storage:

| Mapping | Result |
| --- | --- |
| type string, encoding value | Original text as CSV text. |
| type integer or number, encoding value | Native numeric column when the exact original value survives that numeric representation. |
| type string, encoding decimal | The original numeric JSON token as text, preserving large integers and fractional precision. |
| type string, encoding json | The original JSON value, including arrays, objects, booleans and null, as one text column. |
| missing null and nullable true | An explicitly reviewed missing value maps to the dataset's null representation. |
| empty null or preserve | The selected native dataset treatment of an original empty string; choose it explicitly for nullable text. |

The source adapter refuses silent numeric rounding and checks the complete row/byte limits before handing a row to the original publisher. Nested objects and arrays remain exact original JSON when selected through JSON encoding. The original capture always retains all selected source bytes.

Compose the complete query JSON, inspect it, then save it against the shown capture SHA. A query uses a column map, optional documentIds and a review:

~~~json
{
  "invoices": {
    "columns": {
      "document_id": {"pointer": "/_id", "type": "string"},
      "revision": {"pointer": "/_rev", "type": "string"},
      "amount": {"pointer": "/amount", "type": "string", "encoding": "decimal"}
    },
    "review": {
      "reviewer": "Assigned operator",
      "note": "The recorded review of these selected original documents.",
      "allowConflicts": false,
      "allowMissing": false,
      "allowDeletions": false,
      "allowConcurrentChanges": false
    }
  }
}
~~~

The four review choices must reflect the actual selected capture. Their accepted original values remain in the saved source, extraction candidate, deployment and receiving package.

## Publish and operate

In **Publication**, create a product from the selected mapping. To adopt a later source edition, select its mapping with the product's current revision guard.

Compose and save the dataset plan. Its source hash, selected query, input, output column types, page contract and extraction order remain explicit. The original publisher saves the plan and full retained capture in its own private SQLite workspace. Start extraction, inspect the resulting CSV/candidate preview, and review its exact candidate digest.

For the first publication, the review selects initialize:true against the absent original target. A later refresh reviews expectedSnapshot and expectedRevision against the running original versioned dataset seller. Publishing uses its existing writer lease and version history. **Recover original run** reconciles a retained candidate or an uncertain publication through that same native owner.

In **Releases**, supply the merchant's actual HTTPS origin, route and payment terms. The original dataset seller compiler validates scheme, network, asset, amount, recipient and timeout. Review the complete published source and terms, prepare that exact review, and stage the resulting package with its source SHA.

Open the original SF82 console for the retained release. Its inspect, compare, activate, run, stop, restart, receiving and settlement operations keep their native generation, release digest and instance guards. The workspace records each forwarded command before transmission and reconciles an uncertain native reply against the original state.

The native seller serves the original versioned dataset. Its existing public metadata generates the original public customer client and OpenAPI. Use **Customer exports** to inspect that manifest and download every original file. The whole private workspace export retains the authoring source, original query decisions, attachments, customer completion and complete seller packages.

## Saved operations and restart

Every action is identified by workspace UUID, operation UUID, command and complete input. The browser commits that exact body and digest in IndexedDB before POST. CLI and MCP callers supply the same operation UUID and unchanged input. A changed input uses a new operation.

The Operations view pages compact source-bound summaries. Opening an operation loads its complete retained request and result. A lost response is recovered by reading or resending that exact saved operation; Resume dispatches only its original retained input. A stopped native capture reuses its accepted original pages. A completed extraction, review, publication or export reopens its original outcome.

An incomplete capture remains visible with its continuation state. The authenticated browser journal remains usable if another capture or publication view cannot yet be opened. The current original native process and file leases prevent concurrent writers.

Ephemeral release consoles and listener URLs belong to their current native instance. After a process restart, open the current console with a new console operation UUID, then select its actual observed native release state. Historical operations preserve their original outcomes.

## Merchant tools and host paths

Create one private host connection file. Its values refer to the original workspace and selected local receiving locations:

~~~json
{
  "schema": "stellar-forge.couchdb-merchant-connection.v1",
  "workspaces": {
    "documents": {
      "label": "Document merchant",
      "workspaceId": "ORIGINAL_WORKSPACE_UUID",
      "connectionFile": "/private/couchdb/author/connection.json",
      "imports": {
        "approved_capture": {
          "kind": "capture",
          "file": "/private/incoming/capture/capture.json",
          "sha256": "ORIGINAL_CAPTURE_SHA256"
        }
      },
      "deliveries": {
        "handover": {"directory": "/private/couchdb/downloads"}
      },
      "receivers": {
        "next_host": {"directory": "/private/couchdb/received"}
      }
    }
  }
}
~~~

Host imports support connection, capture and client. A client import declares directory, exportId and the original client-manifest sha256. A connection/capture import declares file and sha256. Host paths and source digests are configured before agent operation.

~~~sh
starforge couchdb-agent init --options /private/couchdb/merchant-setup.json
starforge couchdb-agent serve --config /private/couchdb/merchant/merchant-mcp.json
starforge couchdb-agent call \
  --connection /private/couchdb/agent-connection.json \
  --tool merchant_couchdb_status --input /private/couchdb/status-input.json
~~~

Setup JSON contains directory, connection, optional name and optional initialized releaseStore. To use the same common merchant-host SF82 store, select the workspace's already initialized /private/couchdb/author/releases. Otherwise setup creates its own original common host store. CouchDB release tools always operate the store belonging to their selected workspace.

The source-owned merchant provider exposes complete capture, field mapping, product, publication, release and customer actions, plus original queries, compact operations, full operation inspection, resume/cancel, host imports and complete project transfer. Each action tool takes workspace, workspaceId, operationId and its original input object. Query tools retain native pagination. File tools use the original RetainedFileReads owner: open an expected SHA, continue readId/nextOffset, release it when done, or reopen the same SHA and offset after listener restart.

## Transfer and receive the complete workspace

Stop the selected original seller, then choose **Export complete workspace**. The source captures the same publisher decisions, dataset version files and release source under their existing native leases. Retain the full ZIP and its SHA-256. Interrupted HTTP downloads resume from the verified original byte prefix:

~~~sh
starforge couchdb-workspace download export \
  --connection /private/couchdb/author/connection.json \
  --input /private/couchdb/export-selection.json \
  --directory /private/couchdb/download \
  --operation ORIGINAL_DOWNLOAD_UUID \
  --sha256 ORIGINAL_ARCHIVE_SHA256 --bytes ORIGINAL_ARCHIVE_BYTES
~~~

The export selection is {"id":"ORIGINAL_PROJECT_EXPORT_OPERATION_UUID"}. Receiving uses a new private directory:

~~~sh
starforge couchdb-workspace inspect \
  --archive /private/couchdb/download/file.bin --sha256 ORIGINAL_ARCHIVE_SHA256
starforge couchdb-workspace receive \
  --archive /private/couchdb/download/file.bin --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --directory /private/couchdb/received
~~~

The receiver verifies every original member and native capture. It preserves the workspace UUID, original operations, publisher SQLite decisions, plan-relative sources, dataset contract and all retained versions. Its explicit local sourceFile/targetDirectory bindings point to the receiving workspace. The full original archive remains retained alongside the received source.

Original release packages and their prior host bindings remain preserved. Use deployment.rebind against the inspected original source/execution SHA and received product to review a new local binding, then stage that new package. The new source/execution identity retains the original source and binding as source files. Customer exports keep their original public completion and hashes.

Completed receiving reopens its original receipt, so replay does not overwrite later work in the receiving workspace. Archive extraction, staging-link reconciliation, SQLite, dataset and release lifetime use the maintained native components.

## Complete actual-engine receiving command

The installed couchdb-receive command runs one complete source-to-customer operation against the selected actual CouchDB host. Its private input is:

- schema: stellar-forge.couchdb-native-receiving.v1 and an original UUID id;
- connection: the complete reviewed native connection profile;
- queries: the complete original column/query review;
- plan: title, query, input, dataset and extraction accepted by the original publisher;
- terms: actual merchant origin/path/payment;
- reviewer and note: the original publication review;
- optional runtime: original SF82 port/facilitator selection.

~~~sh
starforge couchdb-receive \
  --directory /private/couchdb/native-receiving-operation \
  --input /private/couchdb/native-selection.json
~~~

The same command retains its input before source reads and resumes its original steps. It captures actual revisions, publishes the reviewed dataset, stages and runs the original seller, generates/transfers the customer files, reopens the publication through merchant tools, exports the complete source, makes the original sender path unavailable, and receives into its new workspace. It then reopens the exact original capture/review/publication/customer and stages an explicitly rebound native release. Its result names the actual native engine, source SHA, document counts, original review/run IDs and archive/customer identities.

The private operation retains receiving-input.json, transfer.json, the complete original download, original customer files and receiving-result.json. It preserves the moved original sender for inspection. Repeat that same operation directory and unchanged input to continue it.

## Native contracts and source

The connection uses the original CouchDB APIs documented at:
- https://docs.couchdb.org/en/stable/api/database/bulk-api.html
- https://docs.couchdb.org/en/stable/api/database/changes.html
- https://docs.couchdb.org/en/stable/api/document/attachments.html
- https://docs.couchdb.org/en/stable/api/server/authn.html

Implementation lives in stellar/scf-starforge-20261009/sf30-seller-sdk/couchdb. Its source-owned declaration is distribution/contributions/couchdb.json; its installed product recipe is distribution/selections/couchdb.json. The capture, source, publisher, operator, deployment, portable, native receiving and merchant interfaces are exported by that same selected package.
