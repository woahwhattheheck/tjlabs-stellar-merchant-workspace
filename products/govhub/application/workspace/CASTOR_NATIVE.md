# Native Castor release and recovery in GovHub

This provider connects the existing GovHub project, environment, reviewed plan,
operation journal and complete handover to an application's **existing Castor
tasks**. Castor performs the work. GovHub preserves the selected native source,
task definition, context, argument tokens, original process receipt, files and
verification results.

The selected project can use an installed Castor executable, a PHAR with an
explicit PHP launcher, or its own repacked executable. This integration does
not replace its task implementation or create a CI workflow. An article's
example application, registry, task names and credentials are never defaults.

## Authoritative source

The implemented CLI contract was read from JoliCode Castor **v1.8.1**, original
commit **058feddafd0b977eebf33364d02cd553ae26854a**, published September 21, 2026.
The original release metadata, native tag/tree response, selected complete
source files and MIT license are retained in native/castor/. The source index
records every original Git blob and UTF-8 identity.

Primary references:

- https://github.com/jolicode/castor/tree/058feddafd0b977eebf33364d02cd553ae26854a
- https://github.com/jolicode/castor/releases/tag/v1.8.1
- https://castor.jolicode.com/
- https://jolicode.com/blog/deploiement-on-premise-partie-2-castor-a-la-rescousse

The selected upstream Composer source requires PHP **8.4 or later**. The
previous optional PHP 8.3 Drupal closure is not a compatible launcher for this
release. Use the actual compatible launcher or the application's selected
complete static executable. Its version and full executable hash are
observed and retained; no automatic self-update or dependency substitution
occurs.

Castor's actual Kernel deliberately selects an empty context for its general
list command. The provider receives that full catalogue, then receives
native help for each selected application task in its **explicit context**.
A missing context or mismatched native task stops before application-task
dispatch. A repacked application may use another application name/version;
the actual installed tool and embedded source remain authoritative.

## Original operating model

Keep the selected application source tree and GovHub's private receiving
workspace in **separate directories**. Full source receiving must not ingest
its own newly created journals, images or archives. The provider rejects a
Session output directory inside the selected source tree.

One original GovHub environment owns:

- its existing deployment identity;
- its exact Docker context and Compose project;
- the ordered original Compose files;
- the selected Castor root and context;
- the full native source commit and actual working tree;
- the task and its exact arguments;
- the full backup/release/input/output selection and native verification.

Use the existing POSIX/Linux or WSL GovHub native Session host with its real Docker context. This provider preserves its process-group, filesystem and native lock behavior; a Windows Castor release asset alone does not establish Windows support for the surrounding GovHub runner.

Only the actual host executable paths and source directory are runtime
bindings. They cannot change the original deployment, Docker context,
Compose project, task selection, arguments, expected results, source commit,
or chosen recovery inputs.

A preview must target an existing GovHub environment whose purpose is
Candidate or Rehearsal. Rehearsal, Cutover and Rollback keep the existing
GovHub plan/source/review admission. Cutover still requires the original
passing comparison and explicit approving review. A selected task may
perform several native steps internally; its actual application source
defines those steps.

## Profile fields

All structured selections are explicit JSON text in the existing profile
form. Paths below are ordinary project-relative paths unless a native host
path is explicitly stated. Declared output paths and recovery inputs cannot
follow symlinks.

| Field | Meaning |
| --- | --- |
| source_kind | castor |
| environment_id | Existing deployment identity selected by the operator |
| site_root | Absolute existing native application source directory |
| castor_path | Actual installed Castor, repacked PHAR, or static executable |
| php_path | Explicit compatible PHP executable when launching a PHAR |
| git_path, docker_path | Actual installed native executables; normal PATH names are accepted |
| docker_context | Exact existing native Docker context |
| compose_project | Exact existing Compose project name |
| compose_files_json | Complete ordered array of original Compose file names |
| castor_file | Actual relative root PHP file; empty for a repacked executable |
| castor_context | Actual selected named context; empty only if there are no named contexts |
| source_revision | Full reviewed Git commit; optional on first Capture |
| task_name | Selected original application's named task |
| task_args_json | Exact argument tokens, with no shell expansion |
| verify_task_name | Selected existing native verification task |
| verify_args_json | Exact native verification argument tokens |
| verify_source | stdout or file |
| verify_output_path | Actual verification JSON file when verify_source is file |
| verification_checks_json | Nonempty array of native JSON-pointer/expected-value comparisons |
| task_outputs_json | Complete declared native output files/directories with roles |
| backup_inputs_json | Complete selected original recovery files/directories and SHA-256 identities |
| release_files_json | Complete selected release executable/PHAR/configuration files |
| source_images_json | Immutable original Docker image IDs or repository digests; empty selects the complete native Compose cohort |
| timeout_seconds | Actual native command deadline, 10 through 86,400 seconds |
| max_artifact_bytes | Explicit maximum individual retained file bytes |

