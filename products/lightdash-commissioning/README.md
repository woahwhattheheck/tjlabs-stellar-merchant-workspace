# Lightdash commissioning project

Prepare a private commissioning project, open its original browser and authenticated MCP together, and keep the same saved source editions, reviews, native operations and complete customer handover across restarts.

This product installs the complete [Lightdash commissioning application](../../business/lightdash-commissioning-workspace-20261012/README.md). Its 38 original files remain byte for byte identical to public-sprint PR 2381, source commit `a3ceab74ccd3c62a1c1bc7bd703d579b6efe31e6`. [SOURCE_LINEAGE.json](SOURCE_LINEAGE.json) lists each original file and its SHA256/Git identity. The installed project adds private host configuration, a shared browser/MCP lifetime, the existing Applications launcher, resumable complete-file transfer and customer receiving. Source editing, dbt semantics, Lightdash API work, SQLite history and handover generation remain owned by the original application.

The useful commissioning journey is source intake → saved draft → complete candidate edition → source comparison and review → original dbt/Lightdash operation → native result and content → complete handover → receiving the included application. The existing browser supports that whole journey; MCP exposes the same model and operation IDs.

## Choose an entry

| Need | Entry |
| --- | --- |
| Build and install this selected product | Original builder and runtime installer below |
| Create a project over declared private inputs | `lightdash-project prepare --input project.json` |
| Adopt an existing closed commissioning workspace | The same preparation, with `workspaceDirectory` and `expectedWorkspaceId` |
| Use the browser and MCP together | `lightdash-project serve --project DIRECTORY --port 0` |
| Start, Open, Stop and reopen through the installed application | Applications → **Lightdash commissioning** |
| Operate from another local process | [Typed client](client.d.mts), `connectProject` and the 28 original tools |
| Transfer a complete original handover | `download-handover`, then the [receiving guide](RECEIVING.md) |
| Continue the finished original full-Jaffle operation | `lightdash-installed-receive`; the same operation and completed workspace are required |

This is a Linux/Node 24 product. Python 3 and POSIX `flock` are used by the original native and archive owners. Native commissioning also needs the declared original `@lightdash/cli 2.568.0`, dbt executable/adapter, warehouse and Lightdash estate. Those host dependencies are selected in the original connection; preparing or opening this project does not invoke them.

## Build the selected source and install it

Use the existing repository checkout at the exact published commit selected for your installation. The original builder records that commit and packages its complete import, browser, Python and license closure. It also preserves the selected contribution and recipe. The recipe is `stellar/scf-starforge-20261009/distribution/selections/lightdash-commissioning.json`.

```bash
set -euo pipefail
LDW_REPO=/absolute/path/to/tjlabs-stellar-merchant-workspace
LDW_RELEASE=/absolute/path/to/new-lightdash-release
LDW_RUNTIME=/absolute/path/to/new-lightdash-runtime
LDW_DIST="$LDW_REPO/stellar/scf-starforge-20261009/distribution"
LDW_SOURCE_COMMIT="$(git -C "$LDW_REPO" rev-parse HEAD)"

node "$LDW_DIST/build.mjs" \
  --repo "$LDW_REPO" \
  --ref "$LDW_SOURCE_COMMIT" \
  --selection lightdash-commissioning \
  --out "$LDW_RELEASE"
```

If that exact build was interrupted, repeat its original command with `--resume`. Keep its ref, selected recipe and output directory unchanged. `distribution.json` is the original build receipt. Use its actual archive path and SHA256 in the original installer:

