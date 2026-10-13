<?php
/**
 * Capture the actual installed Drupal editorial model and selected content.
 *
 * GOVHUB_EDITORIAL_REQUEST=/absolute/request.json drush php:script /absolute/inventory.php
 * The request identifies environment_ref, output_path, and optional bundle_ids/entity_ids.
 * It reads the existing bootstrapped site and writes one original inventory.
 */
declare(strict_types=1);

function editorialCanonical(mixed $value): mixed {
  if (!is_array($value)) {
    return $value;
  }
  if (!array_is_list($value)) {
    ksort($value, SORT_STRING);
  }
  foreach ($value as $key => $item) {
    $value[$key] = editorialCanonical($item);
  }
  return $value;
}

function editorialJson(mixed $value): string {
  return json_encode(editorialCanonical($value),
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

try {
  $requestPath = getenv('GOVHUB_EDITORIAL_REQUEST');
  if (!$requestPath || !is_file($requestPath)) {
    throw new RuntimeException('Set GOVHUB_EDITORIAL_REQUEST to the original request JSON file.');
  }
  $requestBytes = file_get_contents($requestPath);
  if ($requestBytes === FALSE) {
    throw new RuntimeException('The original request cannot be read.');
  }
  $request = json_decode($requestBytes, TRUE, 512, JSON_THROW_ON_ERROR);
  if (!is_array($request) || !is_string($request['environment_ref'] ?? NULL) ||
      trim($request['environment_ref']) === '' || !is_string($request['output_path'] ?? NULL)) {
    throw new RuntimeException('Supply the actual environment_ref and absolute output_path.');
  }
  $outputPath = $request['output_path'];
  if (!str_starts_with($outputPath, '/') || !is_dir(dirname($outputPath))) {
    throw new RuntimeException('The output parent must be an existing absolute directory.');
  }
  $requestSha = hash('sha256', $requestBytes);
  if (file_exists($outputPath)) {
    $existingBytes = file_get_contents($outputPath);
    $existing = json_decode($existingBytes, TRUE, 512, JSON_THROW_ON_ERROR);
    if (($existing['schema'] ?? '') !== 'govhub.editorial-inventory.v1' ||
        ($existing['source']['request_sha256'] ?? '') !== $requestSha) {
      throw new RuntimeException('The output belongs to a different original request. Choose a new output for a new observation.');
    }
    fwrite(STDOUT, editorialJson(['state' => 'REOPENED', 'output' => $outputPath,
      'bytes' => strlen($existingBytes), 'sha256' => hash('sha256', $existingBytes)]) . PHP_EOL);
    return;
  }

  $manager = \Drupal::entityTypeManager();
  $allBundles = $manager->getStorage('node_type')->loadMultiple();
  ksort($allBundles, SORT_STRING);
  $selected = $request['bundle_ids'] ?? array_keys($allBundles);
  if (!is_array($selected) || count($selected) !== count(array_unique($selected)) ||
      array_diff($selected, array_keys($allBundles))) {
    throw new RuntimeException('Choose each existing native content type once.');
  }
  sort($selected, SORT_STRING);
  if (!$selected) {
    throw new RuntimeException('Select at least one installed native content type.');
  }

  $storage = \Drupal::service('config.storage');
  $names = ['system.site'];
  foreach (['user.role.', 'workflows.workflow.'] as $prefix) {
    $names = array_merge($names, $storage->listAll($prefix));
  }
  foreach ($selected as $bundleId) {
    $names[] = 'node.type.' . $bundleId;
    foreach (['field.field.node.' . $bundleId . '.', 'core.entity_form_display.node.' . $bundleId . '.',
              'core.entity_view_display.node.' . $bundleId . '.'] as $prefix) {
      $names = array_merge($names, $storage->listAll($prefix));
    }
    $languageName = 'language.content_settings.node.' . $bundleId;
    if ($storage->exists($languageName)) {
      $names[] = $languageName;
    }
    foreach (\Drupal::service('entity_field.manager')->getFieldDefinitions('node', $bundleId) as $fieldName => $field) {
      $storageName = 'field.storage.node.' . $fieldName;
      if ($storage->exists($storageName)) {
        $names[] = $storageName;
      }
    }
  }
  $names = array_values(array_unique($names));
  sort($names, SORT_STRING);
  $originalConfiguration = $storage->readMultiple($names);
  $configuration = [];
  foreach ($names as $name) {
    if (!array_key_exists($name, $originalConfiguration)) {
      throw new RuntimeException('The selected native configuration disappeared: ' . $name);
    }
    $bytes = editorialJson($originalConfiguration[$name]);
    $configuration[] = ['name' => $name, 'bytes' => strlen($bytes),
      'sha256' => hash('sha256', $bytes), 'data_json' => $bytes];
  }

  $bundles = [];
  foreach ($selected as $bundleId) {
    $bundle = $allBundles[$bundleId];
    $display = $manager->getStorage('entity_form_display')->load('node.' . $bundleId . '.default');
    $fields = [];
    foreach (\Drupal::service('entity_field.manager')->getFieldDefinitions('node', $bundleId) as $name => $field) {
      $fields[] = ['name' => $name, 'label' => (string) $field->getLabel(),
        'description' => (string) $field->getDescription(), 'type' => $field->getType(),
        'required' => $field->isRequired(), 'translatable' => $field->isTranslatable(),
        'read_only' => $field->isReadOnly(),
        'cardinality' => $field->getFieldStorageDefinition()->getCardinality(),
        'form_component' => $display ? $display->getComponent($name) : NULL];
    }
    usort($fields, fn(array $a, array $b): int => strcmp($a['name'], $b['name']));
    $bundles[] = ['id' => $bundleId, 'label' => $bundle->label(),
      'description' => (string) $bundle->get('description'), 'fields' => $fields];
  }

  $roles = [];
  foreach ($manager->getStorage('user_role')->loadMultiple() as $role) {
    $permissions = $role->getPermissions();
    sort($permissions, SORT_STRING);
    $roles[] = ['id' => $role->id(), 'label' => $role->label(),
      'admin' => $role->isAdmin(), 'permissions' => $permissions];
  }
  usort($roles, fn(array $a, array $b): int => strcmp($a['id'], $b['id']));
  $workflows = [];
  foreach ($originalConfiguration as $name => $config) {
    if (!str_starts_with($name, 'workflows.workflow.')) {
      continue;
    }
    $nodeBundles = $config['type_settings']['entity_types']['node'] ?? [];
    if ($nodeBundles && !array_intersect($nodeBundles, $selected)) {
      continue;
    }
    $workflows[] = ['id' => $config['id'], 'label' => $config['label'],
      'type' => $config['type'], 'type_settings' => $config['type_settings'] ?? []];
  }
  usort($workflows, fn(array $a, array $b): int => strcmp($a['id'], $b['id']));

  $nodeStorage = $manager->getStorage('node');
  $query = $nodeStorage->getQuery()->accessCheck(FALSE)->condition('type', $selected, 'IN')->sort('nid');
  $explicitIds = $request['entity_ids'] ?? NULL;
  if ($explicitIds !== NULL) {
    if (!is_array($explicitIds) || count($explicitIds) !== count(array_unique($explicitIds)) ||
        array_filter($explicitIds, fn($id): bool => !is_int($id) && !(is_string($id) && ctype_digit($id)))) {
      throw new RuntimeException('entity_ids must contain each original native node ID once.');
    }
    if ($explicitIds) {
      $query->condition('nid', $explicitIds, 'IN');
    }
  }
  $ids = $explicitIds === [] ? [] : array_values($query->execute());
  if ($explicitIds !== NULL && array_diff(array_map('strval', $explicitIds), array_map('strval', $ids))) {
    throw new RuntimeException('One or more selected content IDs are absent from the selected native types.');
  }
  $entities = [];
  foreach (array_chunk($ids, 100) as $chunk) {
    $loaded = $nodeStorage->loadMultiple($chunk);
    foreach ($chunk as $id) {
      if (!isset($loaded[$id])) {
        throw new RuntimeException('Selected content changed during capture: ' . $id);
      }
      $entity = $loaded[$id];
      $path = $entity->toUrl('canonical', ['absolute' => FALSE])->toString();
      $entities[] = ['id' => (string) $entity->id(), 'uuid' => $entity->uuid(),
        'bundle' => $entity->bundle(), 'label' => $entity->label(),
        'revision_id' => (string) $entity->getRevisionId(), 'language' => $entity->language()->getId(),
        'route' => $path, 'published' => $entity->isPublished(),
        'moderation_state' => $entity->hasField('moderation_state') ? $entity->get('moderation_state')->value : NULL];
    }
    $nodeStorage->resetCache($chunk);
  }

  $currentConfiguration = $storage->readMultiple($names);
  if (editorialJson($currentConfiguration) !== editorialJson($originalConfiguration)) {
    throw new RuntimeException('Native configuration changed during this capture. Repeat the same request before publishing an inventory.');
  }
  $baseUrl = \Drupal::request()->getSchemeAndHttpHost() . \Drupal::request()->getBasePath() . '/';
  $result = ['schema' => 'govhub.editorial-inventory.v1',
    'source' => ['site_uuid' => (string) $originalConfiguration['system.site']['uuid'],
      'site_name' => (string) $originalConfiguration['system.site']['name'], 'base_url' => $baseUrl,
      'drupal_version' => \Drupal::VERSION, 'observed_at' => gmdate('Y-m-d\TH:i:s\Z'),
      'environment_ref' => $request['environment_ref'], 'request_sha256' => $requestSha,
      'bundle_ids' => $selected, 'entity_ids' => array_map('strval', $ids),
      'selection' => $explicitIds === NULL ? 'ALL_SELECTED_CONTENT_TYPES' : 'EXPLICIT_NODE_IDS'],
    'bundles' => $bundles, 'roles' => $roles, 'workflows' => $workflows,
    'entities' => $entities, 'configuration' => $configuration];
  $bytes = editorialJson($result) . PHP_EOL;
  $temporary = tempnam(dirname($outputPath), '.editorial-inventory-');
  if ($temporary === FALSE) {
    throw new RuntimeException('Unable to create the original inventory output.');
  }
  chmod($temporary, 0600);
  $handle = fopen($temporary, 'wb');
  if (!$handle || fwrite($handle, $bytes) !== strlen($bytes) || !fflush($handle)) {
    throw new RuntimeException('The native inventory could not be completely written.');
  }
  if (function_exists('fsync')) {
    fsync($handle);
  }
  fclose($handle);
  if (!link($temporary, $outputPath)) {
    throw new RuntimeException('The inventory output was created concurrently. Reopen the same original request.');
  }
  unlink($temporary);
  $temporary = NULL;
  fwrite(STDOUT, editorialJson(['state' => 'CAPTURED', 'output' => $outputPath,
    'bytes' => strlen($bytes), 'sha256' => hash('sha256', $bytes),
    'content_types' => count($bundles), 'entities' => count($entities),
    'configuration_objects' => count($configuration)]) . PHP_EOL);
}
catch (\Throwable $error) {
  if (isset($handle) && is_resource($handle)) {
    fclose($handle);
  }
  if (isset($temporary) && is_string($temporary) && is_file($temporary)) {
    unlink($temporary);
  }
  fwrite(STDERR, editorialJson(['error' => get_class($error), 'message' => $error->getMessage()]) . PHP_EOL);
  exit(1);
}
