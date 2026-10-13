// MIT License. Original merchant command in the maintained Applications lifecycle.
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { verifyRuntimeProfile } from '../../stellar/scf-starforge-20261009/distribution/runtime-profile.mjs';
import { readJSON, privateDirectory, need } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import { applicationPrivateUrl } from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs';
import { merchantInputFiles, reviewMerchantInputs, verifyMerchantInputFingerprint } from './application-inputs.mjs';

const KIND = 'x402api-merchant-workspace';
export function merchantApplication(common, field) {
  return { id: KIND, command: 'x402api-merchant', title: 'Merchant invoices',
    description: 'Open the configured x402api merchant, its original invoices, verified payments and retained delivery files.',
    terminal: false, requiredSource: 'products/x402api-merchant-workspace/server.mjs',
    fields: [
      field('configurationFile', 'Merchant configuration', 'path', true,
        'The private configuration file containing the tenant, payment rails, receipt pins and delivery edition.'),
      field('directory', 'Merchant workspace', 'path', true,
        'Use the original private workspace to reopen its invoices and completed deliveries.'),
      ...common,
      field('inputFiles', 'Additional handler files', 'json', false,
        'Optional JSON array of absolute files used by a custom fulfillment handler. The configured file-delivery manifest and every declared file are included automatically.'),
      field('allowLoopback', 'Allow local commissioning origins', 'boolean', false,
        'Use only when the configured payment endpoints are a local commissioning service.'),
    ] };
}
export function validateMerchantSettings(_type, settings) {
  if (settings.inputFiles !== undefined) merchantInputFiles(settings.inputFiles);
}
export async function checkMerchantRuntime(_type, _settings, runtime) {
  const profile = verifyRuntimeProfile(await readJSON(join(runtime.directory, 'runtime-profile.json')));
  need(profile.profileId === runtime.profileId && profile.selection.features.includes('x402api-merchant') &&
    profile.selection.operator === true && Number(profile.host.node.slice(2).split('.')[0]) >= 24,
    'MERCHANT_APPLICATION_PROFILE_REQUIRED', 'Select the original x402api-merchant feature with operator support and Node 24.');
  need(process.platform === 'linux' && Number(process.versions.node.split('.')[0]) >= 24,
    'MERCHANT_APPLICATION_NODE24_REQUIRED', 'Open this installed merchant on its selected Linux Node 24 runtime.');
}
export async function prepareMerchantApplication(settings, { inputPath, applicationEnvironment }) {
  const { validateConfig } = await import('./workspace.mjs');
  const additional = merchantInputFiles(settings.inputFiles);
  const reviewed = await reviewMerchantInputs(settings.configurationFile, {
    inputFiles: additional, allowLoopback: settings.allowLoopback === true, validateConfig,
  });
  const workspace = await inputPath(settings.directory, 'directory', true, true);
  const inputs = [workspace];
  for (const path of reviewed.inputPaths) inputs.push(await inputPath(path, 'file'));
  // Resolve private references through the same environment reader as the worker.
  // Only names and the original file digest are retained by that lifecycle.
  const { environment } = await applicationEnvironment(settings.environmentFile);
  const references = [
    [reviewed.config.tenantCredentialEnv, 16],
    [reviewed.config.operatorTokenEnv, 32],
    ...Object.values(reviewed.config.webhook.secretEnvironmentByVersion ?? {}).map(name => [name, 32]),
  ];
  need(references.length >= 3, 'MERCHANT_APPLICATION_WEBHOOK_ENVIRONMENT_REQUIRED');
  for (const [name, minimum] of references) need(typeof name === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(name) &&
    typeof environment[name] === 'string' && environment[name].length >= minimum && !/[\r\n\0]/.test(environment[name]),
    'MERCHANT_APPLICATION_ENVIRONMENT_REQUIRED', 'Supply the configured private tenant, operator and webhook environment references.');
  const args = ['serve', '--config', settings.configurationFile, '--directory', settings.directory,
    '--host', '127.0.0.1', '--expect-inputs-sha256', reviewed.inputsSha256];
  if (additional.length) args.push('--input-files', JSON.stringify(additional));
  if (settings.allowLoopback) args.push('--allow-loopback');
  return { args, inputs, createDirectories: workspace.exists ? [] : [settings.directory],
    merchantInputs: reviewed.inputs, merchantInputsSha256: reviewed.inputsSha256,
    tenantId: reviewed.config.tenantId, fulfillmentBinding: reviewed.config.fulfillmentBinding };
}
function originalArguments(request) {
  need(!request.pythonCommand && request.command === 'x402api-merchant' && Array.isArray(request.args),
    'MERCHANT_APPLICATION_REQUEST_CHANGED');
  const { values, positionals } = parseArgs({ args: request.args, allowPositionals: true, strict: true,
    options: { config: { type: 'string' }, directory: { type: 'string' }, host: { type: 'string' },
      port: { type: 'string' }, 'expect-inputs-sha256': { type: 'string' },
      'input-files': { type: 'string' }, 'allow-loopback': { type: 'boolean', default: false } } });
  need(positionals.length === 1 && positionals[0] === 'serve' && values.config && values.directory &&
    values.host === '127.0.0.1' && /^(0|[1-9][0-9]{0,4})$/.test(values.port ?? '') &&
    Number(values.port) <= 65535 && /^[0-9a-f]{64}$/.test(values['expect-inputs-sha256'] ?? ''),
    'MERCHANT_APPLICATION_ARGUMENTS_CHANGED');
  return values;
}
export async function verifyMerchantApplicationLaunch(request) {
  const values = originalArguments(request);
  need(process.platform === 'linux' && Number(process.versions.node.split('.')[0]) >= 24,
    'MERCHANT_APPLICATION_NODE24_REQUIRED');
  await privateDirectory(values.directory);
  const { validateConfig } = await import('./workspace.mjs');
  return verifyMerchantInputFingerprint(await reviewMerchantInputs(values.config, {
    inputFiles: merchantInputFiles(values['input-files']), allowLoopback: values['allow-loopback'], validateConfig,
  }), values['expect-inputs-sha256']);
}
async function originalHealth(url) {
  const response = await fetch(new URL('/health', url), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  need(response.status === 200 && response.body, 'MERCHANT_APPLICATION_LISTENER_UNAVAILABLE');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      need(bytes <= 16384, 'MERCHANT_APPLICATION_HEALTH_INVALID');
      chunks.push(Buffer.from(part.value));
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const health = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  need(health.status === 'ready' && health.application === 'x402api-merchant-workspace',
    'MERCHANT_APPLICATION_HEALTH_CHANGED');
  return { status: health.status, application: health.application };
}
export async function merchantApplicationStartup(request, announcement) {
  const values = originalArguments(request);
  need(announcement?.schema === 'stellar-forge.x402api-merchant-workspace.v1' &&
    announcement.directory === values.directory, 'MERCHANT_APPLICATION_STARTUP_CHANGED');
  const url = applicationPrivateUrl(announcement.url);
  need(url, 'MERCHANT_APPLICATION_PRIVATE_LISTENER_REQUIRED');
  const parsed = new URL(url);
  need(parsed.hostname === '127.0.0.1' && parsed.pathname === '/' && !parsed.search && !parsed.hash &&
    (Number(values.port) === 0 || Number(parsed.port || 80) === Number(values.port)),
    'MERCHANT_APPLICATION_LISTENER_CHANGED');
  const health = await originalHealth(url);
  return { url, original: { schema: announcement.schema, directory: announcement.directory,
    configurationFile: values.config, inputsSha256: values['expect-inputs-sha256'], health } };
}
