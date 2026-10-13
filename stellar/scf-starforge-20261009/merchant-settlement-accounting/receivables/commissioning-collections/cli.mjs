#!/usr/bin/env node
// MIT. Commissioning collections use the existing accounting owner and original operation journal.
import {constants} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {open, mkdir, lstat} from 'node:fs/promises';
import {isAbsolute, join, resolve, dirname, basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openAccountingWorkspace} from '../../workspace/store.mjs';
import {accountingWorkspaceBinding} from '../../workspace/binding.mjs';
import {ReceivablesWorkspace} from '../store.mjs';
import {XeroReceivablesWorkspace} from '../xero/store.mjs';
import {CommissioningCollectionsWorkspace} from './workspace.mjs';
import {commissioningCaptureArguments, commissioningImportArguments} from './client.mjs';
import {json, need, renderCustomerTar} from '../core.mjs';

const REQUEST_BYTES = 32 * 1024 * 1024;
const SOURCE_BYTES = 8 * 1024 * 1024;
const OPERATION_SCHEMA = 'stellar-forge.commissioning-operation.v1';
const ACTIONS = new Set(['source-import', 'capture']);
const COMMANDS = new Set(['serve', 'inspect', 'import', 'sources', 'source', 'source-file', 'candidates',
  'preview', 'capture', 'captures', 'detail', 'file', 'export', 'request', 'prepare', 'execute', 'reconcile']);
const HELP = 'Commissioning sources, milestone collections and immutable customer handovers\n\n' +
  'starforge commissioning-collections serve --directory /private/accounting [--port 8452]\n' +
  'starforge commissioning-collections inspect --directory /private/accounting --file /private/workshares.json [--input /private/source-controls.json] --out /private/new-inspection.json\n' +
  'starforge commissioning-collections import --directory /private/accounting --input /private/source-import.json\n' +
  'starforge commissioning-collections sources --directory /private/accounting [--search TEXT] [--project PROJECT_ID] [--offset 0 --limit 100]\n' +
  'starforge commissioning-collections source --directory /private/accounting --source SOURCE_UUID [--view summary|projects|history] [--search TEXT]\n' +
  'starforge commissioning-collections source-file --directory /private/accounting --source SOURCE_UUID --name SOURCE_FILE --out /private/new-source.json\n' +
  'starforge commissioning-collections candidates --directory /private/accounting --view customers|invoices|allocations|credits|receipts|refunds|xeroCycles [--source SOURCE_UUID --project PROJECT_ID --customer CUSTOMER_UUID --as-of YYYY-MM-DD]\n' +
  'starforge commissioning-collections preview --directory /private/accounting --source SOURCE_UUID --input /private/cohort-selection.json --out /private/new-preview.json\n' +
  'starforge commissioning-collections capture --directory /private/accounting --source SOURCE_UUID --input /private/reviewed-capture.json\n' +
  'starforge commissioning-collections captures --directory /private/accounting [--source SOURCE_UUID --project PROJECT_ID --customer CUSTOMER_UUID --status READY|REVIEW]\n' +
  'starforge commissioning-collections detail --directory /private/accounting --capture CAPTURE_UUID\n' +
  'starforge commissioning-collections file --directory /private/accounting --capture CAPTURE_UUID --name commissioning-review.json --out /private/new-review.json\n' +
  'starforge commissioning-collections export --directory /private/accounting --capture CAPTURE_UUID --out /private/new-handover [--format directory|tar|json]\n' +
  'starforge commissioning-collections request --directory /private/accounting --request-id ORIGINAL_REQUEST_ID\n\n' +
  'Save each mutation before submitting it:\n' +
  'starforge commissioning-collections prepare --action source-import --input /private/source-input.json --inspection /private/new-inspection.json --actor OPERATOR --out /private/new-import-operation.json\n' +
  '  Add --file /private/workshares.json when the input contains source controls without file bytes.\n' +
  'starforge commissioning-collections prepare --action capture --preview /private/new-preview.json --actor OPERATOR --out /private/new-capture-operation.json\n' +
  'starforge commissioning-collections execute --directory /private/accounting --operation /private/new-capture-operation.json --out /private/new-capture-result.json\n' +
  'starforge commissioning-collections reconcile --directory /private/accounting --operation /private/new-capture-operation.json\n\n' +
  'prepare saves one complete private operation, its original source/capture selection, requestId and intent SHA.\n' +
  'Use --request-id to choose a stable identifier; otherwise prepare creates one once and saves it.\n' +
  'execute submits once. reconcile reads the original journal without resubmitting the mutation.\n' +
  'After native reopen recovery, execute the same saved operation to retrieve its original recorded result.\n' +
  'Every paged read accepts --offset/--limit; --all true retains all pages from one unchanged workspace revision.\n' +
  'Original source input is UTF-8 partner-commissioning-workshares/v1 JSON, at most 8 MiB.\n' +
  'The source controls retain currencyScales, expectedSha256, label, receivedAt and replacesSourceId.\n' +
  'Capture selections retain explicit invoice-line, allocation, credit, receipt and refund portions and baselineCaptureId.\n' +
  'Use --expected-workspace-id and --expected-sources-sha256 to bind an existing accounting workspace.\n' +
  'Initialization inputs, when needed: --outbox DIRECTORY --proof-dir DIRECTORY --terms FILE [--recovered-dir DIRECTORY].\n';

