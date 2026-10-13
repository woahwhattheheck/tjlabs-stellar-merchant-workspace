# Receive and operate the native Pantheon application

This guide installs the complete GovHub source on the host that owns the selected Pantheon session, verifies the native PHP bridge, opens the existing editable workspace, and carries the selected source, provider operation and handover through the same application.

The receiving entrypoint is `pantheon_receive.py`. It uses Python 3.11 or later and the standard library. Application actions go through the original staff authentication, `GovHubWorkspace.dispatch`, operating-record revisions, durable worker and `native_adapter.Session`. `cli.py` and `server.py` remain usable directly.

## Complete source and native dependencies

Receive the whole project described by the adjacent `APPLICATION_SOURCE.json`, including the unchanged `cutover.py`, assessment core, all current CONTENT/VISITOR source, native providers, web application and `pantheon_bridge`. The application packager is `build_application.py`; the adjacent project `START_HERE.md` describes its source lock, build and archive verification commands. A full package can carry the original Terminus release under `native/terminus.phar`.

| Dependency | Original identity |
| --- | --- |
| Terminus | Released version 4.3.3 |
| Source commit | `4cd1810ad892157131cec5919baf3036ab457d57` |
| Release PHAR | 12,336,985 bytes |
| PHAR SHA-256 | `e7ca9bcad3acbb1cfc0cec32550eeb2351e578dc6d5f79cd3a5303201893bade` |
| PHP | Existing PHP 8.2 or later, including `json`, `hash` and `Phar` |
| Composer | Existing `composer` executable on the native host's PATH for local plugin installation |
| Plugin | Received `commons/terminus-govhub-bridge` source and `pantheon_bridge/PHP_BRIDGE.md` |
| Workspace | Original private database, reconciliation key, source objects and native operation journals |
| Account | The host's existing Terminus session and selected authorized site/environment |

Original release: <https://github.com/pantheon-systems/terminus/releases/tag/4.3.3>. Direct native PHAR: <https://github.com/pantheon-systems/terminus/releases/download/4.3.3/terminus.phar>.

The receiver chooses an explicitly supplied PHAR first, then a bundled `native/terminus.phar`, then a previously received exact release in its private runtime directory. If none is present, it downloads the original HTTPS release and checks its complete length and SHA-256 before invoking PHP. A release mismatch keeps the original response available in the receiving directory for the operating engineer.

Keep four paths distinct: the complete application source, the private editable workspace, the actual original-input directory, and a dedicated native receiving/runtime directory. Keep the existing OS user and `TERMINUS_BASE_DIR`/authentication context when preparing this original host. The receiver keeps that account context and uses the host's existing Composer. It selects native plugin, dependency and command-cache directories inside its own receiving runtime.

## 1. Prepare the existing native host

Set these path variables to the receiving operator's actual absolute paths. The examples below use variable references so the same commands work in a cloud receiving directory or an installed private service.

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" \
  prepare --php php --site-root "$GOVHUB_NATIVE_CWD"
~~~

To use an already received original release, add `--terminus-phar /absolute/path/terminus.phar`. To use a nondefault existing interpreter, set `--php /absolute/path/php`. Native executable symlinks are resolved to the actual interpreter. The receiver records the executable's full byte identity.

`prepare` performs the following native operation as one installation:

1. Inspect actual PHP version and extensions.
2. Verify the complete original release bytes and create the native launcher for this exact received source; run native `--version` through it.
3. Run PHP lint on the received bridge's PHP sources.
4. Call the unauthenticated `govhub:bridge-info` command.
5. If the matching bridge is absent from this installation, invoke native `self:plugin:install` with its retained bridge source directory and read the installed bridge again.
6. Compare every installed PHP source path, length and SHA-256 with the received source; load native bridge help.

A successful result returns `state: READY`, the exact private `runtime.json` artifact, installed version, installation ID and three native profile path values. `profile_runtime.terminus_path` selects the generated `terminus.php` launcher; pair it with `profile_runtime.php_path`. The unchanged release PHAR has its own `terminus` identity in the runtime record. Setup command records retain their original argv, working directory, complete stdout/stderr and process result. The runtime also records the three native directory bindings.

