# Runtime Workspace: product selection, operation and complete recovery

Runtime Workspace is the local operating application for receiving, building,
installing and continuing a selected Starforge product. It connects the original
distribution builder, dependency installer, managed-release controls and saved
application records. Its browser and headless interfaces operate the same retained
workspace. An operator can choose a product, reopen its exact source and runtime
selection, follow the original installation, and continue delivery after a lost
browser response or interrupted host.

This guide develops the existing SCF chapter **Product selection, installation
and recurring buyer work**. Product selection, saved plans, collections and the
installation return remain part of that chapter. The backup and observation
features add a complete operating and receiving path for the same workspace.

## Customer and operator value

An implementation partner needs to keep more than a packaged application. The
product decision, immutable source, reviewed adapters, dependency lock, customer
settings, previous operations and retained outputs explain what was installed and
how to continue it. Runtime Workspace keeps those records connected to their
original source and native installation.

Whole-workspace receiving preserves the complete included workspace as one
checked archive. The receiving operator can inspect that archive, resume its
transfer, restore the original location, review the current external bindings and
reopen the same workspace. Separately stored runtimes, managed homes and customer
data keep their existing native backup procedures. The archive review identifies
those dependencies so a receiving host can prepare them deliberately.

Operation observation makes the retained work readable when a native process or
lease probe is unavailable. The row carries its current observation error and
keeps the original phase, request, source and output. Installation, recovery,
activation, terminal input and command launch still use their actual lifecycle
checks. This distinction lets the operator investigate the original work without
turning an unavailable observation into a second launch.

## One connected operating course

| Stage | Operator action | Retained result |
| --- | --- | --- |
| Select | Review committed source, capability basket and original recipe; save the product plan | Original commit, source review, requirement selection and plan |
| Prepare | Import the exact archive and select the declared adapters and compatible versions | Source inventory, profile identity and original installation request |
| Install | Start or resume the original installer with its retained cache and dependency lock | Actual attempts, npm output, readiness and final runtime directory |
| Operate | Attach the READY runtime, review the managed home, adopt or stage its release and open Applications | Original release/source binding, settings, process records and output |
| Observe | Refresh the selected operation or its retained log | Current nullable liveness observation alongside original recorded state |
| Preserve | Review the complete workspace and create the corresponding backup | Complete archive digest, manifest, inventory and external binding list |
| Receive | Inspect or resume the same uploaded archive and restore its original location | Original workspace identity, history, receiving request and restored files |
| Reopen | Review external bindings and record the exact receiving review | Explicit original reopening command; zero imported workers launched |

The operator uses the same saved plan and operation when continuing one stage.
New requests receive new UUIDs. Repeating an unchanged UUID reopens its original
request; conflicting content for an existing identity is rejected.

## Install and open the existing application

Use the maintained selected distribution on Linux with Node 22.16 or later,
Python 3.11 or later, npm and flock. A selected product may require a newer Node
version; its profile supplies that requirement. The browser adds no npm dependency
or browser build step.

~~~sh
starforge runtime-workspace init \
  --workspace /srv/starforge/runtime-workspace \
  --runtime-home /srv/starforge/runtimes

starforge runtime-workspace serve \
  --workspace /srv/starforge/runtime-workspace
~~~

Open the complete private loopback URL printed by the server. A new server
process issues a new private URL while reopening the same saved workspace.
[The Runtime operator guide](README.md), [source builds](SOURCE_BUILDS.md),
[saved product plans](PRODUCT_PLANS.md) and [managed operations](MANAGED_OPERATIONS.md)
describe the original selection, installation and application controls.

The original final runtime directory remains the dependency location. Managed
adoption records both its source root and dependency root. A deliberate runtime
move follows the original installer's recovery into a new final directory,
followed by normal registration and reviewed adoption.

## Read an uncertain original operation

The Operations and Managed releases views offer **Refresh operation status** for
one original UUID and **Open retained output** for its log. Applications uses the
same observation reader for current launch, history, output and terminal state.

