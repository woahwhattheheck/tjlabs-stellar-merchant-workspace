<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
namespace Tjl\CatalogueWorkspace\Source;

use Http\Discovery\Psr17FactoryDiscovery;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Tjl\CatalogueWorkspace\Store;

/** Owns complete response streams and the exact approved native request map. */
final class SourceContext
{
    private ?array $scope = null;

    public function __construct(
        private Store $store,
        private PrivateJournal $journal,
        private string $baseUrl,
        private int $maxResponseBytes = 1073741824,
        private int $maxRequests = 100000,
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $u = parse_url($this->baseUrl);
        if (!$u || !in_array($u['scheme'] ?? '', ['https', 'http'], true) || empty($u['host'])
            || isset($u['user']) || isset($u['pass']) || isset($u['query']) || isset($u['fragment'])) {
            throw new \InvalidArgumentException('Select the original Akeneo base URL without credentials.');
        }
    }

    public function baseUrl(): string { return $this->baseUrl; }
    public function active(): bool { return $this->scope !== null; }

    public function run(string $mode, string $projectId, string $id, array $approved, callable $call): mixed
    {
        if ($this->scope !== null || !in_array($mode, ['capture', 'check', 'replay'], true)) {
            throw new \LogicException('Source scopes must be explicit and non-overlapping.');
        }
        $this->scope = compact('mode', 'projectId', 'id', 'approved');
        try { return $call(); } finally { $this->scope = null; }
    }

    public function sources(string $captureId): array
    {
        return array_values(($this->journal->read('http', $captureId) ?? [])['requests'] ?? []);
    }

    private function binding(RequestInterface $request): array
    {
        $url = (string) $request->getUri();
        if ($request->getMethod() !== 'GET' || !str_starts_with($url, $this->baseUrl . '/api/rest/')
            || $request->getUri()->getUserInfo() !== '' || $request->getUri()->getFragment() !== ''
            || $request->getBody()->getSize() > 0) {
            throw new \RuntimeException('Only the selected Akeneo read-only REST authority is captured.');
        }
        parse_str($request->getUri()->getQuery(), $query);
        foreach (array_keys($query) as $name) {
            if (preg_match('/token|secret|password|authorization|api.?key/i', (string) $name)) {
                throw new \RuntimeException('Credential parameters do not belong in source requests.');
            }
        }
        $headers = [];
        foreach ($request->getHeaders() as $name => $values) {
            $lower = strtolower($name);
            if (!in_array($lower, ['authorization', 'proxy-authorization', 'cookie', 'host', 'user-agent', 'content-length'], true)) {
                $headers[$lower] = array_values($values);
            }
        }
        ksort($headers);
        return ['method' => 'GET', 'url' => $url, 'headers' => $headers];
    }

    private function response(array $record): ResponseInterface
    {
        $body = $record['body'] ?? null;
        if (!is_array($body) || ($record['state'] ?? '') !== 'COMPLETE') {
            throw new \RuntimeException('The complete original response is unavailable.');
        }
        $path = $this->store->blobPath($body);
        $response = Psr17FactoryDiscovery::findResponseFactory()->createResponse($record['status'], $record['reason'] ?? '');
        foreach ($record['headers'] as $name => $values) { $response = $response->withHeader($name, $values); }
        return $response->withProtocolVersion($record['protocol'] ?? '1.1')
            ->withBody(Psr17FactoryDiscovery::findStreamFactory()->createStreamFromFile($path, 'rb'));
    }

