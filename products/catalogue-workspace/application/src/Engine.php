<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace;

use Composer\InstalledVersions;
use Webgriffe\SyliusAkeneoPlugin\Message\ItemImport;
use Webgriffe\SyliusAkeneoPlugin\Product\Importer;
use Webgriffe\SyliusAkeneoPlugin\Middleware\ItemImportResultPersisterMiddleware;

final class Engine
{
    public function __construct(private array $mapping) {}

    public function describe(): array
    {
        $package = 'webgriffe/sylius-akeneo-plugin';
        if (!InstalledVersions::isInstalled($package)) { throw new \RuntimeException('The original Webgriffe Akeneo plugin is not installed.'); }
        $version = InstalledVersions::getPrettyVersion($package);
        if (ltrim((string) $version, 'v') !== '3.1.0') {
            throw new \RuntimeException('This native integration is pinned to the reviewed Webgriffe 3.1.0 contract; review an installed version change before adoption.');
        }
        $files = [];
        $classes = [ItemImport::class, Importer::class, ItemImportResultPersisterMiddleware::class,
            \Webgriffe\SyliusAkeneoPlugin\Event\ProductVariantPreValidateEvent::class];
        foreach ($this->mapping as $definition) {
            if (is_string($definition['class'] ?? null) && $definition['class'] !== '') { $classes[] = $definition['class']; }
        }
        $classes = array_values(array_unique($classes));
        sort($classes, SORT_STRING);
        foreach ($classes as $class) {
            $path = (new \ReflectionClass($class))->getFileName();
            if ($path === false || !is_file($path)) { throw new \RuntimeException('Cannot retain the original native class source identity.'); }
            $files[] = ['class' => $class, 'bytes' => filesize($path), 'sha256' => hash_file('sha256', $path)];
        }
        $packages = [];
        foreach ([$package, 'sylius/sylius', 'sylius/core', 'akeneo/api-php-client', 'symfony/messenger', 'doctrine/orm', 'doctrine/dbal'] as $name) {
            if (InstalledVersions::isInstalled($name)) {
                $packages[$name] = ['version' => InstalledVersions::getPrettyVersion($name), 'reference' => InstalledVersions::getReference($name)];
            }
        }
        $result = ['schema' => 'tjl.catalogue.native-engine.v1', 'packages' => $packages,
            'php_version' => PHP_VERSION, 'native_classes' => $files, 'mapping' => $this->mapping,
            'message' => ItemImport::class, 'bus' => 'webgriffe_sylius_akeneo.command_bus',
            'result_entity' => \Webgriffe\SyliusAkeneoPlugin\Entity\ItemImportResult::class];
        $result['sha256'] = Support::hash($result);
        return $result;
    }

    public function assertSame(string $sha): array
    {
        $current = $this->describe();
        if (!hash_equals($sha, $current['sha256'])) {
            throw new \RuntimeException('The installed native mapping, dependency or class source changed after review.');
        }
        return $current;
    }
}
