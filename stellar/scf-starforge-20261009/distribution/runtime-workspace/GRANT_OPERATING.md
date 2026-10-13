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

## Receive the customer's original file into Applications

Open **Applications → Original input files** in the selected Runtime workspace.
Choose the complete original file from the current computer or phone and save it
under its intended filename. The maintained input engine supports files up to
16 MiB, retaining one-megabyte parts and the verified complete original. Larger
inputs use the existing absolute host-path controls. A partial upload resumes
after reselecting the same complete file.

Open the intended application configuration. Beside its file setting, choose
**Use saved file**, select the original and choose **Prepare working copy**.
This retains the original selection UUID, application kind and field, then
prepares a separate private working file. **Review application** applies the
existing provider's format, runtime and related-path requirements; **Save**
retains the reviewed configuration. Use the ordinary application controls for
its explicit connection or start.

The untouched uploaded original and editable working copy have different roles.
The original can always be downloaded in full. The shelf shows the current
working path and whether its bytes differ. Reopening the original selection
reuses that same path without replacing edits. A changed application or field
during upload leaves the file in the shelf, ready for an explicit later choice.
**Continue prepared file selection** retains the same saved request after an
uncertain response.

For the Grant application, select **Grant planning and delivery → Original
planning scenario** and the customer's original SF47 scenario JSON. Keep its
selected private Grant workspace and READY runtime. The native Grant provider
remains responsible for reviewing the actual scenario and reopening saved plans.

~~~sh
starforge runtime-workspace input-file-import \
  --workspace /srv/starforge/runtime-workspace \
  --file /srv/customer/original-scenario.json

starforge runtime-workspace input-files \
  --workspace /srv/starforge/runtime-workspace

starforge runtime-workspace input-file-prepare \
  --workspace /srv/starforge/runtime-workspace \
  --upload-id ORIGINAL_RETURNED_UPLOAD_SHA256 \
  --request-id ORIGINAL_SELECTION_UUID \
  --kind grant-workspace --field scenarioFile

starforge runtime-workspace input-file-selection \
  --workspace /srv/starforge/runtime-workspace \
  --request-id ORIGINAL_SELECTION_UUID

starforge runtime-workspace input-file-export \
  --workspace /srv/starforge/runtime-workspace \
  --upload-id ORIGINAL_RETURNED_UPLOAD_SHA256 \
  --output /srv/customer/original-returned.json
~~~

Retain the selection UUID before its first prepare request. Pass the returned
working path to the ordinary application review and save. Original bytes,
manifests, incomplete transfers, selection intents, working files and completion
records are retained under WORKSPACE/application-inputs/. Whole-workspace backup
includes that complete tree; restoration and binding review reopen the same
original application and its file selections.

The [complete original-file guide](APPLICATION_INPUTS.md) defines all eight
native methods, authenticated routes, allowances and working-copy behavior.
The original input-to-application course uses the selected READY installation,
complete scenario and existing browser:

~~~sh
node receiving/APPLICATION_INPUTS_RECEIVE.mjs \
  --operation /absolute/private/original-input-case \
  --file /absolute/original-scenario.json \
  --runtime /absolute/existing-ready-runtime \
  --chromium /absolute/existing/chrome \
  --playwright-root /absolute/existing/node_modules
~~~

Continue the same operation directory and inputs. It retains the original
partial upload, saved selection, browser configuration, edited working copy,
CLI original-file download, complete workspace backup, original-path restore,
saved application revision and desktop/320-pixel views. The course's actual
RECEIVING.json and original owner's result supply its operating outcome.

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

## Keep recurring Runtime work in a complete operating procedure

Open **Operating procedures** in the original Runtime workspace. This extends the
selected product and recovery workflow above with the maintained Operating Plan
and Operating Plan Return engines. The customer, owner, useful result and named
recurrence belong to the plan; a recurrence description does not start a scheduler.
Use the original Runtime and Applications controls for actual operating work.

### Prepare the work and retain selected source

