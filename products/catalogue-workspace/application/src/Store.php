<?php
declare(strict_types=1);

namespace Tjl\CatalogueWorkspace;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Schema\Schema;

/**
 * Review records share the original Sylius database connection. Immutable source
 * blobs and command journals use the selected shared private filesystem.
 */
final class Store
{
    private array $locks = [];

    public function __construct(private Connection $connection, private string $directory)
    {
        if ($directory === '' || $directory[0] !== '/' || str_contains($directory, "\0")) {
            throw new \InvalidArgumentException('Select an absolute private catalogue workspace directory.');
        }
        if (is_link($directory)) {
            throw new \RuntimeException('The private workspace root cannot be a symbolic link.');
        }
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new \RuntimeException('Cannot create the private workspace directory.');
        }
        $this->directory = realpath($directory) ?: throw new \RuntimeException('Cannot resolve workspace directory.');
        foreach (['blobs', 'locks', 'temporary', 'journals'] as $child) {
            $path = $this->directory . '/' . $child;
            if (is_link($path) || (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path))) {
                throw new \RuntimeException('Cannot use the private workspace ' . $child . '.');
            }
        }
    }

    public function root(): string { return $this->directory; }
    public function connection(): Connection { return $this->connection; }

    /** Explicit native installation action; this never alters existing tables. */
    public function install(): array
    {
        $manager = $this->connection->createSchemaManager();
        if ($manager->tablesExist(['tjl_catalogue_record'])) {
            $columns = $manager->listTableColumns('tjl_catalogue_record');
            foreach (['kind', 'id', 'project_id', 'revision', 'payload', 'updated_at'] as $name) {
                if (!isset($columns[$name])) {
                    throw new \RuntimeException('The existing catalogue table has an incompatible original schema.');
                }
            }
            return ['state' => 'COMPLETE', 'existing' => true];
        }
        $schema = new Schema();
        $table = $schema->createTable('tjl_catalogue_record');
        $table->addColumn('kind', 'string', ['length' => 64]);
        $table->addColumn('id', 'string', ['length' => 128]);
        $table->addColumn('project_id', 'string', ['length' => 128]);
        $table->addColumn('revision', 'integer');
        $table->addColumn('payload', 'text');
        $table->addColumn('updated_at', 'string', ['length' => 40]);
        $table->setPrimaryKey(['kind', 'id']);
        $table->addIndex(['project_id', 'kind', 'id'], 'tjl_catalogue_project');
        foreach ($schema->toSql($this->connection->getDatabasePlatform()) as $sql) {
            $this->connection->executeStatement($sql);
        }
        return ['state' => 'COMPLETE', 'existing' => false];
    }

    public function object(string $kind, string $id): ?array
    {
        $row = $this->connection->fetchAssociative(
            'SELECT kind, id, project_id, revision, payload FROM tjl_catalogue_record WHERE kind = ? AND id = ?',
            [Support::id($kind), Support::id($id)],
        );
        return $row === false ? null : $this->decode($row);
    }

    public function require(string $kind, string $id, ?string $projectId = null): array
    {
        $row = $this->object($kind, $id) ?? throw new \RuntimeException('The original ' . $kind . ' record is missing: ' . $id);
        if ($projectId !== null && $row['_record']['project_id'] !== $projectId) {
            throw new \RuntimeException('This record belongs to another original project.');
        }
        return $row;
    }

    public function put(string $kind, string $id, string $projectId, array $value, ?int $expectedRevision): array
    {
        Support::id($kind); Support::id($id); Support::id($projectId);
        $value = Support::withoutRecord($value);
        $payload = Support::json($value);
        $now = Support::now();
        $revision = $expectedRevision === null ? 1 : $expectedRevision + 1;
        if ($expectedRevision === null) {
            $this->connection->insert('tjl_catalogue_record', [
                'kind' => $kind, 'id' => $id, 'project_id' => $projectId,
                'revision' => $revision, 'payload' => $payload, 'updated_at' => $now,
            ]);
        } else {
            $count = $this->connection->executeStatement(
                'UPDATE tjl_catalogue_record SET payload = ?, revision = ?, updated_at = ? WHERE kind = ? AND id = ? AND project_id = ? AND revision = ?',
                [$payload, $revision, $now, $kind, $id, $projectId, $expectedRevision],
            );
            if ($count !== 1) {
                throw new \RuntimeException('The original record changed; read its current revision before continuing.');
            }
        }
        return $value + ['_record' => ['kind' => $kind, 'id' => $id, 'project_id' => $projectId, 'revision' => $revision]];
    }

    public function save(array $record): array
    {
        $binding = $record['_record'] ?? throw new \InvalidArgumentException('Save requires the original record binding.');
        return $this->put($binding['kind'], $binding['id'], $binding['project_id'], $record, $binding['revision']);
    }

    public function original(string $kind, string $id, string $projectId, array $value): array
    {
        $existing = $this->object($kind, $id);
        if ($existing !== null) {
            if ($existing['_record']['project_id'] !== $projectId || Support::hash(Support::withoutRecord($existing)) !== Support::hash($value)) {
                throw new \RuntimeException('The immutable original ' . $kind . ' identity already names different bytes.');
            }
            return $existing;
        }
        return $this->put($kind, $id, $projectId, $value, null);
    }

    public function records(string $kind, string $projectId, int $limit = 100, int $offset = 0): array
    {
        if ($limit < 1 || $limit > 1000 || $offset < 0) {
            throw new \InvalidArgumentException('Select a record page of 1–1000 rows.');
        }
        $query = $this->connection->createQueryBuilder();
        $query->select('kind', 'id', 'project_id', 'revision', 'payload')->from('tjl_catalogue_record')
            ->where('kind = :kind')->andWhere('project_id = :project')
            ->setParameter('kind', Support::id($kind))->setParameter('project', Support::id($projectId))
            ->orderBy('id', 'ASC')->setMaxResults($limit)->setFirstResult($offset);
        return array_map($this->decode(...), $query->executeQuery()->fetchAllAssociative());
    }

    public function allProject(string $projectId): \Generator
    {
        $result = $this->connection->executeQuery(
            'SELECT kind, id, project_id, revision, payload FROM tjl_catalogue_record WHERE project_id = ? ORDER BY kind, id',
            [Support::id($projectId)],
        );
        while (($row = $result->fetchAssociative()) !== false) {
            yield $this->decode($row);
        }
    }

    public function atomic(callable $callback): mixed
    {
        return $this->connection->transactional(fn () => $callback());
    }

    /** Same shared directory is required by the installed worker and operator. */
    public function lock(string $key, callable $callback): mixed
    {
        $key = hash('sha256', $key);
        if (isset($this->locks[$key])) {
            return $callback();
        }
        $path = $this->directory . '/locks/' . $key . '.lock';
        if (is_link($path)) {
            throw new \RuntimeException('The original operation lock is linked.');
        }
        $handle = fopen($path, 'c+b');
        if ($handle === false || !flock($handle, LOCK_EX | LOCK_NB)) {
            if (is_resource($handle)) { fclose($handle); }
            throw new \RuntimeException('The same original catalogue operation is already running.');
        }
        chmod($path, 0600);
        $this->locks[$key] = $handle;
        try {
            return $callback();
        } finally {
            unset($this->locks[$key]);
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    public function temporaryPath(string $suffix = '.part'): string
    {
        if (!preg_match('/\A[.A-Za-z0-9_-]{0,32}\z/D', $suffix)) {
            throw new \InvalidArgumentException('Invalid private temporary suffix.');
        }
        $path = tempnam($this->directory . '/temporary', 'catalogue-');
        if ($path === false) { throw new \RuntimeException('Cannot allocate original private bytes.'); }
        chmod($path, 0600);
        if ($suffix !== '') {
            $next = $path . $suffix;
            if (!rename($path, $next)) { throw new \RuntimeException('Cannot retain the private temporary path.'); }
            $path = $next;
        }
        return $path;
    }

    public function blob(string $bytes): array
    {
        $path = $this->temporaryPath();
        try {
            $written = file_put_contents($path, $bytes, LOCK_EX);
            if ($written !== strlen($bytes)) { throw new \RuntimeException('The original bytes were not written completely.'); }
            return $this->blobFile($path);
        } finally { @unlink($path); }
    }

    /** Copies input; the original caller-owned source path is never removed. */
    public function blobFile(string $source): array
    {
        if (!is_file($source) || is_link($source)) { throw new \RuntimeException('Select a complete ordinary original file.'); }
        $sha = hash_file('sha256', $source);
        $size = filesize($source);
        if (!is_string($sha) || !is_int($size)) { throw new \RuntimeException('Cannot read original source identity.'); }
        $relative = 'blobs/' . $sha;
        $destination = $this->directory . '/' . $relative;
        if (!file_exists($destination)) {
            $stage = $this->temporaryPath();
            try {
                if (!copy($source, $stage) || filesize($stage) !== $size || hash_file('sha256', $stage) !== $sha) {
                    throw new \RuntimeException('The complete original file changed during receiving.');
                }
                chmod($stage, 0600);
                $handle = fopen($stage, 'r+b');
                if ($handle === false) { throw new \RuntimeException('Cannot sync the retained original bytes.'); }
                try { if (!fsync($handle)) { throw new \RuntimeException('Cannot sync retained bytes.'); } } finally { fclose($handle); }
                if (!@link($stage, $destination) && !is_file($destination)) {
                    throw new \RuntimeException('Cannot publish the complete private source file.');
                }
            } finally { @unlink($stage); }
        }
        $result = ['sha256' => $sha, 'bytes' => $size, 'path' => $relative];
        $this->blobPath($result);
        return $result;
    }

    public function blobPath(array $blob): string
    {
        $sha = $blob['sha256'] ?? '';
        if (!is_string($sha) || !preg_match('/\A[a-f0-9]{64}\z/D', $sha) ||
            ($blob['path'] ?? '') !== 'blobs/' . $sha || !is_int($blob['bytes'] ?? null)) {
            throw new \InvalidArgumentException('Select the complete original source descriptor.');
        }
        $path = $this->directory . '/' . $blob['path'];
        if (is_link($path) || !is_file($path) || filesize($path) !== $blob['bytes'] || hash_file('sha256', $path) !== $sha) {
            throw new \RuntimeException('Original private source bytes are missing or different.');
        }
        return $path;
    }

    public function readBlob(array $blob): string
    {
        $bytes = file_get_contents($this->blobPath($blob));
        if ($bytes === false) { throw new \RuntimeException('Cannot read complete original bytes.'); }
        return $bytes;
    }

    public function journal(string $name, array $value): array
    {
        Support::id($name);
        $blob = $this->blob(Support::json($value) . "\n");
        $path = $this->directory . '/journals/' . $name . '.json';
        $existing = is_file($path) ? file_get_contents($path) : false;
        $encoded = Support::json($blob) . "\n";
        if ($existing !== false && $existing !== $encoded) {
            throw new \RuntimeException('Retain the original journal edition; use a distinct attempt identity.');
        }
        if ($existing === false) {
            $handle = @fopen($path, 'x+b');
            if ($handle === false) { throw new \RuntimeException('The original journal was created concurrently.'); }
            try {
                chmod($path, 0600);
                if (fwrite($handle, $encoded) !== strlen($encoded) || !fflush($handle) || !fsync($handle)) {
                    throw new \RuntimeException('Original journal publication is incomplete.');
                }
            } finally { fclose($handle); }
        }
        return $blob;
    }

    private function decode(array $row): array
    {
        $value = json_decode($row['payload'], true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($value) || array_is_list($value) && $value !== []) {
            throw new \RuntimeException('The native catalogue record is not an object.');
        }
        $value['_record'] = ['kind' => $row['kind'], 'id' => $row['id'], 'project_id' => $row['project_id'], 'revision' => (int) $row['revision']];
        return $value;
    }
}
