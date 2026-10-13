<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
namespace Tjl\CatalogueWorkspace\Source;

use Akeneo\Pim\ApiClient\AkeneoPimClientInterface;
use Akeneo\Pim\ApiClient\Exception\HttpException;
use Tjl\CatalogueWorkspace\Store;

/** Full selected Akeneo graph and native importer source/media boundary. */
final class SourceGateway
{
    private ?array $active = null;
    private const APIS = [
        'product' => 'getProductApi', 'product_model' => 'getProductModelApi',
        'family' => 'getFamilyApi', 'family_variant' => 'getFamilyVariantApi',
        'attribute' => 'getAttributeApi', 'attribute_option' => 'getAttributeOptionApi',
        'category' => 'getCategoryApi', 'channel' => 'getChannelApi', 'locale' => 'getLocaleApi',
        'media' => 'getProductMediaFileApi', 'measurement_family' => 'getMeasurementFamilyApi',
        'association_type' => 'getAssociationTypeApi',
    ];

    public function __construct(
        private Store $store,
        private PrivateJournal $journal,
        private SourceContext $context,
        private MediaJournal $media,
        private AkeneoPimClientInterface $client,
    ) {}

    public function inspect(string $captureId): array
    {
        $state = $this->journal->read('capture', $captureId);
        if (!$state) { throw new \RuntimeException('Original source capture does not exist.'); }
        return $state['snapshot'] ?? [
            'schema' => 'tjl.catalogue.source-snapshot.v1', 'id' => $captureId,
            'project_id' => $state['project_id'], 'state' => $state['state'],
            'selection' => $state['selection'], 'sources' => $this->context->sources($captureId),
        ];
    }

    public function operation(string $operationId): ?array
    {
        $operation = $this->journal->read('apply', $operationId);
        if ($operation) { $operation['media'] = $this->media->inspect($operationId); }
        return $operation;
    }

    /** Every complete original journal and its raw/media/preimage objects, using the Store blob ABI. */
    public function exportProject(string $projectId): array
    {
        return $this->journal->lock('native-source-media', function () use ($projectId): array {
            $result = [];
            $visit = function (mixed $value) use (&$visit, &$result): void {
                if (!is_array($value)) { return; }
                if (isset($value['sha256'], $value['bytes'], $value['path']) && $value['path'] === 'blobs/' . $value['sha256']) {
                    $this->store->blobPath($value);
                    $result[$value['path']] = ['path' => $value['path'], 'blob' => $value];
                }
                foreach ($value as $child) { if (is_array($child)) { $visit($child); } }
            };
            foreach ($this->journal->exportProject($projectId) as $path => $row) {
                $visit($row['value']);
                $result[$path] = ['path' => $path, 'blob' => $this->store->blob($row['bytes'])];
            }
            ksort($result);
            return array_values($result);
        });
    }

    public function importProject(string $projectId, array $files): void
    {
        $this->journal->lock('native-source-media', function () use ($projectId, $files): void {
            $seen = [];
            foreach ($files as $file) {
                if (!is_array($file) || !is_string($file['path'] ?? null) || isset($seen[$file['path']])) {
                    throw new \RuntimeException('Source project packet repeats or omits a native member.');
                }
                $seen[$file['path']] = true;
                $this->store->blobPath($file['blob']);
                if (str_starts_with($file['path'], 'blobs/')) {
                    if ($file['path'] !== $file['blob']['path']) { throw new \RuntimeException('Original blob path differs.'); }
                } elseif (!preg_match('~^source/[a-z][a-z0-9_-]*-[a-f0-9]{64}[.]json$~D', $file['path'])) {
                    throw new \RuntimeException('Source packet has an invalid private journal path.');
                }
            }
            // All original object bytes were verified before any journal is received.
            foreach ($files as $file) {
                if (str_starts_with($file['path'], 'source/')) {
                    $this->journal->importMember($projectId, $file['path'], $this->store->readBlob($file['blob']));
                }
            }
        });
    }

