<?php
namespace Drupal\tjl_tome_capture;

use Drupal\Core\DependencyInjection\ContainerBuilder;
use Drupal\Core\DependencyInjection\ServiceProviderBase;
use Drupal\tome_static\StaticGenerator;
use Symfony\Component\DependencyInjection\Definition;
use Symfony\Component\DependencyInjection\Reference;

/** Bind the installed original generator and its actual cache dependency. */
final class TjlTomeCaptureServiceProvider extends ServiceProviderBase {
  public function alter(ContainerBuilder $container) {
    $found = [];
    foreach ($container->getDefinitions() as $id => $definition) {
      if (ltrim((string) $definition->getClass(), '\\') === StaticGenerator::class) {
        $found[$id] = $definition;
      }
    }
    if (count($found) !== 1) {
      throw new \RuntimeException('Select the supported original Tome Static generator before enabling build receiving.');
    }
    $id = array_key_first($found);
    $definition = $found[$id];
    // Tome 1.16's published StaticGenerator constructor names its cache fourth.
    $arguments = $definition->getArguments();
    $cache = $arguments[3] ?? NULL;
    $kernel = $arguments[0] ?? NULL;
    if (!$cache instanceof Reference || !$kernel instanceof Reference) {
      throw new \RuntimeException('The installed Tome cache dependency differs from the selected source.');
    }
    $inner = 'tjl_tome_capture.original_generator';
    $observedKernel = new Definition(ObservedHttpKernel::class, [
      $kernel, new Reference('tjl_tome_capture.context'),
    ]);
    $container->setDefinition('tjl_tome_capture.original_response', $observedKernel);
    $original = clone $definition;
    $original->setArgument(0, new Reference('tjl_tome_capture.original_response'));
    $container->setDefinition($inner, $original);
    $wrapper = new Definition(ObservedStaticGenerator::class, [
      new Reference($inner), new Reference('tjl_tome_capture.context'),
    ]);
    $wrapper->setPublic(TRUE);
    $container->setDefinition($id, $wrapper);
    $container->setAlias('tjl_tome_capture.generator', $id)->setPublic(TRUE);
    $container->setAlias('tjl_tome_capture.cache', (string) $cache)->setPublic(TRUE);
  }
}
