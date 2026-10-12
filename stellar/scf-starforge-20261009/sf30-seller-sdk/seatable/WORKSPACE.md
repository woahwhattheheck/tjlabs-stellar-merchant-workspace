# SeaTable source workspace

SeaTable source authoring turns a declared source into an explicitly reviewed, immutable source version for the existing Stellar Forge dataset publisher. The browser, CLI and merchant MCP use the same model, SQLite state, native workspace lease, original capture reader and publisher. Managed Applications starts that same workspace.

The complete path is:

1. Initialize one private workspace and declare its read connection, or import a complete retained source packet.
2. Inspect the actual SeaTable base/table metadata. Choose constructed SQL or an existing native view.
3. Capture the complete selected source through the provider reader.
4. Inspect native field values, choose public aliases and scalar/null handling, save a draft and validate every row.
5. Review the capture time, source rows, emitted rows and column rules; freeze the exact source version.
6. Open the original publisher to select the public column subset and extraction order, review its actual candidate, and publish.
7. Review that exact published edition for SF82, prepare private staging files, stage the release and operate it through the original release controls.
8. Close the owner and reopen the same saved work. Portable private packets carry the original observation to a different workspace when needed.

Opening a workspace does not capture the provider, extract or publish a dataset, start a seller, or send a payment. Those remain explicit actions in the original engines. A prepared package and a payment-required response are not evidence of a completed buyer payment.

## Source and installed entry points

The source entry is `seatable/workspace/cli.mjs`. The additive distribution contribution registers:

| Entry | Original implementation |
| --- | --- |
| `seatable-workspace` | `workspace/cli.mjs` |
| `./seller/seatable/workspace` | `workspace/model.mjs` |
| `./seller/seatable/workspace/server` | `workspace/server.mjs` |
| `./seller/seatable/workspace/launch` | `workspace/launch.mjs` |
| `./seller/seatable/workspace/packet` | `workspace/packet.mjs` |
| `./seller/seatable/workspace/mcp` | `workspace/mcp.mjs` |
| Applications choice `seatable-authoring` | `workspace/application-provider.mjs` |
| Merchant provider `seatable-workspaces` | `workspace/merchant-provider.mjs` |

The source-owned providers use the maintained shared loaders. No copied Applications scheduler, merchant tool server, publisher, release store or source transport is introduced.

Use Node 24 for the native SQLite API. The original native merchant/payment profile also needs the POSIX utilities and Python dependencies documented by the maintained distribution; this operator does not replace them. A source-only archive does not prove those optional native dependencies are installed.

Build through the original distribution from the selected exact source commit. Use the repository and output paths for your installation:

~~~sh
SEATABLE_REPO=/absolute/path/to/tjlabs-stellar-merchant-workspace
SEATABLE_DIST="$SEATABLE_REPO/stellar/scf-starforge-20261009/distribution"
SEATABLE_COMMIT="$(git -C "$SEATABLE_REPO" rev-parse HEAD)"
SEATABLE_RELEASE=/absolute/private/seatable-release

node "$SEATABLE_DIST/build.mjs"   --repo "$SEATABLE_REPO" --ref "$SEATABLE_COMMIT"   --selection seatable-merchant --out "$SEATABLE_RELEASE"
~~~

The original build retains its selected commit, source manifest, archive and SHA256 in its receipt. Read the actual `distribution.json`; use the returned archive path and digest rather than guessing an archive filename. If the build is interrupted, use the same selected commit and output with the original `--resume` option.

For the complete merchant/MCP/Applications path, use the original runtime installer:

~~~sh
node "$SEATABLE_DIST/runtime-install-cli.mjs" prepare   --dir "$SEATABLE_RUNTIME"   --archive "$SEATABLE_ARCHIVE" --sha256 "$SEATABLE_ARCHIVE_SHA256"   --native --feature mcp --operator --pins "$SEATABLE_PINS_FILE"