    public function request(RequestInterface $request, callable $native): ResponseInterface
    {
        if ($this->scope === null) { return $native($request); }
        // Authentication remains owned by the original client. Never retain its requests or responses.
        if ($request->getMethod() === 'POST' && (string) $request->getUri() === $this->baseUrl . '/api/oauth/v1/token') {
            return $native($request);
        }
        $request = $request->withHeader('Accept-Encoding', 'identity');
        $binding = $this->binding($request);
        $key = PrivateJournal::hash($binding);
        $scope = $this->scope;
        if ($scope['mode'] === 'replay') {
            $saved = $scope['approved'][$key] ?? null;
            if ($saved === null || $saved['request'] !== $binding) {
                $this->journal->write('missing-dependency', $scope['id'] . ':' . $key,
                    ['schema' => 'tjl.catalogue.missing-source.v1', 'operation_id' => $scope['id'],
                     'project_id' => $scope['projectId'], 'request' => $binding, 'at' => PrivateJournal::now()]);
                throw new \RuntimeException('Unknown source dependency: capture and review this exact GET before importing. Request ' . $key);
            }
            return $this->response($saved);
        }
        $id = $scope['id'];
        $state = $this->journal->read('http', $id) ?? [
            'schema' => 'tjl.catalogue.http-journal.v1', 'id' => $id, 'project_id' => $scope['projectId'],
            'authority' => $this->baseUrl, 'requests' => [], 'attempts' => [],
        ];
        if ($state['project_id'] !== $scope['projectId'] || $state['authority'] !== $this->baseUrl) {
            throw new \RuntimeException('The original source identity/authority changed.');
        }
        $saved = $state['requests'][$key] ?? null;
        if ($scope['mode'] === 'capture' && $saved && $saved['state'] === 'COMPLETE'
            && (($saved['status'] >= 200 && $saved['status'] < 300) || $saved['status'] === 404)) {
            return $this->response($saved);
        }
        if (count($state['requests']) >= $this->maxRequests && !isset($state['requests'][$key])) {
            throw new \RuntimeException('Original capture request limit reached; retain this operation for review.');
        }
        $floor = $this->journal->read('provider-delay', $this->baseUrl);
        if (($floor['not_before'] ?? 0) > time()) {
            throw new \RuntimeException('Native provider Retry-After remains active until ' . gmdate('c', $floor['not_before']));
        }
        $attempt = count($state['attempts']);
        $record = ['id' => $key, 'request' => $binding, 'state' => 'REQUESTING', 'started_at' => PrivateJournal::now()];
        $state['attempts'][] = $record;
        $this->journal->write('http', $id, $state);
        $temporary = $this->store->temporaryPath('.source');
        try {
            $response = $native($request);
            $record['status'] = $response->getStatusCode();
            $record['reason'] = $response->getReasonPhrase();
            $record['protocol'] = $response->getProtocolVersion();
            $record['headers'] = [];
            foreach ($response->getHeaders() as $name => $values) {
                if (!in_array(strtolower($name), ['set-cookie', 'authorization', 'proxy-authorization'], true)) {
                    $record['headers'][$name] = $values;
                }
            }
            $f = fopen($temporary, 'w+b');
            if ($f === false) { throw new \RuntimeException('Cannot retain source response.'); }
            chmod($temporary, 0600);
            $bytes = 0;
            try {
                $stream = $response->getBody();
                if ($stream->isSeekable()) { $stream->rewind(); }
                while (!$stream->eof()) {
                    $chunk = $stream->read(1048576);
                    if ($chunk === '' && !$stream->eof()) { throw new \RuntimeException('Native response stream stopped before EOF.'); }
                    $bytes += strlen($chunk);
                    if ($bytes > $this->maxResponseBytes) { throw new \RuntimeException('Complete source exceeds configured response bound.'); }
                    for ($at = 0; $at < strlen($chunk);) {
                        $n = fwrite($f, substr($chunk, $at));
                        if ($n === false || $n === 0) { throw new \RuntimeException('Incomplete private response write.'); }
                        $at += $n;
                    }
                }
                if (!fflush($f) || !fsync($f)) { throw new \RuntimeException('Cannot flush native source.'); }
            } finally { fclose($f); }
            $record['body'] = $this->store->blobFile($temporary);
            $length = $response->getHeaderLine('Content-Length');
            $encoding = strtolower($response->getHeaderLine('Content-Encoding'));
            if (($encoding !== '' && $encoding !== 'identity')
                || ($length !== '' && (!ctype_digit($length) || (int) $length !== $bytes))) {
                throw new \RuntimeException('Native identity response is encoded or incomplete; original bytes are retained.');
            }
            $record['state'] = 'COMPLETE';
            $record['received_at'] = PrivateJournal::now();
            if (in_array($record['status'], [429, 503], true)) {
                $delay = $response->getHeaderLine('Retry-After');
                $deadline = ctype_digit($delay) ? time() + (int) $delay : (strtotime($delay) ?: 0);
                if ($deadline > time()) {
                    $this->journal->write('provider-delay', $this->baseUrl,
                        ['authority' => $this->baseUrl, 'not_before' => max($deadline, $floor['not_before'] ?? 0), 'source_id' => $key]);
                }
            }
            $state['requests'][$key] = $record;
            $state['attempts'][$attempt] = $record;
            $this->journal->write('http', $id, $state);
            return $this->response($record);
        } catch (\Throwable $error) {
            if (!isset($record['body']) && is_file($temporary)) { $record['body'] = $this->store->blobFile($temporary); }
            $record['state'] = 'ATTENTION';
            // Exception text from an HTTP implementation can include credentials. Keep only its class.
            $record['error_type'] = get_class($error);
            $record['ended_at'] = PrivateJournal::now();
            $state['attempts'][$attempt] = $record;
            $this->journal->write('http', $id, $state);
            throw $error;
        } finally { if (is_file($temporary)) { unlink($temporary); } }
    }
}