~~~sh
starforge runtime-workspace operation-status \
  --workspace /srv/starforge/runtime-workspace --operation-id UUID

starforge runtime-workspace operation-log \
  --workspace /srv/starforge/runtime-workspace --operation-id UUID
~~~

The model exposes operationStatus and logs. The private HTTP server exposes
GET /api/operation-status?operationId=UUID and GET /api/log?operationId=UUID.
A workspace refresh summarizes unavailable operation IDs as a partial
observation while retaining the remaining rows.

| Field or state | Meaning |
| --- | --- |
| Original phase | The retained request's actual recorded phase |
| workerActive / commandActive = true | The current observation found the original activity |
| workerActive / commandActive = false | The current observation found it inactive |
| workerActive / commandActive = null | Current activity could not be established |
| OBSERVATION_UNAVAILABLE | This row has an unavailable native observation; its original phase stays separate |
| INTERRUPTED | A running record was observed without an active original worker or command |
| NOT_CREATED log | The original log file has not yet been created |
| UNAVAILABLE log | Reading that original file returned an error |

The reader shares simultaneous observations and limits native observation
concurrency. When one lease probe is unavailable, remaining rows retain their
records and visible process identities while deferring further native probes.
The audited passive state, history and output views avoid feature initialization,
record writes and unnecessary strict lifecycle probes. A read-shaped method that
performs native source acquisition, verification or outcome updates still uses the
writer lease: this includes source-build catalog/product/download and public
workbook result/download. The original lifecycle methods retain the common
workspace gate and their existing source and process checks.

## Create a coherent workspace backup

In **Workspace backup**, choose an absolute private backup storage directory
outside every Runtime workspace. That storage holds reviews, archives, retained
uploads and receiving operations. Keep its original location for continuation.

Choose **Review complete workspace**, then inspect the actual workspace identity,
original directory, included byte and file counts, inventory digest and external
bindings. Resolve any original activity that prevents a stable backup through
its existing operating controls. **Create this reviewed backup** binds the
export request to that reviewed source.

The backup includes the workspace's complete included records and files:
retained source inventory, saved plans, application settings, operation history
and outputs located beneath it. Its inventory preserves regular files,
directories and permitted relative links. The implementation coordinates actual
workspace writers and original installation leases during the snapshot. A changed
review must be refreshed before it can select a different source state.

**Download complete backup** streams the archive. Retain its complete SHA-256,
byte count and manifest identity. The headless download verifies those values,
syncs its temporary output and publishes a new filename while preserving any
existing output file.

[WORKSPACE_BACKUP.md](WORKSPACE_BACKUP.md) supplies the complete review, create,
download, upload, inspection and receiving commands.

## Receive and restore the original workspace

Create a separate private control workspace on the receiving host. In its
**Workspace backup** view, supply either the actual archive file or its absolute
host path and the expected SHA-256. Inspect the archive before selecting restore.

Browser upload retains its request UUID, expected digest, full length and actual
received offset. The same file and UUID continue the original transfer. A
complete upload whose final verification was interrupted continues that
verification. A completed retained upload can be inspected without resending it.

Restore binds the original archive and manifest to its original absolute
workspace directory. The destination is vacant or belongs to the same receiving
operation being continued. The receiver preserves the original workspace
identity and operation history. **Continue original operation** resumes the
same retained export or restore.

The receiving marker exposes the workspace's actual receiving identity while
the original configuration is still being restored. The recovery view can remain
readable before the external runtime home is available. Normal workspace writes
resume after the same receiving operation has completed restoration and recorded
the reviewed external binding state.

## Review external bindings

The archive declares paths outside the workspace, including the runtime home,
registered runtimes, managed homes and referenced sources or data. External trees
are not copied recursively. Restore them through their own original product
procedures at their recorded locations.

Generic embedded-path discovery reads JSON files up to 4 MiB. The review lists
larger or unparsed JSON files with their path, size and reason. Those files are
still included in the archive; the operator reviews their original content for
additional external dependencies.

