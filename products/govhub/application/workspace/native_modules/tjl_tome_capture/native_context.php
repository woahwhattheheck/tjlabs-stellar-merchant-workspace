<?php
/** Run through the configured original Drush php:script command. */
use Drupal\Core\Entity\ContentEntityTypeInterface;
use Drupal\tome_static\StaticGeneratorInterface;

function tjl_tome_order($value) {
  if (is_array($value)) {
    if (!array_is_list($value)) {
      ksort($value, SORT_STRING);
    }
    foreach ($value as $key => $item) {
      $value[$key] = tjl_tome_order($item);
    }
  }
  return $value;
}
function tjl_tome_hash($value) {
  return hash('sha256', json_encode(tjl_tome_order($value), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
}
$contextFile = getenv('TJL_TOME_NATIVE_REQUEST');
if (!$contextFile || $contextFile[0] !== '/' || is_link($contextFile)) {
  throw new RuntimeException('Use the retained native request file.');
}
$context = json_decode(file_get_contents($contextFile), TRUE, 512, JSON_THROW_ON_ERROR);
if (($context['schema'] ?? '') !== 'govhub.tome-native-request.v1') {
  throw new RuntimeException('The original native request schema differs.');
}
$mode = $context['mode'] ?? 'describe';
$list = \Drupal::service('extension.list.module');
$modules = $list->getList();
$enabled = \Drupal::moduleHandler()->moduleExists('tjl_tome_capture');
$tomeEnabled = \Drupal::moduleHandler()->moduleExists('tome_static');
if (!$tomeEnabled) {
  throw new RuntimeException('Enable the selected original Tome Static module on this Drupal site.');
}
$info = $list->getExtensionInfo('tome_static');
$modulePath = $list->getPath('tome_static');
$packagePath = realpath(DRUPAL_ROOT . '/' . $modulePath . '/../..');
if (!$enabled || !\Drupal::hasService('tjl_tome_capture.generator')) {
  echo json_encode([
    'schema' => 'govhub.tome-native-description.v1',
    'observer_enabled' => FALSE, 'observer_module_enabled' => $enabled, 'tome_enabled' => $tomeEnabled,
    'tome_version' => $info['version'] ?? '',
    'tome_package_path' => $packagePath,
  ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
  return;
}
$generator = \Drupal::service('tjl_tome_capture.generator');
$cache = \Drupal::service('tjl_tome_capture.cache');
if ($mode === 'reset_cache') {
  $cache->isCacheEmpty();
  $cache->deleteAll();
  if (!empty($context['reset_owned_interruption'])) {
    \Drupal::state()->set(StaticGeneratorInterface::STATE_KEY_BUILDING, FALSE);
  }
  echo json_encode([
    'schema' => 'govhub.tome-native-cache-reset.v1',
    'operation_id' => $context['operation_id'], 'cache_empty' => $cache->isCacheEmpty(),
    'owned_interruption_reset' => !empty($context['reset_owned_interruption']),
  ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
  return;
}
$directory = $generator->getStaticDirectory();
if (!str_starts_with($directory, '/')) {
  $directory = DRUPAL_ROOT . '/' . $directory;
}
$configuration = \Drupal::service('config.storage');
$names = $configuration->listAll();
sort($names, SORT_STRING);
$config = $configuration->readMultiple($names);
$manager = \Drupal::entityTypeManager();
$types = $context['content_entity_types'] ?? ['*'];
$scope = $types === ['*'] ? 'all-installed-content-entity-types' : 'declared-content-entity-types';
if ($types === ['*']) {
  $types = [];
  foreach ($manager->getDefinitions() as $id => $definition) {
    if ($definition instanceof ContentEntityTypeInterface) {
      $types[] = $id;
    }
  }
}
sort($types, SORT_STRING);
$entities = []; $missing = [];
foreach ($types as $type) {
  $definition = $manager->getDefinition($type, FALSE);
  if (!$definition) {
    $missing[] = $type;
    continue;
  }
  if (!$definition instanceof ContentEntityTypeInterface) {
    throw new RuntimeException('Select content entity types for the source revision comparison.');
  }
  $idKey = $definition->getKey('id');
  $storage = $manager->getStorage($type);
  $rows = []; $offset = 0;
  do {
    $ids = array_values($storage->getQuery()->accessCheck(FALSE)->sort($idKey)->range($offset, 200)->execute());
    foreach ($storage->loadMultiple($ids) as $entity) {
      $translations = [];
      foreach ($entity->getTranslationLanguages() as $langcode => $language) {
        $translations[$langcode] = $entity->getTranslation($langcode)->toArray();
      }
      $rows[] = ['id' => (string) $entity->id(), 'sha256' => tjl_tome_hash($translations)];
    }
    $offset += count($ids);
    $storage->resetCache($ids);
  } while (count($ids) === 200);
  $entities[$type] = ['count' => count($rows), 'sha256' => tjl_tome_hash($rows)];
}
$result = [
  'schema' => 'govhub.tome-native-description.v1',
  'observer_enabled' => TRUE, 'observer_module_enabled' => TRUE, 'tome_enabled' => TRUE,
  'content_entity_scope' => $scope, 'selected_content_entity_types' => $types,
  'tome_version' => $info['version'] ?? '',
  'tome_package_path' => $packagePath,
  'static_directory' => $directory,
  'building' => (bool) \Drupal::state()->get(StaticGeneratorInterface::STATE_KEY_BUILDING, FALSE),
  'configuration_count' => count($names),
  'configuration_sha256' => tjl_tome_hash($config),
  'content_entities' => $entities, 'absent_entity_types' => $missing,
  'source_revision_sha256' => tjl_tome_hash(['configuration' => $config, 'content_entities' => $entities, 'absent_entity_types' => $missing]),
];
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
