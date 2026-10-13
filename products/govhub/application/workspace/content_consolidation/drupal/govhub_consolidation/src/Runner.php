<?php

namespace Drupal\govhub_consolidation;

use Drupal\Core\Database\Database;
use Drupal\Core\Url;
use Drupal\migrate\Event\MigrateEvents;
use Drupal\migrate\Event\MigrateRollbackEvent;
use Drupal\migrate\Event\MigrateRowDeleteEvent;
use Drupal\migrate\MigrateException;
use Drupal\migrate\MigrateExecutable;
use Drupal\migrate\MigrateMessageInterface;
use Drupal\migrate\Plugin\MigrateIdMapInterface;
use Drupal\migrate\Plugin\MigrationInterface;
use Drupal\migrate\Row;

/**
 * Runs the installed core engine and retains its actual maps and receiving URLs.
 */
final class Runner implements MigrateMessageInterface {

  private static ?self $active = NULL;
  private array $messages = [];
  private array $request;
  private array $state = [];
  private $transaction = NULL;
  private ?MigrationInterface $migration = NULL;
  private int $processed = 0;
  private float $started;
  private array $listeners = [];
  private array $selectedMigrations = [];
  private array $selectedFiles = [];

  public function __construct(array $request) {
    $this->request = $request;
    $this->started = microtime(TRUE);
  }

  public function display($message, $type = 'status') {
    $this->messages[] = ['message' => (string) $message, 'type' => $type, 'at' => gmdate(DATE_ATOM)];
  }

  private function journal(): void {
    $this->state['updated_at'] = gmdate(DATE_ATOM);
    \Drupal::keyValue('govhub_consolidation.operations')->set($this->request['operation_id'], $this->state);
  }

  private function event(string $kind, array $details = []): void {
    $event = ['at' => gmdate(DATE_ATOM), 'kind' => $kind] + $details;
    $path = $this->request['output_dir'] . '/native-events.ndjson';
    $stream = fopen($path, 'ab');
    if (!$stream || fwrite($stream, json_encode($event, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) . "\n") === FALSE) {
      throw new \RuntimeException('Unable to retain the original native event.');
    }
    fflush($stream);
    if (function_exists('fsync')) {
      fsync($stream);
    }
    fclose($stream);
  }

  private function commitRow(): void {
    // Core MAP_SAVE fires before the SQL upsert. Release this transaction at
    // the next PRE_ROW_SAVE or POST_IMPORT, after that upsert has completed.
    $this->transaction = NULL;
  }

  private function rollbackRow(): void {
    if ($this->transaction !== NULL) {
      $this->transaction->rollBack();
      $this->transaction = NULL;
    }
  }

  private function installListeners(MigrationInterface $migration): void {
    $this->migration = $migration;
    $dispatcher = \Drupal::service('event_dispatcher');
    $pre = function ($event) use ($migration): void {
      if ($event->getMigration()->id() !== $migration->id()) {
        return;
      }
      $this->commitRow();
      self::admitEntity($migration, $event->getRow());
      $this->transaction = Database::getConnection()->startTransaction();
      $this->event('native_row_save', ['migration_id' => $migration->id(),
        'source_ids' => array_values($event->getRow()->getSourceIdValues()),
        'processed_destination' => $event->getRow()->getDestination()]);
    };
    $map = function ($event) use ($migration): void {
      if ($event->getMap() !== $migration->getIdMap()) {
        return;
      }
      $fields = $event->getFields();
      if ((int) ($fields['source_row_status'] ?? -1) !== MigrateIdMapInterface::STATUS_IMPORTED) {
        $this->rollbackRow();
      }
      ++$this->processed;
      $this->event('native_map_save', ['migration_id' => $migration->id(), 'fields' => $fields]);
      if ($this->shouldPause()) {
        $migration->interruptMigration(MigrationInterface::RESULT_INCOMPLETE);
      }
    };
    $post = function ($event) use ($migration): void {
      if ($event->getMigration()->id() === $migration->id()) {
        $this->commitRow();
      }
    };
    foreach ([[MigrateEvents::PRE_ROW_SAVE, $pre], [MigrateEvents::MAP_SAVE, $map],
      [MigrateEvents::POST_IMPORT, $post]] as [$name, $listener]) {
      $dispatcher->addListener($name, $listener);
      $this->listeners[] = [$name, $listener];
    }
  }

  private function removeListeners(): void {
    foreach ($this->listeners as [$name, $listener]) {
      \Drupal::service('event_dispatcher')->removeListener($name, $listener);
    }
    $this->listeners = [];
    $this->migration = NULL;
  }

  private function shouldPause(): bool {
    return (!empty($this->request['row_limit']) && $this->processed >= $this->request['row_limit'])
      || microtime(TRUE) - $this->started >= ($this->request['time_budget_seconds'] ?? 480);
  }