The runtime record is host-specific. Run `prepare` on a receiving host to inspect its installed tools and preserve its own runtime record. The received business target stays the original site UUID and environment.

### Updated source and moved applications

The native Terminus installer treats an existing package name as already installed. Repeating installation against a new application path therefore does not replace an older source binding. The receiver handles that case by selecting a native installation identified by the PHP/release identity and complete bridge runtime source. It retains ordinary copies of the bridge PHP files, Composer manifest and license inside that installation, then creates an immutable launcher there.

The launcher sets the native `TERMINUS_PLUGINS_DIR`, `TERMINUS_DEPENDENCIES_BASE_DIR` and `TERMINUS_COMMAND_CACHE_DIR` for the selected installation before starting the original PHAR with the exact PHP executable supplied to `prepare`. That executable can be the host's existing wrapper for PHP extension and configuration options. The launcher verifies both its bytes and the PHAR before dispatch, and invokes the selected executable again so the child retains those options. Native account/session locations come from the host's existing configuration. Identical source and launcher version reuse the same installation; changed source or launcher version receives a new installation. Moving an identical application can reuse the retained source even when the earlier application directory has gone away.

Launcher version 2 preserves the selected PHP entry point instead of restarting the raw `PHP_BINARY` path without its command options. Run `prepare` once to receive this launcher for an older installation. Its version is part of the immutable installation identity, so preparing the corrected launcher leaves the previous installation and its native command history intact. Preparation does not replay any saved provider operation.

Every later receiving command checks the launcher and retained plugin files against the received application. Native provider work reaches the same launcher through the existing three-path profile or `operations.resume --bind-runtime`. Its original arguments, working directory, standard streams and exit result pass through to Terminus; it remains in the original Session process group for timeout recovery. The native bridge still returns the original workflow receipt and UUID.

Use the returned `profile_runtime` values when configuring or resuming an operation. The receiver's `discover` command already selects this installation. For a direct read, invoke the prepared PHP and `terminus.php` paths together, for example `"$GOVHUB_PHP" "$GOVHUB_TERMINUS" govhub:bridge-info`.

### Bridge information ABI

The installed command returns `schema: govhub-pantheon-bridge-info/v1`, `terminus_version: 4.3.3`, `request_schema: govhub-pantheon-bridge/v1`, and `source_files`, a complete array of `{path, bytes, sha256}` for every received PHP file. Paths are relative to the plugin directory. The receiver compares the whole PHP source population and each original byte identity. The plugin also returns its version, root, supported actions and native source guard information.

The native bridge's private mutation receipts, dispatch/workflow sidecars and original workflow recovery are defined in `pantheon_bridge/PHP_BRIDGE.md`. Provider operations invoke that bridge through the maintained Pantheon adapter.

## 2. Read the actual native account and sites

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" discover
~~~

This calls the released `auth:whoami --format=json`. When the existing session returns its user ID, it calls the released `site:list --format=json` with original ID, name, label, framework and region fields. It retains the complete native result privately and prints the account ID, result count and original observation-file identity.

Use the selected site's native UUID and a permitted environment from its original inventory. This read establishes the account and target population for the current session. The exact operating authorization and selected destination belong in the existing application's environment record.

The released command source is available at:

- [Native current-account command](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands/Auth/WhoamiCommand.php)
- [Native complete permitted-site command](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands/Site/ListCommand.php)

## 3. Open the complete editable workspace

Use the existing named staff account. `GOVHUB_PASSWORD` below is the name of an already available private environment variable on this host.

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" inspect \
  --workspace "$GOVHUB_STATE" \
  --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD
~~~

The command authenticates through the original application and opens its complete source/store. It retains the actual snapshot and returns the original workspace identity, actor, counts, worker state, and operation summaries. The source's bundled assessment core is the default; use `--assessment-core` only when that same unchanged source has been installed separately.

