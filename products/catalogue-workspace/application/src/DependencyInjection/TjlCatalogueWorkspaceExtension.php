<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\DependencyInjection;

use Symfony\Component\Config\FileLocator;
use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Extension\Extension;
use Symfony\Component\DependencyInjection\Loader\PhpFileLoader;
use Tjl\CatalogueWorkspace\Source\SourceServices;

final class TjlCatalogueWorkspaceExtension extends Extension
{
    public function load(array $configs, ContainerBuilder $container): void
    {
        $config = $this->processConfiguration(new Configuration(), $configs);
        foreach ($config as $name => $value) { $container->setParameter('tjl_catalogue_workspace.' . $name, $value); }
        $loader = new PhpFileLoader($container, new FileLocator(__DIR__ . '/../../config'));
        $loader->load('services.php');
        SourceServices::register($container);
    }
}