  private static function entityType(MigrationInterface $migration): string {
    $plugin = $migration->getDestinationConfiguration()['plugin'];
    return substr($plugin, strlen('entity:'));
  }

  private static function identityRow(MigrationInterface $migration, Row $source): Row {
    $type = \Drupal::entityTypeManager()->getDefinition(self::entityType($migration));
    $process = $migration->getProcess();
    $needed = [];
    $visiting = [];
    $add = function (string $property) use (&$add, &$needed, &$visiting, $process): void {
      $base = explode('/', $property)[0];
      if (isset($needed[$base]) || !isset($process[$base])) {
        return;
      }
      if (isset($visiting[$base])) {
        throw new MigrateException('Circular native destination identity process.');
      }
      $visiting[$base] = TRUE;
      foreach ($process[$base] as $step) {
        if (($step['plugin'] ?? '') === 'file_copy') {
          throw new MigrateException('An entity identity cannot depend on copying a file.');
        }
        foreach ((array) ($step['source'] ?? []) as $value) {
          if (is_string($value) && str_starts_with($value, '@') && !str_starts_with($value, '@@')) {
            $add(substr($value, 1));
          }
        }
      }
      unset($visiting[$base]);
      $needed[$base] = $process[$base];
    };
    foreach (['id', 'uuid', 'bundle', 'langcode'] as $key) {
      if ($property = $type->getKey($key)) {
        $add($property);
      }
    }
    $row = $source->cloneWithoutDestination();
    $message = self::$active ?? new self([]);
    (new MigrateExecutable($migration, $message))->processRow($row, $needed);
    return $row;
  }

  private static function resolveEntity(MigrationInterface $migration, Row $row, bool $prefer_map = TRUE) {
    $entity_type = self::entityType($migration);
    $type = \Drupal::entityTypeManager()->getDefinition($entity_type);
    $storage = \Drupal::entityTypeManager()->getStorage($entity_type);
    $id_key = $type->getKey('id');
    $id = $row->getDestinationProperty($id_key);
    if ($prefer_map) {
      $destinations = $migration->getIdMap()->lookupDestinationIds($row->getSourceIdValues());
      if ($destinations && $mapped = reset($destinations)) {
        $mapped_id = reset($mapped);
        if ($id !== NULL && (string) $id !== '' && (string) $id !== (string) $mapped_id) {
          throw new MigrateException('The selected entity ID differs from this original source row’s native map.');
        }
        $id = $mapped_id;
      }
    }
    $entity = $id !== NULL && (string) $id !== '' ? $storage->load($id) : NULL;
    if ($uuid_key = $type->getKey('uuid')) {
      $uuid = $row->getDestinationProperty($uuid_key);
      if ($uuid) {
        $matches = $storage->loadByProperties([$uuid_key => $uuid]);
        $by_uuid = $matches ? reset($matches) : NULL;
        if ($entity && $by_uuid && (string) $entity->id() !== (string) $by_uuid->id()) {
          throw new MigrateException('The selected native ID and UUID identify different entities.');
        }
        if ($entity && $entity->uuid() !== $uuid) {
          throw new MigrateException('The mapped entity UUID differs from the selected source UUID.');
        }
        $entity = $entity ?: $by_uuid;
      }
    }
    if ($entity) {
      $bundle_key = $type->getKey('bundle');
      $bundle = $bundle_key ? $row->getDestinationProperty($bundle_key) : NULL;
      $bundle = $bundle ?: ($migration->getDestinationConfiguration()['default_bundle'] ?? NULL);
      if ($bundle && $entity->bundle() !== $bundle) {
        throw new MigrateException('The selected existing entity belongs to another bundle.');
      }
    }
    return $entity;
  }

