# Native Drupal and Acquia operations

`native_adapter.py` connects the maintained GovHub operator to an existing Drupal host or the selected Acquia Cloud environment. The original author’s `../cutover.py` remains the comparison engine. Its original Git blob is `5800656de67569524560c84bdd437634f0c7f22a`, source merge `abc45bf4fd25402ef7a846819abc235bdeebfa5d`, SHA-256 `677dabb175d47ce4655a3ea0f511bde7b58ee51ecff0a4a4333377ffca5ff3a2`.

The backend owns named staff, environment records, source custody, reviewed plans, immutable source pins and operation leases. This adapter owns the real native commands, API requests, retained bytes and resumable native outcomes. A completed native restoration returns its actual target and source identity; the backend then takes an actual restored manifest through the unchanged comparison.

## Configuration and interface

The web interface uses `configuration_schema()` to render ordinary labeled fields. It returns `version`, `selector: "source_kind"`, and `providers[]` with `value`, `label`, and `fields[]`. Each field exposes `name`, `label`, `type`, `required`, and applicable `help`, `placeholder`, `default`, `minimum`, or `maximum` values. `discover_capabilities(config)` returns this schema, `current_config`, `configuration`, observed `native_status`, `provider_context`, `target_fingerprint`, `actions`, `ready`, `observed_at`, and any concrete readiness message.

| Provider | Required configuration | Restoration-specific configuration |
| --- | --- | --- |
| `drush` | `environment_id`, existing `drush_path`, absolute existing `site_root`, `uri`; optional `php_path` and existing local `site_alias` | `restore_destination`, the existing project root containing `site_root`; `files_relative_path`, the actual public files path relative to that project |
| `acquia` | `environment_id`, `database_name`, `access_token_env` | `backup_id`, the actual completed backup selected from that same environment and database |

`environment_id` inside the profile is the native provider reference. The carrier’s own environment entity has a separate local ID. It supplies `operation.provider_environment_id` explicitly; the adapter compares that value with the profile. `operation.environment_id` remains the local entity ID in the carrier’s records.

`timeout_seconds` accepts 10–7,200 seconds. `max_artifact_bytes` bounds a single retained artifact and the expanded public-files restoration set; its default is 1 GiB. The adapter reads Acquia’s existing access token from the environment variable named by `access_token_env`. Configuration and command records contain that variable name, not its value. The Acquia API origin is the published `https://cloud.acquia.com/api`.

The Drupal root and project root are different inputs. For an existing project at `/srv/pilot`, Drupal may run from `/srv/pilot/web`, with its files under `web/sites/default/files`. The actual `core:status` files path must agree with the reviewed profile. The adapter rejects remote Drush aliases because their filesystem is not the local artifact custody directory. Run the same adapter on the authorized native host that owns those paths.

```python
configuration_schema() -> dict
discover_capabilities(config: dict) -> dict
capture(config: dict, context: dict, checkpoint=None, cancelled=None) -> dict
execute(operation: dict, config: dict, source_paths: dict,
        checkpoint=None, cancelled=None) -> dict
```

`capture` receives `context.output_dir`, a new or continued private capture directory. The result contains `status`, `artifacts`, `provider_context`, `observations`, `events`, and `checkpoint`/`resume_checkpoint`.

`execute` receives the carrier’s exact selected sources:

```json
{
  "snapshot_id": "the-original-snapshot-id",
  "snapshot_sha256": "the-reviewed-snapshot-sha256",
  "rows": [],
  "bindings": [{
    "agency_id": "the-source-agency-id",
    "export": {"path": "/private/export.json", "sha256": "…", "size": 0},
    "backup": {
      "path": "/private/backup.tar.gz", "sha256": "…", "size": 0,
      "format": "drush-archive", "provider_context": {}
    },
    "files": []
  }],
  "output_dir": "/private/operations/the-original-operation/native",
  "checkpoint": {}
}
```

