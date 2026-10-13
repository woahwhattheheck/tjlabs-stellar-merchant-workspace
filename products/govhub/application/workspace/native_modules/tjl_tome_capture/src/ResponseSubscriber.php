<?php
namespace Drupal\tjl_tome_capture;

use Drupal\tome_static\Event\FileSavedEvent;
use Drupal\tome_static\Event\PathPlaceholderEvent;
use Drupal\tome_static\Event\TomeStaticEvents;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

/** Retain original Tome path decisions and completed file saves. */
final class ResponseSubscriber implements EventSubscriberInterface {
  public function __construct(private BuildContext $context) {}

  public static function getSubscribedEvents(): array {
    return [
      TomeStaticEvents::PATH_PLACEHOLDER => ['placeholder', PHP_INT_MIN],
      TomeStaticEvents::FILE_SAVED => ['saved', PHP_INT_MIN],
    ];
  }

  public function placeholder(PathPlaceholderEvent $event): void {
    $this->context->record('path_placeholder', [
      'path' => $event->getPath(),
      'invalid' => (bool) $event->isInvalid(),
    ]);
  }

  public function saved(FileSavedEvent $event): void {
    $path = $event->getPath();
    $this->context->record('file_saved', [
      'path' => $path,
      'regular_file' => is_file($path) && !is_link($path),
    ]);
  }
}
