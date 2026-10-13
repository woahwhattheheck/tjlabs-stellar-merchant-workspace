<?php

/**
 * Drush 13 entrypoint: php:script run --script-path=<this directory> -- <request.json>.
 * The configured site owns its bootstrap, account, plugins and database.
 */

use Drupal\govhub_consolidation\Runner;

if (empty($extra[0]) || !is_string($extra[0])) {
  throw new \InvalidArgumentException('Supply the retained private native request JSON path.');
}
$request_path = $extra[0];
$request_raw = file_get_contents($request_path);
$request = json_decode($request_raw, TRUE, 512, JSON_THROW_ON_ERROR);
$result_path = $request['result_path'] ?? '';
$output_dir = realpath($request['output_dir'] ?? '');
if (!$output_dir || dirname($result_path) !== $output_dir || basename($result_path) === '') {
  throw new \InvalidArgumentException('The result belongs inside the original operation output directory.');
}
try {
  if (!\Drupal::moduleHandler()->moduleExists('govhub_consolidation')) {
    throw new \RuntimeException('Enable the supplied govhub_consolidation module in this selected Drupal project.');
  }
  $result = (new Runner($request))->run();
}
catch (\Throwable $error) {
  $result = ['schema' => 'govhub.content-consolidation.drupal-result.v1',
    'status' => 'failed', 'operation_id' => $request['operation_id'] ?? NULL,
    'plan_sha256' => $request['plan_sha256'] ?? NULL,
    'error' => ['class' => get_class($error), 'message' => $error->getMessage()],
    'observed_at' => gmdate(DATE_ATOM), 'migrations' => [], 'targets' => [], 'rollback' => []];
}
$bytes = json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n";
$temporary = $result_path . '.writing-' . getmypid();
$stream = fopen($temporary, 'xb');
if (!$stream || fwrite($stream, $bytes) !== strlen($bytes)) {
  throw new \RuntimeException('Unable to retain the complete native migration result.');
}
fflush($stream);
if (function_exists('fsync')) {
  fsync($stream);
}
fclose($stream);
if (!rename($temporary, $result_path)) {
  throw new \RuntimeException('Unable to publish the original native result file.');
}
print json_encode(['schema' => $result['schema'], 'status' => $result['status'],
  'result_path' => $result_path, 'sha256' => hash('sha256', $bytes)], JSON_THROW_ON_ERROR) . "\n";
