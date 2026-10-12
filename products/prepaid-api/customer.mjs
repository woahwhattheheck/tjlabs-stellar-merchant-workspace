// MIT. Open the original customer workspace from a complete merchant-issued handoff.
import {join, dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {absolute, ownedDirectory, ownedBytes, writeExact, encoded, parse, digest, canonical, need, UUID, HASH, REF, text}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import {compileConfig, CONFIG_SCHEMA, requestId, gatewayOrigin, claimName}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access/workspace/configuration.mjs';
import {serveConfiguredWorkspace}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access/workspace/cli.mjs';
import {validateHandoff} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/checkout-config.mjs';
import {initialRecord} from './records.mjs';

export const CUSTOMER_SCHEMA = 'stellar-forge.prepaid-api-customer-setup.v1';
const PLAN_SCHEMA = 'stellar-forge.prepaid-api-customer-setup-plan.v1';
const RECEIVING_SCHEMA = 'stellar-forge.prepaid-api-customer-files.v1';
const same = (a, b) => canonical(a) === canonical(b);
const inside = (a, b) => a === b || b.startsWith(a + '/');

async function readCustomerInput(directory) {
  directory = await ownedDirectory(absolute(directory));
  const recordBytes = await ownedBytes(join(directory, 'receiving.json'), 262144);
  const completeBytes = await ownedBytes(join(directory, 'complete.json'), 262144);
  const record = parse(recordBytes), complete = parse(completeBytes), manifest = record.manifest;
  need(record.schema === RECEIVING_SCHEMA && UUID.test(record.workspaceId) &&
    REF.test(record.orderReference) && UUID.test(record.offerId) && UUID.test(record.exportId) &&
    manifest?.schema === 'stellar-forge.sf101.api-merchant-export.v1' && manifest.id === record.exportId &&
    manifest.kind === 'customer-handoff' && Array.isArray(manifest.files) && manifest.files.length <= 64,
    'PREPAID_API_COMPLETE_CUSTOMER_HANDOFF_REQUIRED', 409);
  need(complete.schema === RECEIVING_SCHEMA && complete.status === 'COMPLETE' && typeof complete.directory === 'string' &&
    absolute(complete.directory) === complete.directory &&
    ['workspaceId', 'orderReference', 'offerId', 'exportId'].every(key => complete[key] === record[key]) &&
    same(complete.files, manifest.files.map(({downloadUrl, ...file}) => file)),
    'PREPAID_API_CUSTOMER_RECEIVING_CHANGED', 409);
  const names = new Set(), bodies = new Map();
  for (const file of manifest.files) {
    need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(file.name ?? '') && !names.has(file.name) &&
      HASH.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 32 * 1024 * 1024 &&
      file.downloadUrl === '/api/exports/' + record.exportId + '/files/' + encodeURIComponent(file.name),
      'PREPAID_API_CUSTOMER_RECEIVING_CHANGED', 409);
    names.add(file.name);
    const body = await ownedBytes(join(directory, file.name), 32 * 1024 * 1024);
    need(body.length === file.bytes && digest(body) === file.sha256, 'PREPAID_API_RECEIVED_MEMBER_CHANGED', 409);
    if (['handoff.json', 'api-pass.json', 'credentials.json'].includes(file.name)) bodies.set(file.name, body);
  }
  need(bodies.size === 3, 'PREPAID_API_COMPLETE_CUSTOMER_HANDOFF_REQUIRED', 409);
  const handoff = validateHandoff(parse(bodies.get('handoff.json'))), credentials = parse(bodies.get('credentials.json'));
  need(handoff.orderReference === record.orderReference &&
    handoff.file.sha256 === digest(bodies.get('api-pass.json')) && handoff.file.bytes === bodies.get('api-pass.json').length &&
    credentials.schema === 'stellar-forge.sf101.api-customer-credentials.v1' &&
    credentials.orderReference === record.orderReference && typeof credentials.claim === 'string' &&
    credentials.claim.length >= 16 && credentials.claim.length <= 4096 && !/[\s\u0000-\u001f\u007f]/.test(credentials.claim),
    'PREPAID_API_CUSTOMER_IDENTITY_CHANGED', 409);
  const gatewayBaseUrl = gatewayOrigin(credentials.gatewayBaseUrl), claimEnv = claimName(credentials.claimEnv);
  const binding = {directory, sourceDirectory: complete.directory, receivingSha256: digest(recordBytes), completeSha256: digest(completeBytes),
    merchantWorkspaceId: record.workspaceId, orderReference: record.orderReference,
    offerId: record.offerId, exportId: record.exportId, manifestSha256: handoff.file.sha256,
    handoffSha256: digest(bodies.get('handoff.json')), gatewayBaseUrl, claimEnv,
    files: complete.files};
  return {binding, handoff, handoffText: bodies.get('handoff.json').toString('utf8'), claim: credentials.claim};
}

