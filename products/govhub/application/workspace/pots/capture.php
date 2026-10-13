<?php
declare(strict_types=1);
/**
 * GovHub POTS deployment capture.
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Run after the original POTS deployment in its existing PHP CI job.
 * No Composer dependency, login, deployment, backup creation or remote write.
 */

final class GovHubPotsCapture
{
    private const SCHEMA = 'govhub.pots.deployment-context/v1';
    private const CI_KEYS = [
        'CIRCLE_WORKFLOW_ID', 'CIRCLE_WORKFLOW_JOB_ID', 'CIRCLE_JOB_ID',
        'CIRCLE_PIPELINE_ID', 'CIRCLE_PROJECT_ID', 'CIRCLE_SHA1',
        'CIRCLE_BUILD_NUM', 'CIRCLE_JOB', 'CIRCLE_PROJECT_REPONAME',
        'CIRCLE_PROJECT_USERNAME', 'CIRCLE_BRANCH', 'CIRCLE_TAG',
        'CIRCLE_REPOSITORY_URL',
    ];
    private const SOURCE_LIMIT = 16777216;
    private const SOURCE_TOTAL_LIMIT = 134217728;
    private const SOURCE_FILE_LIMIT = 4096;
    private array $options;
    private array $context = [];
    private array $artifacts = [];
    private string $project;
    private string $root;
    private string $potsRoot;
    private int $sourceBytes = 0;
    private int $sourceCount = 0;
    private int $commandNumber = 0;
    private $lock = null;
    private array $terminus = [];

    public function __construct(array $options)
    {
        $this->options = $options;
        $this->project = $this->directory($options['project-root'], false);
        $this->root = $this->directory($options['output-dir'], true);
        $this->potsRoot = $this->pathFromProject($options['pots-root']);
        if ($this->root === '' || $this->root === $this->project || $this->root === $this->potsRoot
            || str_starts_with($this->root, $this->potsRoot . '/')) {
            throw new RuntimeException('Select a dedicated capture output directory outside the installed POTS source.');
        }
        $members = scandir($this->root);
        if ($members === false) {
            throw new RuntimeException('Capture directory cannot be inspected.');
        }
        foreach ($members as $member) {
            if (!in_array($member, ['.', '..', '.capture.lock', 'context.json', 'request.json', 'capture.php', 'commands', 'sources'], true)
                && !preg_match('/^(context|request)\\.json\\.tmp-[0-9a-f]+$/D', $member)) {
                throw new RuntimeException('Output directory contains unrelated files; select a dedicated capture directory.');
            }
        }
        if (!chmod($this->root, 0700)) {
            throw new RuntimeException('Cannot keep capture directory private.');
        }
        $lockPath = $this->root . '/.capture.lock';
        $this->rejectLink($lockPath);
        $this->lock = fopen($lockPath, 'c+b');
        if ($this->lock === false || !chmod($lockPath, 0600)
            || !flock($this->lock, LOCK_EX | LOCK_NB)) {
            throw new RuntimeException('This capture directory has an active writer.');
        }
    }

    public static function options(array $argv): array
    {
        $out = [
            'project-root' => getcwd() ?: '.',
            'output-dir' => null,
            'pots-root' => 'vendor/fourkitchens/pots',
            'site' => null,
            'environment' => null,
            'terminus' => 'terminus',
            'php' => null,
            'git' => 'git',
            'timeout-seconds' => 120,
            'max-output-bytes' => 16777216,
            'workflow-id' => [],
            'source-file' => [],
            'all-workflows' => false,
            'capture-id' => null,
            'run-id' => null,
            'project-id' => null,
            'workflow-id-ci' => null,
            'job-id' => null,
            'source-revision' => null,
        ];
        for ($i = 1; $i < count($argv); ++$i) {
            $word = $argv[$i];
            if ($word === '--help' || $word === '-h') {
                self::help();
                exit(0);
            }
            if ($word === '--all-workflows') {
                $out['all-workflows'] = true;
                continue;
            }
            if (!str_starts_with($word, '--')) {
                throw new InvalidArgumentException('Expected an explicit --option.');
            }
            $pair = explode('=', substr($word, 2), 2);
            $key = $pair[0];
            if (!array_key_exists($key, $out) || $key === 'all-workflows') {
                throw new InvalidArgumentException('Unknown capture option: ' . $key);
            }
            $value = $pair[1] ?? ($argv[++$i] ?? null);
            if ($value === null || $value === '' || str_starts_with($value, '--')) {
                throw new InvalidArgumentException('Missing value for --' . $key);
            }
            self::text($value, $key, 4096);
            if (in_array($key, ['workflow-id', 'source-file'], true)) {
                $out[$key][] = $value;
            } else {
                $out[$key] = $value;
            }
        }
        foreach (['output-dir', 'site', 'environment'] as $required) {
            if ($out[$required] === null) {
                throw new InvalidArgumentException('Required option: --' . $required);
            }
        }
        foreach (['timeout-seconds' => [5, 1800], 'max-output-bytes' => [65536, 268435456]] as $key => $range) {
            if (!preg_match('/^[0-9]+$/D', (string) $out[$key])
                || (int) $out[$key] < $range[0] || (int) $out[$key] > $range[1]) {
                throw new InvalidArgumentException('Invalid range for --' . $key);
            }
            $out[$key] = (int) $out[$key];
        }
        foreach (['site', 'environment'] as $key) {
            if (!preg_match('/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/D', $out[$key])) {
                throw new InvalidArgumentException('Invalid explicit Pantheon ' . $key);
            }
        }
        $out['workflow-id'] = array_values(array_unique(array_map(
            static fn(string $value): string => self::uuid($value, 'workflow-id'),
            $out['workflow-id']
        )));
        if (count($out['workflow-id']) > 100 || count($out['source-file']) > 256) {
            throw new InvalidArgumentException('Too many explicitly selected workflow or source inputs.');
        }
        if ($out['capture-id'] !== null
            && !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/D', $out['capture-id'])) {
            throw new InvalidArgumentException('capture-id must be a portable nonsecret identifier.');
        }
        return $out;
    }

