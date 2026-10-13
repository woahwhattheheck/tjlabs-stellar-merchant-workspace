<?php

declare(strict_types=1);

/**
 * Original Drush php:script entrypoint for the installed Content Packages API.
 * Drupal owns parsing, graph verification, field diffs and entity import.
 */

use Drupal\Core\Entity\ContentEntityInterface;
use Drupal\Core\Entity\ContentEntityTypeInterface;
use Drupal\Core\Entity\EntityPublishedInterface;

final class GovHubContentPackagesBridge {
  private const RESULT = 'govhub.content-packages.native-result.v1';
  private const PREVIEW = 'govhub.content-packages.preview.v1';
  private const RECEIPTS = 'govhub.content_packages.imports.v1';

  private array $request;
  private array $parameters;
  private string $output;
  private array $module;
  private array $target;

  public function __construct(array $request) {
    $this->request = $request;
    if (($request['schema'] ?? '') !== 'govhub.content-packages.native-request.v1'
      || !preg_match('/^operation-[a-f0-9]{32}$/D', $request['operation_id'] ?? '')
      || !in_array($request['action'] ?? '', ['export', 'preview', 'import', 'status'], TRUE)) {
      throw new InvalidArgumentException('Use the original complete GovHub content-package request.');
    }
    $this->output = realpath($request['output_dir'] ?? '') ?: '';
    if ($this->output === '' || dirname($request['result_path'] ?? '') !== $this->output) {
      throw new InvalidArgumentException('The result belongs to its original private operation directory.');
    }
    $intent_path = $this->verifiedFile($request['intent'] ?? []);
    $intent = json_decode(file_get_contents($intent_path), TRUE, 512, JSON_THROW_ON_ERROR);
    $this->parameters = $request['parameters'] ?? [];
    if (($request['intent']['sha256'] ?? '') !== ($request['intent_sha256'] ?? '')
      || ($intent['operation_id'] ?? '') !== $request['operation_id']
      || self::canonical($intent['parameters'] ?? NULL) !== self::canonical($this->parameters)
      || ($intent['provider_environment_id'] ?? '') !== ($request['provider_environment_id'] ?? '')
      || ($this->parameters['action'] ?? '') !== $request['action']) {
      throw new InvalidArgumentException('The native request differs from its original retained business intent.');
    }
    if (!\Drupal::moduleHandler()->moduleExists('content_packages')) {
      throw new RuntimeException('Enable the original Content Packages module and its Composer dependencies on this selected Drupal installation.');
    }
    foreach (['archive_exporter', 'archive_verifier', 'archive_importer', 'manager', 'package_parser'] as $service) {
      if (!\Drupal::hasService('content_packages.' . $service)) {
        throw new RuntimeException('The installed module does not supply content_packages.' . $service . '.');
      }
    }
  }

  private function loadContext(): void {
    $this->module = $this->moduleSource();
    $configuration = [];
    $storage = \Drupal::service('config.storage');
    foreach ($storage->listAll() as $name) {
      $configuration[$name] = self::hash($storage->read($name));
    }
    ksort($configuration, SORT_STRING);
    $this->target = [
      'provider_environment_id' => $this->request['provider_environment_id'],
      'site_uuid' => (string) (($storage->read('system.site') ?: [])['uuid'] ?? ''),
      'uri' => \Drupal::request()->getSchemeAndHttpHost() . \Drupal::request()->getBaseUrl(),
      'drupal_version' => \Drupal::VERSION,
      'executing_user_id' => (string) \Drupal::currentUser()->id(),
      'module_version' => $this->module['version'],
      'module_source_sha256' => $this->module['source_sha256'],
      'configuration_sha256' => self::hash($configuration),
    ];
    if ($this->target['site_uuid'] === '') {
      throw new RuntimeException('The selected Drupal installation must expose its existing site UUID.');
    }
    $record = $this->output . '/' . basename($this->request['result_path'], '.result.json') . '.module-source.json';
    self::writeOnce($record, [
      'schema' => 'govhub.content-packages.module-source.v1',
      'module' => $this->module, 'configuration_hashes' => $configuration,
    ]);
  }

