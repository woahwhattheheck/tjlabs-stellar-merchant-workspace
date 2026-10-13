<?php

namespace Drupal\govhub_consolidation;

use Drupal\migrate\Plugin\Migration;

/**
 * Retains the selected source separately from the native row hash inputs.
 */
final class Registry {

  public const SCHEMA = 'govhub.content-consolidation.drupal-plan.v1';
  public const VERSION = '1.0.0';

  public static function store() {
    return \Drupal::keyValue('govhub_consolidation.migrations');
  }

  public static function get(string $id): array {
    $record = self::store()->get($id);
    if (!is_array($record)) {
      throw new \InvalidArgumentException("No retained content migration: $id");
    }
    return $record;
  }

  public static function definitions(): array {
    $result = [];
    foreach (self::store()->getAll() as $id => $record) {
      $result[$id] = $record['definition'];
    }
    return $result;
  }

  public static function orderedIds(array $source): array {
    $ids = $source['ids'] ?? [];
    $order = $source['id_order'] ?? array_keys($ids);
    if (!$ids || !is_array($order) || count($order) !== count($ids)
      || count(array_unique($order)) !== count($order)
      || array_diff($order, array_keys($ids))) {
      throw new \InvalidArgumentException('source.id_order must name each original source ID exactly once.');
    }
    $ordered = [];
    foreach ($order as $key) {
      $definition = $ids[$key];
      if (($definition['type'] ?? '') !== 'string') {
        throw new \InvalidArgumentException("Source ID $key must use the native string schema.");
      }
      $ordered[$key] = $definition;
    }
    return $ordered;
  }


  public static function orderedProcess(array $process, ?array $order = NULL): array {
    $order ??= array_keys($process);
    if (count($order) !== count($process) || count(array_unique($order)) !== count($order)
      || array_diff($order, array_keys($process))) {
      throw new \InvalidArgumentException('process_order must name each original destination property exactly once.');
    }
    $done = [];
    $visiting = [];
    $visit = function (string $property) use (&$visit, &$done, &$visiting, $process): void {
      if (array_key_exists($property, $done)) {
        return;
      }
      if (isset($visiting[$property])) {
        throw new \InvalidArgumentException('The native destination process contains a dependency cycle.');
      }
      $visiting[$property] = TRUE;
      $pipeline = $process[$property];
      $steps = is_string($pipeline) ? [['plugin' => 'get', 'source' => $pipeline]]
        : (array_is_list($pipeline) ? $pipeline : [$pipeline]);
      foreach ($steps as &$step) {
        foreach ((array) ($step['source'] ?? []) as $source) {
          if (!is_string($source) || !str_starts_with($source, '@') || str_starts_with($source, '@@')) {
            continue;
          }
          $reference = substr($source, 1);
          foreach (array_keys($process) as $candidate) {
            if ($candidate !== $property && ($candidate === $reference || str_starts_with($reference, $candidate . '/')
              || str_starts_with($candidate, $reference . '/'))) {
              $visit($candidate);
            }
          }
          if ($reference === $property) {
            throw new \InvalidArgumentException('A native destination property cannot reference itself.');
          }
        }
        if (($step['plugin'] ?? '') === 'sub_process') {
          $step['process'] = self::orderedProcess($step['process'] ?? []);
        }
      }
      unset($step, $visiting[$property]);
      $done[$property] = is_string($pipeline) ? $pipeline : (array_is_list($pipeline) ? $steps : $steps[0]);
    };
    foreach ($order as $property) {
      $visit($property);
    }
    return $done;
  }

  private static function process(array $process, array $ids, bool $allow_file_copy = FALSE): bool {
    $copies_file = FALSE;
    $allowed = ['get', 'default_value', 'concat', 'extract', 'static_map',
      'skip_on_empty', 'migration_lookup', 'sub_process', 'file_copy',
      'format_date', 'explode', 'flatten', 'urlencode', 'null_coalesce'];
    foreach ($process as $property => $pipeline) {
      if (is_string($pipeline)) {
        continue;
      }
      if (!is_array($pipeline)) {
        throw new \InvalidArgumentException("Invalid native process definition for $property.");
      }
      $steps = array_is_list($pipeline) ? $pipeline : [$pipeline];
      foreach ($steps as $step) {
        $plugin = $step['plugin'] ?? '';
        if (!in_array($plugin, $allowed, TRUE)) {
          throw new \InvalidArgumentException("Unsupported core process plugin: $plugin");
        }
        $definition = \Drupal::service('plugin.manager.migrate.process')->getDefinition($plugin);
        if (($definition['provider'] ?? '') !== 'migrate') {
          throw new \InvalidArgumentException("Process $plugin must resolve to the installed Drupal core implementation.");
        }
        if ($plugin === 'migration_lookup') {
          if (($step['no_stub'] ?? NULL) !== TRUE) {
            throw new \InvalidArgumentException('Every migration_lookup must explicitly use no_stub: true.');
          }
          foreach ((array) ($step['migration'] ?? []) as $dependency) {
            if (!in_array($dependency, $ids, TRUE)) {
              throw new \InvalidArgumentException("Relationship migration is not in this plan: $dependency");
            }
          }
        }
        if ($plugin === 'sub_process') {
          self::process($step['process'] ?? [], $ids);
        }
        if ($plugin === 'file_copy') {
          if (!$allow_file_copy) {
            throw new \InvalidArgumentException('file_copy belongs to a separately bound entity:file migration at the top process level; link media inside sub_process through migration_lookup.');
          }
          $copies_file = TRUE;
          if (!empty($step['move'])) {
            throw new \InvalidArgumentException('Original source files are copied and retained; file_copy move must be false.');
          }
          $copy_source = $step['source'] ?? NULL;
          if (!is_array($copy_source) || !array_is_list($copy_source) || count($copy_source) !== 2
            || $copy_source[0] !== '_govhub_source_path' || !is_string($copy_source[1])
            || $copy_source[1] === '' || $copy_source[1] === '@' || str_contains($copy_source[1], "\0")
            || !in_array($step['file_exists'] ?? '', ['use existing', 'replace'], TRUE)) {
            throw new \InvalidArgumentException('file_copy requires [_govhub_source_path, <URI source property or declared @helper>] and explicit use existing or replace.');
          }
        }
      }
    }
    return $copies_file;
  }

