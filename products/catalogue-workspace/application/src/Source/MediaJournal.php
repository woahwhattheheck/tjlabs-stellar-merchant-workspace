<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
namespace Tjl\CatalogueWorkspace\Source;

use League\Flysystem\FilesystemOperator;
use Sylius\Component\Core\Filesystem\Adapter\FilesystemAdapterInterface;
use Tjl\CatalogueWorkspace\Store;

/** Stages native uploader effects until the original Doctrine commit survives. */
final class MediaJournal
{
    private ?array $state = null;

    public function __construct(
        private Store $store,
        private PrivateJournal $journal,
        private FilesystemAdapterInterface $imageAdapter,
        private FilesystemOperator $imageStorage,
        private array $localRoots,
        private string $imageStorageId = 'sylius.storage',
    ) {
        foreach ($localRoots as $key => $root) {
            if (!is_string($key) || $key === '' || !is_string($root) || !str_starts_with($root, '/')
                || str_contains($root, "\0") || preg_match('~/(?:[.]|[.][.])(?:/|$)~', $root) || is_link($root)) {
                throw new \InvalidArgumentException('Configure each existing ordinary file-handler destination root by stable name.');
            }
            $parent = rtrim($root, '/');
            while ($parent !== '/' && $parent !== '.') {
                if (is_link($parent) || (file_exists($parent) && !is_dir($parent))) {
                    throw new \InvalidArgumentException('Native file root contains a linked or non-directory parent.');
                }
                $parent = dirname($parent);
            }
        }
    }

    public function active(): bool { return $this->state !== null; }
    public function inspect(string $id): ?array { return $this->journal->read('media', $id); }
    public function end(): void { $this->state = null; }

    public function begin(string $projectId, string $operationId, string $sourceHash, bool $committed): void
    {
        if ($this->state !== null) { throw new \LogicException('Media operation is already active.'); }
        $state = $this->inspect($operationId);
        $binding = ['project_id' => $projectId, 'operation_id' => $operationId, 'source_sha256' => $sourceHash,
                    'local_root_ids' => array_keys($this->localRoots), 'image_storage_id' => $this->imageStorageId];
        if ($state && $state['binding'] !== $binding) { throw new \RuntimeException('Original media operation binding changed.'); }
        if ($committed && !$state) { throw new \RuntimeException('Committed import has no retained original media journal.'); }
        $state ??= ['schema' => 'tjl.catalogue.media-operation.v1', 'binding' => $binding,
                    'state' => 'PREPARED', 'entries' => [], 'attempts' => [], 'created_at' => PrivateJournal::now()];
        if (!$committed && $state['entries']) {
            // No APPLIED row survived the native transaction. Staging never touched the destination.
            foreach ($state['entries'] as $entry) {
                if (($entry['published'] ?? false) === true) {
                    throw new \RuntimeException('Published media without the original committed DB marker needs explicit recovery.');
                }
            }
            $state['attempts'][] = ['ended_at' => PrivateJournal::now(), 'entries' => $state['entries'], 'state' => 'NOT_COMMITTED'];
            $state['entries'] = [];
        }
        if (!$committed) { $state['state'] = 'STAGING'; }
        $this->state = $state;
        $this->save();
    }

    private function save(): void
    {
        if ($this->state === null) { throw new \LogicException('No active media operation.'); }
        $this->state['updated_at'] = PrivateJournal::now();
        $this->journal->write('media', $this->state['binding']['operation_id'], $this->state);
    }

    private function relative(string $path): string
    {
        if ($path === '' || str_starts_with($path, '/') || str_contains($path, '\\') || str_contains($path, "\0")) {
            throw new \RuntimeException('A native image must have an ordinary relative path.');
        }
        foreach (explode('/', $path) as $part) {
            if ($part === '' || $part === '.' || $part === '..') { throw new \RuntimeException('Unsafe native media member.'); }
        }
        return $path;
    }

    private function local(string $path): array
    {
        foreach ($this->localRoots as $key => $root) {
            $prefix = rtrim($root, '/') . '/';
            if (str_starts_with($path, $prefix)) {
                $relative = $this->relative(substr($path, strlen($prefix)));
                $current = rtrim($root, '/');
                foreach (explode('/', $relative) as $part) {
                    $current .= '/' . $part;
                    if (is_link($current)) { throw new \RuntimeException('Native media destination contains a filesystem link.'); }
                }
                return ['backend' => 'local', 'root' => $key, 'path' => $relative];
            }
        }
        throw new \RuntimeException('Native file-handler destination is outside its installed selected roots.');
    }