  private static function canonical(mixed $value): string {
    $sort = static function (mixed $item) use (&$sort): mixed {
      if (is_array($item)) {
        if (!array_is_list($item)) {
          ksort($item, SORT_STRING);
        }
        foreach ($item as $key => $child) {
          $item[$key] = $sort($child);
        }
      }
      return $item;
    };
    return json_encode($sort($value), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
  }

  private static function hash(mixed $value): string {
    return hash('sha256', self::canonical($value));
  }

  private function verifiedFile(array $reference): string {
    $path = $reference['path'] ?? '';
    $size = $reference['bytes'] ?? $reference['size'] ?? NULL;
    if (!is_string($path) || !str_starts_with($path, '/') || is_link($path) || !is_file($path)
      || filesize($path) !== $size
      || hash_file('sha256', $path) !== ($reference['sha256'] ?? NULL)) {
      throw new RuntimeException('The original retained source file is missing or its exact bytes changed.');
    }
    return $path;
  }

  private static function writeOnce(string $path, mixed $value): void {
    $bytes = is_string($value) ? $value : self::canonical($value) . "\n";
    if (is_link($path)) {
      throw new RuntimeException('The native output must be an original regular file.');
    }
    if (is_file($path)) {
      if (hash_file('sha256', $path) !== hash('sha256', $bytes)) {
        throw new RuntimeException('A different original native output already occupies ' . basename($path) . '.');
      }
      return;
    }
    $temporary = $path . '.writing-' . getmypid();
    $stream = fopen($temporary, 'xb');
    if ($stream === FALSE) {
      throw new RuntimeException('Unable to open the original native output.');
    }
    try {
      $offset = 0;
      while ($offset < strlen($bytes)) {
        $written = fwrite($stream, substr($bytes, $offset));
        if ($written === FALSE || $written === 0) {
          throw new RuntimeException('Unable to retain the complete native output.');
        }
        $offset += $written;
      }
      fflush($stream);
      if (function_exists('fsync')) {
        fsync($stream);
      }
    }
    finally {
      fclose($stream);
    }
    if (!rename($temporary, $path)) {
      throw new RuntimeException('Unable to publish the original complete native output.');
    }
  }

  private function moduleSource(): array {
    $relative = \Drupal::moduleHandler()->getModule('content_packages')->getPath();
    $root = realpath(\Drupal::root() . '/' . $relative);
    if (!$root) {
      throw new RuntimeException('The installed native module source directory is missing.');
    }
    $files = [];
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
      if (!$file->isFile() || $file->isLink()) {
        continue;
      }
      $name = substr($file->getPathname(), strlen($root) + 1);
      if (str_starts_with($name, 'tests/') || str_starts_with($name, '.git/')
        || !preg_match('/\.(php|module|install|yml|json)$/D', $name)) {
        continue;
      }
      $files[$name] = ['bytes' => $file->getSize(), 'sha256' => hash_file('sha256', $file->getPathname())];
    }
    ksort($files, SORT_STRING);
    $info = \Drupal::service('extension.list.module')->getExtensionInfo('content_packages');
    return [
      'name' => 'content_packages', 'version' => (string) ($info['version'] ?? ''),
      'source_sha256' => self::hash($files), 'files' => $files,
      'selected_release' => '1.3.1',
      'release_url' => 'https://www.drupal.org/project/content_packages/releases/1.3.1',
      'release_archive_sha256' => '94b7eb054cfeb53029a6ccb26898d7e8b7599e273eb4365171892852455b993c',
    ];
  }

  private function entity(string $type, string $uuid): ?ContentEntityInterface {
    $storage = \Drupal::entityTypeManager()->getStorage($type);
    $definition = \Drupal::entityTypeManager()->getDefinition($type);
    $key = $definition->getKey('uuid');
    if (!$key) {
      throw new RuntimeException('This native content entity type has no UUID key.');
    }
    $matches = $storage->loadByProperties([$key => $uuid]);
    if (count($matches) > 1) {
      throw new RuntimeException('The destination has more than one entity for the selected UUID.');
    }
    $entity = $matches ? reset($matches) : NULL;
    if ($entity !== NULL && !$entity instanceof ContentEntityInterface) {
      throw new RuntimeException('The selected package UUID is not a native content entity.');
    }
    return $entity;
  }

  private function fileState(object $file): array {
    $uri = (string) $file->getFileUri();
    $readable = is_file($uri) && is_readable($uri);
    return [
      'entity_type' => 'file', 'uuid' => $file->uuid(), 'id' => (string) $file->id(),
      'uri' => $uri, 'filename' => $file->getFilename(),
      'bytes' => $readable ? filesize($uri) : NULL,
      'sha256' => $readable ? hash_file('sha256', $uri) : NULL,
      'readable' => $readable,
    ];
  }

  private function snapshot(string $type, string $uuid): array {
    $entity = $this->entity($type, $uuid);
    if (!$entity) {
      return ['entity_type' => $type, 'uuid' => $uuid, 'exists' => FALSE];
    }
    $translations = [];
    $linked = [];
    foreach ($entity->getTranslationLanguages() as $language) {
      $translation = $entity->getTranslation($language->getId());
      $translations[$language->getId()] = [
        'fields' => $translation->toArray(),
        'published' => $translation instanceof EntityPublishedInterface ? $translation->isPublished() : NULL,
        'moderation_state' => $translation->hasField('moderation_state') ? $translation->get('moderation_state')->value : NULL,
      ];
      foreach ($translation->getFields(FALSE) as $items) {
        $target_type = $items->getFieldDefinition()->getSetting('target_type');
        if (!in_array($target_type, ['file', 'media'], TRUE) || !method_exists($items, 'referencedEntities')) {
          continue;
        }
        foreach ($items->referencedEntities() as $reference) {
          if ($reference->getEntityTypeId() === 'file') {
            $linked['file:' . $reference->uuid()] = $this->fileState($reference);
          }
          elseif ($reference->getEntityTypeId() === 'media') {
            $media = ['entity_type' => 'media', 'uuid' => $reference->uuid(),
              'id' => (string) $reference->id(), 'revision_id' => (string) $reference->getRevisionId(),
              'fields' => $reference->toArray(), 'files' => []];
            foreach ($reference->getFields(FALSE) as $media_items) {
              if ($media_items->getFieldDefinition()->getSetting('target_type') === 'file'
                && method_exists($media_items, 'referencedEntities')) {
                foreach ($media_items->referencedEntities() as $file) {
                  $media['files'][$file->uuid()] = $this->fileState($file);
                }
              }
            }
            ksort($media['files'], SORT_STRING);
            $linked['media:' . $reference->uuid()] = $media;
          }
        }
      }
    }
    ksort($translations, SORT_STRING);
    ksort($linked, SORT_STRING);
    return [
      'entity_type' => $type, 'uuid' => $uuid, 'exists' => TRUE,
      'id' => (string) $entity->id(), 'bundle' => $entity->bundle(), 'label' => (string) $entity->label(),
      'revision_id' => method_exists($entity, 'getRevisionId') ? (string) $entity->getRevisionId() : NULL,
      'default_langcode' => $entity->getUntranslated()->language()->getId(),
      'translations' => $translations, 'linked_assets' => $linked,
    ];
  }