The following are **shape examples**, not observed customer source:

    compose_files_json:
    ["compose.yaml","compose.production.yaml"]

    task_outputs_json:
    [
      {"path":"retained/database.sql","role":"database","kind":"file"},
      {"path":"retained/uploads","role":"files","kind":"directory"}
    ]

    backup_inputs_json:
    [
      {"path":"retained/database.sql","role":"database","sha256":"<actual original 64-character SHA-256>"}
    ]

    verification_checks_json:
    [
      {"pointer":"/actual_native_report/status","equals":"<the actual expected native value>"}
    ]

Use the application's real file names, report shape, expected values and
task arguments. These examples are deliberately not executable defaults.
The provider does not synthesize a successful backup report or invent a
database consistency guarantee.

Every exact task token travels as an argv element through the existing
Session command runner. It is not interpreted by a shell. Task arguments
cannot override the bound Castor root or context, nor force another remote
import selection. Secret values belong in the original application's private
configuration or native credential storage, not argv or report labels.

## Capability and first Capture

Inspect the existing profile through GovHub's normal capability action.
The result includes full original task rows/help, observed version, source
head, selected files, native engine, Compose configuration and actual
containers/images. The local capability inspection is read-only orchestration
of native inspection commands; original application boot/context hooks still
run according to the selected Castor source.

The complete Capture does the following in the original receiving Session:

1. Receives native Git HEAD, index, tracked and untracked file identities,
   complete nested submodule worktree identities, and native task/tool output.
2. Receives Docker engine identity, complete selected Compose configuration,
   actual containers and images, original release files and declared outputs.
3. Passes that original selection to the complete source helper. A first
   capture without source_revision uses the actual observed full commit.
4. Receives source/Git/project, executable, selected image archives, declared
   original files and complete command outputs through the helper's verified
   archive.
5. Reads the same selected source/engine/configuration again. A changed
   original binding is retained as an incomplete operation rather than
   silently producing a mixed accepted source.

Task lists, native stdout/stderr and Compose configuration are private
source. Complete configuration can contain sensitive application settings;
it remains in the selected private project and its intended encrypted or
otherwise authorized handover. Generic product code contains none of those
customer values.

## Complete native purposes

| GovHub purpose | Action | Native operation |
| --- | --- | --- |
| CAPTURE | castor-capture | Receive the complete selected project and native inventory |
| BACKUP_CREATE | castor-backup | Run the selected existing backup task, receive every declared output and verification |
| PREVIEW | castor-preview | Run the chosen existing task on the selected Candidate/Rehearsal environment |
| REHEARSAL | castor-restore | Run the selected restore against the original hash-bound recovery inputs |
| CUTOVER | castor-release | Apply the selected original release task under the existing reviewed plan |
| ROLLBACK | castor-rollback | Run the original recovery task and verify the selected recovery result |

Every mutation requires the reviewed original source commit, application task
and explicit verification task/checks. Backup requires declared complete
output paths. Restore and Rollback require original hash-bound input files.
A task is selected by its actual native name; tool maintenance, remote package
execution, repack and compile are not interchangeable defaults for an
application mutation. Applications may expose their own reviewed build or
release task, whose source and outputs are retained.

Before dispatch, the provider captures the full original source. Missing
declared *future output* files may be absent at this stage; their absence is
recorded, not filled with a placeholder. It then freshly compares source
content, index/worktree, submodule identities, executable identities,
selected configuration, native engine and recovery input bytes. A changed
source refuses dispatch under the old reviewed instruction.

The existing Session records the exact command before starting its process.
It records stdout/stderr, actual return code, original PID and invocation
time, and retains the exact original command receipt. Native process-group
cancellation and deadlines remain the existing Session implementation.

After an actual successful exit:

1. Run the selected verification task once through the same original command
   journal. Its unknown exit is also retained; verification is not blindly
   repeated after loss.
2. Receive the actual complete JSON stdout or declared file. The full report
   is frozen by hash before evaluating the selected JSON pointers.
3. Compare every actual observed value with the selected expected value.
   JSON types matter; false, zero and an empty string are distinct.
4. Inventory every declared complete output, including every ordinary file
   in each selected directory. A missing or changed original output prevents
   complete receiving.
5. Receive the actual following native inventory and full post-task source
   under a different source phase. New SQL/files/PHAR/image bytes are included
   without executing the task again.
6. Retain the exact original verification, task exit, before/after source and
   output/input identities in the completed native result.

A zero task exit alone does not mean backup or restoration was verified.
The selected task's report determines its actual application-specific
coverage. SQL and files are not labelled a transactional snapshot unless the
original native producer establishes that property.

