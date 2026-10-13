# Native Drupal content consolidation

This component connects the maintained GovHub operation worker to an equipped Drupal site. The installed core Migrate engine owns destination entities, source row hashes, ID maps, migration messages and relationship lookups. GovHub retains the selected source edition, compiled plan, original files, operation output and receiving bodies together.

## Install the supplied module

Use the existing private Drush configuration for the selected site. The supplied module declares Drupal 10.6 or 11 and depends on core Migrate and JSON:API. Drupal, PHP, Drush, entity bundles, fields and language configuration come from the selected target project. The installer does not create another target or download dependencies.

From the maintained workspace:

```sh
python3 -m content_consolidation.drupal.install \
  --config /private/selected-drush-profile.json \
  --output /private/content-module-install
```

The installer uses the original `native_adapter.Session` and selected PHP/Drush paths. It reads actual `core:status` and installed commands, copies the complete supplied `govhub_consolidation/` module into `modules/custom/`, runs `pm:enable govhub_consolidation --yes` and `cache:rebuild`, and verifies every installed source file. Its retained `installed-module.json` identifies the selected target and exact module source inventory. A later owned module update retains replaced files under the original installation operation's `module-before/`. Resume the same installation directory after an interrupted copy; its source and target intent must remain identical.

A different existing custom module at that path is an actual source composition conflict. Compose its source before updating it. Normal receiving must install the complete source edition used by the Python adapter; the adapter checks the installed hashes before dispatch.

## Original operation entrypoint

`content_consolidation.drupal.adapter.execute(operation, config, source_paths, checkpoint=None, cancelled=None)` uses the existing GovHub result envelope. The content facade selects it for these native actions:

| Native action | Target activity |
| --- | --- |
| `drupal-content-import` | Register the reviewed plan and execute core Migrate in dependency order, then receive the native destinations. |
| `drupal-content-status` | Read original maps, messages, selected destinations and migration status. |
| `drupal-content-receive` | Receive the selected original mapped destinations without importing them again. |
| `drupal-content-rollback` | Roll back the explicitly selected source/map rows, then receive their original targets. |

The original operation supplies `id` or `operation_id`, `native_action`, and the exact configured `provider_environment_id` or `environment_id`. Selective rollback supplies `content_selection`. An optional nonnegative `content_row_limit` asks core Migrate to yield at a completed row boundary; zero uses the ordinary configured time budget. The operation controller preserves this value for same-operation continuation.

The selected `config` uses the original Drush profile fields, including the real `site_root`, `uri`, PHP/Drush paths and configured time and artifact limits. Optional `jsonapi_bearer_env` and `jsonapi_cookie_env` hold environment-variable **names** for existing private receiving credentials. Their values stay in the receiver environment. HTTP authentication is applied only to the selected target origin, and stripped when a redirect changes origin.

`source_paths` supplies:

```json
{
  "content_plan": {
    "schema": "govhub.content-consolidation.drupal-plan.v1"
  },
  "content_files": [
    {
      "file_id": "the-original-retained-file-id",
      "path": "/private/original/source-or-media-file",
      "sha256": "the-actual-sha256",
      "bytes": 1234,
      "relative_path": "original/name.ext"
    }
  ],
  "output_dir": "/private/original-native-operation",
  "checkpoint": {},
  "workspace_relocations": {}
}
```

The abbreviated plan above is supplied in full by the original compiler. Bindings include every original source reference, selected media file and selected backup reference. All bytes and hashes are checked before dispatch. Original private operation files and source bindings travel through the maintained workspace backup and handover mechanisms.

## Frozen plan v1

The top-level plan contains `schema`, immutable `id`, `family_id`, `edition_id`, `label`, `source_refs`, `migrations`, `files`, `routes` and `review`. A source reference identifies the retained file with `file_id`, `sha256`, `bytes`, its original label and observation time.

Each migration contains:

| Field | Native meaning |
| --- | --- |
| `id` | Stable `govhub_` identifier containing lowercase letters, digits and underscores, at most 56 characters. Retain it across source refreshes. |
| `source.ids` | Original source key definitions with type `string`. Original values remain exact strings. |
| `source.id_order` | Original compound key order, independent of JSON object sorting. |
| `source.fields` / `source.rows` | Selected source field labels and actual projected source rows. |
| `process` / `process_order` | Core process definitions and explicit destination-property order. Native `@destination` dependencies are resolved before dependent fields; nested `sub_process` ordering is retained. |
| `destination` | Installed `entity:<entity_type>` plugin, actual bundle, translation setting and any explicitly selected overwrite fields. |
| `existing_target_policy` | The per-migration policy in the following table. |
| `migration_dependencies` | Required and optional stable migration IDs. Required dependencies and the overall graph must be valid. |
| `receiving.fields` | Actual native field names whose readback is selected, using field roots such as `body` rather than process paths such as `body/0/value`. |
| `receiving.langcode` | Optional selected native language. Native translation destination IDs take precedence when present. |

A stable migration cannot change its source key shape, entity type, bundle, translation mode or family. Select another stable migration identity for a different destination contract.

The native source is the supplied `govhub_records` plugin with core `track_changes`. Original rows, file bindings and edition metadata are retained separately in Drupal's owned key-value registry. Core source configuration stays stable across editions, so a new plan ID or relocated private file path does not change every native row hash. A bound file's actual SHA-256 enters the native row hash; its private filesystem path is injected after core hashing.

### Existing destination policies

| Policy | Import and refresh | Explicit rollback |
| --- | --- | --- |
| `CREATE_ONLY` | Create new target entities or refresh rows already owned by the same native map. A selected new translation may join the entity mapped by its declared original dependency. An unrelated existing entity is reported for explicit mapping. | Follow the original native map's rollback action for each selected row. |
| `REVIEWED_FIELD_UPDATE` | Use explicitly selected existing native IDs/UUIDs and nonempty `destination.overwrite_properties`. The reviewed target backup is retained in `review.backup_ref`. | Core preserves an existing entity; the retained backup supplies full original recovery when that is the selected operation. |
| `REUSE_SELECTED` | Resolve the selected existing entity or original map, preserve entity values and revisions, and save its source map with native `ROLLBACK_PRESERVE`. No target update backup is required for reuse. | Remove the selected source map and preserve the existing entity. |

The global `review.allow_existing_updates` describes reviewed field updates. Each migration's own policy and overwrite fields still determine its behavior. The plan retains `review.id`, `actor`, `at`, `note` and, for reviewed field updates, the actual backup reference.

An absent `overwrite_properties` retains the core destination's normal refresh behavior. An explicitly empty list means no existing fields are overwritten; use that setting for selected reuse. A native refresh retains target entities for rows missing from the newer selected source edition. Removing original target rows is a separate explicit rollback operation.

## Native relationships, media and routes

Supported installed **core** process plugins are `get`, `default_value`, `concat`, `extract`, `static_map`, `skip_on_empty`, `migration_lookup`, `sub_process`, `file_copy`, `format_date`, `explode`, `flatten`, `urlencode` and `null_coalesce`. The runner checks the installed plugin provider. The compiler and target profile remain the source of field definitions.

A `migration_lookup` names a migration in the frozen plan and uses `no_stub: true`. Lookup uses that migration's original core ID map and exact ordered source keys. Declare the relationship migration in `migration_dependencies.required` so its map is populated first. Core `no_stub` prevents a missing lookup from creating a stub; an absent match returns null. Optional relationships can retain that null result. For an agreed required relationship, follow the lookup with core `skip_on_empty` and `method: "row"` so a missing original map becomes a recorded skipped row with an actionable message. Review the native skipped-row count and message before accepting the migration. For example:

```json
{
  "field_agency/target_id": [
    {"plugin": "migration_lookup", "migration": "govhub_agencies", "source": "agency_id", "no_stub": true},
    {"plugin": "skip_on_empty", "method": "row", "message": "The selected agency must be imported before this document."}
  ]
}
```

The actual target's required-field validation remains applicable. Choose required or optional behavior from the reviewed content model; the native runner does not create relationship values.

The controller's reviewed `file_bindings` maps an original row's exact `source_ids` to a retained `file_id`; the compiler injects `_govhub_file_id` into the selected projected row. Supplied original feed bytes remain intact. Each file copy runs at the top process level of a separate `entity:file` migration, and every selected file row has a binding in the plan's retained files. This keeps the private source path, original hash, native file entity, replacement ownership and subsequent HTTP bytes on the same row. `sub_process` links those file entities through `migration_lookup`; it does not copy files from nested source records. The native row receives a verified private `_govhub_source_path` for this core process:

```json
{
  "plugin": "file_copy",
  "source": ["_govhub_source_path", "original_destination_uri"],
  "move": false,
  "file_exists": "use existing"
}
```

The destination names either an original selected source property or a declared `@helper` destination process. Its resolved value must be an ordinary `public://` or `private://` URI. A helper uses the same original Row and installed core Migrate process semantics. Before any copy, the runner evaluates only that helper's declared dependency closure on a row without destination values, then checks the exact resolved URI against the original file map and reviewed replacement scope. A helper whose dependency closure contains `file_copy` is rejected before it can copy or move bytes. All top-level copies receive this preflight, including copies assigned to helper or filename properties; nested copies remain unsupported.

For a reviewed target path constructed from the original document number, the complete core process can be:

```json
{
  "_prefix": {"plugin": "default_value", "default_value": "public://federal-register/"},
  "_suffix": {"plugin": "default_value", "default_value": ".pdf"},
  "_destination": {"plugin": "concat", "source": ["@_prefix", "source_id", "@_suffix"]},
  "uri": {
    "plugin": "file_copy",
    "source": ["_govhub_source_path", "@_destination"],
    "move": false,
    "file_exists": "replace"
  }
}
```

Retain these four properties in `process_order`. The native dependency evaluator preserves those original helpers and handles declared nested property references through the same Row access rules. It does not add computed target URIs to the publisher's original source record.

`file_exists: "replace"` supports an original mapped file refresh or an explicitly reviewed replacement with its retained target backup. An existing different file with `use existing` is reported rather than silently becoming the selected original media. Drupal still performs the file copy and entity save.

Each selected route has `old_url`, `new_url`, `migration_id`, ordered string `source_ids` and optional `langcode`. An alias route names its own `entity:path_alias` migration and exact original source keys. Include `path`, `alias` and `langcode` in that migration's `receiving.fields`. The Federal Register case binds every selected route to its original aliases migration. Use `entity:redirect` only when that target module is installed and selected.

Alias receiving binds the native map, destination IDs, UUID, language, alias and canonical path before requesting its real URL. The selected `old_url` is the alias; `new_url` may be that same alias or the actual canonical target. Both stay on the configured site's origin and preserve a Drupal installation's base path. A successful alias may return HTTP 200 at the alias or canonical URL. Its actual full body, redirect chain and native identity remain together in the receiving record. A redirect retains its existing HTTP chain and final mapped URL handling.

## Status, interruption and original-row rollback

The PHP result schema is `govhub.content-consolidation.drupal-result.v1`. It includes the operation, plan and source SHA, actual Drupal version, per-migration native result codes and status, original ordered source and destination IDs, complete map fields, source row hashes, map counts, native messages, selected target fields, relationship UUIDs, file hashes and actual receiving URLs. Status values are `complete`, `incomplete` and `failed`.

Source preparation and destination processing use core Migrate. Destination entity saves and the original map upsert share a row transaction. The journal retains the migration being processed before import or rollback changes its native status. The selected site has one process-owned content-operation lock. Original worker cancellation and timeout retain and reap that worker's process before another mutating native attempt can proceed.

A completed row boundary can yield `WAITING_NATIVE`. Resume the **same** GovHub operation, source plan and private output directory; its original maps provide continuation. A recovered command whose native result was already written adopts that exact result before considering another import. A failed HTTP receiving pass retains a completed native import; the same operation retries receiving without repeating the import.

If a process completion is uncertain, reconcile its original command record and process through the maintained worker. The adapter accepts an actual completed command, an original never-started launch, or an original interrupted command whose owned process was reaped. It does not clear another worker's migration status. After a reconciled interruption, only this operation's journaled current migration can return to idle for continuation.

Selective rollback uses:

```json
{
  "content_selection": [
    {
      "migration_id": "govhub_family_content",
      "source_ids": ["original-site", "exact-original-record", "fr"]
    }
  ]
}
```

Selection values follow that migration's original `source.id_order`. Rollback visits required dependents before their parents and invokes the installed destination's rollback behavior for the actual selected map row. Original `ROLLBACK_PRESERVE` entities remain. Results retain native before/after targets, prior map values and the selected action: `DELETE`, `PRESERVE`, `REMOVE_FAILED_MAP` or `ALREADY_UNMAPPED`.

A source refresh, selected row rollback, module source update and full target-backup restore are distinct operations. The original GovHub native backup/restore interface supplies the last of these.

## Actual receiving and handover

