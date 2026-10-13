<?php
declare(strict_types=1);

use Symfony\Component\Routing\Loader\Configurator\RoutingConfigurator;
use Tjl\CatalogueWorkspace\Controller\AdminController;

return static function (RoutingConfigurator $routes): void {
    $routes->add('tjl_catalogue_workspace_index', '/')->controller([AdminController::class, 'index'])->methods(['GET']);
    $routes->add('tjl_catalogue_workspace_action', '/action')->controller([AdminController::class, 'action'])->methods(['POST']);
    $routes->add('tjl_catalogue_workspace_upload', '/receive')->controller([AdminController::class, 'upload'])->methods(['POST']);
    $routes->add('tjl_catalogue_workspace_download', '/files/{project}/{sha}')->controller([AdminController::class, 'download'])
        ->requirements(['project' => '[A-Za-z0-9._:-]+', 'sha' => '[a-f0-9]{64}'])->methods(['GET']);
    $routes->add('tjl_catalogue_workspace_asset', '/assets/{name}')->controller([AdminController::class, 'asset'])
        ->requirements(['name' => 'workspace\.(js|css)'])->methods(['GET']);
};