node "$SEATABLE_DIST/runtime-install-cli.mjs" install --dir "$SEATABLE_RUNTIME"
node "$SEATABLE_DIST/runtime-install-cli.mjs" inspect --dir "$SEATABLE_RUNTIME" --load --source
~~~

Supply the actual paths and archive digest returned by the build. The existing pinned native profile can use:

~~~json
{
  "@x402/core": "2.28.0",
  "@x402/stellar": "2.28.0",
  "@x402/extensions": "2.28.0",
  "@stellar/stellar-sdk": "16.3.0"
}
~~~

The `mcp` feature supplies the original MCP dependency group; the native profile alone does not supply it. Optional packages must resolve from the installed runtime's common source ancestry. Installing dependencies only below a sibling buyer component does not make them available to the source or facilitator's ESM imports.

For an existing prepared installation, use `runtime-install-cli.mjs resume --dir SAME_RUNTIME`. Preserve its retained profile, pins and receipt. The installed command dispatcher is:

~~~sh
SEATABLE_FORGE="$SEATABLE_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs"
node "$SEATABLE_FORGE" seatable-workspace --help
~~~

All following examples invoke the same CLI directly from a selected source root:

~~~sh
SEATABLE_SOURCE="$SEATABLE_RUNTIME/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/seatable"
~~~

## Initialize and open private work

Choose a new workspace path. Create its private parent directory, not an unrelated pre-existing workspace containing arbitrary files.

~~~sh
install -d -m 700 /absolute/private/seatable
SEATABLE_WORK=/absolute/private/seatable/catalog

node "$SEATABLE_SOURCE/workspace/cli.mjs" init   --directory "$SEATABLE_WORK"

node "$SEATABLE_SOURCE/workspace/cli.mjs" serve   --directory "$SEATABLE_WORK" --port 0
~~~

The browser URL includes a private fragment token. Open the complete URL printed by the current process. The browser retains the token only in its session storage and removes it from the visible address. HTTP serves only loopback, checks the actual Host and Origin, and requires the token for workspace data/actions. Do not publish this URL as a customer endpoint.

The original workspace contains `sources.sqlite`, immutable retained input/capture/version files, request receipts and the one managed source path. The dataset defaults to the workspace's `dataset/` and the original publisher to `publisher/`. Initialization accepts `--target` for a separate absolute dataset directory. Its initial binding is retained; reopening with a different target is rejected.

An interrupted initialization may be reopened only with the same retained initialization intent. Existing private work is reopened without `--create`. The initializer does not replace an unrelated or invalid existing directory.

Stop with Ctrl-C or the original owner's Stop action. Stop closes HTTP admission, aborts and drains the current provider operation, drains borrowed publisher access and original publisher/deployment services, then releases the native lease. Do not run a second CLI, MCP owner or Application against the same workspace while the first owns that lease.

## Declare a read connection

A private host file maps friendly aliases to the original provider options. Credential values remain in the existing host environment or credential setup; the file carries the environment variable name.

~~~json
{
  "catalog": {
    "label": "SeaTable catalog read connection",
    "server": "https://cloud.seatable.io",
    "tokenEnv": "SEATABLE_READ_TOKEN",
    "tokenKind": "api"
  }
}
~~~

`tokenKind` is `api` by default or `base` when the original provider is given a base token. The provider owns the API-token exchange, endpoint validation and actual read permissions. Configure the named variable through the existing private host mechanism. Never paste its value into source files, browser fields, packets, shared guides or logs.

Optional host settings are `allowHttp`, `pageSize`, `maxPageBytes`, `maxCaptureBytes`, `maxPages`, `maxRows`, `timeoutMs` and `requestIntervalMs`. The original provider validates their bounds. Use `allowHttp` only for a deliberately configured development service accepted by that provider.

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" serve   --directory "$SEATABLE_WORK" --port 0   --connections /absolute/private/seatable-connections.json
~~~