  private function snapshots(array $identities): array {
    $result = [];
    foreach ($identities as $identity) {
      $key = $identity['entity_type'] . ':' . $identity['uuid'];
      $result[$key] = $this->snapshot($identity['entity_type'], $identity['uuid']);
    }
    ksort($result, SORT_STRING);
    return $result;
  }

  private function resetEntityCaches(): void {
    foreach (\Drupal::entityTypeManager()->getDefinitions() as $type => $definition) {
      if ($definition instanceof ContentEntityTypeInterface) {
        \Drupal::entityTypeManager()->getStorage($type)->resetCache();
      }
    }
  }

  private function retainAsset(object $tree, array $entry): array {
    $source = $tree->getDirectory() . '/' . $entry['path'];
    $directory = $this->output . '/assets';
    if (!is_dir($directory) && !mkdir($directory, 0700)) {
      throw new RuntimeException('Unable to create this operation asset directory.');
    }
    $extension = strtolower(pathinfo($entry['path'], PATHINFO_EXTENSION));
    $extension = preg_match('/^[a-z0-9]{1,12}$/D', $extension) ? '.' . $extension : '';
    $target = $directory . '/' . $entry['sha256'] . $extension;
    if (!is_file($target)) {
      $input = fopen($source, 'rb');
      $temporary = $target . '.writing-' . getmypid();
      $output = fopen($temporary, 'xb');
      if (!$input || !$output) {
        if (is_resource($input)) fclose($input);
        if (is_resource($output)) fclose($output);
        throw new RuntimeException('Unable to retain the original verified package asset.');
      }
      try {
        if (stream_copy_to_stream($input, $output) !== $entry['bytes']) {
          throw new RuntimeException('The verified asset was not copied completely.');
        }
        fflush($output);
        if (function_exists('fsync')) fsync($output);
      }
      finally {
        fclose($input);
        fclose($output);
      }
      if (hash_file('sha256', $temporary) !== $entry['sha256'] || !rename($temporary, $target)) {
        throw new RuntimeException('The original verified asset could not be published.');
      }
    }
    if (is_link($target) || filesize($target) !== $entry['bytes'] || hash_file('sha256', $target) !== $entry['sha256']) {
      throw new RuntimeException('The retained original asset bytes changed.');
    }
    $mime = function_exists('mime_content_type') ? mime_content_type($target) : FALSE;
    return ['path' => $target, 'sha256' => $entry['sha256'], 'bytes' => $entry['bytes'],
      'mime_type' => $mime ?: 'application/octet-stream'];
  }

  private static function normalizedPlan(array $native, array $package_paths): array {
    $roots = [];
    foreach ($native['actions'] ?? [] as $action) {
      $path = $package_paths[$action['uuid'] ?? ''] ?? '';
      $source = $action['source'] ?? '';
      if ($path !== '' && is_string($source) && str_ends_with($source, '/' . $path)) {
        $roots[] = substr($source, 0, -strlen($path));
      }
    }
    $normalize = static function (mixed $value) use (&$normalize, $roots): mixed {
      if (is_string($value)) {
        foreach ($roots as $root) {
          if (str_starts_with($value, $root)) return 'archive://' . substr($value, strlen($root));
        }
      }
      elseif (is_array($value)) {
        foreach ($value as $key => $item) $value[$key] = $normalize($item);
      }
      return $value;
    };
    return $normalize($native);
  }