The strings and sizes above describe the envelope; actual operations use the retained source values. Every artifact descriptor has `role`, `path`, `sha256`, and `size`. Preserve additional native metadata when the carrier copies it. A Drupal binding’s `files` contains the exact `database_dump` and every `configuration_file`, retaining each configuration file’s `relative_path`. Its `export` is the `drush-configuration-files/v1` manifest. Its `backup` is the original Drush archive. The adapter verifies all of these bytes and the complete configuration file set before restoration starts.

The operation names its `native_action`, `provider_environment_id`, reviewed `target_fingerprint`, and, when several sources exist, exact `agency_id` and/or `backup_sha256`. These native action names are independent of the carrier’s REHEARSAL, CUTOVER and ROLLBACK plan labels.

| Native action | Actual operation |
| --- | --- |
| `drush-capture` | Read native status and installed commands; export configuration; write the real SQL dump and native archive to private custody |
| `drush-restore` | Import the selected SQL, restore its retained public file members into the reviewed native files directory, import the complete selected configuration, rebuild caches, and retain new native status |
| `acquia-capture` | Read the selected environment and complete domain/backup inventories; optionally download the selected backup’s actual bytes |
| `acquia-restore` | Submit one restore for that actual backup in its original environment/database and resume its exact notification until the native result is known |

## Drupal capture and restoration

The adapter observes installed commands with `list --format=json` and uses an explicit non-secret field list with `core:status --format=json`. Target fingerprints include the selected root, URI, database identity, files path, Drupal/Drush versions and relevant installed restoration commands. A new target requires a new reviewed fingerprint.

Capture runs the installed `config:export --destination=… --yes`, `sql:dump --result-file=…` and `archive:dump --destination=… --yes`. It preserves individual configuration files and their exact complete manifest, the separate SQL dump, the archive, and the native status. These artifacts describe the actual source site. Agency membership, route count, HTTP status, canonical URLs and approval decisions remain separate actual manifest observations.

The component restoration path uses the documented `sql:drop --yes` followed by an import appropriate to the observed database driver. MySQL/PostgreSQL use the configured Drush `sql:query --file=…` path without expanding a credential-bearing shell command. SQLite uses the installed Drupal `Settings::initialize()` and `Database::getConnection()` APIs, then passes the unchanged, hash-checked SQL to that driver's native PDO client. Drupal registers its own SQLite functions and `NOCASE_UTF8` collation when opening the connection; standalone `sqlite3` does not have that collation. The adapter's actual-driver preflight checks the resolved database file, selected dump and registered collation before reset. Its emitted PHP helper and request are retained with their hashes inside the operation, and the import returns the original driver source hash, database identity, source hash and native integrity-check result.

The installed Drush 13.8.0 SQLite driver constructs its dump with native `sqlite3 .dump`; that dump creates tables and does not replace tables already present. The explicit reset removes the selected target's tables, including stale tables absent from the recovery point. The adapter verifies and stages the exact SQL, configuration set and archive `files/` members before this first mutation. Reset and import are separate persisted mutating commands, so known completed steps remain reusable during the same operation's continuation. A retained, completed generic SQLite import with a nonzero exit code is preserved under its original label; the driver correction records a separate reset and import, clearing its partially applied schema. An unknown original completion must be reconciled before that correction. The pre-reset native status/command observation also remains available when a partial database can no longer complete Drupal bootstrap; current root, site, database and installed-version identities still have to agree. The adapter then restores the managed public files, imports configuration and rebuilds caches. The published reset contract is `https://www.drush.org/13.x/commands/sql_drop/`.

This action restores database, configuration and the original managed public-files tree into an already configured Drupal application. The installed application code, Composer dependencies and native database connection belong to that configured environment. The archive's original `MANIFEST.yml` is read through installed `yaml:get:value`: format `1.0`, an enabled files component and a Drush 13 generator are required for complete file reconciliation. Drush 13 explicitly excludes the public `css`, `js`, `styles` and `php` cache roots; those same roots remain outside the managed file comparison.

