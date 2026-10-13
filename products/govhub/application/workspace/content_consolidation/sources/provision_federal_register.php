<?php
/**
 * Provision the Federal Register receiving model through installed Drupal APIs.
 *
 * Run inside the original equipped site:
 *   drush php:script provision_federal_register --script-path=ABS_SOURCE_DIRECTORY
 *
 * Optional first extra argument: an ordinary JSON request file containing
 * {"schema":"govhub.federal-register-schema-request.v1","receiver_uid":"EXISTING_UID"}.
 * The selected existing account receives the fr_receiving role. Account creation
 * and credentials remain with the original site's operator.
 *
 * Core API source: drupal/drupal tag 11.4.9, MediaType, MediaSourceBase, File
 * media source, FieldStorageConfig/FieldConfig, EntityViewDisplay and
 * EntityFormDisplay. The same native APIs are supported by Drupal 10.6.
 */
use Drupal\Core\Entity\Entity\EntityFormDisplay;
use Drupal\Core\Entity\Entity\EntityViewDisplay;
use Drupal\Core\Url;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\link\LinkItemInterface;
use Drupal\media\Entity\MediaType;
use Drupal\node\Entity\NodeType;
use Drupal\taxonomy\Entity\Vocabulary;
use Drupal\user\Entity\Role;
use Drupal\user\Entity\User;

final class GovHubFederalRegisterSchema {
  private const SCHEMA = 'govhub.federal-register-native-schema.v1';
  private const STATE_KEY = 'govhub_consolidation.federal_register_schema.v1';
  private const ROLE = 'fr_receiving';
  private const SOURCE_FIELD = 'field_fr_pdf_file';
  private const REQUIRED_MODULES = [
    'node', 'taxonomy', 'text', 'datetime', 'link', 'file', 'media',
    'jsonapi', 'migrate', 'path_alias',
  ];

  private array $changes = [];
  private array $fields = [];

  private static function fail(bool $condition, string $message): void {
    if (!$condition) {
      throw new \RuntimeException($message);
    }
  }

  private static function sorted($value) {
    if (!is_array($value)) {
      return $value;
    }
    if (!array_is_list($value)) {
      ksort($value);
    }
    foreach ($value as &$item) {
      $item = self::sorted($item);
    }
    return $value;
  }

  private static function equal($left, $right): bool {
    return self::sorted($left) === self::sorted($right);
  }

  private function note(string $entity, string $id, string $action): void {
    $this->changes[] = ['entity_type' => $entity, 'id' => $id, 'action' => $action];
  }

