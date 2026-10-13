<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\DependencyInjection;

use Symfony\Component\Config\Definition\Builder\TreeBuilder;
use Symfony\Component\Config\Definition\ConfigurationInterface;

final class Configuration implements ConfigurationInterface
{
    public function getConfigTreeBuilder(): TreeBuilder
    {
        $tree = new TreeBuilder('tjl_catalogue_workspace');
        $tree->getRootNode()->children()
            ->scalarNode('directory')->defaultValue('%kernel.project_dir%/var/catalogue-workspace')->cannotBeEmpty()->end()
            ->scalarNode('operator_role')->defaultValue('ROLE_ADMINISTRATION_ACCESS')->cannotBeEmpty()->end()
            ->integerNode('max_export_bytes')->defaultValue(4294967296)->min(1048576)->end()
        ->end();
        return $tree;
    }
}
