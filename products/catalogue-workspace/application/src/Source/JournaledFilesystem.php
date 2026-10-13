<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
namespace Tjl\CatalogueWorkspace\Source;

use Symfony\Component\Filesystem\Filesystem;

/** Inject only into the original configured FileAttributeValueHandler services. */
final class JournaledFilesystem extends Filesystem
{
    public function __construct(private MediaJournal $journal) {}
    public function rename(string $origin, string $target, bool $overwrite = false): void
    {
        if ($this->journal->active()) { $this->journal->stageLocal($origin, $target, $overwrite); return; }
        parent::rename($origin, $target, $overwrite);
    }
    public function exists(string|iterable $files): bool
    {
        if (!$this->journal->active()) { return parent::exists($files); }
        foreach (is_string($files) ? [$files] : $files as $path) {
            if (!$this->journal->localExists((string) $path)) { return false; }
        }
        return true;
    }
    public function mkdir(string|iterable $dirs, int $mode = 0777): void
    {
        if (!$this->journal->active()) { parent::mkdir($dirs, $mode); return; }
        foreach (is_string($dirs) ? [$dirs] : $dirs as $path) { $this->journal->localDirectory((string) $path); }
    }
    public function chmod(string|iterable $files, int $mode, int $umask = 0000, bool $recursive = false): void
    {
        if (!$this->journal->active()) { parent::chmod($files, $mode, $umask, $recursive); return; }
        if ($recursive) { throw new \RuntimeException('Recursive media chmod is outside the native selected file contract.'); }
        foreach (is_string($files) ? [$files] : $files as $path) { $this->journal->localMode((string) $path, $mode & ~$umask); }
    }
}