    private function absolute(array $target): string
    {
        $root = $this->localRoots[$target['root']] ?? null;
        if ($root === null) { throw new \RuntimeException('Original native file root is not configured.'); }
        $path = rtrim($root, '/') . '/' . $this->relative($target['path']);
        $this->local($path);
        return $path;
    }

    private function observed(array $target): array
    {
        if ($target['backend'] === 'local') {
            $path = $this->absolute($target);
            if (!file_exists($path)) { return ['state' => 'MISSING']; }
            if (!is_file($path)) { throw new \RuntimeException('Selected native destination is not a regular file.'); }
            $before = stat($path);
            $body = $this->store->blobFile($path);
            clearstatcache(true, $path);
            $after = stat($path);
            foreach (['dev', 'ino', 'size', 'mtime', 'ctime'] as $field) {
                if ($before[$field] !== $after[$field]) { throw new \RuntimeException('Native file changed during preimage capture.'); }
            }
            return ['state' => 'FILE', 'body' => $body, 'mode' => $after['mode'] & 0777];
        }
        if ($target['storage'] !== $this->imageStorageId) { throw new \RuntimeException('Original image storage changed.'); }
        $path = $this->relative($target['path']);
        if (!$this->imageStorage->fileExists($path)) { return ['state' => 'MISSING']; }
        $stream = $this->imageStorage->readStream($path);
        if (!is_resource($stream)) { throw new \RuntimeException('Cannot read original native image preimage.'); }
        $temp = $this->store->temporaryPath('.image');
        $out = fopen($temp, 'wb');
        if ($out === false) { fclose($stream); throw new \RuntimeException('Cannot retain native image.'); }
        try {
            chmod($temp, 0600);
            if (stream_copy_to_stream($stream, $out) === false || !fflush($out) || !fsync($out)) {
                throw new \RuntimeException('Incomplete native image preimage.');
            }
        } finally { fclose($stream); fclose($out); }
        try { $body = $this->store->blobFile($temp); } finally { if (is_file($temp)) { unlink($temp); } }
        return ['state' => 'FILE', 'body' => $body, 'visibility' => $this->imageStorage->visibility($path)];
    }

    private function same(array $a, array $b, bool $mode = true): bool
    {
        if ($a['state'] !== $b['state']) { return false; }
        if ($a['state'] === 'MISSING') { return true; }
        if ($a['body']['sha256'] !== $b['body']['sha256'] || $a['body']['bytes'] !== $b['body']['bytes']) { return false; }
        if (isset($b['visibility']) && ($a['visibility'] ?? null) !== $b['visibility']) { return false; }
        return !$mode || !isset($b['mode']) || ($a['mode'] ?? null) === $b['mode'];
    }

    private function stage(array $target, array $after): void
    {
        if ($this->state === null || $this->state['state'] !== 'STAGING') {
            throw new \RuntimeException('Only the active uncommitted import may stage media.');
        }
        $key = PrivateJournal::hash($target);
        if (!isset($this->state['entries'][$key])) {
            $this->state['entries'][$key] = ['target' => $target, 'before' => $this->observed($target), 'published' => false];
        }
        $this->state['entries'][$key]['after'] = $after;
        $this->save();
    }

    public function stageLocal(string $source, string $destination, bool $overwrite): void
    {
        $target = $this->local($destination);
        if (!$overwrite && $this->localExists($destination)) { throw new \RuntimeException('Native file destination already exists.'); }
        if (!is_file($source) || is_link($source)) { throw new \RuntimeException('Original temporary media file is unavailable.'); }
        $this->stage($target, ['state' => 'FILE', 'body' => $this->store->blobFile($source), 'mode' => fileperms($source) & 0777]);
    }

    public function localMode(string $path, int $mode): void
    {
        $target = $this->local($path);
        $key = PrivateJournal::hash($target);
        if (!isset($this->state['entries'][$key]) || $this->state['entries'][$key]['after']['state'] !== 'FILE') {
            throw new \RuntimeException('Native chmod has no retained staged file.');
        }
        $this->state['entries'][$key]['after']['mode'] = $mode & 0777;
        $this->save();
    }

