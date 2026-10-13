<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace;

use Symfony\Component\Messenger\Envelope;
use Symfony\Component\Messenger\MessageBusInterface;
use Tjl\CatalogueWorkspace\Import\ImportStamp;
use Tjl\CatalogueWorkspace\Source\SourceGateway;
use Webgriffe\SyliusAkeneoPlugin\Message\ItemImport;

final class Workspace
{
    public function __construct(
        private Store $store,
        private Engine $engine,
        private NativeCatalogue $catalogue,
        private SourceGateway $source,
        private MessageBusInterface $bus,
        private ProjectArchive $archive,
    ) {}

    public function execute(string $action, array $input, string $operationId, string $actor): array
    {
        Support::id($operationId);
        if ($actor === '') { throw new \InvalidArgumentException('The original authenticated native actor is required.'); }
        if ($action === 'install') {
            return $this->envelope($action, $operationId, null, $this->store->install());
        }
        if ($action === 'engine') { return $this->envelope($action, $operationId, null, $this->engine->describe()); }
        $projectId = Support::id(Support::requiredString($input, 'project_id', 128));
        $read = match ($action) {
            'project' => fn () => $this->project($projectId),
            'cohort' => fn () => $this->cohort($projectId, Support::id(Support::requiredString($input, 'capture_id', 128)), (int) ($input['offset'] ?? 0), (int) ($input['limit'] ?? 50)),
            'operation' => fn () => $this->operation($projectId, Support::id(Support::requiredString($input, 'import_operation_id', 128))),
            'files' => fn () => $this->archive->files($projectId),
            default => null,
        };
        if ($read !== null) { return $this->envelope($action, $operationId, $projectId, $read()); }
        return $this->store->lock('project:' . $projectId, function () use ($action, $input, $operationId, $actor, $projectId): array {
            $binding = ['action' => $action, 'input' => $input, 'actor' => $actor, 'project_id' => $projectId];
            $hash = Support::hash($binding);
            $request = $this->store->object('command', $operationId);
            if ($request !== null) {
                if ($request['binding_sha256'] !== $hash || $request['_record']['project_id'] !== $projectId) {
                    throw new \RuntimeException('Continue the exact original action, actor and input for this operation ID.');
                }
                if ($request['state'] === 'COMPLETE') { return $request['result']; }
            } else {
                $request = $this->store->put('command', $operationId, $projectId, [
                    'state' => 'RUNNING', 'binding' => $binding, 'binding_sha256' => $hash, 'created_at' => Support::now(),
                ], null);
            }
            try {
                $result = match ($action) {
                    'project-create' => $this->createProject($input, $request),
                    'capture' => $this->capture($projectId, $input, $request),
                    'review', 'missing-review' => $this->review($projectId, $input, $request, $action === 'missing-review'),
                    'approve' => $this->approve($projectId, $input, $request),
                    'dispatch' => $this->dispatch($projectId, $input, $request, false),
                    'retry' => $this->dispatch($projectId, $input, $request, true),
                    'missing-apply' => $this->disableMissing($projectId, $input, $request),
                    'release-claim' => $this->releaseClaim($projectId, $input),
                    'export' => $this->archive->export($projectId, $operationId, $actor),
                    'receive' => $this->archive->receive($projectId, Support::requiredString($input, 'archive_path'), $operationId, $actor),
                    default => throw new \InvalidArgumentException('Unknown catalogue workspace action.'),
                };
                $envelope = $this->envelope($action, $operationId, $projectId, $result);
                $request = $this->store->require('command', $operationId, $projectId);
                $request['state'] = 'COMPLETE';
                $request['result'] = $envelope;
                $request['completed_at'] = Support::now();
                $this->store->save($request);
                return $envelope;
            } catch (\Throwable $error) {
                $request = $this->store->require('command', $operationId, $projectId);
                $request['state'] = 'ATTENTION';
                $request['error'] = Support::error($error);
                $this->store->save($request);
                throw $error;
            }
        });
    }