Before database reset, the adapter pins the full source public-file manifest and current target file inventory. Changed files and target-only files are copied into private `prior-public-files/` custody and hash-checked before replacement or removal. Each action records a prepared state before changing its target, then retains the actual completion; continuation recognizes an already-visible exact replacement/removal and checks original custody. The restored managed tree must match the complete selected source path, SHA-256, size and mode list. The operation returns the measured inventory artifact and hash, removal count, and explicit native cache exclusions. Original backup and displaced-file bytes remain part of the private operation handover.

The published Drush 13 command set provides this SQL/configuration path. An older `archive:restore` command must not be presumed present merely because an earlier manual describes it. Source-native command discovery determines what the configured host can run.

Archive extraction accepts ordinary files under `files/`, rejects link and special-file members, checks paths and expanded sizes, and stages bytes inside the private operation before changing native files. Every destination is checked against the selected project/files directory. The adapter does not execute an arbitrary shell string from a profile or manifest.

## Acquia source and restore contract

The adapter uses Acquia’s original OpenAPI document retrieved on 2026-10-11:

- Author/publisher: **Acquia**, Cloud API documentation.
- Original URL: `https://cloudapi-docs.acquia.com/acquia-spec.yaml`.
- OpenAPI format: 3.0.0; API document version: 2.0.0.
- Original bytes: **1,489,140**.
- SHA-256: **`a4419efca11e3177d9e7907e20e509c0e98de79513e6b2c2aed52805d88956f2`**.
- The original documentation page resolves this exact specification URL through its Swagger UI configuration.

The selected environment ID is Acquia’s compound numeric-ID/application-UUID value. The adapter reads only that configured environment and database, using these original paths:

| Method | Original API resource |
| --- | --- |
| GET | `/environments/{environmentId}` |
| GET | `/environments/{environmentId}/domains` |
| GET | `/environments/{environmentId}/databases/{databaseName}/backups` |
| GET | `/environments/{environmentId}/databases/{databaseName}/backups/{backupId}` |
| GET | `/environments/{environmentId}/databases/{databaseName}/backups/{backupId}/actions/download` |
| POST | `/environments/{environmentId}/databases/{databaseName}/backups/{backupId}/actions/restore` |
| GET | `/notifications/{notificationUuid}` |

Collections use original HAL `_embedded.items`, `limit` and `offset`. The retained census continues to a terminal empty page, checks identities and preserves each response. The schema’s `total` description is a returned-collection count; it is not treated as an independently reliable grand total. Domains and backups must preserve the selected environment identity; backups must also match the selected database.

A backup record supplies its native ID, environment, database, timestamps and deletion state. Its record does not supply a file SHA-256. The adapter downloads the actual bytes before computing their checksum. Download responses can contain raw file bytes or the published `{url, expires_at}` descriptor. Expired links are rejected, and the API bearer token is never forwarded to a different download origin. Request summaries omit signed URL queries; original private responses remain in custody.

The restore POST has no request body and restores the selected backup to its own environment/database. A 202 response supplies `_links.notification.href`. The adapter persists that exact notification and selected backup/source identity before returning a pending native state. Notification statuses are `in-progress`, `completed`, and `failed`. Cross-environment database copy is a different provider operation and is not substituted for this restore action.

## Checkpoints and interrupted operations

`checkpoint(value)` is called for each actual command/request and persisted native state. It receives:

```json
{
  "stage": "the-current-native-stage",
  "mutation_started": true,
  "safe_to_retry": true,
  "resume_checkpoint": {
    "intent_sha256": "…",
    "intent": {},
    "phase": "accepted",
    "environment_id": "the-native-environment-id",
    "database_name": "the-native-database-name",
    "backup_id": 123,
    "notification_url": "https://cloud.acquia.com/api/notifications/the-original-uuid"
  }
}
```