The browser lists declared aliases, safe server origin, token kind and configured/missing state. It cannot choose another environment key or arbitrary local source path. Changes to a connection file require a normal stop/review/reopen of the owner; they do not silently replace a running connection.

If the original publisher buyer handoff is configured, the CLI accepts `--seller PUBLIC_SELLER_ORIGIN --resource PUBLIC_RESOURCE_URL` together. These are public HTTP(S) endpoint references without URL credentials or fragments. Passing them does not start a seller or pay for anything.

## Choose SQL or a native view

In **Capture source**, choose the declared connection and enter the actual base UUID and table ID. The initial values must come from the actual provider. **Inspect actual metadata** retains the real table fields, types, views and original source identity. Previously inspected metadata remains available by request UUID.

The provider has two distinct source contracts:

| Selection | Rows and filters | Order | Completeness evidence |
| --- | --- | --- | --- |
| Constructed SQL, no view ID | The original reader constructs a read-only SQL selection from actual field keys and the optional declarative filter. | Explicit source order must include the native `_id` tie breaker. | All native pages plus opening/closing count and metadata/version observations. `countVerified` comes from the native count result. |
| Existing native view ID | SeaTable's saved view chooses rows. A separate SQL filter is disallowed. | SeaTable's native view order is retained; `sourceOrder` must be empty. | All view pages through the native terminal page plus original metadata/version observations. `countVerified:false`; no independent count is invented. |

Both are paged observations. `atomicSourceSnapshot:false` is explicit. They are not a database transaction snapshot and the guide does not represent them as one.

The SQL filter editor accepts a JSON AST, not free-form SQL. The original reader validates the field keys, operators, values and bounded tree. For example, after replacing the field key with a real inspected one:

~~~json
{"field":"actual-field-key","op":"eq","value":"published"}
~~~

Compound filters use the provider's `all`, `any` or `not` forms. Consult the provider source guide for the full supported operator set. To use a saved view, enter its actual view ID and clear this filter. The browser displays which mode is selected and hides the SQL-order editor for a native view.

For SQL, keep `_id` in the order. Other order fields must be actual supported scalar fields. The UI exposes native identity as `record_id` with source `$recordId` when you choose to publish it; it does not reinterpret a native identity as a JavaScript number.

After changing the source fields in the metadata form, inspect the updated selection again. The previous capture controls are removed until that observation is selected. Choosing a previously retained discovery fills the visible form with that discovery's exact source.

## Capture and inspect actual fields

In the capture table, choose the actual scalar fields to retain. Each selected column has a public alias, scalar type, value encoding, null policy and empty-string policy. At least one valid query and column are required by the original compiler. Query and public alias names must be unique valid identifiers.

Select **Capture every selected page**. The source model saves a stable request UUID before dispatch and retains the complete provider result through the original capture engine. It does not fetch pages through a second HTTP client.

A capture preserves the selected server/base/table, native view or declarative SQL filter, source order, field/type union, metadata, original page bytes and original completeness evidence. Its immutable manifest SHA256 is the observation identity.

**Review** on an observation shows every retained field's native type, null/missing/empty/structured counts and up to five native samples. Numeric samples retain their original JSON number lexeme. All captured data remains private at this stage.

The defaults favor exact values:

| Native field type | Suggested public representation |
| --- | --- |
| text, long-text, email, url, date, single-select, auto-number | String with native encoding |
| number, percent, dollar, euro, duration | String with `number-text` encoding |
| rate | Integer with native validation |
| checkbox | Boolean |
| Native row identity | Required string with `identity-text` |
| formula | An explicitly selected scalar type; every value is validated |
| collaborator, multiple-select, image, file, link, link-formula, geolocation, digital-sign | No suggested scalar projection |

Do not use a string cast as a substitute for a complete structured value. The original provider/compiler rejects unsupported structured projections and missing selected fields. Nullable means a retained JSON null is allowed; it does not turn an absent field into null. Empty-string conversion is a separate explicit choice.

