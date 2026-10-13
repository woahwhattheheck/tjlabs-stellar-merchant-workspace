<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\Import;

use Tjl\CatalogueWorkspace\Store;
use Tjl\CatalogueWorkspace\Support;
use Tjl\CatalogueWorkspace\NativeCatalogue;
use Tjl\CatalogueWorkspace\Engine;
use Webgriffe\SyliusAkeneoPlugin\Message\ItemImport;
use Webgriffe\SyliusAkeneoPlugin\MessageHandler\ItemImportHandler;

/** Wraps the unchanged handler inside its existing Doctrine transaction. */
final class Handler
{
    public function __construct(
        private ItemImportHandler $inner,
        private Runtime $runtime,
        private Store $store,
        private NativeCatalogue $catalogue,
        private Engine $engine,
    ) {}

    public function __invoke(ItemImport $message): void
    {
        $context = $this->runtime->current();
        if ($context === null || !isset($context['stamp'])) {
            ($this->inner)($message);
            return;
        }
        $stamp = $context['stamp'];
        $operation = $this->store->require('import', $stamp->operationId, $stamp->projectId);
        if ($operation['approval_id'] !== $stamp->approvalId || $operation['identifier'] !== $message->getAkeneoIdentifier() || $message->getAkeneoEntity() !== 'Product') {
            throw new \RuntimeException('The native message differs from its retained original operation.');
        }
        if (in_array($operation['state'], ['APPLIED', 'COMPLETE'], true)) {
            return; // Original commit is authoritative, including an absent native result.
        }
        if (!in_array($operation['state'], ['PREPARED', 'DISPATCHING', 'QUEUED', 'ATTENTION'], true)) {
            throw new \RuntimeException('This native operation cannot be applied in its current retained state.');
        }
        $approval = $this->store->require('approval', $stamp->approvalId, $stamp->projectId);
        $claim = $this->store->require('claim', Support::hash($message->getAkeneoIdentifier()), $stamp->projectId);
        if (($claim['active'] ?? false) !== true || ($claim['approval_id'] ?? null) !== $stamp->approvalId) {
            throw new \RuntimeException('The selected item no longer has this exact active approval.');
        }
        $project = $this->store->require('project', $stamp->projectId, $stamp->projectId);
        $this->engine->assertSame($approval['engine_sha256']);
        if (!$this->store->connection()->isTransactionActive()) {
            throw new \RuntimeException('The original Doctrine transaction middleware must surround the native handler.');
        }
        // This CAS write locks the original native row until the same transaction commits.
        $operation['state'] = 'APPLYING';
        $operation['native_started_at'] = Support::now();
        $operation = $this->store->save($operation);
        $before = $this->catalogue->read($approval['identifier'], $approval['parent'], $project['selection']['locales'], true);
        if (!hash_equals($approval['native_sha256'], $before['sha256'])) {
            throw new \RuntimeException('Native Sylius values changed since approval. Capture a following review before importing.');
        }
        $this->runtime->update(['approval' => $approval, 'project' => $project, 'before' => $before, 'ownership_applied' => false]);
        ($this->inner)($message);
        if (($this->runtime->current()['ownership_applied'] ?? false) !== true) {
            throw new \RuntimeException('The original ProductVariantPreValidateEvent ownership boundary was not observed.');
        }
        $after = $this->catalogue->read($approval['identifier'], $approval['parent'], $project['selection']['locales']);
        $operation = $this->store->require('import', $stamp->operationId, $stamp->projectId);
        $operation['state'] = 'APPLIED';
        $operation['native_before'] = $before['snapshot'];
        $operation['native_after'] = $after['snapshot'];
        $operation['native_after_sha256'] = $after['sha256'];
        $operation['native_applied_at'] = Support::now();
        $operation['source_sha256'] = $approval['source_sha256'];
        $this->store->save($operation);
        // Original Doctrine middleware flushes/commits both native entities and this marker.
    }
}