  public static function admitEntity(MigrationInterface $migration, Row $row): void {
    $record = Registry::get($migration->id());
    $entity = self::resolveEntity($migration, $row);
    if (!$entity) {
      return;
    }
    $type = $entity->getEntityType();
    $mapped = $migration->getIdMap()->lookupDestinationIds($row->getSourceIdValues());
    $mapped_ids = $mapped ? reset($mapped) : [];
    $owned = $mapped_ids && (string) reset($mapped_ids) === (string) $entity->id();
    $new_translation = FALSE;
    if (!empty($record['definition']['destination']['translations']) && $type->getKey('langcode')) {
      $langcode = $row->getDestinationProperty($type->getKey('langcode'));
      if ($langcode && !$entity->hasTranslation($langcode)) {
        foreach ($record['definition']['migration_dependencies']['required'] ?? [] as $dependency_id) {
          $dependency = \Drupal::service('plugin.manager.migration')->createInstance($dependency_id);
          if (self::entityType($dependency) !== $type->id()) {
            continue;
          }
          $destination_keys = array_keys($dependency->getDestinationPlugin()->getIds());
          foreach ($entity->getTranslationLanguages() as $language) {
            $destination_values = [$destination_keys[0] => $entity->id()];
            if (count($destination_keys) > 1) {
              $destination_values[$destination_keys[1]] = $language->getId();
            }
            if ($dependency->getIdMap()->getRowByDestination($destination_values)) {
              $new_translation = TRUE;
              break 2;
            }
          }
        }
      }
    }
    if (!$owned && !$new_translation && $record['existing_target_policy'] === 'CREATE_ONLY') {
      throw new MigrateException('CREATE_ONLY found an existing target outside this row’s original native map; select an explicit existing-target mapping for this source row.');
    }
    if (!$owned && !$new_translation && $record['existing_target_policy'] === 'REVIEWED_FIELD_UPDATE') {
      if (empty($record['review']['backup_ref']['sha256']) || empty($record['definition']['destination']['overwrite_properties'])) {
        throw new MigrateException('The existing-field update has no selected native recovery point or overwrite fields.');
      }
    }
    // Core entity destinations load by native ID, not UUID. Preserve the
    // explicitly resolved UUID by supplying the actual corresponding ID.
    $row->setDestinationProperty($type->getKey('id'), $entity->id());
  }


  /**
   * Resolve one declared copy destination through the original core row engine.
   *
   * Only the selected helper's dependency closure is evaluated. A copy in that
   * closure would change bytes before admission and is rejected.
   */
  private static function fileCopyDestination(MigrationInterface $migration, Row $source, string $reference) {
    if (!str_starts_with($reference, '@') || str_starts_with($reference, '@@')) {
      return $source->get($reference);
    }
    $process = $migration->getProcess();
    $needed = [];
    $visiting = [];
    $add = function (string $reference) use (&$add, &$needed, &$visiting, $process): void {
      $matches = [];
      foreach (array_keys($process) as $property) {
        if ($property === $reference || str_starts_with($reference, $property . '/')
          || str_starts_with($property, $reference . '/')) {
          $matches[] = $property;
        }
      }
      if (!$matches) {
        throw new MigrateException('The selected file URI helper has no declared native destination process: ' . $reference);
      }
      foreach ($matches as $property) {
        if (array_key_exists($property, $needed)) {
          continue;
        }
        if (isset($visiting[$property])) {
          throw new MigrateException('The selected file URI helper contains a native process dependency cycle.');
        }
        $visiting[$property] = TRUE;
        foreach ($process[$property] as $step) {
          if (($step['plugin'] ?? '') === 'file_copy') {
            throw new MigrateException('A file URI helper cannot depend on copying or moving bytes before ownership validation.');
          }
          foreach ((array) ($step['source'] ?? []) as $input) {
            if (is_string($input) && str_starts_with($input, '@') && !str_starts_with($input, '@@')) {
              $add(substr($input, 1));
            }
          }
        }
        unset($visiting[$property]);
        $needed[$property] = $process[$property];
      }
    };
    $add(substr($reference, 1));
    $prepared = $source->cloneWithoutDestination();
    $message = self::$active ?? new self([]);
    (new MigrateExecutable($migration, $message))->processRow($prepared, $needed);
    return $prepared->get($reference);
  }

  public static function verifyFileCopy(MigrationInterface $migration, Row $row, array $binding): void {
    if (Registry::get($migration->id())['existing_target_policy'] === 'REUSE_SELECTED') {
      return;
    }
    foreach ($migration->getProcess() as $property => $steps) {
      foreach ($steps as $step) {
        if (($step['plugin'] ?? '') !== 'file_copy') {
          continue;
        }
        $name = $step['source'][1];
        if (!is_string($name) || $name === '' || $name === '@' || str_contains($name, "\0")) {
          throw new MigrateException('file_copy destination must name a selected URI source property or declared @helper.');
        }
        $uri = self::fileCopyDestination($migration, $row, $name);
        if (!is_string($uri) || !preg_match('#^(public|private)://[^/].+$#D', $uri)
          || in_array('..', explode('/', substr($uri, strpos($uri, '://') + 3)), TRUE)
          || str_contains($uri, "\0") || str_contains($uri, '\\')) {
          throw new MigrateException('Select an ordinary public:// or private:// destination URI for this bound original file.');
        }
        $path = \Drupal::service('file_system')->realpath($uri);
        if (!$path || !file_exists($path) || hash_file('sha256', $path) === $binding['sha256']) {
          continue;
        }
        if (($step['file_exists'] ?? '') !== 'replace') {
          throw new MigrateException('The selected target URI already contains different bytes; choose the reviewed file replacement or a distinct URI.');
        }
        $destinations = $migration->getIdMap()->lookupDestinationIds($row->getSourceIdValues());
        $destination_ids = $destinations ? reset($destinations) : [];
        $entity = $destination_ids ? \Drupal::entityTypeManager()->getStorage('file')->load(reset($destination_ids)) : NULL;
        $record = Registry::get($migration->id());
        $owned = $entity && $entity->getFileUri() === $uri;
        $reviewed = $record['existing_target_policy'] === 'REVIEWED_FIELD_UPDATE'
          && !empty($record['review']['backup_ref']['sha256']);
        if (!$owned && !$reviewed) {
          throw new MigrateException('This different target file is outside the original native map and reviewed replacement scope.');
        }
        // The approved target backup is retained by the original workspace.
        self::$active?->event('native_file_replacement', ['migration_id' => $migration->id(),
          'source_ids' => array_values($row->getSourceIdValues()), 'uri' => $uri,
          'before_sha256' => hash_file('sha256', $path), 'after_sha256' => $binding['sha256']]);
      }
    }
  }