    public function project(string $projectId): array
    {
        $project = $this->store->require('project', $projectId, $projectId);
        $result = ['project' => $project, 'cohorts' => [], 'imports' => [], 'live_pending' => []];
        foreach (['cohort' => 'cohorts', 'import' => 'imports', 'live-pending' => 'live_pending'] as $kind => $key) {
            $offset = 0;
            do {
                $page = $this->store->records($kind, $projectId, 500, $offset);
                foreach ($page as $row) {
                    if ($kind === 'import') {
                        $row = $this->operation($projectId, $row['_record']['id']);
                    }
                    $result[$key][] = $row;
                }
                $offset += count($page);
            } while (count($page) === 500);
        }
        return $result;
    }

    public function operation(string $projectId, string $operationId): array
    {
        $operation = $this->store->require('import', $operationId, $projectId);
        $operation['source_operation'] = $this->source->operation($operationId);
        if (($operation['source_operation']['state'] ?? null) === 'MEDIA_PENDING') {
            $operation['display_state'] = 'MEDIA_PENDING';
        } else { $operation['display_state'] = $operation['state']; }
        return $operation;
    }

    private function createProject(array $input, array $request): array
    {
        $projectId = $request['_record']['project_id'];
        $identifiers = Support::strings($input['identifiers'] ?? null, 'identifiers');
        $locales = Support::strings($input['locales'] ?? null, 'locales', 100);
        $channels = Support::strings($input['channels'] ?? null, 'channels', 100);
        if ($identifiers === [] || $locales === [] || $channels === []) {
            throw new \InvalidArgumentException('Select original item identifiers, locales and channels explicitly.');
        }
        $this->catalogue->validateScope($locales, $channels);
        $engine = $this->engine->describe();
        $value = [
            'schema' => 'tjl.catalogue.project.v1', 'id' => $projectId,
            'label' => Support::requiredString($input, 'label', 1000),
            'selection' => ['identifiers' => $identifiers, 'locales' => $locales, 'channels' => $channels],
            'engine' => $engine, 'created_at' => $request['created_at'], 'created_by' => $request['binding']['actor'],
            'original_operation_id' => $request['_record']['id'],
            'live_import_policy' => 'Explicitly selected identifiers require a workspace approval stamp while their claim is active.',
        ];
        return $this->store->atomic(function () use ($value, $identifiers, $projectId): array {
            $project = $this->store->original('project', $projectId, $projectId, $value);
            foreach ($identifiers as $identifier) {
                $id = Support::hash($identifier);
                $claim = $this->store->object('claim', $id);
                if ($claim !== null && ($claim['active'] ?? false) && $claim['_record']['project_id'] !== $projectId) {
                    throw new \RuntimeException('An original project already owns review of identifier ' . $identifier);
                }
                if ($claim !== null && $claim['_record']['project_id'] !== $projectId) {
                    throw new \RuntimeException('This identifier has retained original project history; continue that project or explicitly transfer its custody.');
                }
                if ($claim === null) {
                    $this->store->put('claim', $id, $projectId, ['identifier' => $identifier, 'active' => true, 'approval_id' => null], null);
                }
            }
            return $project;
        });
    }

    private function capture(string $projectId, array $input, array $request): array
    {
        $project = $this->store->require('project', $projectId, $projectId);
        $this->engine->assertSame($project['engine']['sha256']);
        $id = Support::id((string) ($input['capture_id'] ?? $request['_record']['id']));
        $selection = ['identifiers' => $project['selection']['identifiers']];
        if (isset($input['additional_requests'])) { $selection['additional_requests'] = $input['additional_requests']; }
        $snapshot = $this->source->capture($projectId, $id, $selection);
        if (($snapshot['state'] ?? null) !== 'COMPLETE') { return $snapshot; }
        $value = [
            'id' => $id, 'project_id' => $projectId, 'source_sha256' => $snapshot['sha256'],
            'selection' => $selection, 'original_operation_id' => $request['_record']['id'],
            'created_at' => $request['created_at'], 'created_by' => $request['binding']['actor'],
            'engine_sha256' => $project['engine']['sha256'], 'state' => 'CAPTURED',
        ];
        $this->store->original('cohort', $id, $projectId, $value);
        return $this->cohort($projectId, $id, 0, 50);
    }

