<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace;

use Tjl\CatalogueWorkspace\Source\SourceGateway;

/** Portable catalogue state and exact source bytes. Full Sylius SQL/files use the native project tool. */
final class ProjectArchive
{
    public function __construct(private Store $store, private SourceGateway $source, private int $maximumBytes) {}

    public function export(string $projectId, string $operationId, string $actor): array
    {
        $existing = $this->store->object('export', $operationId);
        if ($existing !== null) {
            if ($existing['_record']['project_id'] !== $projectId) { throw new \RuntimeException('The original export belongs to another project.'); }
            $this->store->blobPath($existing['archive']);
            return $existing;
        }
        $this->store->require('project', $projectId, $projectId);
        $request = $this->store->require('command', $operationId, $projectId);
        $journalId = 'export-' . substr(Support::hash([$projectId, $operationId]), 0, 48);
        $journalPath = $this->store->root() . '/journals/' . $journalId . '.json';
        if (is_file($journalPath)) {
            $pointer = json_decode((string) file_get_contents($journalPath), true, 512, JSON_THROW_ON_ERROR);
            $retained = json_decode($this->store->readBlob($pointer), true, 512, JSON_THROW_ON_ERROR);
            if ($retained['project_id'] !== $projectId || $retained['operation_id'] !== $operationId) {
                throw new \RuntimeException('The original export journal binding differs.');
            }
            $this->store->blobPath($retained['archive']);
            return $this->store->original('export', $operationId, $projectId, $retained);
        }
        $frozenId = 'freeze-' . substr(Support::hash([$projectId, $operationId]), 0, 48);
        $frozenPath = $this->store->root() . '/journals/' . $frozenId . '.json';
        if (is_file($frozenPath)) {
            $pointer = json_decode((string) file_get_contents($frozenPath), true, 512, JSON_THROW_ON_ERROR);
            $frozen = json_decode($this->store->readBlob($pointer), true, 512, JSON_THROW_ON_ERROR);
            $manifest = $frozen['manifest'];
            $members = $frozen['members'];
            if ($manifest['project_id'] !== $projectId || $manifest['operation_id'] !== $operationId || $manifest['actor'] !== $actor) {
                throw new \RuntimeException('Continue the original frozen project export.');
            }
        } else {
            $manifest = ['schema' => 'tjl.catalogue.project-archive.v1', 'project_id' => $projectId,
                'operation_id' => $operationId, 'created_at' => $request['created_at'], 'actor' => $actor,
                'native_requirement' => 'Native catalogue references require the original separately received Sylius database, connector configuration and file graph before further mutation.',
                'records' => [], 'sources' => [], 'journals' => [], 'blobs' => []];
            $blobs = [];
            $members = [];
            $total = 0;
            foreach ($this->store->allProject($projectId) as $record) {
                if ($record['_record']['kind'] === 'export') { continue; }
                $body = Support::json($record) . "\n";
                $blob = $this->store->blob($body);
                $path = 'records/' . $record['_record']['kind'] . '/' . $record['_record']['id'] . '.json';
                $members[$path] = $blob;
                $manifest['records'][] = ['path' => $path, 'kind' => $record['_record']['kind'], 'id' => $record['_record']['id'],
                    'revision' => $record['_record']['revision'], 'sha256' => $blob['sha256'], 'bytes' => $blob['bytes']];
                $this->findBlobs($record, $blobs);
            }
            $sourceFiles = $this->source->exportProject($projectId);
            foreach ($sourceFiles as $file) {
                $path = $this->relative($file['path']);
                $this->store->blobPath($file['blob']);
                $manifest['sources'][] = ['path' => $path, 'blob' => $file['blob']];
                $blobs[$file['blob']['sha256']] = $file['blob'];
            }
            foreach ($this->store->importJournals($projectId) as $journal) {
                $manifest['journals'][] = $journal;
                $blobs[$journal['blob']['sha256']] = $journal['blob'];
                $this->findBlobs(json_decode($this->store->readBlob($journal['blob']), true, 512, JSON_THROW_ON_ERROR), $blobs);
            }
            foreach ($blobs as $blob) {
                $this->store->blobPath($blob);
                $members['blobs/' . $blob['sha256']] = $blob;
                $manifest['blobs'][] = $blob;
            }
            foreach ($members as $blob) { $total += $blob['bytes']; }
            if ($total > $this->maximumBytes) { throw new \RuntimeException('The complete original project exceeds the explicitly configured export bound.'); }
            $manifest['content_sha256'] = Support::hash($manifest);
            $this->store->journal($frozenId, ['manifest' => $manifest, 'members' => $members]);
        }
        foreach ($members as $blob) { $this->store->blobPath($blob); }
        $path = $this->store->temporaryPath('.zip');
        try {
            $zip = new \ZipArchive();
            if ($zip->open($path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) { throw new \RuntimeException('Cannot create the private native project archive.'); }
            try {
                foreach ($members as $name => $blob) {
                    if (!$zip->addFile($this->store->blobPath($blob), $name)) { throw new \RuntimeException('Cannot retain original archive member ' . $name); }
                    $zip->setMtimeName($name, 315532800);
                }
                if (!$zip->addFromString('manifest.json', Support::json($manifest) . "\n")) { throw new \RuntimeException('Cannot retain complete native manifest.'); }
                $zip->setMtimeName('manifest.json', 315532800);
            } catch (\Throwable $error) { $zip->close(); throw $error; }
            if (!$zip->close()) { throw new \RuntimeException('The native archive did not finish writing.'); }
            if (filesize($path) > $this->maximumBytes) { throw new \RuntimeException('The completed archive exceeds its declared byte bound.'); }
            $checked = $this->inspect($path);
            if ($checked['content_sha256'] !== $manifest['content_sha256']) { throw new \RuntimeException('The native archive reopened with a different original manifest.'); }
            $archive = $this->store->blobFile($path);
        } finally { @unlink($path); }
        $receipt = ['state' => 'COMPLETE', 'project_id' => $projectId, 'operation_id' => $operationId,
            'archive' => $archive, 'manifest_sha256' => $manifest['content_sha256'],
            'records' => count($manifest['records']), 'source_files' => count($manifest['sources']), 'blobs' => count($manifest['blobs']),
            'created_at' => $request['created_at'], 'actor' => $actor];
        $this->store->journal($journalId, $receipt);
        return $this->store->original('export', $operationId, $projectId, $receipt);
    }

    public function inspect(string $path): array
    {
        if (is_link($path) || !is_file($path) || filesize($path) > $this->maximumBytes) { throw new \RuntimeException('Select a bounded complete original archive file.'); }
        $zip = new \ZipArchive();
        if ($zip->open($path, \ZipArchive::RDONLY) !== true) { throw new \RuntimeException('Cannot reopen the original native archive.'); }
        try {
            $names = [];
            $total = 0;
            for ($i = 0; $i < $zip->numFiles; ++$i) {
                $stat = $zip->statIndex($i);
                if ($stat === false) { throw new \RuntimeException('Cannot read the original archive directory.'); }
                $name = $this->relative($stat['name']);
                if (isset($names[$name])) { throw new \RuntimeException('The original archive repeats a member name.'); }
                $names[$name] = true;
                $total += $stat['size'];
                if ($total > $this->maximumBytes) { throw new \RuntimeException('The complete expanded archive exceeds its selected bound.'); }
            }
            $raw = $zip->getFromName('manifest.json');
            if (!is_string($raw) || strlen($raw) > 67108864) { throw new \RuntimeException('A complete bounded manifest is required.'); }
            $manifest = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            if (($manifest['schema'] ?? null) !== 'tjl.catalogue.project-archive.v1') { throw new \RuntimeException('Select an original catalogue project archive.'); }
            $claimed = $manifest['content_sha256'] ?? '';
            unset($manifest['content_sha256']);
            if (!is_string($claimed) || !hash_equals($claimed, Support::hash($manifest))) { throw new \RuntimeException('Original manifest content identity differs.'); }
            $manifest['content_sha256'] = $claimed;
            Support::id($manifest['project_id']);
            $expected = ['manifest.json' => true];
            foreach ($manifest['records'] as $record) {
                $name = 'records/' . Support::id($record['kind']) . '/' . Support::id($record['id']) . '.json';
                if ($record['path'] !== $name || isset($expected[$name])) { throw new \RuntimeException('Original record member binding differs.'); }
                $expected[$name] = true;
                $this->checkMember($zip, $name, $record['bytes'], $record['sha256']);
            }
            foreach ($manifest['blobs'] as $blob) {
                $name = 'blobs/' . $blob['sha256'];
                if (($blob['path'] ?? null) !== $name || isset($expected[$name])) { throw new \RuntimeException('Original source blob identity differs or repeats.'); }
                $expected[$name] = true;
                $this->checkMember($zip, $name, $blob['bytes'], $blob['sha256']);
            }
            foreach ($manifest['sources'] as $file) {
                $this->relative($file['path']);
                if (!isset($expected['blobs/' . ($file['blob']['sha256'] ?? '')])) { throw new \RuntimeException('A complete source journal member is missing.'); }
            }
            foreach ($manifest['journals'] ?? [] as $journal) {
                if (!preg_match('/\Aimport-[a-f0-9]{32}-(?:start|returned|error)\z/D', $journal['name'] ?? '') ||
                    !isset($expected['blobs/' . ($journal['blob']['sha256'] ?? '')])) {
                    throw new \RuntimeException('A complete original import journal is missing or unbound.');
                }
            }
            ksort($names); ksort($expected);
            if ($names !== $expected) { throw new \RuntimeException('The archive contains unbound or missing original members.'); }
            return $manifest;
        } finally { $zip->close(); }
    }

    public function receive(string $projectId, string $path, string $operationId, string $actor): array
    {
        $manifest = $this->inspect($path);
        if ($manifest['project_id'] !== $projectId) { throw new \RuntimeException('Receive the original project identity without renaming it.'); }
        $archive = $this->store->blobFile($path);
        $receiptId = Support::hash(['project_id' => $projectId, 'archive' => $archive['sha256']]);
        $received = $this->store->object('received', $receiptId);
        if ($received !== null) {
            if ($received['manifest_sha256'] !== $manifest['content_sha256']) { throw new \RuntimeException('The accepted original receipt differs.'); }
            $this->store->require('project', $projectId, $projectId);
            return $received; // Later local work is preserved.
        }
        if ($this->store->object('project', $projectId) !== null) {
            throw new \RuntimeException('This target already has the named project without this original acceptance; select its original receiving operation.');
        }
        $zip = new \ZipArchive();
        if ($zip->open($this->store->blobPath($archive), \ZipArchive::RDONLY) !== true) { throw new \RuntimeException('Cannot reopen retained original archive bytes.'); }
        try {
            foreach ($manifest['blobs'] as $blob) {
                $stream = $zip->getStream('blobs/' . $blob['sha256']);
                if ($stream === false) { throw new \RuntimeException('Cannot receive a complete original source blob.'); }
                $temporary = $this->store->temporaryPath();
                try {
                    $out = fopen($temporary, 'w+b');
                    if ($out === false) { throw new \RuntimeException('Cannot receive original private bytes.'); }
                    try { stream_copy_to_stream($stream, $out); fflush($out); fsync($out); } finally { fclose($out); }
                    $actual = $this->store->blobFile($temporary);
                    if ($actual !== $blob) { throw new \RuntimeException('The received complete source blob differs.'); }
                } finally { fclose($stream); @unlink($temporary); }
            }
            $this->source->importProject($projectId, $manifest['sources']);
            foreach ($manifest['journals'] ?? [] as $journal) {
                $value = json_decode($this->store->readBlob($journal['blob']), true, 512, JSON_THROW_ON_ERROR);
                if (($value['project_id'] ?? $projectId) !== $projectId) { throw new \RuntimeException('Original import journal belongs to another project.'); }
                $this->store->journal($journal['name'], $value);
            }
            return $this->store->atomic(function () use ($zip, $manifest, $projectId, $operationId, $actor, $archive, $receiptId): array {
                foreach ($manifest['records'] as $entry) {
                    $body = $zip->getFromName($entry['path']);
                    if (!is_string($body)) { throw new \RuntimeException('Missing complete original record.'); }
                    $record = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
                    $binding = $record['_record'] ?? null;
                    if (!is_array($binding) || $binding['project_id'] !== $projectId || $binding['kind'] !== $entry['kind'] ||
                        $binding['id'] !== $entry['id'] || $binding['revision'] !== $entry['revision']) {
                        throw new \RuntimeException('An original received native record binding differs.');
                    }
                    // The target's live receiving command is its own retained actor/input.
                    if ($binding['kind'] === 'command' && $binding['id'] === $operationId) { continue; }
                    $this->store->receiveOriginal($record);
                }
                $receipt = ['state' => 'COMPLETE', 'project_id' => $projectId, 'operation_id' => $operationId,
                    'archive' => $archive, 'manifest_sha256' => $manifest['content_sha256'], 'received_by' => $actor,
                    'received_at' => Support::now(), 'native_requirement' => $manifest['native_requirement']];
                return $this->store->original('received', $receiptId, $projectId, $receipt);
            });
        } finally { $zip->close(); }
    }

    public function files(string $projectId): array
    {
        $this->store->require('project', $projectId, $projectId);
        $blobs = [];
        foreach ($this->store->allProject($projectId) as $record) { $this->findBlobs($record, $blobs); }
        foreach ($this->store->importJournals($projectId) as $row) { $blobs[$row['blob']['sha256']] = $row['blob']; }
        foreach ($this->source->exportProject($projectId) as $row) { $blobs[$row['blob']['sha256']] = $row['blob']; }
        ksort($blobs, SORT_STRING);
        return ['state' => 'COMPLETE', 'project_id' => $projectId, 'files' => array_values($blobs)];
    }

    public function selectedFile(string $projectId, string $sha): array
    {
        foreach ($this->files($projectId)['files'] as $file) {
            if ($file['sha256'] === $sha) { $this->store->blobPath($file); return $file; }
        }
        throw new \RuntimeException('This original file is not an asset of the selected project.');
    }

    private function findBlobs(mixed $value, array &$found): void
    {
        if (!is_array($value)) { return; }
        if (isset($value['sha256'], $value['bytes'], $value['path']) && is_string($value['sha256']) &&
            ($value['path'] === 'blobs/' . $value['sha256']) && is_int($value['bytes'])) {
            $this->store->blobPath($value);
            $found[$value['sha256']] = ['sha256' => $value['sha256'], 'bytes' => $value['bytes'], 'path' => $value['path']];
        }
        foreach ($value as $child) { $this->findBlobs($child, $found); }
    }

    private function relative(string $path): string
    {
        if ($path === '' || strlen($path) > 2048 || str_contains($path, "\0") || str_contains($path, '\\') ||
            str_starts_with($path, '/') || preg_match('/(?:^|\/)\.\.?(?:\/|$)/', $path) || str_contains($path, ':')) {
            throw new \RuntimeException('Use ordinary bounded package-relative native member paths.');
        }
        return $path;
    }

    private function checkMember(\ZipArchive $zip, string $path, int $bytes, string $sha): void
    {
        if ($bytes < 0 || !preg_match('/\A[a-f0-9]{64}\z/D', $sha)) { throw new \RuntimeException('The source member has an invalid original identity.'); }
        $stream = $zip->getStream($path);
        if ($stream === false) { throw new \RuntimeException('Missing original source member ' . $path); }
        $context = hash_init('sha256');
        $count = 0;
        try {
            while (!feof($stream)) {
                $part = fread($stream, 1048576);
                if ($part === false) { throw new \RuntimeException('Original source member ended unexpectedly.'); }
                $count += strlen($part);
                if ($count > $bytes) { throw new \RuntimeException('Original member exceeds its declared size.'); }
                hash_update($context, $part);
            }
        } finally { fclose($stream); }
        if ($count !== $bytes || hash_final($context) !== $sha) { throw new \RuntimeException('Original source member bytes differ.'); }
    }
}
