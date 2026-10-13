<?php
/**
 * Prepare/read one isolated site's native accounts through original Drupal APIs.
 *
 * drush php:script prepare_native_site --script-path=ABS_PRIVATE_SCRIPTS REQUEST
 * The request points to private files; no password or cookie is printed.
 */

use Drupal\Core\Database\Database;
use Drupal\user\Entity\User;

$extra = $extra ?? [];
$input = $extra[0] ?? null;
if (!is_string($input) || !is_file($input) || is_link($input) || filesize($input) > 65536) {
  throw new \RuntimeException('Select the retained native preparation request.');
}
$request = json_decode(file_get_contents($input), true, 512, JSON_THROW_ON_ERROR);
if (($request['schema'] ?? null) !== 'govhub.native-site-preparation-request.v1'
    || !in_array($request['action'] ?? null, ['prepare', 'inspect'], true)) {
  throw new \RuntimeException('Choose the original site preparation or native readback.');
}
$binding_file = $request['binding_file'] ?? '';
$credentials_file = $request['credentials_file'] ?? '';
foreach ([$binding_file, $credentials_file] as $file) {
  if (!is_string($file) || !str_starts_with($file, '/') || !is_file($file)
      || is_link($file) || filesize($file) > 1048576) {
    throw new \RuntimeException('Restore the original private native setup inputs.');
  }
}
$binding_bytes = file_get_contents($binding_file);
if (hash('sha256', rtrim($binding_bytes, "\n")) !== ($request['binding_sha256'] ?? null)) {
  throw new \RuntimeException('The original site binding bytes changed.');
}
$binding = json_decode($binding_bytes, true, 512, JSON_THROW_ON_ERROR);
$credentials = json_decode(file_get_contents($credentials_file), true, 512, JSON_THROW_ON_ERROR);
if (($binding['schema'] ?? null) !== 'govhub.native-site-preparation.v1'
    || ($credentials['schema'] ?? null) !== 'govhub.native-site-credentials.v1'
    || ($credentials['operation_id'] ?? null) !== ($binding['operation_id'] ?? null)) {
  throw new \RuntimeException('The native site and private account inputs belong to different operations.');
}
$root = realpath(\Drupal::root());
if ($root === false || $root !== ($binding['site_root'] ?? null)) {
  throw new \RuntimeException('The bootstrapped original Drupal root differs from the selected target.');
}
$connection = Database::getConnectionInfo('default')['default'] ?? [];
if (($connection['driver'] ?? null) !== 'sqlite' || !is_string($connection['database'] ?? null)) {
  throw new \RuntimeException('This isolated site must use its selected original SQLite database.');
}
$database = $connection['database'];
$database = realpath(str_starts_with($database, '/') ? $database : $root . '/' . $database);
if ($database === false || $database !== ($binding['database'] ?? null)) {
  throw new \RuntimeException('The actual native database differs from the retained site selection.');
}
$admin = User::load(1);
$admin_input = $credentials['admin'] ?? [];
$passwords = \Drupal::service('password');
if (!$admin || !$admin->isActive() || $admin->getAccountName() !== ($admin_input['name'] ?? null)
    || !is_string($admin_input['password'] ?? null)
    || !$passwords->check($admin_input['password'], $admin->getPassword())) {
  throw new \RuntimeException('The installed native site does not match its original private administrator input.');
}
$site_uuid = \Drupal::config('system.site')->get('uuid');
if (!is_string($site_uuid) || $site_uuid === '') {
  throw new \RuntimeException('The original Drupal site has no installed configuration identity.');
}
$expected = [
  'schema' => 'govhub.native-site-state.v1',
  'operation_id' => $binding['operation_id'],
  'binding_sha256' => $request['binding_sha256'],
  'environment_id' => $binding['environment_id'],
  'site_uuid' => $site_uuid,
];
$state = \Drupal::state();
$saved = $state->get('govhub.native_site_setup');
if ($saved !== null) {
  foreach ($expected as $key => $value) {
    if (!is_array($saved) || ($saved[$key] ?? null) !== $value) {
      throw new \RuntimeException('The installed site already belongs to a different original preparation.');
    }
  }
}
$reader_input = $credentials['receiver'] ?? [];
if (!is_string($reader_input['name'] ?? null) || !is_string($reader_input['password'] ?? null)
    || !is_string($reader_input['mail'] ?? null)) {
  throw new \RuntimeException('Retain the complete original receiving account input.');
}
$matches = \Drupal::entityTypeManager()->getStorage('user')->loadByProperties(['name' => $reader_input['name']]);
if (count($matches) > 1) {
  throw new \RuntimeException('The selected native receiving name is not unique.');
}
$reader = $matches ? reset($matches) : null;
if ($reader && ((int) $reader->id() <= 1 || !$reader->isActive()
    || $reader->getEmail() !== $reader_input['mail']
    || !$passwords->check($reader_input['password'], $reader->getPassword()))) {
  throw new \RuntimeException('An existing native receiving account differs from this private input.');
}
if ($saved !== null && (!$reader || (string) $reader->id() !== (string) ($saved['receiver_uid'] ?? '')
    || $reader->uuid() !== ($saved['receiver_uuid'] ?? null))) {
  throw new \RuntimeException('The original prepared receiving account changed.');
}
if ($request['action'] === 'prepare' && $saved === null) {
  $transaction = \Drupal::database()->startTransaction();
  try {
    if (!$reader) {
      $reader = User::create([
        'name' => $reader_input['name'], 'mail' => $reader_input['mail'],
        'pass' => $reader_input['password'], 'status' => 1,
      ]);
      $reader->save();
    }
    $saved = $expected + [
      'receiver_uid' => (string) $reader->id(), 'receiver_uuid' => $reader->uuid(),
    ];
    $state->set('govhub.native_site_setup', $saved);
    unset($transaction);
  }
  catch (\Throwable $error) {
    if (isset($transaction)) {
      $transaction->rollBack();
    }
    throw $error;
  }
}
$receiver = $reader ? [
  'uid' => (string) $reader->id(), 'uuid' => $reader->uuid(),
  'name' => $reader->getAccountName(), 'roles' => $reader->getRoles(),
] : null;
echo json_encode([
  'schema' => 'govhub.native-site-ready.v1',
  'status' => $saved !== null ? 'READY' : 'INSTALLED',
  'binding_sha256' => $request['binding_sha256'],
  'operation_id' => $binding['operation_id'],
  'environment_id' => $binding['environment_id'],
  'site_root' => $root, 'database' => $database, 'site_uuid' => $site_uuid,
  'drupal_version' => \Drupal::VERSION, 'php_version' => PHP_VERSION,
  'receiver' => $receiver,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
