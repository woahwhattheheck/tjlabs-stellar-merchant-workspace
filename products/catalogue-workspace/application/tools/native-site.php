<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
require_once __DIR__ . '/lib/Archive.php';
use Tjl\CatalogueWorkspace\Handover\Files;

if (PHP_SAPI !== 'cli') { throw new RuntimeException('Use the native private CLI.'); }
$options = getopt('', ['configuration:', 'output:', 'hash-directory:']);
foreach (['configuration', 'output', 'hash-directory'] as $key) {
    if (!is_string($options[$key] ?? null)) { throw new RuntimeException('Missing original native option: ' . $key); }
}
$config = Files::readJson($options['configuration']);
$project = realpath($config['project_root'] ?? '');
if ($project === false || !is_file($project . '/vendor/autoload.php')) { throw new RuntimeException('Actual installed Symfony project is required.'); }
require $project . '/vendor/autoload.php';
chdir($project);
if (!empty($config['bootstrap'])) {
    $bootstrap = realpath($project . '/' . Files::relative($config['bootstrap']));
    if ($bootstrap === false || !Files::inside($bootstrap, $project)) { throw new RuntimeException('Original project bootstrap is unavailable.'); }
    require $bootstrap;
} elseif (class_exists(\Symfony\Component\Dotenv\Dotenv::class) && is_file($project . '/.env')) {
    (new \Symfony\Component\Dotenv\Dotenv())->bootEnv($project . '/.env');
}
$kernelClass = $config['kernel_class'] ?? null;
$environment = $config['environment'] ?? null;
if (!is_string($kernelClass) || !class_exists($kernelClass) || !is_string($environment) || $environment === '') {
    throw new RuntimeException('Select the actual installed kernel class and environment.');
}
$kernel = new $kernelClass($environment, false);
if (!$kernel instanceof \Symfony\Component\HttpKernel\KernelInterface) { throw new RuntimeException('Selected class is not the native Symfony kernel.'); }
$kernel->boot();
try {
    $container = $kernel->getContainer();
    $configuredStore = $container->getParameter('tjl_catalogue_workspace.directory');
    if (!is_string($configuredStore) || realpath($configuredStore) !== realpath($config['store_root'])) {
        throw new RuntimeException('The received native kernel does not use the explicitly selected original catalogue Store root.');
    }
    $registry = $container->get('doctrine');
    $connection = $registry->getConnection($config['connection'] ?? null);
    $parameters = $connection->getParams();
    $identity = [];
    foreach (['driver', 'host', 'port', 'dbname', 'path', 'unix_socket', 'serverVersion'] as $key) {
        if (isset($parameters[$key])) { $identity[$key] = $parameters[$key]; }
    }
    ksort($identity);
    $platform = get_class($connection->getDatabasePlatform());
    $hashDirectory = Files::privateDirectory($options['hash-directory']);
    $tables = $connection->createSchemaManager()->listTableNames();
    sort($tables, SORT_STRING);
    $digests = [];
    foreach ($tables as $table) {
        $parts = []; $hashes = []; $count = 0;
        $writePart = static function () use (&$parts, &$hashes, $hashDirectory): void {
            if (!$hashes) { return; }
            sort($hashes, SORT_STRING);
            $path = $hashDirectory . '/rows-' . bin2hex(random_bytes(12));
            Files::atomic($path, implode("\n", $hashes) . "\n");
            $parts[] = $path; $hashes = [];
        };
        $result = $connection->executeQuery('SELECT * FROM ' . $connection->quoteIdentifier($table));
        while (($row = $result->fetchAssociative()) !== false) {
            ksort($row, SORT_STRING);
            $native = [];
            foreach ($row as $column => $value) {
                if (is_resource($value)) { $value = stream_get_contents($value); }
                $native[$column] = $value === null ? null : base64_encode(is_bool($value) ? ($value ? '1' : '0') : (string) $value);
            }
            $hashes[] = hash('sha256', Files::json($native));
            $count++;
            if (count($hashes) >= 50000) { $writePart(); }
        }
        $result->free();
        $writePart();
        $handles = []; $heads = [];
        try {
            foreach ($parts as $i => $path) {
                $handles[$i] = fopen($path, 'rb');
                if ($handles[$i] === false) { throw new RuntimeException('Cannot read original row digest run.'); }
                $heads[$i] = fgets($handles[$i]);
            }
            $digest = hash_init('sha256');
            while ($heads) {
                $next = null;
                foreach ($heads as $i => $line) {
                    if ($line === false) { unset($heads[$i]); continue; }
                    if ($next === null || strcmp($line, $heads[$next]) < 0) { $next = $i; }
                }
                if ($next === null) { break; }
                hash_update($digest, $heads[$next]);
                $heads[$next] = fgets($handles[$next]);
            }
            $digests[] = ['table' => $table, 'rows' => $count, 'rows_sha256' => hash_final($digest)];
        } finally {
            foreach ($handles as $handle) { if (is_resource($handle)) { fclose($handle); } }
            foreach ($parts as $path) { if (is_file($path)) { unlink($path); } }
        }
    }
    $file = static function (string $path): array {
        if (!is_file($path)) { throw new RuntimeException('Installed native dependency member is missing: ' . $path); }
        return ['bytes' => filesize($path), 'sha256' => hash_file('sha256', $path)];
    };
    $result = ['schema' => 'tjl.catalogue.native-site.v1', 'state' => 'COMPLETE',
        'site_key' => $config['site_key'], 'project_root' => $project, 'kernel_class' => $kernelClass,
        'environment' => $environment, 'php_version' => PHP_VERSION,
        'database' => ['platform' => $platform, 'identity_sha256' => hash('sha256', Files::json($identity)), 'tables' => $digests],
        'composer' => ['json' => $file($project . '/composer.json'), 'lock' => $file($project . '/composer.lock'),
                       'installed' => $file($project . '/vendor/composer/installed.json')],
        'console' => $file($project . '/' . Files::relative($config['console'])),
        'store_root' => realpath($configuredStore), 'queue_mode' => $config['queue_mode'], 'observed_at' => gmdate(DATE_ATOM)];
    Files::writeJson($options['output'], $result);
    echo Files::json(['state' => 'COMPLETE', 'output' => $options['output'], 'sha256' => hash_file('sha256', $options['output'])]) . "\n";
} finally { $kernel->shutdown(); }