  public static function reuseSelected(MigrationInterface $migration, Row $row, array $record): bool {
    $transaction = Database::getConnection()->startTransaction();
    try {
      $identity = self::identityRow($migration, $row);
      $entity = self::resolveEntity($migration, $identity);
      if (!$entity) {
        throw new MigrateException('REUSE_SELECTED requires an existing selected entity or an existing original map.');
      }
      $ids = [$entity->id()];
      if (!empty($record['definition']['destination']['translations'])) {
        $language_key = $entity->getEntityType()->getKey('langcode');
        $langcode = $identity->getDestinationProperty($language_key);
        if (!$langcode || !$entity->hasTranslation($langcode)) {
          throw new MigrateException('The selected native translation does not exist.');
        }
        $ids[] = $langcode;
      }
      $old = $migration->getIdMap()->getRowBySource($row->getSourceIdValues());
      if (!$old || $old['hash'] !== $row->getHash()
        || (int) $old['source_row_status'] !== MigrateIdMapInterface::STATUS_IMPORTED) {
        $migration->getIdMap()->saveIdMapping($row, $ids, MigrateIdMapInterface::STATUS_IMPORTED, MigrateIdMapInterface::ROLLBACK_PRESERVE);
      }
      self::$active?->event('native_selected_entity_reused', [
        'migration_id' => $migration->id(), 'source_ids' => array_values($row->getSourceIdValues()),
        'destination_ids' => array_map('strval', $ids), 'uuid' => $entity->uuid()]);
    }
    catch (\Throwable $error) {
      $transaction->rollBack();
      unset($transaction);
      $migration->getIdMap()->saveIdMapping($row, [], MigrateIdMapInterface::STATUS_FAILED);
      $migration->getIdMap()->saveMessage($row->getSourceIdValues(), $error->getMessage(), MigrationInterface::MESSAGE_ERROR);
      self::$active?->display($error->getMessage(), 'error');
    }
    return FALSE;
  }