Native numeric output is available only when the original lossless conversion validates it. `number-text` preserves the provider token rather than rounding through JavaScript Number. The browser forces an explicit type for a newly selected formula field.

### Capture from the CLI

Use one explicit request UUID and save its output. This example assumes a fresh workspace with draft revision 0; read the current revision first for an existing workspace.

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" discover   --directory "$SEATABLE_WORK"   --connections /absolute/private/seatable-connections.json   --connection catalog --base ACTUAL_BASE_UUID --table ACTUAL_TABLE_ID   --request 11111111-1111-4111-8111-111111111111
~~~

For SQL, add `--where-file PRIVATE_FILTER.json` if needed. `--where JSON` is also supported; the two are mutually exclusive. For a native view, add `--view ACTUAL_VIEW_ID` and no SQL filter.

Save a private capture selection with the actual discovery UUID and actual field key/type. A SQL example is:

~~~json
{
  "discoveryId": "11111111-1111-4111-8111-111111111111",
  "connectionAlias": "catalog",
  "sourceOrder": [{"field":"_id","direction":"asc"}],
  "queries": {
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
        }
      }
    }
  }
}
~~~

For a native view, use its retained discovery and `"sourceOrder":[]`.

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" capture   --directory "$SEATABLE_WORK"   --connections /absolute/private/seatable-connections.json   --selection /absolute/private/seatable-selection.json   --title "Catalog observation" --expected-revision 0   --request 22222222-2222-4222-8222-222222222222
~~~

The returned capture has its original row/page count, manifest hash and source binding. The receipt reports whether it also saved the draft. If another window advanced that draft, `draftSaved:false` preserves the complete observation without overwriting the newer draft.

## Import an existing complete source

Importing a frozen source performs no provider request. The original source declaration must already point to a complete retained capture. The host CLI can select its absolute private path:

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" import-source   --directory "$SEATABLE_WORK"   --source /absolute/private/original/source.json   --title "Original retained catalog" --expected-revision 0   --request 33333333-3333-4333-8333-333333333333
~~~

The same source can be made portable:

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" packet   --source /absolute/private/original/source.json   --out /absolute/private/original-seatable-source.json
~~~

In the browser, **Import complete original capture** accepts this complete source packet. The browser cannot name an arbitrary host path. MCP uses a host-declared input alias and the reviewed exact SHA256.

The authoring packet is a facade over the provider-owned complete capture packet. The provider validates every raw member and copies it with its original create-only, exact-member recovery. The facade carries the reviewed source query map plus safe origin/version identifiers; it does not implement another capture format or infer missing pages.

## Save, validate and freeze a source version

The source draft carries `captureId`, `title` and a complete `queries` map. The captured field/type union and source selection remain fixed. You may change aliases, supported scalar encodings and null/empty policy, or arrange the same retained field union across queries. Removing the last declaration of a captured field fails the original binding check.

Choose the narrower customer-facing column subset later in the original publisher. Source authoring adds no additional row filter to the retained SQL selection or native view.

1. Select an observation or a saved version's draft.
2. Edit the query/column controls and select **Save draft**. This uses the editor's original expected draft revision.
3. Select **Validate every row**. The original typed reader checks every retained row and reports the emitted rows for each query. The browser shows at most 25 preview rows.
4. Read the review summary: exact capture hash and completion time, source rows, emitted rows, SQL/view completeness, public aliases, native field IDs, scalar encoding and null/empty policy.
5. Enter a reviewer and change note, then select **Freeze and select source version**.

The preview order is the first configured public column ascending. It is shown explicitly. The final publication order is chosen in the original publisher and is pinned in that publisher plan. Provider source order, preview order and publication extraction order are separate recorded choices.

Saving a version binds the exact draft revision, preview UUID, full source hash, capture identity and expected selected version. The new immutable source file is saved before the managed selected source is updated. A later draft or selection is not silently replaced after an old browser response arrives.