```bash
node --input-type=module - "$LDW_RELEASE" "$LDW_RUNTIME" "$LDW_DIST" "$LDW_SOURCE_COMMIT" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const [release,runtime,dist,commit]=process.argv.slice(2);
const receipt=JSON.parse(fs.readFileSync(path.join(release,'distribution.json'),'utf8'));
if(receipt.status!=='PACKAGED'||receipt.sourceCommit!==commit)
  throw Error('The original source receipt does not match the selected commit');
const cli=path.join(dist,'runtime-install-cli.mjs');
const run=args=>execFileSync(process.execPath,[cli,...args],{stdio:'inherit'});
if(fs.existsSync(runtime)) run(['resume','--dir',runtime]);
else {
  run(['prepare','--dir',runtime,'--archive',receipt.archive,'--sha256',receipt.sha256,
       '--feature','mcp','--operator']);
  run(['install','--dir',runtime]);
}
run(['inspect','--dir',runtime,'--load','--source']);
console.log(JSON.stringify({
  runtimeDirectory:runtime,
  sourceRoot:path.join(runtime,'package/source'),
  sourceManifest:path.join(runtime,'package/manifest.json')
}));
NODE
```

The MCP feature is required. The original installer resolves its declared dependency profile and retains its own lock/recovery state. The Lightdash host CLI/dbt estate is separate from that profile. Select its actual executable files in the host connection below. An existing prepared runtime must belong to this same original installation before using `resume`.

The following examples invoke the selected source directly so every path is explicit:

```bash
LDW_SOURCE="$LDW_RUNTIME/package/source"
LDW_PROJECT_CLI="$LDW_SOURCE/products/lightdash-commissioning/cli.mjs"
node "$LDW_PROJECT_CLI" --help
```

The installed `starforge` command exposes `lightdash-project`, `lightdash-receive` and `lightdash-installed-receive` through the same original command dispatcher. The recipe selects the original installation, runtime workspace, transfer and Merchant MCP commands. Its source closure includes shared dependencies; it adds no dataset provider or payment factory.

## Prepare private source and connection declarations

Preparation accepts named host inputs. Each source input has a canonical directory, complete original manifest file and that manifest's exact SHA256. All manifest members are verified before use. Source directories must contain regular files, with their original relative paths, bytes, hashes and executable flags. The original application excludes generated runtime directories and environment files from its editions. Host profiles are excluded by default.

For the original full-Jaffle journey, retain the entire `examples/full-jaffle-shop-demo` source from upstream commit `91e610898395e6659841a321a0cee31cfcac8ae8`: 189 files, 28,190,932 bytes. Its dbt project is the `dbt` subdirectory; sibling `lightdash` models are a different native source selection. The [original receiving guide](../../business/lightdash-commissioning-workspace-20261012/receiving/README.md) and exact [upstream inventory](../../business/lightdash-commissioning-workspace-20261012/receiving/upstream.json) own acquisition and acceptance.

A private named connection file has this schema:

```json
{
  "schema": "lightdash.commissioning-configuration.v1",
  "connection": {
    "id": "customer-commissioning",
    "origin": "https://lightdash.example.org",
    "projectUuid": "11111111-1111-4111-8111-111111111111",
    "tokenEnv": "LIGHTDASH_API_KEY",
    "allowHttp": false,
    "source": null,
    "runtime": {
      "node": "/opt/node24/bin/node",
      "cliEntry": "/opt/lightdash-cli/node_modules/@lightdash/cli/dist/index.js",
      "python": "/usr/bin/python3",
      "dbt": "/opt/dbt/bin/dbt"
    },
    "environment": {
      "PGHOST": "PGHOST",
      "PGPORT": "PGPORT",
      "PGUSER": "PGUSER",
      "PGPASSWORD": "PGPASSWORD",
      "PGDATABASE": "PGDATABASE",
      "SEED_SCHEMA": "SEED_SCHEMA"
    },
    "profiles": {
      "directory": "/home/operator/private/dbt-profiles",
      "manifestFile": "/home/operator/private/dbt-profiles-manifest.json",
      "manifestSha256": "REPLACE_WITH_ACTUAL_COMPLETE_MANIFEST_SHA256"
    }
  },
  "editionSettings": {
    "projectDir": "dbt",
    "profilesDir": null,
    "profile": "jaffle_shop",
    "target": "jaffle",
    "includeProfileFiles": false
  }
}
```

Replace example UUIDs, paths and digests with observed values. The connection stores environment-variable names, rather than secret values. `connection.profiles` selects private host profile files without copying them into the source edition. The original manifest must include `profiles.yml` and every selected profile member. For the exact public example's environment-only profiles, omit `connection.profiles`, set `profilesDir` to `profiles` and explicitly set `includeProfileFiles: true`. Retain that original public profile's bytes and license.

