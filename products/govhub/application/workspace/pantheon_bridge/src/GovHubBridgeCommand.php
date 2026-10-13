<?php

declare(strict_types=1);

namespace Commons\Terminus\GovHub;

use Pantheon\Terminus\Commands\TerminusCommand;
use Pantheon\Terminus\Hooks\Authorizer;
use Pantheon\Terminus\Models\Backup;
use Pantheon\Terminus\Models\Environment;
use Pantheon\Terminus\Models\Site;
use Pantheon\Terminus\Models\TerminusModel;
use Pantheon\Terminus\Models\Workflow;

/**
 * Native Pantheon workflows for the existing GovHub operator application.
 * Provider models determine all request paths and workflow parameters.
 */
final class GovHubBridgeCommand extends TerminusCommand
{
    public const VERSION = '1.1.0';
    public const TERMINUS_VERSION = '4.3.3';
    public const TERMINUS_COMMIT = '4cd1810ad892157131cec5919baf3036ab457d57';
    public const TERMINUS_PHAR_SHA256 = 'e7ca9bcad3acbb1cfc0cec32550eeb2351e578dc6d5f79cd3a5303201893bade';

    private const ACTIONS = [
        'inventory', 'pantheon-capture', 'backup-list',
        'pantheon-backup-download', 'workflow-inspect',
        'pantheon-backup-create', 'pantheon-deploy-code',
        'pantheon-clone-files', 'pantheon-clone-database',
        'pantheon-restore-backup',
    ];

    private const NATIVE_BLOBS = [
        \Pantheon\Terminus\Request\Request::class => '2bd7272a60c07e066414cd406343a3deae6cf35e',
        \Pantheon\Terminus\Request\RequestOperationResult::class => 'c7549b56fc9234800b83aaef067c8c0cde6a40ba',
        \Pantheon\Terminus\Models\TerminusModel::class => 'd78f4cc81e2c9340c997fc9c301b2f61171dca44',
        \Pantheon\Terminus\Models\Site::class => '125a631d94cc7dbd14e4b6bc2f545c2aa9cf6b0c',
        \Pantheon\Terminus\Models\Environment::class => '0ddef83ed7a4f8323371ed63c57f9e9d6f1f5c9a',
        \Pantheon\Terminus\Models\Workflow::class => 'ec6defaf54dbe34f340b1fd8fc67d71daf01990c',
        \Pantheon\Terminus\Models\Backup::class => '3ae51283406df1ef06068d5b79d31c7fba96dcb8',
        \Pantheon\Terminus\Models\Commit::class => 'abda9ab093042385d7ed8bb31ce9f76bd3ec7a7b',
        \Pantheon\Terminus\Collections\APICollection::class => 'b2939b1a8f3e31e117b21b1c4fbac5bb6972d5a8',
        \Pantheon\Terminus\Collections\TerminusCollection::class => '9ca0191e01fbbd5d85f795619042ba2ab076ab36',
        \Pantheon\Terminus\Collections\Environments::class => '0adefe10a26a2960ced9d39bb00e08aba2c894fe',
        \Pantheon\Terminus\Collections\Workflows::class => '8b91fe7947b5ebac697e7b7b65912aa137c5c120',
        \Pantheon\Terminus\Collections\Backups::class => '8be9d629fae29036c7daeff35015c31034d78e9e',
        \Pantheon\Terminus\Collections\Commits::class => '601d6d0294ec7aa7524b583faf84003759002502',
        \Pantheon\Terminus\Hooks\Authorizer::class => '002c9ca93b4f789fe202bcb854a5611285e3cc1c',
    ];