Choose the original runtime, operation, archive and backup/receiving IDs relevant
to the task. If backups use another private storage directory, enter that actual
store before refreshing the available selection. Create the procedure with its
named owner and required useful result. The initial source capture is a complete
JSON file carried on its original plan step.

Edit the complete instructions, inputs, expected output, owner, due date and
receiving notes. Add or retain original deliverable files where needed. Earlier
plan revisions remain available. Saving a changed draft creates the engine’s
next original revision against the complete current procedure identity. Browser
drafts and pending requests retain their original workspace and procedure IDs.

After performing work through the original product controls, select the saved
step and the actual resulting source records. Record the operator, assessment
and observed result explicitly. The capture includes its selection and collection
interval. A missing process probe remains an unknown observation. A source capture,
plan status or download by itself does not establish a deployment, purchase or
independent customer acceptance.

### Hand over, receive and review returned work

Download the complete Runtime procedure JSON and readable HTML. JSON contains the
original plan, complete carried files, captures, request history and returned-work
reviews. The HTML also provides its complete editable record. Use original plan
JSON when the receiver works through the maintained generic Operating Plan editor.
Large Runtime archives continue through their native transfer and backup controls;
their source identities and original download references remain in the capture.

The receiving operator inspects the full record and explicitly receives it in a
selected private Runtime workspace. This records the original receiving request
and retains the procedure’s identity and history. It does not attach runtimes,
restore external locations or start applications. Subsequent local edits belong
to that retained procedure. A later returned edition of an existing procedure is
compared by the original Return engine rather than replacing current history.

The owner opens the complete returned plan or procedure, names the reviewer and
reads the original three-way comparison. Resolve conflicts explicitly, then apply
the reviewed work. If the destination plan changed, preserve the complete return
and prepare a fresh comparison against the actual current plan. The full review
retains current and incoming histories and the decisions that produced the result.

### Continue exact requests through the installed command

The existing installed command is `starforge runtime-workspace`. Read the state
with `procedure-state --workspace DIRECTORY`; open a retained record with
`procedure-open --workspace DIRECTORY --procedure-id UUID`. A mutation uses a
complete private JSON request file through `--request FILE`. Generate its UUID
once and retain the unchanged full request before dispatch. Distinct edits use
the latest `recordSha256`; retries retain the original request and input.

The commands are `procedure-create`, `procedure-save`, `procedure-record`,
`procedure-return`, `procedure-decide`, `procedure-apply` and
`procedure-receive`. Export uses `procedure-export --workspace DIRECTORY
--procedure-id UUID --format json|html|plan-json|plan-html --output NEW_FILE`.
The [complete procedure guide](RUNTIME_PROCEDURES.md) gives the original request
shapes, selection fields, review choices, capacity and receiving details; the
[typed adapter](operating-procedures.d.mts) defines the matching native API.

### Run the complete procedure receiving course

The [procedure API/CLI course](receiving/RUNTIME_PROCEDURES_RECEIVE.md) is separate
from the browser and from the earlier complete backup course. It uses the real
model, the original plan/return engines, complete source bytes and the installed
CLI in one retained private case. Invoke the complete selected Runtime source:

~~~sh
node receiving/RUNTIME_PROCEDURES_RECEIVE.mjs \
  --source /absolute/selected-source/distribution/runtime-workspace \
  --operation /absolute/private/retained-procedure-receiving-case
~~~

Continue with identical arguments and that original case directory. The optional
`--workspace`, `--receiver` and `--cold-receiver` select three already initialized
independent Runtime workspaces; `--selection` names the complete original source
selection JSON and `--source-file` names a complete carried source file. The case
retains request UUIDs, full results, source versions and CLI outputs. The entry
adds its own procedure history and invokes no runtime installation or launch.
The guide defines exact prerequisites, existing-workspace checks, continuation
and the complete result files. Native completion is reported only from its actual
returned result; source preparation is a separate result.

### Current source and operating continuation

