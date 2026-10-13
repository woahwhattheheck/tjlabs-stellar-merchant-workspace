<?php
declare(strict_types=1);
/** Own GovHub commissioning receiving site content, using the installed original Drupal API. */
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\node\Entity\NodeType;
use Drupal\node\Entity\Node;
use Drupal\taxonomy\Entity\Vocabulary;
use Drupal\taxonomy\Entity\Term;
use Drupal\file\Entity\File;
use Drupal\language\Entity\ConfigurableLanguage;

if (empty($extra[0]) || !is_file($extra[0]) || is_link($extra[0])) {
  throw new InvalidArgumentException('Select the retained original receiving input.');
}
$input = json_decode(file_get_contents($extra[0]), TRUE, 512, JSON_THROW_ON_ERROR);
if (($input['schema'] ?? '') !== 'govhub.commissioning.native-case.v1'
    || ($input['operation'] ?? '') !== 'GOVHUB-CONTENT-PACKAGES-COMMISSIONING-V1'
    || !in_array($input['role'] ?? '', ['source', 'destination'], TRUE)
    || !in_array($input['edition'] ?? '', ['initial', 'corrected'], TRUE)
    || ($input['role'] === 'destination' && $input['edition'] !== 'initial')) {
  throw new InvalidArgumentException('Use this original site role and content edition.');
}
$site_uuid = \Drupal::config('system.site')->get('uuid');
if (!is_string($site_uuid) || $site_uuid !== ($input['site_uuid'] ?? NULL)) {
  throw new RuntimeException('The selected original site UUID changed.');
}
if (!\Drupal::moduleHandler()->moduleExists('content_packages')) {
  throw new RuntimeException('Install and enable the original Content Packages module first.');
}
$marker = 'govhub.commissioning.case.' . $input['role'] . '.' . $input['edition'];
$input_sha = hash('sha256', file_get_contents($extra[0]));
$prior = \Drupal::state()->get($marker);
if ($prior !== NULL) {
  if (($prior['input_sha256'] ?? '') !== $input_sha) throw new RuntimeException('The original native case input changed.');
  print json_encode($prior, JSON_THROW_ON_ERROR) . "\n";
  return;
}
$bundle = 'govhub_commissioning_page';
if (!NodeType::load($bundle)) NodeType::create(['type' => $bundle, 'name' => 'GovHub commissioning receiving page'])->save();
if (!Vocabulary::load('govhub_commissioning_topics')) Vocabulary::create(['vid' => 'govhub_commissioning_topics', 'name' => 'GovHub commissioning topics'])->save();
if (!ConfigurableLanguage::load('es')) ConfigurableLanguage::createFromLangcode('es')->save();

function govhub_commissioningReceivingField(string $name, string $type, array $storage_settings, array $settings, int $cardinality, bool $translatable): void {
  $storage = FieldStorageConfig::loadByName('node', $name);
  if (!$storage) {
    $storage = FieldStorageConfig::create(['field_name' => $name, 'entity_type' => 'node',
      'type' => $type, 'cardinality' => $cardinality, 'settings' => $storage_settings]);
    $storage->save();
  }
  if ($storage->getType() !== $type) throw new RuntimeException('An unrelated field already owns ' . $name);
  if (!FieldConfig::loadByName('node', 'govhub_commissioning_page', $name)) {
    FieldConfig::create(['field_name' => $name, 'entity_type' => 'node', 'bundle' => 'govhub_commissioning_page',
      'label' => $name, 'settings' => $settings, 'translatable' => $translatable])->save();
  }
}
govhub_commissioningReceivingField('body', 'text_with_summary', [], [], 1, TRUE);
govhub_commissioningReceivingField('field_govhub_commissioning_related', 'entity_reference', ['target_type' => 'node'],
  ['handler' => 'default:node', 'handler_settings' => ['target_bundles' => ['govhub_commissioning_page' => 'govhub_commissioning_page']]], -1, FALSE);
govhub_commissioningReceivingField('field_govhub_commissioning_topics', 'entity_reference', ['target_type' => 'taxonomy_term'],
  ['handler' => 'default:taxonomy_term', 'handler_settings' => ['target_bundles' => ['govhub_commissioning_topics' => 'govhub_commissioning_topics']]], -1, FALSE);
govhub_commissioningReceivingField('field_govhub_commissioning_document', 'file', ['uri_scheme' => 'public'],
  ['file_extensions' => 'txt', 'file_directory' => 'govhub_commissioning-receiving'], 1, FALSE);
\Drupal::service('content_translation.manager')->setEnabled('node', $bundle, TRUE);

