# SeaTable source, publishing and operator workspace

This component turns an explicitly selected SeaTable table or saved view into a reviewed data product. It retains the provider's actual response bytes, lets an operator choose public columns and value rules, publishes through the existing dataset publisher, and hands the reviewed edition to the existing SF82 release service.

Use the [source workspace](WORKSPACE.md) for the complete browser, CLI, merchant MCP and managed Applications workflow. Use [provider acquisition and receiving](PROVIDER_INPUT.md) to connect the actual SeaTable service, retain the original observations and hand the same work to another operator. The source, packet, publisher and deployment interfaces below are also available independently.

## Installed product

The original distribution recipe is [seatable-merchant](../../distribution/selections/seatable-merchant.json). It selects the complete source-owned `seatable` and `seatable-authoring` contributions, the existing publisher/tool providers, and the original runtime, seller, release, buyer and MCP dependencies. Source selection happens before contribution composition, so unrelated products are not required to register this product.

The maintained builder and runtime installer keep the exact selected commit, recipe, source manifest and dependency profile:

~~~sh
SEATABLE_REPO=/absolute/path/to/tjlabs-stellar-merchant-workspace
SEATABLE_DIST="$SEATABLE_REPO/stellar/scf-starforge-20261009/distribution"
SEATABLE_COMMIT="$(git -C "$SEATABLE_REPO" rev-parse HEAD)"
SEATABLE_BUILD=/absolute/private/seatable-build
SEATABLE_RUNTIME=/absolute/private/seatable-runtime

node "$SEATABLE_DIST/build.mjs" \
  --repo "$SEATABLE_REPO" --ref "$SEATABLE_COMMIT" \
  --selection seatable-merchant --out "$SEATABLE_BUILD"
~~~

Read the actual PACKAGED receipt for the archive path and SHA256. Resume an interrupted build with the same output, commit and selection plus `--resume`. The build's `--status` command reads the saved build. Do not substitute a copied source directory for the retained archive identity.

For the complete native merchant and MCP profile:

~~~sh
node "$SEATABLE_DIST/runtime-install-cli.mjs" prepare \
  --dir "$SEATABLE_RUNTIME" \
  --archive "$SEATABLE_ARCHIVE" --sha256 "$SEATABLE_ARCHIVE_SHA256" \
  --native --feature mcp --operator --pins "$SEATABLE_PINS_FILE"

node "$SEATABLE_DIST/runtime-install-cli.mjs" install --dir "$SEATABLE_RUNTIME"
node "$SEATABLE_DIST/runtime-install-cli.mjs" inspect \
  --dir "$SEATABLE_RUNTIME" --load --source
~~~

The original profile's explicit native pins are `@x402/core`, `@x402/stellar` and `@x402/extensions` 2.28.0, plus `@stellar/stellar-sdk` 16.3.0. The MCP feature adds its separately declared dependency group. Use the actual installation receipt to locate the installed source and dispatcher; the normal layout is:

~~~sh
SEATABLE_SOURCE="$SEATABLE_RUNTIME/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/seatable"
SEATABLE_FORGE="$SEATABLE_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs"

node "$SEATABLE_FORGE" seatable-workspace --help
node "$SEATABLE_FORGE" seatable-source --help
node "$SEATABLE_FORGE" seatable-publisher --help
node "$SEATABLE_FORGE" seatable-deployment --help
~~~

Node 24 is required for exact JSON numeric-token inspection and the original SQLite workspace. The original private publisher lease uses Linux `flock`. The native seller/buyer profile retains its existing Python, POSIX and dependency requirements. Installing a source archive does not install optional runtime packages by itself.

## Complete operating path

