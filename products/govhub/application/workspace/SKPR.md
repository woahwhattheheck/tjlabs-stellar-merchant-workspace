# Skpr operating project

The Skpr provider runs the released native CLI inside the existing GovHub workspace. It supplies environment and release discovery, complete source capture, native backup creation and download, a reviewed restore or deployment, and a receiving command that opens the complete delivered application and the same saved operating project.

The original GovHub records, source cohorts, staff accounts, native worker, revision controls, comparison inventory, exports and private workspace backup remain the operating system for this work. Skpr credentials stay with the existing native account on the operating host.

## Native source and runtime

The supported CLI is **Skpr v1.9.4**, original source commit **0014e431f5892591fb04600a2e2ca706d70a3897**. Its API dependency is **v1.8.5**, source commit **93f97034c4f88cb29d369f03761c12599f63b92c**.

The receiving host can select an existing native executable or receive the original Linux amd64 release archive:

| Original dependency | Value |
| --- | --- |
| Release | [Skpr CLI v1.9.4](https://github.com/skpr/cli/releases/tag/v1.9.4) |
| Archive | [skpr_1.9.4_linux_amd64.tar.gz](https://github.com/skpr/cli/releases/download/v1.9.4/skpr_1.9.4_linux_amd64.tar.gz) |
| Bytes | 45,368,316 |
| SHA-256 | e9ede2b799e9a32bae51446da404c10467df252a4d844efd2f166fa54205bd58 |
| API source | [skpr/api at the original API commit](https://github.com/skpr/api/tree/93f97034c4f88cb29d369f03761c12599f63b92c) |
| Provider implementation | skpr_adapter.py |
| Receiving application | skpr_receive.py |
| Browser controls | web/skpr.js and web/skpr.css |

This application invokes the original release as an external dependency. The Skpr CLI source has not been copied into the application. The source references below identify the command and data contracts used by the integration.

The host needs Python 3.11 or later, its existing Git and POSIX env executables, the original project containing .skpr/config.yml, and the existing Skpr login. Native backup downloads also use the restic executable and mounted original repository provided within the Skpr environment.

Skpr reads .skpr/config.yml from its original project context and then applies SKPR_API, SKPR_SSH and SKPR_PROJECT. The adapter binds those three public target values for each child process. The native account retains SKPR_USERNAME, SKPR_PASSWORD, SKPR_SESSION or its existing cached login through the released CLI. The application does not copy their values into the profile.

## Prepare the operating host

Choose the actual cluster hostname, project and environment. The native environment identity is their exact slash-separated value:

~~~text
cluster-hostname/project/environment
~~~

The same value belongs in the GovHub environment record's provider resource and the native profile. Source backups may come from another environment in the same selected project.

Prepare an already installed CLI using the actual private paths on this host:

~~~sh
python3 skpr_receive.py --runtime-dir "$SKPR_RECEIVING_DIRECTORY" prepare \
  --skpr "$SKPR_NATIVE_EXECUTABLE" \
  --site-root "$SKPR_ORIGINAL_PROJECT" \
  --environment-id "$SKPR_ENVIRONMENT_ID"
~~~

Alternatively, replace --skpr with --archive and the complete original release archive path. The archive receiver verifies its full byte count and SHA-256 before retaining the executable. Existing runtime selection is also tied to the actual executable hash and its native --version output.

The preparation result includes the four receiving path fields: skpr_path, git_path, env_path and site_root. Save those values in the Skpr native profile. Select existing command paths; keep the private operating directory separate from the site source.

Open the original application using its existing workspace, separate source intake, staff username and password environment-variable name:

~~~sh
python3 skpr_receive.py --runtime-dir "$SKPR_RECEIVING_DIRECTORY" serve \
  --workspace "$GOVHUB_WORKSPACE_DIRECTORY" \
  --source-root "$GOVHUB_SOURCE_INTAKE" \
  --username "$GOVHUB_STAFF_USERNAME" \
  --password-env GOVHUB_STAFF_PASSWORD \
  --port 8792
~~~

The application uses its existing staff login. In **Environments**, open the actual environment's **Native configuration**, select **Skpr / native project CLI**, and save the original target and receiving paths.

## Native observations and deployment selection

The **Native tools** page shows the original cluster, project, environment, production flag, version and phase, database and volume names, selected release image references, and the complete environment backup and restore collections. It also retains the original CLI environment and release tables.

The released native commands are:

~~~text
skpr info ENVIRONMENT --format=json
skpr list
skpr release list
skpr release info VERSION --json
skpr backup list ENVIRONMENT --json
skpr restore list ENVIRONMENT --json
skpr mysql backup list ENVIRONMENT --json
skpr filesystem backup list ENVIRONMENT --json
~~~

The CLI's release-list implementation emits its native table even though it declares a JSON option. This integration retains that original table. Release-info JSON supplies the exact runtime image names, types and tags for a selected version.

A deployment requires an existing release version, the observed release SHA-256, and the complete observed .skpr configuration SHA-256. After observing the selected version, **Use these deployment selections** fills the reviewed identities into the native profile. Save that profile before starting the operation.

The configuration identity covers every regular .skpr file, relative name, byte count, SHA-256 and original permission mode. The adapter compares the selected release and configuration before preparing recovery and immediately before starting the native deployment.

The original environment response may contain private native fields. Its complete output belongs in the private operation files. The operator summary selects the fields used in the application.

## Complete source capture

Start **Capture original source** from the native environment or operating queue. The operation retains:

- The native CLI version and executable identity.
- The complete original environment, backup, restore, component and release observations.
- Every regular .skpr file with its original relative path, bytes, hash and mode.
- The original Git commit and a Git bundle containing its reachable refs and HEAD.
- A tracked source archive for the exact commit.
- Separate staged and unstaged binary patches, their combined patch, and original porcelain status.
- An archive of the original untracked, nonignored source files.
- The mounted restic repository's complete native snapshot catalogue.
- Original command arguments, output, exit state and the source package manifest.

The source package retains Git-managed dependency declarations and lock files. Native dependency installation and project build follow the received site's original instructions. The original .skpr directory is captured in full even when a file there is ignored by Git.

Source capture checks the commit, status, index, working patch, untracked file bodies and configuration after the full capture. A receiving operation therefore opens one coherent captured source state. If the site is being edited during capture, finish that edit and capture the resulting source as a new original source observation.

The private GovHub workspace must be outside the original project source directory. Its credential-bearing configuration, provider metadata and backup files belong in the private project handover.

## Native backup creation and lifecycle

**Create and retain native backup** submits the original environment backup command. An optional JSON array of native MySQL policy names supplies the CLI's --mysql-policy values. An empty array uses the environment's actual native policy.

The command immediately returns the original backup name. The saved operation retains that name and observes the same item in the native backup collection until its phase is Completed. It retains native Failed or Unknown phases as the returned provider outcome. Normal accepted work is polled at 15-second intervals; an interrupted provider read can use the longer retained continuation interval.

The environment backup and component records use different identifiers:

| Native collection | Exact parent relationship |
| --- | --- |
| Environment backup | BackupStatus.Name is the whole backup's identity |
| MySQL component | MySQLBackupStatus.BackupID equals the parent environment backup's Name |
| Volume component | VolumeBackupStatus.BackupID equals the parent environment backup's Name |
| Restore | RestoreStatus.Backup identifies the selected original environment backup |

A component's Name identifies that component record. Its Database or Volume contains the native physical resource. The whole backup's Databases and Volumes describe its logical resource collection. The adapter retains those values separately and joins only through the original BackupID relationship.

The released CLI prints a specific English empty-collection response when no backup or restore exists. Those exact empty results are parsed as an empty original collection. The native n/a component placeholder is also handled explicitly.

Completed backup component counts and phases are checked against the whole backup's original databases and volumes before download. The application retains the backup's original policy context so that the delivered recovery set reflects what the native backup actually contains.

## Retain the actual backup archives

Skpr exposes the original mounted restic repository within the environment. The operator downloads a selected backup through that repository:

~~~text
skpr exec ENVIRONMENT -- restic snapshots --json
skpr exec ENVIRONMENT -- restic ls --json FULL_SNAPSHOT_ID
skpr exec ENVIRONMENT -- restic dump -a tar FULL_SNAPSHOT_ID /
~~~

The released SSH implementation joins its remote arguments before execution. The adapter quotes each original argument once before handing it to that native command.

When the native backup is ready, the saved operation displays every original database and volume component and the complete mounted snapshot catalogue. Choose the actual full snapshot ID for each component. Search uses original snapshot ID, time, hostname, tags and paths. The selections stay on this same operation and are exported with the backup manifest.

The environment backup's Name, the component Name and the restic snapshot ID are retained as separate fields. A selected restic ID must occur in the current native repository catalogue. A full snapshot may intentionally serve several selected components; its archive is downloaded once, and every component association is preserved.

Each download retains the complete native file listing, original tar archive, whole-archive hash, and an index with every member's path, type, size and body hash. Hard links retain their native target and resolved file identity. The received file inventory must agree with the selected snapshot's original listing.

The individual artifact allowance defaults to 1 GiB and can be raised for the actual project. The native file listing is checked before a large archive download. Archive source bodies are streamed and hashed rather than embedded into the operation's small saved checkpoint.

**Download selected native backup** uses the exact Name selected in the profile. Backup selection buttons fill the original identity and source environment. Save the profile to retain that choice.

## Reviewed restore and deployment

Create the original comparison cohort and bind the captured source, selected native backup manifest and retained original files through GovHub's existing Sources and Inventory workflow. The restore manifest's native format is **skpr-backup-manifest**.

A rehearsal, cutover or rollback uses the existing source pins, actual environment record and operating authorization reference. The provider supplies two actions:

| Action | Native operation |
| --- | --- |
| skpr-restore | Restore the selected original environment backup to this configured environment |
| skpr-deploy | Deploy the existing reviewed release with the captured original .skpr configuration |

Both journeys first create and retain a native backup of the target environment. The recovery backup's actual archive set remains on the same original operation. For restore, the reviewed source backup archives are also received before the target change.

Restore uses the released command:

~~~text
skpr restore create TARGET_ENVIRONMENT ORIGINAL_BACKUP_NAME --force
~~~

The application observes the original returned restore ID and checks that the native result names the reviewed backup. A backup from another environment in the same Skpr project is supported through source_environment. The retained source manifest must identify that exact cluster, project, source environment and backup.

Deployment uses:

~~~text
skpr deploy ENVIRONMENT EXISTING_RELEASE_VERSION
~~~

The original CLI loads the site's .skpr configuration and performs its native validation. Its warnings and violations remain in the original output. The adapter uses the normal released deployment command.

Skpr's deployment command returns a streamed update rather than a separate job ID. The adapter retains the original command process and stream and observes the environment's Deployed phase, selected release version and image identity. If a stream is interrupted during a same-version deployment, the original native command history remains the continuation context.

After a target change completes, GovHub accepts the actual restored source observation through the existing six-column inventory comparison. The same original operation retains its source, recovery backup, native output and observed final result.

## Resume the same operation

The existing worker reopens the retained operation and command journals. Successful commands reuse their original verified output; provider writes retain their original native request identity. A failed read can run a new read attempt with its previous output preserved.

When a provider response was lost after a command started, **Original Skpr request** accepts the actual backup or restore ID from that original native work. The adapter checks the original target, request purpose and pre-request catalogue. A supplied ID that already existed before that command cannot replace the operation's request.

When moving to a different operating host, **Receiving machine** supplies only these local bindings:

~~~json
{
  "runtime_bindings": {
    "skpr_path": "/absolute/existing/skpr",
    "git_path": "/absolute/existing/git",
    "env_path": "/absolute/existing/env",
    "site_root": "/absolute/received/original-project"
  }
}
~~~

These paths refer to the current receiving machine. The operation's cluster, project, environment, reviewed source, native ID and deployment intent stay attached to their original saved instruction.

The receiver can attach its prepared runtime to the original GovHub continuation JSON:

~~~sh
python3 skpr_receive.py --runtime-dir "$SKPR_RECEIVING_DIRECTORY" call \
  --workspace "$GOVHUB_WORKSPACE_DIRECTORY" \
  --source-root "$GOVHUB_SOURCE_INTAKE" \
  --username "$GOVHUB_STAFF_USERNAME" \
  --password-env GOVHUB_STAFF_PASSWORD \
  operations.resume --request "$GOVHUB_ORIGINAL_RESUME_REQUEST" --bind-runtime --work
~~~

The request keeps the actual operation_id, expected_revision, request_key and reason used by the original application. The same call path supports original capability, configuration and other existing GovHub JSON actions.

The work command runs the original durable queue. The status command follows a selected operation and retains its complete native result privately. The record command edits an existing original operating entity with its normal revision controls.

## Receive the original source project

The source receiver reconstructs the captured original repository from the verified Git bundle, restores the staged and unstaged changes, restores the complete untracked source archive, and restores every .skpr file with its original mode.

Select the exact project-source manifest and its SHA-256 from the captured operation. Point --artifacts at the received original operation directory, complete private workspace, or original exported source directory. The receiver resolves transferred artifacts inside that chosen intake using their exact byte counts and SHA-256 values.

~~~sh
python3 skpr_receive.py --runtime-dir "$SKPR_RECEIVING_DIRECTORY" restore-source \
  --manifest "$SKPR_PROJECT_SOURCE_MANIFEST" \
  --manifest-sha256 "$SKPR_PROJECT_SOURCE_SHA256" \
  --artifacts "$SKPR_RECEIVED_ORIGINAL_FILES" \
  --destination "$SKPR_RECEIVED_PROJECT_DIRECTORY"
~~~

The receiving destination is a new directory. Existing site source is kept available. The reconstruction takes place in its own private staging directory and checks the original Git commit, status, index patch, working patch, combined patch and configuration before installing the received project. Interrupted reconstruction retains its native setup output and staging path.

Prepare the receiver's Skpr runtime against this received source directory, then apply its four runtime bindings to the original saved operations that need to continue there.

## Deliver and independently reopen the application

The existing build_application.py source lock includes the complete GovHub application and all Skpr files. Build from the actual retained source commit:

~~~sh
python3 build_application.py lock \
  --repository "$GOVHUB_GIT_REPOSITORY" \
  --revision "$GOVHUB_SOURCE_COMMIT" \
  --output "$GOVHUB_APPLICATION_SOURCE_LOCK"

python3 build_application.py build \
  --source-root "$GOVHUB_COMPLETE_SOURCE_DIRECTORY" \
  --manifest "$GOVHUB_APPLICATION_SOURCE_LOCK" \
  --output "$GOVHUB_APPLICATION_ARCHIVE"

python3 build_application.py verify "$GOVHUB_APPLICATION_ARCHIVE" \
  --expected-sha256 "$GOVHUB_APPLICATION_SHA256"
~~~

Create the complete original handover in the application, including its retained source files. Then receive the full editable application, the selected handover and a coherent private workspace backup:

~~~sh
python3 skpr_receive.py --runtime-dir "$SKPR_RECEIVING_DIRECTORY" handover \
  --workspace "$GOVHUB_WORKSPACE_DIRECTORY" \
  --source-root "$GOVHUB_SOURCE_INTAKE" \
  --username "$GOVHUB_STAFF_USERNAME" \
  --password-env GOVHUB_STAFF_PASSWORD \
  --export-id "$GOVHUB_ORIGINAL_EXPORT_ID" \
  --destination "$GOVHUB_HANDOVER_DIRECTORY" \
  --backup "$GOVHUB_RECEIVED_WORKSPACE" \
  --application-zip "$GOVHUB_APPLICATION_ARCHIVE" \
  --application-sha256 "$GOVHUB_APPLICATION_SHA256"
~~~

The original workspace backup uses the existing native storage lease and copies the database, immutable source files and native-operation journals coherently. Complete application files are verified against their source lock before extraction.

The receiver then starts a **separate Python process from the delivered application directory**, loads that delivered application's bundled assessment core, authenticates the existing staff account, opens the copied workspace and compares its workspace identity and complete saved operation population with the original.

The result identifies the delivered source application, copied workspace, original source intake, selected export and actual cold-reopen command. Continue operating from that delivered application using serve, inspect, call, work or status.

## Original references

The exact released source governs the command contracts:

- [CLI v1.9.4 source](https://github.com/skpr/cli/tree/0014e431f5892591fb04600a2e2ca706d70a3897)
- [Native environment JSON](https://github.com/skpr/cli/blob/0014e431f5892591fb04600a2e2ca706d70a3897/internal/command/info/command.go)
- [Native release list](https://github.com/skpr/cli/blob/0014e431f5892591fb04600a2e2ca706d70a3897/cmd/skpr/release/list/command.go)
- [Native SSH execution](https://github.com/skpr/cli/blob/0014e431f5892591fb04600a2e2ca706d70a3897/internal/client/ssh/exec.go)
- [Skpr environment information](https://docs.skpr.io/cli/environment/info/)
- [MySQL backup parent relationship](https://docs.skpr.io/cli/mysql/mysql-backup-list/)
- [Volume backup parent relationship](https://docs.skpr.io/cli/volume/volume-backup-list/)
- [Skpr restore and mounted restic repository](https://docs.skpr.io/cli/restore/list/)
- [Restic original restore and dump commands](https://restic.readthedocs.io/en/stable/050_restore.html)

The full operating project is intended to be received with its source, original native outputs, source and backup files, editable application and saved workspace.