**Review restored bindings** reports each original path and its purpose, current
availability and source identity. The same review can be refreshed after a
missing dependency is restored. **Record review and show reopening command**
saves the exact reviewed binding state and returns the original directory and
workspace identity. It starts zero imported workers.

Serve the restored workspace at that original location, inspect its current
native readiness, and use its ordinary Applications or managed controls for the
next explicit operation. Retained request hashes and archived absolute paths
remain the original values.

## Developer integration

The existing openRuntimeWorkspace model exposes all ten backup methods:

- workspaceBackupState
- workspaceBackupReview
- workspaceBackupCreate
- workspaceBackupUpload
- workspaceBackupInspect
- workspaceBackupRestore
- workspaceBackupContinue
- workspaceBackupDownload
- workspaceBackupBindings
- workspaceBackupOpen

Each accepts the same optional storageDirectory. Creation and continuation
use explicit original request or operation IDs. The TypeScript contract is in
[workspace-backup.d.mts](workspace-backup.d.mts); the native archive engine is
[workspace-backup.py](workspace-backup.py), bridged by
[workspace-backup.mjs](workspace-backup.mjs).

The private server retains its loopback binding, capability checks, exact-origin
write checks and no-store responses. JSON actions are under
/api/workspace-backups/. Upload streams an application/octet-stream body with
requestId, sha256, bytes, offset and optional storageDirectory. Download returns
a short-lived one-use same-origin URL for the retained archive.

The common workspace gate coordinates lifecycle writes and backup snapshots.
Nested atomic record publication shares that gate; temporary records are closed,
removed and parent-synced on a failed write or publication. Passive readers
retain their existing result sources and diagnostic detail. Reopening a restored
workspace does not replace its product-specific original command engine.

## Complete native receiving and grant delivery

The maintained whole-course programme is
[receiving/WORKSPACE_BACKUP_RECEIVE.mjs](receiving/WORKSPACE_BACKUP_RECEIVE.mjs).
It invokes the real model, CLI, archive engine and browser against one retained
private operating case. It uses the selected complete Runtime source,
Node/Python, an existing Chromium executable and the installed Playwright module
directory.

~~~sh
node receiving/WORKSPACE_BACKUP_RECEIVE.mjs \
  --source /absolute/selected-source/distribution/runtime-workspace \
  --operation /absolute/private/runtime-backup-receiving-case \
  --chromium /absolute/existing/chromium \
  --playwright-root /absolute/existing/node_modules
~~~

Continue using those same source and operation paths. The course retains its
original UUIDs and native lease. It exercises complete backup/download,
inspection, original-location restoration, binding review, explicit reopening,
retained upload and headless interfaces. It includes original SQLite and binary
inputs, a relative link, writer and installation lease observations, and
desktop/phone browser captures. Its interruption step reports whether its own
restore child was actually interrupted or had already finished.

Retain the whole case. OPERATING_CASE.json holds the original IDs, steps and
attempts; operator-output/ holds commands and downloaded artifacts; screens/
holds browser captures. On completion,
operator-output/COMPLETE_RECEIVING_RESULT.json supplies the actual archive,
restore, receiving and workspace identities.

### Current source and receiving edition

The backup/observation feature is merged in the merchant source through
74a378219267702ac1c4702a48ee87278781a360 and in the public distribution through
9e561f5a9e09eb3ac72655e502de58cce4416c3d. The original receiving operation is
SCF-RUNTIME-WORKSPACE-BACKUP-9F05-20261013. Its connected whole-course result
is pending the existing native receiving continuation. The source integration,
operator workflow and retained receiving programme are available for that same
course.

This operating contribution belongs to the existing product selection and
installation chapter. The canonical SCF application continues to control the
USD 38,000 request, 400 prospective hours, 150-day schedule, six funded packages
and customer outcome counts. The cumulative publisher receives this chapter
edition and its original source declaration into the existing reviewer outputs,
saved submission and review surfaces.
