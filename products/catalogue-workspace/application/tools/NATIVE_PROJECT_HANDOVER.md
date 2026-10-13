# Complete installed Symfony catalogue project handover

This programme transfers the existing installed Symfony/Sylius application. It keeps the original Composer lock and vendor closure, complete native SQL and native queue state, public/private files, catalogue records, complete source/media journals, and the source identifiers already used by the original importer. It does not implement another catalogue model or queue.

The source gateway's smaller catalogue project ZIP is a separate product capability. Use this native programme when the recipient needs the installed application, database, files and existing pending messages together.

## Actual native inputs

Run the original PHP executable or wrapper on the existing host. The source and target must both already exist, with their own valid host credentials and selected native database. No database engine, worker service, directory or credential is assumed. The target is an isolated, explicitly selected receiving site. Use a separate configuration and work directory for each site's operation.

Configuration schema: `tjl.catalogue.native-project-config.v1`.

Required fields:

| Field | Original input |
|---|---|
| site_key | Owner-selected stable identity for this actual installed site |
| project_root | Absolute ordinary directory containing Composer files, vendor and the actual console |
| php_executable | Absolute installed PHP executable or retained launcher wrapper |
| console | Actual project-relative console file |
| kernel_class / environment | Installed Symfony kernel class and original native environment |
| bootstrap | Optional actual project-relative bootstrap; otherwise installed Dotenv reads the native .env |
| connection | Optional actual Doctrine connection name |
| store_root | Actual shared private catalogue Store, also mapped in roots.private |
| roots.public / roots.private | Objects mapping stable logical names to existing absolute ordinary directories |
| queue_mode | database or external, selected from the actual Messenger transports |
| maintenance_authorized | true only under the existing owner's actual stop/drain/resume authority |
| host_private_paths | Complete project-relative paths/prefixes containing host-bound credentials or configuration |
| excluded_runtime_paths | Explicit reproducible runtime paths; default var/cache and var/log |
| commands | Exact original maintenance, database and optional external queue argv |
| max_bytes | Positive complete source/archive limit, default 1 TiB |

Logical root names must match source and target. Their physical paths can differ. Storage roots cannot overlap one another or contain the project. A storage root inside the project is omitted from the project projection and retained once under its declared public/private name. The complete Store must be its own named private root.

Every command is an argv array, executed directly without a shell. Native authentication comes from the installed host configuration or an existing private client option file/environment reference. Do not put passwords, tokens or source credentials in argv. Complete argv and output are retained privately as part of the real command receipt.

Supported exact placeholders inside argv and optional stdin:

- {project}: original installed project root.
- {work}: this operation's private control directory.
- {php}: selected original PHP executable.
- {console}: actual absolute installed console path.
- {database_sql}: original SQL output/input for a dump/import.
- {queue_directory}: complete original external-queue export/input directory.

Required commands:

- drain: activate the existing maintenance exclusion, stop ingress and scheduled writers, stop/drain all relevant original workers and operator mutations, and return only after the site's chosen consistent boundary is established.
- verify_drained: verify that the original exclusion remains active and all relevant native writers are stopped. Exit zero only for that actual state.
- resume: restore the originally selected worker/ingress state after verified completion.
- database_dump: native complete SQL dump. Set output to stdout or file. The latter must write {database_sql}.
- database_import: native import into the selected target. Use stdin: "{database_sql}" if the installed command consumes standard input, or bind that path in its original argv.

For queue_mode external, queue_export, queue_import and verify_reopen are also required. verify_reopen must verify the actual restored native broker/transport state and its original queue identities before workers resume. They must export/import the original broker's full selected queue state through its own authorized native tooling under the same stopped-worker boundary. queue_export writes complete ordinary files under {queue_directory}; queue_import consumes those exact bytes. The programme neither guesses a broker format nor starts an alternate dispatcher.

Optional cache_rebuild and verify_reopen run the installed target's actual commands. Select verify_reopen to check engine-specific schema, sequences, triggers, transport routing and application health that cannot be inferred from row hashes alone. Native SQL must contain the complete database schema and data, including sequences and native queue tables. Any intentionally external state needs an explicit original export/import contract.

A generic, deliberately unbound example is supplied in native-project.example.json. Its placeholder executables are not a claimed live configuration. Replace every input from the actual installed host before invoking it.

