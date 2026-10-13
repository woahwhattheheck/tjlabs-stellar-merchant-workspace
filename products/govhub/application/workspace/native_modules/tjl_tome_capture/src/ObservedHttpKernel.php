<?php
namespace Drupal\tjl_tome_capture;

use Drupal\tome_static\StaticGeneratorInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\HttpKernelInterface;

/** Observe the actual returned Tome response, including native page-cache hits. */
final class ObservedHttpKernel implements HttpKernelInterface {
  public function __construct(
    private HttpKernelInterface $inner,
    private BuildContext $context
  ) {}

  public function handle(Request $request, int $type = self::MAIN_REQUEST, bool $catch = TRUE): Response {
    $observed = (bool) $request->attributes->get(StaticGeneratorInterface::REQUEST_KEY);
    try {
      $response = $this->inner->handle($request, $type, $catch);
      if ($observed) {
        $this->context->record('http_response', [
          'uri' => $request->getUri(), 'path' => $request->getRequestUri(),
          'status' => $response->getStatusCode(),
          'content_type' => $response->headers->get('Content-Type', ''),
        ]);
      }
      return $response;
    }
    catch (\Throwable $error) {
      if ($observed) {
        $this->context->record('http_exception', [
          'uri' => $request->getUri(), 'class' => get_class($error),
          'message' => $error->getMessage(),
        ]);
      }
      throw $error;
    }
  }
}