An original received backup is already an editable workspace. Select its absolute directory as `--workspace` and a separate existing intake directory as `--source-root`. The backup's `sources` directory is its private immutable blob store; the application opens those retained files through the original file records and backup metadata. It must not be used as the intake root. The intake and private workspace must be separate directories, with neither containing the other.

For a new explicitly selected workspace, initialize it through the existing `cli.py init` command described in `README.md`. The receiving command opens the original workspace supplied to it.

## 4. Configure the actual target through the original form or API

The **Environments** register retains the application's environment record ID, actual canonical URL, purpose, owner and authorization. Its Pantheon provider resource ID is `SITE_UUID.environment`. The native profile uses that exact combined resource in `config.environment_id`.

Open **Native tools** and select the existing Pantheon provider. Copy `php_path`, `terminus_path` and `site_root` from the successful runtime result into the selected host's native profile. The application retains the target and profile revisions.

The receiver accepts ordinary existing application requests:

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" call \
  --workspace "$GOVHUB_STATE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD \
  operations.configure --request "$GOVHUB_REQUESTS/profile.json"
~~~

`profile.json` is the original `operations.configure` payload: `{environment_id, expected_revision, config}`. Use the actual current record revision and full schema-supported profile. The receiver confirms that the two executable paths name the prepared PHP/Terminus installation.

For operating records, use the same `data`, `expected_revision`, `note` and `archived` payload used by the browser:

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" record \
  --workspace "$GOVHUB_STATE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD \
  environments "$GOVHUB_ENVIRONMENT_RECORD" \
  --request "$GOVHUB_REQUESTS/environment.json"
~~~

A newly selected record uses its chosen original application ID and a null prior revision; an edit uses that same record's returned current revision. Referenced site, agency and owner records must already exist as required by the application's schema.

Run `operations.capabilities` with the selected environment record ID to read native inventory. Its complete response includes the actual profile/schema, native target fingerprint, selected backup names, allowed actions, environment population and reviewed promotion-source code-log SHA-256. The receiver passes the current schema and revision controls through unchanged.

## 5. Operate the complete native journey

`call ACTION --request FILE` sends the complete original JSON payload directly to the existing application. Each result is saved in the private receiving directory with the original request bytes' identity and decoded payload. The application's request key and actor remain the authority for an idempotent operation retry.

Use the current browser form or a request produced from its actual observed records. The operation queue retains the current target/profile revisions, selected cohort, source snapshot, authorization and explicit native action.

| Journey | Existing action and native choice | Original source used |
| --- | --- | --- |
| Source inventory | `sources.capture` / `pantheon-capture` | Actual selected site's environment, code and backup catalog |
| Complete new backup | `operations.create`, type `BACKUP_CREATE`, `pantheon-backup-create` | One original native backup workflow and its exact new code/database/files names |
| Selected backup download | `operations.create`, type `BACKUP_DOWNLOAD`, `pantheon-backup-download` | Explicit filenames selected from the native catalog |
| Rehearsal | `operations.create`, type `REHEARSAL`, selected native action | Original baseline and designated rehearsal target |
| Code promotion | `pantheon-deploy` | Reviewed Dev code for Test, reviewed Test code for Live |
| Full content copy | `pantheon-sync-content` | Same-site explicit source; original files and database steps |
| Component copy | `pantheon-sync-files` or `pantheon-sync-database` | That selected native component only |
| Exact restore | `pantheon-restore` | Original component filenames and matching retained archive bytes |
| Cutover | `operations.create`, type `CUTOVER`, selected native action | Current candidate, comparison and original review |
| Rollback | `operations.create`, type `ROLLBACK`, selected native action | Original baseline and selected exact recovery material |

The complete provider behavior and native source fields are in `PANTHEON.md`. Backup catalog size is native rounded display text; exact archive lengths and SHA-256 values come from the downloaded bytes. Retain all three components. Target-changing operations create and retain their own complete pre-change backup.

Run the selected original request and let the existing queue follow accepted workflows:

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" call \
  --workspace "$GOVHUB_STATE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD \
  operations.create --request "$GOVHUB_REQUESTS/selected-operation.json" --work