The complete public Runtime procedures release is PR3565 at
`b50c67989a8204f2baee2e7b96c9e10ca97cdb79`; its eighteen changed source files were
independently read back. Merchant PR1376 at
`2352dffc46f2860ccf52595d2e486b0294b976e8` carries the same complete browser
save/workspace-switch correction. Seven executed asynchronous source
interleavings preserve the original draft, saved request and workspace binding.
The original Plan/Return receiving course completed four revisions, a conflicting
return, full file history, replay and independent receiving, including an older
completed review.

Merchant PR1416 at `8ec0d7d36f01a8ec7ebbf19f6f75d5cfdd75e4ca` supplies the complete
Applications input library and its original selected-file operating course.
All fourteen merged source bodies were read back by its owner. The complete public counterpart is selected at `18434e93edd99b5bd0ed7bdf19628112c17e483d`; its original input guide and seven source declarations retain the same file identities. The original
source and browser-state checks accompany the complete programme. Its full
physical file-to-review/backup course remains with the original input-library
receiver and actual READY installation.

The original Runtime procedure API/CLI course is queued through its existing
A465 receiving request. The earlier backup/observation course and F8C1's complete
Collections browser/MCP customer receiving retain their original saved cases
and owners. Each actual operating result joins the selected course and complete
source record. Source publications, model operations and physical receiving
results remain individually attributable within that same customer workflow.

## Deliver the completed recurring task to its customer

Use the original Collections workspace for the paid request and its retained
output. The Runtime installation and procedure identify the task, source,
operating responsibilities and acceptance criteria; the original buyer owns
approval, spending, dispatch and payment recovery.

After the result is retained, open **Customer delivery** in that same Collections
workspace. Select the original Collection and its relevant requests, or open a
complete received InboxTask by its original directory and task digest. Select
the complete executing application source and its source manifest, then review
the chosen responses and their original outcome observations. The
[complete customer-delivery guide](../../sf88-operator-buyer-cli/collections/delivery/OPERATOR.md)
defines the exact source inventory and all browser/CLI options.

Prepare one stable named delivery against that reviewed selection. The browser
retains its full original request before sending it. **Continue exact retained
operation** resolves an uncertain preparation response using that same delivery
and source. A deliberately different output or source population receives its
own reviewed selection and delivery ID.

The full package contains original response bytes, readable JSON/HTML review,
the complete selected application source and the ordered member manifest. A
received InboxTask requires every selected response to be complete and verified.
When a task chooses a later recovered response, the earlier uncertain attempt
and later response observation remain separate original records.

Open the existing receiving workspace and its **Customer delivery** page.
Select the package, enter the sender's exact SHA-256 and choose **Verify and
receive**. Upload retains its committed chunks and resumes the same original
package. Whole-package and individual-member checks complete before the receipt
is published. **Received customer packages** reopens that saved receipt after
reload or from a fresh browser. **Download original complete package** retrieves
the identical package, including all response, review and source members.
Keep the full received members directory together for offline review.

The [registered MCP delivery guide](../../../../stellar-forge/mcp-paid-agent/COLLECTION_DELIVERY.md)
extends this same workflow to an agent. A host registers the original sender or
recipient listener under a reviewed local name. An InboxTask sender retains the
full packet, original digest and selected source. Private connection information,
file paths and credential values stay in that host configuration. The registered
operations inspect the task, prepare its original request, resume the complete
download/upload, explicitly receive it, discover recipient history and reopen
the same package offline after the original listeners close.

Use the original package SHA, manifest, request and selected source across every
interface. A customer can receive and inspect the whole output before the
receiving engineer prepares its application through the normal Runtime setup.
File handover, application setup, the reviewed operating procedure and complete
workspace backup keep their own original identities. Link them through the
selected customer's workorder and useful result.

For commissioning, record the actual source owner, receiving engineer, host,
complete response population and desired receiving application. T1 resource
integration and authority/handover adapt that source and destination; T3 recovery
carries the original task and customer state through the next maintainer's
restoration. Count paid use through its original purchase and accepted useful
output, preserving the application's existing funding-group rules.