## Secret and runtime boundaries

The programme always excludes .env.local, .env.local.php, .env.<selected-environment>.local and auth.json, plus config/packages/tjl_catalogue_workspace.yaml, from the project projection. The latter retains each host's actual private Store path; the independently booted kernel must resolve tjl_catalogue_workspace.directory to the configured store_root. Explicitly list every other host secret, including actual Symfony decryption keys, custom runtime credentials and any compiled private configuration. Exclude actual native database storage files/directories, including SQLite database/WAL/SHM files when applicable: the complete native SQL is the database authority. A committed nonsecret .env can remain in source. Audit the actual installed tree; automatic filename recognition is not a complete secret inventory.

Source exclusions are recorded in the authenticated manifest. Target-private and reproducible runtime paths are preserved, and an incoming archive that contains a conflicting target-private path is rejected before mutation. Named storage roots must contain the intended application/source/media bytes; do not select unrelated private credential directories. Source/media journals exclude API credentials, while their complete retained native responses remain private.

The control directory must be an ordinary private mode0700 directory outside every installed/storage root. Archive keys are existing mode0600 regular files containing exactly 32 random bytes. Keep the key separate from the transferred archive. The programme does not upload or publish private archives.

## Original commands and result envelopes

Every invocation uses:

```text
<actual-PHP-wrapper> <application>/tools/catalogue-project.php
  --phase=<phase>
  --configuration=/actual/private/site.json
  --work-directory=/actual/private/original-operation
  --operation-id=<stable-original-ID>
  --output=/actual/private/selected-result.json
```


Phases inspect and status need no archive key. inspect boots the actual installed Symfony kernel in a separate native PHP process and reads its original Doctrine connection. It returns the actual database platform/identity hash, every native table's row count and complete sorted row digest, Composer JSON/lock/installed-vendor identities, console identity and selected queue mode. Binary values are hashed without JSON number coercion. Duplicate rows remain part of the digest. No database password is emitted.

export and review additionally take --archive and --key-file. receive, reopen and recover take --key-file and --expect-target with the exact returned review_sha256.

Every result file is:

```json
{"schema":"tjl.catalogue.native-project-result.v1","ok":true,"phase":"export","operation_id":"<original>","result":{}}
```


The result object is the actual phase-specific response. Failures return ok:false, the concrete error/reason and complete retained state. Exit zero is reserved for an accepted original result. A result file alone is not proof that a caller observed the native exit; the receiving owner retains both.

### Source export

1. Run inspect against the actual source.
2. Run export with its original operation, private archive path and existing archive key.
3. Retain the full result and actual exit.

Export drains the original site, verifies that state, boots the real kernel and captures its database identity and full table digests. It executes the selected native SQL and external-queue export, copies every declared installed/source/storage byte into a private frozen projection, and compares both the live file inventory and a fresh database probe before accepting that freeze.

The authenticated encrypted archive includes complete project/, public/<logical-name>/, private/<logical-name>/, database/database.sql and metadata/source.json. External queue files are under metadata/queue/. Permissions and safe relative internal symbolic links are retained. Sockets, devices and links outside their declared top-level archive group are rejected. Empty directories and complete Composer/vendor contents remain included. File-size or hash changes suspend capture.

The export result schema is tjl.catalogue.native-export.v1, state COMPLETE. It includes path, bytes, sha256, manifest_sha256, manifest and source. source is exactly the original authenticated manifest.source, not a later observation. It includes the frozen native probe, root keys, actual Store root key, exclusions, SQL identity and actual native command receipts. The file manifest contains every original Store/source/media journal and blob.

The archive authenticates every record with AES-256-GCM, monotonic sequence binding, HKDF-SHA256 and a mandatory authenticated final record. It uses the maintained native-project v1 framing. The framing label remains ydw.native-project-encrypted.v1 for format compatibility; source.schema identifies this Symfony catalogue implementation. No Drupal runtime is used.

Only after the complete archive has been authenticated and retained does the programme call the original resume command. Interrupted export reuses its frozen manifest and complete original archive. It does not replace that manifest with a new source snapshot.

### Existing-target review

Run review at the existing isolated target with the original incoming archive/key and target configuration. It authenticates the complete original archive into a private staging directory before selecting any source files for target mutation.

