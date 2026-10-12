# Linux deployment and administration

This workflow installs a complete selected publisher release, binds it to one existing customer workspace, and provides a managed service and recoverable updates. The customer archive installer and Python client remain the receiving and training interface described in [OPERATING.md](OPERATING.md). These administration commands reuse the same native workspace, export and receive implementation.

The application stays on loopback. An administrator explicitly installs and starts the generated systemd unit. The normal service receives no data.gouv API key; authenticated portal operations use the stopped-service CLI with an explicitly selected environment variable. No command below publishes a dataset without the original application's saved review and explicit publish request.

## Requirements and the selected release

Use Linux with `renameat2`/`RENAME_NOREPLACE`, Python 3.10 or newer, util-linux `flock`, and an independently installed Node 24 or newer with `node:sqlite`. The administrator selects an absolute Node executable. Its actual version and SHA-256 are retained; replacing that binary in place stops future managed starts until a corresponding runtime update is selected.

Use ordinary persistent storage for the installation, workspace, backup and operation journal. Paths must be absolute, normalized and free of symlinks. System-unit paths also exclude spaces, home directories and control characters. Do not put an installation journal in a disposable container filesystem.

The complete received application's `products/datagouv/application-files.json` is the source selection. Packaging reads exactly that inventory, verifies every original file, and creates a deterministic gzip/tar release. No dependency installation, remote code download, Git credential, saved workspace or unlisted checkout file is added.

From the actual received source directory:

~~~sh
python3 products/datagouv/admin/publisher_admin.py pack \
  --source /opt/datagouv-source \
  --source-ref ACTUAL_REVIEWED_COMMIT_OR_DELIVERY_ID \
  --output /var/tmp/datagouv-release.tar.gz
~~~

Retain the returned `release_id`, `sha256`, `bytes`, `files` and `source_ref` with the reviewed delivery. Transfer the selected archive and its independent SHA-256 to the deployment administrator. The installer hashes the same open archive descriptor that it subsequently reads, rejects duplicate or undeclared members, and verifies the native inventory against the release manifest before staging source.

Limits are 512 application files, 32 MiB per source file, 256 MiB total application source and 768 MiB encoded backup/archive input. The native workspace archive also enforces its own 512 MiB decoded limit. Stage space for the complete new release, original backup and receiving workspace before an update; a full disk leaves the active pointer unchanged.

## Accounts, directories and first installation

Choose a dedicated unprivileged account for the system service. The following paths and account are examples to select for the customer's host; the administrator must use the actual installed Node path.

~~~sh
sudo useradd --system --user-group --home-dir /var/lib/datagouv-publisher \
  --shell /usr/sbin/nologin datagouv
sudo install -d -o datagouv -g datagouv -m 0700 /var/lib/datagouv-publisher
~~~

If the account already exists, use it; do not create a second identity. The received source and the administrator's release input remain administrator-controlled.

Check the account and selected runtime before creating an installation:

~~~sh
sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py preflight \
  --node /opt/node-v24/bin/node \
  --user datagouv \
  --port 8429
~~~

This command verifies that the account's UID and primary GID are mapped by the current Linux kernel namespace, then runs the native Node/SQLite capability check as that account. It creates no installation, workspace or service. A successful result retains the selected runtime identity. An unmapped account returns `SERVICE_ACCOUNT_UNMAPPED` before initialization; a passwd entry alone does not establish usable ownership. Some restricted containers map only UID/GID 0. Continue the same selected deployment on an existing Linux host with the unprivileged account mapped; running the service as root does not complete this requirement. The install command performs the same account check before creating its managed directory.


To bind the customer's already received workspace:

~~~sh
sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py install \
  --root /srv/datagouv-publisher \
  --operation-id publisher-install-001 \
  --release /var/tmp/datagouv-release.tar.gz \
  --sha256 ACTUAL_RELEASE_SHA256 \
  --node /opt/node-v24/bin/node \
  --user datagouv \
  --port 8429 \
  --workspace /var/lib/datagouv-publisher/customer/workspace
~~~

That workspace must be an ordinary mode-0700 directory owned by the selected account, with no live owner. Obtain it through the existing customer archive receiving command and preserve its original workspace ID. This command does not copy over or initialize an existing workspace.

