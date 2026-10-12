# Recover the complete Captured API operating workspace

This workflow saves the complete private Captured API product in an encrypted
SF101 snapshot, restores its original files, reviews the receiving paths, and
reopens the product through its ordinary browser and merchant agent. The
retained product profile, source and review histories, merchant packages, release
state, operator procedures, handover drafts, jobs, archives and uploads travel
together.

Use `starforge captured-api recovery` from the installed product. From a source
checkout, replace that prefix with `node products/captured-api/cli.mjs recovery`.
The [operating guide](OPERATING.md) covers the original installation, native
browser, Applications and seller lifecycle. [HANDOVER.md](HANDOVER.md),
[COLLABORATION.md](COLLABORATION.md) and [EDITIONS.md](EDITIONS.md) remain the
customer collection and shared-edit workflows.

## 1. Select the original operating source

Run recovery on the Linux host that owns the product, using the product's
original Unix user and group. The installed runtime needs its maintained Node.js
and native dependencies, including util-linux `flock`. Keep operating state and
recovery output in private directories outside the installed source tree.

The original product profile and connection readers select these files:

| Selected source | How it enters the snapshot |
| --- | --- |
| Private product | The complete retained product directory, including setup/profile/session files, original agent configuration and all nested histories |
| Captured source library | The original projects directory and every retained source, refresh, review and merchant package beneath it |
| Release and export stores | The exact directories in the original merchant configuration, including release history and complete retained exports |
| HAR and OpenAPI inputs | Declared source files, import/delivery directories and console URL references from the original connection configuration |
| Other merchant sources | The configured native source paths and connection files reported by inspection |
| Browser OAuth | The original connection registry and every configured connection directory resolved through its original environment variable |
| MCP OAuth configuration | The original file selected by `MCP_OAUTH_CONFIG`, when that variable is set |
| Additional native provider data | Explicit existing files or directories supplied in `additionalRoots` |
| Installed product archive | An optional complete retained package archive supplied as `sourceArchive` |

A selected parent includes its complete descendants. Inspection coalesces
covered paths and reports the resulting roots; it does not widen a selected
directory to a common ancestor. References to intentionally absent optional
HAR/OpenAPI files remain listed as absent. Required product and native source
inputs must exist.

Start with the original product:

~~~sh
starforge captured-api recovery inspect \
  --dir /private/state/captured-api
~~~

Read the complete `roots`, `summary.references`, `summary.release`,
`summary.oauth` and `source` result. The file, directory and byte totals cover
the whole selected source. Each root has an identity derived from its ordered
complete file inventory. Runtime metadata records the installed recovery source
and the existing Node executable.

For a provider that keeps data outside those declared paths, prepare a private
selection file. This example also retains the full installed package:

~~~json
{
  "schema": "stellar-forge.captured-api-recovery-selection.v1",
  "directory": "/private/state/captured-api",
  "additionalRoots": [
    {
      "name": "providerData",
      "path": "/private/state/provider-data"
    }
  ],
  "sourceArchive": "/private/packages/captured-api-installed.tgz"
}
~~~

Save it as `/private/recovery/selection.json`, then inspect that exact selection:

~~~sh
starforge captured-api recovery inspect \
  --selection /private/recovery/selection.json
~~~

Paths are absolute, canonical paths to the original regular files or
directories. Native selection rejects symlinks, hard-linked files, sockets and
devices. Choose the retained product archive for complete installed source;
the operating snapshot keeps the runtime directory separate. Add each external
provider's actual data directory when its connection file alone does not contain
the source needed to reopen it.

The snapshot can contain authorization grants and private source data. The
passphrase stays in the host's private environment; only its environment
variable name enters the operation request. Store the complete encrypted bundle
and its passphrase through your existing separate storage channels.

## 2. Stop the selected writers and save a complete plan

Use the original product's Stop action or its normal foreground Ctrl-C. Let
its browser, agent, accepted work and seller drain. Stop any other selected
provider or external workspace writer and keep those sources stopped through
capture. Applications-managed products use the same saved application's Stop
operation.

Recovery acquires the original product, release and browser OAuth leases.
The explicit `--quiesced` choice records that the rest of the selected source
is also stopped. Source inspection and native capture both compare the complete
original file inventories.

Create the private recovery parent and save a new plan outside every selected
root:

~~~sh
mkdir -p /private/recovery
chmod 700 /private/recovery

starforge captured-api recovery plan \
  --selection /private/recovery/selection.json \
  --plan /private/recovery/captured-plan-1.json \
  --quiesced
~~~

For the default source selection, use `--dir /private/state/captured-api`
instead of `--selection`.

The result includes `planFile`, `planSha256`, `profileSha256`, the complete
`profile`, and whether the original plan was reused. Read its exact product,
root, release, OAuth and runtime selections. Retain the returned
`planSha256` for capture.

