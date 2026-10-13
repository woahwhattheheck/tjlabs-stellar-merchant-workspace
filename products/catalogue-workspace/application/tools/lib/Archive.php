<?php

declare(strict_types=1);

namespace Tjl\CatalogueWorkspace\Handover;

// Maintained authenticated native-project Archive v1, namespace-only adaptation.
// Original code and format retained from the shared native handover engine.

use RuntimeException;

final class HandoverFailure extends RuntimeException
{
    public function __construct(string $message, public readonly string $reason = 'HANDOVER_FAILED')
    {
        parent::__construct($message);
    }
}

final class Files
{
    public static function json(mixed $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    public static function readJson(string $path): array
    {
        $text = file_get_contents($path);
        if ($text === false) {
            throw new HandoverFailure('Cannot read JSON file: ' . $path, 'FILE_READ');
        }
        $value = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($value)) {
            throw new HandoverFailure('Expected a JSON object: ' . $path, 'INVALID_JSON');
        }
        return $value;
    }

    public static function writeJson(string $path, array $value): void
    {
        self::atomic($path, self::json($value) . "\n");
    }

    public static function atomic(string $path, string $bytes): void
    {
        self::assertParent($path);
        if (is_link($path)) {
            throw new HandoverFailure('Refusing to replace a symbolic link: ' . $path, 'SYMLINK_DESTINATION');
        }
        $temporary = $path . '.part-' . bin2hex(random_bytes(8));
        $handle = fopen($temporary, 'xb');
        if ($handle === false) {
            throw new HandoverFailure('Cannot create private output: ' . $temporary, 'FILE_CREATE');
        }
        chmod($temporary, 0600);
        try {
            self::write($handle, $bytes);
            fflush($handle);
            if (function_exists('fsync')) {
                fsync($handle);
            }
        } finally {
            fclose($handle);
        }
        if (!rename($temporary, $path)) {
            throw new HandoverFailure('Cannot commit output: ' . $path, 'FILE_RENAME');
        }
    }

    public static function write($handle, string $bytes): void
    {
        $offset = 0;
        $length = strlen($bytes);
        while ($offset < $length) {
            $written = fwrite($handle, substr($bytes, $offset));
            if ($written === false || $written === 0) {
                throw new HandoverFailure('Output stream stopped accepting bytes.', 'STREAM_WRITE');
            }
            $offset += $written;
        }
    }

    public static function read($handle, int $length): string
    {
        $bytes = '';
        while (strlen($bytes) < $length) {
            $chunk = fread($handle, $length - strlen($bytes));
            if ($chunk === false || $chunk === '') {
                throw new HandoverFailure('Archive or source stream ended early.', 'TRUNCATED_STREAM');
            }
            $bytes .= $chunk;
        }
        return $bytes;
    }

    public static function absolute(string $path): string
    {
        if ($path === '' || $path[0] !== '/' || str_contains($path, "\0")) {
            throw new HandoverFailure('Use an absolute local path: ' . $path, 'ABSOLUTE_PATH_REQUIRED');
        }
        $parts = [];
        foreach (explode('/', $path) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            if ($part === '..') {
                if ($parts === []) {
                    throw new HandoverFailure('Path escapes its root.', 'PATH_ESCAPE');
                }
                array_pop($parts);
            } else {
                $parts[] = $part;
            }
        }
        return '/' . implode('/', $parts);
    }

    public static function relative(string $path): string
    {
        if ($path === '' || str_contains($path, "\0") || str_contains($path, '\\') || $path[0] === '/') {
            throw new HandoverFailure('Invalid archive member path.', 'INVALID_MEMBER_PATH');
        }
        foreach (explode('/', $path) as $part) {
            if ($part === '' || $part === '.' || $part === '..') {
                throw new HandoverFailure('Invalid archive member path: ' . $path, 'INVALID_MEMBER_PATH');
            }
        }
        if (!preg_match('//u', $path)) {
            throw new HandoverFailure('Archive paths must be valid UTF-8.', 'NON_UTF8_PATH');
        }
        return $path;
    }

    public static function inside(string $path, string $root): bool
    {
        $path = self::absolute($path);
        $root = rtrim(self::absolute($root), '/');
        return $path === $root || str_starts_with($path, $root . '/');
    }