The native engine verifies its actual CLI package/version, executable files, source manifest and profile manifest when a native plan is prepared. It uses the original Lightdash configuration/environment behavior. There is no invented alternate CLI config-root flag, and the project does not replace `HOME`. See the complete [native contract](../../business/lightdash-commissioning-workspace-20261012/native/README.md) for supported authentication, project UUIDs, source selection and original action semantics.

Keep the project request and connection declarations private, ordinarily mode 0600. Project/control directories are private canonical directories. The files contain host paths and environment references; the public tool views omit those details.

## Create or adopt the original workspace

Start from [examples/project.json](examples/project.json), replace its placeholder digests and paths, and optionally choose `initialConnection` from the declared connection aliases.

```json
{
  "schema": "stellar-forge.lightdash-project-request.v1",
  "directory": "/home/operator/lightdash-project",
  "runtimeDirectory": "/home/operator/lightdash-runtime",
  "title": "Customer Lightdash commissioning",
  "initialConnection": "customer",
  "inputs": {
    "customer_source": {
      "label": "Reviewed complete dbt project",
      "directory": "/home/operator/customer-source",
      "manifestFile": "/home/operator/customer-source-manifest.json",
      "manifestSha256": "REPLACE_WITH_ACTUAL_COMPLETE_MANIFEST_SHA256"
    }
  },
  "connections": {
    "customer": {
      "label": "Customer's selected Lightdash estate",
      "file": "/home/operator/private/lightdash-configuration.json",
      "sha256": "REPLACE_WITH_ACTUAL_CONFIGURATION_FILE_SHA256"
    }
  },
  "allowOperatorPrivate": false,
  "python": "/usr/bin/python3"
}
```

```bash
node "$LDW_PROJECT_CLI" prepare --input /home/operator/private/project.json
node "$LDW_PROJECT_CLI" inspect --project /home/operator/lightdash-project
```

The returned project records its installed manifest, the complete original app manifest, a stable project ID, the original SQLite workspace ID/device/inode, host declarations and a private MCP bearer file. Preparation preserves its exact request and original IDs before creating dependent state. Repeating the same preparation reopens it. A different selection requires an intentional new project, with explicit adoption when appropriate.

To adopt an already completed original workspace, add:

```json
{
  "workspaceDirectory": "/home/operator/original-receiving/workspace",
  "expectedWorkspaceId": "THE_ACTUAL_ORIGINAL_WORKSPACE_UUID"
}
```

These fields are additions to the full request, not a standalone request. The adopted workspace must be closed and distinct from the new project and runtime directories. Preparation checks the original ID under its original workspace lease. It does not copy the SQLite store, alter native plans or change the source editions. If you deliberately apply `initialConnection` during adoption, also supply the currently observed `expectedRevision`. Without that selection, adoption preserves the existing configuration.

The required Merchant metadata store is initialized through the existing SF82 store API. It supports the Merchant host's original configuration and starts no seller or transfer. The commissioning application remains the only native project/workspace engine.

## Open one browser and authenticated MCP

```bash
node "$LDW_PROJECT_CLI" serve \
  --project /home/operator/lightdash-project \
  --port 0
```

The first JSON line identifies the current project instance, authoring instance, original workspace ID, browser URL, MCP URL and selected source manifest. Open `browserUrl` to use the complete commissioning UI. The browser and MCP reference the same live `CommissioningWorkspace`, SQLite history, pending operation map and handover lifetime.

`--port` is the local MCP port; the original browser obtains its own loopback port. Both endpoints use the current saved session. `session.json` is a locator, not evidence that an old process is still alive. The typed client authenticates to the actual current MCP host and verifies its workspace/instance before use.

Ctrl-C or SIGTERM closes admission, drains accepted source/native/package/file work, closes the original HTTP service and SQLite, and releases the same workspace lease. A failed drain retains ownership and reports `CLOSE_INCOMPLETE`; signal the same foreground process again after inspecting the failure. An additional process cannot take the original workspace while that owner remains active.

