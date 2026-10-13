#!/usr/bin/env php
<?php
declare(strict_types=1);
// SPDX-License-Identifier: MIT
require_once __DIR__ . '/lib/NativeProject.php';
use Tjl\CatalogueWorkspace\Handover\Files;
use Tjl\CatalogueWorkspace\Handover\NativeProject;

if (PHP_SAPI !== 'cli') { throw new RuntimeException('Use the original native CLI.'); }
$options = getopt('', ['phase:', 'configuration:', 'work-directory:', 'operation-id:', 'archive:', 'key-file:', 'expect-target:', 'output:', 'help']);
if (isset($options['help'])) {
    echo "Complete native catalogue project handover\n\n"
        . "--phase=inspect|export|review|receive|reopen|recover|status\n"
        . "--configuration=/private/native-config.json --work-directory=/private/original-operation\n"
        . "--operation-id=<same-id> --output=/private/original-result.json\n"
        . "export/review: --archive=/private/original.native --key-file=/private/original.key\n"
        . "receive/reopen/recover: --expect-target=<actual-review-sha256> --key-file=/private/original.key\n"
        . "Read NATIVE_PROJECT_HANDOVER.md before selecting native maintenance/database commands.\n";
    exit(0);
}
$project = null;
try {
    foreach (['phase', 'configuration', 'work-directory', 'operation-id', 'output'] as $field) {
        if (!is_string($options[$field] ?? null) || $options[$field] === '') { throw new InvalidArgumentException('Missing --' . $field); }
    }
    $phase = $options['phase'];
    if (!in_array($phase, ['inspect', 'export', 'review', 'receive', 'reopen', 'recover', 'status'], true)) { throw new InvalidArgumentException('Unknown native phase.'); }
    $project = new NativeProject($options['configuration'], $options['work-directory'], $options['operation-id']);
    $key = in_array($phase, ['export', 'review', 'receive', 'reopen', 'recover'], true)
        ? Files::key($options['key-file'] ?? '') : null;
    $result = match ($phase) {
        'inspect' => $project->inspect(),
        'status' => $project->status(),
        'export' => $project->export($options['archive'] ?? '', $key),
        'review' => $project->review($options['archive'] ?? '', $key),
        'receive' => $project->receive($key, $options['expect-target'] ?? ''),
        'reopen' => $project->reopen($key, $options['expect-target'] ?? ''),
        'recover' => $project->recover($key, $options['expect-target'] ?? ''),
    };
    $envelope = ['schema' => 'tjl.catalogue.native-project-result.v1', 'ok' => true, 'phase' => $phase,
        'operation_id' => $options['operation-id'], 'result' => $result];
    Files::writeJson($options['output'], $envelope);
    echo Files::json(['ok' => true, 'phase' => $phase, 'output' => $options['output'],
        'sha256' => hash_file('sha256', $options['output'])]) . "\n";
    exit(0);
} catch (Throwable $error) {
    $envelope = ['schema' => 'tjl.catalogue.native-project-result.v1', 'ok' => false,
        'phase' => $options['phase'] ?? null, 'operation_id' => $options['operation-id'] ?? null,
        'error' => ['type' => get_class($error), 'message' => $error->getMessage(),
            'reason' => $error instanceof \Tjl\CatalogueWorkspace\Handover\HandoverFailure ? $error->reason : 'NATIVE_PROJECT_ATTENTION'],
        'state' => $project?->status()];
    if (is_string($options['output'] ?? null)) { Files::writeJson($options['output'], $envelope); }
    fwrite(STDERR, Files::json(['ok' => false, 'error' => $envelope['error'], 'output' => $options['output'] ?? null]) . "\n");
    exit(1);
}