    private function apiCall(array $call): array
    {
        $api = $call['api'] ?? null;
        $method = $call['method'] ?? 'get';
        $args = $call['arguments'] ?? [];
        if (!isset(self::APIS[$api]) || !in_array($method, ['get', 'all', 'download'], true)
            || !is_array($args) || !array_is_list($args)
            || ($method === 'download' && $api !== 'media')) {
            throw new \InvalidArgumentException('Use an explicit original read-only Akeneo API descriptor.');
        }
        $getter = self::APIS[$api];
        $native = $this->client->$getter();
        if (!method_exists($native, $method)) { throw new \InvalidArgumentException('This installed native API has no selected read method.'); }
        try {
            $value = $native->$method(...$args);
            if ($method === 'download') {
                // SourceContext already retained the complete original stream before returning it.
                $value = ['status' => $value->getStatusCode()];
            } elseif ($value instanceof \Traversable) {
                $rows = [];
                foreach ($value as $row) { $rows[] = $row; }
                $value = $rows;
            }
            if (!is_array($value)) { throw new \RuntimeException('Unexpected original Akeneo response shape.'); }
            return ['state' => 'PRESENT', 'data' => $value];
        } catch (HttpException $e) {
            if ($e->getResponse()->getStatusCode() !== 404) { throw $e; }
            return ['state' => 'MISSING', 'data' => null];
        }
    }