The Python receiving schema is `govhub.content-consolidation.receiving.v1`. It performs real HTTP GETs against each selected native JSON:API UUID and language route, linked native file URL and selected original URL. It verifies UUID/type, selected field exposure, native relationship UUID order, selected language and exact native/original media SHA-256.

Each HTTP response retains the requested URL, status, final URL, actual redirect chain, selected response headers, complete original body bytes and SHA-256. JSON:API bodies remain complete retained artifacts; checkpoint state stores references rather than embedding every row and HTTP body. Partial network bodies are retained separately. After an original target connection failure, unattempted resources are marked pending for the same operation's later receiving pass.

A selected translation rollback can produce HTTP 404/410 or a native language fallback. Receiving reports which actual outcome occurred and checks the native removal of that selected translation. A preserved existing entity is received again by its original UUID.

A bound alias uses its native identity and real route even when JSON:API advertises an alias resource. The dedicated receiving account keeps its existing content/media permissions; alias administration access is unnecessary. A selected `DELETE` must retain the original same-row before/after result with the alias removed and an actual HTTP 404/410 at its old URL. `PRESERVE` must retain the same native UUID, destination IDs, language and paths and receive its live URL. `ALREADY_UNMAPPED` and `REMOVE_FAILED_MAP` retain their explicit map outcome and require the selected old URL to be absent, without inventing a prior entity UUID. Unselected aliases are still received through their retained maps during rollback; restoration is received from the new actual native result. Any changed native identity, unexpected live removed URL or failed response remains an actionable receiving result in the same original operation. Other entity JSON:API, translation, media and redirect receiving keep their original interfaces.

The original adapter returns `COMPLETE` only after its selected native activity and receiving pass complete. `FAILED` retains the actual original error, maps, native output and receiving problems. `WAITING_NATIVE` retains the original paused/interrupted operation for continuation. The maintained GovHub worker, case handover and workspace backup capture these exact files; the component uses their existing restart, export and receiving paths.

## Primary implementation references

The source was aligned with the original maintained GovHub `native_adapter.py` interface and the official Drupal 10.6.18 and 11.4.9 APIs. Source discovery supplies the original Drupal 10 MigrateSource annotation and the Drupal 11 attribute. The equipped target's actual version, available plugins and observed results are recorded by its receiving operation.

- [Drupal 10.6.18 source plugin discovery](https://raw.githubusercontent.com/drupal/drupal/10.6.18/core/modules/migrate/src/Plugin/MigrateSourcePluginManager.php)
- [Drupal 10.6.18 core Migrate executable](https://raw.githubusercontent.com/drupal/drupal/10.6.18/core/modules/migrate/src/MigrateExecutable.php)
- [Drupal 10.6.18 original core ID map](https://raw.githubusercontent.com/drupal/drupal/10.6.18/core/modules/migrate/src/Plugin/migrate/id_map/Sql.php)
- [Drupal 11.4.9 core Migrate executable](https://raw.githubusercontent.com/drupal/drupal/11.4.9/core/modules/migrate/src/MigrateExecutable.php)
- [Core source lifecycle and row change detection](https://raw.githubusercontent.com/drupal/drupal/11.4.9/core/modules/migrate/src/Plugin/migrate/source/SourcePluginBase.php)
- [Core source rows and hashes](https://raw.githubusercontent.com/drupal/drupal/11.4.9/core/modules/migrate/src/Row.php)
- [Core SQL ID map, source messages and map save event](https://raw.githubusercontent.com/drupal/drupal/11.4.9/core/modules/migrate/src/Plugin/migrate/id_map/Sql.php)
- [Core content entity destination and translation rollback](https://raw.githubusercontent.com/drupal/drupal/11.4.9/core/modules/migrate/src/Plugin/migrate/destination/EntityContentBase.php)
- [Core migration lookup](https://raw.githubusercontent.com/drupal/drupal/11.4.9/core/modules/migrate/src/Plugin/migrate/process/MigrationLookup.php)
- [Core file copy](https://raw.githubusercontent.com/drupal/drupal/11.4.9/core/modules/migrate/src/Plugin/migrate/process/FileCopy.php)
- [JSON:API resource type metadata](https://raw.githubusercontent.com/drupal/drupal/11.4.9/core/modules/jsonapi/src/ResourceType/ResourceType.php)
- [Drush 13 php:script and script arguments](https://www.drush.org/13.x/commands/php_script/)
