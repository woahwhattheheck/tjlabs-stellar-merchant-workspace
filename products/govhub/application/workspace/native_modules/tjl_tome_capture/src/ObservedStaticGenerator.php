<?php
namespace Drupal\tjl_tome_capture;

use Drupal\tome_static\StaticGeneratorInterface;

/** Calls the installed Tome generator unchanged and retains its actual outcomes. */
final class ObservedStaticGenerator implements StaticGeneratorInterface {
  public function __construct(
    private StaticGeneratorInterface $inner,
    private BuildContext $context
  ) {}

  public function getPaths() {
    $paths = $this->inner->getPaths();
    $this->context->record('get_paths', ['paths' => array_values($paths)]);
    return $paths;
  }

  public function requestPath($path) {
    $previous = $this->context->selectPath($path);
    $this->context->record('request_started', ['path' => $path]);
    try {
      $paths = $this->inner->requestPath($path);
      $this->context->record('request_completed', ['path' => $path, 'next_paths' => array_values($paths)]);
      return $paths;
    }
    catch (\Throwable $error) {
      $this->context->record('request_failed', [
        'path' => $path, 'class' => get_class($error),
        'message' => $error->getMessage(),
      ]);
      throw $error;
    }
    finally {
      $this->context->selectPath($previous);
    }
  }

  public function exportPaths(array $paths) {
    $this->context->record('export_paths_started', ['paths' => array_values($paths)]);
    $next = $this->inner->exportPaths($paths);
    $this->context->record('export_paths_completed', ['next_paths' => array_values($next)]);
    return $next;
  }

  public function cleanupStaticDirectory() {
    $this->context->record('cleanup_started');
    $result = $this->inner->cleanupStaticDirectory();
    $this->context->record('cleanup_completed');
    return $result;
  }

  public function getStaticDirectory() {
    return $this->inner->getStaticDirectory();
  }

  public function prepareStaticDirectory() {
    $result = $this->inner->prepareStaticDirectory();
    $this->context->record('directory_prepared', ['success' => $result]);
    return $result;
  }
}