    private static function help(): void
    {
        fwrite(STDOUT, <<<'HELP'
Usage:
  php capture.php --project-root ABS --output-dir ABS --site SITE --environment ENV
    [--pots-root vendor/fourkitchens/pots] [--terminus terminus] [--php php]
    [--workflow-id ORIGINAL_PANTHEON_UUID ...] [--all-workflows]
    [--source-file .circleci/scripts/EXACT_OVERRIDE ...]
    [--capture-id ORIGINAL_ID] [--timeout-seconds 120]
    [--max-output-bytes 16777216]
    [--run-id UUID] [--project-id UUID] [--workflow-id-ci UUID] [--job-id UUID]
    [--source-revision ORIGINAL_CHECKOUT_SHA]

The existing POTS deployment selects the actual target. Pass test or live explicitly
for their respective native jobs. The current Terminus executable and session are
reused. Only fixed read-only commands are invoked.

context.json and its exact source/output files form one private artifact directory.
A completed or partial capture is immutable for the same identity and can be reopened.
A later observation uses a new output directory/capture-id, preserving the old edition.
Exit 0 = COMPLETE; 2 = PARTIAL/INTERRUPTED or a capture setup failure.
HELP
        );
        fwrite(STDOUT, "\n");
    }

    private static function text(string $value, string $label, int $limit): void
    {
        if (strlen($value) > $limit || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)
            || preg_match('//u', $value) !== 1) {
            throw new InvalidArgumentException('Invalid text in ' . $label);
        }
    }

    private static function uuid(string $value, string $label): string
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD', $value)) {
            throw new InvalidArgumentException('Expected an actual UUID for ' . $label);
        }
        return strtolower($value);
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\TH:i:s\Z');
    }

    private static function json(array $value): string
    {
        return json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
            | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR) . "\n";
    }

    private function rejectLink(string $path): void
    {
        if (is_link($path)) {
            throw new RuntimeException('Capture paths must be regular files/directories: ' . $path);
        }
    }

    private function directory(string $path, bool $create): string
    {
        $this->rejectLink($path);
        $created = false;
        if (!is_dir($path)) {
            if (!$create || !mkdir($path, 0700, true)) {
                throw new RuntimeException('Directory unavailable: ' . $path);
            }
            $created = true;
        }
        $real = realpath($path);
        if ($real === false || !is_dir($real)) {
            throw new RuntimeException('Directory cannot be resolved: ' . $path);
        }
        if ($created && !chmod($real, 0700)) {
            throw new RuntimeException('Cannot keep capture directory private.');
        }
        return rtrim($real, DIRECTORY_SEPARATOR);
    }

    private function pathFromProject(string $path): string
    {
        $result = str_starts_with($path, DIRECTORY_SEPARATOR)
            ? $path : $this->project . '/' . $path;
        $real = realpath($result);
        if ($real !== false) {
            $result = $real;
        }
        if ($result !== $this->project && !str_starts_with($result, $this->project . '/')) {
            throw new InvalidArgumentException('Source paths must belong to the selected checkout.');
        }
        return rtrim($result, '/');
    }

    private function outputPath(string $relative): string
    {
        if ($relative === '' || str_starts_with($relative, '/') || str_contains($relative, '\\')
            || preg_match('~(^|/)\.\.?(/|$)~', $relative) || str_contains($relative, "\0")) {
            throw new RuntimeException('Invalid relative artifact path.');
        }
        $path = $this->root . '/' . $relative;
        $parent = dirname($path);
        if (!is_dir($parent)) {
            $this->directory($parent, true);
        }
        $realParent = realpath($parent);
        if ($realParent === false || ($realParent !== $this->root
            && !str_starts_with($realParent, $this->root . '/'))) {
            throw new RuntimeException('Artifact directory escaped the selected output root.');
        }
        $this->rejectLink($path);
        return $path;
    }

    private static function writeAll($stream, string $bytes): void
    {
        for ($offset = 0, $length = strlen($bytes); $offset < $length;) {
            $written = fwrite($stream, substr($bytes, $offset));
            if ($written === false || $written === 0) {
                throw new RuntimeException('Capture write failed.');
            }
            $offset += $written;
        }
    }

    private function atomic(string $relative, string $bytes, bool $replace = false): void
    {
        $path = $this->outputPath($relative);
        if (file_exists($path) && !$replace) {
            if (!is_file($path) || file_get_contents($path) !== $bytes) {
                throw new RuntimeException('Existing immutable artifact differs: ' . $relative);
            }
            return;
        }
        $temporary = $path . '.tmp-' . bin2hex(random_bytes(8));
        $stream = fopen($temporary, 'x+b');
        if ($stream === false) {
            throw new RuntimeException('Cannot create capture artifact.');
        }
        try {
            if (!chmod($temporary, 0600)) {
                throw new RuntimeException('Cannot set private capture permissions.');
            }
            self::writeAll($stream, $bytes);
            if (!fflush($stream) || (function_exists('fsync') && !fsync($stream))) {
                throw new RuntimeException('Cannot commit capture bytes.');
            }
        } finally {
            fclose($stream);
        }
        if (!rename($temporary, $path)) {
            throw new RuntimeException('Cannot publish capture artifact.');
        }
    }

    private function identity(string $relative): array
    {
        $path = $this->outputPath($relative);
        if (!is_file($path)) {
            throw new RuntimeException('Expected retained artifact: ' . $relative);
        }
        clearstatcache(true, $path);
        $size = filesize($path);
        $sha = hash_file('sha256', $path);
        if ($size === false || $sha === false) {
            throw new RuntimeException('Cannot identify retained artifact: ' . $relative);
        }
        return ['path' => $relative, 'bytes' => $size, 'sha256' => $sha];
    }

    private function artifact(string $relative): array
    {
        $identity = $this->identity($relative);
        $this->artifacts[$relative] = $identity;
        return $identity;
    }

    private function saveJson(string $relative, array $value): array
    {
        $this->atomic($relative, self::json($value));
        return $this->artifact($relative);
    }

    private function checkpoint(): void
    {
        ksort($this->artifacts, SORT_STRING);
        $this->context['artifact_files'] = array_values($this->artifacts);
        $this->atomic('context.json', self::json($this->context), true);
    }

    private function failure(string $code, string $message, ?string $command = null): void
    {
        $this->context['failures'][] = array_filter([
            'code' => $code, 'message' => $message, 'command' => $command,
        ], static fn($value): bool => $value !== null);
    }

    private function ci(): array
    {
        $ci = [];
        foreach (self::CI_KEYS as $key) {
            $value = getenv($key);
            if ($value === false || $value === '') {
                continue;
            }
            self::text($value, $key, 4096);
            if ($key === 'CIRCLE_REPOSITORY_URL') {
                // SSH's literal git@ identity is not a credential. HTTP userinfo and
                // query/fragment values are outside this nonsecret source allowlist.
                $ssh = preg_match('~^git@[A-Za-z0-9.-]+:[A-Za-z0-9._/-]+$~D', $value) === 1;
                $url = parse_url($value);
                $safeUrl = is_array($url) && in_array($url['scheme'] ?? '', ['https', 'http', 'ssh', 'git'], true)
                    && !isset($url['pass']) && !isset($url['query']) && !isset($url['fragment'])
                    && (!isset($url['user']) || (($url['scheme'] ?? '') === 'ssh' && $url['user'] === 'git'));
                if (!$ssh && !$safeUrl) {
                    throw new RuntimeException('CIRCLE_REPOSITORY_URL has credential-bearing or unsupported components.');
                }
            }
            $ci[$key] = $value;
        }
        return $ci;
    }

    private function ciIdentity(array $ci): array
    {
        $mapping = [
            'run_id' => ['run-id', 'CIRCLE_PIPELINE_ID'],
            'project_id' => ['project-id', 'CIRCLE_PROJECT_ID'],
            'workflow_id' => ['workflow-id-ci', 'CIRCLE_WORKFLOW_ID'],
            'job_id' => ['job-id', 'CIRCLE_WORKFLOW_JOB_ID'],
            'source_revision' => ['source-revision', 'CIRCLE_SHA1'],
        ];
        $values = [];
        $sources = [];
        foreach ($mapping as $key => [$option, $environment]) {
            $raw = $ci[$environment] ?? null;
            $explicit = $this->options[$option];
            $normalize = static function (?string $value) use ($key): ?string {
                if ($value === null) {
                    return null;
                }
                if ($key === 'source_revision') {
                    if (!preg_match('/^[0-9a-f]{40}$/iD', $value)) {
                        throw new InvalidArgumentException('Source revision must be an original 40-character commit SHA.');
                    }
                    return strtolower($value);
                }
                return self::uuid($value, $key);
            };
            $observed = $normalize($raw);
            $given = $normalize($explicit);
            if ($given !== null && $observed !== null && $given !== $observed) {
                throw new RuntimeException('Explicit CI identity conflicts with current ' . $environment);
            }
            $values[$key] = $given ?? $observed;
            $sources[$key] = $given !== null ? ['option' => '--' . $option, 'environment' => $raw !== null ? $environment : null]
                : ($observed !== null ? ['environment' => $environment] : null);
        }
        return [$values, $sources];
    }

    private function executable(string $selected, bool $mustExecute = true): array
    {
        $path = null;
        if (str_contains($selected, '/')) {
            $candidate = str_starts_with($selected, '/') ? $selected : $this->project . '/' . $selected;
            $path = realpath($candidate);
        } else {
            foreach (explode(PATH_SEPARATOR, getenv('PATH') ?: '') as $part) {
                if ($part === '') {
                    continue;
                }
                $candidate = $part . '/' . $selected;
                if (is_file($candidate) && (!$mustExecute || is_executable($candidate))) {
                    $path = realpath($candidate);
                    break;
                }
            }
        }
        if ($path === false || $path === null || !is_file($path) || !is_readable($path)
            || ($mustExecute && !is_executable($path))) {
            throw new RuntimeException('Selected executable is unavailable: ' . $selected);
        }
        return [
            'selected' => $selected, 'path' => $path, 'bytes' => filesize($path),
            'sha256' => hash_file('sha256', $path),
        ];
    }

    private function sourceAllowed(string $relative): bool
    {
        $segments = explode('/', strtolower(str_replace('\\', '/', $relative)));
        foreach ($segments as $segment) {
            if (in_array($segment, ['.git', '.svn', '.hg', 'node_modules', 'vendor', '.cache', '.terminus'], true)) {
                return false;
            }
        }
        $name = strtolower(basename($relative));
        return $name !== '.env' && !str_starts_with($name, '.env.')
            && !in_array($name, ['auth.json', 'credentials.json', 'secrets.json', 'terminus-cache-key.txt'], true);
    }

    private function copySource(string $source, string $sourcePath, string $kind, bool $required): void
    {
        if (!is_file($source)) {
            $this->context['source_selection'][] = ['source_path' => $sourcePath, 'kind' => $kind, 'status' => 'MISSING', 'required' => $required];
            if ($required) {
                $this->failure('source_missing', 'Required source input is unavailable: ' . $sourcePath);
            }
            return;
        }
        $this->rejectLink($source);
        $real = realpath($source);
        if ($real === false || !str_starts_with($real, $this->project . '/')) {
            throw new RuntimeException('Selected source escaped the original checkout.');
        }
        clearstatcache(true, $real);
        $size = filesize($real);
        if ($size === false || $size > self::SOURCE_LIMIT || $this->sourceBytes + $size > self::SOURCE_TOTAL_LIMIT
            || ++$this->sourceCount > self::SOURCE_FILE_LIMIT) {
            throw new RuntimeException('Source closure exceeds the retained capture limit.');
        }
        $relative = 'sources/' . $kind . '/' . $sourcePath;
        $destination = $this->outputPath($relative);
        $temporary = $destination . '.part';
        $this->rejectLink($temporary);
        $input = fopen($real, 'rb');
        $output = fopen($temporary, 'x+b');
        if ($input === false || $output === false) {
            if (is_resource($input)) {
                fclose($input);
            }
            if (is_resource($output)) {
                fclose($output);
            }
            throw new RuntimeException('Cannot preserve source input: ' . $sourcePath);
        }
        $copied = 0;
        $hash = hash_init('sha256');
        try {
            if (!chmod($temporary, 0600)) {
                throw new RuntimeException('Cannot make source copy private.');
            }
            while (!feof($input)) {
                $chunk = fread($input, 262144);
                if ($chunk === false) {
                    throw new RuntimeException('Source read failed: ' . $sourcePath);
                }
                $copied += strlen($chunk);
                if ($copied > self::SOURCE_LIMIT || $this->sourceBytes + $copied > self::SOURCE_TOTAL_LIMIT) {
                    throw new RuntimeException('Growing source exceeds capture size limit.');
                }
                hash_update($hash, $chunk);
                self::writeAll($output, $chunk);
            }
            if (!fflush($output) || (function_exists('fsync') && !fsync($output))) {
                throw new RuntimeException('Source flush failed.');
            }
        } finally {
            fclose($input);
            fclose($output);
        }
        if (!rename($temporary, $destination)) {
            throw new RuntimeException('Cannot retain the original source copy.');
        }
        $copiedSha = hash_final($hash);
        $stable = $copied === $size && hash_file('sha256', $real) === $copiedSha;
        $identity = $this->artifact($relative);
        $this->sourceBytes += $copied;
        $entry = [
            'source_path' => $sourcePath, 'kind' => $kind,
            'checkout_path' => substr($real, strlen($this->project) + 1),
            ...$identity, 'captured_at' => self::now(), 'stable_during_copy' => $stable,
        ];
        $this->context['sources'][] = $entry;
        $this->context['source_selection'][] = ['source_path' => $sourcePath, 'kind' => $kind, 'status' => 'CAPTURED', 'required' => $required];
        if (!$stable) {
            $this->failure('source_changed', 'Source changed while its byte edition was captured: ' . $sourcePath);
        }
    }

    private function captureSources(): void
    {
        $project = [
            'composer.json' => true, 'composer.lock' => true, '.circleci/config.yml' => true,
            'pantheon.yml' => false, 'pantheon.upstream.yml' => false,
            '.circleci/scripts/set-environment' => false, '.circleci/scripts/deploy' => false,
            '.circleci/scripts/deploy-to-test' => false, '.circleci/scripts/deploy-to-live' => false,
            '.circleci/scripts/drush-commands' => false, '.circleci/scripts/drush-config-import' => false,
            '.circleci/scripts/sync-from-live' => false,
        ];
        foreach ($this->options['source-file'] as $relative) {
            if (!str_starts_with($relative, '.circleci/') || str_contains($relative, '\\')
                || preg_match('~(^|/)\.\.?(/|$)~', $relative) || !$this->sourceAllowed($relative)) {
                throw new InvalidArgumentException('Additional source must be an exact nonsecret .circleci file.');
            }
            $project[$relative] = true;
        }
        foreach ($project as $relative => $required) {
            $this->copySource($this->project . '/' . $relative, $relative, 'project', $required);
        }
        if (!is_dir($this->potsRoot)) {
            $this->failure('pots_source_missing', 'The selected installed fourkitchens/pots package is unavailable.');
            return;
        }
        $this->rejectLink($this->potsRoot);
        $this->context['pots']['root'] = $this->potsRoot;
        $files = [];
        $walk = function (string $directory, string $prefix = '') use (&$walk, &$files): void {
            $names = scandir($directory);
            if ($names === false) {
                throw new RuntimeException('Cannot enumerate the installed POTS source.');
            }
            foreach ($names as $name) {
                if ($name === '.' || $name === '..') {
                    continue;
                }
                $relative = $prefix . $name;
                $absolute = $directory . '/' . $name;
                if (!$this->sourceAllowed($relative)) {
                    $this->context['source_selection'][] = ['source_path' => $relative, 'kind' => 'pots', 'status' => 'EXCLUDED_CACHE_OR_CREDENTIAL_PATH', 'required' => false];
                    continue;
                }
                if (is_link($absolute)) {
                    $this->failure('pots_source_link', 'Installed POTS source contains a symbolic link: ' . $relative);
                } elseif (is_dir($absolute)) {
                    $walk($absolute, $relative . '/');
                } elseif (is_file($absolute)) {
                    $files[$relative] = $absolute;
                } else {
                    $this->failure('pots_source_type', 'Installed POTS source has a nonregular entry: ' . $relative);
                }
                if (count($files) > self::SOURCE_FILE_LIMIT) {
                    throw new RuntimeException('Installed POTS source exceeds the file-count limit.');
                }
            }
        };
        $walk($this->potsRoot);
        ksort($files, SORT_STRING);
        foreach ($files as $relative => $absolute) {
            $this->copySource($absolute, $relative, 'pots', true);
        }
        $this->context['pots']['captured_file_count'] = count($files);
        $this->context['pots']['package'] = 'fourkitchens/pots';
        foreach (['composer.lock', 'vendor/composer/installed.json'] as $relative) {
            // installed.json is parsed narrowly for package metadata and is not copied:
            // the original project's complete composer.lock is already retained.
            $path = $this->project . '/' . $relative;
            if (!is_file($path) || is_link($path) || filesize($path) > self::SOURCE_LIMIT) {
                continue;
            }
            try {
                $data = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
                $packages = isset($data['packages']) ? $data['packages'] : $data;
                if ($relative === 'composer.lock') {
                    $packages = array_merge($data['packages'] ?? [], $data['packages-dev'] ?? []);
                }
                foreach ($packages as $package) {
                    if (is_array($package) && ($package['name'] ?? null) === 'fourkitchens/pots') {
                        $selected = ['source_file' => $relative];
                        foreach (['name', 'version', 'source', 'dist'] as $key) {
                            if ($key === 'source' || $key === 'dist') {
                                $selected[$key] = array_intersect_key($package[$key] ?? [], array_flip(['type', 'reference', 'shasum']));
                            } elseif (isset($package[$key])) {
                                $selected[$key] = $package[$key];
                            }
                        }
                        $this->context['pots']['package_records'][] = $selected;
                    }
                }
            } catch (Throwable $error) {
                $this->failure('package_metadata_invalid', 'Cannot parse selected POTS package metadata: ' . $relative);
            }
        }
    }

    private function run(string $id, array $argv): array
    {
        foreach ($argv as $argument) {
            self::text($argument, 'command argument', 4096);
        }
        $number = ++$this->commandNumber;
        $prefix = sprintf('commands/%03d-%s', $number, $id);
        $stdoutRelative = $prefix . '/stdout.txt';
        $stderrRelative = $prefix . '/stderr.txt';
        $stdoutPath = $this->outputPath($stdoutRelative);
        $stderrPath = $this->outputPath($stderrRelative);
        $stdoutPart = $stdoutPath . '.part';
        $stderrPart = $stderrPath . '.part';
        $this->rejectLink($stdoutPart);
        $this->rejectLink($stderrPart);
        $stdout = fopen($stdoutPart, 'x+b');
        $stderr = fopen($stderrPart, 'x+b');
        if ($stdout === false || $stderr === false) {
            if (is_resource($stdout)) {
                fclose($stdout);
            }
            if (is_resource($stderr)) {
                fclose($stderr);
            }
            throw new RuntimeException('Cannot create original command output files.');
        }
        if (!chmod($stdoutPart, 0600) || !chmod($stderrPart, 0600)) {
            fclose($stdout);
            fclose($stderr);
            throw new RuntimeException('Cannot keep original native output private.');
        }
        $record = [
            'id' => $id, 'argv' => $argv, 'cwd' => $this->project, 'started_at' => self::now(),
            'completed_at' => null, 'status' => 'STARTING', 'exit_code' => null,
            'timeout_seconds' => $this->options['timeout-seconds'],
            'max_output_bytes' => $this->options['max-output-bytes'],
            'stdout_pending' => $stdoutRelative . '.part', 'stderr_pending' => $stderrRelative . '.part',
        ];
        $this->atomic($prefix . '/started.json', self::json($record));
        $this->artifact($prefix . '/started.json');
        $index = count($this->context['commands']);
        $this->context['commands'][] = $record;
        $this->checkpoint();
        $process = null;
        $exit = null;
        $status = 'FAILED_TO_START';
        $start = hrtime(true);
        try {
            $pipes = [];
            $process = proc_open($argv, [0 => ['pipe', 'r'], 1 => $stdout, 2 => $stderr],
                $pipes, $this->project, null, ['bypass_shell' => true]);
            if (!is_resource($process)) {
                throw new RuntimeException('Native read-only command could not start.');
            }
            fclose($pipes[0]);
            $native = proc_get_status($process);
            $record['pid'] = $native['pid'] ?? null;
            $record['status'] = 'RUNNING';
            $this->context['commands'][$index] = $record;
            $this->checkpoint();
            $termination = null;
            while (true) {
                // Preserve the first observed exit code on PHP8.1/8.2, where a
                // second proc_get_status call may already return exitcode=-1.
                if (!$native['running']) {
                    $exit = $native['exitcode'] >= 0 ? $native['exitcode'] : null;
                    $status = $termination ?? ($exit === 0 ? 'SUCCEEDED' : 'FAILED');
                    break;
                }
                $elapsed = (hrtime(true) - $start) / 1000000000;
                clearstatcache(true, $stdoutPart);
                clearstatcache(true, $stderrPart);
                $outputBytes = (filesize($stdoutPart) ?: 0) + (filesize($stderrPart) ?: 0);
                if ($termination === null && ($elapsed > $this->options['timeout-seconds']
                    || $outputBytes > $this->options['max-output-bytes'])) {
                    $termination = $outputBytes > $this->options['max-output-bytes'] ? 'OUTPUT_LIMIT' : 'TIMED_OUT';
                    proc_terminate($process, 15);
                    $record['termination_requested_at'] = self::now();
                    $record['termination_elapsed_seconds'] = $elapsed;
                } elseif ($termination !== null && $elapsed > ($record['termination_elapsed_seconds'] + 2)) {
                    proc_terminate($process, 9);
                }
                usleep(100000);
                $native = proc_get_status($process);
            }
            $closed = proc_close($process);
            $process = null;
            if ($exit === null && $closed >= 0) {
                $exit = $closed;
            }
            if ($termination === null) {
                $status = $exit === 0 ? 'SUCCEEDED' : 'FAILED';
            }
        } catch (Throwable $error) {
            $record['error'] = $error->getMessage();
            if (is_resource($process)) {
                proc_terminate($process, 9);
                $closed = proc_close($process);
                $process = null;
                if ($closed >= 0) {
                    $exit = $closed;
                }
            }
        } finally {
            $flushed = true;
            foreach ([$stdout, $stderr] as $stream) {
                $flushed = fflush($stream) && $flushed;
                if (function_exists('fsync')) {
                    $flushed = fsync($stream) && $flushed;
                }
                fclose($stream);
            }
            if (!$flushed) {
                throw new RuntimeException('Cannot durably retain native command output.');
            }
        }
        if (!rename($stdoutPart, $stdoutPath) || !rename($stderrPart, $stderrPath)) {
            throw new RuntimeException('Cannot finalize native command output.');
        }
        unset($record['stdout_pending'], $record['stderr_pending']);
        $record['status'] = $status;
        $record['exit_code'] = $exit;
        $record['completed_at'] = self::now();
        $record['duration_seconds'] = round((hrtime(true) - $start) / 1000000000, 6);
        $record['stdout'] = $this->artifact($stdoutRelative);
        $record['stderr'] = $this->artifact($stderrRelative);
        $record['receipt'] = $this->saveJson($prefix . '/command.json', $record);
        $this->context['commands'][$index] = $record;
        if ($status !== 'SUCCEEDED') {
            $this->failure('native_read_failed', 'Original command ended with ' . $status, $id);
        }
        $this->checkpoint();
        return $record;
    }

    private function observation(array $command, bool $json = true): array
    {
        $observation = ['command' => $command['id'], 'status' => 'ERROR', 'data' => null, 'source' => $command['stdout']];
        if ($command['status'] !== 'SUCCEEDED') {
            return $observation;
        }
        $text = file_get_contents($this->root . '/' . $command['stdout']['path']);
        if ($text === false) {
            $this->failure('output_unreadable', 'Retained command output could not be read.', $command['id']);
            return $observation;
        }
        try {
            $observation['data'] = $json
                ? json_decode($text, true, 512, JSON_THROW_ON_ERROR)
                : trim($text);
            $observation['status'] = 'OK';
        } catch (Throwable $error) {
            $this->failure('native_json_invalid', 'Native command did not return complete JSON.', $command['id']);
        }
        return $observation;
    }

    private function native(string $id, array $arguments): array
    {
        return $this->run($id, [...$this->terminus, '--no-interaction', '--no-ansi', ...$arguments]);
    }

    private function reopened(array $request): ?int
    {
        $path = $this->root . '/context.json';
        if (!file_exists($path)) {
            return null;
        }
        $this->rejectLink($path);
        $existing = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (($existing['schema'] ?? null) !== self::SCHEMA
            || ($existing['request_sha256'] ?? null) !== hash('sha256', self::json($request))) {
            throw new RuntimeException('The output directory belongs to another capture identity.');
        }
        foreach ($existing['artifact_files'] ?? [] as $file) {
            $actual = $this->identity($file['path']);
            if ($actual !== $file) {
                throw new RuntimeException('Retained capture file has changed: ' . $file['path']);
            }
        }
        if (($existing['state'] ?? null) === 'CAPTURING') {
            $existing['state'] = 'INTERRUPTED';
            $existing['completed_at'] = self::now();
            $existing['failures'][] = [
                'code' => 'original_process_interrupted',
                'message' => 'Original capture ended before its final context commit. Its pending output paths remain in the same directory.',
            ];
            $this->atomic('context.json', self::json($existing), true);
        }
        $this->context = $existing;
        $this->printSummary(true);
        return ($existing['state'] ?? '') === 'COMPLETE' ? 0 : 2;
    }

    private function printSummary(bool $reopened = false): void
    {
        fwrite(STDOUT, self::json([
            'schema' => self::SCHEMA, 'capture_id' => $this->context['capture_id'],
            'state' => $this->context['state'], 'reopened' => $reopened,
            'context' => $this->identity('context.json'),
            'output_dir' => $this->root, 'target' => $this->context['target'],
            'ci_identity' => $this->context['ci_identity'],
            'source_files' => count($this->context['sources']),
            'commands' => count($this->context['commands']),
            'failures' => count($this->context['failures']),
        ]));
    }

    public function capture(): int
    {
        $ci = $this->ci();
        [$ciIdentity, $identitySources] = $this->ciIdentity($ci);
        $captureId = $this->options['capture-id'];
        if ($captureId === null) {
            if ($ciIdentity['job_id'] !== null) {
                $captureId = 'pots-' . $ciIdentity['job_id'] . '-' . $this->options['environment'];
            } elseif (isset($ci['CIRCLE_WORKFLOW_ID'], $ci['CIRCLE_BUILD_NUM'], $ci['CIRCLE_JOB'])) {
                $captureId = 'pots-' . substr(hash('sha256', self::json([
                    'workflow_id' => $ci['CIRCLE_WORKFLOW_ID'], 'build_num' => $ci['CIRCLE_BUILD_NUM'],
                    'job' => $ci['CIRCLE_JOB'], 'site' => $this->options['site'],
                    'environment' => $this->options['environment'],
                ])), 0, 32);
            } else {
                throw new InvalidArgumentException('A local capture needs an explicit original --capture-id.');
            }
        }
        $request = [
            'schema' => 'govhub.pots.capture-request/v1', 'capture_id' => $captureId,
            'target' => ['site' => $this->options['site'], 'environment' => $this->options['environment']],
            'ci' => $ci, 'ci_identity' => $ciIdentity, 'ci_identity_sources' => $identitySources,
            'project_root' => $this->project, 'pots_root' => $this->potsRoot,
            'selected_workflow_ids' => $this->options['workflow-id'],
            'all_workflows' => $this->options['all-workflows'],
            'additional_source_files' => $this->options['source-file'],
            'terminus_selection' => $this->options['terminus'], 'php_selection' => $this->options['php'],
            'git_selection' => $this->options['git'],
            'timeout_seconds' => $this->options['timeout-seconds'],
            'max_output_bytes' => $this->options['max-output-bytes'],
            'capture_source_sha256' => hash_file('sha256', __FILE__),
        ];
        $reopened = $this->reopened($request);
        if ($reopened !== null) {
            return $reopened;
        }
        $this->context = [
            'schema' => self::SCHEMA, 'capture_id' => $captureId, 'state' => 'CAPTURING',
            'started_at' => self::now(), 'completed_at' => null,
            'ci' => $ci, 'ci_identity' => $ciIdentity, 'ci_identity_sources' => $identitySources,
            'target' => $request['target'],
            'checkout' => ['revision' => null, 'command' => null, 'root' => $this->project],
            'pots' => ['package' => 'fourkitchens/pots', 'package_records' => []],
            'sources' => [], 'source_selection' => [], 'commands' => [], 'observations' => [],
            'failures' => [], 'artifact_files' => [],
            'request_sha256' => hash('sha256', self::json($request)),
            'runtime' => [
                'capture_php_version' => PHP_VERSION,
                'capture_php_binary' => PHP_BINARY,
                'capture_source_sha256' => $request['capture_source_sha256'],
            ],
        ];
        try {
            $this->context['request'] = $this->saveJson('request.json', $request);
            $captureSource = file_get_contents(__FILE__);
            if ($captureSource === false || hash('sha256', $captureSource) !== $request['capture_source_sha256']) {
                throw new RuntimeException('Capture program source changed during startup.');
            }
            $this->atomic('capture.php', $captureSource);
            $this->context['runtime']['capture_source'] = $this->artifact('capture.php');
            $this->checkpoint();
            try {
                $this->captureSources();
            } catch (Throwable $error) {
                $this->failure('source_capture_failed', $error->getMessage());
            }
            $this->checkpoint();
            try {
                $git = $this->executable($this->options['git']);
                $this->context['runtime']['git'] = $git;
                $revision = $this->run('checkout-revision', [$git['path'], 'rev-parse', '--verify', 'HEAD']);
                $revisionObservation = $this->observation($revision, false);
                $this->context['checkout']['command'] = $revision['id'];
                $this->context['checkout']['observation'] = $revisionObservation;
                if ($revisionObservation['status'] === 'OK'
                    && preg_match('/^[0-9a-f]{40,64}$/iD', $revisionObservation['data'])) {
                    $this->context['checkout']['revision'] = strtolower($revisionObservation['data']);
                } elseif ($revisionObservation['status'] === 'OK') {
                    $this->failure('checkout_revision_invalid', 'Original checkout did not return a complete commit identifier.', $revision['id']);
                }
                $selectedPaths = array_values(array_unique(array_column($this->context['sources'], 'checkout_path')));
                if ($selectedPaths !== []) {
                    $changed = $this->run('checkout-source-status', [
                        $git['path'], '--no-optional-locks', 'status', '--porcelain=v1', '--untracked-files=no', '--', ...$selectedPaths,
                    ]);
                    $this->context['checkout']['source_status'] = $this->observation($changed, false);
                }
            } catch (Throwable $error) {
                $this->failure('checkout_read_failed', $error->getMessage());
            }
            $term = $this->executable($this->options['terminus'], $this->options['php'] === null);
            $this->context['runtime']['terminus'] = $term;
            if ($this->options['php'] !== null) {
                $php = $this->executable($this->options['php']);
                $this->context['runtime']['terminus_php'] = $php;
                $this->terminus = [$php['path'], $term['path']];
            } else {
                $this->terminus = [$term['path']];
            }
            $version = $this->run('terminus-version', [...$this->terminus, '--version', '--no-ansi']);
            $this->context['runtime']['terminus_version'] = $this->observation($version, false);
            $auth = $this->native('terminus-actor', ['auth:whoami', '--format=json', '--fields=id']);
            $this->context['observations']['actor'] = $this->observation($auth);
            $site = $this->native('site', ['site:info', $this->options['site'], '--format=json', '--fields=id,name,label,framework,region']);
            $this->context['observations']['site'] = $this->observation($site);
            $siteId = $this->context['observations']['site']['data']['id'] ?? null;
            if (is_string($siteId) && preg_match('/^[0-9a-f-]{36}$/iD', $siteId)) {
                $this->context['target']['observed_site_id'] = strtolower($siteId);
            } else {
                $this->failure('site_uuid_missing', 'Original site observation did not identify the native site UUID.', $site['id']);
            }
            if (preg_match('/^[0-9a-f-]{36}$/iD', $this->options['site'])
                && is_string($siteId) && strtolower($siteId) !== strtolower($this->options['site'])) {
                $this->failure('site_target_mismatch', 'Native site identity differs from the explicitly selected UUID.', $site['id']);
            }
            $siteEnv = $this->options['site'] . '.' . $this->options['environment'];
            $environment = $this->native('environment', [
                'env:info', $siteEnv, '--format=json',
                '--fields=id,created,domain,initialized,connection_mode,php_version,drush_version,php_runtime_generation',
            ]);
            $this->context['observations']['environment'] = $this->observation($environment);
            $observedEnv = $this->context['observations']['environment']['data']['id'] ?? null;
            if ($observedEnv !== $this->options['environment']) {
                $this->failure('environment_target_mismatch', 'Native environment observation differs from the selected environment.', $environment['id']);
            }
            $code = $this->native('code-log', [
                'env:code-log', $siteEnv, '--format=json', '--fields=datetime,author,labels,hash,message',
            ]);
            $this->context['observations']['code_log'] = $this->observation($code);
            $backups = $this->native('backups', [
                'backup:list', $siteEnv, '--element=all', '--format=json', '--fields=file,size,date,expiry,initiator',
            ]);
            $this->context['observations']['backups'] = $this->observation($backups);
            $workflowArgs = [
                'workflow:list', $this->options['site'], '--format=json',
                '--fields=id,env,workflow,user,status,started_at,finished_at,time',
            ];
            if ($this->options['all-workflows']) {
                $workflowArgs[] = '--all';
            }
            $workflows = $this->native('workflows', $workflowArgs);
            $catalog = $this->observation($workflows);
            $catalog['scope'] = $this->options['all-workflows'] ? 'all_available_site_workflows' : 'latest_100_site_workflows';
            $catalog['selected_environment'] = $this->options['environment'];
            $catalog['selected'] = [];
            foreach ($this->options['workflow-id'] as $uuid) {
                $nativeStatus = $this->native('workflow-status-' . $uuid, [
                    'workflow:info:status', $this->options['site'], '--id=' . $uuid, '--format=json',
                    '--fields=id,env,workflow,user,status,started_at,finished_at,time',
                ]);
                $statusObservation = $this->observation($nativeStatus);
                $nativeOps = $this->native('workflow-operations-' . $uuid, [
                    'workflow:info:operations', $this->options['site'], '--id=' . $uuid, '--format=json',
                    '--fields=type,result,duration,description',
                ]);
                $operationObservation = $this->observation($nativeOps);
                $catalog['selected'][] = [
                    'workflow_id' => $uuid, 'status' => $statusObservation, 'operations' => $operationObservation,
                ];
                $seen = $statusObservation['data'];
                if ($statusObservation['status'] === 'OK'
                    && (($seen['id'] ?? null) !== $uuid || ($seen['env'] ?? null) !== $this->options['environment'])) {
                    $this->failure('workflow_target_mismatch', 'Selected native workflow differs from its explicit UUID/environment.', $nativeStatus['id']);
                }
            }
            $this->context['observations']['workflows'] = $catalog;
        } catch (Throwable $error) {
            $this->failure('capture_failed', $error->getMessage());
        }
        $this->context['state'] = $this->context['failures'] === [] ? 'COMPLETE' : 'PARTIAL';
        $this->context['completed_at'] = self::now();
        $this->checkpoint();
        $this->printSummary();
        return $this->context['state'] === 'COMPLETE' ? 0 : 2;
    }

    public function __destruct()
    {
        if (is_resource($this->lock)) {
            flock($this->lock, LOCK_UN);
            fclose($this->lock);
        }
    }
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try {
        if (PHP_VERSION_ID < 80100 || !function_exists('proc_open') || !function_exists('hash_file')) {
            throw new RuntimeException('POTS capture needs the original PHP8.1+ CLI with process/json/hash support.');
        }
        $capture = new GovHubPotsCapture(GovHubPotsCapture::options($argv));
        exit($capture->capture());
    } catch (Throwable $error) {
        fwrite(STDERR, json_encode([
            'schema' => 'govhub.pots.capture-error/v1', 'error' => $error->getMessage(),
        ], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE) . "\n");
        exit(2);
    }
}