    /**
     * Inspect the received plugin and native code without signing in.
     *
     * @command govhub:bridge-info
     */
    public function bridgeInfo(): int
    {
        try {
            $runtime = $this->runtime();
            $this->output()->writeln(ReceiptJournal::json([
                'schema' => 'govhub-pantheon-bridge-info/v1',
                'plugin_version' => self::VERSION,
                'terminus_version' => $runtime['terminus_version'],
                'terminus_commit' => self::TERMINUS_COMMIT,
                'terminus_phar_sha256' => self::TERMINUS_PHAR_SHA256,
                'plugin_root' => $runtime['plugin_root'],
                'source_files' => $runtime['source_files'],
                'native_contracts' => $runtime['native_contracts'],
                'request_schema' => ReceiptJournal::SCHEMA,
                'actions' => self::ACTIONS,
                'php_version' => PHP_VERSION,
            ]));
            return 0;
        } catch (\Throwable $error) {
            $this->output()->writeln(ReceiptJournal::json([
                'schema' => 'govhub-pantheon-bridge-info/v1', 'ok' => false,
                'error' => ['class' => get_class($error), 'message' => $error->getMessage()],
            ]));
            return 2;
        }
    }

    /**
     * Execute one selected native action or recover its original receipt.
     * Native Authorizer runs after recovery, before the first new provider read.
     *
     * @command govhub:bridge
     * @option string $request Absolute private JSON request file.
     * @option string $receipt Absolute new private receipt file.
     */
    public function bridge(array $options = ['request' => null, 'receipt' => null]): int
    {
        $journal = null;
        $runtime = [];
        $input = null;
        $bytes = null;
        $requestPhase = 'request-read';
        try {
            $bytes = $this->privateRequest($options['request'] ?? null);
            $requestPhase = 'request-validation';
            $input = $this->validateRequest($bytes);
            if (!is_string($options['receipt'] ?? null)) {
                throw new \InvalidArgumentException('Supply --receipt with an absolute private file path.');
            }
            $requestPhase = 'receipt-open';
            $journal = new ReceiptJournal($options['receipt'], $bytes, $input);
            // Completed original custody is useful even while its account is
            // signed out. No native action is available through this path.
            $original = $journal->recovered(function (object $attributes, array $dispatch) use ($input): array {
                return $this->recoveredWorkflow($attributes, $input, $dispatch);
            });
            if ($original !== null) {
                return $this->emit($original);
            }

            $runtime = $this->runtime();
            $journal->start($runtime);
            // The exact original Authorizer selects the configured native user
            // and saved token. It refreshes login before any workflow dispatch.
            $this->getContainer()->get(Authorizer::class)->ensureLogin();

            $transport = $this->native(SingleAttemptRequest::class);
            $transport->configure($journal, $input['timeout_seconds'] ?? 300);
            $site = $this->native(Site::class, [(object)['id' => $input['site_id']]]);
            $site->setRequest($transport);
            $site->fetch();
            if (strtolower((string)$site->id) !== $input['site_id']) {
                throw new \RuntimeException('Native site identity differs from the selected site UUID.');
            }

            // Bind the one-attempt native request to every environment model,
            // including a parent that hasDeployableCode() may access later.
            $environments = $site->getEnvironments();
            $environments->setRequest($transport);
            foreach ($environments->all() as $environment) {
                $environment->setRequest($transport);
                $environment->getWorkflows()->setRequest($transport);
                $environment->getCommits()->setRequest($transport);
                $environment->getBackups()->setRequest($transport);
            }
            $target = $environments->get($input['environment_id']);
            if (!$target instanceof Environment || $target->id !== $input['environment_id']) {
                throw new \RuntimeException('Native target environment differs from the selected environment.');
            }

            $action = $input['action'];
            if ($action === 'workflow-inspect') {
                $workflow = $this->native(Workflow::class, [
                    (object)['id' => $input['workflow_id']], ['site' => $site],
                ]);
                $workflow->setRequest($transport);
                $workflow->fetchWithLogs();
                $snapshot = $this->workflowSnapshot($workflow, $input,
                    $input['expected_workflow_type'] ?? null);
                $result = $journal->workflow($snapshot, [
                    'inspection' => 'exact_native_workflow_id',
                ], $runtime);
            } elseif ($action === 'inventory' || $action === 'pantheon-capture') {
                $result = $this->completed($journal, $runtime, $this->inventory($site, $target, $transport));
            } elseif ($action === 'backup-list') {
                $result = $this->completed($journal, $runtime, [
                    'backups' => $this->backups($target, $transport),
                ]);
            } elseif ($action === 'pantheon-backup-download') {
                $backup = $this->selectedBackup($target, $input, $transport);
                $url = $backup->getArchiveURL();
                if (!is_string($url) || parse_url($url, PHP_URL_SCHEME) !== 'https') {
                    throw new \RuntimeException('Native backup did not return an HTTPS archive locator.');
                }
                $result = $this->completed($journal, $runtime, [
                    'backup' => $this->backupSnapshot($backup),
                    'archive_url' => $url,
                    'locator_custody' => 'private_original_receipt',
                ]);
            } else {
                if ($site->isFrozen()) {
                    throw new \RuntimeException('The selected native site is frozen.');
                }
                $result = $this->mutate($journal, $runtime, $input, $site, $target, $transport);
            }
            return $this->emit($journal->finish($result));
        } catch (\Throwable $error) {
            if ($journal !== null) {
                // A model parser or final-output failure may follow a successful
                // native POST. Recover its exact retained response first.
                try {
                    $original = $journal->recovered(
                        function (object $attributes, array $dispatch) use ($input): array {
                            return $this->recoveredWorkflow($attributes, $input, $dispatch);
                        }, $runtime
                    );
                    if ($original !== null) {
                        return $this->emit($original);
                    }
                } catch (\Throwable $recoveryError) {
                    $error = new \RuntimeException(
                        $error->getMessage() . ' Original receipt recovery: ' . $recoveryError->getMessage(),
                        0, $error
                    );
                }
                $result = array_replace($journal->base(), [
                    'ok' => false,
                    'state' => $journal->wasDispatched() ? 'uncertain' : 'rejected',
                    'runtime' => $runtime,
                    'error' => [
                        'code' => $journal->wasDispatched() ? 'NATIVE_DISPATCH_UNSETTLED' : 'NATIVE_ACTION_REJECTED',
                        'class' => get_class($error), 'message' => $error->getMessage(),
                    ],
                ]);
                try {
                    return $this->emit($journal->finish($result));
                } catch (\Throwable $custodyError) {
                    // Preserve the original directory and its immutable files.
                    // The supervisor still receives the receipt path and state.
                    $result['receipt_write_error'] = $custodyError->getMessage();
                    return $this->emit($result);
                }
            }
            return $this->emit([
                'schema' => ReceiptJournal::SCHEMA, 'ok' => false, 'state' => 'rejected',
                'operation_id' => $input['operation_id'] ?? null,
                'step_id' => $input['step_id'] ?? null, 'dispatched' => false,
                'request_phase' => $requestPhase,
                'request_sha256' => is_string($bytes) ? hash('sha256', $bytes) : null,
                'error' => ['code' => 'INVALID_BRIDGE_REQUEST',
                    'class' => get_class($error), 'message' => $error->getMessage()],
            ]);
        }
    }