/** Return complete public metadata; the original claim remains in its private file. */
export async function inspectPrepaidCustomerFiles(directory) {
  const value = await readCustomerInput(directory);
  return {...value.binding, payment: value.handoff.payment, purchaseUrl: value.handoff.purchaseUrl};
}

function customerInput(options) {
  const result = {handoffDirectory: absolute(options.handoffDirectory), directory: absolute(options.directory),
    mode: options.mode ?? 'purchase', title: text(options.title ?? 'Number analysis access', 160, 'PREPAID_API_CUSTOMER_TITLE_REQUIRED'),
    python: options.python ?? 'python3', intentId: options.intentId ?? null, buyerWorkspace: options.buyerWorkspace ?? null};
  need(['purchase', 'access'].includes(result.mode), 'PREPAID_API_CUSTOMER_MODE_REQUIRED');
  if (result.mode === 'purchase') {
    result.buyerWorkspace = absolute(result.buyerWorkspace);
    requestId(result.intentId);
  } else {
    need(result.intentId === null, 'PREPAID_API_ACCESS_MODE_HAS_NO_PURCHASE_INTENT');
    if (result.buyerWorkspace !== null) result.buyerWorkspace = absolute(result.buyerWorkspace);
  }
  for (const key of ['runtimeDirectory', 'buyerStateDirectory', 'inboxDirectory'])
    if (options[key] !== undefined) result[key] = absolute(options[key]);
  need(!inside(result.directory, result.handoffDirectory) && !inside(result.handoffDirectory, result.directory),
    'PREPAID_API_CUSTOMER_SOURCE_AND_STATE_MUST_DIFFER');
  if (result.buyerWorkspace !== null)
    need(!inside(result.directory, result.buyerWorkspace) && !inside(result.buyerWorkspace, result.directory),
      'PREPAID_API_ORIGINAL_BUYER_WORKSPACE_MUST_DIFFER');
  return result;
}
function nativeConfig(input, binding) {
  return compileConfig({schema: CONFIG_SCHEMA, directory: join(input.directory, 'workspace'),
    title: input.title, python: input.python, buyerWorkspace: input.buyerWorkspace,
    claimEnvs: [binding.claimEnv],
    ...Object.fromEntries(['runtimeDirectory', 'buyerStateDirectory', 'inboxDirectory']
      .filter(key => input[key] !== undefined).map(key => [key, input[key]]))});
}
function descriptor(plan) {
  return {schema: CUSTOMER_SCHEMA, id: plan.id, directory: plan.input.directory,
    mode: plan.input.mode, intentId: plan.input.intentId, title: plan.input.title,
    handoffDirectory: plan.input.handoffDirectory, binding: plan.binding,
    workspaceConfig: join(plan.input.directory, 'workspace-config.json'),
    workspaceConfigSha256: digest(encoded(plan.configuration)), workspaceDirectory: plan.configuration.directory,
    configurationFile: join(plan.input.directory, 'customer-config.json'),
    bootstrapOperationId: plan.bootstrapOperationId, sourcePlanSha256: digest(encoded(plan))};
}
function validatePlan(plan, input, binding) {
  need(plan?.schema === PLAN_SCHEMA && UUID.test(plan.id) && UUID.test(plan.bootstrapOperationId) &&
    same(plan.input, input) && same(plan.binding, binding) &&
    same(compileConfig(plan.configuration), plan.configuration) &&
    plan.configuration.directory === join(input.directory, 'workspace') &&
    same(plan.configuration.claimEnvs, [binding.claimEnv]) &&
    plan.configuration.buyerWorkspace === input.buyerWorkspace &&
    plan.configuration.title === input.title && plan.configuration.python === input.python,
    'PREPAID_API_CUSTOMER_SETUP_CHANGED', 409);
  for (const key of ['runtimeDirectory', 'buyerStateDirectory', 'inboxDirectory'])
    if (input[key] !== undefined) need(plan.configuration[key] === input[key], 'PREPAID_API_CUSTOMER_SETUP_CHANGED', 409);
  return plan;
}

/** Prepare the actual customer config and one bootstrap identity; payment stays in the original review flow. */
export async function preparePrepaidCustomerWorkspace(options = {}) {
  const input = customerInput(structuredClone(options)), incoming = await readCustomerInput(input.handoffDirectory);
  await ownedDirectory(input.directory, {create: true});
  const lease = await acquireStateLease(input.directory);
  try {
    const plan = await initialRecord({directory: input.directory, name: 'customer-setup.json', lease,
      validate: value => validatePlan(value, input, incoming.binding),
      create: async () => ({schema: PLAN_SCHEMA, id: randomUUID(), bootstrapOperationId: randomUUID(),
        createdAt: new Date().toISOString(), input, binding: incoming.binding,
        configuration: nativeConfig(input, incoming.binding)})});
    const result = descriptor(plan);
    await writeExact(result.workspaceConfig, encoded(plan.configuration));
    await writeExact(result.configurationFile, encoded(result));
    return result;
  } finally {await lease.close();}
}

