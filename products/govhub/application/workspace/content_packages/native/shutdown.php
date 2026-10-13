<?php

declare(strict_types=1);

/**
 * Runs through PHP auto_prepend_file before Drush/Drupal register shutdown.
 * The original PHP prepend, when configured, runs after this rollback guard.
 */
if (!function_exists('posix_kill')) {
  throw new RuntimeException('The native transactional content operator requires the existing PHP POSIX extension.');
}
define('GOVHUB_CONTENT_PACKAGES_SHUTDOWN_GUARD', TRUE);
$GLOBALS['govhub_content_packages_transaction'] = NULL;
$GLOBALS['govhub_content_packages_emergency_memory'] = str_repeat(' ', 262144);
register_shutdown_function(static function (): void {
  unset($GLOBALS['govhub_content_packages_emergency_memory']);
  $context = $GLOBALS['govhub_content_packages_transaction'] ?? NULL;
  if ($context === NULL || ($context['ready_to_commit'] ?? FALSE)) return;
  try {
    $context['transaction']->rollBack();
    $GLOBALS['govhub_content_packages_transaction'] = NULL;
    fwrite(STDERR, "GovHub rolled back the unfinished original content transaction before Drupal shutdown.\n");
  }
  catch (Throwable $error) {
    fwrite(STDERR, "GovHub could not complete rollback; terminating this own PHP process before shutdown commits.\n");
    // A failed rollback must not fall through to Drupal's commit-on-shutdown.
    // Terminating this same native process closes its uncommitted DB connection.
    posix_kill(getmypid(), 9);
  }
});
$runtime_path = __FILE__ . '.runtime.json';
$runtime = json_decode(file_get_contents($runtime_path), TRUE, 512, JSON_THROW_ON_ERROR);
$original = $runtime['original_auto_prepend_file'] ?? '';
if (!is_string($original)) throw new RuntimeException('The original PHP prepend setting is malformed.');
if ($original !== '') {
  $resolved = stream_resolve_include_path($original);
  if (!$resolved || realpath($resolved) === realpath(__FILE__)) {
    throw new RuntimeException('The original configured PHP prepend must resolve independently of this guard.');
  }
  require $resolved;
}