  private function definitions(): array {
    $reference = static fn(string $target, string $bundle): array => [
      'handler' => 'default:' . $target,
      'handler_settings' => [
        'target_bundles' => [$bundle => $bundle],
        'sort' => ['field' => '_none', 'direction' => 'ASC'],
        'auto_create' => FALSE,
      ],
    ];
    return [
      ['entity' => 'taxonomy_term', 'bundle' => 'fr_agencies',
        'name' => 'field_fr_agency_id', 'type' => 'string',
        'label' => 'Original Federal Register agency ID', 'required' => TRUE,
        'storage' => ['max_length' => 255]],
      ['entity' => 'node', 'bundle' => 'fr_document',
        'name' => 'body', 'type' => 'text_with_summary',
        'label' => 'Original document body', 'required' => FALSE,
        'settings' => ['display_summary' => TRUE]],
      ['entity' => 'node', 'bundle' => 'fr_document',
        'name' => 'field_fr_title', 'type' => 'text_long',
        'label' => 'Complete original title', 'required' => TRUE],
      ['entity' => 'node', 'bundle' => 'fr_document',
        'name' => 'field_fr_document_number', 'type' => 'string',
        'label' => 'Original document number', 'required' => TRUE,
        'storage' => ['max_length' => 255]],
      ['entity' => 'node', 'bundle' => 'fr_document',
        'name' => 'field_fr_publication_date', 'type' => 'datetime',
        'label' => 'Publication date', 'required' => TRUE,
        'storage' => ['datetime_type' => 'date']],
      ['entity' => 'node', 'bundle' => 'fr_document',
        'name' => 'field_fr_agencies', 'type' => 'entity_reference',
        'label' => 'Issuing agencies', 'required' => FALSE,
        'cardinality' => -1, 'storage' => ['target_type' => 'taxonomy_term'],
        'settings' => $reference('taxonomy_term', 'fr_agencies')],
      ['entity' => 'node', 'bundle' => 'fr_document',
        'name' => 'field_fr_pdf', 'type' => 'entity_reference',
        'label' => 'Original PDF documents', 'required' => FALSE,
        'cardinality' => -1, 'storage' => ['target_type' => 'media'],
        'settings' => $reference('media', 'fr_pdf')],
      ['entity' => 'node', 'bundle' => 'fr_document',
        'name' => 'field_fr_source_url', 'type' => 'link',
        'label' => 'Federal Register source', 'required' => TRUE,
        'settings' => ['link_type' => LinkItemInterface::LINK_EXTERNAL, 'title' => 0]],
      ['entity' => 'node', 'bundle' => 'fr_document',
        'name' => 'field_fr_document_type', 'type' => 'string',
        'label' => 'Original document type', 'required' => FALSE,
        'storage' => ['max_length' => 255]],
      ['entity' => 'media', 'bundle' => 'fr_pdf',
        'name' => self::SOURCE_FIELD, 'type' => 'file',
        'label' => 'Original PDF file', 'required' => TRUE,
        'storage' => ['target_type' => 'file', 'uri_scheme' => 'public',
          'display_field' => FALSE, 'display_default' => FALSE],
        'settings' => ['file_extensions' => 'pdf', 'file_directory' => 'federal-register',
          'max_filesize' => '', 'description_field' => TRUE]],
    ];
  }

  private function checkBundleCollisions(): void {
    $media = MediaType::load('fr_pdf');
    if ($media) {
      self::fail($media->get('source') === 'file',
        'Existing media type fr_pdf uses another native source plugin.');
      $configuration = $media->getSource()->getConfiguration();
      self::fail(($configuration['source_field'] ?? '') === self::SOURCE_FIELD,
        'Existing media type fr_pdf selects another source field.');
    }
    $role = Role::load(self::ROLE);
    if ($role) {
      $permissions = $role->getPermissions();
      sort($permissions);
      self::fail($permissions === ['access content', 'view media'],
        'Existing role fr_receiving has a different permission contract.');
      self::fail(!$role->isAdmin(), 'Existing role fr_receiving is an administrator role.');
    }
    // The native entity API loads each specific bundle/config entity by ID.
    foreach ($this->fields as $spec) {
      $storage = FieldStorageConfig::loadByName($spec['entity'], $spec['name']);
      if ($storage) {
        self::fail(!$storage->isLocked(),
          'Existing field storage is locked: ' . $storage->id());
        self::fail($storage->getType() === $spec['type'],
          'Existing field storage has another type: ' . $storage->id());
        self::fail($storage->getCardinality() === ($spec['cardinality'] ?? 1),
          'Existing field storage has another cardinality: ' . $storage->id());
        foreach ($spec['storage'] ?? [] as $name => $value) {
          self::fail(self::equal($storage->getSetting($name), $value),
            'Existing field storage has another ' . $name . ': ' . $storage->id());
        }
      }
      $field = FieldConfig::loadByName($spec['entity'], $spec['bundle'], $spec['name']);
      if ($field) {
        self::fail($field->getType() === $spec['type'],
          'Existing bundle field has another type: ' . $field->id());
        if ($spec['type'] === 'entity_reference') {
          self::fail($field->getSetting('handler') === $spec['settings']['handler'],
            'Existing reference field uses another selection handler: ' . $field->id());
          $settings = $field->getSetting('handler_settings');
          self::fail(self::equal($settings['target_bundles'] ?? [], $spec['settings']['handler_settings']['target_bundles']),
            'Existing reference field selects another target bundle: ' . $field->id());
        }
      }
    }
  }