    private function mutate(
        ReceiptJournal $journal, array $runtime, array $input,
        Site $site, Environment $target, SingleAttemptRequest $transport
    ): array {
        $action = $input['action'];
        $workflows = $target->getWorkflows();
        $data = [];
        if ($action === 'pantheon-backup-create') {
            $this->requireInitialized($target, 'backup target');
            $journal->allowWorkflow($workflows->getUrl(), 'do_export');
            $workflow = $target->getBackups()->create([
                'element' => ($input['backup_element'] ?? 'all') === 'all'
                    ? null : $input['backup_element'],
                'keep-for' => $input['backup_keep_days'] ?? 365,
            ]);
            // This is the first instruction after receiving the original model.
            return $journal->workflow($this->workflowSnapshot($workflow, $input, 'do_export'), $data, $runtime);
        }
        if ($action === 'pantheon-restore-backup') {
            $this->requireInitialized($target, 'restore target');
            $backup = $this->selectedBackup($target, $input, $transport);
            $nativeType = 'restore_' . $backup->get('type');
            $data['backup'] = $this->backupSnapshot($backup);
            $journal->allowWorkflow($workflows->getUrl(), $nativeType);
            $workflow = $backup->restore();
            return $journal->workflow($this->workflowSnapshot($workflow, $input, $nativeType), $data, $runtime);
        }

        $source = $site->getEnvironments()->get($input['source_environment_id']);
        if (!$source instanceof Environment || $source->id === $target->id) {
            throw new \InvalidArgumentException('Select a different original source environment.');
        }
        $this->requireInitialized($source, 'source environment');
        $data['source'] = $this->sourceGuard($source, $input);
        if ($action === 'pantheon-deploy-code') {
            $expectedParent = ['test' => 'dev', 'live' => 'test'][$target->id] ?? null;
            if ($expectedParent === null || $source->id !== $expectedParent) {
                throw new \InvalidArgumentException('Native code deployment promotes Dev to Test or Test to Live.');
            }
            if (!$target->isInitialized()) {
                if (($input['allow_initialize'] ?? false) !== true) {
                    throw new \InvalidArgumentException(
                        'Initializing this environment also clones native database and files; select allow_initialize explicitly.'
                    );
                }
                $nativeType = 'create_environment';
                $data['initializes_environment'] = true;
                $data['includes_native_database_and_files'] = true;
                $journal->allowWorkflow($workflows->getUrl(), $nativeType);
                $workflow = $target->initializeBindings([
                    'annotation' => $input['deploy_note'] ?? 'GovHub native environment initialization',
                ]);
                return $journal->workflow($this->workflowSnapshot($workflow, $input, $nativeType), $data, $runtime);
            }
            if (!$target->hasDeployableCode()) {
                return $this->completed($journal, $runtime, $data + [
                    'no_change' => true, 'reason' => 'native_environment_has_no_deployable_commits',
                ]);
            }
            $journal->allowWorkflow($workflows->getUrl(), 'deploy');
            $workflow = $target->deploy([
                'updatedb' => (int)($input['run_updatedb'] ?? false),
                'annotation' => $input['deploy_note'] ?? 'GovHub native code promotion',
                'clear_cache' => (int)($input['clear_cache'] ?? false),
            ]);
            return $journal->workflow($this->workflowSnapshot($workflow, $input, 'deploy'), $data, $runtime);
        }

        $this->requireInitialized($target, 'clone target');
        if ($action === 'pantheon-clone-files') {
            $journal->allowWorkflow($workflows->getUrl(), 'clone_files');
            $workflow = $target->cloneFiles($source);
            return $journal->workflow($this->workflowSnapshot($workflow, $input, 'clone_files'), $data, $runtime);
        }
        if ($action === 'pantheon-clone-database') {
            $options = [
                'updatedb' => (int)($input['run_updatedb'] ?? false),
                'clear_cache' => $input['clear_cache'] ?? false,
            ];
            if (isset($input['wordpress_from_url'])) {
                if (!$site->getFramework()->isWordpressFramework()) {
                    throw new \InvalidArgumentException('Explicit WordPress URL replacement requires a WordPress site.');
                }
                $options['from_url'] = $input['wordpress_from_url'];
                $options['to_url'] = $input['wordpress_to_url'];
            }
            $journal->allowWorkflow($workflows->getUrl(), 'clone_database');
            $workflow = $target->cloneDatabase($source, $options);
            return $journal->workflow($this->workflowSnapshot($workflow, $input, 'clone_database'), $data, $runtime);
        }
        throw new \LogicException('Unsupported selected native mutation.');
    }