    public function capture(string $projectId, string $captureId, array $selection): array
    {
        $ids = $selection['identifiers'] ?? null;
        if ($projectId === '' || $captureId === '' || !is_array($ids) || !array_is_list($ids)
            || !$ids || count($ids) > 10000 || count(array_unique($ids, SORT_STRING)) !== count($ids)) {
            throw new \InvalidArgumentException('Select an explicit unique original product identifier cohort.');
        }
        foreach ($ids as $id) {
            if (!is_string($id) || $id === '' || str_contains($id, "\0")) { throw new \InvalidArgumentException('Invalid native product identifier.'); }
        }
        return $this->journal->lock('source-capture:' . $captureId, function () use ($projectId, $captureId, $selection, $ids): array {
            $state = $this->journal->read('capture', $captureId);
            $binding = ['project_id' => $projectId, 'selection' => $selection, 'authority' => $this->context->baseUrl()];
            if ($state && $state['binding'] !== $binding) { throw new \RuntimeException('Capture ID already belongs to another original selection.'); }
            if (($state['state'] ?? null) === 'COMPLETE') { return $state['snapshot']; }
            $state ??= ['schema' => 'tjl.catalogue.capture-journal.v1', 'id' => $captureId,
                'project_id' => $projectId, 'selection' => $selection, 'binding' => $binding,
                'state' => 'PREPARED', 'created_at' => PrivateJournal::now(), 'calls' => []];
            $state['state'] = 'CAPTURING';
            $this->journal->write('capture', $captureId, $state);
            try {
                $result = $this->context->run('capture', $projectId, $captureId, [], function () use (&$state, $captureId, $ids, $selection): array {
                    $calls = []; $values = []; $graph = ['models' => [], 'families' => [], 'family_variants' => [], 'attributes' => [], 'options' => [], 'media' => [], 'categories' => [], 'channels' => [], 'locales' => []];
                    $read = function (string $api, array $arguments, string $method = 'get') use (&$calls, &$values, &$state, $captureId): array {
                        $call = compact('api', 'method', 'arguments');
                        $id = PrivateJournal::hash($call);
                        if (isset($values[$id])) { return $values[$id]; }
                        $calls[$id] = $call;
                        $state['calls'] = array_values($calls);
                        $this->journal->write('capture', $captureId, $state);
                        return $values[$id] = $this->apiCall($call);
                    };
                    $attributes = []; $valueSets = []; $modelSeen = []; $familySeen = []; $categorySeen = [];
                    $family = function (?string $code) use (&$familySeen, &$attributes, &$graph, $read): void {
                        if (!$code || isset($familySeen[$code])) { return; }
                        $familySeen[$code] = true;
                        $row = $read('family', [$code]); $graph['families'][$code] = $row;
                        foreach ($row['data']['attributes'] ?? [] as $a) { $attributes[(string) $a] = true; }
                    };
                    $model = function (string $code) use (&$model, &$modelSeen, &$attributes, &$valueSets, &$graph, $read, $family): void {
                        if (isset($modelSeen[$code])) { return; }
                        $modelSeen[$code] = true;
                        $row = $read('product_model', [$code]); $graph['models'][$code] = $row;
                        if ($row['state'] !== 'PRESENT') { return; }
                        $data = $row['data'];
                        $family($data['family'] ?? null);
                        if (!empty($data['family']) && !empty($data['family_variant'])) {
                            $variant = $read('family_variant', [$data['family'], $data['family_variant']]);
                            $graph['family_variants'][$data['family'] . '/' . $data['family_variant']] = $variant;
                            foreach ($variant['data']['variant_attribute_sets'] ?? [] as $set) {
                                foreach (array_merge($set['attributes'] ?? [], $set['axes'] ?? []) as $a) { $attributes[(string) $a] = true; }
                            }
                        }
                        foreach ($data['values'] ?? [] as $a => $rows) {
                            $attributes[$a] = true; $valueSets[$a] = array_merge($valueSets[$a] ?? [], $rows);
                        }
                        if (!empty($data['parent'])) { $model($data['parent']); }
                    };
                    $category = function (string $code) use (&$category, &$categorySeen, &$graph, $read): void {
                        if (isset($categorySeen[$code])) { return; }
                        $categorySeen[$code] = true;
                        $row = $read('category', [$code]); $graph['categories'][$code] = $row;
                        if (!empty($row['data']['parent'])) { $category($row['data']['parent']); }
                    };
                    $products = [];
                    foreach ($ids as $identifier) {
                        $row = $read('product', [$identifier]);
                        $products[$identifier] = $row;
                        if ($row['state'] !== 'PRESENT') { continue; }
                        $data = $row['data'];
                        $family($data['family'] ?? null);
                        if (!empty($data['parent'])) { $model($data['parent']); }
                        foreach ($data['categories'] ?? [] as $code) { $category((string) $code); }
                        foreach ($data['values'] ?? [] as $a => $rows) {
                            $attributes[$a] = true; $valueSets[$a] = array_merge($valueSets[$a] ?? [], $rows);
                        }
                    }
                    foreach (array_keys($attributes) as $attribute) {
                        $row = $read('attribute', [$attribute]); $graph['attributes'][$attribute] = $row;
                        $type = $row['data']['type'] ?? '';
                        if (in_array($type, ['pim_catalog_simpleselect', 'pim_catalog_multiselect'], true)) {
                            // Original plugin ProductAttributeHelperTrait uses all(attribute) with native default page size 10.
                            $graph['options'][$attribute] = $read('attribute_option', [$attribute], 'all');
                        }
                        foreach ($valueSets[$attribute] ?? [] as $value) {
                            if (!empty($value['locale'])) { $graph['locales'][$value['locale']] = $read('locale', [$value['locale']]); }
                            if (!empty($value['scope'])) { $graph['channels'][$value['scope']] = $read('channel', [$value['scope']]); }
                            $data = $value['data'] ?? null;
                            if (in_array($type, ['pim_catalog_image', 'pim_catalog_file'], true) && is_string($data) && $data !== '') {
                                $graph['media'][$data] = ['metadata' => $read('media', [$data]), 'download' => $read('media', [$data], 'download')];
                            } elseif (in_array($type, ['pim_catalog_simpleselect', 'pim_catalog_multiselect'], true)) {
                                foreach (is_array($data) ? $data : [$data] as $option) {
                                    if (is_string($option) && $option !== '') { $read('attribute_option', [$attribute, $option]); }
                                }
                            }
                        }
                    }
                    foreach ($selection['additional_requests'] ?? [] as $call) {
                        if (!is_array($call)) { throw new \InvalidArgumentException('Invalid additional native request descriptor.'); }
                        $read($call['api'] ?? '', $call['arguments'] ?? [], $call['method'] ?? 'get');
                    }
                    return ['products' => $products, 'graph' => $graph, 'calls' => array_values($calls)];
                });
                $sources = $this->context->sources($captureId);
                foreach ($sources as $source) {
                    if ($source['state'] !== 'COMPLETE' || !(($source['status'] >= 200 && $source['status'] < 300) || $source['status'] === 404)) {
                        throw new \RuntimeException('Original source graph contains an incomplete or failed native response.');
                    }
                }
                if (!$sources) { throw new \RuntimeException('Native client is not connected to the retained HTTP transport.'); }
                $sourceIds = array_column($sources, 'id');
                foreach ($result['products'] as &$product) { $product['source_ids'] = $sourceIds; }
                unset($product);
                $snapshot = ['schema' => 'tjl.catalogue.source-snapshot.v1', 'state' => 'COMPLETE',
                    'id' => $captureId, 'project_id' => $projectId, 'selection' => $selection,
                    'authority' => $this->context->baseUrl(), 'products' => $result['products'], 'graph' => $result['graph'],
                    'calls' => $result['calls'], 'requests' => array_column($sources, 'request'), 'sources' => $sources,
                    'created_at' => $state['created_at'], 'completed_at' => PrivateJournal::now()];
                $snapshot['sha256'] = PrivateJournal::hash($snapshot);
                $state['state'] = 'COMPLETE'; $state['snapshot'] = $snapshot;
                $this->journal->write('capture', $captureId, $state);
                return $snapshot;
            } catch (\Throwable $e) {
                $state['state'] = 'ATTENTION'; $state['error_type'] = get_class($e);
                $state['failed_at'] = PrivateJournal::now();
                $this->journal->write('capture', $captureId, $state);
                throw $e;
            }
        });
    }