  private function target(MigrationInterface $migration, array $source_ids, array $destination_ids): array {
    $type_id = self::entityType($migration);
    $type = \Drupal::entityTypeManager()->getDefinition($type_id);
    $keys = array_keys($migration->getDestinationPlugin()->getIds());
    $native_ids = array_combine($keys, array_values($destination_ids));
    $result = ['migration_id' => $migration->id(), 'source_ids' => array_values($source_ids),
      'destination_ids' => array_map('strval', array_values($destination_ids)),
      'destination_id_order' => $keys, 'entity_type' => $type_id, 'exists' => FALSE];
    $entity = \Drupal::entityTypeManager()->getStorage($type_id)->load(reset($destination_ids));
    if (!$entity) {
      return $result;
    }
    $selected_definition = $this->selectedMigrations[$migration->id()] ?? Registry::get($migration->id());
    $langcode = $native_ids[$type->getKey('langcode')] ?? $selected_definition['receiving']['langcode'] ?? $entity->language()->getId();
    if ($langcode && $entity->isTranslatable()) {
      if (!$entity->hasTranslation($langcode)) {
        return $result + ['entity_exists' => TRUE, 'missing_translation' => $langcode];
      }
      $entity = $entity->getTranslation($langcode);
    }
    $result += ['uuid' => $entity->uuid(), 'bundle' => $entity->bundle(), 'langcode' => $entity->language()->getId()];
    $result['exists'] = TRUE;
    $result['native_fields'] = [];
    $result['relationships'] = [];
    $receiving = $selected_definition['receiving'] ?? [];
    foreach ($receiving['fields'] ?? [] as $field) {
      if (!$entity->hasField($field)) {
        $result['field_errors'][$field] = 'The installed entity has no such field.';
        continue;
      }
      $items = $entity->get($field);
      $result['native_fields'][$field] = $items->getValue();
      if (method_exists($items, 'referencedEntities')) {
        $references = [];
        foreach ($items->referencedEntities() as $delta => $reference) {
          $references[] = ['delta' => $delta, 'entity_type' => $reference->getEntityTypeId(),
            'id' => (string) $reference->id(), 'uuid' => $reference->uuid(), 'bundle' => $reference->bundle()];
        }
        $result['relationships'][$field] = $references;
      }
    }
    if (method_exists($entity, 'getFileUri')) {
      $uri = $entity->getFileUri();
      $file = \Drupal::service('file_system')->realpath($uri);
      $result['file'] = ['uri' => $uri, 'filename' => $entity->getFilename(),
        'url' => \Drupal::service('file_url_generator')->generateAbsoluteString($uri),
        'exists' => $file && is_file($file)];
      if ($result['file']['exists']) {
        $result['file'] += ['bytes' => filesize($file), 'sha256' => hash_file('sha256', $file)];
      }
      $record = Registry::get($migration->id());
      foreach ($selected_definition['source']['rows'] as $source) {
        $original = new Row($source, Registry::orderedIds($selected_definition['source']));
        if (array_values($original->getSourceIdValues()) === array_values($source_ids) && isset($source['_govhub_file_id'])) {
          $binding = $this->selectedFiles[$source['_govhub_file_id']] ?? $record['files'][$source['_govhub_file_id']];
          $result['file']['source_file_id'] = $source['_govhub_file_id'];
          $result['file']['source_sha256'] = $binding['sha256'];
          $result['file']['source_matches'] = ($result['file']['sha256'] ?? NULL) === $binding['sha256'];
          break;
        }
      }
    }
    $resource = \Drupal::service('jsonapi.resource_type.repository')->get($type_id, $entity->bundle());
    if (!$resource || $resource->isInternal() || !$resource->isLocatable() || !$entity->uuid()) {
      $result['jsonapi'] = ['available' => FALSE, 'reason' => 'The installed JSON:API resource is not externally locatable.'];
    }
    else {
      $public_fields = [];
      foreach ($receiving['fields'] ?? [] as $field) {
        if ($resource->hasField($field) && $resource->isFieldEnabled($field)) {
          $public_fields[$field] = $resource->getPublicName($field);
        }
        else {
          $result['field_errors'][$field] = 'The installed JSON:API resource does not expose this field.';
        }
      }
      $language_field = $type->getKey('langcode');
      if ($language_field && $resource->hasField($language_field) && $resource->isFieldEnabled($language_field)) {
        $public_fields[$language_field] = $resource->getPublicName($language_field);
      }
      $url = Url::fromRoute('jsonapi.' . $resource->getTypeName() . '.individual',
        ['entity' => $entity->uuid()], ['absolute' => TRUE, 'language' => $entity->language()]);
      if ($public_fields) {
        $url->setOption('query', ['fields' => [$resource->getTypeName() => implode(',', array_values($public_fields))]]);
      }
      $result['jsonapi'] = ['available' => TRUE, 'type' => $resource->getTypeName(),
        'uuid' => $entity->uuid(), 'url' => $url->toString(), 'field_names' => $public_fields,
        'langcode_field' => $language_field ? ($public_fields[$language_field] ?? NULL) : NULL];
    }
    return $result;
  }


  private function routes(array $plan): array {
    $results = [];
    foreach ($plan['routes'] ?? [] as $route) {
      $item = ['mapping' => $route, 'kind' => 'http'];
      $id = $route['migration_id'] ?? '';
      if ($id && Registry::store()->get($id)) {
        $migration = \Drupal::service('plugin.manager.migration')->createInstance($id);
        $keys = array_keys(Registry::orderedIds($this->selectedMigrations[$id]['source']));
        if (count($keys) === count($route['source_ids'] ?? [])) {
          $maps = $migration->getIdMap()->lookupDestinationIds(array_combine($keys, $route['source_ids']));
          $destination = $maps ? reset($maps) : [];
          if ($destination && self::entityType($migration) === 'path_alias') {
            $alias = \Drupal::entityTypeManager()->getStorage('path_alias')->load(reset($destination));
            if ($alias) {
              $item += ['native_alias' => $alias->getAlias(), 'native_path' => $alias->getPath(),
                'native_langcode' => $alias->language()->getId(), 'native_uuid' => $alias->uuid()];
              $item['kind'] = 'alias';
            }
          }
          elseif ($destination && self::entityType($migration) === 'redirect') {
            $item['kind'] = 'redirect';
          }
        }
      }
      $results[] = $item;
    }
    return $results;
  }