    public static function privateDirectory(string $path): string
    {
        $path = self::absolute($path);
        self::assertParent($path);
        if (is_link($path)) {
            throw new HandoverFailure('Private work directory cannot be a symbolic link.', 'SYMLINK_DESTINATION');
        }
        if (!is_dir($path) && !mkdir($path, 0700)) {
            throw new HandoverFailure('Cannot create private work directory.', 'DIRECTORY_CREATE');
        }
        $mode = fileperms($path);
        if ($mode === false || ($mode & 0077) !== 0) {
            throw new HandoverFailure('Work directory must be private (mode 0700): ' . $path, 'PRIVATE_DIRECTORY_REQUIRED');
        }
        return $path;
    }

    public static function assertParent(string $path): void
    {
        $path = self::absolute($path);
        $parent = dirname($path);
        $current = '';
        foreach (explode('/', trim($parent, '/')) as $part) {
            if ($part === '') {
                continue;
            }
            $current .= '/' . $part;
            if (is_link($current)) {
                throw new HandoverFailure('Destination has a symbolic-link parent: ' . $current, 'SYMLINK_DESTINATION');
            }
            if (!is_dir($current)) {
                throw new HandoverFailure('Destination parent does not exist: ' . $current, 'DIRECTORY_MISSING');
            }
        }
    }

    public static function makeParent(string $path, string $root): void
    {
        if (!self::inside($path, $root)) {
            throw new HandoverFailure('Destination escapes selected root.', 'PATH_ESCAPE');
        }
        $relative = ltrim(substr(dirname($path), strlen(rtrim($root, '/'))), '/');
        $current = rtrim($root, '/');
        foreach ($relative === '' ? [] : explode('/', $relative) as $part) {
            $current .= '/' . $part;
            if (is_link($current) || (file_exists($current) && !is_dir($current))) {
                throw new HandoverFailure('Unsafe destination parent: ' . $current, 'SYMLINK_DESTINATION');
            }
            if (!is_dir($current) && !mkdir($current, 0700)) {
                throw new HandoverFailure('Cannot create receiving directory.', 'DIRECTORY_CREATE');
            }
        }
    }

    public static function key(string $path): string
    {
        self::assertParent($path);
        if (!is_file($path) || is_link($path) || (fileperms($path) & 0077) !== 0) {
            throw new HandoverFailure('Archive key must be a private regular file (mode 0600).', 'PRIVATE_KEY_REQUIRED');
        }
        $key = file_get_contents($path);
        if ($key === false || strlen($key) !== 32) {
            throw new HandoverFailure('Archive key file must contain exactly 32 random bytes.', 'INVALID_ARCHIVE_KEY');
        }
        return $key;
    }
}

/**
 * Whole-project encrypted stream. Each record is an independent AES-256-GCM
 * ciphertext bound to the original authenticated header and monotonic index.
 * The authenticated final record is mandatory. No plaintext file is committed
 * until all its original declared bytes and digest have been checked.
 */
final class Archive
{
    public const FORMAT = 'ydw.native-project-encrypted.v1';
    public const MANIFEST = 'ydw.native-project-manifest.v1';
    private const MAGIC = "YDW-NATIVE-PROJECT\n";
    private const CHUNK = 1048576;

