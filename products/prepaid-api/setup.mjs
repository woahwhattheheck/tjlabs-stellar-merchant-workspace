// MIT. Complete prepaid API starter; native compilers and the merchant console remain the authorities.
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {compileJobMerchant} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/jobs/config.mjs';
import {compileCheckout} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/checkout-config.mjs';
import {absolute, ownedDirectory, ownedBytes, writeExact, encoded, parse, digest, canonical, plain, need,
  integer, text, urlOrigin, selectedApiPort, readConfiguration, readSelectedSource, offerDraft, SCHEMA as MERCHANT_SCHEMA}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';

import {initialRecord} from './records.mjs';

export const REQUEST_SCHEMA = 'stellar-forge.prepaid-api-starter.v1';
export const PLAN_SCHEMA = 'stellar-forge.prepaid-api-starter-plan.v1';
export const RESULT_SCHEMA = 'stellar-forge.prepaid-api-starter-result.v1';
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FIELDS = new Set(['schema', 'title', 'serviceName', 'publicOrigin', 'gatewayBaseUrl', 'payment',
  'checkoutPath', 'checkoutRouteId', 'functionPath', 'allowanceUnits', 'requestUnits',
  'workerPort', 'apiPort', 'timeoutSeconds', 'actor', 'python', 'backupPassEnv']);
const FILES = [
  'application/numeric-series.mjs', 'application/jobs.json', 'checkout.json',
  'backup-selection.json', 'merchant-workspace.json', 'offer-draft.json', 'examples/analyze.json',
];
const STARTER = fileURLToPath(new URL('./numeric-series.mjs', import.meta.url));

export function requestTemplate() {
  return {
    schema: REQUEST_SCHEMA, title: 'Number analysis access', serviceName: 'Prepaid number analysis',
    publicOrigin: null, gatewayBaseUrl: null,
    payment: {scheme: 'exact', network: 'stellar:testnet', asset: null, payTo: null,
      amount: null, maxTimeoutSeconds: 120},
    checkoutPath: '/purchase-access', checkoutRouteId: 'prepaid-api',
    functionPath: '/analyze', allowanceUnits: 100, requestUnits: 1,
    workerPort: 8431, apiPort: 8432, timeoutSeconds: 60,
    actor: 'merchant-operator', python: 'python3', backupPassEnv: 'SF101_BACKUP_PASSPHRASE',
  };
}

function normalizedRequest(value) {
  need(plain(value) && value.schema === REQUEST_SCHEMA && Object.keys(value).every(key => FIELDS.has(key)),
    'PREPAID_API_STARTER_REQUEST_REQUIRED');
  const request = {
    schema: REQUEST_SCHEMA, title: text(value.title, 160, 'PREPAID_API_TITLE_REQUIRED'),
    serviceName: value.serviceName ?? 'Prepaid number analysis',
    publicOrigin: value.publicOrigin, gatewayBaseUrl: urlOrigin(value.gatewayBaseUrl),
    payment: structuredClone(value.payment),
    checkoutPath: value.checkoutPath ?? '/purchase-access', checkoutRouteId: value.checkoutRouteId ?? 'prepaid-api',
    functionPath: value.functionPath ?? '/analyze',
    allowanceUnits: integer(value.allowanceUnits, 1, Number.MAX_SAFE_INTEGER, 'PREPAID_API_ALLOWANCE_REQUIRED'),
    requestUnits: integer(value.requestUnits, 1, value.allowanceUnits, 'PREPAID_API_ROUTE_UNITS_REQUIRED'),
    workerPort: integer(value.workerPort, 1, 65535, 'PREPAID_API_WORKER_PORT_REQUIRED'),
    apiPort: integer(value.apiPort, 0, 65535, 'PREPAID_API_API_PORT_REQUIRED'),
    timeoutSeconds: integer(value.timeoutSeconds ?? 60, 1, 120, 'PREPAID_API_TIMEOUT_REQUIRED'),
    actor: text(value.actor ?? 'merchant-operator', 120, 'PREPAID_API_ACTOR_REQUIRED'),
    python: text(value.python ?? 'python3', 4096, 'PREPAID_API_PYTHON_REQUIRED'),
    backupPassEnv: value.backupPassEnv ?? 'SF101_BACKUP_PASSPHRASE',
  };
  need(/^[A-Z][A-Z0-9_]{4,63}$/.test(request.backupPassEnv), 'PREPAID_API_BACKUP_ENV_REQUIRED');
  request.apiPort = selectedApiPort(request.apiPort, request.gatewayBaseUrl);
  need(request.apiPort === 0 || request.apiPort !== request.workerPort, 'PREPAID_API_PORTS_MUST_DIFFER');
  return request;
}