The carrier persists the callback before returning. It passes the retained `resume_checkpoint` directly as `source_paths.checkpoint` or `operation.resume_checkpoint` on the same operation. The local `native-state.json`, command records and original stdout/stderr remain in the private native output directory. Source hashes, target, action and original snapshot identity are checked together before continuation.

A complete workspace backup retains `native-operations/` and `sources/` bytes with the carrier's original-root inventory. When that backup opens elsewhere, the carrier supplies `workspace_relocations: [{"from": "/original/private/workspace", "to": "/current/private/workspace"}]` in both capture context and operation source paths. The adapter resolves only those two private directory prefixes in memory, including command arguments and artifact descriptors. Native environment/profile targets, settings, database paths, public-file targets and URLs remain unchanged. Original JSON requiring private-path resolution is also retained byte for byte under `relocated-originals/` before a continued mutable state record is saved. Completed command comparisons use their resolved private paths and the original output hashes; prior command/result/event bytes are not rewritten to manufacture new provenance.

`safe_to_retry` describes resuming this exact operation. For accepted Acquia work, continuation performs GET on the retained notification. It does not issue another POST. A response that reached local custody before a callback failure is reconciled from the original retained request and response bytes. A dispatched request without an accepted native identity remains associated with its original request for provider reconciliation.

For Drupal, each completed mutating command has an immutable request/result record, including its return code and stdout/stderr hashes. Continuation reuses completed commands. File restoration replaces exact selected bytes atomically and records each completed path; its prior bytes remain available. An interrupted child is stopped through its own process group. A native command whose completion is unknown remains attached to that original process/result; it is not silently started again. A launch failure before any child exists is recorded separately and can be resumed.

Results distinguish `COMPLETE`, `FAILED`, `WAITING_NATIVE` and `CANCELLED`. A cancellation after mutation began retains its native continuation for reconciliation. Native restore completion includes the original target, backup checksum and snapshot identity. The carrier uses an actual RESTORED source manifest to complete the broader cutover/recovery comparison.

## Primary command sources

These original Drush 13 pages were retained on 2026-10-11. The commands and option meanings above come from those current pages:

| Source | Original HTML SHA-256 |
| --- | --- |
| `https://www.drush.org/13.x/commands/sql_query/` | `ba5d62cb23a4484178e6627bdb05efe76f504ad972e384f1e7e7c3acb7cd9057` |
| `https://www.drush.org/13.x/commands/config_import/` | `61e76c280a173c96089629035bf1d6433ee37a9e400632f590962e1616842c31` |
| `https://www.drush.org/13.x/commands/core_status/` | `c6e19138a0a7dd342130a0a317d8a4a4f43237b839eb7d94704a04b7aa2791da` |
| `https://www.drush.org/13.x/commands/archive_dump/` | `1c153f44ef8df50cd6eb47a4ebdd1001a70db5e9cb538c58b9804f336852c836` |

Configuration export source: `https://www.drush.org/13.x/commands/config_export/`. Historical archive-format reference: `https://www.drush.org/12.x/commands/archive_restore/`. Native installed version/status and actual captured artifacts remain attached to the producer operation, so historical documentation does not stand in for an observed installed command.

The SQLite recovery implementation was read directly from the installed official Drupal 11.4.9 sources: `core/modules/sqlite/src/Driver/Database/sqlite/Connection.php`, `core/lib/Drupal/Core/Site/Settings.php`, and `core/lib/Drupal/Core/Database/{Database,Connection}.php`, together with installed Drush 13.8.0 `src/Sql/SqlSqlite.php`. The current primary API references are `https://api.drupal.org/api/drupal/core!modules!sqlite!src!Driver!Database!sqlite!Connection.php/function/Connection::open/11.x` and `https://api.drupal.org/api/drupal/core!lib!Drupal!Core!Site!Settings.php/function/Settings::initialize/11.x`. These define the real driver initialization and settings contract used by the retained helper.