Versions have native numeric IDs. Their request UUIDs and storage folder UUIDs are separate identities. The publisher also has native numeric plan IDs and separate storage/request UUIDs. Pass the native integer to the original plan API; do not substitute a folder UUID.

The same workflow is available without a browser:

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" status --directory "$SEATABLE_WORK"
node "$SEATABLE_SOURCE/workspace/cli.mjs" inspect-capture --directory "$SEATABLE_WORK" --capture ACTUAL_CAPTURE_UUID
node "$SEATABLE_SOURCE/workspace/cli.mjs" draft   --directory "$SEATABLE_WORK" --draft /absolute/private/reviewed-draft.json   --expected-revision ACTUAL_REVISION --request ACTUAL_NEW_UUID
node "$SEATABLE_SOURCE/workspace/cli.mjs" preview   --directory "$SEATABLE_WORK" --draft-revision ACTUAL_SAVED_REVISION --request ACTUAL_NEW_UUID
node "$SEATABLE_SOURCE/workspace/cli.mjs" save   --directory "$SEATABLE_WORK" --draft-revision ACTUAL_SAVED_REVISION   --preview ACTUAL_PREVIEW_UUID --reviewer "Operator" --note "Reviewed exact catalog projection"   --expected-selected-version null --request ACTUAL_NEW_UUID
~~~

Use the actual current selected integer instead of `null` when a source version is already selected. Every write requires its own stable UUID, retained for that write's recovery.

## Original publisher and exact public projection

Select **Open original publisher** from **Publish & operate** after a source version is selected. It opens the existing typed dataset publisher on loopback using this workspace's managed source path, publisher directory and dataset target. Browser and MCP borrow the same publisher object.

The original publisher workflow owns query/column selection, explicit extraction order, candidate validation, human review, publishing, scheduling and buyer/client handoff. Its plans copy the selected capture-backed source. Selecting a later source version prepares a new plan; it does not rewrite an existing plan or published edition.

Review the public column list and the actual candidate before publication. All selected source rows for the chosen query are emitted unless the original publisher itself provides a separately reviewed row-selection capability. This workspace does not claim an unimplemented post-capture filter.

MCP exposes the original publisher tool catalog under `merchant_seatable_publisher_*`. The tool schemas, review semantics, native plan/run IDs and request recovery remain with the original publisher adapter. It is a borrowed lifetime, not an independent entry in a second publisher map.

To open the original publisher from the source CLI:

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" publisher   --directory "$SEATABLE_WORK" --version ACTUAL_SELECTED_VERSION   --request ACTUAL_NEW_UUID
~~~

This is an owned foreground process. Keep it running while using its printed browser URL, then close it before another owner opens the workspace.

## Prepare and operate an original SF82 release

In **Publish & operate**, refresh original publications. Choose an actual completed published run and the saved source version that matches it. Enter the real merchant terms for the intended deployment. Reviewing or preparing does not activate a seller.

The source model composes the provider-owned SeaTable deployment adapter:

| Action | Model method and required basis |
| --- | --- |
| Review published edition | `reviewDeployment({versionId,runId,terms,requestId})` |
| Prepare its exact package | `prepareDeployment({reviewRequestId,expectedReviewSha256,requestId})` |
| Inspect a prepared package | `inspectDeploymentPackage(packageRequestId)` |
| Stage a release | `stageDeployment({packageRequestId,expectedSourceSha256,id,label,runtime,requestId})` |
| Open original release controls | `openDeploymentConsole({requestId})` |
| Read original live state | `deploymentStatus()` |
| Compare retained releases | `compareDeployment({from,to})` |
| Close the owned console | `closeDeploymentConsole({instanceId,requestId})` |

The package contains the five original staging files: `dataset.csv`, `dataset.json`, `seller.json`, `source.json` and `binding.json`. Their exact file hashes, published dataset identity, numeric plan and original capture/version binding are checked by the deployment adapter.