function generatedFiles(request, directory, applicationSource) {
  const application = join(directory, 'application');
  const payment = structuredClone(request.payment);
  const jobs = {
    schema: 'stellar-forge.paid-jobs.v1', application: './numeric-series.mjs',
    publicOrigin: request.publicOrigin, serviceName: request.serviceName, environment: [],
    workerCount: 1, maxPending: 128, maxJobs: 10000, memoryLimitMb: 128,
    functions: {analyze: {
      path: request.functionPath, description: 'Summary statistics and rolling means for a numeric series.',
      payment, inputSchema: {
        type: 'object', properties: {
          values: {type: 'array', minItems: 1, maxItems: 10000,
            items: {type: 'number', minimum: -1e12, maximum: 1e12}},
          window: {type: 'integer', minimum: 1, maximum: 10000},
        }, required: ['values', 'window'], additionalProperties: false,
      },
      example: {values: [2, 4, 6, 8], window: 2}, timeoutMs: 30000,
      maxInputBytes: 1024 * 1024, maxOutputBytes: 4 * 1024 * 1024,
      output: {format: 'json', contentType: 'application/json', filename: 'analysis.json'},
    }},
  };
  const checkout = {
    schema: 'stellar-forge.sf101.checkout-service.v1',
    publicOrigin: request.publicOrigin, path: request.checkoutPath, routeId: request.checkoutRouteId,
    description: request.title, payment, state: join(directory, 'merchant-state'), outbox: join(directory, 'outbox'),
    python: request.python, workerCount: 1, maxPending: 32,
  };
  // These are the original service compilers; invalid payment/origin/input terms fail before publication.
  compileJobMerchant(jobs, {baseDir: application});
  compileCheckout(checkout);
  const backup = {applicationRoot: application, dataRoots: [], environmentBindings: [], passEnv: request.backupPassEnv};
  const configuration = {
    schema: MERCHANT_SCHEMA, directory: join(directory, 'merchant-workspace'),
    merchant: join(application, 'jobs.json'), checkout: join(directory, 'checkout.json'),
    gatewayBaseUrl: request.gatewayBaseUrl, actor: request.actor, python: request.python, backup,
  };
  const draft = {
    title: request.title, allowanceUnits: request.allowanceUnits,
    workerPort: request.workerPort, apiPort: request.apiPort,
    routes: [{id: 'analyze', functionId: 'analyze', units: request.requestUnits,
      timeoutSeconds: request.timeoutSeconds}],
  };
  const json = value => encoded(value).toString('utf8');
  const content = [applicationSource, json(jobs), json(checkout), json(backup), json(configuration),
    json(draft), json({values: [2, 4, 6, 8], window: 2})];
  return FILES.map((name, index) => {
    const bytes = Buffer.from(content[index]);
    return {name, content: content[index], bytes: bytes.length, sha256: digest(bytes)};
  });
}

async function optional(path, limit = 1024 * 1024) {
  try {return parse(await ownedBytes(path, limit));}
  catch (error) {if (error.code === 'ENOENT') return null; throw error;}
}

function validatePlan(plan, directory, inputSha256) {
  need(plain(plan) && plan.schema === PLAN_SCHEMA && plan.directory === directory &&
    ID.test(plan.id) && HASH.test(plan.inputSha256) && (!inputSha256 || plan.inputSha256 === inputSha256) &&
    Number.isFinite(Date.parse(plan.createdAt)) && Array.isArray(plan.files) && plan.files.length === FILES.length,
    'PREPAID_API_RETAINED_SETUP_CHANGED', 409);
  need(digest(canonical(plan.input)) === plan.inputSha256, 'PREPAID_API_RETAINED_SETUP_CHANGED', 409);
  const request = normalizedRequest(plan.input);
  need(canonical(request) === canonical(plan.request), 'PREPAID_API_RETAINED_SETUP_CHANGED', 409);
  for (let index = 0; index < FILES.length; index++) {
    const file = plan.files[index];
    need(file?.name === FILES[index] && typeof file.content === 'string' &&
      Buffer.byteLength(file.content) === file.bytes && digest(file.content) === file.sha256,
      'PREPAID_API_RETAINED_SETUP_CHANGED', 409);
  }
  const generated = generatedFiles(request, directory, plan.files[0].content);
  need(canonical(generated) === canonical(plan.files), 'PREPAID_API_RETAINED_SETUP_CHANGED', 409);
  return plan;
}