  private function bundles(): void {
    $vocabulary = Vocabulary::load('fr_agencies');
    if (!$vocabulary) {
      $vocabulary = Vocabulary::create([
        'vid' => 'fr_agencies', 'name' => 'Federal Register agencies',
        'description' => 'Original issuing agencies retained by the Federal Register source edition.',
      ]);
      $vocabulary->save();
      $this->note('taxonomy_vocabulary', $vocabulary->id(), 'created');
    }
    else {
      $this->note('taxonomy_vocabulary', $vocabulary->id(), 'reused');
    }

    $type = NodeType::load('fr_document');
    if (!$type) {
      $type = NodeType::create([
        'type' => 'fr_document', 'name' => 'Federal Register document',
        'description' => 'Source-native documents, agency relationships and original PDF media.',
        'new_revision' => TRUE, 'display_submitted' => FALSE,
        'help' => 'Use the original document number as the node title. Store the complete source title in Complete original title.',
      ]);
      $type->save();
      $this->note('node_type', $type->id(), 'created');
    }
    else {
      $this->note('node_type', $type->id(), 'reused');
    }

    $media = MediaType::load('fr_pdf');
    if (!$media) {
      $media = MediaType::create([
        'id' => 'fr_pdf', 'label' => 'Federal Register PDF',
        'description' => 'An original PDF retained as a native file and referenced by a Federal Register document.',
        'source' => 'file', 'status' => TRUE, 'new_revision' => TRUE,
        'queue_thumbnail_downloads' => FALSE,
        'source_configuration' => ['source_field' => self::SOURCE_FIELD],
        'field_map' => [],
      ]);
      $media->save();
      $this->note('media_type', $media->id(), 'created');
    }
    else {
      $this->note('media_type', $media->id(), 'reused');
    }
  }

  private function fields(): void {
    foreach ($this->fields as $spec) {
      $storage = FieldStorageConfig::loadByName($spec['entity'], $spec['name']);
      if (!$storage) {
        $storage = FieldStorageConfig::create([
          'field_name' => $spec['name'], 'entity_type' => $spec['entity'],
          'type' => $spec['type'], 'cardinality' => $spec['cardinality'] ?? 1,
          'settings' => $spec['storage'] ?? [], 'translatable' => FALSE,
        ]);
        $storage->save();
        $this->note('field_storage_config', $storage->id(), 'created');
      }
      $field = FieldConfig::loadByName($spec['entity'], $spec['bundle'], $spec['name']);
      if (!$field) {
        $field = FieldConfig::create([
          'field_storage' => $storage, 'bundle' => $spec['bundle'],
          'label' => $spec['label'], 'required' => $spec['required'],
          'settings' => $spec['settings'] ?? [], 'translatable' => FALSE,
        ]);
        $field->save();
        $this->note('field_config', $field->id(), 'created');
      }
      else {
        $before = $field->toArray();
        $field->setLabel($spec['label']);
        $field->setRequired($spec['required']);
        $field->setSettings($spec['settings'] ?? []);
        if (!self::equal($before, $field->toArray())) {
          $field->save();
          $this->note('field_config', $field->id(), 'updated');
        }
        else {
          $this->note('field_config', $field->id(), 'verified');
        }
      }
    }
  }