~~~

The existing `cli.run_worker` acquires the application's single service lease. It operates the original queue and keeps a pollable accepted workflow in that queue until its native result settles. If the original browser service already owns the queue, send the request through that service or run `call` without `--work` and use `status` to observe the existing worker.

To continue a queue whose original service has stopped:

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" work \
  --workspace "$GOVHUB_STATE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD
~~~

This uses the application's service lease, native checkpoints and command ownership. Native work stays in the original operation directory.

## 6. Continue an original workflow or selected backup set

Read the existing operation by its returned application ID:

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" status \
  --workspace "$GOVHUB_STATE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD \
  "$GOVHUB_OPERATION_ID" --wait-seconds 300
~~~

`status` is an observation command. It follows the existing worker's operation, emits changes in the retained operation revision, and saves the complete final operation/events/files response. A returned `active: true` means the selected operation is still queued, running or following its actual accepted native workflow.

When the existing operation requests an explicit association after a lost native response, send its original continuation through `operations.resume`. The full payload uses:

- Existing `operation_id` and current `expected_revision`.
- A distinct request key for this actual continuation and the operating reason.
- `native_workflow_id` plus `native_workflow_step` for the current pending step.
- Or `native_backup_files` containing exact `code`, `database` and `files` names, plus `native_backup_step`, for the pending original backup set.

A successful native bridge dispatch first retains its real workflow UUID in a sidecar, then its original receipt. The provider consumes that original result after process-output loss and inspects the same workflow. Manual UUID selection is for an unresolved original association; the provider validates the step, target, immutable UUID and pre-command workflow population.

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" call \
  --workspace "$GOVHUB_STATE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD \
  operations.resume --request "$GOVHUB_REQUESTS/original-continuation.json" --work
~~~

A completed native cohort action advances to its actual observation step. Retain the native execution capture and real `RESTORED` six-column inventory, accept it through the existing intake, then call `operations.observe` with the original operation/revision and returned source IDs. The existing comparator retains the final differences and state.

Current operating references should always come from the returned source and application records. Restoring a component, promoting code, or copying content remains an actual selected provider action with its original source and target.

## 7. Open the same browser application

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" serve \
  --workspace "$GOVHUB_STATE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD \
  --port 8792
~~~

The receiver authenticates the existing operator, validates the installed bridge, then replaces itself with the original `server.py`. Open the actual local URL printed by that server and sign in with the existing named account. Its original host/origin checks, opaque session, industrial interface and single service lease remain in effect.

The complete staff journey includes original-source intake, comparison/cohort review, action selection, native continuation, restored observation, and the mixed-domain handover. Existing CONTENT and VISITOR work remains accessible in the same application.

## 8. Deliver, back up and cold-reopen

Create the complete handover through `exports.create` or the **Complete handover** form. Select the actual plans and any completed content/visitor records; include original sources. The existing export captures its original source versions, operating requests, selected native files, observations, reviews and complete output population.

Select its returned export ID and two new absolute destinations:

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" handover \
  --workspace "$GOVHUB_STATE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD \
  --export-id "$GOVHUB_EXPORT_ID" \
  --destination "$GOVHUB_DELIVERY" --backup "$GOVHUB_RECEIVED_STATE"
~~~

The receiver uses the existing `cli.export_files` to copy and rehash every original handover file. It invokes the application's coherent native-storage backup, then starts a fresh Python process to authenticate and open the copied workspace. It compares the original workspace identity and complete retained operation population before returning `state: RECEIVED`. The cold reopen keeps the explicitly selected external `GOVHUB_INPUTS` directory. Before copying, the receiver rejects delivery or backup destinations that contain that intake or sit inside it. On another host, select that host's actual separate intake directory; the original private sources remain in the received workspace.

The application's backup lease keeps the copied native journals in the same database generation. Complete the original active native write before copying that generation. Existing `TRANSFER_INCOMPLETE` or `BACKUP_INCOMPLETE` markers identify an interrupted original transfer; retain their directories and inspect the original copy result before selecting a new delivery destination.

