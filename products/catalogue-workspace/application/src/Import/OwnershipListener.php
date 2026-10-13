<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\Import;

use Tjl\CatalogueWorkspace\NativeCatalogue;
use Webgriffe\SyliusAkeneoPlugin\Event\ProductVariantPreValidateEvent;

final class OwnershipListener
{
    public function __construct(private Runtime $runtime, private NativeCatalogue $catalogue) {}
    public function __invoke(ProductVariantPreValidateEvent $event): void
    {
        $context = $this->runtime->current();
        if ($context === null || !isset($context['before'], $context['approval'])) { return; }
        if ($event->getProductVariant()->getCode() !== $context['approval']['identifier']) {
            throw new \RuntimeException('The native importer attempted a different original variant.');
        }
        $this->catalogue->protectBoundary($event, $context['before']['snapshot'], $context['before']['objects'], $context['project']['selection']);
        $this->catalogue->applyLocal($event, $context['before']['snapshot'], $context['before']['objects'], $context['approval']['rules']);
        $this->runtime->update(['ownership_applied' => true]);
    }
}
