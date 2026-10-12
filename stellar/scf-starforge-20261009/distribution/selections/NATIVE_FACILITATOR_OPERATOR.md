# Native Stellar facilitator and Bazaar operator

Install and run the complete native facilitator operator through the existing
Runtime Workspace. Review and retain payment profiles, start their original
Stellar backend, inspect durable Bazaar publication and receive complete
catalog views through the browser or typed Node client.

The selected product keeps the native facilitator, original host commissioning
command, dual-network gateway, durable catalog and its source-owned Applications
provider together. Its source selection is `native-facilitator-operator`.

## Build and install the selected product

Use the maintained Linux runtime installation with Node.js 22.16 or newer,
Python 3.11 or newer, npm, Git and util-linux `flock`. Keep runtime installation,
operator profiles, signer ownership and catalog journal directories outside the
source checkout. Use canonical absolute paths and the existing host's private
directory permissions.

From the original product checkout, build the chosen source commit:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --ref ORIGINAL_COMMIT \
  --selection native-facilitator-operator \
  --out /absolute/private/packages/native-facilitator
```

Replace `ORIGINAL_COMMIT` with the complete chosen commit. Retain the returned
archive and SHA-256 from this same build. In Runtime Workspace, **Build a
product** selects this recipe at that commit and retains the original
review/build request. Its completed archive opens in **Source & profile**.

Prepare the original runtime with native Stellar packages and the schema
dependency used by the catalog:

```sh
starforge runtime-install prepare \
  --dir /srv/starforge/runtimes/native-facilitator \
  --archive /srv/starforge/downloads/native-facilitator.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --operator

starforge runtime-install install \
  --dir /srv/starforge/runtimes/native-facilitator
```

Use the actual archive path and digest. The selected source supplies the existing
x402/Stellar peers and schema package declaration; the original installer
resolves and retains the dependency lock. Continue an interrupted installation
in that same runtime directory. The complete
[runtime installation guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) covers its existing cache,
offline receiving and recovery commands.

The selected command inventory includes:

| Command | Original operation |
| --- | --- |
| `native-facilitator-operator` | Private profile review, native backend operation, catalog browser and receiving |
| `native-facilitator` | Original direct native configuration review, readiness and backend |
| `stellar-facilitator-gateway` | Original network-specific payment and Bazaar gateway |
| `facilitator-host` | Original Linux service commissioning, transition and host receiving |
| `runtime-workspace` | Source selection, installation, saved Applications and retained managed operations |
| `runtime-profile`, `runtime-install`, `runtime-transfer`, `installation` | Original source, dependency, release and receiving lifecycle |

## Save and open an Application

Open the existing private Runtime Workspace, or initialize one in an existing
private parent:

```sh
starforge runtime-workspace init \
  --workspace /srv/starforge/runtime-workspace \
  --runtime-home /srv/starforge/runtimes

starforge runtime-workspace serve \
  --workspace /srv/starforge/runtime-workspace
```

Use **Open an existing runtime** to register the READY native facilitator runtime.
In **Applications**, choose **Native Stellar facilitator**. Select the original
private operator directory and the same shared signer ownership directory used
by other native facilitator processes on this host. The optional creation
checkbox creates missing private leaf directories; their parents must already
exist. The environment file, when used, is the original private JSON mapping of
environment names to values. Existing process environment is available through
the usual managed launcher.

Review the complete source and directory selection, Save the Application,
Connect its selected release, Review Start and Start. Open uses the actual
authenticated URL announced by the native operator. The adapter checks its
original process, session identity, selected port and both host directories
against the retained start review and the live authenticated listener.

The application run ID, selected provider source, private environment binding,
retained stdout and Stop/recovery records remain in the existing Applications
lifecycle. Starting this Application opens the management interface; use its
saved profile controls to start the selected native payment backend.

For direct operation through the installed runtime:

```sh
starforge runtime-install run \
  --dir /srv/starforge/runtimes/native-facilitator -- \
  native-facilitator-operator \
  --directory /srv/starforge/operators/native-facilitator \
  --ownership-directory /srv/starforge/signer-ownership \
  --create --port 0