    public static function write(
        string $path,
        string $key,
        array $manifest,
        array $sources,
        ?callable $heartbeat = null
    ): array {
        if (strlen($key) !== 32) {
            throw new HandoverFailure('The original archive key must contain exactly 32 bytes.', 'INVALID_ARCHIVE_KEY');
        }
        if (!extension_loaded('openssl')) {
            throw new HandoverFailure('PHP OpenSSL is required for authenticated project encryption.', 'OPENSSL_REQUIRED');
        }
        Files::assertParent($path);
        if (file_exists($path) || is_link($path)) {
            throw new HandoverFailure('Archive output already exists: ' . $path, 'OUTPUT_EXISTS');
        }
        self::validateManifest($manifest);
        $manifestBytes = Files::json($manifest);
        $header = [
            'format' => self::FORMAT,
            'archive_id' => bin2hex(random_bytes(16)),
            'cipher' => 'aes-256-gcm',
            'kdf' => 'hkdf-sha256',
            'salt' => base64_encode(random_bytes(32)),
            'nonce_prefix' => base64_encode(random_bytes(8)),
            'chunk_bytes' => self::CHUNK,
        ];
        $headerBytes = Files::json($header);
        $salt = base64_decode($header['salt'], true);
        $prefix = base64_decode($header['nonce_prefix'], true);
        $derived = hash_hkdf('sha256', $key, 32, self::FORMAT . ':' . $header['archive_id'], $salt);
        $headerDigest = hash('sha256', $headerBytes, true);
        $temporary = $path . '.part-' . bin2hex(random_bytes(8));
        $out = fopen($temporary, 'xb');
        if ($out === false) {
            throw new HandoverFailure('Cannot create encrypted archive.', 'FILE_CREATE');
        }
        chmod($temporary, 0600);
        $index = 0;
        $emit = static function (string $plain) use ($out, $derived, $prefix, $headerDigest, &$index): void {
            if ($index >= 0xffffffff || strlen($plain) > self::CHUNK + 16384) {
                throw new HandoverFailure('Archive record limit exceeded.', 'ARCHIVE_LIMIT');
            }
            $sequence = pack('N', $index);
            $tag = '';
            $cipher = openssl_encrypt($plain, 'aes-256-gcm', $derived, OPENSSL_RAW_DATA, $prefix . $sequence, $tag, $headerDigest . $sequence, 16);
            if ($cipher === false || strlen($tag) !== 16) {
                throw new HandoverFailure('Project encryption failed.', 'ENCRYPTION_FAILED');
            }
            Files::write($out, pack('N', strlen($cipher)) . $tag . $cipher);
            $index++;
        };
        try {
            Files::write($out, self::MAGIC . pack('N', strlen($headerBytes)) . $headerBytes);
            $emit('B' . Files::json(['bytes' => strlen($manifestBytes), 'sha256' => hash('sha256', $manifestBytes)]));
            for ($offset = 0; $offset < strlen($manifestBytes); $offset += self::CHUNK) {
                $emit('M' . substr($manifestBytes, $offset, self::CHUNK));
                if ($heartbeat !== null) {
                    $heartbeat();
                }
            }
            $total = 0;
            foreach ($manifest['entries'] as $entry) {
                $emit('E' . Files::json($entry));
                if ($entry['type'] !== 'file') {
                    continue;
                }
                $source = $sources[$entry['path']] ?? null;
                if (!is_string($source) || !is_file($source) || is_link($source)) {
                    throw new HandoverFailure('Missing original file: ' . $entry['path'], 'SOURCE_CHANGED');
                }
                $input = fopen($source, 'rb');
                if ($input === false) {
                    throw new HandoverFailure('Cannot open original file: ' . $entry['path'], 'FILE_READ');
                }
                $digest = hash_init('sha256');
                $size = 0;
                try {
                    while (!feof($input)) {
                        $chunk = fread($input, self::CHUNK);
                        if ($chunk === false) {
                            throw new HandoverFailure('Original file read failed.', 'FILE_READ');
                        }
                        if ($chunk === '') {
                            if (!feof($input)) {
                                throw new HandoverFailure('Original file stream stalled.', 'FILE_READ');
                            }
                            break;
                        }
                        hash_update($digest, $chunk);
                        $size += strlen($chunk);
                        if ($size > $entry['bytes']) {
                            throw new HandoverFailure('Original file grew during capture: ' . $entry['path'], 'SOURCE_CHANGED');
                        }
                        $emit('D' . $chunk);
                        if ($heartbeat !== null) {
                            $heartbeat();
                        }
                    }
                } finally {
                    fclose($input);
                }
                $sha = hash_final($digest);
                if ($size !== $entry['bytes'] || !hash_equals($entry['sha256'], $sha)) {
                    throw new HandoverFailure('Original file changed during capture: ' . $entry['path'], 'SOURCE_CHANGED');
                }
                $emit('F' . Files::json(['path' => $entry['path'], 'bytes' => $size, 'sha256' => $sha]));
                $total += $size;
            }
            $emit('T' . Files::json([
                'manifest_sha256' => hash('sha256', $manifestBytes),
                'entries' => count($manifest['entries']),
                'file_bytes' => $total,
            ]));
            fflush($out);
            if (function_exists('fsync')) {
                fsync($out);
            }
        } finally {
            fclose($out);
        }
        if (!rename($temporary, $path)) {
            throw new HandoverFailure('Cannot commit the complete encrypted archive.', 'FILE_RENAME');
        }
        return [
            'format' => self::FORMAT,
            'path' => $path,
            'archive_id' => $header['archive_id'],
            'bytes' => filesize($path),
            'sha256' => hash_file('sha256', $path),
            'manifest_sha256' => hash('sha256', $manifestBytes),
            'entries' => count($manifest['entries']),
            'file_bytes' => $total,
        ];
    }

