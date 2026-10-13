<?php

declare(strict_types=1);

namespace Commons\Terminus\GovHub;

/**
 * Private, append-only operation custody. Every mutation has one immutable
 * dispatch record; a repeated invocation reads that original custody.
 */
final class ReceiptJournal
{
    public const SCHEMA = 'govhub-pantheon-bridge/v1';
    private string $receipt;
    private string $directory;
    private string $requestHash;
    private array $request;
    private array $events = [];
    private $lock;
    private int $sequence = 0;
    private bool $dispatched = false;
    private ?string $nativePath = null;
    private ?string $nativeType = null;

    public function __construct(string $receipt, string $requestBytes, array $request)
    {
        if ($receipt === '' || $receipt[0] !== '/' || str_contains($receipt, "\0")) {
            throw new \InvalidArgumentException('Receipt must be an absolute private file path.');
        }
        $parent = realpath(dirname($receipt));
        if ($parent === false || !is_dir($parent)) {
            throw new \InvalidArgumentException('The original receipt parent directory must exist.');
        }
        $leaf = basename($receipt);
        if ($leaf === '.' || $leaf === '..' || $leaf === '') {
            throw new \InvalidArgumentException('Receipt must name one file.');
        }
        $this->receipt = $parent . '/' . $leaf;
        $this->directory = $this->receipt . '.d';
        $this->request = $request;
        $this->requestHash = hash('sha256', $requestBytes);
        if (is_link($this->receipt) || is_link($this->directory)) {
            throw new \InvalidArgumentException('Receipt custody cannot be a symbolic link.');
        }
        if (!is_dir($this->directory) && !mkdir($this->directory, 0700)) {
            throw new \RuntimeException('Cannot create the private receipt custody directory.');
        }
        $this->lock = fopen($this->directory . '/lock', 'c+b');
        if ($this->lock === false || !flock($this->lock, LOCK_EX | LOCK_NB)) {
            throw new \RuntimeException('The original receipt is active in another process.');
        }
        chmod($this->directory, 0700);
        chmod($this->directory . '/lock', 0600);
        $this->syncDirectory(dirname($this->directory));
        $this->immutable($this->directory . '/request.json', $requestBytes);
        // Read the first journal format without discarding an interrupted tail.
        // New events are individually atomic files, so a killed append cannot
        // prevent recovery of an already received native workflow.
        $eventFile = $this->directory . '/native-http.ndjson';
        $events = [];
        if (is_file($eventFile)) {
            if (is_link($eventFile)) {
                throw new \RuntimeException('Original HTTP journal cannot be a symbolic link.');
            }
            $bytes = file_get_contents($eventFile);
            if ($bytes === false) {
                throw new \RuntimeException('Cannot read original native HTTP journal.');
            }
            $lastNewline = strrpos($bytes, "\n");
            $complete = $lastNewline === false ? '' : substr($bytes, 0, $lastNewline + 1);
            $tail = substr($bytes, strlen($complete));
            if ($tail !== '') {
                $this->immutable($this->directory . '/http-journal-tail-'
                    . hash('sha256', $tail) . '.bytes', $tail);
            }
            foreach (explode("\n", $complete) as $line) {
                if ($line === '') {
                    continue;
                }
                $event = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
                $this->collectEvent($events, $event);
            }
        }
        foreach (scandir($this->directory) as $name) {
            if (!preg_match('/^event-[0-9]{6,}-(request|response|transport_error)\.json$/D', $name)) {
                continue;
            }
            $path = $this->directory . '/' . $name;
            if (is_link($path) || !is_file($path)) {
                throw new \RuntimeException('Native event custody must be an ordinary file.');
            }
            $this->collectEvent($events, json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR));
        }
        $this->events = array_values($events);
        $order = ['request' => 0, 'response' => 1, 'transport_error' => 2];
        usort($this->events, fn($a, $b) =>
            [$a['sequence'], $order[$a['event']]] <=> [$b['sequence'], $order[$b['event']]]);
        $this->dispatched = is_file($this->directory . '/dispatch.json');
    }

    public function __destruct()
    {
        if (is_resource($this->lock)) {
            flock($this->lock, LOCK_UN);
            fclose($this->lock);
        }
    }

    public static function json(mixed $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES
            | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS
            | JSON_PRESERVE_ZERO_FRACTION) . "\n";
    }

    public static function now(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))
            ->format('Y-m-d\TH:i:s.u\Z');
    }

    public function base(): array
    {
        return [
            'schema' => self::SCHEMA,
            'bridge_version' => '1.0.0',
            'operation_id' => $this->request['operation_id'],
            'step_id' => $this->request['step_id'],
            'intent_sha256' => $this->request['intent_sha256'],
            'request_sha256' => $this->requestHash,
            'action' => $this->request['action'],
            'target' => [
                'site_id' => $this->request['site_id'],
                'environment_id' => $this->request['environment_id'],
                'resource_id' => $this->request['site_id'] . '.' . $this->request['environment_id'],
                'source_environment_id' => $this->request['source_environment_id'] ?? null,
            ],
            'request' => $this->request,
            'dispatched' => $this->dispatched,
            'workflow' => null,
            'data' => null,
            'error' => null,
            'native_http' => $this->httpSummary(),
            'receipt_path' => $this->receipt,
            'custody_directory' => $this->directory,
        ];
    }

    /**
     * Recover original custody before authentication or any new native request.
     * The callback builds an original Workflow model from its retained response.
     */
    public function recovered(?callable $snapshot = null, array $runtime = []): ?array
    {
        if (is_file($this->receipt)) {
            return $this->readBound($this->receipt);
        }
        $workflowFile = $this->directory . '/workflow.json';
        if (is_file($workflowFile)) {
            $prior = $this->readBound($workflowFile);
            $prior['recovery'] = 'original_workflow_sidecar';
            return $this->finish($prior);
        }
        if (!$this->dispatched) {
            return null;
        }
        $dispatch = $this->readBound($this->directory . '/dispatch.json');
        $native = $this->retainedDispatchResponse($dispatch['native_dispatch']);
        if ($native !== null && $native['status'] >= 200 && $native['status'] < 300
            && $snapshot !== null) {
            $attributes = json_decode($native['body'], false, 512, JSON_THROW_ON_ERROR);
            if (is_object($attributes) && isset($attributes->id)
                && is_string($attributes->id)
                && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/Di', $attributes->id)) {
                $workflow = $snapshot($attributes, $dispatch['native_dispatch']);
                $result = $this->workflow($workflow, [
                    'recovered_native_response_sequence' => $native['sequence'],
                    'native_dispatch' => $dispatch['native_dispatch'],
                ], $runtime);
                $result['recovery'] = 'original_native_http_response';
                return $this->finish($result);
            }
        }
        $rejected = $native !== null
            && in_array($native['status'], [400, 401, 403, 404, 405, 409, 410, 422], true);
        return $this->finish(array_replace($this->base(), [
            'ok' => false, 'state' => $rejected ? 'rejected' : 'uncertain',
            'runtime' => $runtime,
            'recovery' => 'original_dispatch_without_completed_workflow',
            'native_dispatch' => $dispatch['native_dispatch'],
            'native_status' => $native['status'] ?? null,
            'error' => [
                'code' => $rejected ? 'NATIVE_WORKFLOW_REJECTED' : 'ORIGINAL_DISPATCH_UNSETTLED',
                'message' => $rejected
                    ? 'The retained native response rejected this workflow request.'
                    : 'Continue the original operation with its retained native workflow identity.',
            ],
        ]));
    }

    private function retainedDispatchResponse(array $dispatch): ?array
    {
        $request = null;
        foreach ($this->events as $event) {
            if ($event['event'] === 'request' && $event['method'] === 'POST') {
                $path = parse_url($event['uri'], PHP_URL_PATH);
                $body = base64_decode($event['body_base64'] ?? '', true);
                if ($body === false || strlen($body) !== $event['body_bytes']
                    || !hash_equals($event['body_sha256'], hash('sha256', $body))) {
                    throw new \RuntimeException('The original native request body differs.');
                }
                $form = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
                if ($path === '/api/' . $dispatch['path']
                    && $form == $dispatch['form_params']) {
                    if ($request !== null) {
                        throw new \RuntimeException('More than one native workflow dispatch is retained.');
                    }
                    $request = $event;
                }
            }
        }
        if ($request === null) {
            return null;
        }
        foreach ($this->events as $event) {
            if ($event['event'] !== 'response' || $event['sequence'] !== $request['sequence']) {
                continue;
            }
            if (array_key_exists('body_base64', $event)) {
                $body = base64_decode($event['body_base64'], true);
            } else {
                $path = $this->directory . '/' . sprintf('http-%06d.body', $event['sequence']);
                if (is_link($path) || !is_file($path)) {
                    throw new \RuntimeException('Original native response body is missing.');
                }
                $body = file_get_contents($path);
            }
            if ($body === false || strlen($body) !== $event['body_bytes']
                || !hash_equals($event['body_sha256'], hash('sha256', $body))) {
                throw new \RuntimeException('The original native response body differs.');
            }
            return ['sequence' => $event['sequence'], 'status' => $event['status'], 'body' => $body];
        }
        return null;
    }

    public function start(array $runtime): void
    {
        $path = $this->directory . '/started.json';
        if (is_file($path)) {
            $this->readBound($path);
            return;
        }
        $this->immutable($path, self::json(array_replace($this->base(), [
            'state' => 'prepared', 'runtime' => $runtime, 'started_at' => self::now(),
        ])));
    }

    public function allowWorkflow(string $path, string $type): void
    {
        $this->nativePath = $path;
        $this->nativeType = $type;
    }

    public function beforeNative(string $method, string $path, array $options): void
    {
        $prefix = 'sites/' . $this->request['site_id'];
        if ($path !== $prefix && !str_starts_with($path, $prefix . '/')) {
            throw new \LogicException('The native model request left the selected original site.');
        }
        if ($method !== 'GET' && $method !== 'POST') {
            throw new \LogicException('The bridge does not expose this native HTTP method.');
        }
        if ($method === 'POST') {
            $locator = $this->request['action'] === 'pantheon-backup-download'
                && preg_match('~/backups/catalog/[^/]+/(code|database|files)/s3token$~D', $path)
                && ($options['form_params']['method'] ?? null) === 'get';
            if (!$locator) {
                if ($this->nativePath === null || $path !== $this->nativePath
                    || ($options['form_params']['type'] ?? null) !== $this->nativeType) {
                    throw new \LogicException('The native workflow differs from the selected model action.');
                }
                if ($this->dispatched) {
                    throw new \LogicException('The original workflow already has a dispatch record.');
                }
                $native = ['method' => $method, 'path' => $path,
                    'form_params' => $options['form_params'] ?? null];
                $this->immutable($this->directory . '/dispatch.json', self::json(
                    array_replace($this->base(), ['state' => 'dispatching', 'dispatched' => true,
                        'dispatched_at' => self::now(), 'native_dispatch' => $native])
                ));
                $this->dispatched = true;
            }
        }
    }

    public function beginHttp(object $request): int
    {
        $sequence = ++$this->sequence;
        $body = (string)$request->getBody();
        $this->event([
            'event' => 'request', 'sequence' => $sequence, 'at' => self::now(),
            'method' => $request->getMethod(), 'uri' => (string)$request->getUri(),
            'headers' => self::safeHeaders($request->getHeaders()),
            'body_base64' => base64_encode($body), 'body_bytes' => strlen($body),
            'body_sha256' => hash('sha256', $body),
        ]);
        return $sequence;
    }

    public function response(int $sequence, object $response, string $body): void
    {
        // One atomic response envelope retains status and every original byte
        // before the native parser sees it. Receipts reference this one copy.
        $this->event([
            'event' => 'response', 'sequence' => $sequence, 'at' => self::now(),
            'status' => $response->getStatusCode(),
            'reason' => $response->getReasonPhrase(),
            'headers' => self::safeHeaders($response->getHeaders()),
            'protocol_version' => $response->getProtocolVersion(),
            'body_bytes' => strlen($body), 'body_encoding' => 'base64',
            'body_sha256' => hash('sha256', $body), 'body_complete' => true,
            'body_base64' => base64_encode($body),
        ]);
    }

    public function transportError(int $sequence, mixed $error): void
    {
        $this->event(['event' => 'transport_error', 'sequence' => $sequence,
            'at' => self::now(), 'error_class' => is_object($error) ? get_class($error) : gettype($error),
            'error_code' => $error instanceof \Throwable ? (string)$error->getCode() : null]);
    }

    public function workflow(array $workflow, array $data, array $runtime): array
    {
        $state = $workflow['finished']
            ? ($workflow['successful'] ? 'completed' : 'failed') : 'submitted';
        $result = array_replace($this->base(), [
            'ok' => $state !== 'failed', 'state' => $state, 'workflow' => $workflow,
            'data' => $data, 'runtime' => $runtime, 'received_at' => self::now(),
        ]);
        $this->immutable($this->directory . '/workflow.json', self::json($result));
        return $result;
    }

    public function finish(array $result): array
    {
        $result['native_http'] = $this->httpSummary();
        $result['dispatched'] = $this->dispatched;
        $result['completed_at'] = $result['completed_at'] ?? self::now();
        $result['artifacts'] = [];
        foreach (scandir($this->directory) as $name) {
            if ($name === '.' || $name === '..' || $name === 'lock' || str_starts_with($name, '.tmp-')) {
                continue;
            }
            $path = $this->directory . '/' . $name;
            if (!is_file($path) || is_link($path)) {
                throw new \RuntimeException('Unexpected file in original receipt custody.');
            }
            $result['artifacts'][] = ['path' => $path, 'bytes' => filesize($path),
                'sha256' => hash_file('sha256', $path), 'role' => 'pantheon_native_receipt'];
        }
        $this->immutable($this->receipt, self::json($result));
        return $result;
    }

    public function wasDispatched(): bool
    {
        return $this->dispatched;
    }

    public function workflowSidecar(): ?array
    {
        $path = $this->directory . '/workflow.json';
        return is_file($path) ? $this->readBound($path) : null;
    }

    private function readBound(string $path): array
    {
        if (is_link($path)) {
            throw new \RuntimeException('Original receipt cannot be a symbolic link.');
        }
        $value = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($value) || ($value['request_sha256'] ?? null) !== $this->requestHash
            || ($value['operation_id'] ?? null) !== $this->request['operation_id']
            || ($value['step_id'] ?? null) !== $this->request['step_id']
            || ($value['intent_sha256'] ?? null) !== $this->request['intent_sha256']) {
            throw new \RuntimeException('The receipt belongs to different original request bytes or operation.');
        }
        return $value;
    }

    private static function safeHeaders(array $headers): array
    {
        $out = [];
        foreach ($headers as $name => $value) {
            if (!in_array(strtolower($name), ['authorization', 'proxy-authorization',
                'cookie', 'set-cookie', 'x-auth-token', 'x-api-key'], true)) {
                $out[$name] = $value;
            }
        }
        return $out;
    }

    /** Receipts refer to each original event; full native bodies stay in one file. */
    private function httpSummary(): array
    {
        $rows = [];
        foreach ($this->events as $event) {
            $row = $event;
            unset($row['body_base64']);
            $path = $this->directory . '/' . sprintf('event-%06d-%s.json',
                $event['sequence'], $event['event']);
            if (is_file($path)) {
                $row['event_path'] = $path;
                $row['event_bytes'] = filesize($path);
                $row['event_sha256'] = hash_file('sha256', $path);
            } else {
                $row['journal_path'] = $this->directory . '/native-http.ndjson';
            }
            $rows[] = $row;
        }
        return $rows;
    }

    private function collectEvent(array &$events, mixed $event): void
    {
        if (!is_array($event) || !is_int($event['sequence'] ?? null)
            || $event['sequence'] < 1
            || !in_array($event['event'] ?? null, ['request', 'response', 'transport_error'], true)) {
            throw new \RuntimeException('The retained native HTTP event is malformed.');
        }
        $key = $event['sequence'] . ':' . $event['event'];
        if (isset($events[$key]) && self::json($events[$key]) !== self::json($event)) {
            throw new \RuntimeException('Two different original native HTTP events share one identity.');
        }
        $events[$key] = $event;
        $this->sequence = max($this->sequence, $event['sequence']);
    }

    private function event(array $event): void
    {
        $path = $this->directory . '/' . sprintf('event-%06d-%s.json',
            $event['sequence'], $event['event']);
        $this->immutable($path, self::json($event));
        $this->events[] = $event;
    }

    private function syncDirectory(string $path): void
    {
        $directory = fopen($path, 'r');
        if ($directory === false) {
            throw new \RuntimeException('Cannot open original custody directory for synchronization.');
        }
        try {
            if (!fsync($directory)) {
                throw new \RuntimeException('Cannot synchronize original custody directory.');
            }
        } finally {
            fclose($directory);
        }
    }

    private function immutable(string $path, string $bytes): void
    {
        if (file_exists($path) || is_link($path)) {
            if (is_link($path) || !is_file($path)
                || !hash_equals(hash('sha256', $bytes), hash_file('sha256', $path))) {
                throw new \RuntimeException('An original immutable receipt file differs: ' . basename($path));
            }
            return;
        }
        $temporary = dirname($path) . '/.tmp-' . bin2hex(random_bytes(12));
        $file = fopen($temporary, 'xb');
        if ($file === false) {
            throw new \RuntimeException('Cannot prepare the original receipt file.');
        }
        chmod($temporary, 0600);
        try {
            $this->writeAll($file, $bytes);
        } finally {
            fclose($file);
        }
        if (!link($temporary, $path)) {
            unlink($temporary);
            throw new \RuntimeException('Cannot publish the original immutable receipt file.');
        }
        unlink($temporary);
        $this->syncDirectory(dirname($path));
    }

    private function writeAll($file, string $bytes): void
    {
        $offset = 0;
        while ($offset < strlen($bytes)) {
            $written = fwrite($file, substr($bytes, $offset));
            if ($written === false || $written === 0) {
                throw new \RuntimeException('The native receipt write was incomplete.');
            }
            $offset += $written;
        }
        if (!fflush($file) || !fsync($file)) {
            throw new \RuntimeException('Cannot synchronize the original native receipt bytes.');
        }
    }
}