## Process loss, native receipts and reopening

There is no added task queue or background provider worker. Castor executes
in the original native Session. If the application process may have started
but no complete original exit receipt exists, the operation remains
WAITING_NATIVE. The same command is never reissued merely because a browser,
parent process, transport or receiving host was lost.

The operator first reconciles that exact original process on its original
host. Preserve the original command directory and all output prefixes.
If its complete actual Session receipt exists elsewhere, select that
ordinary absolute receipt path in the continuation field
castor_command_receipt. This is the actual command JSON produced by the
original Session, together with its referenced full stdout/stderr files,
not an operator-written exit code.

The receiver requires the receipt's original argv, cwd, start time,
mutating/input binding and known PID to match the interrupted original. It
requires an observed complete exit and verifies both full output files by
size and hash. Every incoming receipt and prior interrupted record is
retained before the recovered native completion is adopted. A nonzero
observed exit remains the original failure.

Normal Resume uses the original operation ID, retained request digest and
checkpoint. Complete command records reopen without redispatch, including
when an explicitly selected receiving host has different executable paths.
An unresolved old process cannot become a new process on that host.

Completed source receiving and project reopening use the helper's exact
same-packet identity. The source-before and source-after archives remain
separate even when they have the same Git HEAD. That distinction preserves
a native backup task's new outputs and prevents a resumed source stage from
mistaking an earlier archive for its completed following edition.

## Provider and helper integration

The module exports the existing provider functions:

    provider_schema()
    profile(config, runtime_bindings=None)
    provider_context(profile)
    actions_for(operation_type)
    pollable(resume_checkpoint)
    resume_fields(operation, payload, reason)
    discover_capabilities(config, runtime_bindings=None)
    capture(config, context, checkpoint=None, cancelled=None)
    execute(operation, config, source_paths, checkpoint=None, cancelled=None)

The original application Session owns command admission, execution,
cancellation, stdout/stderr, events and native-state.json. The provider calls
the adjacent source helper as:

    capture_source(session, native_inventory, selected_profile)

The selection also carries capture_phase (capture, before or after) and
allow_missing_task_outputs only for the before phase. Original helper
verify_source, receive_source and reopen_source verify/receive the full
archive and reopen native Git/project source without a second application
engine. Consult CASTOR_SOURCE.md for exact complete helper inputs and
independent receiving.

Result statuses remain COMPLETE, WAITING_NATIVE, FAILED or CANCELLED.
native_resume identifies the original command, process observation and
request hash. pollable is false because a local command has no separate
provider-job polling API.

COMPLETE observations include original native_inventory/before_inventory,
source/before_source, task_result, verification, complete task_outputs and
backup_inputs, and original request_sha256. These are actual received
native results. No adoption, payment, client approval or visual acceptance
is implied by source completion.

## Whole installed acceptance

Use the existing full GovHub native course and browser course with the
selected actual application and original operator identity. It must cover:

- selected task/context/source and real native Docker image cohort;
- complete backup and actual declared SQL/files outputs;
- an explicitly selected nonproduction restoration and native verification;
- original process/transport interruption and same-operation continuation;
- full source/project archive download and independent receiving/reopen;
- actual operator screens and all outgoing source/report/downloads.

The producing operator must open the **exact outgoing version**, inspect
actual wide and narrow screenshots, use important controls, download the
complete outputs, and reopen the original project. Source syntax, DOM
counts and this guide are not rendered acceptance. Preserve the original
receiving operation while equipment is unavailable and continue substantive
source work; do not declare a queued operation complete.

## License and boundaries

Authored provider/guide code is Apache-2.0 under the existing GovHub license.
Selected upstream Castor originals retain their MIT license and exact source
identities. Public product source contains generic code and original public
contracts only. Selected customer source, configuration, image layers,
database/files, private task output and commercial correspondence belong
to the operator's original private project and authorized delivery.

Directory recovery inputs declare kind: directory and use the actual output manifest_sha256 as sha256; the manifest is the canonical ordered members array of relative path, bytes and SHA-256. File inputs default to kind: file. The full directory bytes are in the source archive; the directory identity is not a fabricated database backup file. Keep the original restore task arguments and real native directory path.

## Complete private state and bounded operating checkpoints

Every native state remains complete in its original private Session. The operating callback carries an immutable SHA-256/byte-bound `native_state` reference plus the actual phase, original request and pending-command fields, so a large Git inventory does not exceed the existing 1 MiB operation checkpoint boundary. The full state member is retained beside its original command records, included as an original native artifact in returned outcomes and preserved by whole-workspace backup. Receiving resolves only the existing workspace custody relocation and verifies every original byte before reopening the state. No task/source member is omitted or summarized to fit the operating checkpoint. Selected submodules must be initialized; a parent repository cannot stand in for a missing nested checkout.