export async function inspectPrepaidCustomerWorkspace(configurationFile) {
  configurationFile = absolute(configurationFile);
  const value = parse(await ownedBytes(configurationFile, 262144));
  need(value?.schema === CUSTOMER_SCHEMA && value.configurationFile === configurationFile &&
    value.directory === dirname(configurationFile), 'PREPAID_API_CUSTOMER_CONFIGURATION_REQUIRED');
  const incoming = await readCustomerInput(value.handoffDirectory);
  const plan = parse(await ownedBytes(join(value.directory, 'customer-setup.json'), 1048576));
  validatePlan(plan, customerInput(plan.input), incoming.binding);
  need(same(descriptor(plan), value), 'PREPAID_API_CUSTOMER_CONFIGURATION_CHANGED', 409);
  const configBytes = await ownedBytes(value.workspaceConfig, 65536);
  need(digest(configBytes) === value.workspaceConfigSha256 &&
    same(parse(configBytes), plan.configuration), 'PREPAID_API_CUSTOMER_CONFIGURATION_CHANGED', 409);
  return value;
}

/**
 * Start the original browser and save/reopen its original profile mutation.
 * The selected claim enters only this original process environment; buying
 * still requires the customer's existing original purchase review.
 */
export async function servePrepaidCustomer({configurationFile, port = 0, environment = process.env,
  approvalMode = 'auto', approvalModule, expectedApprovalSha256, agentDirectory,
  expectedAgentSetupSha256, expectedWorkspaceSha256} = {}) {
  const selected = await inspectPrepaidCustomerWorkspace(configurationFile);
  const incoming = await readCustomerInput(selected.handoffDirectory);
  need(same(incoming.binding, selected.binding), 'PREPAID_API_CUSTOMER_CONFIGURATION_CHANGED', 409);
  const app = await serveConfiguredWorkspace({configFile: selected.workspaceConfig, port,
    environment: {...environment, [selected.binding.claimEnv]: incoming.claim},
    expectedConfigSha256: selected.workspaceConfigSha256, expectedWorkspaceSha256,
    approvalMode, approvalModule, expectedApprovalSha256, agentDirectory, expectedAgentSetupSha256});
  try {
    // The original model's lease protects both its state and this one bootstrap.
    const directory = join(selected.directory, 'bootstrap');
    await ownedDirectory(directory, {create: true});
    const goal = selected.mode === 'purchase' ?
      {label: selected.title, handoff: incoming.handoffText, intentId: selected.intentId,
        gatewayBaseUrl: selected.binding.gatewayBaseUrl, claimEnv: selected.binding.claimEnv} :
      {label: selected.title, gatewayBaseUrl: selected.binding.gatewayBaseUrl,
        orderReference: selected.binding.orderReference, manifestSha256: selected.binding.manifestSha256,
        claimEnv: selected.binding.claimEnv};
    const record = await initialRecord({directory, name: 'request.json', lease: app.model.lease,
      validate: value => {
        const {operationId, expectedRevision, ...fields} = value?.request ?? {};
        need(value?.schema === 'stellar-forge.prepaid-api-customer-bootstrap.v1' &&
          value.configurationSha256 === digest(encoded(selected)) && value.workspaceId === app.workspaceId &&
          value.mode === selected.mode && operationId === selected.bootstrapOperationId &&
          Number.isSafeInteger(expectedRevision) && expectedRevision >= 1 && same(fields, goal),
          'PREPAID_API_CUSTOMER_BOOTSTRAP_CHANGED', 409);
        return value;
      },
      create: async () => ({schema: 'stellar-forge.prepaid-api-customer-bootstrap.v1',
        configurationSha256: digest(encoded(selected)), workspaceId: app.workspaceId, mode: selected.mode,
        request: {...goal, operationId: selected.bootstrapOperationId,
          expectedRevision: (await app.model.snapshot()).revision}})});
    const result = selected.mode === 'purchase' ?
      await app.model.preparePurchase(record.request) : await app.model.connectPass(record.request);
    need(UUID.test(result.profileId), 'PREPAID_API_CUSTOMER_PROFILE_REQUIRED', 409);
    return {...app, prepaid: {schema: 'stellar-forge.prepaid-api-customer-open.v1',
      configurationFile: selected.configurationFile, workspaceId: app.workspaceId,
      profileId: result.profileId, operationId: selected.bootstrapOperationId,
      orderReference: selected.binding.orderReference, mode: selected.mode, reused: result.reused === true}};
  } catch (error) {
    try {await app.close();}
    catch (closeError) {
      Object.defineProperty(error, 'recovery', {value: {close: () => app.close(), error: closeError}});
    }
    throw error;
  }
}
