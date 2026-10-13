<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
namespace Tjl\CatalogueWorkspace\Source;

use Sylius\Component\Core\Filesystem\Adapter\FilesystemAdapterInterface;

/** Preserves the native Sylius uploader and its actual generated image paths. */
final class JournaledImageStorage implements FilesystemAdapterInterface
{
    public function __construct(private FilesystemAdapterInterface $inner, private MediaJournal $journal) {}
    public function has(string $location): bool
    {
        return $this->journal->active() ? $this->journal->imageHas($location) : $this->inner->has($location);
    }
    public function write(string $location, string $content): void
    {
        if ($this->journal->active()) { $this->journal->imageWrite($location, $content); return; }
        $this->inner->write($location, $content);
    }
    public function delete(string $location): void
    {
        if ($this->journal->active()) { $this->journal->imageDelete($location); return; }
        $this->inner->delete($location);
    }
}