**These are private merchant staging inputs.** The original SF82 binding may retain the real absolute dataset path. Keep that binding for the merchant host instead of rewriting it into a fictitious portable path. Customer delivery uses the existing client/release exporter and its generated request/client contract. A private raw source packet is also an operator artifact; it is not the public dataset.

Stage the exact reviewed package, then use the original release console for compare, activate, Run, Stop, Restart and Rollback. The source model retains the console instance UUID, original selection generation, release digest and owned seller instance. Stop and Restart require that exact owned instance. A new console does not acquire ownership of a prior seller simply by discovering its listener.

`commandDeployment` and the corresponding MCP tool support `activate`, `rollback`, `run`, `stop` and `restart` with the current original guards. After a lost reply, resume observes the original console state; it does not automatically resend an uncertain lifecycle command.

An existing release directory is validated by `readReleaseState`. The create-only SF82 initializer runs only when the directory is positively absent. Invalid or partial retained release state remains visible for original recovery.

The CLI provides `deployment-status`, `deployment-review`, `deployment-prepare`, `deployment-stage`, `deployment-package`, `deployment-console`, `deployment-compare` and `deployment-file`. Pass the complete write input through `--input` and retain its request UUID. The HTTP browser uses the same methods.

## Private packet export and receiving

Export a reviewed source version or an observation before a version is saved:

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" export   --directory "$SEATABLE_WORK" --version ACTUAL_VERSION   --out /absolute/private/seatable-source-v1.json

node "$SEATABLE_SOURCE/workspace/cli.mjs" export-capture   --directory "$SEATABLE_WORK" --capture ACTUAL_CAPTURE_UUID   --out /absolute/private/seatable-observation.json
~~~

The packet retains the complete captured source, including fields that the public publisher later omits. It contains the exact original capture resources and source query projection, plus original source/version provenance. It strips the live connection and credential references by requiring a capture-backed source declaration.

The packet is private and belongs with the intended source operator. Importing it into a new workspace retains the original observation bytes but creates local native request/version identities. Reopening the same original workspace retains its existing native IDs unchanged.

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" init   --directory /absolute/private/received-seatable

node "$SEATABLE_SOURCE/workspace/cli.mjs" import   --directory /absolute/private/received-seatable   --packet /absolute/private/seatable-source-v1.json   --title "Received reviewed source" --expected-revision 0   --request ACTUAL_NEW_UUID
~~~

The provider's packet reader and exact-member importer remain authoritative. An interrupted private copy resumes only matching retained bytes. It never replaces mismatching members, splices captures or contacts SeaTable.

## One shared browser and merchant MCP owner

Add this field to an existing reviewed merchant configuration:

~~~json
{"seatableWorkspaceConnection":"/absolute/private/seatable-workspaces.json"}
~~~

The referenced host-owned file:

~~~json
{
  "schema": "stellar-forge.seatable-authoring-connection.v1",
  "workspaces": {
    "catalog": {
      "label": "SeaTable catalog",
      "directory": "/absolute/private/seatable/catalog",
      "connections": "/absolute/private/seatable-connections.json",
      "inputs": {
        "existing": {
          "kind": "source",
          "file": "/absolute/private/original/source.json",
          "label": "Original frozen source"
        },
        "received": {
          "kind": "packet",
          "file": "/absolute/private/received-seatable-source.json",
          "label": "Received private source packet"
        }
      }
    }
  }
}
~~~

Connections and inputs are optional. Declare `seller` and `resource` together when the original buyer handoff is configured. Each alias binds one existing canonical private database/settings identity. Tools select these aliases; they cannot supply arbitrary host paths or credential environment names.

Start the maintained merchant MCP server with that reviewed configuration. The installed `merchant-mcp` command and original `stellar-forge/mcp-merchant-operator/serve.mjs` remain the host. When `merchant_seatable_open` is called, the adapter opens one original model and loopback browser. Use the returned browser URL while tools operate that same object.

