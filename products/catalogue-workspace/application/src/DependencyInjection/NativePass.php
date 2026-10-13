<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\DependencyInjection;

use Symfony\Component\DependencyInjection\Compiler\CompilerPassInterface;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Reference;
use Tjl\CatalogueWorkspace\Source\SourceServices;
use Tjl\CatalogueWorkspace\Engine;

final class NativePass implements CompilerPassInterface
{
    public function process(ContainerBuilder $container): void
    {
        foreach (['webgriffe_sylius_akeneo.message_handler.item_import', 'webgriffe_sylius_akeneo.middleware.item_import_result_persister',
            'webgriffe_sylius_akeneo.product.importer', 'webgriffe_sylius_akeneo.api_client.factory'] as $id) {
            if (!$container->hasDefinition($id)) { throw new \LogicException('The reviewed original Webgriffe service is missing: ' . $id); }
        }
        $mapping = [];
        $ids = array_keys($container->findTaggedServiceIds('webgriffe_sylius_akeneo.product.value_handler'));
        foreach (['webgriffe_sylius_akeneo.product.taxons_resolver', 'webgriffe_sylius_akeneo.product.product_options_resolver',
            'webgriffe_sylius_akeneo.product.channels_resolver', 'webgriffe_sylius_akeneo.product.status_resolver',
            'webgriffe_sylius_akeneo.product.variant_status_resolver', 'webgriffe_sylius_akeneo.product.validator'] as $id) { $ids[] = $id; }
        $ids = array_values(array_unique($ids));
        sort($ids, SORT_STRING);
        foreach ($ids as $id) {
            $definition = $container->findDefinition($id);
            $mapping[$id] = [
                'class' => $container->getParameterBag()->resolveValue($definition->getClass()),
                'arguments' => $this->describe($definition->getArguments()),
                'calls' => $this->describe($definition->getMethodCalls()),
                'tags' => $definition->getTags(),
            ];
        }
        $container->getDefinition(Engine::class)->setArgument('$mapping', $mapping);
        // The decorating handler has the one explicit native message tag.
        $container->getDefinition('webgriffe_sylius_akeneo.message_handler.item_import')->clearTag('messenger.message_handler');
        SourceServices::compile($container);
    }

    private function describe(mixed $value): mixed
    {
        if ($value instanceof Reference) { return ['service' => (string) $value]; }
        if (is_array($value)) { return array_map($this->describe(...), $value); }
        if (is_object($value)) {
            if ($value instanceof \Stringable) { return ['configuration_type' => $value::class, 'value' => (string) $value]; }
            throw new \LogicException('A selected native handler has an unsupported opaque configuration argument.');
        }
        return $value;
    }
}