Avoid launching the original standalone browser separately while this project owns the workspace. Use either the installed foreground project or the managed Applications instance for each lifetime.

## Use the original browser workflow

1. Inspect the original configuration and complete source inventory. The source root and dbt project subdirectory remain distinct.
2. Intake a complete source as the baseline. Existing intake operation IDs reopen their original result.
3. Create/select a saved draft, edit actual YAML/SQL/content files and seal a complete immutable candidate edition. The editor binds the selected draft, file digest and current revision.
4. Compare all changed files and save an explicit source review. The review records baseline/candidate IDs, reviewer, note and decisions.
5. Plan an original native action against the selected edition and exact project/owned preview UUID. Review its native effects and retained request digest.
6. Execute that saved operation and inspect its actual original state/result. Explicit Inspect reconciles the original provider job; ordinary state reads remain local.
7. Retain the original content download or accepted query output, then create a whole handover at the chosen SQLite revision.
8. Receive the full archive with its included app and detached connection, using the [receiving workflow](RECEIVING.md).

The original full-Jaffle example changes an existing monthly regional-sales chart and its actual model together. It adds weighted revenue per unit, retains revenue and unit totals, and preserves the original chart/space identifiers and monthly/region dimensions. The source expectation is 72 sales across January–June 2025 and 18 month-region groups. Only actual native query results establish acceptance; source-derived expected totals do not claim a deployed result.

## Operate through the typed MCP client

`client.mjs` and [client.d.mts](client.d.mts) expose the same model. The package export is `@tokenjunkielabs/starforge-merchant/products/lightdash/client`. The following opens an already running local project, reads the exact current revision and performs an explicit host-alias source intake:

```javascript
import {randomUUID} from 'node:crypto';
import {connectProject} from '@tokenjunkielabs/starforge-merchant/products/lightdash/client';

const client=await connectProject('/home/operator/lightdash-project');
try {
  const current=await client.status();
  const inputs=await client.inputs({input:'customer_source'});
  const request={
    requestId:randomUUID(),
    expectedRevision:current.native.metadata.revision,
    input:'customer_source',
    expectedManifestSha256:inputs.manifestSha256,
    operationId:'customer-source-intake-001',
    label:'Reviewed original source',
    note:'Complete source selection from the declared manifest.'
  };
  // Persist request in your caller before sending it.
  const saved=await client.intake(request);
  console.log(saved);
} finally {
  await client.close();
}
```

For a remote HTTPS MCP connection, use `connectLightdash({url,tokenEnv,environment,workspace,expectedWorkspaceId,expectedInstanceId?})`. The original client transport accepts HTTPS and its supported loopback HTTP addresses. The installed project uses the private bearer already saved in its own directory; the client never needs that token printed in command output.

| Tool group | Original operations |
| --- | --- |
| Host and lifetime | `workspaces`, `open`, `close`, `status`, `inputs` |
| Source and review | `configure`, `intake`, `manifest`, `select`, `draft_create`, `draft_select`, `draft_edit`, `seal`, `compare`, `review` |
| Native operation | `plan`, `operation`, `execute`, `inspect`, `content` |
| Whole handover | `handover_create`, `handover_status`, `handover_inspect`, `handover_resume` |
| Complete retained files | `file_read`, `file_release` |
| Source request recovery | `request` |

The full names have the `merchant_lightdash_` prefix. Source writes carry a caller-retained `requestId` and `expectedRevision`. The provider persists the full transport request before invoking the original source mutation. A completed same-UUID replay returns its original result. An interrupted mutation returns `OBSERVATION_REQUIRED` with the retained request and current original state; it does not silently write again. Inspect the actual source/revision, then make a deliberate new edit if needed.

Native plans use the original `operationId` and `requestSha256`. `execute` requires that exact digest and returns accepted/pending state while the original job runs. `operation` reads local progress; `inspect` explicitly reconciles the same native job. An uncertain native write uses the original engine's reviewed `resumeOf` continuation after inspection. Preserve the exact prior ID and state; a new UUID is not an automatic retry.