For an explicitly new, empty publisher, use the same command with a new workspace path and these additional arguments:

~~~sh
  --initialize --title "Publisher operations"
~~~

The selected parent must already be mode 0700 and owned by the service account. Native initialization runs in a recorded private sibling staging attempt. The controller seals its actual workspace ID, complete stored-byte fingerprint and directory identity before publishing it to the exact selected path with Linux renameat2 and RENAME_NOREPLACE. A pre-existing target is accepted only when it matches that original sealed move. Interrupted, unconfirmed attempts remain in their original staging directories; the same installation operation can make another recorded local initialization attempt without overwriting the selected target or an earlier partial. A conflicting target or a missing previously completed stage requires an explicit original-operation decision.

The installer verifies native `node:sqlite`, calls the original `init` only when selected, then opens the original workspace under its kernel lock. Source and workspace activation are recorded as one installation revision. A successful first installation reports revision 0 and the actual workspace ID.

### Directory map

| Path beneath the managed root | Owner and purpose |
| --- | --- |
| `control/owner.json` | Administrator, 0644. Installation ownership and exact root. |
| `control/admin.lock` | Administrator, 0644. Shared service ownership or exclusive administration. |
| `control/state.json` | Administrator, 0644. Atomic current revision, source release, real workspace path and runtime pins; no credentials. |
| `control/operations/ID/operation.json` | Administrator, private. Immutable input selection, original stages, activation and result. |
| `releases/RELEASE_ID/application/` | Administrator-controlled 0755 directories and 0444 selected source files. |
| `releases/RELEASE_ID/release.json` | Exact complete release manifest. |
| `staging/release-ID/` | Retained source staging for an interrupted original operation. |
| `instances/ID-attempt-N/received/workspace/` | Service account, private. Native receiving workspace selected only after readback. |
| `instances/ID-attempt-N/received/application/` | Complete source carried by that original native archive; retained for recovery. |
| `backups/ID/publisher-workspace.datawork` | Service account, private. Full native workspace and selected application archive. |
| `backups/ID/backup.json` | Administrator's exact backup receipt, also bound in its private operation journal. |
| `bin/launcher.py`, `bin/workspace-bridge.mjs` | Administrator-controlled, pinned controller source. |

Older releases, original workspaces, completed backups and interrupted receiving directories remain present. This version provides no automatic pruning command.

## Install and operate the service

The source launcher reads the current atomic state on each start, verifies the complete installed source and Node identity, holds the shared administration lock, and runs the original loopback server as the selected account. It never resolves the workspace through a symlink.

Render the unit, inspect it, then install and start it explicitly:

~~~sh
sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py unit \
  --root /srv/datagouv-publisher \
  --name datagouv-publisher \
  --output /var/tmp/datagouv-publisher.service

sudo systemd-analyze verify /var/tmp/datagouv-publisher.service
sudo install -o root -g root -m 0644 /var/tmp/datagouv-publisher.service \
  /etc/systemd/system/datagouv-publisher.service
sudo systemctl daemon-reload
sudo systemctl enable --now datagouv-publisher.service
sudo systemctl status datagouv-publisher.service
sudo journalctl -u datagouv-publisher.service -n 100 --no-pager
~~~

Use the customer's existing authenticated access arrangement, such as an SSH tunnel to `127.0.0.1:8429` or an explicitly configured authenticated reverse proxy. The unit does not expose a public port or install a proxy. The original local HTTP API is an operator interface and must not be exposed as an unauthenticated Internet service.

The generated unit uses a dedicated UID/GID, umask 0077, a read-only system view with selected writable workspace locations, private temporary/device namespaces, no capabilities and no new privileges. It limits restart attempts and gives the original application up to 360 seconds to close. These controls follow the actual [systemd execution](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html) and [service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html) interfaces; `systemd-analyze verify` checks the installed host's supported directives.

A running managed service prevents an update, backup or command from taking the exclusive administration lock. A direct customer CLI that already has the native workspace open is also detected by that original workspace lock. Stop the service before any administration operation requiring the workspace:

~~~sh
sudo systemctl stop datagouv-publisher.service
sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py status \
  --root /srv/datagouv-publisher --workspace