  private function observe(array $migrations): array {
    $observations = ['migrations' => [], 'targets' => [], 'counts' => [
      'selected_rows' => 0, 'mapped_rows' => 0, 'failed_rows' => 0, 'ignored_rows' => 0, 'missing_rows' => 0]];
    foreach ($migrations as $id => $definition) {
      if (!Registry::store()->get($id)) {
        $observations['migrations'][] = ['migration_id' => $id, 'registered' => FALSE, 'rows' => []];
        $observations['counts']['selected_rows'] += count($definition['source']['rows'] ?? []);
        $observations['counts']['missing_rows'] += count($definition['source']['rows'] ?? []);
        continue;
      }
      $migration = \Drupal::service('plugin.manager.migration')->createInstance($id);
      $record = Registry::get($id);
      $map = $migration->getIdMap();
      $selected = [];
      foreach ($definition['source']['rows'] ?? [] as $source) {
        $row = new Row($source, Registry::orderedIds($definition['source']));
        $selected[json_encode(array_values($row->getSourceIdValues()), JSON_THROW_ON_ERROR)] = TRUE;
      }
      $rows = [];
      $seen = [];
      $map->rewind();
      while ($map->valid()) {
        $source_ids = $map->currentSource();
        $destination_ids = $map->currentDestination();
        $native = $map->getRowBySource($source_ids);
        $key = json_encode(array_values($source_ids), JSON_THROW_ON_ERROR);
        $is_selected = isset($selected[$key]);
        $entry = ['source_ids' => array_map('strval', array_values($source_ids)),
          'destination_ids' => array_map('strval', array_values($destination_ids)),
          'selected_source' => $is_selected, 'native_map' => $native];
        $rows[] = $entry;
        $seen[$key] = TRUE;
        if ($is_selected) {
          ++$observations['counts']['selected_rows'];
          $status = (int) ($native['source_row_status'] ?? -1);
          if ($status === MigrateIdMapInterface::STATUS_FAILED) {
            ++$observations['counts']['failed_rows'];
          }
          elseif ($status === MigrateIdMapInterface::STATUS_IGNORED) {
            ++$observations['counts']['ignored_rows'];
          }
          elseif ($destination_ids && reset($destination_ids) !== NULL) {
            ++$observations['counts']['mapped_rows'];
            $observations['targets'][] = $this->target($migration, $source_ids, $destination_ids);
          }
          else {
            ++$observations['counts']['missing_rows'];
          }
        }
        $map->next();
      }
      foreach (array_diff_key($selected, $seen) as $key => $_) {
        ++$observations['counts']['selected_rows'];
        ++$observations['counts']['missing_rows'];
        $rows[] = ['source_ids' => json_decode($key, TRUE, 512, JSON_THROW_ON_ERROR),
          'destination_ids' => [], 'selected_source' => TRUE, 'native_map' => NULL];
      }
      $messages = [];
      foreach ($map->getMessages() as $message) {
        $messages[] = (array) $message;
      }
      $observations['migrations'][] = ['migration_id' => $id, 'registered' => TRUE,
        'plan_id' => $record['plan_id'], 'edition_id' => $record['edition_id'],
        'source_id_order' => array_keys(Registry::orderedIds($record['source'])),
        'destination_id_order' => array_keys($migration->getDestinationPlugin()->getIds()),
        'status' => $migration->getStatus(), 'status_label' => (string) $migration->getStatusLabel(),
        'counts' => ['processed' => $map->processedCount(), 'imported' => $map->importedCount(),
          'needs_update' => $map->updateCount(), 'failed' => $map->errorCount(), 'messages' => $map->messageCount()],
        'rows' => $rows, 'messages' => $messages];
    }
    return $observations;
  }

