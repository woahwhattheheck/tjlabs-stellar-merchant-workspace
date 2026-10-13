// MIT. Open an original completed merchant receiving through its retained read-only UI.
import { createHash } from 'node:crypto';
import { join, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { privateDirectory } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import { readMerchantInput } from './application-inputs.mjs';
import { canonicalJson } from './protocol.mjs';
import { runPortable } from './portable.mjs';
import { openMerchantReview, validateConfig } from './workspace.mjs';
import { loadMerchantReviewConfiguration, startMerchantServer } from './server.mjs';

export const RECEIVED_REVIEW_SCHEMA = 'stellar-forge.received-merchant-review.v1';
const RESULT_SCHEMA = 'stellar-forge.merchant-portable-result.v1';
const REQUEST_SCHEMA = 'stellar-forge.merchant-portable-request.v1';
const hash = value => createHash('sha256').update(value).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const need = (value, code) => { if (!value) throw Object.assign(new Error(code), { code }); };
const absolute = value => {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value && !value.includes('\0'),
    'MERCHANT_REVIEW_ORIGINAL_DIRECTORY_REQUIRED');
  return value;
};
const parse = (raw, code) => {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { need(false, code); }
};
export function reviewEnvironmentName(value) {
  need(typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(value),
    'MERCHANT_REVIEW_ENVIRONMENT_NAME_REQUIRED');
  return value;
}
export function reviewEnvironmentValue(environment, name) {
  name = reviewEnvironmentName(name);
  need(typeof environment?.[name] === 'string' && environment[name].length >= 32 &&
    !/[\r\n\0]/.test(environment[name]), 'MERCHANT_REVIEW_PRIVATE_CREDENTIAL_REQUIRED');
  return environment[name];
}

/** Reuse the original completed receiving request. The native completed path
 * verifies its immutable source and preparation while preserving runtime progress.
 * A missing/incomplete receipt is never promoted into a new receiving here.
 */
export async function inspectReceivedMerchant(directory, {
  python, expectedSha256 = null, allowLoopback = false, signal = null,
} = {}) {
  directory = absolute(directory);
  await privateDirectory(directory);
  const control = join(directory, 'control');
  await privateDirectory(control);
  const requestPath = join(control, 'request.json'), receiptPath = join(control, 'result.json');
  const requestFile = await readMerchantInput(requestPath, { maximum: 4 * 1024 * 1024, collect: true, privateOnly: true, allowMultipleLinks: true });
  const receiptFile = await readMerchantInput(receiptPath, { maximum: 64 * 1024 * 1024, collect: true, privateOnly: true, allowMultipleLinks: true });
  const request = parse(requestFile.raw, 'MERCHANT_REVIEW_REQUEST_JSON_REQUIRED');
  const receipt = parse(receiptFile.raw, 'MERCHANT_REVIEW_RECEIPT_JSON_REQUIRED');
  need(plain(request) && request.schema === REQUEST_SCHEMA && request.action === 'receive' &&
    request.destination === directory && plain(receipt) && receipt.schema === RESULT_SCHEMA &&
    receipt.action === 'receive' && receipt.state === 'COMPLETE' && receipt.operation === request.operation &&
    plain(receipt.received) && receipt.received.mode === 'review' && hashPattern.test(receipt.manifestSha256 ?? ''),
  'MERCHANT_REVIEW_COMPLETED_RECEIVING_REQUIRED');
  const received = receipt.received;
  need(received.workspaceDirectory === join(directory, 'runtime/workspace') &&
    received.sourceDirectory === join(directory, 'runtime/source') &&
    received.sourceArchive === join(directory, 'runtime/source.tgz') &&
    received.reviewConfigPath === join(directory, 'runtime/review-config.json') &&
    received.receiptPath === receiptPath && received.originalDirectory === join(directory, 'original') &&
    hashPattern.test(received.sourceSha256 ?? '') && typeof received.storeId === 'string' && received.storeId,
  'MERCHANT_REVIEW_RECEIVED_PATHS_CHANGED');
  const observed = await runPortable(request, { python, signal });
  need(hash(JSON.stringify(observed)) === hash(JSON.stringify({ ...receipt, reused: true })),
    'MERCHANT_REVIEW_ORIGINAL_RECEIVING_CHANGED');
  for (const original of [requestFile, receiptFile]) {
    const current = await readMerchantInput(original.descriptor.path, {
      maximum: original.descriptor.bytes, privateOnly: true, allowMultipleLinks: true
    });
    need(current.descriptor.bytes === original.descriptor.bytes &&
      current.descriptor.sha256 === original.descriptor.sha256, 'MERCHANT_REVIEW_ORIGINAL_RECEIVING_CHANGED');
  }
  const configFile = await readMerchantInput(received.reviewConfigPath,
    { maximum: 1048576, collect: true, privateOnly: true });
  const config = validateConfig(parse(configFile.raw, 'MERCHANT_REVIEW_CONFIG_JSON_REQUIRED'), { allowLoopback });
  const selection = {
    schema: RECEIVED_REVIEW_SCHEMA,
    directory, operation: receipt.operation, requestPath, requestFileSha256: requestFile.descriptor.sha256,
    receiptPath, receiptSha256: receiptFile.descriptor.sha256, manifestSha256: receipt.manifestSha256,
    archiveSha256: receipt.archive.sha256, storeId: received.storeId,
    sourceDirectory: received.sourceDirectory, sourceArchive: received.sourceArchive,
    sourceSha256: received.sourceSha256, workspaceDirectory: received.workspaceDirectory,
    reviewConfigPath: received.reviewConfigPath, configSha256: configFile.descriptor.sha256,
    sourceInstallationPath: received.sourceInstallation.path,
    sourceInstallationSha256: received.sourceInstallation.sha256,
    operatorTokenEnv: reviewEnvironmentName(config.operatorTokenEnv),
  };
  const selectionSha256 = hash(canonicalJson(selection));
  need(expectedSha256 === null || hashPattern.test(expectedSha256) && expectedSha256 === selectionSha256,
    'MERCHANT_REVIEW_SELECTION_CHANGED');
  return { selection, selectionSha256, config,
    inputFiles: [requestPath, receiptPath, received.reviewConfigPath, received.sourceArchive,
      received.sourceInstallation.path, request.archive] };
}