  private function display(string $entity, string $bundle, string $mode, array $components, bool $form = FALSE): void {
    $class = $form ? EntityFormDisplay::class : EntityViewDisplay::class;
    $id = "$entity.$bundle.$mode";
    $display = $class::load($id);
    if (!$display) {
      $display = $class::create([
        'targetEntityType' => $entity, 'bundle' => $bundle, 'mode' => $mode, 'status' => TRUE,
      ]);
    }
    $before = $display->toArray();
    foreach ($components as $field => $options) {
      $display->setComponent($field, $options);
    }
    // Generated thumbnails are unrelated to original PDF receiving.
    if ($entity === 'media' && !$form) {
      $display->removeComponent('thumbnail');
    }
    if ($display->isNew() || !self::equal($before, $display->toArray())) {
      $display->save();
      $this->note($form ? 'entity_form_display' : 'entity_view_display', $id, 'saved');
    }
    else {
      $this->note($form ? 'entity_form_display' : 'entity_view_display', $id, 'verified');
    }
  }

  private function displays(): void {
    $this->display('taxonomy_term', 'fr_agencies', 'default', [
      'description' => ['type' => 'text_default', 'label' => 'hidden', 'weight' => 0],
      'field_fr_agency_id' => ['type' => 'string', 'label' => 'above', 'weight' => 1],
    ]);
    $this->display('taxonomy_term', 'fr_agencies', 'default', [
      'name' => ['type' => 'string_textfield', 'weight' => 0],
      'description' => ['type' => 'text_textarea', 'weight' => 1],
      'field_fr_agency_id' => ['type' => 'string_textfield', 'weight' => 2],
    ], TRUE);
    $this->display('node', 'fr_document', 'default', [
      'field_fr_title' => ['type' => 'text_default', 'label' => 'hidden', 'weight' => 0],
      'field_fr_document_number' => ['type' => 'string', 'label' => 'above', 'weight' => 1],
      'field_fr_publication_date' => ['type' => 'datetime_custom', 'label' => 'above', 'weight' => 2,
        'settings' => ['date_format' => 'Y-m-d', 'timezone_override' => 'UTC']],
      'field_fr_agencies' => ['type' => 'entity_reference_label', 'label' => 'above', 'weight' => 3,
        'settings' => ['link' => TRUE]],
      'body' => ['type' => 'text_default', 'label' => 'hidden', 'weight' => 4],
      'field_fr_pdf' => ['type' => 'entity_reference_entity_view', 'label' => 'above', 'weight' => 5,
        'settings' => ['view_mode' => 'default', 'link' => FALSE]],
      'field_fr_source_url' => ['type' => 'link', 'label' => 'above', 'weight' => 6,
        'settings' => ['trim_length' => 160, 'url_only' => TRUE, 'url_plain' => FALSE, 'rel' => 'noopener noreferrer', 'target' => '_blank']],
      'field_fr_document_type' => ['type' => 'string', 'label' => 'above', 'weight' => 7],
    ]);
    $node_form = [
      'title' => ['type' => 'string_textfield', 'weight' => 0],
      'field_fr_title' => ['type' => 'text_textarea', 'weight' => 1, 'settings' => ['rows' => 4]],
      'field_fr_document_number' => ['type' => 'string_textfield', 'weight' => 2],
      'field_fr_publication_date' => ['type' => 'datetime_default', 'weight' => 3],
      'field_fr_agencies' => ['type' => 'entity_reference_autocomplete_tags', 'weight' => 4],
      'body' => ['type' => 'text_textarea_with_summary', 'weight' => 5, 'settings' => ['rows' => 14, 'summary_rows' => 3]],
      'field_fr_pdf' => ['type' => 'entity_reference_autocomplete_tags', 'weight' => 6],
      'field_fr_source_url' => ['type' => 'link_default', 'weight' => 7],
      'field_fr_document_type' => ['type' => 'string_textfield', 'weight' => 8],
      'status' => ['type' => 'boolean_checkbox', 'weight' => 9],
    ];
    $this->display('node', 'fr_document', 'default', $node_form, TRUE);
    $this->display('media', 'fr_pdf', 'default', [
      'name' => ['type' => 'string', 'label' => 'hidden', 'weight' => 0],
      self::SOURCE_FIELD => ['type' => 'file_default', 'label' => 'hidden', 'weight' => 1],
    ]);
    $this->display('media', 'fr_pdf', 'default', [
      'name' => ['type' => 'string_textfield', 'weight' => 0],
      self::SOURCE_FIELD => ['type' => 'file_generic', 'weight' => 1],
      'status' => ['type' => 'boolean_checkbox', 'weight' => 2],
    ], TRUE);
  }