async function validateMaterialized(directory, plan) {
  for (const file of plan.files) {
    const bytes = await ownedBytes(join(directory, file.name), 4 * 1024 * 1024);
    need(bytes.length === file.bytes && digest(bytes) === file.sha256, 'PREPAID_API_SETUP_FILE_CHANGED', 409);
  }
  const configuration = await readConfiguration(join(directory, 'merchant-workspace.json'));
  const source = await readSelectedSource(configuration);
  const draft = offerDraft(parse(await ownedBytes(join(directory, 'offer-draft.json'))), source);
  return {configuration, source, draft};
}

function description(directory, plan, actual) {
  return {
    schema: RESULT_SCHEMA, setupId: plan.id, directory, inputSha256: plan.inputSha256,
    planSha256: digest(encoded(plan)), config: actual.configuration.file,
    configSha256: actual.configuration.sha256, sourceSha256: actual.source.sha256,
    merchant: actual.configuration.merchant, checkout: actual.configuration.checkout,
    workspaceDirectory: actual.configuration.directory,
    launchFile: join(actual.configuration.directory, 'api-merchant-launch.json'),
    applicationRoot: join(directory, 'application'), offerDraftFile: join(directory, 'offer-draft.json'),
    exampleFile: join(directory, 'examples/analyze.json'), draft: actual.draft,
    payment: actual.source.checkout.terms, backupPassEnv: plan.request.backupPassEnv,
    files: plan.files.map(({content, ...file}) => file),
  };
}

/** Materialize one retained setup under the original Linux lease; repeat input reopens the same files. */
export async function preparePrepaidApi({directory, request}) {
  directory = absolute(directory);
  need(directory !== dirname(STARTER) && !STARTER.startsWith(directory + '/'),
    'PREPAID_API_SOURCE_AND_STATE_MUST_DIFFER');
  const input = structuredClone(request);
  normalizedRequest(input);
  const inputSha256 = digest(canonical(input));
  await ownedDirectory(directory, {create: true});
  const lease = await acquireStateLease(directory);
  try {
    lease.assertHeld();
    const plan = await initialRecord({directory, name: 'setup.json', lease,
      validate: value => validatePlan(value, directory, inputSha256),
      create: async () => {
        const source = await ownedBytes(STARTER, 4 * 1024 * 1024, {privateMode: false});
        const applicationSource = new TextDecoder('utf-8', {fatal: true}).decode(source);
        const normalized = normalizedRequest(input);
        return {schema: PLAN_SCHEMA, id: randomUUID(), createdAt: new Date().toISOString(),
          directory, input, inputSha256, request: normalized, files: generatedFiles(normalized, directory, applicationSource)};
      }});
    for (const file of plan.files) {
      lease.assertHeld();
      await ownedDirectory(dirname(join(directory, file.name)), {create: true});
      await writeExact(join(directory, file.name), Buffer.from(file.content));
    }
    const actual = await validateMaterialized(directory, plan);
    const result = description(directory, plan, actual);
    await writeExact(join(directory, 'setup-complete.json'), encoded(result));
    return result;
  } finally {
    await lease.close();
  }
}

/** Read original generated configuration; it never starts the merchant or performs a purchase. */
export async function inspectPrepaidApi(directory) {
  directory = await ownedDirectory(absolute(directory));
  const plan = validatePlan(await optional(join(directory, 'setup.json')), directory);
  const actual = await validateMaterialized(directory, plan), result = description(directory, plan, actual);
  const complete = await optional(join(directory, 'setup-complete.json'));
  need(complete && canonical(complete) === canonical(result), 'PREPAID_API_SETUP_INCOMPLETE', 409);
  return result;
}

export async function readPrepaidApiRequest(path) {
  return parse(await ownedBytes(absolute(path), 65536));
}