1. Create a private workspace and configure an existing read connection through a token environment reference.
2. Inspect actual server/base/table metadata and select SQL or a real native view.
3. Capture all selected pages, the actual empty terminal page and the original metadata/version observations.
4. Review native values, public aliases, scalar types, empty and null handling. Validate every captured row and save an immutable source version.
5. Open the existing publisher from that saved version, choose the public column subset and extraction order, review its candidate and publish.
6. Review the published edition and public seller terms, prepare the five-file deployment package, and stage it in the original release store.
7. Use the existing release console for readiness, activation, buyer/client configuration, pinned editions, rollback and stop.
8. Reopen the same work or transfer its complete private packet. A packet import preserves the observation and does not call SeaTable.

The workspace entry is:

~~~sh
install -d -m 700 /absolute/private/seatable
node "$SEATABLE_SOURCE/workspace/cli.mjs" init \
  --directory /absolute/private/seatable/catalog

node "$SEATABLE_SOURCE/workspace/cli.mjs" serve \
  --directory /absolute/private/seatable/catalog \
  --connections /absolute/private/seatable-connections.json --port 0
~~~

The default workspace port is 8481; port 0 requests an available loopback port. Open the complete private URL returned by the process. The original workspace is the owner for browser, MCP and managed Applications. Close that owner before opening another process against the same workspace.

A private connections file contains aliases and environment-variable names, not token values:

~~~json
{
  "catalog": {
    "label": "SeaTable catalog read access",
    "server": "https://cloud.seatable.io",
    "tokenEnv": "SEATABLE_READ_TOKEN",
    "tokenKind": "api"
  }
}
~~~

Set the credential using the existing host's private credential mechanism. `api` exchanges the existing base API token for the provider's base access token; `base` uses an already-issued base access token. The exchange checks the actual base UUID and returned API gateway. Token responses and Authorization headers are not included in capture resources.

## Actual source semantics