The controlling procurement notice is `https://ssl.doas.state.ga.us/gpr/eventDetails?eSourceNumber=GTA-98000-eRFP-1022027&sourceSystemType=jag`. Its general scope describes more than 90 state agencies, while the public service page at `https://digital.georgia.gov/services/govhub` describes more than 80 sites. The original current Attachment A, §1.2 on page 2, gives the more specific installed baseline: **92 sites running Drupal 11**, 800 GB disk, 64 GB RAM, Cloudflare WAF with 30-day analytics and New Relic. That original issuer PDF is 331,928 bytes, SHA-256 `779a36c310bddf0b03deb8728e1e96a384ea4d586deccfdc7697695446e44934`, retrieved 2026-10-11T19:27:00.394216Z through the event’s original attachment links. Agency count, site count and an actual supplied environment inventory remain distinct units; the carrier’s cohort comes from that inventory. The isolated native producer uses the official Drupal 11.4.9 release with PHP 8.3.6 and Drush 13.8.0. The portal/event PDF and Attachment A also retain different November 9 closing times (15:00 EST versus 16:00 ET); planning uses the earlier published time while preserving both originals.


## Lagoon native provider

The same native Session and operating store also support Lagoon. [LAGOON.md](LAGOON.md) covers its complete project/backup/task populations, native archive preparation and retrieval, active/standby route and API-route readback, equivalent selector correction for the next rollback, original-task recovery, and receiving. Lagoon's original CLI owns authentication and emits decoded GraphQL data. The download transport retains the actual archive HTTP response separately. See the pinned provider and CLI sources in that guide.


## Pantheon native provider

[PANTHEON.md](PANTHEON.md) documents the complete Terminus integration in the existing native Session, operation queue, source intake, review and editable handover. [PANTHEON_RECEIVING.md](PANTHEON_RECEIVING.md) prepares the actual PHP/Terminus installation, opens the original workspace, selects the original account and site, follows the same queued operation and receives its complete backup.

The deployed native contract is the original Terminus 4.3.3 release at source commit `4cd1810ad892157131cec5919baf3036ab457d57`; its unchanged PHAR has 12,336,985 bytes and SHA-256 `e7ca9bcad3acbb1cfc0cec32550eeb2351e578dc6d5f79cd3a5303201893bade`. The earlier stock-command implementation was read at 4.x commit `b3d2ea8678bfcc2193643fd4c75be510e8d358e3`; original saved commands retain that history. The native bridge now checks the released classes it uses, and preparation compares the installed three PHP files against this exact received source.

[pantheon_bridge/PHP_BRIDGE.md](pantheon_bridge/PHP_BRIDGE.md) defines `govhub-pantheon-bridge/v1`. A new target-changing step writes its complete private mode0600 request bound to operation, step, intent and native target. The existing bridge persists dispatch, complete native response and returned workflow UUID before publishing its final receipt. The provider consumes the same retained receipt or immediate workflow sidecar, then follows that actual workflow through separate native status observations. Original native HTTP event bodies are retained once in immutable event files, with byte/hash references in the receipt.

Inventory retains the exact site/environment/backup identities and native output. Target changes retain their complete pre-change backups, selected source and options. Concurrent backup completion stays with the same operation and its explicit original component filenames. Completed or unresolved pre-bridge command records continue through their original recovery path.

`operations.resume` accepts an explicit `runtime_bindings` object containing only `terminus_path`, `php_path` and `site_root`. The original profile and business intent remain pinned; the existing native checkpoint records the actual receiving-host paths and original command attempts. `operations.capabilities` can use the same paths to inspect the received native installation. The original workspace relocation map resolves its private request/receipt paths, and the current Session retains prior raw argv and output. The host's original Terminus session supplies the actual account.


The receiver uses native Terminus configuration to bind each received plugin source to its own installation. Its immutable PHP launcher selects the native plugin, dependency-base and command-cache directories, then forwards the original command to the exact release. The three existing runtime binding fields carry this into Session and original-operation continuation. The host's account/session configuration continues to select authentication. WordPress source and destination fields follow native search/replacement string semantics.

