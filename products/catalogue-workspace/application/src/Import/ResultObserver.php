<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\Import;

use Doctrine\ORM\Event\PostPersistEventArgs;
use Tjl\CatalogueWorkspace\Store;
use Tjl\CatalogueWorkspace\Support;
use Webgriffe\SyliusAkeneoPlugin\Entity\ItemImportResultInterface;

/** Stores the actual native generated ID inside its original flush transaction. */
final class ResultObserver
{
    public function __construct(private Runtime $runtime, private Store $store) {}
    public function postPersist(PostPersistEventArgs $event): void
    {
        $result = $event->getObject();
        $context = $this->runtime->current();
        if (!$result instanceof ItemImportResultInterface || $context === null || !isset($context['stamp'])) { return; }
        $stamp = $context['stamp'];
        $operation = $this->store->require('import', $stamp->operationId, $stamp->projectId);
        if ($result->getAkeneoEntity() !== 'Product' || $result->getAkeneoIdentifier() !== $operation['identifier']) {
            throw new \RuntimeException('The native result does not match the original selected item.');
        }
        if ($result->getId() === null) { throw new \RuntimeException('The native result has no actual generated identity.'); }
        $receipt = [
            'operation_id' => $stamp->operationId, 'approval_id' => $stamp->approvalId,
            'native_id' => (string) $result->getId(), 'entity' => $result->getAkeneoEntity(),
            'identifier' => $result->getAkeneoIdentifier(), 'successful' => $result->isSuccessful(),
            'message' => $result->getMessage(), 'created_at' => $result->getCreatedAt()->format(DATE_ATOM),
        ];
        $id = Support::hash(['operation' => $stamp->operationId, 'native_result' => $receipt['native_id']]);
        $this->store->original('result', $id, $stamp->projectId, $receipt);
        $operation['native_result_ids'] = array_values(array_unique(array_merge($operation['native_result_ids'] ?? [], [$receipt['native_id']])));
        $operation['last_native_result'] = $receipt;
        if ($result->isSuccessful() && in_array($operation['state'], ['APPLIED', 'COMPLETE'], true)) {
            $operation['state'] = 'COMPLETE';
        }
        $this->store->save($operation);
    }
}
