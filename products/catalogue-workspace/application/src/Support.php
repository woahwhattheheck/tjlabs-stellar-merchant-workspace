<?php
declare(strict_types=1);

namespace Tjl\CatalogueWorkspace;

/** Lossless JSON storage for native PHP values; source response bytes remain separate. */
final class Support
{
    public static function json(mixed $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    }

    public static function canonical(mixed $value): string
    {
        if (is_object($value)) {
            $value = get_object_vars($value);
            ksort($value, SORT_STRING);
            $parts = [];
            foreach ($value as $key => $item) {
                $parts[] = self::json((string) $key) . ':' . self::canonical($item);
            }
            return '{' . implode(',', $parts) . '}';
        }
        if (!is_array($value)) {
            return self::json($value);
        }
        if (array_is_list($value)) {
            return '[' . implode(',', array_map(self::canonical(...), $value)) . ']';
        }
        ksort($value, SORT_STRING);
        $parts = [];
        foreach ($value as $key => $item) {
            $parts[] = self::json((string) $key) . ':' . self::canonical($item);
        }
        return '{' . implode(',', $parts) . '}';
    }

    public static function hash(mixed $value): string
    {
        return hash('sha256', self::canonical($value));
    }

    public static function now(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z');
    }

    public static function id(string $value): string
    {
        if (!preg_match('/\A[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\z/D', $value)) {
            throw new \InvalidArgumentException('Use an original identifier containing letters, digits, dot, underscore or hyphen, up to 128 characters.');
        }
        return $value;
    }

    public static function requiredString(array $input, string $key, int $maximum = 2000): string
    {
        $value = $input[$key] ?? null;
        if (!is_string($value) || $value === '' || strlen($value) > $maximum || str_contains($value, "\0")) {
            throw new \InvalidArgumentException('Supply the complete ' . $key . '.');
        }
        return $value;
    }

    public static function strings(mixed $value, string $name, int $limit = 5000): array
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > $limit) {
            throw new \InvalidArgumentException($name . ' must be an explicit bounded list.');
        }
        $seen = [];
        foreach ($value as $item) {
            if (!is_string($item) || $item === '' || strlen($item) > 1000 || str_contains($item, "\0") || isset($seen[$item])) {
                throw new \InvalidArgumentException($name . ' contains an invalid or repeated original value.');
            }
            $seen[$item] = true;
        }
        return $value;
    }

    public static function withoutRecord(array $value): array
    {
        unset($value['_record']);
        return $value;
    }

    public static function error(\Throwable $error): array
    {
        return ['type' => $error::class, 'message' => $error->getMessage(), 'at' => self::now()];
    }
}