```

Each process prints its complete local operator URL. Reopening the same profile
directory preserves the original immutable files. A new management process has
a new session URL and instance ID.

## Operate the original profiles and catalog

The [complete operator guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/native-facilitator/workspace/README.md)
covers native network/RPC selection, public signing-account references,
recipient and asset policy, payment timing, atomic amount and fee limits,
readiness, native start and drain. The profile form also retains the original
catalog journal directory and every merchant seller/signer/origin/recipient
binding. Existing signer strings and earlier profile file hashes remain exact.

A configured catalog reads the original successful settlement receipts into its
guarded durable journal. Its operator reports resources, revisions, operations,
journal head, queued metadata and batch commits. Search, list pages and complete
downloads use that same native discovery engine. The
[native catalog guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/native-facilitator/CATALOG.md) supplies deployment,
gateway and receipt reconciliation details.

The original `facilitator-host` remains the service-oriented commissioning and
receiving command. Its source is retained under
[native-facilitator/host](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/main/stellar/scf-starforge-20261009/native-facilitator/host). Keep that host operation,
its service records and selected signing accounts when using it alongside the
interactive operator.

## Use the typed client on the same operator

Import the installed original client:

```js
import {createNativeOperatorClient} from
  '@tokenjunkielabs/starforge-merchant/facilitator/operator/client';

const operator = createNativeOperatorClient({
  operatorUrl: process.env.STARFORGE_OPERATOR_URL,
});
const status = await operator.status();
const profiles = [];
let after = '';
do {
  const page = await operator.profiles({after});
  profiles.push(...page.items);
  after = page.next;
} while (after !== null);
```

Set `STARFORGE_OPERATOR_URL` locally to the complete URL printed by the original
operator or retained by Applications. The client retains its token in the
connection closure and exposes the origin. It uses the same authenticated
management API as the browser.

The adjacent `client.d.mts` declares complete configuration, review, original
profile, runtime, catalog-page, receiving and error types. Package exports also
include `./facilitator/operator/server` and
`./facilitator/operator/receiving`.

| Client method | Original API/result |
| --- | --- |
| `status()` | Management instance and current native runtime |
| `profiles({after})` / `profile(name)` | Original saved profile page / complete selected file and commands |
| `downloadProfile({name, sha256})` | Exact original JSON file content |
| `review(config)` / `save({name, config, expectedSha256})` | Native normalized review / immutable reviewed save |
| `probe({name, sha256})` / `probe({runtimeId})` | Original configured RPC or current native readiness observation |
| `start({name, sha256, port})` / `stop(runtimeId)` | Original controller startup or drain |
| `catalog({runtimeId, query, expectedVersion})` | Complete original list/search page at the selected runtime/revision |
| `exportCatalog(selection)` | Entire selected view as one JSON object |
| `receiveCatalog(selection)` | Entire selected view as completed JSON parts, metadata and counts |

For example, receive a complete current catalog after selecting a running native
profile with catalog publication:

```js
const observed = await operator.status();
const runtime = observed.runtime;
if (!runtime?.status.catalog?.enabled) {
  throw new Error('Select the original running catalog profile.');
}
const catalog = await operator.exportCatalog({
  runtimeId: runtime.id,
  expectedVersion: runtime.status.catalog.version,
  query: 'type=http',
}, {
  onProgress({resourceCount, pages}) {
    process.stderr.write(resourceCount + ' resources / ' + pages + ' pages\n');
  },
});
process.stdout.write(JSON.stringify(catalog, null, 2) + '\n');
```

A complete receive begins with the first matching resource, even when its query
came from a later page. The browser and client share one implementation:
100-resource original pages, a fixed runtime/resource version, the first actual
profile/network/journal/queue observation, complete original resource objects
and final resource/page counts. Search follows the original catalog cursor.
Changed versions, inconsistent pages or repeated cursors end the receive before
a completed object or file is produced. A previously retained browser page stays
available. The `receiveCatalog` result's `parts` can be passed to a Blob or to the
receiving application's existing file publication code after completion.

Each request accepts an optional `AbortSignal`. The response ceiling defaults to
32 MiB per original HTTP response and can be set through `maxResponseBytes`;
complete exports span as many original pages as the selected catalog requires.
The client returns the native HTTP error code/status and records the failed
method/path. After a disconnected start, save, probe or drain, read the same
operator's current state and original profile before choosing the following
action.

## Stop, upgrade and receive

Use the operator's **Drain and stop** to finish its native backend before a
profile change. Applications **Stop** sends the original process shutdown
signal, closes the management listener and drains its owned backend. Reopen the
same saved Application after the original process and accepted SDK work finish;
profiles retain their filenames and byte hashes.

For an upgrade, receive the complete selected source/runtime into a fresh runtime
directory, register it in the existing Runtime Workspace, and review the saved
Application against that intended release and the original host directories.
Keep the profile directory, signer ownership, network-specific journal and
service operation at their established locations. The original
[runtime transfer guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/RUNTIME_TRANSFER.md) carries the selected archive and
locked dependencies through its existing receiving operation.

Profile and catalog downloads are ready for the receiving merchant or research
workflow: original configuration bytes, payment references, network, resource
revision, source terms and complete discovery resources are retained together.
Use the existing host/journal receiving workflow for the original durable
service state and the same operator guide to reopen it.