  private function receiver(array $request): array {
    $role = Role::load(self::ROLE);
    if (!$role) {
      $role = Role::create([
        'id' => self::ROLE, 'label' => 'Federal Register receiving reader',
        'is_admin' => FALSE, 'permissions' => ['access content', 'view media'],
      ]);
      $role->save();
      $this->note('user_role', self::ROLE, 'created');
    }
    $uid = $request['receiver_uid'] ?? NULL;
    if ($uid !== NULL) {
      self::fail(is_string($uid) && preg_match('/^[1-9][0-9]*$/D', $uid),
        'receiver_uid must be the exact positive ID of the selected existing account.');
      $account = User::load($uid);
      self::fail($account && $account->isActive(), 'The selected receiving account does not exist or is inactive.');
      if (!$account->hasRole(self::ROLE)) {
        $account->addRole(self::ROLE);
        $account->save();
        $this->note('user', (string) $account->id(), 'receiving_role_added');
      }
    }
    return ['role_id' => self::ROLE, 'permissions' => $role->getPermissions(),
      'selected_account_uid' => $uid,
      'authentication' => 'Use the selected existing account and the original private JSON:API credential environment reference.'];
  }

  private function verify(): array {
    \Drupal::service('entity_field.manager')->clearCachedFieldDefinitions();
    $observed = [];
    foreach ($this->fields as $spec) {
      $field = FieldConfig::loadByName($spec['entity'], $spec['bundle'], $spec['name']);
      $storage = $field?->getFieldStorageDefinition();
      self::fail($field && $storage && $field->getType() === $spec['type']
        && $storage->getCardinality() === ($spec['cardinality'] ?? 1)
        && $field->isRequired() === $spec['required'], 'The original API did not retain the selected field: ' . $spec['name']);
      foreach ($spec['storage'] ?? [] as $name => $expected) {
        self::fail(self::equal($storage->getSetting($name), $expected),
          'The retained field storage setting differs: ' . $storage->id() . ':' . $name);
      }
      $observed[] = ['entity_type' => $spec['entity'], 'bundle' => $spec['bundle'],
        'field' => $field->getName(), 'field_config_id' => $field->id(), 'storage_id' => $storage->id(),
        'type' => $field->getType(), 'cardinality' => $storage->getCardinality(),
        'required' => $field->isRequired(), 'storage_settings' => $storage->getSettings(),
        'field_settings' => $field->getSettings()];
    }
    $media = MediaType::load('fr_pdf');
    $definition = $media->getSource()->getSourceFieldDefinition($media);
    self::fail($definition && $definition->getName() === self::SOURCE_FIELD
      && $definition->getType() === 'file' && $definition->isRequired(),
      'The native File media source does not select its required original PDF field.');
    return $observed;
  }