The receiving contract is grounded in the released [plugin installer](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands/Self/Plugin/InstallCommand.php), [configuration constants](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/config/constants.yml), [native factory](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Terminus.php), [environment variable loader](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Config/EnvConfig.php), and PHP's [argv-array process interface](https://www.php.net/manual/en/function.proc-open.php). The [native clone command](https://docs.pantheon.io/terminus/commands/env-clone-content) documents the paired WordPress replacement values.


## Tome complete output and local release selection

The lazily loaded `tome_native.py` provider contributes one `configuration_schema()` provider definition, `operation_actions(operation_type)`, `discover_capabilities(config)`, `capture(config, context, checkpoint=None, cancelled=None)` and `execute(operation, config, source_paths, checkpoint=None, cancelled=None)`. Capture runs through the original GovHub `CAPTURE` journal and retains its real command outcomes and source files. A process exit code alone does not establish a complete Tome edition: the generator can collect individual path errors while its overall command exits successfully.

The static receiver requires one current `static_build_report` artifact with schema `govhub.tome-static-build.v1`, `complete: true`, an empty explicit `errors` array, the reviewed production URI, exact `drupal/tome` generator version/source digest, retained inputs and a complete `files` path/byte/SHA-256 inventory. Every file must match a current `static_asset` artifact by its exact `relative_path`, byte count and digest and the original retained artifact record. Interrupted captures and previous artifacts remain in the original operation history.

The `static_releases` module owns the immutable edition/comparison/target objects and three original-worker actions: `STATIC_STAGE`, `STATIC_PUBLISH`, `STATIC_ROLLBACK`. Each target uses its explicitly configured existing directory and one current symlink; the native worker pins directory identity, exact edition, environment, current predecessor and reviewed selection. It stages and verifies the complete path set before a single atomic current-pointer replacement. An interrupted replacement resumes from its exact on-disk intent and actual pointer, retaining completed native facts even if current cancellation, account, review or configuration changed afterward. Current authorization remains required before any new pointer replacement. See [STATIC_RELEASES.md](STATIC_RELEASES.md) for receiving and operation commands.

## Skpr CLI, native backups and complete project receiving

The Skpr provider is implemented in `skpr_adapter.py`, joined through the original `native_adapter.py` and `govhub_operations.py`. Its complete receiving application is `skpr_receive.py`; the original browser includes `web/skpr.js` and `web/skpr.css`. [SKPR.md](SKPR.md) documents commands, schemas, source and backup receiving, native continuation and full editable-application handover.

The governing release is [Skpr CLI v1.9.4, source 0014e431f5892591fb04600a2e2ca706d70a3897](https://github.com/skpr/cli/tree/0014e431f5892591fb04600a2e2ca706d70a3897), using [API v1.8.5, source 93f97034c4f88cb29d369f03761c12599f63b92c](https://github.com/skpr/api/tree/93f97034c4f88cb29d369f03761c12599f63b92c). The original Linux amd64 release archive is 45,368,316 bytes with SHA-256 e9ede2b799e9a32bae51446da404c10467df252a4d844efd2f166fa54205bd58. The native release is an external dependency.

Source contracts retain the actual capitalized environment and backup JSON fields, original release-list table, release-info image JSON, empty backup/restore responses, and native Deployed and Completed lifecycle phases. Component BackupID is joined to the environment backup Name. Full restic snapshot IDs are retained separately with explicit original component selections, full snapshot listings, downloaded tar bytes and member identities. [Official MySQL component documentation](https://docs.skpr.io/cli/mysql/mysql-backup-list/) and [original restic dump documentation](https://restic.readthedocs.io/en/stable/050_restore.html) describe those native boundaries.

The complete Git bundle, original commit archive, staged and unstaged binary patches, untracked source and every .skpr file belong to the private captured project. The receiving application reconstructs that exact original source and independently reopens the delivered application with the original workspace backup. Native account credentials remain on the operating host.