  private function rollback(array $migrations): bool {
    $selection = $this->request['selection'] ?? [];
    if (!$selection) {
      throw new \InvalidArgumentException('Selective rollback requires the original migration ID and exact source IDs for each selected map row.');
    }
    $selected = [];
    foreach ($selection as $item) {
      $id = $item['migration_id'] ?? '';
      if (!isset($migrations[$id]) || !isset($item['source_ids']) || !is_array($item['source_ids'])) {
        throw new \InvalidArgumentException('Rollback selection is outside this retained plan.');
      }
      $ids = Registry::orderedIds($migrations[$id]['source']);
      if (count($ids) !== count($item['source_ids'])) {
        throw new \InvalidArgumentException('Rollback source IDs must retain their original compound order.');
      }
      foreach ($item['source_ids'] as $value) {
        if (!is_string($value)) {
          throw new \InvalidArgumentException('Rollback source IDs must be exact strings.');
        }
      }
      $selected[$id][] = array_combine(array_keys($ids), $item['source_ids']);
    }
    $dispatcher = \Drupal::service('event_dispatcher');
    foreach (array_reverse($migrations, TRUE) as $id => $_) {
      if (empty($selected[$id])) {
        continue;
      }
      $migration = \Drupal::service('plugin.manager.migration')->createInstance($id);
      $this->ready($migration);
      $this->state['current_migration'] = $id;
      $this->journal();
      $migration->setStatus(MigrationInterface::STATUS_ROLLING_BACK);
      $dispatcher->dispatch(new MigrateRollbackEvent($migration), MigrateEvents::PRE_ROLLBACK);
      try {
        $map = $migration->getIdMap();
        foreach ($selected[$id] as $source_ids) {
          $key = $id . ':' . hash('sha256', json_encode(array_values($source_ids), JSON_THROW_ON_ERROR));
          if (isset($this->state['rollback'][$key])) {
            continue;
          }
          $native = $map->getRowBySource($source_ids);
          $destinations = $map->lookupDestinationIds($source_ids);
          $destination_ids = $destinations ? reset($destinations) : [];
          $entry = ['migration_id' => $id, 'source_ids' => array_values($source_ids),
            'destination_ids' => array_map('strval', array_values($destination_ids)), 'native_map_before' => $native];
          if (!$native) {
            $entry['action'] = 'ALREADY_UNMAPPED';
          }
          else {
            $transaction = Database::getConnection()->startTransaction();
            try {
              if ($destination_ids) {
                $entry['before'] = $this->target($migration, $source_ids, $destination_ids);
                if ((int) ($native['rollback_action'] ?? MigrateIdMapInterface::ROLLBACK_DELETE) === MigrateIdMapInterface::ROLLBACK_DELETE) {
                  $dispatcher->dispatch(new MigrateRowDeleteEvent($migration, $destination_ids), MigrateEvents::PRE_ROW_DELETE);
                  $migration->getDestinationPlugin()->rollback($destination_ids);
                  $dispatcher->dispatch(new MigrateRowDeleteEvent($migration, $destination_ids), MigrateEvents::POST_ROW_DELETE);
                  $entry['action'] = 'DELETE';
                }
                else {
                  $entry['action'] = 'PRESERVE';
                }
              }
              else {
                $entry['action'] = 'REMOVE_FAILED_MAP';
              }
              $map->delete($source_ids);
              if ($destination_ids) {
                \Drupal::entityTypeManager()->getStorage(self::entityType($migration))->resetCache();
                $entry['after'] = $this->target($migration, $source_ids, $destination_ids);
              }
              $this->state['rollback'][$key] = $entry;
              $this->journal();
              unset($transaction);
            }
            catch (\Throwable $error) {
              $transaction->rollBack();
              unset($transaction);
              throw $error;
            }
          }
          $this->state['rollback'][$key] = $entry;
          $this->journal();
          $this->event('native_selected_rollback', $entry);
          ++$this->processed;
          if ($this->shouldPause()) {
            return FALSE;
          }
        }
      }
      finally {
        $migration->setStatus(MigrationInterface::STATUS_IDLE);
        $dispatcher->dispatch(new MigrateRollbackEvent($migration), MigrateEvents::POST_ROLLBACK);
      }
    }
    return TRUE;
  }

  private function ready(MigrationInterface $migration): void {
    if ($migration->getStatus() === MigrationInterface::STATUS_IDLE) {
      return;
    }
    if (!empty($this->request['resume_reconciled']) && ($this->state['current_migration'] ?? '') === $migration->id()
      && ($this->state['operation_id'] ?? '') === $this->request['operation_id']) {
      $this->event('native_status_reconciled', ['migration_id' => $migration->id(),
        'previous_status' => $migration->getStatus(), 'owned_process_reaped' => TRUE]);
      $migration->setStatus(MigrationInterface::STATUS_IDLE);
      return;
    }
    throw new \RuntimeException('The original native migration is active: ' . $migration->id() . ' (' . $migration->getStatusLabel() . ').');
  }