The implementation targets the API-gateway v2 protocol used by current SeaTable. The original [OpenAPI source](https://github.com/seatable/openapi/tree/c6d0ad9c93af77718c2ab7fcea5939c333a7a915) and the current [API changelog](https://api.seatable.com/reference/changelog) define the endpoint and response contracts. The reader requires a reported SeaTable major version of at least 5, where the gateway row response includes explicit null-valued cells.

| Property | Constructed SQL selection | Existing native view |
| --- | --- | --- |
| Source selector | Actual base UUID and table ID; `viewId:null` | Actual base UUID, table ID and view ID |
| Provider request | Read-only parameterized SELECT through the v2 SQL endpoint | Native v2 List Rows with actual view ID |
| Filter | Declared bounded filter tree, compiled against actual field names | SeaTable's saved view filter |
| Source order | Explicit list including native `_id` as a stable tie breaker | SeaTable's saved view order; declared order must be empty |
| Field response | Selected scalar field union plus native row metadata | All visible native view fields plus row metadata |
| Count | Actual matching SQL count before and after the complete read | No count endpoint is invented |
| End of enumeration | Original empty page retained | Original empty page retained |
| Consistency | Matching opening/closing table schema, base version, server identity and counts | Matching opening/closing table schema, base version and server identity |
| Manifest | `PAGED_SQL_READ`, `countVerified:true` | `PAGED_VIEW_READ`, `countVerified:false` |

Both modes record `atomicSourceSnapshot:false`. These checks detect the source changes visible through this protocol; they do not turn a paged API read into a database transaction. A view capture can contain private visible fields beyond the public projection. The complete raw packet therefore remains a private operator artifact.

The native gateway documentation is authoritative for [SQL](https://api.seatable.com/reference/querysql), [List Rows](https://api.seatable.com/reference/listrows), [metadata](https://api.seatable.com/reference/getmetadata) and [automatically populated row fields](https://api.seatable.com/reference/models). Native fields such as `_id`, `_mtime`, `_ctime`, `_creator`, `_last_modifier`, `_locked`, `_locked_by` and `_archived` do not become public columns automatically.

## Declare exact columns and values

Start with [example-source.json](example-source.json) and replace every placeholder with actual inspected IDs. The example is a configuration template, not a provider fixture or completed capture. A discovery-only source may use an empty `queries` object and no SQL order while selecting actual metadata; capture requires the full reviewed projection and native identity order.

The declaration binds the following values into the capture's selection identity:

- Server and fixed reverse-proxy path, API version, base UUID, table ID and optional native view ID.
- SQL filter and source order, or the exclusive native-view selector.
- The complete union of selected field keys and their actual provider types across every query.

A retained capture can be reviewed with different public aliases, scalar encodings and null policies. It cannot be rebound to a different field union, table, view, filter or provider source order. Select a public subset later through the existing publisher's dataset columns. The publisher's extraction order changes the emitted edition without pretending the provider was read again.

Each query maps a public alias to a native field key and explicit output contract:

~~~json
{
  "catalog": {
    "columns": {
      "record_id": {
        "source": "$recordId",
        "type": "string",
        "encoding": "identity-text",
        "nullable": false,
        "empty": "preserve"
      },
      "title": {
        "source": "ACTUAL_TEXT_FIELD_KEY",
        "providerType": "text",
        "type": "string",
        "encoding": "native",
        "nullable": true,
        "empty": "preserve"
      },
      "amount": {
        "source": "ACTUAL_NUMBER_FIELD_KEY",
        "providerType": "number",
        "type": "string",
        "encoding": "number-text",
        "nullable": true,
        "empty": "preserve"
      }
    }
  }
}
~~~

`$recordId` exposes the native row ID as a string. Native `_id` is used in SQL ordering but is not a separately typed public source field.

Supported scalar provider families are text, email, url, long-text, number, percent, dollar, euro, duration, date, single-select, checkbox, rate, auto-number and explicitly reviewed scalar formula values. Structured families such as file, image, link, collaborator, multiple-select and geolocation are not flattened into scalar strings. A formula must be assigned an output type and every returned value must validate.

The exact numeric token is retained before conversion. `number-text` emits that token as text, including its original decimal/exponent spelling. Native numeric output is accepted only when its value survives the implementation's lossless conversion check; an unsafe integer is rejected. A date field remains the actual returned string; no timezone or date interpretation is invented.

An explicit JSON null is allowed only when `nullable:true`. A missing selected key is an error. Empty text is preserved unless `empty:"null"` is explicitly combined with nullable output. Query names and public aliases are stable identifiers; there are at most 32 queries and 64 public columns per query.

### SQL filter grammar

A leaf uses a real field key and one of `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `not-in`, `like`, `is-null` or `not-null`. Values are native strings or safe integers passed through the provider's parameters array. Null operators omit `value`; `in` and `not-in` accept a nonempty array of at most 100 values. Boolean, floating-point, raw SQL and interpolated expression inputs are not accepted by this filter interface.

~~~json
{
  "all": [
    {"field": "ACTUAL_STATUS_KEY", "op": "eq", "value": "Published"},
    {"field": "ACTUAL_AMOUNT_KEY", "op": "gte", "value": 100},
    {"not": {"field": "ACTUAL_TITLE_KEY", "op": "is-null"}}
  ]
}
~~~

`all` and `any` contain up to 32 non-null children; `not` has one child and nesting is bounded. Actual field and table names are taken from metadata and quoted by the reader. Names containing unsupported control, backslash or backtick characters are rejected instead of interpolated. Native views require `where:null` and `sourceOrder:[]`.

## Capture, inspect, resume and transfer

The source CLI is useful for scripted operations and receiving existing work:

~~~sh
node "$SEATABLE_SOURCE/cli.mjs" discover \
  --source /absolute/private/seatable-source.json

node "$SEATABLE_SOURCE/cli.mjs" capture \
  --source /absolute/private/seatable-source.json \
  --out /absolute/private/seatable-capture

node "$SEATABLE_SOURCE/cli.mjs" attempt \
  --capture /absolute/private/seatable-capture

node "$SEATABLE_SOURCE/cli.mjs" freeze \
  --source /absolute/private/seatable-source.json \
  --capture /absolute/private/seatable-capture/capture.json \
  --out /absolute/private/seatable-frozen.json
~~~

The parent directory must be private mode 0700; source/packet files must be private regular files without symlink/hard-link aliases. Raw tokens belong in the environment. Complete command results include exact file paths and SHA256 values; retain those receipts with the operating handover.

Capture writes its immutable source/bounds intent before reading. Each request retains its body and receipt in an atomic step. On explicit resume, a fully written unpublished step is checked against its exact request, size and hash and published before any new provider read. Published steps are reused. Only incomplete unpublished writer material is discarded; inconsistent complete observations are preserved and reported.

~~~sh
node "$SEATABLE_SOURCE/cli.mjs" capture \
  --source /absolute/private/seatable-source.json \
  --out /absolute/private/seatable-capture --resume
~~~

Use that same directory and selection after an interrupted network or file write. Credentials may rotate through the same environment reference; changing read limits, source selection or identity changes the retained intent. Source-schema/base-version/count changes, duplicate row IDs, unsupported projection values or exceeded immutable limits require review and a new capture selection/directory. Reopening the browser does not silently repeat a discovery or capture.

The attempt command reports committed steps/pages, retained bytes, timestamps, completeness and the last safe error metadata. `freshReadRequired` identifies source-consistency failures; it does not promise that every other error is recoverable without correcting the declared source. The workspace classifies the original error and presents the corresponding explicit action.

Transfer complete observations through the same validator:

~~~sh
node "$SEATABLE_SOURCE/cli.mjs" packet-export \
  --capture /absolute/private/seatable-capture/capture.json \
  --out /absolute/private/seatable-capture.packet.json

node "$SEATABLE_SOURCE/cli.mjs" packet-import \
  --source /absolute/private/seatable-source.json \
  --packet /absolute/private/seatable-capture.packet.json \
  --out /absolute/private/received-seatable-capture

node "$SEATABLE_SOURCE/cli.mjs" freeze \
  --source /absolute/private/seatable-source.json \
  --capture /absolute/private/received-seatable-capture/capture.json \
  --out /absolute/private/received-seatable-source.json
~~~

Packet import/export and freeze make no provider request. Packet validation checks the exact original manifest bytes and all expected resources, rejects duplicate/extra/traversal members, and preserves the original source timestamps and response receipts. Interrupted same-byte import and output-file publication support explicit `--resume`; different existing bytes are never overwritten.

The capture packet carries the raw observation. The workspace's source packet additionally carries the reviewed source projection and its original identity. Its importer delegates raw validation and copying to the provider packet API, then binds the source to that exact capture. Use the source workspace's packet export for a full authoring handover.

## Publisher and release handoff

`openSeaTablePublisher` is the SeaTable driver for the original `openSourceDatasetPublisher`. It reuses the original immutable plans, candidate review, publication store, schedules, browser and buyer handoff. It does not maintain a second edition ledger.

For repeatable work, publish from a frozen capture-backed source version. Saving a publication plan retains its exact source bytes and complete capture inside the original plan. Existing completed plan/candidate/publication identities remain the basis of review and reopen. A REST-backed source can perform the explicit native read during extraction; use the retained source workflow when one already-completed provider capture should serve later iterations.

The source CLI delegates the original publisher:

~~~sh
node "$SEATABLE_SOURCE/publisher/cli.mjs" --help
~~~

The default publisher browser port is 8472. From the authoring workspace, **Open publisher** uses its original publisher and dataset paths. Close the source owner normally before reopening its retained publisher from another interface.

The original deployment package has exactly these public-serving inputs:

| File | Retained meaning |
| --- | --- |
| dataset.csv | Exact reviewed public edition bytes |
| dataset.json | Original CSV schema and limits, relocated to the packaged CSV |
| seller.json | Original seller configuration built from reviewed public origin, route and payment terms |
| source.json | Source version/capture, original candidate, review and publication identity |
| binding.json | Original SF82 file and dataset binding |

The package excludes raw provider tokens and full raw captures. It includes only the selected public dataset and its serving contract. Review returns `reviewSha256`; prepare requires that exact value. Stage requires the expected package source SHA256 and creates or resumes the original release-store initialization. A valid existing release store is read unchanged; partial or unrelated state is never reset.

~~~sh
node "$SEATABLE_SOURCE/deployment-cli.mjs" review \
  --publisher /absolute/private/seatable-publisher \
  --run ACTUAL_PUBLISHED_RUN_ID --terms /absolute/private/public-terms.json

node "$SEATABLE_SOURCE/deployment-cli.mjs" prepare \
  --publisher /absolute/private/seatable-publisher \
  --run ACTUAL_PUBLISHED_RUN_ID --terms /absolute/private/public-terms.json \
  --review ACTUAL_REVIEW_SHA256 --out /absolute/private/seatable-deployment

node "$SEATABLE_SOURCE/deployment-cli.mjs" inspect \
  --package /absolute/private/seatable-deployment
~~~

Stage and operate through `seatable-deployment --help` and the original SF82 console. The browser workspace supplies the same review/prepare/stage controls and exact retained IDs. Public origin and resource references do not authorize a different provider read or create a payment. A payment-required HTTP response verifies routing only; a completed paid operation needs its original settlement and delivery records.

## Module interfaces

| Module / export | Input | Result / ownership |
| --- | --- | --- |
| declaration.mjs / readSeaTableSourceFile | Private source filename | Exact source bytes/hash, normalized binding, compiled queries and optional capture path |
| http.mjs / discoverSeaTableTable | Original REST config and optional env/signal | Actual server/base/table/field/view metadata, including native identity |
| capture.mjs / captureSeaTableSource | Config, private capture directory, optional explicit resume | Full verified capture and original manifest path/hash |
| capture.mjs / inspectSeaTableCaptureAttempt | Original capture directory | Safe read-only attempt summary |
| capture.mjs / readSeaTableCapture | Manifest path and optional expected SHA256 | Verified manifest/resources/native rows |
| capture.mjs / bindSeaTableCapture | Verified capture and config | Same original rows after full selection-identity check |
| capture.mjs / export/read/importSeaTableCapturePacket | Capture or packet bytes; original target/config on import | Complete original observation, same-byte receiving/recovery |
| source.mjs / inspectSeaTableSource, openSeaTableSourceFile | Private source filename | Original publisher-compatible inspection/extraction |
| publisher/model.mjs / openSeaTablePublisher | Original publisher options | Existing publisher with the SeaTable driver |
| deployment.mjs / review/prepare/inspect/stageSeaTableDeployment | Original published run, reviewed terms and destination | Immutable five-file package and original SF82 release |
| workspace/model.mjs / openSeaTableAuthoring | Original private authoring options | Browser/CLI/MCP owner and retained-source lifecycle |

The source-authoring guide documents exact method returns, HTTP token/header and request UUID/CAS behavior. The original source/publisher APIs validate private paths, sizes, source identity and complete rows at their native boundary. Code and guide changes are published as source; the provider receiving result records the actual installed/runtime observations separately.

## Maintenance and source provenance

Keep the source revision, selected build manifest, original install receipt, connection references, source/capture hashes, selected workspace version and publisher/release IDs together. A source upgrade is distinct from a new provider observation. Reopen old work against its declared source and inspect it before any new capture, selection or publication. If the provider protocol changes, qualify its actual metadata/response schema and update this original adapter.

The implementation extends the MIT-licensed original Stellar Forge source/publisher/SF82 modules. The provider contract was qualified against SeaTable's official OpenAPI commit `c6d0ad9c93af77718c2ab7fcea5939c333a7a915` (v6.2 branch) and the current first-party Models, SQL, metadata, List Rows and changelog pages. No customer base, credentials, raw capture or upstream fixture database is committed in this component.

For service acquisition, comply with the actual chosen SeaTable edition. [Official editions](https://admin.seatable.com/introduction/editions/) distinguish the license-free Developer Edition's permitted internal use from providing a SaaS service. A production customer deployment must use its authorized existing service or appropriate licensed edition. This source implementation does not procure a provider plan or create a paid host.