The plan includes the original selection, complete root identities, original
owner, configuration references and its own absolute filename. Repeating the
same command with unchanged source reopens the exact saved plan. After ordinary
source work changes an edition, keep the earlier plan and choose a new plan
filename for the new complete source.

An independent current-source check is available:

~~~sh
starforge captured-api recovery inspect-plan \
  --plan /private/recovery/captured-plan-1.json
~~~

This compares the retained plan with the complete current source and original
resolved native configuration. An existing plan remains useful as the source
identity of its already completed capture after later product work.

## 3. Capture and verify the whole encrypted bundle

Set `CAPTURED_RECOVERY_PASSPHRASE` in the current process environment using
your existing secret input. SF101 requires at least 16 UTF-8 bytes. Keep the
value available to the native capture, verification and first restoration
commands.

Use the actual plan hash returned above. Choose new bundle and operation
directories outside every captured root:

~~~sh
starforge captured-api recovery capture \
  --plan /private/recovery/captured-plan-1.json \
  --out /private/recovery/captured-bundle-1 \
  --operation /private/recovery/capture-1 \
  --sha256 ACTUAL_PLAN_SHA256 \
  --pass-env CAPTURED_RECOVERY_PASSPHRASE \
  --quiesced
~~~

The original SF101 engine owns encryption, complete file authentication and
snapshot layout. Its local capture journal retains the original capture
identity and interrupted work. The Captured API wrapper binds that result to
the complete reviewed product and typed plan.

The completed result has status `CAPTURED_RECOVERY_CAPTURED` and includes:

| Result | Meaning |
| --- | --- |
| `bundleDirectory` | The complete encrypted directory to preserve and transfer |
| `snapshotSha256` | SHA-256 of the complete original authenticated SF101 `manifest.json` bytes |
| `planSha256` | The exact reviewed source plan hash |
| `captureId` | The retained original capture identity |
| `product`, `summary`, `runtime` | Original product, source/authorization references, release and runtime selections |
| `files`, `bytes` | Native complete snapshot totals |
| `operationDirectory` | The durable original capture request and result |

Keep every file in `bundleDirectory` together. The manifest alone is one member
of that complete snapshot.

Verify the retained or transferred bundle through the original engine:

~~~sh
starforge captured-api recovery verify \
  --bundle /private/recovery/captured-bundle-1 \
  --sha256 ACTUAL_SNAPSHOT_SHA256 \
  --pass-env CAPTURED_RECOVERY_PASSPHRASE
~~~

A verified result returns `CAPTURED_RECOVERY_VERIFIED` plus the complete native
verification. The supplied snapshot hash binds the exact original manifest
bytes. Native verification authenticates the encrypted content and complete
original source before restoration can create output.

Repeat the exact original capture command to continue an interruption. A
completed native snapshot is verified and returned before current product
configuration or later source edits are inspected. It keeps the first completed
capture result. An incomplete capture requires the original plan, source and
stopped writers; its original local journal retains unfinished attempts.

You can reopen the retained result after a lost terminal reply:

~~~sh
starforge captured-api recovery status \
  --operation /private/recovery/capture-1
~~~

## 4. Restore into a private staging operation

On the receiving Linux host, install the retained product runtime or its
compatible maintained successor. Use the original Unix UID and GID recorded by
the plan. Keep the old product stopped when restoring back onto its original
host.

The first restoration needs the complete encrypted bundle, its actual
`snapshotSha256`, and the original passphrase in the selected environment
variable. The bundle may have a different receiving path; its bytes and hash
remain the same.

~~~sh
starforge captured-api recovery restore \
  --bundle /private/delivery/captured-bundle-1 \
  --operation /private/recovery/restore-1 \
  --sha256 ACTUAL_SNAPSHOT_SHA256 \
  --pass-env CAPTURED_RECOVERY_PASSPHRASE
~~~

SF101 authenticates the complete bundle and restores beneath
`/private/recovery/restore-1/restored`. Each native root keeps its logical name.
The Captured API plan is itself a retained root. The wrapper verifies every
restored root and its full original file hashes against that authenticated plan.

The completed `CAPTURED_RECOVERY_RESTORED` result retains the original manifest,
plan identity, complete product and staged restore location. Repeat the exact
command after an interruption. If native restoration finished before the reply
was retained, the same staged files are fully verified and adopted. If a process
stopped with incomplete native output, the operation retains that original
attempt under its own recovery directory and continues the original restore
into its designated new staging directory.

Inspect the whole restored product and original receiving paths:

~~~sh
starforge captured-api recovery inspect-restore \
  --restore-operation /private/recovery/restore-1
~~~