  public function run(array $request = []): array {
    if ($request) {
      self::fail(($request['schema'] ?? '') === 'govhub.federal-register-schema-request.v1',
        'Use the original Federal Register native schema request.');
      self::fail(!array_diff(array_keys($request), ['schema', 'receiver_uid']),
        'The schema request contains an unsupported property.');
    }
    $needed = [];
    foreach (self::REQUIRED_MODULES as $module) {
      if (!\Drupal::moduleHandler()->moduleExists($module)) {
        $needed[] = $module;
      }
    }
    if ($needed) {
      \Drupal::service('module_installer')->install($needed);
      foreach ($needed as $module) {
        self::fail(\Drupal::moduleHandler()->moduleExists($module),
          'The installed site did not enable required core module ' . $module);
        $this->note('module', $module, 'enabled');
      }
    }

    $this->fields = $this->definitions();
    $this->checkBundleCollisions();
    $this->bundles();
    $this->fields();
    $this->displays();
    $receiving = $this->receiver($request);
    $fields = $this->verify();

    // A native route rebuild exposes the actual bundle resource routes.
    \Drupal::service('router.builder')->rebuild();
    $repository = \Drupal::service('jsonapi.resource_type.repository');
    $resources = [];
    foreach ([['taxonomy_term', 'fr_agencies'], ['file', 'file'], ['media', 'fr_pdf'], ['node', 'fr_document']] as [$entity, $bundle]) {
      $resource = $repository->get($entity, $bundle);
      self::fail($resource && !$resource->isInternal() && $resource->isLocatable(),
        'The selected native JSON:API resource is unavailable: ' . "$entity.$bundle");
      $resources[] = ['entity_type' => $entity, 'bundle' => $bundle,
        'type' => $resource->getTypeName(),
        'collection_url' => Url::fromRoute('jsonapi.' . $resource->getTypeName() . '.collection', [],
          ['absolute' => TRUE])->toString(),
        'individual_route' => 'jsonapi.' . $resource->getTypeName() . '.individual'];
    }
    $plain_text = \Drupal::entityTypeManager()->getStorage('filter_format')->load('plain_text');
    self::fail((bool) $plain_text, 'The installed core plain_text format is unavailable.');
    $record = [
      'schema' => self::SCHEMA, 'status' => 'PROVISIONED', 'observed_at' => gmdate(DATE_ATOM),
      'drupal_version' => \Drupal::VERSION, 'site_root' => \Drupal::root(),
      'bundles' => ['agencies' => 'fr_agencies', 'documents' => 'fr_document', 'pdf_media' => 'fr_pdf'],
      'media_source' => ['plugin' => 'file', 'field' => self::SOURCE_FIELD, 'required' => TRUE,
        'allowed_extensions' => 'pdf', 'file_scheme' => 'public'],
      'fields' => $fields, 'resources' => $resources, 'receiving' => $receiving,
      'text_format' => 'plain_text', 'jsonapi_read_only' => \Drupal::config('jsonapi.settings')->get('read_only'),
      'native_mapping' => [
        'agencies' => 'govhub_fr_govhub_agencies', 'files' => 'govhub_fr_govhub_files',
        'media' => 'govhub_fr_govhub_media', 'documents' => 'govhub_fr_govhub_documents',
        'aliases' => 'govhub_fr_govhub_aliases',
        'node_title_source' => 'document_number', 'complete_title_field' => 'field_fr_title',
        'date_format' => 'Y-m-d', 'media_file_target_property' => self::SOURCE_FIELD . '/target_id',
        'document_media_target_property' => 'field_fr_pdf',
        'destination_validation' => TRUE,
      ],
      'changes' => $this->changes,
    ];
    \Drupal::state()->set(self::STATE_KEY, [
      'schema' => self::SCHEMA, 'observed_at' => $record['observed_at'],
      'definition_sha256' => hash('sha256', json_encode(self::sorted($fields), JSON_THROW_ON_ERROR)),
      'bundles' => $record['bundles'], 'media_source' => $record['media_source'],
    ]);
    return $record;
  }
}

$request = [];
if (isset($extra[0]) && $extra[0] !== '') {
  $path = $extra[0];
  if (!is_string($path) || !is_file($path) || is_link($path) || filesize($path) > 65536) {
    throw new \InvalidArgumentException('Choose the original ordinary schema-request JSON file within 64 KiB.');
  }
  $request = json_decode(file_get_contents($path), TRUE, 64, JSON_THROW_ON_ERROR);
  if (!is_array($request)) {
    throw new \InvalidArgumentException('The schema request must be a JSON object.');
  }
}
$provisioner = new GovHubFederalRegisterSchema();
$result = $provisioner->run($request);
fwrite(STDOUT, json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) . PHP_EOL);
