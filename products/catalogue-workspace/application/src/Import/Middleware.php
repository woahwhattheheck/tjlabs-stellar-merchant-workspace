<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\Import;

use Symfony\Component\Messenger\Envelope;
use Symfony\Component\Messenger\Exception\UnrecoverableMessageHandlingException;
use Symfony\Component\Messenger\Middleware\MiddlewareInterface;
use Symfony\Component\Messenger\Middleware\StackInterface;
use Symfony\Component\Messenger\Stamp\ReceivedStamp;
use Tjl\CatalogueWorkspace\Store;
use Tjl\CatalogueWorkspace\Support;
use Tjl\CatalogueWorkspace\Source\SourceGateway;
use Webgriffe\SyliusAkeneoPlugin\Message\ItemImport;

/** The original result middleware and transport remain installed underneath. */
final class Middleware implements MiddlewareInterface
{
    public function __construct(
        private MiddlewareInterface $inner,
        private Runtime $runtime,
        private Store $store,
        private SourceGateway $source,
    ) {}

    public function handle(Envelope $envelope, StackInterface $stack): Envelope
    {
        $message = $envelope->getMessage();
        if (!$message instanceof ItemImport || $message->getAkeneoEntity() !== 'Product') {
            return $this->inner->handle($envelope, $stack);
        }
        $stamp = $envelope->last(ImportStamp::class);
        if ($stamp === null) {
            if ($envelope->last(ReceivedStamp::class) === null) { return $this->inner->handle($envelope, $stack); }
            $claim = $this->store->object('claim', Support::hash($message->getAkeneoIdentifier()));
            if (($claim['active'] ?? false) === true) {
                $projectId = $claim['_record']['project_id'];
                $noticeId = Support::hash(['project' => $projectId, 'identifier' => $message->getAkeneoIdentifier()]);
                $notice = $this->store->object('live-pending', $noticeId);
                $value = ['identifier' => $message->getAkeneoIdentifier(), 'state' => 'REVIEW_REQUIRED', 'observed_at' => Support::now(),
                    'reason' => 'An original live ItemImport reached an explicitly claimed review cohort without its approval stamp.'];
                $this->store->put('live-pending', $noticeId, $projectId, $value, $notice['_record']['revision'] ?? null);
                throw new UnrecoverableMessageHandlingException('This selected catalogue item awaits its original workspace review; inspect the existing native failed-message transport and project.');
            }
            return $this->inner->handle($envelope, $stack);
        }
        $nested = $this->runtime->current();
        if (($nested['stamp']->operationId ?? null) === $stamp->operationId && ($nested['stamp']->projectId ?? null) === $stamp->projectId) {
            return $this->inner->handle($envelope, $stack);
        }
        return $this->store->lock('project:' . $stamp->projectId, function () use ($stamp, $message, $envelope, $stack): Envelope {
            $operation = $this->store->require('import', $stamp->operationId, $stamp->projectId);
            if ($operation['approval_id'] !== $stamp->approvalId || $operation['identifier'] !== $message->getAkeneoIdentifier()) {
                throw new UnrecoverableMessageHandlingException('Original catalogue message and operation binding differ.');
            }
            $approval = $this->store->require('approval', $stamp->approvalId, $stamp->projectId);
            $snapshot = $this->source->inspect($approval['capture_id']);
            $attemptId = bin2hex(random_bytes(16));
            $start = ['operation_id' => $stamp->operationId, 'approval_id' => $stamp->approvalId,
                'identifier' => $message->getAkeneoIdentifier(), 'started_at' => Support::now(),
                'native_commit_already_present' => $operation['state'] === 'APPLIED'];
            $this->store->journal('import-' . $attemptId . '-start', $start);
            try {
                $result = $this->runtime->enter(['stamp' => $stamp, 'attempt_id' => $attemptId], function () use ($operation, $stamp, $snapshot, $envelope, $stack): Envelope {
                    return $this->source->withApproved($stamp->projectId, $stamp->operationId, $snapshot,
                        fn (): Envelope => $operation['state'] === 'COMPLETE' ? $envelope : $this->inner->handle($envelope, $stack));
                });
                $this->store->journal('import-' . $attemptId . '-returned', $start + [
                    'returned_at' => Support::now(), 'operation' => $this->store->require('import', $stamp->operationId, $stamp->projectId),
                ]);
                return $result;
            } catch (\Throwable $error) {
                // The file journal survives a rollback or closed native EntityManager.
                $this->store->journal('import-' . $attemptId . '-error', $start + ['error' => Support::error($error)]);
                try {
                    $current = $this->store->require('import', $stamp->operationId, $stamp->projectId);
                    if (!in_array($current['state'], ['APPLIED', 'COMPLETE'], true)) {
                        $current['state'] = 'ATTENTION';
                        $current['last_error'] = Support::error($error);
                        $current['last_attempt_id'] = $attemptId;
                        $this->store->save($current);
                    }
                } catch (\Throwable) {
                    // Original worker/failure transport and immutable file journal remain authoritative.
                }
                throw $error;
            }
        });
    }
}