For command-line calls, save the complete tool input in a private JSON file:

```json
{
  "tool": "merchant_lightdash_status",
  "arguments": {}
}
```

```bash
node "$LDW_PROJECT_CLI" call \
  --project /home/operator/lightdash-project \
  --input /home/operator/private/status-call.json
```

## Native project and content selection

The supported native actions are `inspect`, `dbt-deps`, `dbt-build`, `compile`, `start-preview`, `stop-preview`, `validate`, `deploy`, `download`, `upload` and `run-chart`. The [original workflow guide](../../business/lightdash-commissioning-workspace-20261012/WORKFLOW.md) documents complete action inputs and effects.

Preview-target operations retain the original `startOperationId` alongside the actual preview project UUID. Stopping a preview also requires its original name and preview UUID. `start-preview` uses the original unattended CLI lifecycle; no interactive preview process is left waiting for a keypress.

MCP upload selects one of two original content sources:

```json
{"kind":"edition","directory":"dbt"}
```

or:

```json
{
  "kind": "download",
  "operationId": "original-native-download-id",
  "manifestSha256": "THE_ACTUAL_COMPLETE_NATIVE_CONTENT_MANIFEST_SHA256"
}
```

Pass that object as the plan's top-level `content` field. The provider resolves it against the selected immutable edition or exact original native download. It does not accept an arbitrary host content path. The original engine checks source/target UUIDs, retains a target backup before upload and owns all native chart/dashboard/space semantics. Applying space access remains a separate explicit native input.

`run-chart` retains the accepted original query UUID and complete original result files. A selected source chart path, reviewed row limit and actual returned count belong to that original plan. Reading or transferring a saved query result does not execute another query.

## Managed Applications

Prepare the project first, then attach its exact installed runtime in the existing Runtime Workspace. Choose **Lightdash commissioning**, supply:

```json
{"projectDirectory":"/home/operator/lightdash-project","port":0}
```

Review and save that application through the original Applications UI/model. Its preparation pins the project, original workspace/database identity, private configuration and all complete selected product/app source. The launcher starts the declared `lightdash-project serve` command. Its startup observer binds the actual process, installed and executed source, exact project/workspace IDs and current original session before exposing **Open**.

The application has resource keys for both its project directory and the original workspace directory. Two aliases of the same workspace cannot be started as independent owners. Existing other Applications remain unchanged.

Use the original **Stop** operation for the exact managed run. Once the run is positively stopped, a new reviewed Start is a deliberate reopen and obtains a new process/session identity over the same source and SQLite history. Lost Start responses recover through the same original run ID. The complete installed receiver records any cleanup run before a later deliberate reopen.

## Handover and recipient boundaries

The default original handover contains complete source editions, saved draft overlays, reviews, native content/results and the full original application. Its receiving SQLite keeps the original workspace identity and history while detaching host connection settings. Provider tokens, runtime installations and private host profile directories remain host custody.

Operator-private diagnostics require both `allowOperatorPrivate: true` in the host declaration and an explicit choice on the handover/file request. Such archives can contain private paths and retained native request details. Select them only for the intended private operator receiving purpose. The default customer route uses `false`.

[RECEIVING.md](RECEIVING.md) gives exact chunked download, archive/request verification, create-only extraction, included-browser reopening and same-operation installed continuation commands.

## Source and execution identity

The original commissioning source was parsed under Node 24/Python, and its local original browser/SQLite configuration-close-reopen journey completed with no provider command. The full provider/warehouse journey and this installed continuation are accepted only by their actual retained native results. A source merge, runtime installation or a browser opening alone does not establish the two-preview/18-group commissioning result.

The permanent source record is [SOURCE_LINEAGE.json](SOURCE_LINEAGE.json). The selected runtime's `package/manifest.json` binds the installed product and every original source file. The original application manifest remains unchanged. Preserve its [MIT license](../../business/lightdash-commissioning-workspace-20261012/LICENSE), original [third-party notices](../../business/lightdash-commissioning-workspace-20261012/THIRD_PARTY_NOTICES.md) and the upstream full-example license when delivering the example itself.
