// MIT. Original received project in the maintained Applications review/start/stop lifecycle.
import { createHash } from 'node:crypto';
import { privateDirectory, digest, json, canonical, need } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import { applicationPrivateUrl } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { applicationEnvironment } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-environment.mjs';
import { canonicalJson } from './protocol.mjs';
import { RECEIVED_REVIEW_SCHEMA, inspectReceivedMerchant, receivedReviewArguments,
  reviewEnvironmentName, reviewEnvironmentValue } from './received-project-review.mjs';

export const RECEIVED_REVIEW_KIND = 'x402api-merchant-received-review';
export const RECEIVED_REVIEW_COMMAND = 'x402api-merchant-review';
const hash = value => createHash('sha256').update(value).digest('hex');

export function receivedMerchantApplication(common, field) {
  return { id: RECEIVED_REVIEW_KIND, command: RECEIVED_REVIEW_COMMAND, title: 'Received merchant review',
    description: 'Open the original received merchant project, invoices, payment history and retained files.',
    terminal: false, requiredSource: 'products/x402api-merchant-workspace/received-project-review.mjs',
    fields: [
      field('receivedDirectory', 'Received merchant project', 'path', true,
        'The completed project directory containing its original control receipt and independent runtime.'),
      ...common,
      field('operatorTokenEnv', 'Review credential name', 'text', false,
        'Optional environment name for the private review credential; defaults to the name in the received review configuration.'),
      field('pythonExecutable', 'Python executable', 'path', false,
        'Optional existing Python executable for the original complete-project reader.'),
      field('allowLoopback', 'Allow local commissioning origins', 'boolean', false,
        'Enable when this original merchant case was commissioned against local payment endpoints.'),
    ] };
}
export function validateReceivedMerchantSettings(_type, settings) {
  if (settings.operatorTokenEnv !== undefined) reviewEnvironmentName(settings.operatorTokenEnv);
}
export async function prepareReceivedMerchantApplication(settings, context) {
  const executable = await context.selectedExecutable(settings.pythonExecutable ??
    process.env.CODEX_PRIMARY_RUNTIME_PYTHON ?? '/usr/bin/python3');
  const inspected = await inspectReceivedMerchant(settings.receivedDirectory,
    { python: executable.executable, allowLoopback: settings.allowLoopback === true });
  const selected = inspected.selection;
  const name = reviewEnvironmentName(settings.operatorTokenEnv ?? selected.operatorTokenEnv);
  const { environment } = await context.applicationEnvironment(settings.environmentFile);
  reviewEnvironmentValue(environment, name);
  const inputs = [...executable.inputs,
    await context.inputPath(settings.receivedDirectory, 'directory', false, true),
    await context.inputPath(selected.workspaceDirectory, 'directory', false, true)];
  for (const path of [...new Set(inspected.inputFiles)]) inputs.push(await context.inputPath(path, 'file'));
  const args = ['--project', settings.receivedDirectory, '--expect-project-sha256', inspected.selectionSha256,
    '--operator-token-env', name, '--python', executable.executable, '--host', '127.0.0.1'];
  if (settings.allowLoopback) args.push('--allow-loopback');
  return { args, inputs, createDirectories: [], receivedMerchant: selected,
    receivedMerchantSha256: inspected.selectionSha256,
    // Exactly the original live merchant resource family and actual workspace.
    // Applications therefore retains one managed owner across review and activation.
    resourceKey: digest(json(canonical({ family: 'x402api-merchant-workspace', directory: selected.workspaceDirectory }))) };
}
function originalRequest(request) {
  need(!request.pythonCommand && request.command === RECEIVED_REVIEW_COMMAND &&
    Array.isArray(request.args), 'MERCHANT_REVIEW_APPLICATION_REQUEST_CHANGED');
  const values = receivedReviewArguments(request.args);
  need(values['expect-project-sha256'] && values['operator-token-env'] && values.python,
    'MERCHANT_REVIEW_RETAINED_SELECTION_REQUIRED');
  return values;
}
export async function verifyReceivedMerchantLaunch(request) {
  const values = originalRequest(request);
  need(process.platform === 'linux' && Number(process.versions.node.split('.')[0]) >= 24,
    'MERCHANT_APPLICATION_NODE24_REQUIRED');
  const inspected = await inspectReceivedMerchant(values.project, { python: values.python,
    expectedSha256: values['expect-project-sha256'], allowLoopback: values['allow-loopback'] });
  await privateDirectory(inspected.selection.workspaceDirectory);
  const { environment } = await applicationEnvironment(request.environmentFile, request.environmentSha256);
  reviewEnvironmentValue(environment, values['operator-token-env']);
  return inspected;
}
async function reviewListener(url, credential, expectedStoreId) {
  const response = await fetch(new URL('/api/project', url), {
    headers: { Authorization: 'Bearer ' + credential }, redirect: 'error', signal: AbortSignal.timeout(5000)
  });
  need(response.status === 200 && response.body, 'MERCHANT_REVIEW_LISTENER_UNAVAILABLE');
  const reader = response.body.getReader(), chunks = []; let total = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.byteLength;
      need(total <= 16384, 'MERCHANT_REVIEW_LISTENER_IDENTITY_INVALID');
      chunks.push(Buffer.from(next.value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  need(value.mode === 'review' && value.available === false && value.storeId === expectedStoreId,
    'MERCHANT_REVIEW_LISTENER_CHANGED');
  return { mode: value.mode, storeId: value.storeId };
}
export async function receivedMerchantStartup(request, announcement) {
  const values = originalRequest(request), selected = announcement?.selection;
  need(announcement?.schema === RECEIVED_REVIEW_SCHEMA && announcement.mode === 'review' &&
    selected?.schema === RECEIVED_REVIEW_SCHEMA && selected.directory === values.project &&
    announcement.selectionSha256 === values['expect-project-sha256'] &&
    hash(canonicalJson(selected)) === values['expect-project-sha256'],
  'MERCHANT_REVIEW_STARTUP_SELECTION_CHANGED');
  const url = applicationPrivateUrl(announcement.url);
  need(url, 'MERCHANT_REVIEW_PRIVATE_LISTENER_REQUIRED');
  const parsed = new URL(url);
  need(parsed.hostname === '127.0.0.1' && parsed.pathname === '/' && !parsed.search && !parsed.hash &&
    (Number(values.port) === 0 || Number(parsed.port || 80) === Number(values.port)),
  'MERCHANT_REVIEW_LISTENER_CHANGED');
  const { environment } = await applicationEnvironment(request.environmentFile, request.environmentSha256);
  const live = await reviewListener(url, reviewEnvironmentValue(environment, values['operator-token-env']), selected.storeId);
  return { url, workspaceId: selected.storeId,
    original: { schema: RECEIVED_REVIEW_SCHEMA, selection: selected,
      selectionSha256: announcement.selectionSha256, listener: live } };
}