The original target is drained, then its complete code/vendor/database/public/private/Store/queue state is captured into target-backup.native using the same authenticated archive engine. This backup is retained before any incoming target mutation.

The review schema is tjl.catalogue.native-target-review.v1. It returns state REVIEWED_TARGET_DRAINED, review_sha256, the exact source archive identity, authenticated source snapshot, actual target probe/root bindings, configuration hash and full target_backup identity/manifest.

The target stays drained while the owner inspects this concrete review. Native database platform, queue mode and every logical storage root must match. This is a same-platform native migration; it does not translate SQL or silently substitute a queue service.

### Receive and independent reopen

Invoke receive with the exact returned review hash. Before the first mutation it compares the actual target database/files with the authenticated target backup. Each file mutation retains its exact original preimage and desired postimage. It adopts an already completed original write only when the actual bytes/mode match, and rejects unrelated changes.

The complete native SQL is then imported with the original target command. External queue import uses the authenticated original broker export. The configured installed cache command follows. A separate native PHP process boots the received kernel and compares all native table row counts/digests, platform, Composer/vendor/console identities and queue mode with the source snapshot inside the authenticated archive. Native health verification runs before the original target workers resume and is mandatory for external queues. The complete post-hook filesystem inventory is compared with the authenticated source; changes are allowed only inside the explicit host-private/runtime exclusions.

The completed result is tjl.catalogue.native-reopen.v1 with state COMPLETE, phase receive, source, target, source_manifest, archive_sha256, review_sha256 and target_roots. source is the frozen authenticated source. target is the actual independently reopened probe. The receiving course can additionally run the unchanged catalogue workspace CLI as the original restored actor to inspect project, source, record, approval and pending-message identities.

reopen recovers an unfinished original receive or returns its immutable completion with a separate current_target observation. Later legitimate target changes never replace the source snapshot or the original accepted reopen result.

### Explicit recovery

recover requires the same key and reviewed target hash. It drains the existing target and restores the full authenticated target backup through the same file/native SQL/queue/reopen path. Unreviewed file changes halt recovery rather than being overwritten. A command whose actual exit is unknown must first be reconciled; recovery does not race an original database child.

After a verified receive, recovery also compares the current native database with the original verified source or reviewed target and rejects later native changes. Recovery after a partially failed native database import is an explicit request to restore that reviewed original database backup. Do not use it as a way to discard later legitimate target work. Retain that work independently first if the original owner chooses a separate restore operation.

## Process admission and interruption

One private operation flock is inherited by the native command wrapper and its actual child. Closing a controller descriptor does not unlock an active child. A per-command worker lock prevents duplicate dispatch at the parent-spawn/worker-journal boundary. Commands retain their exact request, complete stdout/stderr, actual PID, observed exit and timestamps.

A completed command is resumed from its original durable result. A prepared/running command without a completed result is COMMAND_UNCERTAIN. It is not rerun automatically, and neither a success-looking log nor an absent PID is converted into an exit code. Continue only when the original native process/result has been recovered. Keep the same command directory and request bytes. If no native result survives, the owner must explicitly resolve that command's effect and choose an appropriate recovery operation; this programme will not invent the missing receipt.

Fresh drain-health checks get fresh stage identities. Original dump/import/mutation stages retain their original identities. Complete output readbacks are checked against their original native receipts.

If the archive or filesystem exceeds the configured limit, preserve the complete original data and choose an explicit larger original configuration for a separately reviewed operation. No member is silently omitted. There is no CI, cloud account, uploader or alternate runtime in these tools.

## Verification limits and actual commissioning

This implementation's PHP syntax and complete source contracts can be checked without a host. Actual commissioning still requires the selected installed Symfony/Sylius project, working native database/queue commands and the existing owner's maintenance authority. Table digests verify complete row contents, not every engine-specific schema/sequence/trigger property; use the native verification command for those. A public source checkpoint is not an execution receipt.

After native receive, follow the product's complete original browser/CLI course. Open the actual rendered operator, inspect the selected records and original source/media, run the approved native import/recovery paths, inspect downloads and the isolated restored project, and view the actual wide/narrow images. Preserve the original process/results and report concrete failures against this same source edition.