  private function inspectArchive(string $path, bool $retain_assets): array {
    $preview = [
      'schema' => self::PREVIEW, 'archive_sha256' => hash_file('sha256', $path),
      'archive_bytes' => filesize($path), 'target' => $this->target,
      'target_sha256' => self::hash($this->target), 'observed_at' => gmdate(DATE_ATOM),
      'manifest' => NULL, 'packages' => [], 'assets' => [], 'identities' => [],
      'issues' => [], 'warnings' => [], 'omitted_references' => [],
      'missing_omitted_references' => [], 'native_dry_run' => NULL,
    ];
    $before = [];
    $native_plan = [];
    [$verification, $tree] = \Drupal::service('content_packages.archive_verifier')->verifyAndOpen($path, TRUE);
    $preview['verification'] = $verification;
    $preview['warnings'] = array_values($verification['warnings'] ?? []);
    if (!($verification['valid'] ?? FALSE) || $tree === NULL) {
      $tree?->remove();
      foreach ($verification['errors'] ?? ['The native archive verification failed.'] as $error) {
        $preview['issues'][] = ['code' => 'NATIVE_ARCHIVE_VERIFY',
          'message' => is_string($error) ? $error : self::canonical($error)];
      }
      $preview['before_sha256'] = self::hash(['target' => $preview['target_sha256'], 'entities' => [], 'native_plan' => []]);
      return $preview;
    }
    try {
      $manifest = json_decode($tree->read('content-package-manifest.json') ?? '', TRUE, 512, JSON_THROW_ON_ERROR);
      $preview['manifest'] = $manifest;
      $package_type = (string) $manifest['package_type'];
      $plugin = \Drupal::service('plugin.manager.content_package_type')->createInstance($package_type);
      $paths = [];
      $package_paths = [];
      $asset_paths = [];
      foreach ($manifest['packages'] as $record) {
        $paths[] = $tree->getDirectory() . '/' . $record['path'];
        $package_paths[$record['uuid']] = $record['path'];
        foreach ($record['assets'] ?? [] as $asset_path) $asset_paths[$asset_path] = TRUE;
      }
      $packages = \Drupal::service('content_packages.manager')->validateFiles($package_type, $paths);
      $entries = [];
      foreach ($manifest['entries'] as $entry) {
        $entries[$entry['path']] = $entry;
        if (($entry['type'] ?? '') === 'asset' || isset($asset_paths[$entry['path']])) {
          $asset = $entry;
          if ($retain_assets) $asset['retained'] = $this->retainAsset($tree, $entry);
          $preview['assets'][] = $asset;
        }
      }
      $identities = [];
      foreach ($packages as $index => $package) {
        $record = $manifest['packages'][$index];
        $identity = ['entity_type' => $package->getEntityTypeId(), 'uuid' => $package->getUuid()];
        $key = $identity['entity_type'] . ':' . $identity['uuid'];
        if ($record['key'] !== $key || $record['uuid'] !== $identity['uuid']) {
          throw new RuntimeException('The native resolved package differs from the verified manifest identity.');
        }
        $identities[$key] = $identity;
        foreach ($package->getComponents() as $component) {
          $component_key = $component['entity_type'] . ':' . $component['uuid'];
          $identities[$component_key] = ['entity_type' => $component['entity_type'], 'uuid' => $component['uuid']];
        }
        $existing = $this->entity($identity['entity_type'], $identity['uuid']);
        $current = $this->snapshot($identity['entity_type'], $identity['uuid']);
        $document = $package->getDocument();
        $metadata = $document->getFrontMatter();
        $diffs = $existing === NULL ? ['No entity exists for this UUID.'] : $plugin->diffEntity($existing, $package);
        $entry = $entries[$record['path']];
        $preview['packages'][] = [
          'key' => $key, 'entity_type' => $identity['entity_type'],
          'bundle' => $package->getBundle(), 'uuid' => $identity['uuid'],
          'title' => $package->getTitle(), 'path' => $record['path'],
          'source' => [
            'path' => $record['path'], 'sha256' => $entry['sha256'], 'bytes' => $entry['bytes'],
            'front_matter' => $metadata, 'body' => $document->getBody(),
            'text' => $tree->read($record['path']),
          ],
          'native_action' => $existing === NULL ? 'create' : ($diffs === [] ? 'unchanged' : 'update'),
          'diffs' => $diffs, 'before' => $current,
          'references' => $record['references'] ?? [], 'assets' => $record['assets'] ?? [],
          'components' => $package->getComponents(), 'translations' => $package->getTranslations(),
          'publication' => [
            'mode' => $metadata['publication'] ?? 'package-controlled',
            'source_status' => $metadata['status'] ?? NULL,
            'source_metadata' => $metadata,
            'destination_translations' => $current['translations'] ?? [],
            'behavior' => ($metadata['publication'] ?? '') === 'destination-owned'
              ? ($existing === NULL
                ? 'The native package applies its declared status when creating content; the destination owns publication afterward.'
                : 'Existing destination publication is preserved; the installed native type handles new translations from this source metadata.')
              : 'The installed native package type applies this original status metadata and its native defaults.',
          ],
        ];
      }
      foreach ($manifest['graph']['omitted_references'] ?? [] as $reference) {
        $key = $reference['entity_type'] . ':' . $reference['uuid'];
        $identities[$key] = ['entity_type' => $reference['entity_type'], 'uuid' => $reference['uuid']];
      }
      ksort($identities, SORT_STRING);
      $preview['identities'] = array_values($identities);
      $before = $this->snapshots($preview['identities']);
      $native = \Drupal::service('content_packages.archive_importer')->importArchive($path, TRUE, TRUE);
      $preview['native_dry_run'] = $native;
      $native_plan = self::normalizedPlan($native, $package_paths);
      $preview['native_plan'] = $native_plan;
      $preview['omitted_references'] = $native['omitted_references'] ?? [];
      $preview['missing_omitted_references'] = $native['missing_omitted_references'] ?? [];
      foreach ($preview['missing_omitted_references'] as $missing) {
        $preview['issues'][] = ['code' => 'MISSING_DESTINATION_REFERENCE', 'identity' => $missing,
          'message' => 'The original omitted reference must exist on the destination: ' . $missing];
      }
      $actions = [];
      foreach ($native_plan['actions'] ?? [] as $action) $actions[$action['uuid']] = $action;
      foreach ($preview['packages'] as &$row) {
        if (isset($actions[$row['uuid']])) {
          $row['native_action'] = $actions[$row['uuid']]['action'];
          $row['native_plan'] = $actions[$row['uuid']];
        }
      }
      unset($row);
    }
    catch (Throwable $error) {
      $preview['issues'][] = ['code' => 'NATIVE_PACKAGE_PREVIEW', 'class' => get_class($error), 'message' => $error->getMessage()];
    }
    finally {
      $tree->remove();
    }
    $preview['before'] = $before;
    $preview['before_sha256'] = self::hash([
      'target' => $preview['target_sha256'], 'entities' => $before, 'native_plan' => $native_plan,
    ]);
    return $preview;
  }