~~~

Ordinary `status` without `--workspace` verifies source and reports the retained installation state without opening the database. It does not report that a daemon is running; use `systemctl status` for actual service state.

## Native operational commands and credentials

With the service stopped, `run` delegates to the original CLI while forcing the installed application's real workspace directory. Original request files retain their UUIDs and provider operation IDs. Administration does not generate another business request or retry a publisher mutation.

~~~sh
sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py run \
  --root /srv/datagouv-publisher -- status

sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py run \
  --root /srv/datagouv-publisher -- query --query "limit=250"

sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py run \
  --root /srv/datagouv-publisher -- review --input /var/lib/datagouv-publisher/requests/review.json
~~~

Native inputs and desired download destinations must be readable/writable by the selected service account. Use the complete [API.md](API.md) and portal publication guide for actual request schemas. `capture`, `init`, `serve`, `export` and `receive` are deliberately selected through the customer capture, first installation, service and backup/receiving workflows rather than the general `run` wrapper.

For authorized portal work, populate the selected variable from the customer's existing credential mechanism. The following prompts without echo and passes only that variable through sudo:

~~~sh
read -r -s -p "data.gouv API key: " DATAGOUV_API_KEY
export DATAGOUV_API_KEY
sudo --preserve-env=DATAGOUV_API_KEY \
  python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py run \
  --root /srv/datagouv-publisher --provider-env DATAGOUV_API_KEY \
  -- portal-inspect --input /var/lib/datagouv-publisher/requests/portal-inspect.json
unset DATAGOUV_API_KEY
~~~

Use the same pattern for the saved draft, review, explicit publish and reconcile requests. `portal-inspect` above is a read example, not a publication. The sudo policy must permit the selected environment variable. The child environment otherwise contains only its runtime PATH, locale and Python bytecode setting. Provider credentials are absent from the unit, state, release manifest, backup metadata and administration journal. The native provider implementation also excludes credentials from its operation records.

The ordinary system service receives no provider token, even if the administrator's shell contains one. The web UI retains local publication, query, review and archive operations; authenticated data.gouv activity is performed through the explicit stopped-service command.

## Complete native backup

Read the current installation revision first. Then choose one original backup operation ID:

~~~sh
sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py backup \
  --root /srv/datagouv-publisher \
  --operation-id publisher-backup-001 \
  --expected-revision 0
~~~

The command holds both the administration lock and the original native workspace lock. It asks the native implementation for its full portable archive, verifies every source/workspace member, rejects SQLite sidecars, and seals the actual archive SHA, byte length, workspace ID, current selection and stored-workspace fingerprint. The selected source and original Node runtime pins are included in the receipt.

Backups are local preservation until the customer saves the exact archive and its receipt in their approved durable storage. A full disaster recovery also needs the managed operation records, release manifest/source and the pinned runtime. Preserve these as one closed installation backup after stopping the service. Do not copy a running SQLite main file by itself.

Replaying the same completed backup ID returns its retained result. It does not claim that later business work was included; use a new explicit backup ID for a newer point in time.

## Verified compatible update

Package the complete reviewed successor from its actual cumulative application inventory. Stop the service and inspect the current revision. For example:

~~~sh
sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py update \
  --root /srv/datagouv-publisher \
  --operation-id publisher-update-002 \
  --expected-revision 0 \
  --release /var/tmp/datagouv-successor.tar.gz \
  --sha256 ACTUAL_SUCCESSOR_SHA256
~~~

The same command may select a separately installed runtime using `--node /opt/node-v24-next/bin/node`. Both the old runtime and new runtime should remain installed while a backup may require either.

The operation performs these concrete steps:

1. Open and hold the original workspace, retain its exact pre-update state and make a complete backup.
2. Verify and stage every selected successor source file without overwriting the active release.
3. Invoke the successor's original native `receive` into a new private instance.
4. Reopen it with the successor and compare the original workspace ID, selected publication and complete stored-workspace byte fingerprint.
5. Journal the intended activation, atomically replace the current source/workspace/runtime pointer, read it back and retain the result.

The stored-workspace fingerprint excludes generated archive timestamps and includes every stored workspace member. A code release that changes persisted bytes on reopen is stopped with `SCHEMA_MIGRATION_REQUIRED` before activation. This workflow supports compatible source/runtime updates; it does not silently infer or execute a database migration.