    public function localExists(string $path): bool
    {
        try { $target = $this->local($path); } catch (\RuntimeException) { return file_exists($path); }
        $entry = $this->state['entries'][PrivateJournal::hash($target)] ?? null;
        if ($entry) { return $entry['after']['state'] === 'FILE'; }
        foreach ($this->state['entries'] ?? [] as $row) {
            if ($row['target']['backend'] === 'local' && $row['target']['root'] === $target['root']
                && str_starts_with($row['target']['path'], $target['path'] . '/') && $row['after']['state'] === 'FILE') { return true; }
        }
        return file_exists($path);
    }

    public function localDirectory(string $path): void
    {
        if (in_array(rtrim($path, '/'), $this->localRoots, true)) { return; }
        $this->local(rtrim($path, '/') . '/.directory-validation');
        // Publication creates exactly the required parent directories after commit.
    }

    public function imageHas(string $path): bool
    {
        $target = ['backend' => 'image', 'storage' => $this->imageStorageId, 'path' => $this->relative($path)];
        $entry = $this->state['entries'][PrivateJournal::hash($target)] ?? null;
        return $entry ? $entry['after']['state'] === 'FILE' : $this->imageAdapter->has($path);
    }

    public function imageWrite(string $path, string $bytes): void
    {
        $this->stage(['backend' => 'image', 'storage' => $this->imageStorageId, 'path' => $this->relative($path)],
            ['state' => 'FILE', 'body' => $this->store->blob($bytes)]);
    }

    public function imageDelete(string $path): void
    {
        $this->stage(['backend' => 'image', 'storage' => $this->imageStorageId, 'path' => $this->relative($path)],
            ['state' => 'MISSING']);
    }

    public function hasWrites(): bool { return (bool) ($this->state['entries'] ?? []); }

    public function abort(): array
    {
        if ($this->state === null) { throw new \LogicException('No media scope.'); }
        foreach ($this->state['entries'] as $entry) {
            if ($entry['published']) { throw new \RuntimeException('Cannot discard already committed native media.'); }
        }
        $this->state['state'] = 'NOT_COMMITTED';
        $this->save();
        return $this->state;
    }

    public function commit(): array
    {
        if ($this->state === null) { throw new \LogicException('No media scope.'); }
        $this->state['state'] = 'MEDIA_PENDING';
        $this->save();
        foreach (array_keys($this->state['entries']) as $key) {
            $entry = $this->state['entries'][$key];
            if ($entry['published']) { continue; } // Preserve later legitimate native edits.
            $target = $entry['target'];
            $current = $this->observed($target);
            if (!$this->same($current, $entry['after'])) {
                $matchesBefore = $this->same($current, $entry['before']);
                $ownDataBeforeMode = $target['backend'] === 'local' && $this->same($current, $entry['after'], false);
                if (!$matchesBefore && !$ownDataBeforeMode) {
                    $this->state['entries'][$key]['conflict'] = $current;
                    $this->save();
                    throw new \RuntimeException('Native media changed after review; retain the original operation and resolve its file conflict.');
                }
                if ($target['backend'] === 'local') {
                    $path = $this->absolute($target);
                    if ($entry['after']['state'] === 'MISSING') {
                        if (is_file($path) && !unlink($path)) { throw new \RuntimeException('Native file deletion failed.'); }
                    } else {
                        $dir = dirname($path);
                        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) { throw new \RuntimeException('Cannot create native file directory.'); }
                        $this->absolute($target);
                        $temp = tempnam($dir, '.catalogue-');
                        if ($temp === false) { throw new \RuntimeException('Cannot stage committed native file.'); }
                        try {
                            if (!copy($this->store->blobPath($entry['after']['body']), $temp)
                                || !chmod($temp, $entry['after']['mode'])
                                || !rename($temp, $path)) { throw new \RuntimeException('Native file publication failed.'); }
                        } finally { if (is_file($temp)) { unlink($temp); } }
                    }
                } elseif ($entry['after']['state'] === 'MISSING') {
                    if ($this->imageAdapter->has($target['path'])) { $this->imageAdapter->delete($target['path']); }
                } else {
                    $this->imageAdapter->write($target['path'], $this->store->readBlob($entry['after']['body']));
                }
            }
            $after = $this->observed($target);
            if (!$this->same($after, $entry['after'])) { throw new \RuntimeException('Native published media readback differs.'); }
            $this->state['entries'][$key]['published'] = true;
            $this->state['entries'][$key]['published_at'] = PrivateJournal::now();
            $this->state['entries'][$key]['observed_after'] = $after;
            $this->save();
        }
        $this->state['state'] = 'COMPLETE';
        $this->save();
        return $this->state;
    }
}