  public function run(): array {
    $request = $this->request;
    $raw = file_get_contents($request['plan_path']);
    if ($raw === FALSE || hash('sha256', $raw) !== $request['plan_sha256']) {
      throw new \InvalidArgumentException('The frozen native plan bytes changed.');
    }
    $plan = json_decode($raw, TRUE, 512, JSON_THROW_ON_ERROR);
    $migrations = Registry::validate($plan);
    $this->selectedMigrations = $migrations;
    $this->selectedFiles = array_column($request['files'] ?? [], NULL, 'file_id');
    $action = $request['action'];
    if (!in_array($action, ['import', 'rollback', 'status', 'receive'], TRUE)) {
      throw new \InvalidArgumentException('Choose an original content import, rollback, status or receiving action.');
    }
    $intent = ['operation_id' => $request['operation_id'], 'action' => $action,
      'plan_sha256' => $request['plan_sha256'], 'family_id' => $plan['family_id'],
      'selection' => $request['selection'] ?? []];
    $intent_hash = hash('sha256', json_encode($intent, JSON_THROW_ON_ERROR));
    $previous = \Drupal::keyValue('govhub_consolidation.operations')->get($request['operation_id']);
    if ($previous && ($previous['intent_sha256'] ?? '') !== $intent_hash) {
      throw new \InvalidArgumentException('The original native operation belongs to another plan or selection.');
    }
    $this->state = $previous ?: ['operation_id' => $request['operation_id'], 'intent_sha256' => $intent_hash,
      'plan_id' => $plan['id'], 'started_at' => gmdate(DATE_ATOM), 'rollback' => []];
    $lock = NULL;
    $complete = TRUE;
    $native_results = [];
    $error = NULL;
    self::$active = $this;
    try {
      if (in_array($action, ['import', 'rollback'], TRUE)) {
        $site_path = \Drupal::getContainer()->getParameter('site.path');
        $lock_path = sys_get_temp_dir() . '/govhub-content-' . hash('sha256', \Drupal::root() . '/' . $site_path) . '.lock';
        $lock = fopen($lock_path, 'c+');
        if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
          throw new \RuntimeException('This configured native Drupal site is already running a content operation.');
        }
        $this->state['phase'] = 'running';
        $this->state['pid'] = getmypid();
        $this->journal();
        if ($action === 'import') {
          $previous_definitions = [];
          foreach ($migrations as $id => $_) {
            $previous_definitions[$id] = Registry::store()->get($id);
          }
          Registry::register($plan, $request['plan_sha256'], $request['files'] ?? []);
          foreach ($migrations as $id => $definition) {
            $migration = \Drupal::service('plugin.manager.migration')->createInstance($id);
            $this->ready($migration);
            $this->state['current_migration'] = $id;
            $this->journal();
            $old = $previous_definitions[$id];
            $changed_mapping = $old && ($old['definition']['process'] !== Registry::get($id)['definition']['process']
              || $old['definition']['destination'] !== $definition['destination']
              || $old['existing_target_policy'] !== ($definition['existing_target_policy'] ?? 'CREATE_ONLY'));
            foreach ($definition['source']['rows'] as $source) {
              $row = new Row($source, Registry::orderedIds($definition['source']));
              $existing = $migration->getIdMap()->getRowBySource($row->getSourceIdValues());
              if ($existing && ($changed_mapping || (int) $existing['source_row_status'] === MigrateIdMapInterface::STATUS_FAILED)) {
                $migration->getIdMap()->setUpdate($row->getSourceIdValues());
              }
            }
            $this->installListeners($migration);
            try {
              $code = (new MigrateExecutable($migration, $this))->import();
              $this->commitRow();
            }
            finally {
              $this->removeListeners();
            }
            $native_results[] = ['migration_id' => $id, 'result_code' => $code,
              'status' => $migration->getStatus(), 'status_label' => (string) $migration->getStatusLabel()];
            $this->event('native_migration_result', end($native_results));
            if ($code === MigrationInterface::RESULT_INCOMPLETE || $code === MigrationInterface::RESULT_STOPPED) {
              $complete = FALSE;
              break;
            }
            if ($code !== MigrationInterface::RESULT_COMPLETED) {
              throw new \RuntimeException('The installed core Migrate engine returned ' . $code . ' for ' . $id . '.');
            }
          }
        }
        else {
          $complete = $this->rollback($migrations);
        }
      }
    }
    catch (\Throwable $exception) {
      $this->rollbackRow();
      $error = ['class' => get_class($exception), 'message' => $exception->getMessage()];
      $this->display($exception->getMessage(), 'error');
    }
    finally {
      $this->removeListeners();
      $this->commitRow();
      if ($lock) {
        flock($lock, LOCK_UN);
        fclose($lock);
      }
      self::$active = NULL;
    }
    $observations = $this->observe($migrations);
    $unresolved = $observations['counts']['failed_rows'] + $observations['counts']['ignored_rows'] + $observations['counts']['missing_rows'];
    $status = $error ? 'failed' : (!$complete ? 'incomplete' : ((in_array($action, ['import', 'receive'], TRUE) && $unresolved) ? 'failed' : 'complete'));
    $result = ['schema' => 'govhub.content-consolidation.drupal-result.v1', 'module_version' => Registry::VERSION,
      'operation_id' => $request['operation_id'], 'action' => $action, 'plan_id' => $plan['id'],
      'family_id' => $plan['family_id'], 'edition_id' => $plan['edition_id'], 'plan_sha256' => $request['plan_sha256'],
      'drupal_version' => \Drupal::VERSION, 'observed_at' => gmdate(DATE_ATOM), 'status' => $status,
      'native_results' => $native_results, 'messages' => $this->messages, 'error' => $error,
      'rollback' => array_values($this->state['rollback'] ?? []), 'route_observations' => $this->routes($plan)] + $observations;
    if (in_array($action, ['import', 'rollback'], TRUE)) {
      $this->state['phase'] = $status;
      $this->state['last_result'] = $result;
      $this->journal();
    }
    return $result;
  }

}
