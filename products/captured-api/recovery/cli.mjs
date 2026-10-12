#!/usr/bin/env node
// MIT. Complete offline operating recovery through the original captured product entrypoint.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectCapturedRecovery, prepareCapturedRecoveryPlan, inspectCapturedRecoveryPlan,
  captureCapturedRecovery, verifyCapturedRecovery, restoreCapturedRecovery,
  reviewRecoveredCapturedApi, receiveRecoveredCapturedApi, capturedRecoveryStatus,
  recoveredCapturedApiSelection } from './workspace.mjs';
import { need, failure } from './model.mjs';

const HELP = [
  'Captured API operating recovery',
  '',
  '  starforge captured-api recovery inspect --dir PRIVATE_PRODUCT',
  '       [--selection PRIVATE_SELECTION.json]',
  '  starforge captured-api recovery plan --dir PRIVATE_PRODUCT --plan NEW_PLAN.json',
  '       [--selection PRIVATE_SELECTION.json] --quiesced',
  '  starforge captured-api recovery inspect-plan --plan ORIGINAL_PLAN.json',
  '  starforge captured-api recovery capture --plan ORIGINAL_PLAN.json',
  '       --out NEW_ENCRYPTED_BUNDLE --operation CAPTURE_OPERATION',
  '       --sha256 PLAN_SHA256 --pass-env CAPTURED_RECOVERY_PASSPHRASE --quiesced',
  '  starforge captured-api recovery verify --bundle ENCRYPTED_BUNDLE',
  '       [--sha256 SNAPSHOT_SHA256] --pass-env CAPTURED_RECOVERY_PASSPHRASE',
  '  starforge captured-api recovery restore --bundle ENCRYPTED_BUNDLE',
  '       --operation RESTORE_OPERATION --sha256 SNAPSHOT_SHA256',
  '       --pass-env CAPTURED_RECOVERY_PASSPHRASE',
  '  starforge captured-api recovery inspect-restore --restore-operation RESTORE_OPERATION',
  '  starforge captured-api recovery receive-review --restore-operation RESTORE_OPERATION',
  '       --targets PRIVATE_TARGETS.json --operation RECEIVING_OPERATION',
  '  starforge captured-api recovery receive --restore-operation RESTORE_OPERATION',
  '       --targets PRIVATE_TARGETS.json --operation RECEIVING_OPERATION',
  '       --review-sha256 REVIEW_SHA256 --quiesced',
  '  starforge captured-api recovery status --operation ORIGINAL_OPERATION',
  '  starforge captured-api recovery open --operation COMPLETED_RECEIVING_OPERATION',
  '       [--port 0] [--mcp-port 0] [--token-env MCP_ACCESS_TOKEN] [--browser-only]',
  '',
  'A selection file supplies schema stellar-forge.captured-api-recovery-selection.v1,',
  'directory, optional additionalRoots [{name,path}], and optional sourceArchive.',
  'It can supply directory instead of --dir. The complete native product, declared',
  'source/release/export inputs and browser OAuth stores are selected from their',
  'original configuration. Add external provider workspace roots explicitly.',
  '',
  'A receiving targets file uses schema stellar-forge.captured-api-recovery-targets.v1,',
  'sourcePlanSha256 and destinationParents. Receiving creates original absolute paths',
  'inside those existing private parents. Keep the original product and its selected',
  'writers stopped through capture or receiving; --quiesced records that selection.',
  '',
  'SF101 owns encryption, complete authentication and native restoration. Use a',
  'private environment passphrase of at least 16 UTF-8 bytes. Keep the whole encrypted',
  'bundle and its manifest SHA-256. Repeat an operation with its original directories',
  'and complete request to resume. status returns the retained result after a lost reply.',
  '',
  'The open command delegates to the ordinary captured-api open lifecycle and keeps',
  'its original browser/MCP/Stop behavior. Read products/captured-api/RECOVERY.md for',
  'the complete selection, disaster receiving and cold-reopen walkthrough.',
  '',
].join('\n');
const COMMANDS = {
  inspect: { values: ['--dir','--selection'], required: [] },
  plan: { values: ['--dir','--selection','--plan'], switches: ['--quiesced'], required: ['--plan'] },
  'inspect-plan': { values: ['--plan'], required: ['--plan'] },
  capture: { values: ['--plan','--out','--operation','--sha256','--pass-env'], switches: ['--quiesced'],
    required: ['--plan','--out','--operation','--sha256','--pass-env'] },
  verify: { values: ['--bundle','--sha256','--pass-env'], required: ['--bundle','--pass-env'] },
  restore: { values: ['--bundle','--operation','--sha256','--pass-env'],
    required: ['--bundle','--operation','--sha256','--pass-env'] },
  'inspect-restore': { values: ['--restore-operation'], required: ['--restore-operation'] },
  'receive-review': { values: ['--restore-operation','--targets','--operation'],
    required: ['--restore-operation','--targets','--operation'] },
  receive: { values: ['--restore-operation','--targets','--operation','--review-sha256'], switches: ['--quiesced'],
    required: ['--restore-operation','--targets','--operation','--review-sha256'] },
  status: { values: ['--operation'], required: ['--operation'] },
  open: { values: ['--operation','--port','--mcp-port','--token-env'], switches: ['--browser-only'],
    required: ['--operation'] },
};
function parseArgs(args, definition) {
  const found = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    need(!found.has(key) && (definition.values.includes(key) || definition.switches?.includes(key)),
      'CAPTURED_RECOVERY_ARGUMENTS', 'Unknown or repeated option: ' + key, 400);
    if (definition.switches?.includes(key)) { found.set(key, true); continue; }
    const value = args[++i];
    need(typeof value === 'string' && value.length > 0 && !value.startsWith('--'),
      'CAPTURED_RECOVERY_ARGUMENTS', 'Supply the original value for ' + key + '.', 400);
    found.set(key, value);
  }
  for (const key of definition.required)
    need(found.has(key), 'CAPTURED_RECOVERY_ARGUMENTS', 'Supply ' + key + '.', 400);
  return found;
}
export async function runCapturedRecoveryCLI(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && ['help','--help'].includes(args[0])) {
    process.stdout.write(HELP); return;
  }
  const [command, ...rest] = args, definition = COMMANDS[command];
  if (!definition) throw failure('CAPTURED_RECOVERY_ARGUMENTS', 'Unknown recovery command. Use --help.', 400);
  const input = parseArgs(rest, definition), value = key => input.get(key);
  let result;
  if (command === 'inspect' || command === 'plan') {
    need(input.has('--dir') || input.has('--selection'), 'CAPTURED_RECOVERY_ARGUMENTS',
      'Select --dir or the original --selection declaration.', 400);
    const selected = { directory: value('--dir'), selectionFile: value('--selection') };
    result = command === 'inspect' ? await inspectCapturedRecovery(selected)
      : await prepareCapturedRecoveryPlan({ ...selected, planFile: value('--plan'), quiesced: input.has('--quiesced') });
  } else if (command === 'inspect-plan') result = await inspectCapturedRecoveryPlan(value('--plan'));
  else if (command === 'capture') result = await captureCapturedRecovery({
    planFile: value('--plan'), bundleDirectory: value('--out'), operationDirectory: value('--operation'),
    expectedPlanSha256: value('--sha256'), passphraseEnv: value('--pass-env'), quiesced: input.has('--quiesced') });
  else if (command === 'verify') result = await verifyCapturedRecovery({
    bundleDirectory: value('--bundle'), expectedManifestSha256: value('--sha256'), passphraseEnv: value('--pass-env') });
  else if (command === 'restore') result = await restoreCapturedRecovery({
    bundleDirectory: value('--bundle'), operationDirectory: value('--operation'),
    expectedManifestSha256: value('--sha256'), passphraseEnv: value('--pass-env') });
  else if (command === 'inspect-restore') result = await reviewRecoveredCapturedApi({
    restoreOperation: value('--restore-operation') });
  else if (command === 'receive-review') result = await reviewRecoveredCapturedApi({
    restoreOperation: value('--restore-operation'), targetFile: value('--targets'), operationDirectory: value('--operation') });
  else if (command === 'receive') result = await receiveRecoveredCapturedApi({
    restoreOperation: value('--restore-operation'), targetFile: value('--targets'), operationDirectory: value('--operation'),
    expectedReviewSha256: value('--review-sha256'), quiesced: input.has('--quiesced') });
  else if (command === 'status') result = await capturedRecoveryStatus(value('--operation'));
  else if (command === 'open') {
    const selected = await recoveredCapturedApiSelection(value('--operation'));
    const forwarded = ['open', '--dir', selected.product.directory];
    for (const key of ['--port','--mcp-port','--token-env']) if (input.has(key)) forwarded.push(key, value(key));
    if (input.has('--browser-only')) forwarded.push('--browser-only');
    return (await import('../cli.mjs')).main(forwarded);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runCapturedRecoveryCLI().catch(error => {
    process.stderr.write((error.code ?? 'CAPTURED_RECOVERY_FAILED') + ': ' + error.message + '\n');
    process.exitCode = 1;
  });