The result lists every original target, full source totals, native release and
OAuth summaries, and runtime metadata. A completed retained restoration can
reopen from its own authenticated manifest and full staged files after the
encrypted delivery directory moves.

The original installed archive, when selected, is also available as a restored
file root. Use the maintained runtime installer to receive that complete source
archive. Executable/runtime dependency installation remains with the product's
existing installer.

## 5. Review the original receiving paths

Operating recovery restores the original absolute product and native paths.
That preserves source references, product IDs, source histories, saved
requests, release selections and OAuth directory references.

Choose private existing parent directories for the original roots. Every
original target must be absent before the receiving operation first creates
its complete destination set. Retain any currently existing workspace at its
own chosen location before starting a new recovery; the receiver preserves
existing and differing files.

For example, if inspection reports roots under `/private/state` and
`/private/packages`, create those parents with the original owner and private
mode. Do not create the actual product, external provider data or archive targets
inside them.

~~~sh
mkdir -p /private/state /private/packages
chmod 700 /private/state /private/packages
~~~

Create `/private/recovery/targets-1.json` using the actual
`sourcePlanSha256` returned by restore inspection:

~~~json
{
  "schema": "stellar-forge.captured-api-recovery-targets.v1",
  "sourcePlanSha256": "ACTUAL_PLAN_SHA256",
  "destinationParents": [
    "/private/state",
    "/private/packages"
  ]
}
~~~

Supply the complete parent set needed by your actual inspected roots.
Parents are explicit, nonoverlapping canonical directories owned by the
original user and group. The review binds their device/inode identities,
the exact target file, original snapshot/plan and each original source root.

~~~sh
starforge captured-api recovery receive-review \
  --restore-operation /private/recovery/restore-1 \
  --targets /private/recovery/targets-1.json \
  --operation /private/recovery/receive-1
~~~

Read the complete `review`, `availability` and `summary`. Retain the exact
`reviewSha256`. It covers the full product and target selection; all original
absolute paths remain visible before placement.

The target set excludes the restore operation, receiving operation, installed
runtime source, and the target declaration itself. It also prevents overlapping
source roots or a broad implicit parent selection.

## 6. Receive all original files and finish native binding

Keep the original product and selected writers stopped. Use the exact reviewed
request:

~~~sh
starforge captured-api recovery receive \
  --restore-operation /private/recovery/restore-1 \
  --targets /private/recovery/targets-1.json \
  --operation /private/recovery/receive-1 \
  --review-sha256 ACTUAL_RECEIVING_REVIEW_SHA256 \
  --quiesced
~~~

The receiver retains the complete immutable request before placement. It holds
the explicit parent writers, creates only the original selected roots, and
copies the complete native files. An interrupted copy resumes only its exact
original prefix. Whole-file publication uses the existing private native file
publisher and retains interrupted publication state.

After every root is placed, the original product, release and OAuth leases
protect final receiving. Completed archives and uploaded handover files carry
the original metadata and SHA-256 while their receiving filesystem inodes
change. The receiver retains the exact recovered-file binding plan, publishes
its explicit native sidecars and checks the full original tree plus only those
planned additions. Original saved records and operation IDs keep their bytes.
A restored partial upload can continue through the original native upload
engine; completed normal records remain the current native authority.

Final native validation reopens the original product profile, selected release
and OAuth state. It preserves configured OAuth connections that have not yet
received a grant. The result has status `CAPTURED_RECOVERY_RECEIVED` and includes
the original product, snapshot/plan/review identities, received roots,
authorization directory environment references, retained file bindings and
ordinary reopen command.

Repeat the same receive command after an interruption or lost reply. The
operation resumes its original directory/file ownership and exact selected
bytes. Once all source roots are placed, its retained manifest and binding plan
let the remaining native binding and validation finish from those placed
files. A completed operation returns its first saved result before later product
work, target declaration changes or delivery movement are inspected.

~~~sh
starforge captured-api recovery status \
  --operation /private/recovery/receive-1
~~~

This returns the retained phase, error/progress information and original result.
Keep the same operation directory and original full request for continuation.

## 7. Reopen the recovered product and continue normal work

Recreate the original environment references reported by receiving. Browser
OAuth `directoryEnvironment` entries use the original directory paths;
`environmentFiles` identifies retained files such as `MCP_OAUTH_CONFIG`.
Incoming MCP token variables and OAuth client-secret values remain the host's
private environment. The recovered files retain the native grants and saved
authorization state.

Open through the completed receiving operation:

~~~sh
starforge captured-api recovery open \
  --operation /private/recovery/receive-1 \
  --browser-only
~~~

Or select both original listeners:

~~~sh
starforge captured-api recovery open \
  --operation /private/recovery/receive-1 \
  --port 0 --mcp-port 3211 --token-env MCP_ACCESS_TOKEN
