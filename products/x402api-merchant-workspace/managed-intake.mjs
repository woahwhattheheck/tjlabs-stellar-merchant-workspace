// MIT. Managed archive intake joining the original complete portable receiver.
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { digest, json, canonical, need } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import { applicationPrivateUrl } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { applicationEnvironment } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-environment.mjs';
import { canonicalJson } from './protocol.mjs';
import { reviewEnvironmentName, reviewEnvironmentValue } from './received-project-review.mjs';
import { MERCHANT_INTAKE_SCHEMA, inspectMerchantIntake, intakeSummary, merchantIntakeArguments } from './project-intake.mjs';

export const MERCHANT_INTAKE_KIND = 'x402api-merchant-project-intake';
export const MERCHANT_INTAKE_COMMAND = 'x402api-merchant-intake';
const hash = value => createHash('sha256').update(value).digest('hex');
export function merchantIntakeApplication(common, field) {
  return { id: MERCHANT_INTAKE_KIND, command: MERCHANT_INTAKE_COMMAND, title: 'Receive merchant project',
    description: 'Inspect a whole original project, resume its receiving and open the retained invoices and files.',
    terminal: false, requiredSource: 'products/x402api-merchant-workspace/project-intake.mjs',
    fields: [
      field('archiveFile', 'Original project archive', 'path', true, 'The complete original merchant project ZIP.'),
      field('archiveSha256', 'Original archive SHA-256', 'text', true, 'The exact identity returned by the original project export.'),
      field('receivedDirectory', 'Receiving project directory', 'path', true,
        'A new directory under an existing private parent, or this same original receiving destination.'),
      ...common,
      field('operatorTokenEnv', 'Review credential name', 'text', false,
        'The private environment name; defaults to MERCHANT_REVIEW_OPERATOR_TOKEN.'),
      field('pythonExecutable', 'Python executable', 'path', false, 'An existing Python executable for the original archive reader.'),
      field('allowLoopback', 'Allow local commissioning origins', 'boolean', false,
        'Enable for an original merchant case commissioned against local payment endpoints.'),
    ] };
}
export function validateMerchantIntakeSettings(_type, settings) {
  need(/^[a-f0-9]{64}$/.test(settings.archiveSha256 ?? ''), 'MERCHANT_INTAKE_ARCHIVE_SHA256_REQUIRED');
  if (settings.operatorTokenEnv !== undefined) reviewEnvironmentName(settings.operatorTokenEnv);
}
function credential(environment, name) {
  const value = reviewEnvironmentValue(environment, name);
  need(!/[\u0000-\u0020\u007f]/.test(value), 'MERCHANT_INTAKE_PRIVATE_CREDENTIAL_REQUIRED');
  return value;
}
function reviewContent(inspected) {
  const s = intakeSummary(inspected);
  return { schema: 'stellar-forge.application-review-content.v1', title: 'Original merchant project',
    summary: 'The complete archive was inspected by its original native reader. Open the intake desk to read all files and download the complete manifest before selecting Receive project.',
    sections: [
      { title: 'Original project', rows: [
        { label: 'Merchant store', value: s.storeId },
        { label: 'Export operation', value: s.exportOperation },
        { label: 'Original archive', value: s.archive.path },
        { label: 'Archive bytes', value: String(s.archive.bytes) },
        { label: 'Archive SHA-256', value: s.archive.sha256 },
        { label: 'Native manifest identity', value: s.manifestSha256 },
        { label: 'Complete source SHA-256', value: s.sourceSha256 },
      ] },
      { title: 'Receive and review', rows: [
        { label: 'Original receiving operation', value: s.operation },
        { label: 'Receiving directory', value: s.destination },
        { label: 'Archive members', value: s.counts.members },
        { label: 'Retained results', value: s.counts.results },
        { label: 'Selected input files', value: s.counts.inputs },
        { label: 'Original business rows identity', value: s.originalRowsSha256 },
      ] },
      { title: 'Complete original tables', collapsed: true, rows:
        s.tables.map(row => ({ label: row.name, value: String(row.rows) })) },
    ] };
}
export async function prepareMerchantIntake(settings, context) {
  const executable = await context.selectedExecutable(settings.pythonExecutable ??
    process.env.CODEX_PRIMARY_RUNTIME_PYTHON ?? '/usr/bin/python3');
  const inspected = await inspectMerchantIntake({ archive: settings.archiveFile,
    archiveSha256: settings.archiveSha256, destination: settings.receivedDirectory, python: executable.executable });
  const name = reviewEnvironmentName(settings.operatorTokenEnv ?? 'MERCHANT_REVIEW_OPERATOR_TOKEN');
  const { environment } = await context.applicationEnvironment(settings.environmentFile);
  credential(environment, name);
  // Keep the existing private parent as an input. Creating the destination on
  // the original receive must not invalidate the saved command's own input list.
  const inputs = [...executable.inputs, await context.inputPath(settings.archiveFile, 'file'),
    await context.inputPath(dirname(settings.receivedDirectory), 'directory', false, true)];
  const args = ['--archive', settings.archiveFile, '--archive-sha256', settings.archiveSha256,
    '--destination', settings.receivedDirectory, '--operation', inspected.selection.request.operation,
    '--expect-selection-sha256', inspected.selectionSha256, '--python', executable.executable,
    '--operator-token-env', name, '--host', '127.0.0.1'];
  if (settings.allowLoopback) args.push('--allow-loopback');
  return { args, inputs, createDirectories: [],
    merchantIntake: inspected.selection, merchantIntakeSha256: inspected.selectionSha256,
    applicationReview: reviewContent(inspected),
    resourceKey: digest(json(canonical({ family: 'x402api-merchant-workspace',
      directory: inspected.selection.workspaceDirectory }))) };
}
function originalRequest(request) {
  need(!request.pythonCommand && request.command === MERCHANT_INTAKE_COMMAND && Array.isArray(request.args),
    'MERCHANT_INTAKE_APPLICATION_REQUEST_CHANGED');
  const values = merchantIntakeArguments(request.args);
  need(values.operation && values['expect-selection-sha256'] && values.python,
    'MERCHANT_INTAKE_RETAINED_SELECTION_REQUIRED');
  return values;
}
export async function verifyMerchantIntakeLaunch(request) {
  const values = originalRequest(request);
  need(process.platform === 'linux' && Number(process.versions.node.split('.')[0]) >= 24,
    'MERCHANT_APPLICATION_NODE24_REQUIRED');
  const inspected = await inspectMerchantIntake({ archive: values.archive, archiveSha256: values['archive-sha256'],
    destination: values.destination, operation: values.operation, python: values.python,
    expectedSelectionSha256: values['expect-selection-sha256'] });
  const { environment } = await applicationEnvironment(request.environmentFile, request.environmentSha256);
  credential(environment, values['operator-token-env']);
  return inspected;
}
async function listener(url, credentialValue) {
  const response = await fetch(new URL('/api/state', url), { headers: { Authorization: 'Bearer ' + credentialValue },
    redirect: 'error', signal: AbortSignal.timeout(5000) });
  need(response.status === 200 && response.body, 'MERCHANT_INTAKE_LISTENER_UNAVAILABLE');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      const value = await reader.read(); if (value.done) break;
      length += value.value.byteLength; need(length <= 65536, 'MERCHANT_INTAKE_LISTENER_IDENTITY_INVALID');
      chunks.push(Buffer.from(value.value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}
export async function merchantIntakeStartup(request, announcement) {
  const values = originalRequest(request), selected = announcement?.selection;
  need(announcement?.schema === MERCHANT_INTAKE_SCHEMA && announcement.mode === 'intake' &&
    selected?.schema === MERCHANT_INTAKE_SCHEMA &&
    selected.request?.operation === values.operation && selected.request.archive === values.archive &&
    selected.request.archiveSha256 === values['archive-sha256'] && selected.destination === values.destination &&
    announcement.selectionSha256 === values['expect-selection-sha256'] &&
    hash(canonicalJson(selected)) === values['expect-selection-sha256'],
  'MERCHANT_INTAKE_STARTUP_SELECTION_CHANGED');
  const url = applicationPrivateUrl(announcement.url);
  need(url, 'MERCHANT_INTAKE_PRIVATE_LISTENER_REQUIRED');
  const parsed = new URL(url);
  need(parsed.hostname === '127.0.0.1' && parsed.pathname === '/' && !parsed.search && !parsed.hash &&
    (Number(values.port) === 0 || Number(parsed.port || 80) === Number(values.port)),
  'MERCHANT_INTAKE_LISTENER_CHANGED');
  const { environment } = await applicationEnvironment(request.environmentFile, request.environmentSha256);
  const observed = await listener(url, credential(environment, values['operator-token-env']));
  need(observed.schema === MERCHANT_INTAKE_SCHEMA &&
    observed.selectionSha256 === values['expect-selection-sha256'] &&
    hash(canonicalJson(observed.selection)) === values['expect-selection-sha256'] &&
    ['READY','RECEIVING','RECEIVED','RETRY_REQUIRED','COMPLETE'].includes(observed.state),
  'MERCHANT_INTAKE_LISTENER_CHANGED');
  return { url, workspaceId: selected.storeId,
    original: { schema: MERCHANT_INTAKE_SCHEMA, selection: selected,
      selectionSha256: announcement.selectionSha256, listener: { mode: 'intake', storeId: selected.storeId } } };
}
