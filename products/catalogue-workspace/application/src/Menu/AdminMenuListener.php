<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\Menu;

use Sylius\Bundle\UiBundle\Menu\Event\MenuBuilderEvent;

final class AdminMenuListener
{
    public function __invoke(MenuBuilderEvent $event): void
    {
        $catalogue = $event->getMenu()->getChild('catalog');
        if ($catalogue === null) { return; }
        $catalogue->addChild('tjl_catalogue_workspace', ['route' => 'tjl_catalogue_workspace_index'])
            ->setLabel('Catalogue review workspace')->setLabelAttribute('icon', 'clipboard-check');
    }
}