~~~

The command resolves the saved received product and delegates directly to
ordinary `captured-api open`. It uses the existing profile, browser, MCP
configuration, original leases and graceful Stop behavior. The printed browser
URL opens the recovered source library. **Merchant handover** reopens its saved
drafts, operations, complete files and received merchants. The original operator
console retains saved route policies and merchant procedures. Open the retained
merchant package and use its native release controls to resume the seller.

For Applications, select the restored private product directory in the existing
**Captured API merchant** application, review the current source/environment
binding, and use its ordinary review/start/Stop/reopen controls. The recovered
product can also use its direct normal command:

~~~sh
starforge captured-api open --dir /private/state/captured-api --browser-only
~~~

Later ordinary source reviews, release changes and operator work advance the
same product. The completed receiving result remains the historical receipt
for the original snapshot.

## Recovery reference

| Observed state | Continue the original operation |
| --- | --- |
| Current source differs from a saved plan | Keep that plan and its capture; save a new plan filename for the current complete edition |
| Incomplete capture | Same plan, bundle, operation, hash and passphrase variable with selected writers stopped |
| Complete capture after later edits | Repeat the original capture request; native verification reopens its first completed snapshot |
| Lost capture/restore/receive reply | `status --operation` or the exact original command |
| Incomplete restored staging tree | Repeat the original restore; the operation retains its own incomplete attempt before continuing |
| Restore completed before its saved reply | Repeat restore; full authenticated staged-file verification reconstructs the completed result |
| Bundle moved after completed restore | Use `inspect-restore` and the retained restore operation |
| Existing receiving root | Preserve that root and choose the appropriate original-host recovery arrangement before starting placement |
| Receiving file publication interrupted | Same receive request; original file-prefix and publication identity resume |
| Receiving parent or selected file replaced | Restore the selected original parent/file state; the retained operation reports the concrete changed identity |
| Source staging moved after all roots placed | Same receive request continues native binding/validation from retained original metadata and placed files |
| Partial handover upload restored | Original upload ID, exact pending chunk or next offset through the existing browser/agent/client |
| Complete archive or upload restored | Original complete native file entry and original SHA, with its explicit restored-file binding |
| Product close interrupted | Retry Stop on the original owned product instance until its native drain finishes |

The original SF101 limits apply to the complete snapshot: up to 20 native roots
including the typed plan, 10,000 total file/directory entries, depth 16, 2 GiB per
file, 4 GiB total plaintext, a 256 KiB plan and 12 MiB manifest. Coalesced operating
roots therefore use at most 19 root entries. Private snapshot metadata may be
larger than an individual browser or merchant JSON response; the recovery
commands operate on full local files.

## Typed source API

The maintained product declares the export subpath
`./products/captured-api/recovery` in its installed package. Direct source import is
`products/captured-api/recovery/workspace.mjs`, with the complete adjacent
`workspace.d.mts` declaration.

~~~js
import {
  inspectCapturedRecovery,
  prepareCapturedRecoveryPlan,
  captureCapturedRecovery,
  restoreCapturedRecovery,
  reviewRecoveredCapturedApi,
  receiveRecoveredCapturedApi,
  capturedRecoveryStatus,
  recoveredCapturedApiSelection
} from './products/captured-api/recovery/workspace.mjs';

const source = await inspectCapturedRecovery({
  selectionFile: '/private/recovery/selection.json'
});
const prepared = await prepareCapturedRecoveryPlan({
  selectionFile: '/private/recovery/selection.json',
  planFile: '/private/recovery/captured-plan-1.json',
  quiesced: true
});
const captured = await captureCapturedRecovery({
  planFile: prepared.planFile,
  expectedPlanSha256: prepared.planSha256,
  bundleDirectory: '/private/recovery/captured-bundle-1',
  operationDirectory: '/private/recovery/capture-1',
  passphraseEnv: 'CAPTURED_RECOVERY_PASSPHRASE',
  quiesced: true
});
~~~

Continue with `restoreCapturedRecovery` using `bundleDirectory`,
`operationDirectory`, `expectedManifestSha256: captured.snapshotSha256` and
`passphraseEnv`. Review receiving using `restoreOperation`, `targetFile` and
`operationDirectory`, then pass the exact returned
`expectedReviewSha256: reviewed.reviewSha256` to
`receiveRecoveredCapturedApi` with `quiesced: true`.

Capture inspection accepts an optional `{ environment }` second argument for
the original directory-variable resolution. SF101 reads the named passphrase
from its real process environment. Native readers and writers keep their
original filesystem and operation contracts. `capturedRecoveryStatus` reopens
the retained result, and `recoveredCapturedApiSelection` resolves a completed
receiving product for its ordinary current opening lifecycle.