  private function archive(): string {
    $reference = $this->request['files']['archive'] ?? [];
    if (($reference['sha256'] ?? '') !== ($this->parameters['archive_sha256'] ?? '')
      || ($reference['bytes'] ?? NULL) !== ($this->parameters['archive_bytes'] ?? NULL)) {
      throw new RuntimeException('The retained archive is not the exact original queued edition.');
    }
    return $this->verifiedFile($reference);
  }

  private function envelope(array $value): array {
    return [
      'schema' => self::RESULT, 'status' => 'complete',
      'operation_id' => $this->request['operation_id'], 'action' => $this->request['action'],
      'intent_sha256' => $this->request['intent_sha256'],
      'observed_at' => gmdate(DATE_ATOM), 'target' => $this->target,
    ] + $value;
  }

  private function archiveManifest(string $path): array {
    [$verification, $tree] = \Drupal::service('content_packages.archive_verifier')->verifyAndOpen($path, TRUE);
    if (!($verification['valid'] ?? FALSE) || $tree === NULL) {
      $tree?->remove();
      throw new RuntimeException('The native exported archive verification failed: ' . self::canonical($verification['errors'] ?? []));
    }
    try {
      return json_decode($tree->read('content-package-manifest.json') ?? '', TRUE, 512, JSON_THROW_ON_ERROR);
    }
    finally {
      $tree->remove();
    }
  }

  private function exportArchive(): array {
    $this->loadContext();
    $roots = $this->parameters['roots'] ?? [];
    if (count($roots) !== 1) throw new InvalidArgumentException('Select exactly one original native graph root.');
    $root = $roots[0];
    $options = $this->parameters['options'];
    $destination = $this->output . '/package-graph.zip';
    if (($this->request['archive_destination'] ?? '') !== $destination || is_link($destination)) {
      throw new InvalidArgumentException('The native archive belongs in its original private operation.');
    }
    $origin_path = $this->output . '/package-export-origin.json';
    $manifest = NULL;
    $origin = is_file($origin_path) ? json_decode(file_get_contents($origin_path), TRUE, 512, JSON_THROW_ON_ERROR) : NULL;
    if ($origin !== NULL && ($origin['intent_sha256'] ?? '') !== $this->request['intent_sha256']) {
      throw new RuntimeException('The original archive source record belongs to another content operation.');
    }
    $recovered = FALSE;
    if (is_file($destination)) {
      $manifest = $this->archiveManifest($destination);
      if ($manifest !== NULL) {
        if (!$origin || $manifest['root']['entity_type'] !== $root['entity_type']
          || $manifest['root']['uuid'] !== $root['uuid']
          || $manifest['package_type'] !== $options['package_type']
          || $manifest['max_depth'] !== $options['max_depth']
          || self::canonical($origin['options'] ?? NULL) !== self::canonical($options)) {
          throw new RuntimeException('The completed native archive differs from its original graph selection.');
        }
        $recovered = TRUE;
      }
    }
    if (!$recovered) {
      if ($origin !== NULL) {
        $retained_origin = $this->output . '/package-export-origin-' . hash_file('sha256', $origin_path) . '.json';
        if (!is_file($retained_origin)) self::writeOnce($retained_origin, file_get_contents($origin_path));
        if (!unlink($origin_path)) throw new RuntimeException('Unable to advance the retained original export attempt.');
      }
      $entity = $this->entity($root['entity_type'], $root['uuid']);
      if (!$entity) throw new RuntimeException('The selected original graph root does not exist on this source site.');
      $origin = [
        'operation_id' => $this->request['operation_id'], 'intent_sha256' => $this->request['intent_sha256'],
        'roots' => $roots, 'options' => $options, 'target' => $this->target,
        'root_state' => $this->snapshot($root['entity_type'], $root['uuid']), 'observed_at' => gmdate(DATE_ATOM),
      ];
      self::writeOnce($origin_path, $origin);
      $native = \Drupal::service('content_packages.archive_exporter')->exportArchive(
        $options['package_type'], $root['entity_type'], $entity->id(), $destination,
        $options['max_depth'], FALSE, $options['unpublished'],
      );
      $manifest = $this->archiveManifest($destination);
    }
    return $this->envelope([
      'roots' => $roots, 'options' => $options, 'source_origin' => $origin,
      'recovered_original_archive' => $recovered,
      'archive' => ['filename' => 'package-graph.zip', 'bytes' => filesize($destination),
        'sha256' => hash_file('sha256', $destination), 'manifest' => $manifest],
      'native_export' => $native ?? NULL,
    ]);
  }