    public static function receive(string $path, string $key, string $directory, ?callable $heartbeat = null): array
    {
        if (strlen($key) !== 32 || !extension_loaded('openssl')) {
            throw new HandoverFailure('The original 32-byte archive key and native OpenSSL are required.', 'INVALID_ARCHIVE_KEY');
        }
        Files::privateDirectory($directory);
        if (iterator_count(new \FilesystemIterator($directory, \FilesystemIterator::SKIP_DOTS)) !== 0) {
            throw new HandoverFailure('Archive staging directory must be empty.', 'STAGING_NOT_EMPTY');
        }
        $input = fopen($path, 'rb');
        if ($input === false) {
            throw new HandoverFailure('Cannot open original archive.', 'FILE_READ');
        }
        $openFile = null;
        try {
            if (Files::read($input, strlen(self::MAGIC)) !== self::MAGIC) {
                throw new HandoverFailure('Unknown project archive format.', 'ARCHIVE_FORMAT');
            }
            $headerLength = unpack('Nvalue', Files::read($input, 4))['value'];
            if ($headerLength < 20 || $headerLength > 4096) {
                throw new HandoverFailure('Invalid archive header length.', 'ARCHIVE_FORMAT');
            }
            $headerBytes = Files::read($input, $headerLength);
            $header = json_decode($headerBytes, true, 64, JSON_THROW_ON_ERROR);
            $salt = base64_decode($header['salt'] ?? '', true);
            $prefix = base64_decode($header['nonce_prefix'] ?? '', true);
            if (($header['format'] ?? null) !== self::FORMAT || ($header['cipher'] ?? null) !== 'aes-256-gcm'
                || ($header['kdf'] ?? null) !== 'hkdf-sha256' || ($header['chunk_bytes'] ?? null) !== self::CHUNK
                || !is_string($salt) || strlen($salt) !== 32 || !is_string($prefix) || strlen($prefix) !== 8
                || !preg_match('/^[a-f0-9]{32}$/D', $header['archive_id'] ?? '')) {
                throw new HandoverFailure('Unsupported or invalid authenticated archive header.', 'ARCHIVE_FORMAT');
            }
            $derived = hash_hkdf('sha256', $key, 32, self::FORMAT . ':' . $header['archive_id'], $salt);
            $headerDigest = hash('sha256', $headerBytes, true);
            $index = 0;
            $next = static function () use ($input, $derived, $prefix, $headerDigest, &$index): string {
                if ($index >= 0xffffffff) {
                    throw new HandoverFailure('Archive sequence overflow.', 'ARCHIVE_LIMIT');
                }
                $length = unpack('Nvalue', Files::read($input, 4))['value'];
                if ($length < 1 || $length > self::CHUNK + 16384) {
                    throw new HandoverFailure('Invalid encrypted record length.', 'ARCHIVE_FORMAT');
                }
                $tag = Files::read($input, 16);
                $cipher = Files::read($input, $length);
                $sequence = pack('N', $index);
                $plain = openssl_decrypt($cipher, 'aes-256-gcm', $derived, OPENSSL_RAW_DATA, $prefix . $sequence, $tag, $headerDigest . $sequence);
                if ($plain === false || $plain === '') {
                    throw new HandoverFailure('Archive authentication failed at record ' . $index . '.', 'ARCHIVE_AUTHENTICATION');
                }
                $index++;
                return $plain;
            };
            $begin = $next();
            if ($begin[0] !== 'B') {
                throw new HandoverFailure('Archive manifest is missing.', 'ARCHIVE_FORMAT');
            }
            $declared = json_decode(substr($begin, 1), true, 32, JSON_THROW_ON_ERROR);
            if (!is_int($declared['bytes'] ?? null) || $declared['bytes'] < 2 || $declared['bytes'] > 134217728) {
                throw new HandoverFailure('Unsupported manifest size.', 'MANIFEST_LIMIT');
            }
            $manifestBytes = '';
            while (strlen($manifestBytes) < $declared['bytes']) {
                $record = $next();
                if ($record[0] !== 'M') {
                    throw new HandoverFailure('Manifest stream is incomplete.', 'ARCHIVE_FORMAT');
                }
                $manifestBytes .= substr($record, 1);
                if (strlen($manifestBytes) > $declared['bytes']) {
                    throw new HandoverFailure('Manifest length exceeds its original declaration.', 'ARCHIVE_FORMAT');
                }
            }
            if (!hash_equals($declared['sha256'] ?? '', hash('sha256', $manifestBytes))) {
                throw new HandoverFailure('Manifest digest does not match.', 'MANIFEST_DIGEST');
            }
            $manifest = json_decode($manifestBytes, true, 512, JSON_THROW_ON_ERROR);
            self::validateManifest($manifest);
            $total = 0;
            foreach ($manifest['entries'] as $entry) {
                $record = $next();
                if ($record[0] !== 'E' || !hash_equals(Files::json($entry), substr($record, 1))) {
                    throw new HandoverFailure('Archive member differs from the original manifest.', 'MEMBER_MANIFEST');
                }
                $destination = $directory . '/' . $entry['path'];
                Files::makeParent($destination, $directory);
                if ($entry['type'] === 'directory') {
                    if (!is_dir($destination) && !mkdir($destination, 0700)) {
                        throw new HandoverFailure('Cannot create staged directory.', 'DIRECTORY_CREATE');
                    }
                    continue;
                }
                if ($entry['type'] === 'symlink') {
                    // Materialize only after the whole archive has authenticated.
                    continue;
                }
                $part = $destination . '.part';
                $openFile = fopen($part, 'xb');
                if ($openFile === false) {
                    throw new HandoverFailure('Cannot create staged file.', 'FILE_CREATE');
                }
                chmod($part, 0600);
                $digest = hash_init('sha256');
                $bytes = 0;
                while (true) {
                    $record = $next();
                    if ($record[0] === 'F') {
                        $end = json_decode(substr($record, 1), true, 32, JSON_THROW_ON_ERROR);
                        break;
                    }
                    if ($record[0] !== 'D') {
                        throw new HandoverFailure('Original file stream is incomplete.', 'ARCHIVE_FORMAT');
                    }
                    $chunk = substr($record, 1);
                    $bytes += strlen($chunk);
                    if ($bytes > $entry['bytes']) {
                        throw new HandoverFailure('Received file exceeds its declared size.', 'MEMBER_SIZE');
                    }
                    Files::write($openFile, $chunk);
                    hash_update($digest, $chunk);
                    if ($heartbeat !== null) {
                        $heartbeat();
                    }
                }
                fflush($openFile);
                fclose($openFile);
                $openFile = null;
                $sha = hash_final($digest);
                if ($bytes !== $entry['bytes'] || !hash_equals($entry['sha256'], $sha)
                    || ($end['path'] ?? null) !== $entry['path'] || ($end['bytes'] ?? null) !== $bytes
                    || !hash_equals($sha, $end['sha256'] ?? '')) {
                    throw new HandoverFailure('Received file digest or length differs from its source.', 'MEMBER_DIGEST');
                }
                if (!rename($part, $destination)) {
                    throw new HandoverFailure('Cannot commit staged file.', 'FILE_RENAME');
                }
                $total += $bytes;
            }
            $record = $next();
            if ($record[0] !== 'T') {
                throw new HandoverFailure('Authenticated archive completion record is missing.', 'ARCHIVE_TRUNCATED');
            }
            $trailer = json_decode(substr($record, 1), true, 32, JSON_THROW_ON_ERROR);
            if (($trailer['entries'] ?? null) !== count($manifest['entries'])
                || ($trailer['file_bytes'] ?? null) !== $total
                || !hash_equals(hash('sha256', $manifestBytes), $trailer['manifest_sha256'] ?? '')) {
                throw new HandoverFailure('Archive completion differs from its manifest.', 'ARCHIVE_COMPLETION');
            }
            $extra = fread($input, 1);
            if ($extra === false || $extra !== '') {
                throw new HandoverFailure('Unexpected bytes follow the authenticated archive.', 'ARCHIVE_TRAILING_BYTES');
            }
            Files::atomic($directory . '/manifest.json', $manifestBytes . "\n");
            return [
                'format' => self::FORMAT,
                'archive_id' => $header['archive_id'],
                'archive_sha256' => hash_file('sha256', $path),
                'manifest_sha256' => hash('sha256', $manifestBytes),
                'manifest' => $manifest,
                'directory' => $directory,
                'entries' => count($manifest['entries']),
                'file_bytes' => $total,
            ];
        } finally {
            if (is_resource($openFile)) {
                fclose($openFile);
            }
            fclose($input);
        }
    }