    private function cohort(string $projectId, string $id, int $offset, int $limit): array
    {
        if ($offset < 0 || $limit < 1 || $limit > 500) { throw new \InvalidArgumentException('Select an original cohort page of 1–500 items.'); }
        $project = $this->store->require('project', $projectId, $projectId);
        $cohort = $this->store->require('cohort', $id, $projectId);
        $snapshot = $this->source->inspect($id);
        if (($snapshot['project_id'] ?? null) !== $projectId || ($snapshot['sha256'] ?? null) !== $cohort['source_sha256']) {
            throw new \RuntimeException('The retained source capture differs from its original cohort.');
        }
        $identifiers = $project['selection']['identifiers'];
        $rows = [];
        foreach (array_slice($identifiers, $offset, $limit) as $identifier) {
            $product = $snapshot['products'][$identifier] ?? throw new \RuntimeException('The complete selected source item is absent from its capture.');
            $claim = $this->store->require('claim', Support::hash($identifier), $projectId);
            $rows[] = ['identifier' => $identifier, 'source' => $product, 'claim' => $claim];
        }
        return ['cohort' => $cohort, 'rows' => $rows, 'offset' => $offset, 'total' => count($identifiers),
            'next_offset' => $offset + count($rows) < count($identifiers) ? $offset + count($rows) : null,
            'source_summary' => ['sha256' => $snapshot['sha256'], 'sources' => $snapshot['sources'] ?? [], 'requests' => $snapshot['requests'] ?? []]];
    }

    private function review(string $projectId, array $input, array $request, bool $missing): array
    {
        $existing = $this->store->object('review', $request['_record']['id']);
        if ($existing !== null) { return $existing; }
        $project = $this->store->require('project', $projectId, $projectId);
        $identifier = Support::requiredString($input, 'identifier', 1000);
        if (!in_array($identifier, $project['selection']['identifiers'], true)) { throw new \InvalidArgumentException('Select an original cohort identifier.'); }
        $captureId = Support::id(Support::requiredString($input, 'capture_id', 128));
        $cohort = $this->store->require('cohort', $captureId, $projectId);
        $snapshot = $this->source->inspect($captureId);
        $product = $snapshot['products'][$identifier] ?? throw new \RuntimeException('Selected original source item missing.');
        if (($snapshot['sha256'] ?? null) !== $cohort['source_sha256']) { throw new \RuntimeException('The original source edition changed.'); }
        if ($missing !== (($product['state'] ?? null) === 'MISSING')) {
            throw new \RuntimeException($missing ? 'This selected source item is present.' : 'This selected source item requires bounded missing-record review.');
        }
        if (!in_array($product['state'] ?? null, ['PRESENT', 'MISSING'], true)) { throw new \RuntimeException('The native source result is not a complete present/missing observation.'); }
        $parent = $product['data']['parent'] ?? null;
        if ($parent !== null && !is_string($parent)) { throw new \RuntimeException('The original parent code is invalid.'); }
        $native = $this->catalogue->read($identifier, $parent, $project['selection']['locales']);
        $engine = $this->engine->describe();
        $value = [
            'schema' => 'tjl.catalogue.review.v1', 'id' => $request['_record']['id'], 'project_id' => $projectId,
            'capture_id' => $captureId, 'identifier' => $identifier, 'parent' => $parent,
            'kind' => $missing ? 'MISSING' : 'IMPORT', 'source' => $product, 'source_sha256' => $snapshot['sha256'],
            'native' => $native['snapshot'], 'native_sha256' => $native['sha256'],
            'engine' => $engine, 'engine_sha256' => $engine['sha256'],
            'selection' => $project['selection'], 'created_at' => $request['created_at'], 'created_by' => $request['binding']['actor'],
            'scope_notice' => 'Source-owned fields use the installed native mapping. Existing outside-scope locales/channel prices and stock stay local. A missing API item is an observed access result, not proof of deletion.',
        ];
        $value['sha256'] = Support::hash($value);
        return $this->store->original('review', $value['id'], $projectId, $value);
    }

