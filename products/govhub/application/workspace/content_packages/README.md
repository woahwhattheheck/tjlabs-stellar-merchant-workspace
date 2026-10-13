# Content Packages in GovHub

This component gives the existing GovHub workspace a complete native Drupal Content Packages workflow. Editors retain original and corrected archive editions, inspect full package text and assets, compare those editions, and decide against a precise native destination preview. Operators export the original Drupal graph, apply the reviewed archive through the installed module, recover that same import after an interruption, and deliver the editable workspace with its complete source and operating history.

## Installed application and native site

Use the maintained GovHub application, its existing staff account, configured site/environment, native worker and original cutover/recovery plans. The application contains this component, the existing CONTENT and VISITOR workflows, and the original provider adapters. Its local browser entry is `workspace/server.py`; its native terminal entry is `workspace/cli.py`.

The selected native integration is [Content Packages 1.3.1](https://www.drupal.org/project/content_packages/releases/1.3.1), the original October 5, 2026 release for Drupal 10/11. The complete original tar.gz has SHA-256:

`94b7eb054cfeb53029a6ccb26898d7e8b7599e273eb4365171892852455b993c`

Install that selected release with the existing Composer dependency workflow on the equipped Drupal site. Its original composer.json requires league/commonmark ^2.8 and league/html-to-markdown ^5.1; the archive commands require PHP ZipArchive. From the selected original project directory, the normal maintained installation is:

```bash
composer require drupal/content_packages:1.3.1
vendor/bin/drush pm:enable content_packages -y
vendor/bin/drush cache:rebuild
```

Use the project's original Composer and PHP launchers when those executables are supplied by its equipped runtime. Keep the resulting composer.json, composer.lock and vendor/composer metadata with that site's source closure. The shared original Drupal/Drush dependency archive provides the base runtime; the Content Packages libraries are selected by this actual Composer installation. Preserve the selected site's original backup before enabling the module, using the existing cutover operator's backup and restore workflow. The module's own optional integrations supply Media, Layout Builder, Paragraphs, Pathauto, Scheduler and Webform behavior when those modules are installed. The upstream [project and release documentation](https://www.drupal.org/project/content_packages) describe those integrations; the receiving package retains the complete upstream source archive and its license.

The GovHub profile uses `source_kind: drush`, the selected original `environment_id`, actual `site_root`, installed `drush_path`, optional original `php_path`, and the site's real `uri`. Configure it through the existing environment screen or `operations.configure`. The environment's saved provider ID and profile revision must match. The native worker reads the original installed module source and configuration hashes on each new operation; its results identify the source it actually operated.

Native imports use the equipped PHP POSIX extension and Drupal's SQL content storage. GovHub first asks the original Drush for its actual PHP executable, script entrypoint and existing PHP prepend setting. The import preserves the configured PHP launcher and runs the observed Drush entrypoint through the retained early shutdown guard. That guard precedes Drupal's commit-on-shutdown callback, rolls back an unfinished original transaction, and preserves an existing configured PHP prepend. Source/native runtime records are retained with the operation. It requires no separate server or additional provider credential.

## Working in the editor

Open **Content packages** in the existing application.

1. Create a workshare with its receiving engineer, source and destination environments, selected original cutover/recovery plan IDs and recovery instruction.
2. Export one explicit Drupal entity type and UUID. The native module includes its supported recursive graph and assets. A graph archive has one root; dependency order, depth limits, cycle rejection and omitted references come from the installed exporter.
3. Retain the completed export as an archive edition, or add a complete externally supplied archive through the original file intake. Each edition retains its original file ID, byte length and SHA-256. Previous editions remain available.
4. Preview that exact archive on its intended destination. Review the full package text, translations, embedded components, reference graph, assets, native field differences and publication metadata. Missing omitted references and other native module issues remain visible.
5. Compare the baseline and corrected candidate previews. The comparison retains both complete source editions and their original native preview hashes. Each package and asset is marked added, changed, unchanged or excluded.
6. A reviewer or administrator approves the exact preview hash or returns it with a correction reason. Correct the original Drupal source, export its next native archive, and retain that as the next edition. The earlier source, decision and comparison remain intact.
7. Apply the approved edition. The queue preserves that exact archive, review, profile and original import identity. The native worker compares the current target and content with the reviewed state before importing.
8. Read the original import from the destination, then create the source-inclusive handover and complete private workspace backup. The receiving command below composes these into one usable engineer delivery.

### Publication, references and assets

GovHub's graph export explicitly sets the upstream destination-owned draft mode by default: `options.unpublished: true`. New content arrives unpublished, while existing destination publication remains under the destination editor. The module's documented `publication: destination-owned` semantics apply publication status on create only. An externally supplied archive keeps its original publication metadata and bytes. The native preview displays that source together with the current destination translations and actual native plan.

Choose `unpublished: false` only for a source export whose original publication behavior is intended. Use Drupal's original editor and Scheduler workflow for destination publication. An archive's absence of an entity does not delete that entity from the destination.

The module currently exports standard file/image media references as assets and media metadata; those are not standalone full media-entity archives. GovHub preserves the native representation, original asset bytes, references and warnings. Embedded components and translations are shown from the native resolver, not rebuilt by a second content parser.

Native import writes entity data and its original-operation receipt in one database transaction. A rollback can leave unmanaged asset files already copied by the module; the native asset plan and original files remain available for the same-operation continuation. Use the module's documented asset cleanup and the original whole-site recovery workflow for their respective scopes.

## Existing CLI and HTTP interface

Every action uses the original dispatcher. For the local HTTP application, send its existing authenticated request to `POST /api/govhub/packages/<action>`. The common CLI invocation is:

```bash
python workspace/cli.py \
  --workspace /absolute/private-workspace \
  --source-root /absolute/supplied-input \
  --username engineer --password-env GOVHUB_PASSWORD \
  call packages.families.list
```

Keep the password in the existing private environment variable or use `--password-stdin`. Workspace requests and exported records contain no password. Original staff roles apply: operator access for normal actions, reviewer/admin for decisions, admin for a full private backup.

Every mutating package action requires a stable `request_key`. Repeat the exact original input to retrieve its recorded result after an interrupted reply. Use a new key for an intentional new action. The queue result contains the original `operation.id`; native execution is performed by the existing worker:

```bash
python workspace/cli.py \
  --workspace /absolute/private-workspace \
  --source-root /absolute/supplied-input \
  --username engineer --password-env GOVHUB_PASSWORD \
  worker --until-idle
```

Use the existing running application worker or this same workspace's terminal worker. Its original service and native-storage leases coordinate ownership.

### Core requests

Replace the identifiers in these request documents with the existing retained workspace records. Pass a document with `call ACTION --input /absolute/request.json`.

| Action | Required selected records and input | Result |
| --- | --- | --- |
| `packages.families.save` | `request_key,label,environment_id`; optional `source_environment_id,owner,notes,comparison_id,plan_ids,recovery_instruction` | Current `family` |
| `packages.families.get` | `family_id` | Family, complete editions, reviews, comparisons and operation summaries |
| `packages.exports.create` | `request_key,family_id,roots:[{entity_type,uuid}],reason`; optional `options` | Original queued graph operation |
| `packages.editions.create` | `request_key,family_id,label`, plus completed `export_operation_id` or existing `file_id` | Immutable original archive edition |
| `packages.editions.get` | `edition_id` | Complete edition and retained file |
| `packages.previews.create` | `request_key,family_id,edition_id,reason` | Original queued native preview |
| `packages.previews.get` | `preview_operation_id` | Operation summary, original preview file/hash, full preview and unchanged native result |
| `packages.comparisons.create` | `request_key,baseline_preview_operation_id,candidate_preview_operation_id` | Immutable source comparison |
| `packages.comparisons.get` | `comparison_id` | Complete saved comparison |
| `packages.reviews.save` | `request_key,preview_operation_id,preview_sha256,decision,reason`; optional `expected_review_id,comparison_id` | Exact saved decision |
| `packages.imports.create` | `request_key,family_id,edition_id,review_id,reason` | Original queued import |
| `packages.receiving.create` | `request_key,family_id,import_operation_id,reason` | Queued read of the same native import receipt and current content |
| `packages.operations.get` | `operation_id` | Complete original operation, events and retained files |
| `packages.handovers.create` | `request_key,name,package_family_ids,include_sources:true` | Complete original GovHub export |

A family edit includes its existing `family_id` and `expected_revision`. A revised decision includes the latest `expected_review_id` for that preview. Both histories remain immutable.

An export request selects native version 2 content entities explicitly:

```json
{
  "request_key": "selected-workshare/source-export-1",
  "family_id": "EXISTING_FAMILY_ID",
  "roots": [{"entity_type": "node", "uuid": "ORIGINAL_DRUPAL_UUID"}],
  "options": {"package_type": "content_entity", "max_depth": 20, "unpublished": true},
  "reason": "Export the selected source release and its native dependency graph."
}
```

For an externally supplied archive, first use the existing browser file intake or `sources.retain` with a path under the configured supplied-input directory. Keep its returned original file ID, then create the archive edition. No archive is unpacked or rewritten by the workspace intake.

The review hash is **`preview_file.sha256` from `packages.previews.get`**, which identifies the complete original native result file. The display adds authenticated download references for retained assets without changing those original bytes. Approval also binds the exact target/configuration fingerprint and before-content state.

## Original-operation recovery

Open `packages.operations.get` for the original import. The command journal retains the original argv, bridge source, process outcome, stdout/stderr, reviewed archive, native result and receipt. A completed saved native result is adopted directly. If the native process finished but its reply was lost, the same import checks the database receipt before considering another write.

When the original command is incomplete, use the existing `operations.resume` with its exact current `operation_id`, `expected_revision`, a new continuation `request_key` and a reason. The native adapter requires that original child to have a completed or positively reaped process record. It then resumes the same business intent and archive; every attempt retains its own operated bridge source.

The native import holds the site's original import lock and locks the reviewed SQL content identities before its fresh comparison. It uses the installed module's verified archive importer and checks the module's own field diff after import. Only a matching import plus its verified receipt reaches commit. An exception or unfinished shutdown rolls back both together.

A saved original receipt returns `RECOVERED_ORIGINAL_IMPORT`. `packages.receiving.create` returns the actual current content and either `MATCHES_SAVED_IMPORT`, `CONTENT_CHANGED_AFTER_SAVED_IMPORT`, or `NO_COMMITTED_IMPORT_RECEIPT`. Later editor changes remain visible and do not trigger another import.

A changed source archive is a new edition. A changed destination is a new native preview and decision. A whole-site rollback uses the selected original GovHub plans and native backup bytes. Reapplying an older content archive is another upsert and does not restore a whole database or remove content absent from that archive.

## Complete engineer receiving

The maintained application builder takes its full immutable Git source lock, includes all original runtime components and can reopen every packaged member. Build or select the existing complete application ZIP at the integrated source revision; include this component and the complete editor assets in that same package.

Run the complete receiving command after the original imports have reached their retained result and the existing UI/worker has released that workspace's service lease:

```bash
python workspace/content_packages/receiving.py \
  --workspace /absolute/private-workspace \
  --source-root /absolute/supplied-input \
  --username engineer --password-env GOVHUB_PASSWORD \
  --operation-key selected-content-receiving-1 \
  --family-id EXISTING_FAMILY_ID \
  --import-operation-id ORIGINAL_IMPORT_OPERATION_ID \
  --application-zip /absolute/GovHub_Application.zip \
  --application-sha256 ORIGINAL_APPLICATION_ZIP_SHA256 \
  --module-archive /absolute/content_packages-1.3.1.tar.gz \
  --destination /absolute/content-receiving
```

Repeat `--family-id` and `--import-operation-id` for the explicit selected cohort. The receiver verifies that the operated application matches every file in the supplied complete source package, then reads the same native imports through the existing queue. It creates the source-inclusive handover, makes the original private backup, reopens that backup with the original account, and compares the complete selected family, decision and operation records.

The final `GovHub_Content_Packages_Receiving.zip` includes the verified complete application ZIP, original upstream module archive, source-inclusive handover, editable private workspace, actual receiving records, source/version manifests and startup guide. Every ZIP member is read back against its recorded hash. Its `receiving-intent.json` and stable operation key let a later invocation continue the same retained output.

The existing backup preserves the whole private workspace's staff records and native host references. Keep it within the intended engineer handover. Continue native operations on the original equipped Drupal site, or configure and preview a separate explicitly selected destination. The archive, review and import identities remain unchanged when reading a completed original result.

## Source responsibilities

GovHub owns family/edition/decision history, the original queue, exact source retention and complete handover. Content Packages owns its package grammar, field handlers, graph closure, asset handling, native validation, native diff and entity application. Drupal owns entity storage, content/configuration, publication and the underlying transaction.

Relevant original sources:

- [Content Packages project](https://www.drupal.org/project/content_packages)
- [Selected release 1.3.1](https://www.drupal.org/project/content_packages/releases/1.3.1)
- [Original source archive](https://ftp.drupal.org/files/projects/content_packages-1.3.1.tar.gz)
- [Drupal transaction lifecycle](https://api.drupal.org/api/drupal/core!lib!Drupal!Core!Database!Transaction.php/11.x)
- [Drupal SQL content storage](https://api.drupal.org/api/drupal/core!lib!Drupal!Core!Entity!Sql!SqlContentEntityStorage.php/class/SqlContentEntityStorage/11.x)

The new adapter is Commons application source under the parent project license. The separately included upstream Drupal module retains its original GPL license.