  private function receipt(string $operation_id, string $intent_sha256, bool $for_update = FALSE): ?array {
    $query = \Drupal::database()->select('key_value', 'record')
      ->fields('record', ['value'])
      ->condition('collection', self::RECEIPTS)
      ->condition('name', $operation_id);
    if ($for_update) $query->forUpdate();
    $raw = $query->execute()->fetchField();
    if ($raw === FALSE) return NULL;
    if (is_resource($raw)) $raw = stream_get_contents($raw);
    $value = json_decode($raw, TRUE, 512, JSON_THROW_ON_ERROR);
    if (($value['schema'] ?? '') !== 'govhub.content-packages.import-receipt.v1'
      || ($value['operation_id'] ?? '') !== $operation_id
      || ($value['intent_sha256'] ?? '') !== $intent_sha256
      || ($value['archive_sha256'] ?? '') !== ($this->parameters['archive_sha256'] ?? '')) {
      throw new RuntimeException('The native import receipt belongs to another original operation or archive.');
    }
    if (self::hash($value['after'] ?? []) !== ($value['after_sha256'] ?? '')) {
      throw new RuntimeException('The original committed content state differs from its native receipt.');
    }
    return $value;
  }

  private function lockEntities(array $identities): void {
    // Locking reads precede ordinary entity/config reads in the root
    // transaction. SQL content rows then remain stable across review and save.
    $database = \Drupal::database();
    usort($identities, static fn(array $a, array $b): int =>
      strcmp($a['entity_type'] . ':' . $a['uuid'], $b['entity_type'] . ':' . $b['uuid']));
    foreach ($identities as $identity) {
      $type = $identity['entity_type'];
      $storage = \Drupal::entityTypeManager()->getStorage($type);
      $definition = \Drupal::entityTypeManager()->getDefinition($type);
      if (!method_exists($storage, 'getBaseTable') || !method_exists($storage, 'getTableMapping')) {
        throw new RuntimeException('This transactional operator requires the native SQL storage for ' . $type . '.');
      }
      $id_column = $definition->getKey('id');
      $uuid_column = $definition->getKey('uuid');
      $ids = $database->select($storage->getBaseTable(), 'entity')
        ->fields('entity', [$id_column])->condition($uuid_column, $identity['uuid'])
        ->forUpdate()->execute()->fetchCol();
      if (!$ids) continue;
      $mapping = $storage->getTableMapping();
      $tables = $mapping->getTableNames();
      sort($tables, SORT_STRING);
      foreach ($tables as $table) {
        $columns = $mapping->getAllColumns($table);
        $column = in_array($id_column, $columns, TRUE) ? $id_column
          : (in_array('entity_id', $columns, TRUE) ? 'entity_id' : NULL);
        if ($column !== NULL) {
          $database->select($table, 'entity')->fields('entity', [$column])
            ->condition($column, $ids, 'IN')->forUpdate()->execute()->fetchCol();
        }
      }
      $storage->resetCache($ids);
    }
  }

  private function receiving(array $receipt): array {
    $this->resetEntityCaches();
    $current = $this->snapshots($receipt['identities']);
    $changes = [];
    foreach (array_unique(array_merge(array_keys($receipt['after']), array_keys($current))) as $key) {
      if (self::hash($receipt['after'][$key] ?? NULL) !== self::hash($current[$key] ?? NULL)) {
        $changes[] = ['identity' => $key, 'saved' => $receipt['after'][$key] ?? NULL,
          'current' => $current[$key] ?? NULL];
      }
    }
    return [
      'schema' => 'govhub.content-packages.receiving.v1',
      'status' => $changes === [] ? 'MATCHES_SAVED_IMPORT' : 'CONTENT_CHANGED_AFTER_SAVED_IMPORT',
      'import_operation_id' => $receipt['operation_id'],
      'archive_sha256' => $receipt['archive_sha256'],
      'saved_after_sha256' => $receipt['after_sha256'], 'current_sha256' => self::hash($current),
      'matches_saved_import' => $changes === [], 'current' => $current, 'changes' => $changes,
      'observed_at' => gmdate(DATE_ATOM),
    ];
  }

