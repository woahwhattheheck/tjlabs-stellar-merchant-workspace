<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
namespace Tjl\CatalogueWorkspace\Handover;

require_once __DIR__ . '/Archive.php';

/** Complete original installed project; every subprocess retains one admission. */
final class NativeProject
{
    private array $config;
    private array $state;
    private string $work;
    private string $configuration;
    private $lock;
    private array $roots;

    public function __construct(string $configuration, string $work, private readonly string $operationId)
    {
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/D', $operationId)) {
            throw new HandoverFailure('Use the same original operation ID of 8–160 characters.');
        }
        Files::assertParent($configuration);
        if (is_link($configuration) || !is_file($configuration)) { throw new HandoverFailure('Native configuration is unavailable.'); }
        $this->config = $this->validate(Files::readJson($configuration));
        $this->work = Files::privateDirectory($work);
        $this->roots = ['project' => $this->config['project_root']];
        foreach (['public', 'private'] as $group) {
            foreach ($this->config['roots'][$group] as $name => $path) { $this->roots[$group . '/' . $name] = $path; }
        }
        foreach ($this->roots as $root) {
            if (Files::inside($this->work, $root) || Files::inside($root, $this->work)) {
                throw new HandoverFailure('Keep the original private control directory separate from every installed root.');
            }
        }
        $lockPath = $this->work . '/operation.lock';
        if (is_link($lockPath)) { throw new HandoverFailure('Operation lock is linked.'); }
        $this->lock = fopen($lockPath, 'c+b');
        if ($this->lock === false || !flock($this->lock, LOCK_EX | LOCK_NB)) {
            throw new HandoverFailure('The original operation or its native child still owns this admission.', 'ORIGINAL_PROCESS_ACTIVE');
        }
        chmod($lockPath, 0600);
        $binding = ['operation_id' => $operationId, 'configuration' => $this->config];
        $statePath = $this->work . '/state.json';
        if (is_file($statePath)) {
            $this->state = Files::readJson($statePath);
            if (($this->state['binding'] ?? null) !== $binding) { throw new HandoverFailure('Retain the same original configuration and operation.'); }
        } else {
            $this->state = ['schema' => 'tjl.catalogue.native-project-state.v1', 'binding' => $binding,
                'status' => 'PREPARED', 'commands' => [], 'created_at' => gmdate(DATE_ATOM)];
            $this->save();
        }
        $this->configuration = $this->work . '/configuration.json';
        if (!is_file($this->configuration)) { Files::writeJson($this->configuration, $this->config); }
        if (Files::readJson($this->configuration) !== $this->config) { throw new HandoverFailure('Retained configuration changed.'); }
    }

    public function __destruct()
    {
        // No LOCK_UN: an admitted native descendant may still hold this open-file description.
        if (is_resource($this->lock)) { fclose($this->lock); }
    }

    private function validate(array $config): array
    {
        if (($config['schema'] ?? null) !== 'tjl.catalogue.native-project-config.v1') { throw new HandoverFailure('Select the complete native project configuration.'); }
        foreach (['site_key', 'kernel_class', 'environment', 'php_executable', 'project_root', 'console', 'store_root'] as $field) {
            if (!is_string($config[$field] ?? null) || $config[$field] === '' || str_contains($config[$field], "\0")) { throw new HandoverFailure('Missing native binding: ' . $field); }
        }
        foreach (['project_root', 'store_root'] as $field) {
            $path = Files::absolute($config[$field]); Files::assertParent($path);
            if (is_link($path) || !is_dir($path)) { throw new HandoverFailure('Use the actual ordinary installed directory: ' . $field); }
            $config[$field] = realpath($path);
        }
        $php = Files::absolute($config['php_executable']); Files::assertParent($php);
        if (!is_file($php) || !is_executable($php)) { throw new HandoverFailure('Use the actual installed PHP executable or wrapper.'); }
        $config['php_executable'] = $php;
        $config['console'] = Files::relative($config['console']);
        foreach (['composer.json', 'composer.lock', 'vendor/autoload.php', $config['console']] as $path) {
            if (!is_file($config['project_root'] . '/' . $path)) { throw new HandoverFailure('Installed project closure is incomplete: ' . $path); }
        }
        if (!in_array($config['queue_mode'] ?? null, ['database', 'external'], true)) { throw new HandoverFailure('Select the actual database or external native queue.'); }
        if (($config['maintenance_authorized'] ?? false) !== true) { throw new HandoverFailure('Native maintenance and worker control must be explicitly authorized in the private configuration.'); }
        $config['roots'] ??= [];
        $seen = [];
        foreach (['public', 'private'] as $group) {
            $config['roots'][$group] ??= [];
            if (!is_array($config['roots'][$group])) { throw new HandoverFailure('Supply actual named storage roots.'); }
            ksort($config['roots'][$group]);
            foreach ($config['roots'][$group] as $name => &$path) {
                if (!is_string($name) || !preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/D', $name) || !is_string($path)) { throw new HandoverFailure('Invalid native storage root.'); }
                $path = Files::absolute($path); Files::assertParent($path);
                if (is_link($path) || !is_dir($path)) { throw new HandoverFailure('Selected storage root must exist as an ordinary directory.'); }
                $path = realpath($path);
                if (Files::inside($config['project_root'], $path)) { throw new HandoverFailure('Storage cannot contain the complete project root.'); }
                foreach ($seen as $other) { if (Files::inside($path, $other) || Files::inside($other, $path)) { throw new HandoverFailure('Select nonoverlapping storage roots.'); } }
                $seen[] = $path;
            }
            unset($path);
        }
        if (!in_array($config['store_root'], $config['roots']['private'], true)) { throw new HandoverFailure('Include the complete actual catalogue Store as a named private root.'); }
        $config['host_private_paths'] ??= [];
        $config['excluded_runtime_paths'] ??= ['var/cache', 'var/log'];
        foreach (['host_private_paths', 'excluded_runtime_paths'] as $field) {
            if (!is_array($config[$field]) || !array_is_list($config[$field])) { throw new HandoverFailure('Use a complete relative exclusion list.'); }
            foreach ($config[$field] as &$path) { $path = Files::relative($path); } unset($path);
        }
        $config['host_private_paths'] = array_values(array_unique(array_merge(
            ['.env.local', '.env.local.php', '.env.' . $config['environment'] . '.local', 'auth.json'],
            $config['host_private_paths']
        )));
        foreach (['drain', 'verify_drained', 'resume', 'database_dump', 'database_import'] as $command) { $this->validateCommand($config['commands'][$command] ?? null, $command); }
        if ($config['queue_mode'] === 'external') {
            foreach (['queue_export', 'queue_import'] as $command) { $this->validateCommand($config['commands'][$command] ?? null, $command); }
        }
        foreach (['cache_rebuild', 'verify_reopen'] as $command) { if (isset($config['commands'][$command])) { $this->validateCommand($config['commands'][$command], $command); } }
        if (!in_array($config['commands']['database_dump']['output'] ?? null, ['stdout', 'file'], true)) { throw new HandoverFailure('Declare native database dump output as stdout or file.'); }
        $config['max_bytes'] ??= 1099511627776;
        if (!is_int($config['max_bytes']) || $config['max_bytes'] < 1) { throw new HandoverFailure('Use an explicit positive archive byte limit.'); }
        return $config;
    }

    private function validateCommand(mixed $command, string $name): void
    {
        if (!is_array($command) || !is_array($command['argv'] ?? null) || !$command['argv'] || !array_is_list($command['argv'])) { throw new HandoverFailure('Supply the actual native argv for ' . $name); }
        foreach ($command['argv'] as $arg) { if (!is_string($arg) || str_contains($arg, "\0")) { throw new HandoverFailure('Invalid native command argument.'); } }
    }

    private function save(): void
    {
        $this->state['updated_at'] = gmdate(DATE_ATOM);
        Files::writeJson($this->work . '/state.json', $this->state);
    }

    public function status(): array { return $this->state; }

    private function directory(string $relative): string
    {
        $path = $this->work . '/' . Files::relative($relative);
        Files::makeParent($path . '/member', $this->work);
        if (!is_dir($path)) { mkdir($path, 0700); }
        return Files::privateDirectory($path);
    }

    private function identity(string $path): array
    {
        Files::assertParent($path);
        if (is_link($path)) { return ['type' => 'symlink', 'mode' => 0777, 'target' => readlink($path)]; }
        if (!file_exists($path)) { return ['type' => 'absent']; }
        $before = lstat($path);
        if (is_dir($path)) { return ['type' => 'directory', 'mode' => $before['mode'] & 0777]; }
        if (!is_file($path)) { throw new HandoverFailure('Unsupported original filesystem member: ' . $path); }
        $sha = hash_file('sha256', $path); clearstatcache(true, $path); $after = lstat($path);
        foreach (['dev', 'ino', 'size', 'mtime', 'ctime'] as $key) { if ($before[$key] !== $after[$key]) { throw new HandoverFailure('Original member changed while hashing: ' . $path); } }
        return ['type' => 'file', 'mode' => $before['mode'] & 0777, 'bytes' => $before['size'], 'sha256' => $sha];
    }

    private function copy(string $from, string $to): void
    {
        $before = $this->identity($from);
        if ($before['type'] !== 'file') { throw new HandoverFailure('A complete ordinary source file is required.'); }
        Files::assertParent($to);
        $temporary = $to . '.part-' . bin2hex(random_bytes(8));
        $input = fopen($from, 'rb'); $out = fopen($temporary, 'xb');
        if ($input === false || $out === false) { throw new HandoverFailure('Cannot retain complete original bytes.'); }
        chmod($temporary, 0600);
        try {
            while (!feof($input)) {
                $bytes = fread($input, 1048576);
                if ($bytes === false || ($bytes === '' && !feof($input))) { throw new HandoverFailure('Original file stream stopped.'); }
                Files::write($out, $bytes);
            }
            fflush($out); fsync($out);
        } finally { fclose($input); fclose($out); }
        $after = $this->identity($from); $received = $this->identity($temporary);
        if ($after !== $before || $received['bytes'] !== $before['bytes'] || $received['sha256'] !== $before['sha256']) { throw new HandoverFailure('Source changed during complete file retention.'); }
        if (!rename($temporary, $to)) { throw new HandoverFailure('Cannot publish original retained file.'); }
    }

    private function command(string $stage, array $argv, ?string $stdin = null): array
    {
        $directory = $this->directory('commands/' . hash('sha256', $stage));
        $request = ['schema' => 'tjl.catalogue.native-command-request.v1', 'stage' => $stage,
            'operation_id' => $this->operationId, 'argv' => $argv, 'cwd' => $this->config['project_root'],
            'stdin' => $stdin ?? '/dev/null', 'stdin_identity' => $stdin === null ? null : $this->identity($stdin)];
        $path = $directory . '/request.json';
        if (is_file($path)) {
            if (Files::readJson($path) !== $request) { throw new HandoverFailure('Original native command binding changed.'); }
        } else { Files::writeJson($path, $request); }
        $sha = hash_file('sha256', $path);
        $this->state['commands'][$stage] = ['request' => $path, 'request_sha256' => $sha, 'directory' => $directory];
        $this->save();
        $resultPath = $directory . '/result.json';
        if (!is_file($resultPath)) {
            if (is_file($directory . '/worker.json')) {
                throw new HandoverFailure('Original command has no completed native receipt: ' . $directory, 'COMMAND_UNCERTAIN');
            }
            $out = fopen($directory . '/wrapper.stdout', 'ab'); $err = fopen($directory . '/wrapper.stderr', 'ab');
            chmod($directory . '/wrapper.stdout', 0600); chmod($directory . '/wrapper.stderr', 0600);
            $process = proc_open([$this->config['php_executable'], dirname(__DIR__) . '/native-command.php', $path],
                [0 => ['file', '/dev/null', 'rb'], 1 => $out, 2 => $err, 4 => $this->lock], $pipes,
                $this->config['project_root'], null, ['bypass_shell' => true]);
            if (!is_resource($process)) { throw new HandoverFailure('Original command wrapper could not start.'); }
            proc_close($process); fclose($out); fclose($err);
        }
        if (!is_file($resultPath)) { throw new HandoverFailure('Retain the original command; no actual native completion was returned.', 'COMMAND_UNCERTAIN'); }
        $result = Files::readJson($resultPath);
        if (($result['schema'] ?? null) !== 'tjl.catalogue.native-command-result.v1'
            || ($result['request_sha256'] ?? null) !== $sha || ($result['argv'] ?? null) !== $argv
            || ($result['cwd'] ?? null) !== $request['cwd'] || !is_int($result['returncode'] ?? null)
            || !is_int($result['child_pid'] ?? null)) { throw new HandoverFailure('Actual native receipt does not match the original command.'); }
        foreach (['stdout', 'stderr'] as $name) {
            $actual = $this->identity($result[$name]['path'] ?? '');
            if ($actual['type'] !== 'file' || $actual['bytes'] !== $result[$name]['bytes'] || $actual['sha256'] !== $result[$name]['sha256']) { throw new HandoverFailure('Original native output changed.'); }
        }
        $this->state['commands'][$stage]['result'] = $result;
        $this->save();
        if ($result['returncode'] !== 0) { throw new HandoverFailure('Native command failed with actual exit ' . $result['returncode'] . ': ' . $stage, 'NATIVE_COMMAND_FAILED'); }
        return $result;
    }

    private function selectedCommand(string $name, string $stage, array $variables = []): array
    {
        $spec = $this->config['commands'][$name];
        $variables += ['project' => $this->config['project_root'], 'work' => $this->work,
            'php' => $this->config['php_executable'], 'console' => $this->config['project_root'] . '/' . $this->config['console']];
        $replace = static function (string $value) use ($variables): string {
            return preg_replace_callback('/\{([a-z_]+)\}/', static function (array $match) use ($variables): string {
                if (!isset($variables[$match[1]])) { throw new HandoverFailure('Unbound native command placeholder: ' . $match[1]); }
                return $variables[$match[1]];
            }, $value);
        };
        $argv = array_map($replace, $spec['argv']);
        $stdin = isset($spec['stdin']) ? $replace($spec['stdin']) : null;
        return $this->command($stage, $argv, $stdin);
    }

    private function freshStage(string $name): string
    {
        $this->state['sequence'] = ($this->state['sequence'] ?? 0) + 1; $this->save();
        return $name . ':' . $this->state['sequence'];
    }

    private function probe(string $stage): array
    {
        $directory = $this->directory('probes/' . hash('sha256', $stage));
        $output = $directory . '/site.json';
        $hashes = $this->directory('probes/' . hash('sha256', $stage) . '/hashes');
        $receipt = $this->command($stage, [$this->config['php_executable'], dirname(__DIR__) . '/native-site.php',
            '--configuration=' . $this->configuration, '--output=' . $output, '--hash-directory=' . $hashes]);
        $announced = Files::readJson($receipt['stdout']['path']);
        if (($announced['output'] ?? null) !== $output || ($announced['sha256'] ?? null) !== hash_file('sha256', $output)) { throw new HandoverFailure('Native probe output differs from its original command receipt.'); }
        $probe = Files::readJson($output);
        if (($probe['schema'] ?? null) !== 'tjl.catalogue.native-site.v1' || ($probe['state'] ?? null) !== 'COMPLETE'
            || ($probe['site_key'] ?? null) !== $this->config['site_key']) { throw new HandoverFailure('Native site probe did not bind the selected original site.'); }
        return $probe;
    }

    public function inspect(): array { return $this->probe($this->freshStage('inspect')); }

    private function excluded(string $relative): bool
    {
        foreach (array_merge($this->config['host_private_paths'], $this->config['excluded_runtime_paths']) as $path) {
            if ($relative === $path || str_starts_with($relative, $path . '/')) { return true; }
        }
        $absolute = $this->config['project_root'] . '/' . $relative;
        foreach ($this->roots as $group => $root) {
            if ($group !== 'project' && Files::inside($absolute, $root)) { return true; }
        }
        return false;
    }

    private function inventory(): array
    {
        $entries = []; $sources = []; $bytes = 0;
        foreach ($this->roots as $prefix => $root) {
            $entries[$prefix] = ['path' => $prefix] + $this->identity($root);
            $walk = function (string $directory, string $relative) use (&$walk, $root, $prefix, &$entries, &$sources, &$bytes): void {
                $names = scandir($directory);
                if ($names === false) { throw new HandoverFailure('Cannot enumerate complete original source.'); }
                foreach ($names as $name) {
                    if ($name === '.' || $name === '..') { continue; }
                    $local = $relative === '' ? $name : $relative . '/' . $name;
                    if ($prefix === 'project' && $this->excluded($local)) { continue; }
                    $path = $directory . '/' . $name; $member = $prefix . '/' . $local;
                    $identity = $this->identity($path);
                    $entries[$member] = ['path' => $member] + $identity;
                    if ($identity['type'] === 'directory') { $walk($path, $local); }
                    elseif ($identity['type'] === 'file') {
                        $bytes += $identity['bytes']; $sources[$member] = $path;
                        if ($bytes > $this->config['max_bytes']) { throw new HandoverFailure('Complete source exceeds the selected byte limit.'); }
                    }
                }
            };
            $walk($root, '');
        }
        ksort($entries); ksort($sources);
        return ['entries' => array_values($entries), 'sources' => $sources, 'bytes' => $bytes];
    }

    private function comparable(array $probe): array
    {
        return ['platform' => $probe['database']['platform'], 'tables' => $probe['database']['tables'],
            'composer' => $probe['composer'], 'console' => $probe['console'], 'queue_mode' => $probe['queue_mode']];
    }

    private function freeze(string $name): array
    {
        $directory = $this->directory('captures/' . $name);
        $manifestPath = $directory . '/manifest.json';
        if (is_file($manifestPath)) {
            $manifest = Files::readJson($manifestPath); Archive::validateManifest($manifest);
            $sources = [];
            foreach ($manifest['entries'] as $entry) {
                if ($entry['type'] !== 'file') { continue; }
                $path = $directory . '/files/' . $entry['path'];
                $actual = $this->identity($path);
                if ($actual['type'] !== 'file' || $actual['bytes'] !== $entry['bytes'] || $actual['sha256'] !== $entry['sha256']) { throw new HandoverFailure('Frozen native source member changed.'); }
                $sources[$entry['path']] = $path;
            }
            return ['manifest' => $manifest, 'sources' => $sources, 'directory' => $directory];
        }
        $this->selectedCommand('verify_drained', $this->freshStage($name . ':drained'));
        $probe = $this->probe($name . ':source-probe');
        $database = $directory . '/database.sql';
        $queues = $this->directory('captures/' . $name . '/queue');
        $variables = ['database_sql' => $database, 'queue_directory' => $queues];
        $dump = $this->selectedCommand('database_dump', $name . ':database-dump', $variables);
        if ($this->config['commands']['database_dump']['output'] === 'stdout') { $this->copy($dump['stdout']['path'], $database); }
        $databaseIdentity = $this->identity($database);
        if ($databaseIdentity['type'] !== 'file' || $databaseIdentity['bytes'] < 1) { throw new HandoverFailure('Native database dump did not retain complete nonempty SQL.'); }
        $queueReceipt = null;
        if ($this->config['queue_mode'] === 'external') {
            $queueReceipt = $this->selectedCommand('queue_export', $name . ':queue-export', $variables);
            if (count(scandir($queues)) <= 2) { throw new HandoverFailure('The original external queue export retained no native files.'); }
        }
        $inventory = $this->inventory();
        $entries = $inventory['entries']; $liveSources = $inventory['sources'];
        $entries[] = ['path' => 'database/database.sql'] + $databaseIdentity;
        $liveSources['database/database.sql'] = $database;
        if ($queueReceipt !== null) {
            $queueWalk = function (string $path, string $relative) use (&$queueWalk, &$entries, &$liveSources): void {
                $identity = $this->identity($path);
                if ($identity['type'] === 'symlink') { throw new HandoverFailure('Native external queue export must contain ordinary complete files.'); }
                $entries[] = ['path' => $relative] + $identity;
                if ($identity['type'] === 'file') { $liveSources[$relative] = $path; }
                elseif ($identity['type'] === 'directory') {
                    foreach (scandir($path) as $name) { if ($name !== '.' && $name !== '..') { $queueWalk($path . '/' . $name, $relative . '/' . $name); } }
                }
            };
            $queueWalk($queues, 'metadata/queue');
        }
        $rootKeys = array_keys($this->roots);
        $source = ['schema' => 'tjl.catalogue.native-source.v1', 'site_key' => $this->config['site_key'],
            'operation_id' => $this->operationId, 'probe' => $probe, 'roots' => $rootKeys,
            'store_root_key' => 'private/' . array_search($this->config['store_root'], $this->config['roots']['private'], true),
            'host_private_paths' => $this->config['host_private_paths'], 'excluded_runtime_paths' => $this->config['excluded_runtime_paths'],
            'database' => $databaseIdentity, 'database_dump_receipt' => $dump, 'queue_export_receipt' => $queueReceipt,
            'filesystem_sha256' => hash('sha256', Files::json($inventory['entries'])), 'created_at' => gmdate(DATE_ATOM)];
        $sourcePath = $directory . '/source.json'; Files::writeJson($sourcePath, $source);
        $entries[] = ['path' => 'metadata/source.json'] + $this->identity($sourcePath);
        $liveSources['metadata/source.json'] = $sourcePath;
        usort($entries, static fn (array $a, array $b): int => strcmp($a['path'], $b['path']));
        $manifest = ['format' => Archive::MANIFEST, 'source' => $source, 'entries' => $entries];
        Archive::validateManifest($manifest);
        $sources = []; $total = 0;
        foreach ($entries as $entry) {
            if ($entry['type'] !== 'file') { continue; }
            $total += $entry['bytes'];
            if ($total > $this->config['max_bytes']) { throw new HandoverFailure('Complete source, SQL and queue exceed the selected archive limit.'); }
            $to = $directory . '/files/' . $entry['path']; Files::makeParent($to, $directory);
            $this->copy($liveSources[$entry['path']], $to); $sources[$entry['path']] = $to;
        }
        $this->selectedCommand('verify_drained', $this->freshStage($name . ':still-drained'));
        $after = $this->probe($this->freshStage($name . ':after-probe'));
        if ($this->comparable($after) !== $this->comparable($probe) || $this->inventory()['entries'] !== $inventory['entries']) {
            throw new HandoverFailure('The original native database or installed files changed while frozen; retain this attempt and restore the selected drain.', 'SOURCE_CHANGED');
        }
        Files::writeJson($manifestPath, $manifest);
        return ['manifest' => $manifest, 'sources' => $sources, 'directory' => $directory];
    }

    private function authenticated(string $archive, string $key, string $name): array
    {
        $identity = $this->identity($archive);
        if ($identity['type'] !== 'file' || $identity['bytes'] > $this->config['max_bytes']) { throw new HandoverFailure('Select a complete original archive within the configured limit.'); }
        $base = $this->directory('authenticated/' . $name . '-' . $identity['sha256']);
        $original = $base . '/original.native';
        if (!is_file($original)) { $this->copy($archive, $original); }
        $retained = $this->identity($original);
        if ($retained['bytes'] !== $identity['bytes'] || $retained['sha256'] !== $identity['sha256']) { throw new HandoverFailure('Retained original archive changed.'); }
        // Authenticate anew in a fresh private slot. An incomplete prior slot never authorizes any target mutation.
        $stage = $this->directory('authenticated/' . $name . '-' . $identity['sha256'] . '/read-' . bin2hex(random_bytes(8)));
        $received = Archive::receive($original, $key, $stage);
        $source = $received['manifest']['source'];
        if (($source['schema'] ?? null) !== 'tjl.catalogue.native-source.v1') { throw new HandoverFailure('Select the original native Symfony catalogue archive.'); }
        if (Files::readJson($stage . '/metadata/source.json') !== $source) { throw new HandoverFailure('Authenticated source metadata disagrees with its manifest.'); }
        return $received + ['original_path' => $original, 'archive_identity' => $identity];
    }

    private function archive(string $name, string $path, string $key): array
    {
        $path = Files::absolute($path); Files::assertParent($path);
        foreach ($this->roots as $root) { if (Files::inside($path, $root)) { throw new HandoverFailure('Keep encrypted output outside the original installed roots.'); } }
        $frozen = $this->freeze($name);
        if (!is_file($path)) { Archive::write($path, $key, $frozen['manifest'], $frozen['sources']); }
        $received = $this->authenticated($path, $key, $name);
        if ($received['manifest'] !== $frozen['manifest']) { throw new HandoverFailure('Existing archive is not the original frozen project.'); }
        return ['path' => $path, 'bytes' => filesize($path), 'sha256' => hash_file('sha256', $path),
            'manifest_sha256' => $received['manifest_sha256'], 'source' => $received['manifest']['source'],
            'manifest' => $received['manifest'], 'authenticated_directory' => $received['directory']];
    }

    public function export(string $archive, string $key): array
    {
        $archive = Files::absolute($archive);
        if (isset($this->state['export'])) {
            if ($this->state['export']['path'] !== $archive) { throw new HandoverFailure('Continue the original archive destination.'); }
            if (($this->state['status'] ?? null) === 'EXPORTED') { return $this->state['export']; }
        }
        $this->state['status'] = 'EXPORTING'; $this->save();
        $this->selectedCommand('drain', 'export:drain');
        $result = $this->archive('source', $archive, $key);
        $this->state['export'] = ['schema' => 'tjl.catalogue.native-export.v1', 'state' => 'COMPLETE', 'operation_id' => $this->operationId] + $result;
        $this->save();
        $this->selectedCommand('resume', 'export:resume');
        $this->state['status'] = 'EXPORTED'; $this->save();
        return $this->state['export'];
    }

    public function review(string $archive, string $key): array
    {
        if (isset($this->state['review'])) {
            if ($this->state['review']['archive']['sha256'] !== $this->identity($archive)['sha256']) { throw new HandoverFailure('Continue the same authenticated source archive.'); }
            return $this->state['review'];
        }
        $received = $this->authenticated($archive, $key, 'incoming');
        $source = $received['manifest']['source'];
        if ($source['roots'] !== array_keys($this->roots)
            || $source['store_root_key'] !== 'private/' . array_search($this->config['store_root'], $this->config['roots']['private'], true)) {
            throw new HandoverFailure('Map every original logical storage root and the original catalogue Store to this existing target.');
        }
        // Do not import captured source secrets into paths which the target has declared private.
        foreach ($received['manifest']['entries'] as $entry) {
            if (str_starts_with($entry['path'], 'project/') && $this->excluded(substr($entry['path'], 8))) {
                throw new HandoverFailure('Incoming source overlaps a selected target-private/runtime/storage path: ' . $entry['path']);
            }
        }
        $this->state['status'] = 'TARGET_DRAINING'; $this->save();
        $this->selectedCommand('drain', 'target:drain');
        $backup = $this->archive('target-backup', $this->work . '/target-backup.native', $key);
        if ($source['probe']['database']['platform'] !== $backup['source']['probe']['database']['platform']
            || $source['probe']['queue_mode'] !== $this->config['queue_mode']) {
            throw new HandoverFailure('Native database platform and queue mode must match the selected original transfer.');
        }
        $review = ['schema' => 'tjl.catalogue.native-target-review.v1', 'operation_id' => $this->operationId,
            'state' => 'REVIEWED_TARGET_DRAINED', 'archive' => ['path' => $received['original_path'],
                'sha256' => $received['archive_sha256'], 'manifest_sha256' => $received['manifest_sha256']],
            'source' => $source, 'target' => $backup['source']['probe'], 'target_roots' => $this->roots,
            'target_backup' => $backup, 'configuration_sha256' => hash('sha256', Files::json($this->config)),
            'created_at' => gmdate(DATE_ATOM)];
        $review['review_sha256'] = hash('sha256', Files::json($review));
        $this->state['review'] = $review; $this->state['status'] = 'TARGET_REVIEWED'; $this->save();
        return $review;
    }

    private function requireReview(string $expected): array
    {
        $review = $this->state['review'] ?? null;
        if (!is_array($review) || !hash_equals($review['review_sha256'], $expected)) { throw new HandoverFailure('Supply the exact returned original target review SHA before mutation.', 'TARGET_REVIEW_REQUIRED'); }
        $copy = $review; unset($copy['review_sha256']);
        if (hash('sha256', Files::json($copy)) !== $expected) { throw new HandoverFailure('Original target review changed.'); }
        return $review;
    }

    private function destination(string $member): ?string
    {
        foreach (array_reverse($this->roots, true) as $prefix => $root) {
            if ($member === $prefix) { return $root; }
            if (str_starts_with($member, $prefix . '/')) { return $root . '/' . substr($member, strlen($prefix) + 1); }
        }
        return null;
    }

    private function applyFiles(string $phase, array $received, array $before): void
    {
        $map = static function (array $entries): array {
            $result = [];
            foreach ($entries as $entry) { $result[$entry['path']] = $entry; }
            return $result;
        };
        $desired = $map($received['manifest']['entries']); $old = $map($before);
        $planPath = $this->work . '/' . $phase . '-file-plan.json';
        if (is_file($planPath)) {
            $plan = Files::readJson($planPath);
            if ($plan['archive_sha256'] !== $received['archive_sha256']) { throw new HandoverFailure('Original native file plan changed source.'); }
        } else {
            $steps = []; $members = array_unique(array_merge(array_keys($old), array_keys($desired)));
            foreach ($members as $member) {
                $destination = $this->destination($member);
                if ($destination === null) { continue; }
                $beforeEntry = $old[$member] ?? ['path' => $member, 'type' => 'absent'];
                $afterEntry = $desired[$member] ?? ['path' => $member, 'type' => 'absent'];
                unset($beforeEntry['path'], $afterEntry['path']);
                if ($beforeEntry === $afterEntry) { continue; }
                if ($beforeEntry['type'] !== 'absent' && $afterEntry['type'] !== 'absent'
                    && $beforeEntry['type'] !== $afterEntry['type']) {
                    throw new HandoverFailure('Native member changes filesystem kind; reconcile this exact target before receiving: ' . $member);
                }
                $steps[$member] = ['member' => $member, 'destination' => $destination, 'before' => $beforeEntry, 'after' => $afterEntry, 'state' => 'PREPARED'];
            }
            uksort($steps, static function (string $a, string $b) use ($steps): int {
                $aa = $steps[$a]['after']['type']; $bb = $steps[$b]['after']['type'];
                $rank = static fn (string $type): int => $type === 'absent' ? 2 : ($type === 'directory' ? 0 : 1);
                if ($rank($aa) !== $rank($bb)) { return $rank($aa) <=> $rank($bb); }
                if ($aa === 'absent') { return substr_count($b, '/') <=> substr_count($a, '/') ?: strcmp($a, $b); }
                return substr_count($a, '/') <=> substr_count($b, '/') ?: strcmp($a, $b);
            });
            $plan = ['schema' => 'tjl.catalogue.native-file-plan.v1', 'archive_sha256' => $received['archive_sha256'], 'steps' => $steps];
            Files::writeJson($planPath, $plan);
        }
        foreach ($plan['steps'] as $member => &$step) {
            if ($step['state'] === 'COMPLETE') { continue; }
            $path = $step['destination']; Files::assertParent($path);
            $actual = $this->identity($path);
            if ($actual === $step['after']) { $step['state'] = 'COMPLETE'; $step['adopted_at'] = gmdate(DATE_ATOM); Files::writeJson($planPath, $plan); continue; }
            // A previous atomic file install may have completed before the final chmod.
            $sameContent = $actual; $sameAfter = $step['after']; unset($sameContent['mode'], $sameAfter['mode']);
            if ($actual !== $step['before'] && $sameContent !== $sameAfter) {
                $step['observed_conflict'] = $actual; Files::writeJson($planPath, $plan);
                throw new HandoverFailure('Target member differs from the reviewed preimage and original postimage: ' . $member, 'TARGET_CHANGED');
            }
            $step['state'] = 'APPLYING'; Files::writeJson($planPath, $plan);
            $after = $step['after'];
            if ($after['type'] === 'absent') {
                if ($actual['type'] === 'directory') { if (!rmdir($path)) { throw new HandoverFailure('Original target directory contains an unreviewed member.'); } }
                elseif ($actual['type'] !== 'absent' && !unlink($path)) { throw new HandoverFailure('Cannot remove reviewed native member.'); }
            } elseif ($after['type'] === 'directory') {
                if (!is_dir($path) && !mkdir($path, 0700)) { throw new HandoverFailure('Cannot create native directory.'); }
                if (!chmod($path, $after['mode'])) { throw new HandoverFailure('Cannot restore native directory mode.'); }
            } elseif ($after['type'] === 'file') {
                $source = $received['directory'] . '/' . $member;
                $this->copy($source, $path);
                if (!chmod($path, $after['mode'])) { throw new HandoverFailure('Cannot restore native file mode.'); }
            } elseif ($after['type'] === 'symlink') {
                if (is_link($path)) { unlink($path); }
                if (!symlink($after['target'], $path)) { throw new HandoverFailure('Cannot restore original internal native link.'); }
            }
            if ($this->identity($path) !== $after) { throw new HandoverFailure('Installed native postimage differs: ' . $member); }
            $step['state'] = 'COMPLETE'; $step['completed_at'] = gmdate(DATE_ATOM); Files::writeJson($planPath, $plan);
        }
        unset($step);
        $this->state[$phase . '_files'] = ['path' => $planPath, 'sha256' => hash_file('sha256', $planPath), 'state' => 'COMPLETE']; $this->save();
    }

    private function restore(string $phase, array $received, array $before, string $expected): array
    {
        $this->requireReview($expected);
        if (isset($this->state[$phase . '_result'])) { return $this->state[$phase . '_result']; }
        $source = $received['manifest']['source'];
        if (isset($this->state[$phase . '_verified'])) {
            $this->selectedCommand('resume', $phase . ':resume');
            $this->state[$phase . '_result'] = $this->state[$phase . '_verified'];
            $this->state['status'] = strtoupper($phase) . '_COMPLETE'; $this->save();
            return $this->state[$phase . '_result'];
        }
        $this->state['status'] = strtoupper($phase) . '_APPLYING'; $this->save();
        $this->selectedCommand('verify_drained', $this->freshStage($phase . ':drained'));
        $this->applyFiles($phase, $received, $before);
        $variables = ['database_sql' => $received['directory'] . '/database/database.sql',
            'queue_directory' => $received['directory'] . '/metadata/queue'];
        // The SQL command identity must stay stable across newly authenticated staging slots.
        $inputs = $this->directory($phase . '-inputs');
        $sql = $inputs . '/database.sql';
        if (!is_file($sql)) { $this->copy($variables['database_sql'], $sql); }
        $actualSql = $this->identity($sql);
        if ($actualSql['bytes'] !== $source['database']['bytes'] || $actualSql['sha256'] !== $source['database']['sha256']) { throw new HandoverFailure('Retained native SQL input differs from authenticated source.'); }
        $variables['database_sql'] = $sql;
        $this->selectedCommand('database_import', $phase . ':database-import', $variables);
        if ($this->config['queue_mode'] === 'external') {
            // Keep the authenticated native queue directory selected on the first import.
            $this->state[$phase . '_queue_directory'] ??= $variables['queue_directory']; $this->save();
            $variables['queue_directory'] = $this->state[$phase . '_queue_directory'];
            $this->selectedCommand('queue_import', $phase . ':queue-import', $variables);
        }
        if (isset($this->config['commands']['cache_rebuild'])) { $this->selectedCommand('cache_rebuild', $phase . ':cache', $variables); }
        $target = $this->probe($phase . ':reopen');
        if ($this->comparable($target) !== $this->comparable($source['probe'])) {
            $this->state[$phase . '_reopen_difference'] = ['source' => $source['probe'], 'target' => $target]; $this->save();
            throw new HandoverFailure('Actual independently reopened native database/dependency state differs from authenticated source.', 'REOPEN_MISMATCH');
        }
        if (isset($this->config['commands']['verify_reopen'])) { $this->selectedCommand('verify_reopen', $phase . ':verify-reopen', $variables); }
        $result = ['schema' => 'tjl.catalogue.native-reopen.v1', 'state' => 'COMPLETE', 'phase' => $phase,
            'operation_id' => $this->operationId, 'review_sha256' => $expected,
            'archive_sha256' => $received['archive_sha256'], 'source' => $source, 'target' => $target,
            'target_roots' => $this->roots, 'source_manifest' => $received['manifest'], 'completed_at' => gmdate(DATE_ATOM)];
        // Persist the actual independent reopen before resuming original native writers.
        $this->state[$phase . '_verified'] = $result; $this->save();
        $this->selectedCommand('resume', $phase . ':resume');
        $this->state[$phase . '_result'] = $result; $this->state['status'] = strtoupper($phase) . '_COMPLETE'; $this->save();
        return $result;
    }

    public function receive(string $key, string $expected): array
    {
        $review = $this->requireReview($expected);
        if (isset($this->state['receive_result'])) { return $this->state['receive_result']; }
        if (isset($this->state['recover_result'])) { throw new HandoverFailure('This original receive was recovered; use a new explicitly reviewed operation for another transfer.'); }
        $received = $this->authenticated($review['archive']['path'], $key, 'incoming');
        if ($received['archive_sha256'] !== $review['archive']['sha256']) { throw new HandoverFailure('Original incoming archive changed.'); }
        if (!is_file($this->work . '/receive-file-plan.json')) {
            $probe = $this->probe($this->freshStage('target:before-receive'));
            $old = $review['target_backup']['manifest']['entries'];
            $oldFiles = array_values(array_filter($old, fn (array $entry): bool => $this->destination($entry['path']) !== null));
            if ($this->comparable($probe) !== $this->comparable($review['target']) || $this->inventory()['entries'] !== $oldFiles) {
                throw new HandoverFailure('The selected target changed after its authenticated backup/review.', 'TARGET_CHANGED');
            }
        }
        return $this->restore('receive', $received, $review['target_backup']['manifest']['entries'], $expected);
    }

    public function recover(string $key, string $expected): array
    {
        $review = $this->requireReview($expected);
        if (isset($this->state['recover_result'])) { return $this->state['recover_result']; }
        $this->selectedCommand('drain', 'recover:drain');
        $received = $this->authenticated($review['target_backup']['path'], $key, 'target-backup');
        if ($received['archive_sha256'] !== $review['target_backup']['sha256']) { throw new HandoverFailure('Original target recovery archive changed.'); }
        // Recover only original reviewed preimages/postimages. Preserve evidence of any unknown database command.
        foreach ($this->state['commands'] as $stage => $command) {
            if (str_starts_with($stage, 'receive:') && !isset($command['result'])
                && is_file($command['directory'] . '/worker.json') && !is_file($command['directory'] . '/result.json')) {
                throw new HandoverFailure('Reconcile the original uncertain native receive command before recovery: ' . $stage, 'COMMAND_UNCERTAIN');
            }
        }
        $beforePath = $this->work . '/recover-before.json';
        if (!is_file($beforePath)) {
            $actual = $this->inventory()['entries'];
            $reviewed = [];
            foreach ($review['target_backup']['manifest']['entries'] as $entry) { if ($this->destination($entry['path']) !== null) { $reviewed[$entry['path']][] = $entry; } }
            $incoming = $this->authenticated($review['archive']['path'], $key, 'incoming');
            foreach ($incoming['manifest']['entries'] as $entry) { if ($this->destination($entry['path']) !== null) { $reviewed[$entry['path']][] = $entry; } }
            foreach ($actual as $entry) {
                if (!in_array($entry, $reviewed[$entry['path']] ?? [], true)) { throw new HandoverFailure('Recovery found an unreviewed target member: ' . $entry['path'], 'TARGET_CHANGED'); }
            }
            Files::writeJson($beforePath, ['entries' => $actual]);
        }
        return $this->restore('recover', $received, Files::readJson($beforePath)['entries'], $expected);
    }

    public function reopen(string $key, string $expected): array
    {
        $review = $this->requireReview($expected);
        if (isset($this->state['recover_result'])) { return $this->state['recover_result']; }
        if (!isset($this->state['receive_result'])) { return $this->receive($key, $expected); }
        // Original completion is immutable. Current observations are separate and may contain legitimate later work.
        return $this->state['receive_result'] + ['current_target' => $this->probe($this->freshStage('current-reopen'))];
    }
}