| Intent | MCP tools |
| --- | --- |
| Inspect and open | `merchant_seatable_workspaces`, `_open`, `_status`, `_inputs` |
| Inspect/capture source | `_discover`, `_discovery`, `_capture`, `_capture_attempt`, `_columns` |
| Import retained source | `_import`, `_import_packet` |
| Review source | `_draft_save`, `_preview`, `_version_save`, `_version`, `_compare`, `_select` |
| Publish | `_publisher_open`, original `_publisher_*` tools, `_publisher_close` |
| Operate SF82 | `_deployment_status`, `_deployment_review`, `_deployment_prepare`, `_deployment_stage`, `_deployment_compare`, `_deployment_command`, `_deployment_console_open`, `_deployment_console_close` |
| Receive exact bytes | `_packet_read`, `_capture_read`, `_deployment_file_read` and their release tools |
| Recover/close | `_operation`, `_resume`, `_close` |

All abbreviated tools use the `merchant_seatable` prefix. Actual tool schemas are exposed by the original merchant catalog. Source imports compare the reviewed SHA256 against the same declaration read by the packet builder, not a separate earlier read.

Retained packet/file reads bind the original version/capture/package, whole file SHA256, offset and read ID. After expiry or process restart, omit the old read ID and continue with the same native resource, expected hash and offset. Keep a newly returned read ID for subsequent chunks. Releasing a read does not delete a capture, version, publisher or release.

MCP Close takes the exact owned instance UUID, blocks new work, drains opening/pending callbacks and retained reads, then closes the original browser/model and borrowed publisher. The host-owned publisher is never entered into a second independently closing registry.

## Managed Applications

Initialize the workspace first. In the maintained Applications UI choose **SeaTable source authoring**, review the private workspace and optional connection file, Save, Start and Open. The source-owned contribution registers this choice without replacing shared handlers.

Preparation binds the original settings/database identity, the complete 14-file authoring launch source and the selected connection-file hash. Startup verifies both selected and actually executed source, the same workspace identity and the loopback URL before announcing READY. Mutable drafts, captures, selected versions and publisher records remain work inside that original database rather than immutable launch input.

Stop drains the original process and workspace. Reopen uses a deliberate new reviewed Start while keeping the same database and saved request history. A separately running CLI/MCP owner must close first; do not delete its lease or spawn another process to hide an uncertain Start.

## Interrupted requests and state conflicts

Every mutation uses one UUID. The database stores its action and complete input identity before dispatch. Reusing an ID for different input is rejected.

| Observed state | Action |
| --- | --- |
| No receipt yet after a lost reply | Retry only the identical request body and UUID, or check the same receipt. A browser packet retry requires the exact original file bytes. |
| `pending` | Let the original operation finish; check its same receipt. |
| `interrupted` | Inspect the original receipt and capture attempt, then explicitly Resume the same request. CAPTURE advances its original provider step journal; opening the workspace does not resume it. |
| `complete` | Read the saved result and current state. A late replay does not reset a later source selection. |
| `failed` | Read the recorded reason, acknowledge it, and make a new explicit request only when the operator chooses corrected input. |
| Draft or selection conflict | Refresh and review the current native revision; do not silently adopt it for an old dirty editor. |

The browser keeps its small request marker through a failed status refresh. Complete source packets and provider rows are not put in browser persistent storage. The marker contains the original UUID, action/body identity and, for an upload, exact selected-file identity.

Metadata discovery recovery adopts its retained result and does not repeat an uncertain metadata request. CAPTURE has a separate original recovery contract: after inspecting the attempt, explicitly Resume the **same request UUID** to continue the provider's saved step journal with the same source selection, read bounds and private directory. The original provider decides which step can continue and validates retained response bytes before adoption. Opening or refreshing the workspace never starts this recovery.

