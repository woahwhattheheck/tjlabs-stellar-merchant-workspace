<?php
declare(strict_types=1);

namespace Symfony\Component\DependencyInjection\Loader\Configurator;

use Symfony\Component\DependencyInjection\Argument\ServiceLocatorArgument;
use Symfony\Component\DependencyInjection\Reference;
use Tjl\CatalogueWorkspace\Store;
use Tjl\CatalogueWorkspace\Engine;
use Tjl\CatalogueWorkspace\NativeCatalogue;
use Tjl\CatalogueWorkspace\ProjectArchive;
use Tjl\CatalogueWorkspace\Workspace;
use Tjl\CatalogueWorkspace\Import\Handler;
use Tjl\CatalogueWorkspace\Import\Middleware;
use Tjl\CatalogueWorkspace\Import\Runtime;
use Tjl\CatalogueWorkspace\Import\OwnershipListener;
use Tjl\CatalogueWorkspace\Import\ResultObserver;
use Tjl\CatalogueWorkspace\Source\SourceGateway;
use Tjl\CatalogueWorkspace\Controller\AdminController;
use Tjl\CatalogueWorkspace\Command\WorkspaceCommand;
use Tjl\CatalogueWorkspace\Menu\AdminMenuListener;

return static function (ContainerConfigurator $container): void {
    $s = $container->services();
    $s->set(Store::class)->args([service('doctrine.dbal.default_connection'), param('tjl_catalogue_workspace.directory')]);
    $s->set(Engine::class)->args([[]]);
    $repositories = [];
    foreach (['variant' => 'product_variant', 'product' => 'product', 'attribute' => 'product_attribute',
        'channel' => 'channel', 'locale' => 'locale', 'taxon' => 'taxon'] as $key => $name) {
        $repositories[$key] = new Reference('sylius.repository.' . $name);
    }
    $factories = [];
    foreach (['product_translation' => 'product_translation', 'variant_translation' => 'product_variant_translation',
        'attribute_value' => 'product_attribute_value', 'channel_pricing' => 'channel_pricing', 'product_taxon' => 'product_taxon'] as $key => $name) {
        $factories[$key] = new Reference('sylius.factory.' . $name);
    }
    $s->set(NativeCatalogue::class)->args([service('doctrine.orm.entity_manager'), new ServiceLocatorArgument($repositories),
        new ServiceLocatorArgument($factories), service('event_dispatcher')]);
    $s->set(Runtime::class);
    $s->set(Handler::class)->decorate('webgriffe_sylius_akeneo.message_handler.item_import')
        ->args([service(Handler::class . '.inner'), service(Runtime::class), service(Store::class), service(NativeCatalogue::class), service(Engine::class)])
        ->tag('messenger.message_handler', ['handles' => \Webgriffe\SyliusAkeneoPlugin\Message\ItemImport::class]);
    $s->set(Middleware::class)->decorate('webgriffe_sylius_akeneo.middleware.item_import_result_persister')
        ->args([service(Middleware::class . '.inner'), service(Runtime::class), service(Store::class), service(SourceGateway::class)]);
    $s->set(OwnershipListener::class)->args([service(Runtime::class), service(NativeCatalogue::class)])
        ->tag('kernel.event_listener', ['event' => \Webgriffe\SyliusAkeneoPlugin\Event\ProductVariantPreValidateEvent::class, 'method' => '__invoke', 'priority' => -10000]);
    $s->set(ResultObserver::class)->args([service(Runtime::class), service(Store::class)])
        ->tag('doctrine.event_listener', ['event' => 'postPersist']);
    $s->set(ProjectArchive::class)->args([service(Store::class), service(SourceGateway::class), param('tjl_catalogue_workspace.max_export_bytes')]);
    $s->set(Workspace::class)->args([service(Store::class), service(Engine::class), service(NativeCatalogue::class),
        service(SourceGateway::class), service('webgriffe_sylius_akeneo.command_bus'), service(ProjectArchive::class)]);
    $s->set(AdminController::class)->public()
        ->args([service(Workspace::class), service(Store::class), service(ProjectArchive::class), service('twig'),
            service('security.authorization_checker'), service('security.token_storage'), service('security.csrf.token_manager'),
            param('tjl_catalogue_workspace.operator_role')])
        ->tag('controller.service_arguments');
    $s->set(WorkspaceCommand::class)->args([service(Workspace::class), service('sylius.repository.admin_user'),
        param('tjl_catalogue_workspace.operator_role'), service('security.role_hierarchy'), service(ProjectArchive::class), service(Store::class)])->tag('console.command');
    $s->set(AdminMenuListener::class)->tag('kernel.event_listener', ['event' => 'sylius.menu.admin.main', 'method' => '__invoke']);
};