    private function approve(string $projectId, array $input, array $request): array
    {
        $existing = $this->store->object('approval', $request['_record']['id']);
        if ($existing !== null) { return $existing; }
        $review = $this->store->require('review', Support::id(Support::requiredString($input, 'review_id', 128)), $projectId);
        if ($review['kind'] !== 'IMPORT' || ($input['review_sha256'] ?? null) !== $review['sha256']) {
            throw new \RuntimeException('Approve the exact original import review.');
        }
        if (($input['approve_native_mapping'] ?? false) !== true) { throw new \InvalidArgumentException('Explicitly approve the complete installed native mapping and selected source edition.'); }
        $rules = $this->catalogue->validateRules($review['native'], $input['rules'] ?? [], $review['selection']);
        $this->engine->assertSame($review['engine_sha256']);
        return $this->store->atomic(function () use ($review, $rules, $request, $projectId): array {
            $native = $this->catalogue->read($review['identifier'], $review['parent'], $review['selection']['locales'], true);
            if ($native['sha256'] !== $review['native_sha256']) { throw new \RuntimeException('Native values changed; create and inspect a following review.'); }
            $value = [
                'id' => $request['_record']['id'], 'project_id' => $projectId, 'review_id' => $review['id'], 'review_sha256' => $review['sha256'],
                'capture_id' => $review['capture_id'], 'identifier' => $review['identifier'], 'parent' => $review['parent'],
                'source_sha256' => $review['source_sha256'], 'native_sha256' => $review['native_sha256'],
                'engine_sha256' => $review['engine_sha256'], 'rules' => $rules,
                'approved_by' => $request['binding']['actor'], 'approved_at' => $request['created_at'],
            ];
            $value['sha256'] = Support::hash($value);
            $approval = $this->store->original('approval', $value['id'], $projectId, $value);
            $claim = $this->store->require('claim', Support::hash($review['identifier']), $projectId);
            if (!$claim['active']) { throw new \RuntimeException('The original claim has been released.'); }
            $claim['approval_id'] = $value['id'];
            $this->store->save($claim);
            return $approval;
        });
    }

    private function dispatch(string $projectId, array $input, array $request, bool $retry): array
    {
        if ($retry) {
            $id = Support::id(Support::requiredString($input, 'import_operation_id', 128));
            $operation = $this->store->require('import', $id, $projectId);
            $approvalId = $operation['approval_id'];
            if (($input['preserve_original_approval'] ?? false) !== true) {
                throw new \InvalidArgumentException('Explicitly continue the same original approval and native operation.');
            }
        } else {
            $approvalId = Support::id(Support::requiredString($input, 'approval_id', 128));
            $id = Support::id((string) ($input['import_operation_id'] ?? $request['_record']['id']));
            $operation = $this->store->object('import', $id);
        }
        $approval = $this->store->require('approval', $approvalId, $projectId);
        if ($operation === null) {
            $operation = $this->store->put('import', $id, $projectId, [
                'id' => $id, 'project_id' => $projectId, 'identifier' => $approval['identifier'], 'approval_id' => $approvalId,
                'approval_sha256' => $approval['sha256'], 'state' => 'PREPARED',
                'original_operation_id' => $request['_record']['id'], 'created_at' => $request['created_at'],
                'created_by' => $request['binding']['actor'], 'dispatch_attempts' => [], 'native_result_ids' => [],
            ], null);
        } elseif ($operation['_record']['project_id'] !== $projectId || $operation['approval_id'] !== $approvalId) {
            throw new \RuntimeException('This original import operation already names another project or approval.');
        }
        // A lost send response is safe to repeat only with this same stamped native operation.
        // The handler's original transaction marker suppresses every duplicate mutation.
        $attemptKey = $request['_record']['id'];
        foreach ($operation['dispatch_attempts'] as $attempt) {
            if ($attempt['id'] === $attemptKey && $attempt['state'] === 'RETURNED') { return $this->operation($projectId, $id); }
        }
        $attemptIndex = null;
        foreach ($operation['dispatch_attempts'] as $index => $attempt) {
            if ($attempt['id'] === $attemptKey) { $attemptIndex = $index; }
        }
        if ($attemptIndex === null) {
            $attemptIndex = count($operation['dispatch_attempts']);
            $operation['dispatch_attempts'][] = ['id' => $attemptKey, 'state' => 'DISPATCHING', 'started_at' => Support::now()];
        }
        if (!in_array($operation['state'], ['APPLIED', 'COMPLETE'], true)) { $operation['state'] = 'DISPATCHING'; }
        $this->store->save($operation);
        try {
            $this->bus->dispatch(new Envelope(new ItemImport('Product', $approval['identifier']),
                [new ImportStamp($projectId, $id, $approvalId)]));
            $operation = $this->store->require('import', $id, $projectId);
            $operation['dispatch_attempts'][$attemptIndex]['state'] = 'RETURNED';
            $operation['dispatch_attempts'][$attemptIndex]['returned_at'] = Support::now();
            if (!in_array($operation['state'], ['APPLIED', 'COMPLETE'], true)) { $operation['state'] = 'QUEUED'; }
            $this->store->save($operation);
            return $this->operation($projectId, $id);
        } catch (\Throwable $error) {
            $operation = $this->store->require('import', $id, $projectId);
            $operation['dispatch_attempts'][$attemptIndex]['state'] = 'UNCERTAIN';
            $operation['dispatch_attempts'][$attemptIndex]['error'] = Support::error($error);
            if (!in_array($operation['state'], ['APPLIED', 'COMPLETE'], true)) { $operation['state'] = 'ATTENTION'; }
            $this->store->save($operation);
            throw $error;
        }
    }

