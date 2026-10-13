<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace;

use Symfony\Component\DependencyInjection\ContainerBuilder;
use Symfony\Component\DependencyInjection\Compiler\PassConfig;
use Symfony\Component\HttpKernel\Bundle\Bundle;
use Tjl\CatalogueWorkspace\DependencyInjection\NativePass;

final class TjlCatalogueWorkspaceBundle extends Bundle
{
    public function getPath(): string { return dirname(__DIR__); }
    public function build(ContainerBuilder $container): void
    {
        parent::build($container);
        $container->addCompilerPass(new NativePass(), PassConfig::TYPE_BEFORE_OPTIMIZATION, -500);
    }
}
