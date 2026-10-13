<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
namespace Tjl\CatalogueWorkspace\Source;

/** Durable original operation bytes, independent of Doctrine rollback. */
final class PrivateJournal
{
    private string $root;
    private array $locks = [];

    public function __construct(string $directory)
    {
        if (!str_starts_with($directory, '/') || str_contains($directory, "\0")) {
            throw new \InvalidArgumentException('Use the existing absolute private workspace directory.');
        }
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new \RuntimeException('Cannot create private source journal.');
        }
        $real = realpath($directory);
        if ($real === false || is_link($directory)) {
            throw new \RuntimeException('Private source directory must be an ordinary directory.');
        }
        $this->root = $real . '/source';
        if (!is_dir($this->root) && !mkdir($this->root, 0700) && !is_dir($this->root)) {
            throw new \RuntimeException('Cannot create source journal.');
        }
        if (is_link($this->root)) {
            throw new \RuntimeException('Source journal must not be linked.');
        }
    }

    public static function encode(mixed $value): string
    {
        return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
    }

    public static function hash(mixed $value): string { return hash('sha256', self::encode($value)); }
    public static function now(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

    public function path(string $kind, string $id): string
    {
        if (!preg_match('/^[a-z][a-z0-9_-]*$/D', $kind) || $id === '') {
            throw new \InvalidArgumentException('Retain an original journal kind and identity.');
        }
        return $this->root . '/' . $kind . '-' . hash('sha256', $id) . '.json';
    }

    public function read(string $kind, string $id): ?array
    {
        $path = $this->path($kind, $id);
        if (!file_exists($path)) { return null; }
        if (is_link($path) || !is_file($path)) { throw new \RuntimeException('Invalid private journal member.'); }
        $value = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($value)) { throw new \RuntimeException('Invalid private journal body.'); }
        return $value;
    }

    public function write(string $kind, string $id, array $value): void
    {
        $path = $this->path($kind, $id);
        if (is_link($path)) { throw new \RuntimeException('Refuse a linked journal.'); }
        $temporary = tempnam($this->root, '.write-');
        if ($temporary === false) { throw new \RuntimeException('Cannot allocate private journal.'); }
        try {
            chmod($temporary, 0600);
            $f = fopen($temporary, 'wb');
            if ($f === false) { throw new \RuntimeException('Cannot open private journal.'); }
            try {
                $bytes = self::encode($value) . "\n";
                for ($offset = 0; $offset < strlen($bytes);) {
                    $written = fwrite($f, substr($bytes, $offset));
                    if ($written === false || $written === 0) { throw new \RuntimeException('Incomplete journal write.'); }
                    $offset += $written;
                }
                if (!fflush($f) || !fsync($f)) { throw new \RuntimeException('Cannot flush private journal.'); }
            } finally { fclose($f); }
            if (!rename($temporary, $path)) { throw new \RuntimeException('Cannot publish private journal.'); }
            $d = fopen($this->root, 'r');
            if ($d !== false) { try { fsync($d); } finally { fclose($d); } }
        } finally { if (is_file($temporary)) { unlink($temporary); } }
    }

    public function exportProject(string $projectId): array
    {
        $result = [];
        foreach (glob($this->root . '/*.json') ?: [] as $path) {
            if (is_link($path) || !is_file($path)) { throw new \RuntimeException('Invalid source journal member.'); }
            $raw = file_get_contents($path);
            if ($raw === false) { throw new \RuntimeException('Cannot retain complete source journal.'); }
            $value = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            $owner = $value['project_id'] ?? $value['binding']['project_id'] ?? null;
            if ($owner === $projectId) { $result['source/' . basename($path)] = ['bytes' => $raw, 'value' => $value]; }
        }
        ksort($result);
        return $result;
    }

    public function importMember(string $projectId, string $relative, string $raw): void
    {
        if (!preg_match('~^source/([a-z][a-z0-9_-]*)-([a-f0-9]{64})[.]json$~D', $relative, $match)) {
            throw new \RuntimeException('Invalid original source journal path.');
        }
        $incoming = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (($incoming['project_id'] ?? $incoming['binding']['project_id'] ?? null) !== $projectId) {
            throw new \RuntimeException('Source journal belongs to another project.');
        }
        $path = $this->root . '/' . basename($relative);
        if (is_link($path)) { throw new \RuntimeException('Source journal destination is linked.'); }
        if (is_file($path)) {
            $current = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            if (self::encode($current) === self::encode($incoming)) { return; }
            $currentBinding = $current['binding'] ?? array_intersect_key($current, array_flip(['id', 'project_id', 'authority', 'request', 'operation_id']));
            $incomingBinding = $incoming['binding'] ?? array_intersect_key($incoming, array_flip(['id', 'project_id', 'authority', 'request', 'operation_id']));
            if ($currentBinding !== $incomingBinding
                || (isset($current['snapshot']['sha256'], $incoming['snapshot']['sha256'])
                    && $current['snapshot']['sha256'] !== $incoming['snapshot']['sha256'])) {
                throw new \RuntimeException('Receiving source identity conflicts with the original retained project.');
            }
            // Never overwrite the receiving project's later original attempts/publication state.
            return;
        }
        $temporary = tempnam($this->root, '.receive-');
        if ($temporary === false) { throw new \RuntimeException('Cannot receive original source journal.'); }
        try {
            chmod($temporary, 0600);
            if (file_put_contents($temporary, $raw, LOCK_EX) !== strlen($raw)) { throw new \RuntimeException('Incomplete source journal receiving.'); }
            $f = fopen($temporary, 'r+b');
            if ($f === false) { throw new \RuntimeException('Cannot sync source journal.'); }
            try { if (!fsync($f)) { throw new \RuntimeException('Cannot sync original source journal.'); } } finally { fclose($f); }
            if (!link($temporary, $path)) { throw new \RuntimeException('Original source journal was received concurrently.'); }
        } finally { if (is_file($temporary)) { unlink($temporary); } }
    }

    public function lock(string $key, callable $call): mixed
    {
        if (isset($this->locks[$key])) { return $call(); }
        $path = $this->root . '/lock-' . hash('sha256', $key);
        if (is_link($path)) { throw new \RuntimeException('Refuse a linked source lock.'); }
        $f = fopen($path, 'c+b');
        if ($f === false || !flock($f, LOCK_EX)) { throw new \RuntimeException('Cannot acquire original source lock.'); }
        chmod($path, 0600);
        $this->locks[$key] = $f;
        try { return $call(); }
        finally { unset($this->locks[$key]); flock($f, LOCK_UN); fclose($f); }
    }
}
