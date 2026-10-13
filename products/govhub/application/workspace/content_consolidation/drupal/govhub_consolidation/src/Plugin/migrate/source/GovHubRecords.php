<?php

namespace Drupal\govhub_consolidation\Plugin\migrate\source;

use Drupal\govhub_consolidation\Registry;
use Drupal\govhub_consolidation\Runner;
use Drupal\migrate\Annotation\MigrateSource;
use Drupal\migrate\Plugin\migrate\source\SourcePluginBase;
use Drupal\migrate\Row;

/**
 * Supplies original rows while core Migrate retains their map and row hashes.
 *
 * @MigrateSource(
 *   id = "govhub_records"
 * )
 */
#[\Drupal\migrate\Attribute\MigrateSource('govhub_records')]
final class GovHubRecords extends SourcePluginBase {

  protected function initializeIterator(): \Iterator {
    return new \ArrayIterator(Registry::get($this->configuration['migration_id'])['source']['rows']);
  }

  public function getIds(): array {
    return Registry::orderedIds(Registry::get($this->configuration['migration_id'])['source']);
  }

  public function fields(): array {
    return Registry::get($this->configuration['migration_id'])['source']['fields'] ?? [];
  }

  public function __toString(): string {
    return 'Retained content rows: ' . $this->configuration['migration_id'];
  }

  public function prepareRow(Row $row): bool {
    $record = Registry::get($this->configuration['migration_id']);
    $binding = NULL;
    $file_id = $row->getSourceProperty('_govhub_file_id');
    if ($file_id !== NULL) {
      $binding = $record['files'][$file_id] ?? NULL;
      if (!$binding || !is_file($binding['path'])
        || filesize($binding['path']) !== $binding['bytes']
        || hash_file('sha256', $binding['path']) !== $binding['sha256']) {
        throw new \Drupal\migrate\MigrateException('The retained original file binding is missing or changed: ' . $file_id);
      }
      $row->setSourceProperty('_govhub_file_sha256', $binding['sha256']);
    }
    // Native Row::rehash() runs here, before a relocated private path is added.
    if (!parent::prepareRow($row)) {
      return FALSE;
    }
    if ($binding) {
      $row->setSourceProperty('_govhub_source_path', $binding['path']);
      Runner::verifyFileCopy($this->migration, $row, $binding);
    }
    if ($record['existing_target_policy'] === 'REUSE_SELECTED') {
      return Runner::reuseSelected($this->migration, $row, $record);
    }
    return TRUE;
  }

}
