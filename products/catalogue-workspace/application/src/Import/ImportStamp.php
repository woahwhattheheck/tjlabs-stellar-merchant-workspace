<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\Import;

use Symfony\Component\Messenger\Stamp\StampInterface;

final class ImportStamp implements StampInterface
{
    public function __construct(
        public readonly string $projectId,
        public readonly string $operationId,
        public readonly string $approvalId,
    ) {}
}