    private function inventory(Site $site, Environment $target, SingleAttemptRequest $transport): array
    {
        $environments = [];
        $codeLogs = [];
        foreach ($site->getEnvironments()->all() as $environment) {
            $row = $environment->serialize();
            $row['native_attributes'] = $this->attributes($environment);
            $environments[] = $row;
            if ($environment->id === $target->id
                || $environment->id === (['test' => 'dev', 'live' => 'test'][$target->id] ?? null)) {
                $codeLogs[$environment->id] = $this->codeLog($environment);
            }
        }
        $parent = ['test' => 'dev', 'live' => 'test'][$target->id] ?? null;
        return [
            'site' => ['id' => $site->id, 'name' => $site->getName(),
                'native_attributes' => $this->attributes($site)],
            'environment' => $target->serialize(),
            'environment_id' => $target->id,
            'resource_id' => $site->id . '.' . $target->id,
            'environments' => $environments,
            'code_logs' => $codeLogs,
            'target_code_sha256' => self::canonicalHash($codeLogs[$target->id] ?? []),
            'promotion_source_environment' => $parent,
            'promotion_source_code_sha256' => $parent === null
                ? null : self::canonicalHash($codeLogs[$parent] ?? []),
            'backups' => $this->backups($target, $transport),
            'native_connections' => [
                'ssh' => $target->sshConnectionInfo(),
                'git' => $target->gitConnectionInfo(),
            ],
        ];
    }