export async function startReceivedMerchantReview(directory, {
  python, expectedSha256 = null, operatorTokenEnv = null, environment = process.env,
  allowLoopback = false, host = '127.0.0.1', port = 0, signal = null,
} = {}) {
  need(host === '127.0.0.1' && Number.isInteger(port) && port >= 0 && port <= 65535,
    'MERCHANT_REVIEW_LOOPBACK_REQUIRED');
  const inspected = await inspectReceivedMerchant(directory, { python, expectedSha256, allowLoopback, signal });
  const selected = inspected.selection;
  const name = reviewEnvironmentName(operatorTokenEnv ?? selected.operatorTokenEnv);
  reviewEnvironmentValue(environment, name);
  const configured = await loadMerchantReviewConfiguration(selected.reviewConfigPath,
    { env: environment, allowLoopback, operatorTokenEnv: name });
  const current = await readMerchantInput(selected.reviewConfigPath, { maximum: 1048576, privateOnly: true });
  need(current.descriptor.sha256 === selected.configSha256,
    'MERCHANT_REVIEW_CONFIGURATION_CHANGED');
  need(!signal?.aborted, 'MERCHANT_REVIEW_INTERRUPTED');
  const workspace = await openMerchantReview({ directory: selected.workspaceDirectory,
    config: configured.config, allowLoopback });
  let server;
  try {
    need(workspace.store.storeId === selected.storeId && workspace.readOnly === true,
      'MERCHANT_REVIEW_STORE_CHANGED');
    server = await startMerchantServer({ workspace, operatorToken: configured.operatorToken, host, port });
  } catch (error) { await workspace.close(); throw error; }
  return { server, selection: selected, selectionSha256: inspected.selectionSha256,
    announcement: { schema: RECEIVED_REVIEW_SCHEMA, url: server.url, mode: 'review',
      selectionSha256: inspected.selectionSha256, selection: selected } };
}

export function receivedReviewArguments(argv) {
  const parsed = parseArgs({ args: argv, allowPositionals: false, strict: true,
    options: { project: { type: 'string' }, 'expect-project-sha256': { type: 'string' },
      'operator-token-env': { type: 'string' }, python: { type: 'string' },
      host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '0' },
      'allow-loopback': { type: 'boolean', default: false } } });
  const values = parsed.values;
  absolute(values.project);
  need(values.host === '127.0.0.1' && /^(0|[1-9][0-9]{0,4})$/.test(values.port) &&
    Number(values.port) <= 65535, 'MERCHANT_REVIEW_LOOPBACK_REQUIRED');
  if (values['expect-project-sha256'] !== undefined)
    need(hashPattern.test(values['expect-project-sha256']), 'MERCHANT_REVIEW_SELECTION_REQUIRED');
  if (values['operator-token-env'] !== undefined) reviewEnvironmentName(values['operator-token-env']);
  if (values.python !== undefined) absolute(values.python);
  return values;
}
export async function main(argv = process.argv.slice(2)) {
  const values = receivedReviewArguments(argv), controller = new AbortController();
  let opened = null, closing = null;
  const removeSignals = () => {
    process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
  };
  const stop = signal => {
    if (!controller.signal.aborted) controller.abort(signal);
    if (!opened || closing) return closing;
    closing = (async () => {
      for (;;) {
        try { await opened.server.close(); removeSignals(); return; }
        catch (error) {
          process.stderr.write(JSON.stringify({ state: 'AWAITING_REVIEW_CLOSE',
            error: { code: error.code ?? 'MERCHANT_REVIEW_CLOSE_FAILED', message: String(error.message) } }) + '\n');
          await new Promise(resolveRetry => setTimeout(resolveRetry, 5000));
        }
      }
    })();
    return closing;
  };
  const interrupt = () => { void stop('SIGINT'); };
  const terminate = () => { void stop('SIGTERM'); };
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try {
    opened = await startReceivedMerchantReview(values.project, {
      python: values.python, expectedSha256: values['expect-project-sha256'] ?? null,
      operatorTokenEnv: values['operator-token-env'] ?? null,
      host: values.host, port: Number(values.port), allowLoopback: values['allow-loopback'],
      signal: controller.signal,
    });
    if (controller.signal.aborted) { await stop(controller.signal.reason); return opened; }
    process.stdout.write(JSON.stringify(opened.announcement) + '\n');
    return opened;
  } catch (error) { removeSignals(); throw error; }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch(error => {
    process.stderr.write(JSON.stringify({ error: { code: error.code ?? 'MERCHANT_REVIEW_FAILED',
      message: String(error.message) } }) + '\n');
    process.exitCode = 1;
  });