export function parseCommissioningCollectionsArguments(argv) {
  const [command = 'help', ...rest] = argv, flags = {};
  const known = new Set(['directory', 'outbox', 'proof-dir', 'terms', 'recovered-dir', 'port',
    'source', 'capture', 'project', 'customer', 'as-of', 'view', 'search', 'status', 'offset', 'limit', 'all',
    'input', 'file', 'name', 'out', 'format', 'preview', 'inspection', 'action', 'operation', 'actor', 'request-id',
    'expected-workspace-id', 'expected-sources-sha256']);
  for (let i = 0; i < rest.length; i += 2) {
    need(/^--[a-z-]+$/.test(rest[i]) && known.has(rest[i].slice(2)) &&
      rest[i + 1] !== undefined && !rest[i + 1].startsWith('--'),
      'INVALID_COMMISSIONING_ARGUMENT', 'Use a documented option followed by its value.');
    const key = rest[i].slice(2);
    need(!Object.hasOwn(flags, key), 'DUPLICATE_COMMISSIONING_ARGUMENT', 'Supply each option once.');
    flags[key] = rest[i + 1];
  }
  return {command, flags};
}
function absolute(value, label) {
  need(typeof value === 'string' && isAbsolute(value) && value === resolve(value) && value !== '/',
    'ABSOLUTE_PATH_REQUIRED', 'Use an absolute normalized ' + label + ' path.');
  return value;
}
async function inputBytes(path, label, maximum = REQUEST_BYTES) {
  const handle = await open(absolute(path, label), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    need(stat.isFile() && stat.size > 0 && stat.size <= maximum,
      'INVALID_COMMISSIONING_INPUT', 'Select a nonempty regular input file within its original size limit.');
    const bytes = await handle.readFile();
    need(bytes.length <= maximum, 'COMMISSIONING_REQUEST_TOO_LARGE', 'The input exceeds its original size limit.');
    return bytes;
  } finally { await handle.close(); }
}
async function inputJson(path, label = 'request') {
  const bytes = await inputBytes(path, label);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { need(false, 'INVALID_COMMISSIONING_JSON', 'The ' + label + ' file must contain valid JSON.'); }
  need(value !== null && typeof value === 'object' && !Array.isArray(value),
    'INVALID_COMMISSIONING_JSON', 'Keep one complete JSON object for ' + label + '.');
  return value;
}
function requestSize(value) {
  need(Buffer.byteLength(JSON.stringify(value)) <= REQUEST_BYTES, 'COMMISSIONING_REQUEST_TOO_LARGE',
    'The complete encoded request exceeds 32 MiB.');
}
async function sourceInput(flags) {
  const value = flags.input ? await inputJson(flags.input) : {};
  if (flags.file) {
    need(value.file === undefined, 'COMMISSIONING_SOURCE_REPEATED', 'Select the original file in the input or with --file.');
    value.file = {name: basename(flags.file), dataBase64: (await inputBytes(flags.file, 'original source', SOURCE_BYTES)).toString('base64')};
  }
  requestSize(value);
  return value;
}
async function newFile(path, bytes) {
  const handle = await open(absolute(path, 'output'),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const valueDigest = value => digest(Buffer.from(json(value)));
function mutationContext(value) {
  need(value && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    typeof value.actor === 'string' && value.actor.trim() &&
    typeof value.requestId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value.requestId),
    'COMMISSIONING_OPERATION_CONTEXT', 'Keep the original revision, operator and stable request identifier.');
}
function nativeIntent(operation) {
  const action = operation.action === 'source-import' ? 'commissioning_source_imported' : 'commissioning_collections_captured';
  const value = operation.action === 'source-import' ? {...operation.value} :
    {...operation.value, commissioningSourceId: operation.sourceId};
  delete value.revision;
  return {action, intentSha256: valueDigest({action, value})};
}
function operationDocument(value) {
  need(value?.schema === OPERATION_SCHEMA && ACTIONS.has(value.action) &&
    value.value && typeof value.value === 'object' && !Array.isArray(value.value),
    'COMMISSIONING_OPERATION_FILE', 'Select the complete operation file produced by prepare.');
  mutationContext(value.value);
  need(/^[a-f0-9]{64}$/.test(value.requestSha256 ?? '') && value.requestSha256 === valueDigest(value.value),
    'COMMISSIONING_OPERATION_CHANGED', 'The saved original operation changed. Restore its retained request bytes.');
  if (value.action === 'capture') {
    need(typeof value.sourceId === 'string' && value.sourceId.length > 0 &&
      /^[a-f0-9]{64}$/.test(value.value.previewSha256 ?? ''),
      'COMMISSIONING_CAPTURE_OPERATION', 'Keep the original source identifier and reviewed capture SHA.');
  }
  const expected = nativeIntent(value);
  need(value.nativeAction === expected.action && value.nativeIntentSha256 === expected.intentSha256,
    'COMMISSIONING_OPERATION_CHANGED', 'The saved native action, source selector or original request intent changed.');
  requestSize(value.value);
  return value;
}
function ownerOptions(flags, operation) {
  const options = {directory: absolute(flags.directory, 'accounting workspace')};
  for (const [flag, key] of [['outbox', 'outboxDir'], ['proof-dir', 'proofDir'],
    ['terms', 'termsFile'], ['recovered-dir', 'recoveredDir']]) {
    if (flags[flag]) options[key] = absolute(flags[flag], flag);
  }
  for (const [flag, key] of [['expected-workspace-id', 'expectedWorkspaceId'],
    ['expected-sources-sha256', 'expectedSourcesSha256']]) {
    const retained = operation?.binding?.[key], supplied = flags[flag];
    need(!retained || !supplied || retained === supplied,
      'COMMISSIONING_OPERATION_WORKSPACE', 'The selected workspace differs from the saved operation binding.');
    if (retained || supplied) options[key] = retained || supplied;
  }
  return options;
}
function pageQuery(flags, extra = []) {
  const value = {};
  for (const [flag, key] of [['search', 'search'], ['offset', 'offset'], ['limit', 'limit'], ...extra]) {
    if (flags[flag] === undefined) continue;
    if (flag === 'offset' || flag === 'limit') {
      need(/^(0|[1-9][0-9]*)$/.test(flags[flag]), 'COMMISSIONING_PAGE', 'Use a nonnegative whole-number offset and a page limit from 1 to 200.');
      const number = Number(flags[flag]);
      need(Number.isSafeInteger(number) && (flag !== 'limit' || (number > 0 && number <= 200)),
        'COMMISSIONING_PAGE', 'Use a nonnegative whole-number offset and a page limit from 1 to 200.');
      value[key] = number;
    } else value[key] = flags[flag];
  }
  return value;
}
async function pages(read, query, all) {
  const first = await read(query);
  if (!all) return first;
  need(Array.isArray(first.items) && Number.isSafeInteger(first.total),
    'COMMISSIONING_PAGE_VIEW', 'Select a paged view when using --all true.');
  const items = [...first.items], initial = first.offset, revision = first.revision;
  let next = first.offset + first.items.length;
  while (next < first.total) {
    const page = await read({...query, offset: next, limit: query.limit ?? 200});
    need(page.revision === revision && page.total === first.total && page.offset === next && page.items?.length > 0,
      'COMMISSIONING_PAGES_CHANGED', 'The original workspace changed while the complete page set was being read.');
    items.push(...page.items); next += page.items.length;
  }
  return {...first, items, offset: initial, limit: items.length, complete: initial === 0 && items.length === first.total};
}
async function writeResult(flags, result, mutation, operationPath) {
  if (!flags.out) return;
  try { await newFile(flags.out, Buffer.from(json(result))); }
  catch (error) {
    if (mutation) {
      const cause = error.message;
      error.code = 'COMMISSIONING_RESULT_OUTPUT_FAILED';
      error.message = 'The original operation completed, but its local result file could not be written.';
      error.details = {output: flags.out, operationFile: operationPath ?? null, cause,
        requestId: result.operation?.id, operation: result.operation,
        sourceId: result.source?.id, captureId: result.capture?.id, revision: result.revision};
    }
    throw error;
  }
}
function exportNames(files) {
  const names = new Set();
  for (const file of files) {
    need(typeof file.name === 'string' && !file.name.includes('\\') &&
      file.name.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && part !== '.' && part !== '..') &&
      !names.has(file.name), 'COMMISSIONING_EXPORT_NAME', 'The original handover contains an invalid or repeated file path.');
    names.add(file.name);
  }
}
async function exportBundle(bundle, output, format) {
  need(['directory', 'tar', 'json'].includes(format),
    'COMMISSIONING_EXPORT_FORMAT', 'Choose directory, tar or json.');
  output = absolute(output, 'handover export');
  exportNames(bundle.files);
  if (format === 'tar') await newFile(output, renderCustomerTar(bundle.files));
  else if (format === 'json') await newFile(output, Buffer.from(json(bundle.value)));
  else {
    const parent = await lstat(dirname(output));
    need(parent.isDirectory() && !parent.isSymbolicLink(),
      'COMMISSIONING_EXPORT_PARENT', 'Choose an existing output parent directory.');
    await mkdir(output, {mode: 0o700});
    for (const file of bundle.files) {
      const target = join(output, file.name), parent = dirname(target);
      if (parent !== output) await mkdir(parent, {recursive: true, mode: 0o700});
      await newFile(target, file.bytes);
    }
  }
  return {path: output, format, revision: bundle.revision,
    files: bundle.files.map(file => ({name: file.name, type: file.type, bytes: file.bytes.length, sha256: digest(file.bytes)}))};
}
export async function runCommissioningCollectionsCli(argv = process.argv.slice(2)) {
  const {command, flags} = parseCommissioningCollectionsArguments(argv);
  if (command === 'help' || command === '--help') { process.stdout.write(HELP); return; }
  need(COMMANDS.has(command), 'UNKNOWN_COMMISSIONING_COMMAND', 'Choose a documented commissioning command.');
  need(flags.all === undefined || flags.all === 'true' || flags.all === 'false',
    'COMMISSIONING_ALL_PAGES', 'Use --all true or --all false.');
  if (command === 'prepare') {
    need(ACTIONS.has(flags.action), 'COMMISSIONING_PREPARE_ACTION', 'Choose source-import or capture.');
    const context = {actor: flags.actor, requestId: flags['request-id'] ?? ('commissioning-' + randomUUID())};
    let value, sourceId = null, workspaceId = flags['expected-workspace-id'];
    if (flags.action === 'source-import') {
      value = commissioningImportArguments(await sourceInput(flags), await inputJson(flags.inspection, 'inspection'), context);
    } else {
      const preview = await inputJson(flags.preview, 'preview');
      value = commissioningCaptureArguments(preview, context);
      sourceId = preview.source.id;
      need(!flags.source || flags.source === sourceId,
        'COMMISSIONING_CAPTURE_SOURCE', 'The chosen source differs from the retained preview.');
      need(!workspaceId || workspaceId === preview.review.workspaceId,
        'COMMISSIONING_OPERATION_WORKSPACE', 'The chosen workspace differs from the retained review.');
      workspaceId = preview.review.workspaceId;
    }
    requestSize(value);
    const originalIntent = nativeIntent({action: flags.action, sourceId, value});
    const operation = operationDocument({schema: OPERATION_SCHEMA, action: flags.action, sourceId, value,
      nativeAction: originalIntent.action, nativeIntentSha256: originalIntent.intentSha256,
      requestSha256: valueDigest(value), preparedAt: new Date().toISOString(),
      binding: {...(workspaceId ? {expectedWorkspaceId: workspaceId} : {}),
        ...(flags['expected-sources-sha256'] ? {expectedSourcesSha256: flags['expected-sources-sha256']} : {})}});
    const bytes = Buffer.from(json(operation));
    await newFile(flags.out, bytes);
    const result = {path: flags.out, schema: operation.schema, action: operation.action, sourceId,
      requestId: value.requestId, revision: value.revision, requestSha256: operation.requestSha256,
      nativeAction: operation.nativeAction, nativeIntentSha256: operation.nativeIntentSha256, bytes: bytes.length, sha256: digest(bytes)};
    process.stdout.write(json(result)); return result;
  }
  const operation = command === 'execute' || command === 'reconcile' ?
    operationDocument(await inputJson(flags.operation, 'operation')) : null;
  const options = ownerOptions(flags, operation);
  if (command === 'serve') {
    const port = Number(flags.port ?? 8452);
    need(Number.isInteger(port) && port >= 0 && port <= 65535,
      'COMMISSIONING_PORT', 'Use a local port from zero to 65535.');
    const {createCommissioningCollectionsServer} = await import('./server.mjs');
    const running = await createCommissioningCollectionsServer({...options, port});
    const binding = accountingWorkspaceBinding(running.workspace.directory, running.workspace.state);
    process.stdout.write(JSON.stringify({schema: 'stellar-forge.commissioning-server-startup.v1',
      directory: running.workspace.directory, workspaceId: binding.workspaceId,
      sourcesSha256: binding.sourcesSha256, url: running.url}) + '\n');
    let closing = false;
    const close = async () => { if (closing) return; closing = true; await running.close(); };
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => close().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; }));
    }
    return running;
  }
  const workspace = await openAccountingWorkspace(options);
  try {
    const receivables = await new ReceivablesWorkspace(workspace).init();
    const xero = new XeroReceivablesWorkspace(receivables);
    const controller = await new CommissioningCollectionsWorkspace(receivables, {xero}).init();
    let result, mutation = false;
    const all = flags.all === 'true';
    if (command === 'inspect' || command === 'import') {
      const value = await sourceInput(flags);
      mutation = command === 'import';
      result = mutation ? await controller.importSource(value) : await controller.inspectSource(value);
    } else if (command === 'sources') {
      result = await pages(query => controller.sources(query), pageQuery(flags, [['project', 'projectId']]), all);
    } else if (command === 'source') {
      result = await pages(query => controller.source(flags.source, query), pageQuery(flags, [['view', 'view']]), all);
    } else if (command === 'candidates') {
      result = await pages(query => controller.candidates(query), pageQuery(flags,
        [['view', 'view'], ['source', 'sourceId'], ['project', 'projectId'], ['customer', 'customerId'], ['as-of', 'asOf']]), all);
    } else if (command === 'preview' || command === 'capture') {
      const value = await inputJson(flags.input);
      requestSize(value);
      mutation = command === 'capture';
      result = mutation ? await controller.capture(flags.source, value) : await controller.preview(flags.source, value);
    } else if (command === 'captures') {
      result = await pages(query => controller.captures(query), pageQuery(flags,
        [['source', 'sourceId'], ['project', 'projectId'], ['customer', 'customerId'], ['status', 'status']]), all);
    } else if (command === 'detail') result = await controller.detail(flags.capture);
    else if (command === 'request') result = await controller.request(flags['request-id']);
    else if (command === 'source-file' || command === 'file') {
      const selected = command === 'source-file' ?
        await controller.sourceFile(flags.source, flags.name) : await controller.file(flags.capture, flags.name);
      await newFile(flags.out, selected.bytes);
      result = {path: flags.out, name: selected.name, type: selected.type, bytes: selected.bytes.length, sha256: digest(selected.bytes)};
    } else if (command === 'export') {
      result = await exportBundle(await controller.export(flags.capture), flags.out, flags.format || 'directory');
    } else if (command === 'reconcile') {
      result = await controller.request(operation.value.requestId);
      if (result.found) need(result.operation?.action === operation.nativeAction &&
        result.operation?.intentSha256 === operation.nativeIntentSha256,
        'COMMISSIONING_RECONCILIATION_MISMATCH',
        'This original request identifier belongs to a different action or source intent. Keep the saved operation for recovery.', 409);
    }
    else if (command === 'execute') {
      mutation = true;
      result = operation.action === 'source-import' ?
        await controller.importSource(operation.value) : await controller.capture(operation.sourceId, operation.value);
    }
    if (!['file', 'source-file', 'export'].includes(command)) await writeResult(flags, result, mutation, flags.operation);
    process.stdout.write(json(result)); return result;
  } finally { await workspace.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCommissioningCollectionsCli().catch(error => {
    process.stderr.write(json({error: {
      code: error.code ?? 'COMMISSIONING_FAILED', message: error.message,
      ...(error.details === undefined ? {} : {details: error.details}),
      ...(error.requestId === undefined ? {} : {requestId: error.requestId}),
      ...(typeof error.outcomeUnknown === 'boolean' ? {outcomeUnknown: error.outcomeUnknown} : {}),
      ...(typeof error.reopenRequired === 'boolean' ? {reopenRequired: error.reopenRequired} : {}),
      ...(error.commitUncertainty === undefined ? {} : {commitUncertainty: error.commitUncertainty}),
    }}));
    process.exitCode = 1;
  });
}