    private function backups(Environment $target, SingleAttemptRequest $transport): array
    {
        $rows = [];
        foreach ($target->getBackups()->all() as $backup) {
            $backup->setRequest($transport);
            $rows[] = $this->backupSnapshot($backup);
        }
        return $rows;
    }

    private function selectedBackup(Environment $target, array $input, SingleAttemptRequest $transport): Backup
    {
        $backup = $target->getBackups()->getBackupByFileName($input['backup_file']);
        $backup->setRequest($transport);
        if (!$backup instanceof Backup || $backup->get('filename') !== $input['backup_file']) {
            throw new \RuntimeException('Native backup filename differs from the selected original file.');
        }
        if (!$backup->backupIsFinished()) {
            throw new \RuntimeException('The selected original backup is still being created.');
        }
        $element = $input['backup_element'] ?? 'all';
        if (!in_array($backup->get('type'), ['code', 'files', 'database'], true)
            || ($element !== 'all' && $backup->get('type') !== $element)) {
            throw new \InvalidArgumentException('Native backup component differs from the selected component.');
        }
        return $backup;
    }

    private function backupSnapshot(Backup $backup): array
    {
        return [
            'id' => $backup->id, 'file' => $backup->get('filename'),
            'type' => $backup->get('type'), 'bytes' => $backup->get('size'),
            'finished' => $backup->backupIsFinished(),
            'native_attributes' => $this->attributes($backup),
            'native_serialized' => $backup->serialize(),
        ];
    }

    private function codeLog(Environment $environment): array
    {
        return array_values($environment->getCommits()->serialize());
    }

    private function sourceGuard(Environment $source, array $input): array
    {
        $rows = $this->codeLog($source);
        $digest = self::canonicalHash($rows);
        $head = $rows[0]['hash'] ?? null;
        if (isset($input['expected_source_code_sha256'])
            && !hash_equals($input['expected_source_code_sha256'], $digest)) {
            throw new \RuntimeException('The native source code log changed after the selected observation.');
        }
        if (isset($input['expected_source_commit'])
            && (!is_string($head) || strtolower($head) !== $input['expected_source_commit'])) {
            throw new \RuntimeException('The current native source commit differs from the selected commit.');
        }
        return ['environment_id' => $source->id, 'code_log' => $rows,
            'code_sha256' => $digest, 'head_commit' => $head];
    }

    private function recoveredWorkflow(object $attributes, array $input, array $dispatch): array
    {
        // Parsing an already received result uses the exact original native
        // model implementation and never fetches the site or starts a workflow.
        $this->runtime();
        $site = $this->native(Site::class, [(object)['id' => $input['site_id']]]);
        $workflow = $this->native(Workflow::class, [$attributes, ['site' => $site]]);
        return $this->workflowSnapshot($workflow, $input, $dispatch['form_params']['type'] ?? null);
    }