  public static function validate(array $plan): array {
    if (($plan['schema'] ?? '') !== self::SCHEMA) {
      throw new \InvalidArgumentException('Select a frozen Drupal content plan v1.');
    }
    foreach (['id', 'family_id', 'edition_id', 'label'] as $key) {
      if (!is_string($plan[$key] ?? NULL) || trim($plan[$key]) === '') {
        throw new \InvalidArgumentException("The plan must retain $key.");
      }
    }
    $migrations = $plan['migrations'] ?? [];
    if (!is_array($migrations) || !$migrations) {
      throw new \InvalidArgumentException('The plan has no native migrations.');
    }
    $ids = [];
    foreach ($migrations as $migration) {
      $id = $migration['id'] ?? '';
      if (!is_string($id) || !preg_match('/^govhub_[a-z0-9_]{1,49}$/D', $id) || isset($ids[$id])) {
        throw new \InvalidArgumentException('Use unique stable govhub_ migration IDs of at most 56 characters.');
      }
      $ids[$id] = TRUE;
    }
    $result = [];
    foreach ($migrations as $migration) {
      $id = $migration['id'];
      $source = $migration['source'] ?? [];
      $ordered = self::orderedIds($source);
      $seen = [];
      foreach ($source['rows'] ?? [] as $row) {
        if (!is_array($row)) {
          throw new \InvalidArgumentException("Every $id source row must be an object.");
        }
        if (array_key_exists('_govhub_source_path', $row) || array_key_exists('_govhub_file_sha256', $row)) {
          throw new \InvalidArgumentException('Runtime file paths and file hashes are supplied from the verified file binding, not a source row.');
        }
        $native_row = new \Drupal\migrate\Row($row, $ordered);
        $values = $native_row->getSourceIdValues();
        foreach ($ordered as $key => $definition) {
          $value = $values[$key] ?? NULL;
          if (!is_string($value) || $value === '' || strlen($value) > ($definition['max_length'] ?? 255)) {
            throw new \InvalidArgumentException("$id source ID $key must be an exact nonempty string within its native field length.");
          }
        }
        $identity = json_encode(array_values($values), JSON_THROW_ON_ERROR);
        if (isset($seen[$identity])) {
          throw new \InvalidArgumentException("Duplicate original source identity in $id: $identity");
        }
        $seen[$identity] = TRUE;
      }
      if (!preg_match('/^entity:[a-z][a-z0-9_]*$/D', $migration['destination']['plugin'] ?? '')) {
        throw new \InvalidArgumentException("$id must use an installed native entity destination.");
      }
      $policy = $migration['existing_target_policy'] ?? 'CREATE_ONLY';
      if (!in_array($policy, ['CREATE_ONLY', 'REVIEWED_FIELD_UPDATE', 'REUSE_SELECTED'], TRUE)) {
        throw new \InvalidArgumentException("Unknown existing-target policy in $id.");
      }
      if ($policy === 'REVIEWED_FIELD_UPDATE') {
        if (empty($plan['review']['allow_existing_updates']) || empty($plan['review']['backup_ref']['sha256'])
          || empty($migration['destination']['overwrite_properties'])) {
          throw new \InvalidArgumentException("$id needs its selected overwrite fields and the reviewed native backup reference.");
        }
      }
      foreach (($migration['migration_dependencies']['required'] ?? []) as $dependency) {
        if (!isset($ids[$dependency]) || $dependency === $id) {
          throw new \InvalidArgumentException("Invalid required migration dependency in $id.");
        }
      }
      $copies_file = self::process($migration['process'] ?? [], array_keys($ids),
        $migration['destination']['plugin'] === 'entity:file');
      if ($copies_file) {
        $declared_files = array_column($plan['files'] ?? [], NULL, 'file_id');
        foreach ($source['rows'] ?? [] as $row) {
          $file_id = $row['_govhub_file_id'] ?? NULL;
          if (!is_string($file_id) || !isset($declared_files[$file_id])) {
            throw new \InvalidArgumentException("Every selected $id file row must have its reviewed retained-file binding.");
          }
        }
      }
      $migration['process'] = self::orderedProcess($migration['process'] ?? [], $migration['process_order'] ?? NULL);
      $result[$id] = $migration;
    }
    // Resolve one explicit order before touching the target or its definitions.
    $ordered = [];
    $visiting = [];
    $visit = function (string $id) use (&$visit, &$ordered, &$visiting, $result): void {
      if (isset($ordered[$id])) {
        return;
      }
      if (isset($visiting[$id])) {
        throw new \InvalidArgumentException('The native migration dependencies contain a cycle.');
      }
      $visiting[$id] = TRUE;
      foreach (array_merge($result[$id]['migration_dependencies']['required'] ?? [],
        $result[$id]['migration_dependencies']['optional'] ?? []) as $dependency) {
        if (isset($result[$dependency])) {
          $visit($dependency);
        }
      }
      unset($visiting[$id]);
      $ordered[$id] = $result[$id];
    };
    foreach (array_keys($result) as $id) {
      $visit($id);
    }
    return $ordered;
  }

