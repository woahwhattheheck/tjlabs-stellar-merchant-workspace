<?php
declare(strict_types=1);
namespace Tjl\CatalogueWorkspace\Command;

use Doctrine\Persistence\ObjectRepository;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Security\Core\Role\RoleHierarchyInterface;
use Tjl\CatalogueWorkspace\{Workspace,Store,ProjectArchive,Support};

#[AsCommand(name: 'catalogue:workspace', description: 'Operate the original selected catalogue project and native Akeneo import.')]
final class WorkspaceCommand extends Command
{
    public function __construct(
        private Workspace $workspace,
        private ObjectRepository $admins,
        private string $operatorRole,
        private RoleHierarchyInterface $roles,
        private ProjectArchive $archive,
        private Store $store,
    ) { parent::__construct(); }

    protected function configure(): void
    {
        $this->addArgument('action', InputArgument::REQUIRED, 'install, engine, projects, project-create, project, capture, cohort, review, missing-review, approve, dispatch, retry, operation, record, missing-apply, release-claim, retain-unapplied, files, download, export, receive')
            ->addOption('input', null, InputOption::VALUE_REQUIRED, 'Complete original JSON input file.')
            ->addOption('operation-id', null, InputOption::VALUE_REQUIRED, 'Retained original command identity.')
            ->addOption('actor', null, InputOption::VALUE_REQUIRED, 'Existing enabled Sylius administrator username.')
            ->addOption('output', null, InputOption::VALUE_REQUIRED, 'Private complete JSON result file.')
            ->addOption('destination', null, InputOption::VALUE_REQUIRED, 'For download only: exact selected original output file.');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $action = (string) $input->getArgument('action');
        $operation = (string) $input->getOption('operation-id');
        $project = null;
        try {
            Support::id($operation);
            $username = (string) $input->getOption('actor');
            $admin = $username === '' ? null : $this->admins->findOneBy(['username' => $username]);
            if ($admin === null || !method_exists($admin, 'isEnabled') || !$admin->isEnabled() ||
                !in_array($this->operatorRole, $this->roles->getReachableRoleNames($admin->getRoles()), true)) {
                throw new \RuntimeException('Select the existing enabled native administrator with the configured operator role.');
            }
            $actor = 'sylius-admin:' . (string) $admin->getId() . ':' . $admin->getUserIdentifier();
            $path = (string) $input->getOption('input');
            if ($path === '' || is_link($path) || !is_file($path) || filesize($path) > 16777216) {
                throw new \InvalidArgumentException('Select a complete ordinary original JSON input file, bounded to 16 MiB.');
            }
            $raw = file_get_contents($path);
            if ($raw === false) { throw new \RuntimeException('Cannot read the complete original command input.'); }
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($data) || ($data !== [] && array_is_list($data))) { throw new \InvalidArgumentException('The action input must be a JSON object.'); }
            $project = isset($data['project_id']) ? Support::id($data['project_id']) : null;
            if ($action === 'download') {
                if ($project === null) { throw new \InvalidArgumentException('Select the original project.'); }
                $blob = $this->archive->selectedFile($project, Support::requiredString($data, 'sha256', 64));
                $destination = (string) $input->getOption('destination');
                $this->copyOriginal($this->store->blobPath($blob), $destination, $blob);
                $result = ['schema' => 'tjl.catalogue.workspace-result.v1', 'state' => 'COMPLETE', 'action' => $action,
                    'operation_id' => $operation, 'project_id' => $project, 'result' => ['file' => $blob, 'destination' => $destination]];
            } else { $result = $this->workspace->execute($action, $data, $operation, $actor); }
            $code = Command::SUCCESS; // WAITING_NATIVE is a complete native response, not an observed import success.
        } catch (\Throwable $error) {
            $result = ['schema' => 'tjl.catalogue.workspace-result.v1', 'state' => 'ATTENTION',
                'action' => $action, 'operation_id' => $operation, 'project_id' => $project,
                'error' => Support::error($error)];
            $code = Command::FAILURE;
        }
        $encoded = Support::json($result) . "\n";
        $out = (string) $input->getOption('output');
        try { if ($out !== '') { $this->writeResult($out, $encoded); } }
        catch (\Throwable $error) { ($output instanceof \Symfony\Component\Console\Output\ConsoleOutputInterface ? $output->getErrorOutput() : $output)->writeln($error->getMessage()); return Command::FAILURE; }
        $output->write($encoded);
        return $code;
    }

    private function ordinaryDestination(string $path): void
    {
        if ($path === '' || !str_starts_with($path, '/') || is_link($path) || !is_dir(dirname($path))) {
            throw new \InvalidArgumentException('Select an absolute ordinary destination in an existing private directory.');
        }
        $parent = dirname($path);
        while ($parent !== '/') {
            if (is_link($parent)) { throw new \InvalidArgumentException('A receiving destination parent is linked.'); }
            $parent = dirname($parent);
        }
    }

    private function writeResult(string $path, string $bytes): void
    {
        $this->ordinaryDestination($path);
        $temporary = tempnam(dirname($path), '.catalogue-result-');
        if ($temporary === false) { throw new \RuntimeException('Cannot retain the original command result.'); }
        try {
            chmod($temporary, 0600);
            if (file_put_contents($temporary, $bytes, LOCK_EX) !== strlen($bytes)) { throw new \RuntimeException('Incomplete command result.'); }
            $handle = fopen($temporary, 'r+b');
            if ($handle === false) { throw new \RuntimeException('Cannot sync command result.'); }
            try { if (!fsync($handle)) { throw new \RuntimeException('Cannot sync command result.'); } } finally { fclose($handle); }
            if (!rename($temporary, $path)) { throw new \RuntimeException('Cannot publish complete command result.'); }
        } finally { @unlink($temporary); }
    }

    private function copyOriginal(string $source, string $path, array $blob): void
    {
        $this->ordinaryDestination($path);
        if (file_exists($path)) {
            if (!is_file($path) || filesize($path) !== $blob['bytes'] || hash_file('sha256', $path) !== $blob['sha256']) {
                throw new \RuntimeException('The original download destination contains different bytes; retain it and choose another path.');
            }
            return;
        }
        $temporary = tempnam(dirname($path), '.catalogue-download-');
        if ($temporary === false) { throw new \RuntimeException('Cannot receive the original download.'); }
        try {
            if (!copy($source, $temporary) || filesize($temporary) !== $blob['bytes'] || hash_file('sha256', $temporary) !== $blob['sha256']) {
                throw new \RuntimeException('The complete original download differs.');
            }
            chmod($temporary, 0600);
            $handle = fopen($temporary, 'r+b');
            if ($handle === false) { throw new \RuntimeException('Cannot sync original download.'); }
            try { if (!fsync($handle)) { throw new \RuntimeException('Cannot sync original download.'); } } finally { fclose($handle); }
            if (!link($temporary, $path)) { throw new \RuntimeException('The original download destination changed concurrently.'); }
        } finally { @unlink($temporary); }
    }
}