    private function workflowSnapshot(Workflow $workflow, array $input, ?string $expectedType): array
    {
        $attributes = $this->attributes($workflow);
        $id = (string)$workflow->id;
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/Di', $id)
            || (isset($input['workflow_id']) && strtolower($id) !== $input['workflow_id'])) {
            throw new \RuntimeException('Native workflow identity differs from the selected original UUID.');
        }
        $environment = $workflow->get('environment');
        $nativeEnvironmentPresent = $environment !== null;
        // A workflow-create response can contain only its new UUID. Its native
        // collection endpoint already names the selected environment exactly.
        // An inspection must instead report the fetched workflow's own target.
        if ($environment === null && $input['action'] !== 'workflow-inspect') {
            $environment = $input['environment_id'];
        }
        if (!is_string($environment) || $environment !== $input['environment_id']) {
            throw new \RuntimeException('Native workflow belongs to a different target environment.');
        }
        $type = $workflow->get('type');
        if ($type !== null && $expectedType !== null && $type !== $expectedType) {
            throw new \RuntimeException('Native workflow type differs from the selected original action.');
        }
        $serialized = $workflow->serialize();
        return [
            'id' => $id, 'site_id' => $input['site_id'],
            'environment_id' => $environment, 'env' => $environment,
            'native_environment_present' => $nativeEnvironmentPresent,
            'environment_origin' => $nativeEnvironmentPresent ? 'native_workflow_attributes' : 'native_workflow_request_path',
            'type' => $type ?? $expectedType,
            'native_type_present' => $type !== null,
            'params' => $workflow->get('params'),
            'status' => $workflow->getStatus(),
            'finished' => $workflow->isFinished(),
            'successful' => $workflow->isSuccessful(),
            'native_attributes' => $attributes,
            'native_serialized' => $serialized,
            'operations' => $serialized['operations'],
        ];
    }

    private function requireInitialized(Environment $environment, string $role): void
    {
        if (!$environment->isInitialized()) {
            throw new \InvalidArgumentException('Initialize the selected native ' . $role . ' before this action.');
        }
    }

    private function completed(ReceiptJournal $journal, array $runtime, array $data): array
    {
        return array_replace($journal->base(), [
            'ok' => true, 'state' => 'completed', 'runtime' => $runtime,
            'data' => $data, 'received_at' => ReceiptJournal::now(),
        ]);
    }

    private function attributes(TerminusModel $model): object
    {
        return (new \ReflectionProperty(TerminusModel::class, 'attributes'))->getValue($model);
    }

    private function native(string $class, array $arguments = []): object
    {
        $name = uniqid('govhub-', true);
        $definition = $this->getContainer()->add($name, $class);
        if ($arguments !== []) {
            $definition->addArguments($arguments);
        }
        return $this->getContainer()->get($name);
    }

    private static function canonical(mixed $value): mixed
    {
        if (is_object($value)) {
            $value = (array)$value;
            ksort($value, SORT_STRING);
            return (object)array_map([self::class, 'canonical'], $value);
        }
        if (is_array($value)) {
            if (!array_is_list($value)) {
                ksort($value, SORT_STRING);
            }
            return array_map([self::class, 'canonical'], $value);
        }
        return $value;
    }

    private static function canonicalHash(mixed $value): string
    {
        // Matches the existing Python provider's json.dumps(sort_keys=True,
        // separators=(',', ':'), ensure_ascii=False) for native code-log rows.
        $json = json_encode(self::canonical($value), JSON_THROW_ON_ERROR
            | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            | JSON_UNESCAPED_LINE_TERMINATORS | JSON_PRESERVE_ZERO_FRACTION);
        return hash('sha256', $json);
    }

    private function privateRequest(mixed $path): string
    {
        if (!is_string($path) || $path === '' || $path[0] !== '/'
            || str_contains($path, "\0") || is_link($path)) {
            throw new \InvalidArgumentException('Supply --request with an absolute private ordinary JSON file.');
        }
        $file = fopen($path, 'rb');
        if ($file === false) {
            throw new \InvalidArgumentException('Cannot open the selected private request file.');
        }
        try {
            $stat = fstat($file);
            if ($stat === false || ($stat['mode'] & 0170000) !== 0100000
                || ($stat['mode'] & 0077) !== 0 || $stat['size'] < 2 || $stat['size'] > 1048576) {
                throw new \InvalidArgumentException('The request must be a private ordinary file of at most 1 MiB.');
            }
            $bytes = stream_get_contents($file, 1048577);
            if ($bytes === false || strlen($bytes) !== $stat['size']) {
                throw new \RuntimeException('The selected request file changed during receiving.');
            }
            return $bytes;
        } finally {
            fclose($file);
        }
    }

    private function validateRequest(string $bytes): array
    {
        $input = json_decode($bytes, true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($input) || array_is_list($input) || ($input['schema'] ?? null) !== ReceiptJournal::SCHEMA) {
            throw new \InvalidArgumentException('Select a govhub-pantheon-bridge/v1 JSON request object.');
        }
        $allowed = [
            'schema', 'operation_id', 'step_id', 'intent_sha256', 'action',
            'site_id', 'environment_id', 'source_environment_id', 'workflow_id',
            'expected_workflow_type', 'backup_file', 'backup_element', 'backup_keep_days',
            'deploy_note', 'run_updatedb', 'clear_cache', 'wordpress_from_url', 'wordpress_to_url',
            'expected_source_commit', 'expected_source_code_sha256', 'allow_initialize', 'timeout_seconds',
        ];
        foreach (array_keys($input) as $key) {
            if (!in_array($key, $allowed, true)) {
                throw new \InvalidArgumentException('Unknown bridge request field: ' . $key);
            }
        }
        foreach (['operation_id', 'step_id'] as $key) {
            if (!is_string($input[$key] ?? null)
                || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/D', $input[$key])) {
                throw new \InvalidArgumentException('Supply the original ' . $key . '.');
            }
        }
        if (!is_string($input['intent_sha256'] ?? null)
            || !preg_match('/^[a-f0-9]{64}$/D', $input['intent_sha256'])) {
            throw new \InvalidArgumentException('Supply the original operation intent SHA-256.');
        }
        foreach (['site_id', 'workflow_id'] as $key) {
            if ($key === 'workflow_id' && !isset($input[$key])) {
                continue;
            }
            if (!is_string($input[$key] ?? null)
                || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D', $input[$key])) {
                throw new \InvalidArgumentException('Supply the native lowercase ' . $key . ' UUID.');
            }
        }
        foreach (['environment_id', 'source_environment_id'] as $key) {
            if ($key === 'source_environment_id' && !isset($input[$key])) {
                continue;
            }
            if (!is_string($input[$key] ?? null)
                || !preg_match('/^[a-z0-9][a-z0-9-]{0,62}$/D', $input[$key])) {
                throw new \InvalidArgumentException('Supply the native ' . $key . ' without a site prefix.');
            }
        }
        if (!is_string($input['action'] ?? null) || !in_array($input['action'], self::ACTIONS, true)) {
            throw new \InvalidArgumentException('Select a supported native bridge action.');
        }
        foreach (['run_updatedb', 'clear_cache', 'allow_initialize'] as $key) {
            if (array_key_exists($key, $input) && !is_bool($input[$key])) {
                throw new \InvalidArgumentException($key . ' must be a JSON boolean.');
            }
        }
        foreach (['backup_keep_days' => [1, 3650], 'timeout_seconds' => [10, 7200]] as $key => [$min, $max]) {
            if (array_key_exists($key, $input)
                && (!is_int($input[$key]) || $input[$key] < $min || $input[$key] > $max)) {
                throw new \InvalidArgumentException($key . ' is outside its supported integer range.');
            }
        }
        if (isset($input['backup_element'])
            && !in_array($input['backup_element'], ['all', 'code', 'files', 'database'], true)) {
            throw new \InvalidArgumentException('Select all, code, files or database for backup_element.');
        }
        foreach (['backup_file' => 1024, 'deploy_note' => 2000, 'expected_workflow_type' => 100] as $key => $limit) {
            if (array_key_exists($key, $input)
                && (!is_string($input[$key]) || $input[$key] === '' || strlen($input[$key]) > $limit
                    || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f]/', $input[$key]))) {
                throw new \InvalidArgumentException('Supply a valid ' . $key . '.');
            }
        }
        if (isset($input['backup_file'])
            && (str_contains($input['backup_file'], '/') || str_contains($input['backup_file'], '\\'))) {
            throw new \InvalidArgumentException('Select an exact native backup filename, without a path.');
        }
        if (isset($input['expected_source_commit'])
            && (!is_string($input['expected_source_commit'])
                || !preg_match('/^[a-f0-9]{40}$/D', $input['expected_source_commit']))) {
            throw new \InvalidArgumentException('Supply an exact native source Git commit.');
        }
        if (isset($input['expected_source_code_sha256'])
            && (!is_string($input['expected_source_code_sha256'])
                || !preg_match('/^[a-f0-9]{64}$/D', $input['expected_source_code_sha256']))) {
            throw new \InvalidArgumentException('Supply the observed native source code-log SHA-256.');
        }
        if (isset($input['wordpress_from_url']) !== isset($input['wordpress_to_url'])) {
            throw new \InvalidArgumentException('Supply both original WordPress source and target URLs.');
        }
        // Native env:clone-content treats these as paired search/replacement
        // strings, including bare hostnames and path-bearing values.
        foreach (['wordpress_from_url', 'wordpress_to_url'] as $key) {
            if (isset($input[$key])
                && (!is_string($input[$key]) || strlen($input[$key]) > 2048
                    || preg_match('/[\x00-\x1f\x7f]/', $input[$key]))) {
                throw new \InvalidArgumentException('Supply ordinary WordPress replacement text for ' . $key . '.');
            }
        }
        if ($input['action'] === 'workflow-inspect' && !isset($input['workflow_id'])) {
            throw new \InvalidArgumentException('Workflow inspection requires the exact original workflow UUID.');
        }
        if (in_array($input['action'], ['pantheon-backup-download', 'pantheon-restore-backup'], true)
            && !isset($input['backup_file'])) {
            throw new \InvalidArgumentException('Select the exact original backup_file.');
        }
        if (in_array($input['action'], ['pantheon-deploy-code', 'pantheon-clone-files', 'pantheon-clone-database'], true)
            && !isset($input['source_environment_id'])) {
            throw new \InvalidArgumentException('Select the original source_environment_id.');
        }
        return $input;
    }

    private function runtime(): array
    {
        $version = (string)$this->getConfig()->get('version');
        if ($version !== self::TERMINUS_VERSION) {
            throw new \RuntimeException('Receive Terminus ' . self::TERMINUS_VERSION . ' for this plugin version.');
        }
        $contracts = [];
        foreach (self::NATIVE_BLOBS as $class => $expected) {
            $path = (new \ReflectionClass($class))->getFileName();
            $bytes = $path === false ? false : file_get_contents($path);
            if ($bytes === false) {
                throw new \RuntimeException('Cannot read the original native model: ' . $class);
            }
            $actual = sha1('blob ' . strlen($bytes) . "\0" . $bytes);
            if (!hash_equals($expected, $actual)) {
                throw new \RuntimeException('Native source differs from Terminus 4.3.3: ' . $class);
            }
            $contracts[] = ['class' => $class, 'git_blob_sha1' => $actual, 'bytes' => strlen($bytes)];
        }
        $root = dirname(__DIR__);
        $files = [];
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(
            $root . '/src', \FilesystemIterator::SKIP_DOTS
        ));
        foreach ($iterator as $file) {
            if ($file->isLink()) {
                throw new \RuntimeException('Received bridge PHP source cannot be a symbolic link.');
            }
            if ($file->isFile() && strtolower($file->getExtension()) === 'php') {
                $files[] = [
                    'path' => substr($file->getPathname(), strlen($root) + 1),
                    'bytes' => $file->getSize(), 'sha256' => hash_file('sha256', $file->getPathname()),
                ];
            }
        }
        usort($files, fn($a, $b) => strcmp($a['path'], $b['path']));
        return [
            'plugin_version' => self::VERSION, 'terminus_version' => $version,
            'terminus_commit' => self::TERMINUS_COMMIT,
            'php_version' => PHP_VERSION, 'php_binary' => PHP_BINARY,
            'plugin_root' => $root, 'source_files' => $files, 'native_contracts' => $contracts,
        ];
    }

    private function emit(array $result): int
    {
        $this->output()->writeln(ReceiptJournal::json($result));
        return match ($result['state'] ?? 'rejected') {
            'completed', 'submitted' => 0,
            'uncertain' => 3,
            default => 2,
        };
    }
}
