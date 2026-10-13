<?php
namespace Drupal\tjl_tome_capture;

/** Process-local receiving context; ordinary Tome commands remain unchanged. */
final class BuildContext {
  private ?array $context = NULL;
  private ?string $journal = NULL;
  private ?string $originalPath = NULL;

  public function __construct() {
    $file = getenv('TJL_TOME_CAPTURE_CONTEXT');
    if ($file === FALSE || $file === '') {
      return;
    }
    if ($file[0] !== '/' || is_link($file) || !is_file($file)) {
      throw new \RuntimeException('Use the retained absolute Tome build context.');
    }
    $raw = file_get_contents($file);
    $value = json_decode($raw, TRUE, 512, JSON_THROW_ON_ERROR);
    if (($value['schema'] ?? '') !== 'govhub.tome-native-context.v1'
        || !is_string($value['operation_id'] ?? NULL)
        || !is_string($value['production_uri'] ?? NULL)) {
      throw new \RuntimeException('The original Tome build context is incomplete.');
    }
    $this->context = $value;
    $this->journal = dirname($file) . '/tome-events.jsonl';
    if (is_link($this->journal)) {
      throw new \RuntimeException('The Tome event destination must be an ordinary file.');
    }
    $this->record('process_context', ['context_sha256' => hash('sha256', $raw)]);
  }

  public function record(string $kind, array $data = []): void {
    if ($this->context === NULL) {
      return;
    }
    $event = [
      'schema' => 'govhub.tome-native-event.v1',
      'operation_id' => $this->context['operation_id'],
      'pid' => getmypid(),
      'at_unix' => microtime(TRUE),
      'kind' => $kind,
      'original_path' => $this->originalPath,
      'data' => $data,
    ];
    $bytes = json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
    $written = file_put_contents($this->journal, $bytes, FILE_APPEND | LOCK_EX);
    if ($written !== strlen($bytes)) {
      throw new \RuntimeException('The original Tome event could not be retained.');
    }
  }

  public function selectPath(?string $path): ?string {
    $previous = $this->originalPath;
    $this->originalPath = $path;
    return $previous;
  }
}