    public static function validateManifest(array $manifest): void
    {
        if (($manifest['format'] ?? null) !== self::MANIFEST || !is_array($manifest['entries'] ?? null)
            || count($manifest['entries']) > 1000000 || !is_array($manifest['source'] ?? null)) {
            throw new HandoverFailure('Invalid whole-project manifest.', 'MANIFEST_FORMAT');
        }
        $seen = [];
        foreach ($manifest['entries'] as $entry) {
            if (!is_array($entry)) {
                throw new HandoverFailure('Invalid archive entry.', 'MANIFEST_FORMAT');
            }
            $path = Files::relative($entry['path'] ?? '');
            $group = explode('/', $path, 2)[0];
            if (!in_array($group, ['project', 'public', 'private', 'database', 'metadata'], true)
                || isset($seen[$path]) || !in_array($entry['type'] ?? '', ['file', 'directory', 'symlink'], true)) {
                throw new HandoverFailure('Invalid or duplicate archive member: ' . $path, 'MANIFEST_MEMBER');
            }
            for ($parent = dirname($path); $parent !== '.'; $parent = dirname($parent)) {
                if (isset($seen[$parent]) && $seen[$parent] !== 'directory') {
                    throw new HandoverFailure('Archive member has a non-directory parent.', 'MANIFEST_MEMBER');
                }
            }
            $seen[$path] = $entry['type'];
            if (!is_int($entry['mode'] ?? null) || $entry['mode'] < 0 || $entry['mode'] > 0777) {
                throw new HandoverFailure('Invalid archive permission mode.', 'MANIFEST_MEMBER');
            }
            if ($entry['type'] === 'file'
                && (!is_int($entry['bytes'] ?? null) || $entry['bytes'] < 0
                || !preg_match('/^[a-f0-9]{64}$/D', $entry['sha256'] ?? ''))) {
                throw new HandoverFailure('Invalid original file size or digest.', 'MANIFEST_MEMBER');
            }
            if ($entry['type'] === 'symlink') {
                $target = $entry['target'] ?? '';
                if (!is_string($target) || $target === '' || $target[0] === '/' || str_contains($target, "\0")
                    || str_contains($target, '\\')) {
                    throw new HandoverFailure('Only relative internal symbolic links are transferable.', 'MANIFEST_SYMLINK');
                }
                $resolved = Files::absolute('/' . dirname($path) . '/' . $target);
                if (!Files::inside($resolved, '/' . $group)) {
                    throw new HandoverFailure('Symbolic link escapes its selected source root.', 'MANIFEST_SYMLINK');
                }
            }
        }
        foreach ($seen as $path => $type) {
            for ($parent = dirname($path); $parent !== '.'; $parent = dirname($parent)) {
                if (isset($seen[$parent]) && $seen[$parent] !== 'directory') {
                    throw new HandoverFailure('Archive contains a child beneath a file or link.', 'MANIFEST_MEMBER');
                }
            }
        }
        if (($seen['database/database.sql'] ?? null) !== 'file'
            || ($seen['metadata/source.json'] ?? null) !== 'file'
            || ($seen['project/composer.lock'] ?? null) !== 'file'
            || ($seen['project/composer.json'] ?? null) !== 'file') {
            throw new HandoverFailure('Complete database, source identity and Composer closure are required.', 'INCOMPLETE_PROJECT');
        }
    }
}
