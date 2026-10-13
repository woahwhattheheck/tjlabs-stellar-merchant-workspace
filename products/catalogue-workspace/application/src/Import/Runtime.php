<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\Import;

/** One synchronous native Messenger call stack; never a replacement queue. */
final class Runtime
{
    private array $stack = [];
    public function current(): ?array { return $this->stack === [] ? null : $this->stack[array_key_last($this->stack)]; }
    public function enter(array $value, callable $callback): mixed
    {
        $depth = count($this->stack);
        $this->stack[] = $value;
        try { return $callback(); }
        finally { $this->stack = array_slice($this->stack, 0, $depth); }
    }
    public function update(array $value): void
    {
        if ($this->stack === []) { throw new \LogicException('No original native import context.'); }
        $this->stack[array_key_last($this->stack)] = array_replace($this->current(), $value);
    }
}