After success, inspect the returned current revision and source identity, then restart the existing service. It selects the new real workspace on its next launch. If the Node path or administrator runtime layout moved, re-render and verify the unit to a new file before explicitly replacing the installed unit.

## Restore or roll back the same workspace

Restore selects an exact recorded backup operation, not an arbitrary filename. The backup receipt must match its original private administration record, actual archive bytes and original workspace ID.

~~~sh
sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py restore \
  --root /srv/datagouv-publisher \
  --operation-id publisher-restore-003 \
  --expected-revision 1 \
  --backup-operation publisher-backup-001
~~~

`rollback` has the same inputs and preservation behavior:

~~~sh
sudo python3 /opt/datagouv-source/products/datagouv/admin/publisher_admin.py rollback \
  --root /srv/datagouv-publisher \
  --operation-id publisher-rollback-004 \
  --expected-revision 2 \
  --backup-operation publisher-update-002
~~~

An update's own backup represents the state immediately before that update. Both restore and rollback first preserve the current workspace, then receive the selected older backup into another fresh instance. They restore its recorded source release and runtime together with its business state. A new installation revision records the selection. Original and superseded data are retained.

The original selected runtime must still match its stored SHA. Source cannot be rolled back independently of a later database schema. For a different customer/workspace or a completely lost installation, use the existing customer archive receiving workflow, verify its complete source/selection, then bind that received workspace in a new explicit managed installation.

## Recovery after interruption

Every mutating administration command requires its own stable operation ID and exact original inputs. Use `status --operation-id ID` to read the retained history and results, then repeat the same command to continue it.

| Observed point | Recovery behavior |
| --- | --- |
| Source staging incomplete | Reuse matching staged files; preserve any differing file and stop. |
| Native initialization incomplete | Preserve the recorded private sibling attempt. A new recorded attempt stays within the same installation operation and does not occupy the target until sealed. |
| Initialized directory moved, result missing | Reconcile the target's original device/inode, native workspace ID and stored-byte fingerprint against the sealed move before activation. |
| Native backup request issued | Read the existing complete output and compare it to the still-locked original baseline. Do not replace it. |
| Native receive incomplete | The administration lock cannot be reacquired while an inherited original child still runs. Once ended, retain the partial directory and record another receiving attempt under the same operation. |
| Receive returned, result not journaled | Verify its original `receiving.json`, archive SHA, workspace ID and selection, then reopen and compare all stored bytes. |
| Activation journal saved, pointer not moved | Reconfirm the original installation preimage and activate the same recorded selection. |
| Pointer moved, final result missing | Match the pointer to that operation's exact retained activation, verify source and cold workspace identity, then finish its original receipt. |
| Completed operation repeated | Return the retained completed result; do not execute a new provider or business operation. |
| Current revision or original input differs | Stop with the actual conflict. Inspect it and select a new explicit operation only for a new intended change. |

A signal or transport loss is not permission to remove the operation journal, kill another owner, overwrite a backup or select a new business request. The controller holds its exclusive lock across native child processes. A lost parent cannot admit another administrator while its original child still owns that lock. Only children created by the current administration invocation are closed during its own cleanup.

Mutable journal/state files use fsynced create-and-replace writes. Immutable archives, receipts and source are create-only. A filesystem error before pointer replacement leaves the previous installation selected. If an error occurs after replacement, the stored activation identifies the exact selected successor for recovery.

## Operational receiving record

Record the actual pack, install, backup, compatible-update, restore/rollback and cold-reopen receipts with the customer's deployment. Include:

- Complete release identities and real source revisions.
- Initial and final installation revisions and the unchanged workspace ID.
- Original backup operation IDs, actual archive hashes and byte lengths.
- Preserved earlier source/workspace locations and retained partials, if any.
- Unit verification output from the actual target host and actual service start/stop status.
- Any unsupported directive, uncompleted service start or provider operation explicitly left pending.

A syntax check or generated unit alone is not a running-service result. The application-level full-data receiving and customer Python workflow retain their independent native results. This administration arm does not repeat their public capture, extraction or provider publication.