$ids = [
  'root' => '5cac3f15-ec81-4f2e-8e87-691645eb6850',
  'guide' => '8757d3b4-17ab-411b-b0a2-0478bcbad9f8',
  'accessibility' => '0e744646-a7c3-4ca5-aeb0-4845d7de46de',
  'topic' => '974fda37-2fa8-4eb6-9cf5-a93800dc0d39',
  'document' => 'cdb7f96e-5a62-46fd-b2a3-5ebfb82bb5b8',
];
function govhub_commissioningReceivingEntity(string $type, string $uuid): ?object {
  $rows = \Drupal::entityTypeManager()->getStorage($type)->loadByProperties(['uuid' => $uuid]);
  if (count($rows) > 1) throw new RuntimeException('Repeated receiving UUID: ' . $uuid);
  return $rows ? reset($rows) : NULL;
}
function govhub_commissioningReceivingNode(string $uuid, string $title, string $body, bool $published = TRUE): object {
  $node = govhub_commissioningReceivingEntity('node', $uuid);
  if ($node && $node->bundle() !== 'govhub_commissioning_page') throw new RuntimeException('The receiving UUID belongs to another bundle.');
  $node ??= Node::create(['type' => 'govhub_commissioning_page', 'uuid' => $uuid, 'langcode' => 'en', 'uid' => 1]);
  $node->setTitle($title);
  $node->set('body', ['value' => $body, 'format' => 'plain_text', 'summary' => '']);
  if ($published) $node->setPublished(); else $node->setUnpublished();
  $node->setNewRevision(TRUE);
  return $node;
}
$database = \Drupal::database();
$transaction = $database->startTransaction('govhub_govhub_commissioning_owned_content');
try {
  if ($input['role'] === 'destination') {
    $root = govhub_commissioningReceivingNode($ids['root'], 'Community services: current destination',
      'The current destination page remains published while the corrected archive is reviewed.');
    $root->save();
    $result = ['schema' => 'govhub.commissioning.native-case-result.v1', 'role' => 'destination',
      'edition' => 'initial', 'site_uuid' => $site_uuid, 'input_sha256' => $input_sha,
      'root' => ['entity_type' => 'node', 'uuid' => $root->uuid(), 'id' => (string) $root->id()],
      'published' => $root->isPublished(), 'identities' => $ids];
  }
  else {
    $corrected = $input['edition'] === 'corrected';
    $guide = govhub_commissioningReceivingNode($ids['guide'], 'Prepare a community service request',
      "Bring the completed request and the listed supporting documents.\nThe receiving team reviews the original request.");
    $guide->save();
    $related = [['target_id' => $guide->id()]];
    if ($corrected) {
      $access = govhub_commissioningReceivingNode($ids['accessibility'], 'Accessible appointment arrangements',
        "Ask the receiving team for the required access arrangements.\nInclude the original request reference.");
      $access->save();
      $related[] = ['target_id' => $access->id()];
    }
    $topic = govhub_commissioningReceivingEntity('taxonomy_term', $ids['topic']);
    $topic ??= Term::create(['vid' => 'govhub_commissioning_topics', 'uuid' => $ids['topic'], 'name' => 'Community services']);
    $topic->save();
    $directory = 'public://govhub_commissioning-receiving';
    \Drupal::service('file_system')->prepareDirectory($directory, \Drupal\Core\File\FileSystemInterface::CREATE_DIRECTORY);
    $uri = $directory . '/community-service-intake.txt';
    $document = $corrected
      ? "Community service intake\nReceiving hours: Monday to Friday, 09:00 to 17:00.\nAccess arrangements are available through the receiving team.\n"
      : "Community service intake\nReceiving hours: draft schedule awaiting review.\n";
    if (file_put_contents($uri, $document) !== strlen($document)) throw new RuntimeException('Unable to retain the complete original attachment.');
    $file = govhub_commissioningReceivingEntity('file', $ids['document']);
    $file ??= File::create(['uuid' => $ids['document'], 'uid' => 1, 'uri' => $uri, 'filename' => 'community-service-intake.txt']);
    $file->setFileUri($uri);
    $file->set('filesize', strlen($document));
    $file->setPermanent();
    $file->save();
    $root = govhub_commissioningReceivingNode($ids['root'], 'Community services',
      $corrected
        ? "Submit the completed service request to the receiving team.\nReceiving hours are Monday to Friday, 09:00 to 17:00.\nRead the preparation guide and accessibility arrangements before the appointment."
        : "Submit the service request to the receiving team.\nThe opening schedule is a draft and needs an editor's correction.");
    $root->set('field_govhub_commissioning_related', $related);
    $root->set('field_govhub_commissioning_topics', [['target_id' => $topic->id()]]);
    $root->set('field_govhub_commissioning_document', [['target_id' => $file->id(), 'description' => 'Community service intake', 'display' => 1]]);
    $spanish = $root->hasTranslation('es') ? $root->getTranslation('es') : $root->addTranslation('es');
    $spanish->setTitle('Servicios comunitarios');
    $spanish->set('body', ['value' => $corrected
      ? 'El equipo recibe solicitudes de lunes a viernes, de 09:00 a 17:00. Consulte la guía de preparación y las opciones de acceso.'
      : 'El horario está pendiente de revisión editorial.', 'format' => 'plain_text', 'summary' => '']);
    $spanish->setPublished();
    $root->save();
    $result = ['schema' => 'govhub.commissioning.native-case-result.v1', 'role' => 'source',
      'edition' => $input['edition'], 'site_uuid' => $site_uuid, 'input_sha256' => $input_sha,
      'root' => ['entity_type' => 'node', 'uuid' => $root->uuid(), 'id' => (string) $root->id()],
      'published' => $root->isPublished(), 'languages' => array_keys($root->getTranslationLanguages()),
      'related_ids' => array_column($related, 'target_id'), 'identities' => $ids,
      'asset' => ['uri' => $uri, 'bytes' => strlen($document), 'sha256' => hash('sha256', $document)]];
  }
  \Drupal::state()->set($marker, $result);
  if (method_exists($transaction, 'commitOrRelease')) $transaction->commitOrRelease();
  unset($transaction);
}
catch (Throwable $error) {
  $transaction->rollBack();
  throw $error;
}
print json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
