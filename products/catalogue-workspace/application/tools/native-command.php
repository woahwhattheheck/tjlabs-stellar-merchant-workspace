<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
require_once __DIR__ . '/lib/Archive.php';
use Tjl\CatalogueWorkspace\Handover\Files;

/** One original admitted native command; durable result survives controller loss. */
if (PHP_SAPI !== 'cli' || $argc !== 2) { fwrite(STDERR, "Use the original private command request.\n"); exit(64); }
$requestPath = realpath($argv[1]);
if ($requestPath === false || is_link($argv[1])) { throw new RuntimeException('Original command request is unavailable.'); }
$request = Files::readJson($requestPath);
$directory = dirname($requestPath);
$lockPath = $directory . '/worker.lock';
if (is_link($lockPath)) { throw new RuntimeException('Original command lock is linked.'); }
$lock = fopen($lockPath, 'c+b');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) { exit(75); }
chmod($lockPath, 0600);
try {
    $identity = hash_file('sha256', $requestPath);
    $resultPath = $directory . '/result.json';
    if (is_file($resultPath)) {
        $result = Files::readJson($resultPath);
        if (($result['request_sha256'] ?? null) !== $identity) { throw new RuntimeException('Original command receipt changed identity.'); }
        exit((int) $result['returncode']);
    }
    $workerPath = $directory . '/worker.json';
    if (is_file($workerPath)) {
        // The previous actual command may have outlived its wrapper. Never infer its exit or repeat it.
        fwrite(STDERR, "Original native command has no completed receipt; reconcile its actual process and result.\n");
        exit(75);
    }
    $argvNative = $request['argv'] ?? null;
    if (!is_array($argvNative) || !$argvNative || !array_is_list($argvNative)) { throw new RuntimeException('Original argv is required.'); }
    foreach ($argvNative as $arg) {
        if (!is_string($arg) || str_contains($arg, "\0")) { throw new RuntimeException('Invalid native argv.'); }
    }
    $record = ['schema' => 'tjl.catalogue.native-command-worker.v1', 'request_sha256' => $identity,
        'pid' => getmypid(), 'state' => 'PREPARED', 'started_at' => gmdate(DATE_ATOM)];
    Files::writeJson($workerPath, $record);
    $outPath = $directory . '/stdout.bin'; $errPath = $directory . '/stderr.bin';
    $out = fopen($outPath, 'xb'); $err = fopen($errPath, 'xb');
    if ($out === false || $err === false) { throw new RuntimeException('Original command output already exists or is unavailable.'); }
    chmod($outPath, 0600); chmod($errPath, 0600);
    $stdin = $request['stdin'] ?? '/dev/null';
    if (!is_file($stdin) && $stdin !== '/dev/null') { throw new RuntimeException('Original native command input is unavailable.'); }
    $descriptors = [0 => ['file', $stdin, 'rb'], 1 => $out, 2 => $err, 3 => $lock];
    // FD4 is inherited by this wrapper from the original whole-project controller.
    $operationLock = @fopen('php://fd/4', 'r+');
    if (is_resource($operationLock)) { $descriptors[4] = $operationLock; }
    $process = proc_open($argvNative, $descriptors, $pipes, $request['cwd'], null, ['bypass_shell' => true]);
    if (!is_resource($process)) { throw new RuntimeException('Native command could not start.'); }
    $status = proc_get_status($process);
    $record['child_pid'] = $status['pid'];
    $record['state'] = 'RUNNING';
    Files::writeJson($workerPath, $record);
    $code = proc_close($process);
    if ($code === -1 && $status['running'] === false && is_int($status['exitcode']) && $status['exitcode'] >= 0) { $code = $status['exitcode']; }
    if ($code < 0) { throw new RuntimeException('Native exit status is unavailable; retain the original command for reconciliation.'); }
    fflush($out); fflush($err); fsync($out); fsync($err); fclose($out); fclose($err);
    $file = static fn (string $p): array => ['path' => $p, 'bytes' => filesize($p), 'sha256' => hash_file('sha256', $p)];
    $result = ['schema' => 'tjl.catalogue.native-command-result.v1', 'request_sha256' => $identity,
        'argv' => $argvNative, 'cwd' => $request['cwd'], 'returncode' => $code, 'child_pid' => $record['child_pid'],
        'started_at' => $record['started_at'], 'completed_at' => gmdate(DATE_ATOM),
        'stdout' => $file($outPath), 'stderr' => $file($errPath)];
    Files::writeJson($resultPath, $result);
    exit($code === 0 ? 0 : 1);
} finally {
    // Close only this reference. An actual child retains the same original lock if this wrapper is interrupted.
    fclose($lock);
}