    private function committed(string $projectId, string $operationId): bool
    {
        $record = $this->store->object('import', $operationId);
        if ($record && ($record['_record']['project_id'] ?? $record['project_id'] ?? null) !== $projectId) {
            throw new \RuntimeException('Native import operation belongs to another project.');
        }
        return $record && in_array($record['state'] ?? '', ['APPLIED', 'COMPLETE'], true);
    }

    public function withApproved(string $projectId, string $operationId, array $snapshot, callable $call): mixed
    {
        $unsigned = $snapshot; unset($unsigned['sha256']);
        if (($snapshot['schema'] ?? '') !== 'tjl.catalogue.source-snapshot.v1' || ($snapshot['state'] ?? '') !== 'COMPLETE'
            || ($snapshot['project_id'] ?? null) !== $projectId || ($snapshot['authority'] ?? null) !== $this->context->baseUrl()
            || !hash_equals((string) ($snapshot['sha256'] ?? ''), PrivateJournal::hash($unsigned))) {
            throw new \RuntimeException('Use the complete original approved source snapshot.');
        }
        if ($this->active !== null) {
            if ($this->active !== [$projectId, $operationId, $snapshot['sha256']]) {
                throw new \RuntimeException('A different import cannot enter this native source transaction.');
            }
            return $call();
        }
        if ($this->store->connection()->isTransactionActive()) {
            throw new \RuntimeException('Place the approved source gateway outside the outermost native Doctrine transaction.');
        }
        return $this->journal->lock('native-source-media', function () use ($projectId, $operationId, $snapshot, $call): mixed {
            $binding = ['project_id' => $projectId, 'operation_id' => $operationId, 'snapshot_id' => $snapshot['id'], 'source_sha256' => $snapshot['sha256']];
            $operation = $this->journal->read('apply', $operationId);
            if ($operation && $operation['binding'] !== $binding) { throw new \RuntimeException('Native operation source selection changed.'); }
            $operation ??= ['schema' => 'tjl.catalogue.source-operation.v1', 'binding' => $binding,
                            'state' => 'PREPARED', 'checks' => [], 'created_at' => PrivateJournal::now()];
            $approved = [];
            foreach ($snapshot['sources'] as $source) {
                if (isset($approved[$source['id']]) || $source['id'] !== PrivateJournal::hash($source['request'])) {
                    throw new \RuntimeException('Approved native source request identities are invalid.');
                }
                $this->store->blobPath($source['body']);
                $approved[$source['id']] = $source;
            }
            $committed = $this->committed($projectId, $operationId);
            if (!$committed) {
                $checkId = $operationId . ':check:' . count($operation['checks']);
                $operation['state'] = 'CHECKING';
                $operation['checks'][] = ['id' => $checkId, 'state' => 'REQUESTING', 'at' => PrivateJournal::now()];
                $this->journal->write('apply', $operationId, $operation);
                try {
                    $this->context->run('check', $projectId, $checkId, [], function () use ($snapshot): void {
                        foreach ($snapshot['calls'] as $request) { $this->apiCall($request); }
                    });
                    $current = [];
                    foreach ($this->context->sources($checkId) as $source) { $current[$source['id']] = $source; }
                    if (array_diff_key($approved, $current) || array_diff_key($current, $approved)) {
                        throw new \RuntimeException('Native source dependency set changed; capture and review a following edition.');
                    }
                    foreach ($approved as $id => $old) {
                        $now = $current[$id];
                        if ($now['state'] !== 'COMPLETE' || $old['request'] !== $now['request'] || $old['status'] !== $now['status']
                            || $old['body']['sha256'] !== $now['body']['sha256'] || $old['body']['bytes'] !== $now['body']['bytes']) {
                            throw new \RuntimeException('Native source changed before import; retain both editions and review the following capture.');
                        }
                    }
                    $operation['checks'][array_key_last($operation['checks'])]['state'] = 'MATCHED';
                } catch (\Throwable $e) {
                    $operation['state'] = 'SOURCE_ATTENTION'; $operation['error_type'] = get_class($e);
                    $this->journal->write('apply', $operationId, $operation);
                    throw $e;
                }
            }
            $this->media->begin($projectId, $operationId, $snapshot['sha256'], $committed);
            $this->active = [$projectId, $operationId, $snapshot['sha256']];
            try {
                if ($committed) { $this->media->commit(); }
                $operation['state'] = $committed ? 'RECEIPT_RECOVERY' : 'IMPORTING';
                $this->journal->write('apply', $operationId, $operation);
                // The caller wraps the ENTIRE original result/Doctrine middleware chain.
                $result = $this->context->run('replay', $projectId, $operationId, $approved, $call);
                if ($this->store->connection()->isTransactionActive()) {
                    throw new \RuntimeException('Original native transaction has not completed; media remains staged.');
                }
                if ($this->committed($projectId, $operationId)) {
                    $this->media->commit();
                    $operation['state'] = 'COMPLETE';
                } elseif (!$this->media->hasWrites()) {
                    // Native asynchronous dispatch has queued its original message but not imported it yet.
                    $operation['state'] = 'AWAITING_NATIVE_IMPORT';
                    $this->media->abort();
                } else {
                    $this->media->abort();
                    $operation['state'] = 'NOT_COMMITTED';
                    throw new \RuntimeException('Staged media has no surviving original Doctrine import marker.');
                }
                $operation['ended_at'] = PrivateJournal::now();
                $this->journal->write('apply', $operationId, $operation);
                return $result;
            } catch (\Throwable $e) {
                try {
                    if ($this->store->connection()->isTransactionActive()) { throw new \RuntimeException('Native commit remains pending.'); }
                    $committedNow = $this->committed($projectId, $operationId);
                } catch (\Throwable $commitError) {
                    $operation['state'] = 'COMMIT_UNCERTAIN';
                    $operation['error_type'] = get_class($e);
                    $operation['commit_error_type'] = get_class($commitError);
                    $this->journal->write('apply', $operationId, $operation);
                    throw $e;
                }
                if ($committedNow) {
                    $operation['state'] = 'MEDIA_PENDING';
                    // Preserve the committed source and staged files even if native result persistence failed.
                    try { $this->media->commit(); $operation['state'] = 'NATIVE_RECEIPT_PENDING'; }
                    catch (\Throwable $mediaError) { $operation['media_error_type'] = get_class($mediaError); }
                } else {
                    $this->media->abort();
                    $operation['state'] = 'NOT_COMMITTED';
                }
                $operation['error_type'] = get_class($e);
                $this->journal->write('apply', $operationId, $operation);
                throw $e;
            } finally { $this->active = null; $this->media->end(); }
        });
    }
}
