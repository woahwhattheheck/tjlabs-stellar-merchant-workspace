<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
namespace Tjl\CatalogueWorkspace\Source;

use Http\Discovery\Psr18ClientDiscovery;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Reference;
use Tjl\CatalogueWorkspace\Store;
use Webgriffe\SyliusAkeneoPlugin\ValueHandler\FileAttributeValueHandler;

/** Called by the owning bundle extension, then its native compiler pass. */
final class SourceServices
{
    public static function register(ContainerBuilder $container): void
    {
        $container->register(PrivateJournal::class, PrivateJournal::class)->setArguments(['%tjl_catalogue_workspace.directory%']);
        $container->register(SourceContext::class, SourceContext::class)->setArguments([
            new Reference(Store::class), new Reference(PrivateJournal::class),
            '%webgriffe_sylius_akeneo.api_client.base_url%', '%tjl_catalogue_workspace.max_export_bytes%',
        ]);
        $container->register('tjl_catalogue_workspace.native_http_client', \Psr\Http\Client\ClientInterface::class)
            ->setFactory([Psr18ClientDiscovery::class, 'find']);
        $container->register(RetainedHttpClient::class, RetainedHttpClient::class)->setArguments([
            new Reference('tjl_catalogue_workspace.native_http_client'), new Reference(SourceContext::class),
        ]);
        $container->register(MediaJournal::class, MediaJournal::class)->setArguments([
            new Reference(Store::class), new Reference(PrivateJournal::class),
            new Reference('sylius.adapter.filesystem.default'), new Reference('sylius.storage'), [],
        ]);
        $container->register(JournaledFilesystem::class, JournaledFilesystem::class)->setArguments([new Reference(MediaJournal::class)]);
        $container->register(JournaledImageStorage::class, JournaledImageStorage::class)->setArguments([
            new Reference('sylius.adapter.filesystem.default'), new Reference(MediaJournal::class),
        ]);
        $container->register(SourceGateway::class, SourceGateway::class)->setArguments([
            new Reference(Store::class), new Reference(PrivateJournal::class), new Reference(SourceContext::class),
            new Reference(MediaJournal::class), new Reference('webgriffe_sylius_akeneo.api_client'),
        ]);
    }

    public static function compile(ContainerBuilder $container): void
    {
        foreach (['webgriffe_sylius_akeneo.api_client.factory', 'webgriffe_sylius_akeneo.api_client',
                  'sylius.uploader.image', 'sylius.adapter.filesystem.default', 'sylius.storage'] as $id) {
            if (!$container->has($id)) { throw new \RuntimeException('Install the selected native Sylius/Akeneo service before catalogue integration: ' . $id); }
        }
        $builder = $container->findDefinition('webgriffe_sylius_akeneo.api_client.factory');
        $calls = [];
        foreach ($builder->getMethodCalls() as $call) {
            if ($call[0] === 'setHttpClient') {
                $existing = $call[1][0] ?? null;
                if (!$existing instanceof Reference || (string) $existing !== RetainedHttpClient::class) {
                    $container->findDefinition(RetainedHttpClient::class)->setArgument(0, $existing);
                }
                continue;
            }
            if (in_array($call[0], ['enableCache', 'disableCache'], true)) { continue; }
            $calls[] = $call;
        }
        $builder->setMethodCalls($calls);
        $builder->addMethodCall('setHttpClient', [new Reference(RetainedHttpClient::class)]);
        $builder->addMethodCall('disableCache');

        $roots = [];
        foreach ($container->findTaggedServiceIds('webgriffe_sylius_akeneo.product.value_handler') as $id => $_) {
            $definition = $container->findDefinition($id);
            if ($definition->getClass() !== FileAttributeValueHandler::class) { continue; }
            $args = $definition->getArguments();
            $root = $args['$downloadPath'] ?? $args[4] ?? null;
            if (!is_string($root) || $root === '') { throw new \RuntimeException('Retain the explicit native file-handler destination for ' . $id); }
            $roots['handler-' . substr(hash('sha256', $id), 0, 24)] = $root;
            $definition->setArgument(array_key_exists('$filesystem', $args) ? '$filesystem' : 1, new Reference(JournaledFilesystem::class));
        }
        ksort($roots);
        $container->findDefinition(MediaJournal::class)->setArgument(4, $roots);
        $uploader = $container->findDefinition('sylius.uploader.image');
        $args = $uploader->getArguments();
        $original = $args['$filesystem'] ?? $args[0] ?? null;
        if (!$original instanceof Reference) { throw new \RuntimeException('Select the native Sylius image adapter explicitly.'); }
        if ((string) $original !== JournaledImageStorage::class) {
            $container->findDefinition(MediaJournal::class)->setArgument(2, $original);
            $container->findDefinition(JournaledImageStorage::class)->setArgument(0, $original);
        }
        $uploader->setArgument(array_key_exists('$filesystem', $args) ? '$filesystem' : 0, new Reference(JournaledImageStorage::class));
    }
}