  private function matchingDiffs(string $archive): array {
    [$verification, $tree] = \Drupal::service('content_packages.archive_verifier')->verifyAndOpen($archive, TRUE);
    if (!($verification['valid'] ?? FALSE) || $tree === NULL) {
      $tree?->remove();
      throw new RuntimeException('The original archive could not be verified for its native post-import read.');
    }
    try {
      $manifest = json_decode($tree->read('content-package-manifest.json') ?? '', TRUE, 512, JSON_THROW_ON_ERROR);
      $paths = array_map(static fn(array $item): string => $tree->getDirectory() . '/' . $item['path'], $manifest['packages']);
      $packages = \Drupal::service('content_packages.manager')->validateFiles($manifest['package_type'], $paths);
      $plugin = \Drupal::service('plugin.manager.content_package_type')->createInstance($manifest['package_type']);
      $diffs = [];
      foreach ($packages as $package) {
        $entity = $this->entity($package->getEntityTypeId(), $package->getUuid());
        $changes = $entity === NULL ? ['No entity exists for this imported UUID.'] : $plugin->diffEntity($entity, $package);
        if ($changes !== []) {
          $diffs[] = ['entity_type' => $package->getEntityTypeId(), 'uuid' => $package->getUuid(), 'diffs' => $changes];
        }
      }
      return $diffs;
    }
    finally {
      $tree->remove();
    }
  }

  private function importArchive(): array {
    if (!defined('GOVHUB_CONTENT_PACKAGES_SHUTDOWN_GUARD')) {
      throw new RuntimeException('Run this import through the original guarded GovHub native worker.');
    }
    $archive = $this->archive();
    $review_ref = $this->request['files']['reviewed_preview'] ?? [];
    if (($review_ref['sha256'] ?? '') !== ($this->parameters['preview_sha256'] ?? '')) {
      throw new RuntimeException('This import requires the exact reviewed original preview bytes.');
    }
    $review_path = $this->verifiedFile($review_ref);
    $reviewed = json_decode(file_get_contents($review_path), TRUE, 512, JSON_THROW_ON_ERROR);
    $preview = $reviewed['preview'] ?? NULL;
    if (($reviewed['schema'] ?? '') !== self::RESULT || ($reviewed['action'] ?? '') !== 'preview'
      || ($reviewed['status'] ?? '') !== 'complete' || !is_array($preview)
      || ($preview['schema'] ?? '') !== self::PREVIEW
      || ($preview['archive_sha256'] ?? '') !== $this->parameters['archive_sha256']
      || ($preview['target_sha256'] ?? '') !== $this->parameters['target_sha256']
      || ($preview['before_sha256'] ?? '') !== $this->parameters['before_sha256']
      || ($preview['issues'] ?? [TRUE]) !== []) {
      throw new RuntimeException('The approved native preview does not match this original import.');
    }
    $lock = \Drupal::lock();
    $lock_name = 'govhub.content_packages.import';
    if (!$lock->acquire($lock_name, (float) ($this->request['lock_seconds'] ?? 660))) {
      throw new RuntimeException('An original native content import is already active on this Drupal site. Reopen that operation before continuing.');
    }
    $database = \Drupal::database();
    $transaction = NULL;
    $receipt = NULL;
    $recovered = FALSE;
    try {
      if ($database->inTransaction()) {
        throw new RuntimeException('The native import and its receipt require their own root Drupal transaction.');
      }
      $transaction = $database->startTransaction('govhub_content_packages_import');
      $GLOBALS['govhub_content_packages_transaction'] = ['transaction' => $transaction, 'ready_to_commit' => FALSE];
      $receipt = $this->receipt($this->request['operation_id'], $this->request['intent_sha256'], TRUE);
      if ($receipt === NULL) {
        $this->lockEntities($preview['identities']);
        $this->loadContext();
        $this->resetEntityCaches();
        $current = $this->inspectArchive($archive, FALSE);
        if ($current['issues'] !== []) {
          throw new RuntimeException('The native destination preview now has issues: ' . self::canonical($current['issues']));
        }
        if ($current['target_sha256'] !== $preview['target_sha256']
          || $current['before_sha256'] !== $preview['before_sha256']) {
          throw new RuntimeException('The native target, configuration or content changed after review. Preview this same archive against that current state.');
        }
        // ArchiveImporter verifies its own materialized tree and calls the
        // original manager's ordered, nested transactional import.
        $native = \Drupal::service('content_packages.archive_importer')->importArchive($archive, FALSE, TRUE);
        $this->resetEntityCaches();
        $diffs = $this->matchingDiffs($archive);
        if ($diffs !== []) {
          throw new RuntimeException('The native imported content still differs from its source package: ' . self::canonical($diffs));
        }
        $after = $this->snapshots($current['identities']);
        $receipt = [
          'schema' => 'govhub.content-packages.import-receipt.v1', 'status' => 'APPLIED',
          'operation_id' => $this->request['operation_id'], 'intent_sha256' => $this->request['intent_sha256'],
          'archive_sha256' => $this->parameters['archive_sha256'], 'archive_bytes' => $this->parameters['archive_bytes'],
          'edition_id' => $this->parameters['edition_id'], 'review_id' => $this->parameters['review_id'],
          'review_sha256' => $this->parameters['preview_sha256'], 'target' => $this->target,
          'target_sha256' => $current['target_sha256'], 'before_sha256' => $current['before_sha256'],
          'identities' => $current['identities'], 'before' => $current['before'],
          'native_import' => $native, 'native_post_import_diffs' => $diffs,
          'after' => $after, 'after_sha256' => self::hash($after), 'saved_at' => gmdate(DATE_ATOM),
        ];
        // Use this explicit original database connection, not a configurable
        // remote key/value backend. Entity changes and this JSON row commit
        // together; a failed receipt insert rolls the entire import back.
        $database->insert('key_value')->fields([
          'collection' => self::RECEIPTS, 'name' => $this->request['operation_id'],
          'value' => self::canonical($receipt),
        ])->execute();
        $saved = $this->receipt($this->request['operation_id'], $this->request['intent_sha256']);
        if (self::canonical($saved) !== self::canonical($receipt)) {
          throw new RuntimeException('The native transaction did not retain its exact import receipt.');
        }
      }
      else {
        $recovered = TRUE;
        $this->loadContext();
      }
      // Only a completely applied import plus its verified receipt can reach
      // Drupal's ordinary transaction commit or commit-on-shutdown behavior.
      $GLOBALS['govhub_content_packages_transaction']['ready_to_commit'] = TRUE;
      $GLOBALS['govhub_content_packages_transaction'] = NULL;
      if (method_exists($transaction, 'commitOrRelease')) {
        $transaction->commitOrRelease();
      }
      unset($transaction);
      $transaction = NULL;
    }
    catch (Throwable $error) {
      if ($transaction !== NULL) {
        $transaction->rollBack();
        $GLOBALS['govhub_content_packages_transaction'] = NULL;
        unset($transaction);
        $transaction = NULL;
      }
      $this->resetEntityCaches();
      throw $error;
    }
    finally {
      $lock->release($lock_name);
    }
    return $this->envelope([
      'import_state' => $recovered ? 'RECOVERED_ORIGINAL_IMPORT' : 'APPLIED',
      'receipt' => $receipt, 'receiving' => $this->receiving($receipt),
    ]);
  }