The complete editable backup carries the database, retained sources, staff credentials, reconciliation key, native command/result files and original relocation metadata. The full application source package accompanies it. Native account credentials remain with the designated receiving host; the original Terminus session and target are explicitly selected there.

A receiving host with different PHP/Terminus paths first runs `prepare`. The provider's `operations.resume` and read-only `operations.capabilities` accept `runtime_bindings: {php_path, terminus_path, site_root}` separately from the original profile and business intent. The receiver can add exactly the prepared values to the selected original request:

~~~bash
python3 "$GOVHUB_CODE/pantheon_receive.py" \
  --runtime-dir "$GOVHUB_RUNTIME" call \
  --workspace "$GOVHUB_RECEIVED_STATE" \
  --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_OPERATOR" --password-env GOVHUB_PASSWORD \
  operations.resume --request "$GOVHUB_REQUESTS/receiving-continuation.json" \
  --bind-runtime --work
~~~

The request keeps its original operation ID, expected revision, reason and continuation request key. Add its exact workflow/step or backup selection when the current operation requires it. `--bind-runtime` attaches the three prepared native paths and records both the original request and applied payload, together with the prepared runtime file's identity. It rejects a conflicting explicit binding. It also works with `operations.capabilities` for a receiving-host observation.

The selected site, environment, reviewed source, original intent, received workflow UUID and prior command records remain attached to the same operation. An ordinary new operation uses the current configured runtime profile. Inspect the same operation after reopening before resuming it.

## Receiving completion

The useful receiving result consists of the exact source/package identity, actual native CLI/plugin identity, original workspace/actor, selected account/site/environment, completed or retained provider operation, native backup/file identities, restored observation, browser URL and complete exported/received workspace. Each item comes from the original corresponding operation.

Setup and intake result files remain private under `GOVHUB_RUNTIME`. Provider command records and outputs remain in the original GovHub workspace, so its native artifact retention and complete handover carry them to the next operating engineer.

## Continue an interrupted receiving handover

The original `handover` command records one exact receiving intent under
`<runtime-dir>/handovers/<intent-sha256>/state.json`. The intent binds the
original workspace, staff actor, retained export ID and file hashes, separate
intake directory, export destination and private backup destination. A native
receiving lease serializes the copy and cold-reopen phases on that runtime.

If a command returns an error or its caller is lost, retain its original
command record and use the **same** command and paths with `--resume`:

~~~sh
python3 -B /absolute/application/workspace/pantheon_receive.py \
  --runtime-dir /absolute/private-runtime \
  handover \
  --workspace /absolute/accepted-workspace \
  --source-root /absolute/external-intake \
  --username original-admin \
  --password-env ORIGINAL_PRIVATE_PASSWORD_ENV \
  --export-id original-retained-export-id \
  --destination /absolute/customer-handover \
  --backup /absolute/customer-workspace \
  --resume
~~~

Resume first verifies the existing original export and private backup. A
complete export must have the exact retained member collection, lengths and
SHA-256 values. A complete backup must retain its original workspace identity,
a readable consistent SQLite database, all referenced immutable source blobs,
the original reconciliation identity and every declared native-history file.
The original operation population must still match the first receiving intent.

A verified complete phase is adopted without another export or backup call.
An incomplete phase remains intact at an adjacent
`<destination>.interrupted-<id>` path; the journal records its original and
retained locations, exact file hashes and modes before the same-filesystem
rename. The original create-only export or backup API can then finish a new
copy at the same selected destination. No old incomplete marker, command
record or native provider result is discarded. If a completed phase's files
later differ, the receiver stops for reconciliation instead of replacing them.

The existing cold-reopen command then authenticates and opens the copied
workspace without starting its provider worker. A successful retained
cold-reopen output is verified and reused after caller loss. Earlier failed or
interrupted read records remain beside the necessary new local reopen. The
receiver checks the original workspace identity and native operation
population before committing `RECEIVED`. Reopening a completed receiving
intent preserves its first completion time and returns its retained result.