The capture-attempt view reports completed steps and pages, retained byte count, the original provider failure and whether a fresh observation is required. SQL count changes, base-version changes, schema changes, server changes or duplicate record IDs are terminal for that observation. When the original attempt reports `freshReadRequired: true`, preserve it and make a new explicit capture with a new UUID. Do not splice its pages into the new observation. Transient interruption, timeout, rate limiting or a failed durable write can use the same UUID and original provider journal. Correctable token/scope failures also retain that request. A permanent projection/type/hidden-field or read-bound failure remains terminal; correct the original selection or public type and explicitly make a new request. A false `freshReadRequired` value alone does not turn a terminal authoring receipt into an interrupted one.

If an import operation exists but its input packet is positively absent because the write never reached durable storage, resume records `SEATABLE_IMPORT_INPUT_NOT_RETAINED`. It preserves the original receipt, performs no provider read and lets the operator explicitly import the same complete packet with a new UUID. Other unresolved I/O errors remain interrupted.

Use the original CLI for a stopped owner:

~~~sh
node "$SEATABLE_SOURCE/workspace/cli.mjs" operation   --directory "$SEATABLE_WORK" --request ACTUAL_ORIGINAL_UUID

node "$SEATABLE_SOURCE/workspace/cli.mjs" resume   --directory "$SEATABLE_WORK" --request ACTUAL_ORIGINAL_UUID
~~~

The browser's retained-request panel and the MCP `_operation`/`_resume` tools use the same saved operation. Do not create another source workspace, publisher directory, release store or provider job to work around an uncertain response.

## API and source ownership

`openSeaTableAuthoring({directory,create,connections,environment,targetDirectory,seller,resource,expectedIdentity})` is the native entry. `serveSeaTableAuthoring({workspace,port})` serves that exact object and owns its close.

The model exposes `discover`, `discovery`, `importSource`, `importPacket`, `readLive`, `inspectCapture`, `saveDraft`, `preview`, `saveVersion`, `selectVersion`, `exportVersion`, `exportCapture`, `captureAttempt`, `compareVersions`, original publisher/deployment methods, `operation`, `resume`, `status` and `close`.

The workspace packet facade delegates `exportSeaTableCapturePacket`, `readSeaTableCapturePacket` and `importSeaTableCapturePacket` to the provider's `capture.mjs`. The provider also owns declaration validation, credential handling, actual metadata/SQL/native-view reads, numeric values and the typed source. The existing generic dataset publisher and SF82 release engine retain their original authority.

The implementation is derived from the maintained NocoDB authoring/recovery model and the source-owned Sheet Best registration/Applications pattern at standalone commit `cc0f9a8b860005b4cb8767974fee231c5151b835`. Their original donor files are unchanged. SeaTable's selection, exact capture portability and public type semantics remain with the SeaTable provider source. MIT source notices are preserved.

## Complete installed receiving

The same selected `seatable-merchant` product includes `seatable-receive`. Its [complete receiving guide](RECEIVING.md) prepares an exact input from the original SQL/native-view captures, then runs browser review, both original publisher editions, SF82/customer export, installed Applications and borrowed MCP in one retained operation. The full private workspace archive is verified before its delivery receipt is complete. Native counts come from the actual original captures; this continuation makes no provider extraction or payment.

Use `seatable-receive --prepare /absolute/private/selection.json` and then `seatable-receive --input /absolute/private/receiving-input.json` through the installed dispatcher. Keep the original provider operation, source selection and request identities.

## Delivery and native status

Source implementation and source review are distinct from installed/native receiving. A joined provider/authoring/publisher/merchant receiving result must identify its real captured source, exact selected source/runtime, native versions/publications and actual outcomes before it is described as complete.

The team composes one SeaTable receiving journey with the provider owner. This guide does not claim customer data, provider extraction, seller activation or a paid buyer result merely from the existence of source code. Existing NocoDB, Sheets and Sheet Best operations remain separate retained work.