  public static function register(array $plan, string $plan_hash, array $files): array {
    $migrations = self::validate($plan);
    $manager = \Drupal::service('plugin.manager.migration');
    $existing_definitions = $manager->getDefinitions();
    $file_index = [];
    foreach ($files as $file) {
      $id = $file['file_id'];
      if (isset($file_index[$id]) || !is_file($file['path'])
        || filesize($file['path']) !== $file['bytes']
        || hash_file('sha256', $file['path']) !== $file['sha256']) {
        throw new \InvalidArgumentException("Original native file binding failed: $id");
      }
      $file_index[$id] = $file;
    }
    $declared = [];
    foreach ($plan['files'] ?? [] as $file) {
      $bound = $file_index[$file['file_id']] ?? NULL;
      if (!$bound || $bound['sha256'] !== $file['sha256'] || $bound['bytes'] !== $file['bytes']) {
        throw new \InvalidArgumentException('The reviewed original file is missing or changed: ' . $file['file_id']);
      }
      $declared[$file['file_id']] = $bound;
    }
    $records = [];
    foreach ($migrations as $id => $migration) {
      $previous = self::store()->get($id);
      $ids = self::orderedIds($migration['source']);
      $identity = ['ids' => $ids, 'id_order' => array_keys($ids),
        'plugin' => $migration['destination']['plugin'],
        'default_bundle' => $migration['destination']['default_bundle'] ?? NULL,
        'translations' => !empty($migration['destination']['translations'])];
      if ($previous && ($previous['family_id'] !== $plan['family_id'] || $previous['identity'] !== $identity)) {
        throw new \InvalidArgumentException("Migration $id cannot change its native identity or family.");
      }
      if (!$previous && isset($existing_definitions[$id])) {
        throw new \InvalidArgumentException("Migration $id already belongs to another native definition.");
      }
      $definition = [
        'id' => $id,
        'label' => $migration['label'] ?? $id,
        'class' => Migration::class,
        'provider' => 'govhub_consolidation',
        'migration_tags' => ['GovHub content', $plan['family_id']],
        'source' => ['plugin' => 'govhub_records', 'migration_id' => $id,
          'ids' => $ids, 'track_changes' => TRUE],
        'process' => $migration['process'],
        'destination' => $migration['destination'],
        'migration_dependencies' => $migration['migration_dependencies'] ?? ['required' => [], 'optional' => []],
        'idMap' => ['plugin' => 'sql'],
      ];
      $records[$id] = ['family_id' => $plan['family_id'], 'plan_id' => $plan['id'],
        'edition_id' => $plan['edition_id'], 'plan_sha256' => $plan_hash,
        'identity' => $identity, 'definition' => $definition, 'source' => $migration['source'],
        'files' => $declared, 'review' => $plan['review'] ?? [],
        'existing_target_policy' => $migration['existing_target_policy'] ?? 'CREATE_ONLY',
        'receiving' => $migration['receiving'] ?? [], 'registered_at' => gmdate(DATE_ATOM)];
    }
    $edition_store = \Drupal::keyValue('govhub_consolidation.editions');
    $old_edition = $edition_store->get($plan['id']);
    if ($old_edition && $old_edition['sha256'] !== $plan_hash) {
      throw new \InvalidArgumentException('A retained plan ID cannot change its original bytes.');
    }
    $edition_store->set($plan['id'], ['sha256' => $plan_hash, 'plan' => $plan]);
    foreach ($records as $id => $record) {
      self::store()->set($id, $record);
    }
    $manager->clearCachedDefinitions();
    return $migrations;
  }

}