  public function run(): array {
    if ($this->request['action'] === 'export') return $this->exportArchive();
    if ($this->request['action'] === 'import') return $this->importArchive();
    $this->loadContext();
    $archive = $this->archive();
    if ($this->request['action'] === 'preview') {
      $this->resetEntityCaches();
      return $this->envelope(['preview' => $this->inspectArchive($archive, TRUE)]);
    }
    $receipt = $this->receipt($this->parameters['import_operation_id'], $this->parameters['import_intent_sha256']);
    return $this->envelope([
      'receipt' => $receipt,
      'receiving' => $receipt === NULL ? [
        'schema' => 'govhub.content-packages.receiving.v1', 'status' => 'NO_COMMITTED_IMPORT_RECEIPT',
        'import_operation_id' => $this->parameters['import_operation_id'],
        'archive_sha256' => $this->parameters['archive_sha256'], 'observed_at' => gmdate(DATE_ATOM),
      ] : $this->receiving($receipt),
    ]);
  }

  public static function saveResult(string $path, array $result): void {
    self::writeOnce($path, $result);
  }
}

if (empty($extra[0]) || !is_string($extra[0])) {
  throw new InvalidArgumentException('Supply the original private native request JSON path.');
}
$request_path = $extra[0];
if (is_link($request_path) || !is_file($request_path)) {
  throw new InvalidArgumentException('The native request must be an original regular file.');
}
$request = json_decode(file_get_contents($request_path), TRUE, 512, JSON_THROW_ON_ERROR);
$output_dir = realpath($request['output_dir'] ?? '') ?: '';
$result_path = $request['result_path'] ?? '';
if ($output_dir === '' || dirname($result_path) !== $output_dir || dirname(realpath($request_path)) !== $output_dir) {
  throw new InvalidArgumentException('The native request and result belong in the same original private operation.');
}
try {
  $result = (new GovHubContentPackagesBridge($request))->run();
}
catch (Throwable $error) {
  $result = [
    'schema' => 'govhub.content-packages.native-result.v1', 'status' => 'failed',
    'operation_id' => $request['operation_id'] ?? NULL, 'action' => $request['action'] ?? NULL,
    'intent_sha256' => $request['intent_sha256'] ?? NULL,
    'observed_at' => gmdate(DATE_ATOM),
    'error' => ['class' => get_class($error), 'message' => $error->getMessage()],
  ];
}
GovHubContentPackagesBridge::saveResult($result_path, $result);
print json_encode([
  'schema' => $result['schema'], 'status' => $result['status'],
  'result_path' => $result_path, 'sha256' => hash_file('sha256', $result_path),
], JSON_THROW_ON_ERROR) . "\n";