    private function disableMissing(string $projectId, array $input, array $request): array
    {
        $review = $this->store->require('review', Support::id(Support::requiredString($input, 'review_id', 128)), $projectId);
        if ($review['kind'] !== 'MISSING' || ($input['review_sha256'] ?? null) !== $review['sha256'] ||
            ($input['confirm_selected_disable'] ?? false) !== true || ($input['acknowledge_access_boundary'] ?? false) !== true) {
            throw new \InvalidArgumentException('Explicitly approve this exact bounded missing-record disable and its source-access limitation.');
        }
        $id = $request['_record']['id'];
        $operation = $this->store->object('missing-effect', $id);
        if ($operation !== null) { return $operation; }
        $current = $this->source->capture($projectId, 'missing-' . substr(Support::hash($id), 0, 48), ['identifiers' => [$review['identifier']]]);
        if (($current['state'] ?? null) !== 'COMPLETE' || ($current['products'][$review['identifier']]['state'] ?? null) !== 'MISSING') {
            throw new \RuntimeException('The selected native item is no longer observed missing; retain and review its current source.');
        }
        $this->engine->assertSame($review['engine_sha256']);
        return $this->store->atomic(function () use ($review, $projectId, $id, $request, $input, $current): array {
            $before = $this->catalogue->read($review['identifier'], $review['parent'], $review['selection']['locales'], true);
            if ($before['sha256'] !== $review['native_sha256']) { throw new \RuntimeException('The selected native item changed after missing-record review.'); }
            $effect = $this->catalogue->disableSelected($review['identifier'], $before['snapshot'], (bool) ($input['disable_parent_if_no_enabled_variants'] ?? false));
            return $this->store->original('missing-effect', $id, $projectId, [
                'state' => 'COMPLETE', 'id' => $id, 'identifier' => $review['identifier'], 'review_id' => $review['id'],
                'review_sha256' => $review['sha256'], 'current_source_sha256' => $current['sha256'],
                'before' => $before['snapshot'], 'effect' => $effect, 'actor' => $request['binding']['actor'],
                'applied_at' => $request['created_at'],
                'scope' => 'Only this explicitly selected original variant and the separately selected empty enabled parent.',
            ]);
        });
    }

    private function releaseClaim(string $projectId, array $input): array
    {
        if (($input['resume_original_live_imports'] ?? false) !== true) {
            throw new \InvalidArgumentException('Explicitly resume the original live import behavior for this selected item.');
        }
        $identifier = Support::requiredString($input, 'identifier');
        $claim = $this->store->require('claim', Support::hash($identifier), $projectId);
        $claim['active'] = false;
        $claim['released_at'] = Support::now();
        return $this->store->save($claim);
    }

    private function envelope(string $action, string $operationId, ?string $projectId, array $result): array
    {
        $state = $result['display_state'] ?? $result['state'] ?? 'COMPLETE';
        $waiting = in_array($state, ['PREPARED', 'DISPATCHING', 'QUEUED', 'APPLIED', 'MEDIA_PENDING', 'WAITING_NATIVE'], true);
        return ['schema' => 'tjl.catalogue.workspace-result.v1',
            'state' => $waiting ? 'WAITING_NATIVE' : ($state === 'ATTENTION' ? 'ATTENTION' : 'COMPLETE'),
            'action' => $action, 'operation_id' => $operationId, 'project_id' => $projectId, 'result' => $result];
    }
}
