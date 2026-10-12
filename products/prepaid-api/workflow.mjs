// MIT. First offer and customer handoff through the running original merchant workspace.
import {join, dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readdir, lstat, unlink, open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {readMerchantWorkspaceLaunch, requestMerchantWorkspaceJson, downloadMerchantWorkspaceFile}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/cli.mjs';
import {absolute, ownedDirectory, ownedBytes, writeExact, encoded, parse, digest, canonical, plain, need,
  UUID, HASH, REF, text, integer}
  from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import {validateHandoff} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/checkout-config.mjs';
import {syncDirectory} from '../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/store.mjs';
import {inspectPrepaidApi} from './setup.mjs';
import {initialRecord} from './records.mjs';

const FLOW_SCHEMA = 'stellar-forge.prepaid-api-workflow.v1';
const STEP_SCHEMA = 'stellar-forge.prepaid-api-native-step.v1';
const RECEIVING_SCHEMA = 'stellar-forge.prepaid-api-customer-files.v1';
const ACTIVE = new Set(['QUEUED', 'RUNNING']);
const TERMINAL = new Set(['COMPLETED', 'ATTENTION', 'CANCELLED']);

async function optional(path, limit = 4 * 1024 * 1024) {
  try {return parse(await ownedBytes(path, limit));}
  catch (error) {if (error.code === 'ENOENT') return null; throw error;}
}
const same = (left, right) => canonical(left) === canonical(right);
const inside = (parent, child) => parent === child || child.startsWith(parent + '/');

async function connected(setup, launchFile, expectedWorkspaceId) {
  const launch = await readMerchantWorkspaceLaunch(absolute(launchFile));
  need(launch.directory === setup.workspaceDirectory && launch.config === setup.config &&
    launch.configSha256 === setup.configSha256 && launch.sourceSha256 === setup.sourceSha256 &&
    (!expectedWorkspaceId || launch.workspaceId === expectedWorkspaceId),
    'PREPAID_API_ORIGINAL_CONSOLE_REQUIRED', 409);
  const view = await requestMerchantWorkspaceJson(launch, '/api/state');
  need(view.workspace?.id === launch.workspaceId && view.workspace.source?.sha256 === setup.sourceSha256,
    'PREPAID_API_ORIGINAL_CONSOLE_CHANGED', 409);
  return {launch, view};
}
async function withFlow({directory, launchFile, name, intent}, execute) {
  const setup = await inspectPrepaidApi(directory);
  const folder = join(setup.directory, 'workflows', name);
  await ownedDirectory(folder, {create: true});
  const lease = await acquireStateLease(folder);
  try {
    const context = await connected(setup, launchFile);
    const flow = await initialRecord({directory: folder, name: 'workflow.json', lease,
      validate: value => {
        need(value?.schema === FLOW_SCHEMA && UUID.test(value.id) && value.setupId === setup.setupId &&
          value.inputSha256 === setup.inputSha256 && value.workspaceId === context.launch.workspaceId && same(value.intent, intent),
          'PREPAID_API_WORKFLOW_IDENTITY_CHANGED', 409);
        return value;
      },
      create: async () => ({schema: FLOW_SCHEMA, id: randomUUID(), setupId: setup.setupId, inputSha256: setup.inputSha256,
        workspaceId: context.launch.workspaceId, createdAt: new Date().toISOString(), intent})});
    return await execute({setup, flow, folder, lease, launchFile: absolute(launchFile)});
  } finally {
    await lease.close();
  }
}
function validateStep(step, context, kind, goal) {
  need(step?.schema === STEP_SCHEMA && step.workflowId === context.flow.id &&
    step.workspaceId === context.flow.workspaceId && step.kind === kind && HASH.test(step.requestSha256) &&
    Number.isSafeInteger(step.attempt) && step.attempt >= 1 && step.attempt <= 100 &&
    UUID.test(step.request?.operationId) && Number.isSafeInteger(step.request.expectedRevision) &&
    step.request.expectedRevision > 0 && step.requestSha256 === digest(canonical(step.request)) &&
    same(step.goal, goal), 'PREPAID_API_RETAINED_NATIVE_REQUEST_CHANGED', 409);
  const {operationId, expectedRevision, ...actual} = step.request;
  need(same(actual, goal), 'PREPAID_API_RETAINED_NATIVE_REQUEST_CHANGED', 409);
  return step;
}
function validateOperation(operation, step, full = false) {
  need(operation?.id === step.request.operationId && operation.kind === step.kind &&
    operation.requestSha256 === step.requestSha256 &&
    (ACTIVE.has(operation.status) || TERMINAL.has(operation.status)),
    'PREPAID_API_NATIVE_OPERATION_CHANGED', 409);
  if (full) need(same(operation.request, step.request), 'PREPAID_API_NATIVE_OPERATION_CHANGED', 409);
  return operation;
}
async function observed(context, step) {
  const {launch} = await connected(context.setup, context.launchFile, context.flow.workspaceId);
  try {
    return validateOperation(await requestMerchantWorkspaceJson(launch,
      '/api/operations/' + step.request.operationId), step, true);
  } catch (error) {
    if (error.status === 404 && error.code === 'API_MERCHANT_OPERATION_NOT_FOUND') return null;
    throw error;
  }
}

const admissionName = (name, attempt) => attempt === 1 ? name + '.request.json' :
  name + '.admission-' + String(attempt).padStart(4, '0') + '.request.json';
const rejectionName = (name, attempt) => name + '.admission-' + String(attempt).padStart(4, '0') + '.rejected.json';
function rejectionView(value, context, step) {
  need(value?.schema === 'stellar-forge.prepaid-api-admission-rejection.v1' &&
    value.workflowId === context.flow.id && value.operationId === step.request.operationId &&
    value.requestSha256 === step.requestSha256 && value.code === 'API_MERCHANT_WORKSPACE_REVISION_CHANGED' &&
    value.status === 409 && value.outcomeUnknown === false && value.operationAbsent === true,
    'PREPAID_API_ADMISSION_HISTORY_CHANGED', 409);
  return value;
}
async function rejection(context, name, step) {
  const value = await optional(join(context.folder, rejectionName(name, step.attempt)));
  return value === null ? null : rejectionView(value, context, step);
}
function rejectedResult(context, name, step, admission) {
  return {status: 'ADMISSION_REJECTED', operation: null, admission,
    requestFile: join(context.folder, admissionName(name, step.attempt)), workflowId: context.flow.id};
}
async function nextStep(context, name, kind, goal, previous = null) {
  const attempt = previous ? previous.attempt + 1 : 1;
  need(attempt <= 100, 'PREPAID_API_ADMISSION_ATTEMPT_LIMIT', 409);
  const path = join(context.folder, admissionName(name, attempt));
  const retained = await optional(path);
  if (retained) {
    need(retained.attempt === attempt && same(retained.previous, previous ?
      {operationId: previous.request.operationId, requestSha256: previous.requestSha256} : null),
      'PREPAID_API_ADMISSION_HISTORY_CHANGED', 409);
    return validateStep(retained, context, kind, goal);
  }
  const {view} = await connected(context.setup, context.launchFile, context.flow.workspaceId);
  const request = {...goal, operationId: randomUUID(), expectedRevision: view.workspace.revision};
  const step = {schema: STEP_SCHEMA, workflowId: context.flow.id, workspaceId: context.flow.workspaceId,
    kind, attempt, previous: previous ? {operationId: previous.request.operationId,
      requestSha256: previous.requestSha256} : null,
    createdAt: new Date().toISOString(), goal, request, requestSha256: digest(canonical(request))};
  context.lease.assertHeld(); await writeExact(path, encoded(step));
  return validateStep(step, context, kind, goal);
}
async function retainedStep(context, name, kind, goal) {
  need(/^[a-z][a-z0-9-]*$/.test(name), 'PREPAID_API_STAGE_REQUIRED');
  const names = await readdir(context.folder), prefix = name + '.admission-';
  const attempts = names.filter(file => file.startsWith(prefix) && file.endsWith('.request.json')).map(file => {
    const text = file.slice(prefix.length, -'.request.json'.length);
    need(/^[0-9]{4}$/.test(text), 'PREPAID_API_ADMISSION_HISTORY_CHANGED', 409);
    return Number(text);
  }).sort((a, b) => a - b);
  need(attempts.length <= 99 && (!attempts.length || names.includes(admissionName(name, 1))) &&
    attempts.every((attempt, index) => attempt === index + 2), 'PREPAID_API_ADMISSION_HISTORY_CHANGED', 409);
  let step = await nextStep(context, name, kind, goal);
  for (let attempt = 2; attempt <= 100; attempt++) {
    const following = await optional(join(context.folder, admissionName(name, attempt)));
    if (!following) return step;
    const declined = await rejection(context, name, step);
    need(declined && same(following.previous, {operationId: step.request.operationId,
      requestSha256: step.requestSha256}) && following.attempt === attempt,
      'PREPAID_API_ADMISSION_HISTORY_CHANGED', 409);
    // Every retired admission was definitively rejected. A later appearance
    // must be reconciled before any new native action can be dispatched.
    need(await observed(context, step) === null, 'PREPAID_API_REJECTED_OPERATION_APPEARED', 409);
    step = validateStep(following, context, kind, goal);
  }
  return step;
}

/** Lost replies preserve one original request; only a definite rejected admission can be revised. */
async function stage(context, name, kind, goal, {resume = false, maxWaitMs = 120000, signal} = {}) {
  need(typeof resume === 'boolean', 'PREPAID_API_RESUME_BOOLEAN_REQUIRED');
  integer(maxWaitMs, 0, 3600000, 'PREPAID_API_WAIT_REQUIRED');
  signal?.throwIfAborted();
  let step = await retainedStep(context, name, kind, goal);
  let operation = await observed(context, step);
  const declined = await rejection(context, name, step);
  if (declined) {
    need(operation === null, 'PREPAID_API_REJECTED_OPERATION_APPEARED', 409);
    if (!resume) return rejectedResult(context, name, step, declined);
    signal?.throwIfAborted();
    step = await nextStep(context, name, kind, goal, step);
    operation = await observed(context, step);
  }
  const path = join(context.folder, admissionName(name, step.attempt));
  if (!operation) {
    signal?.throwIfAborted(); context.lease.assertHeld();
    const {launch} = await connected(context.setup, context.launchFile, context.flow.workspaceId);
    try {
      const reply = await requestMerchantWorkspaceJson(launch, '/api/actions/' + kind, {body: step.request});
      operation = validateOperation(reply.operation, step);
    } catch (error) {
      let absenceConfirmed = false;
      try {operation = await observed(context, step); absenceConfirmed = operation === null;} catch {}
      if (!operation && absenceConfirmed && error.status === 409 &&
          error.code === 'API_MERCHANT_WORKSPACE_REVISION_CHANGED' && error.outcomeUnknown !== true) {
        const admission = {schema: 'stellar-forge.prepaid-api-admission-rejection.v1',
          workflowId: context.flow.id, operationId: step.request.operationId, requestSha256: step.requestSha256,
          code: error.code, status: 409, outcomeUnknown: false, operationAbsent: true,
          observedAt: new Date().toISOString()};
        context.lease.assertHeld();
        await writeExact(join(context.folder, rejectionName(name, step.attempt)), encoded(admission));
        return rejectedResult(context, name, step, admission);
      }
      if (!operation) {
        Object.assign(error, {operationId: step.request.operationId, requestSha256: step.requestSha256,
          requestFile: path, workflowId: context.flow.id});
        throw error;
      }
    }
  }
  if (operation.status === 'ATTENTION' && resume) {
    signal?.throwIfAborted(); context.lease.assertHeld();
    const {launch} = await connected(context.setup, context.launchFile, context.flow.workspaceId);
    try {
      const reply = await requestMerchantWorkspaceJson(launch, '/api/operations/' + operation.id + '/resume',
        {body: {requestSha256: step.requestSha256}});
      operation = validateOperation(reply.operation, step);
    } catch (error) {
      try {operation = await observed(context, step);} catch {}
      if (!operation || operation.status === 'ATTENTION') {
        Object.assign(error, {operationId: step.request.operationId, requestSha256: step.requestSha256, requestFile: path});
        throw error;
      }
    }
  }
  const deadline = Date.now() + maxWaitMs;
  while (ACTIVE.has(operation.status) && Date.now() < deadline) {
    signal?.throwIfAborted();
    await delay(Math.min(250, Math.max(1, deadline - Date.now())), undefined, {signal});
    operation = await observed(context, step);
    need(operation, 'PREPAID_API_NATIVE_OPERATION_NOT_FOUND', 409);
  }
  if (operation.status === 'COMPLETED') {
    operation = await observed(context, step);
    need(operation?.status === 'COMPLETED', 'PREPAID_API_NATIVE_OPERATION_CHANGED', 409);
    await writeExact(join(context.folder, name + '.completed.json'), encoded(operation));
  }
  return {status: operation.status, operation, requestFile: path, workflowId: context.flow.id};
}

export async function publishPrepaidApi({directory, launchFile, resume = false, maxWaitMs = 120000, signal} = {}) {
  return withFlow({directory, launchFile, name: 'publication', intent: {kind: 'first-offer'}}, async context => {
    const prepare = await stage(context, 'prepare', 'offer_prepare',
      {...context.setup.draft, expectedSourceSha256: context.setup.sourceSha256}, {resume, maxWaitMs, signal});
    if (prepare.status !== 'COMPLETED') return {stage: 'prepare', ...prepare};
    const offerId = prepare.operation.result?.offerId;
    need(UUID.test(offerId), 'PREPAID_API_PREPARED_OFFER_REQUIRED', 409);
    const publish = await stage(context, 'publish', 'offer_publish', {offerId}, {resume, maxWaitMs, signal});
    if (publish.status !== 'COMPLETED') return {stage: 'publish', ...publish};
    const {launch} = await connected(context.setup, context.launchFile, context.flow.workspaceId);
    const selected = await requestMerchantWorkspaceJson(launch, '/api/offers/' + offerId);
    need(selected.offer?.id === offerId && selected.offer.status === 'READY' &&
      selected.offer.sourceSha256 === context.setup.sourceSha256,
      'PREPAID_API_PUBLISHED_OFFER_CHANGED', 409);
    const result = {schema: 'stellar-forge.prepaid-api-publication.v1', status: 'READY',
      setupId: context.setup.setupId, workspaceId: context.flow.workspaceId, workflowId: context.flow.id,
      offerId, offer: selected.offer, files: selected.files,
      operations: {prepare: prepare.operation.id, publish: publish.operation.id}};
    await writeExact(join(context.folder, 'publication.json'), encoded(result));
    return result;
  });
}
async function publicationFor(setup) {
  const value = await optional(join(setup.directory, 'workflows/publication/publication.json'));
  need(value?.schema === 'stellar-forge.prepaid-api-publication.v1' && value.status === 'READY' &&
    value.setupId === setup.setupId && UUID.test(value.workspaceId) && UUID.test(value.offerId),
    'PREPAID_API_PUBLISHED_OFFER_REQUIRED', 409);
  return value;
}

export async function preparePrepaidCustomer({directory, launchFile, orderReference, label,
  resume = false, maxWaitMs = 120000, signal} = {}) {
  need(REF.test(orderReference ?? ''), 'ORDER_REFERENCE_INVALID');
  label = text(label, 240, 'PREPAID_API_CUSTOMER_LABEL_REQUIRED');
  const intent = {kind: 'customer-handoff', orderReference, label};
  return withFlow({directory, launchFile, name: 'customer-' + digest(orderReference), intent}, async context => {
    const publication = await publicationFor(context.setup);
    need(publication.workspaceId === context.flow.workspaceId, 'PREPAID_API_ORIGINAL_CONSOLE_CHANGED', 409);
    const result = await stage(context, 'handoff', 'order_prepare',
      {offerId: publication.offerId, orderReference, label}, {resume, maxWaitMs, signal});
    if (result.status !== 'COMPLETED') return result;
    const native = result.operation.result;
    need(native?.orderReference === orderReference && native.order?.offerId === publication.offerId &&
      UUID.test(native.export?.id), 'PREPAID_API_CUSTOMER_HANDOFF_CHANGED', 409);
    return {schema: 'stellar-forge.prepaid-api-customer-handoff.v1', status: 'READY',
      setupId: context.setup.setupId, workspaceId: context.flow.workspaceId, workflowId: context.flow.id,
      orderReference, offerId: publication.offerId, operationId: result.operation.id, export: native.export};
  });
}

// A process can stop between the original downloader's link and temporary unlink.
// Retire only the one original private temporary sharing this exact named member.
async function receivedMember(path, member) {
  let info;
  try {info = await lstat(path);} catch (error) {if (error.code === 'ENOENT') return false; throw error;}
  if (info.nlink === 2 && info.isFile() && !info.isSymbolicLink() && !(info.mode & 0o077) &&
      (!process.getuid || info.uid === process.getuid())) {
    const matches = [];
    for (const name of await readdir(dirname(path))) {
      if (!/^\.merchant-download-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(name)) continue;
      const candidate = join(dirname(path), name), temporary = await lstat(candidate);
      if (temporary.isFile() && !temporary.isSymbolicLink() && temporary.dev === info.dev && temporary.ino === info.ino)
        matches.push(candidate);
    }
    need(matches.length === 1, 'PREPAID_API_DOWNLOAD_LINK_CHANGED', 409);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      need(opened.isFile() && opened.dev === info.dev && opened.ino === info.ino && opened.nlink === 2 &&
        !(opened.mode & 0o077) && (!process.getuid || opened.uid === process.getuid()) &&
        opened.size === member.bytes, 'PREPAID_API_DOWNLOAD_LINK_CHANGED', 409);
      const body = await handle.readFile(), after = await handle.stat();
      need(body.length === member.bytes && digest(body) === member.sha256 &&
        after.dev === opened.dev && after.ino === opened.ino && after.size === opened.size &&
        after.mtimeMs === opened.mtimeMs && after.ctimeMs === opened.ctimeMs,
        'PREPAID_API_RECEIVED_MEMBER_CHANGED', 409);
      const named = await lstat(path), temporary = await lstat(matches[0]);
      need(named.isFile() && !named.isSymbolicLink() && named.dev === opened.dev && named.ino === opened.ino &&
        named.nlink === 2 && named.mtimeMs === after.mtimeMs && named.ctimeMs === after.ctimeMs &&
        temporary.isFile() && !temporary.isSymbolicLink() && temporary.dev === opened.dev && temporary.ino === opened.ino,
        'PREPAID_API_DOWNLOAD_LINK_CHANGED', 409);
      await unlink(matches[0]); await syncDirectory(dirname(path));
    } finally { await handle.close(); }
  }
  const bytes = await ownedBytes(path, 32 * 1024 * 1024);
  need(bytes.length === member.bytes && digest(bytes) === member.sha256,
    'PREPAID_API_RECEIVED_MEMBER_CHANGED', 409);
  return true;
}

/** Receive every original customer handoff member, including its private credentials, into one private directory. */
export async function downloadPrepaidCustomer({directory, launchFile, orderReference, out, signal} = {}) {
  need(REF.test(orderReference ?? ''), 'ORDER_REFERENCE_INVALID');
  const setup = await inspectPrepaidApi(directory), publication = await publicationFor(setup);
  const {launch} = await connected(setup, launchFile, publication.workspaceId);
  const order = await requestMerchantWorkspaceJson(launch, '/api/orders/' + encodeURIComponent(orderReference));
  need(order.order?.orderReference === orderReference && order.order.offerId === publication.offerId &&
    UUID.test(order.order.handoffExportId), 'PREPAID_API_CUSTOMER_HANDOFF_REQUIRED', 409);
  const exportId = order.order.handoffExportId;
  const manifest = await requestMerchantWorkspaceJson(launch, '/api/exports/' + exportId);
  need(manifest.schema === 'stellar-forge.sf101.api-merchant-export.v1' && manifest.id === exportId &&
    Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 64,
    'PREPAID_API_HANDOFF_EXPORT_REQUIRED', 409);
  const names = new Set();
  for (const file of manifest.files) {
    need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(file.name ?? '') && !names.has(file.name) &&
      !['receiving.json', 'complete.json', 'lease.lock'].includes(file.name) &&
      HASH.test(file.sha256) && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= 32 * 1024 * 1024 &&
      file.downloadUrl === '/api/exports/' + exportId + '/files/' + encodeURIComponent(file.name),
      'PREPAID_API_HANDOFF_EXPORT_REQUIRED', 409);
    names.add(file.name);
  }
  need(names.has('handoff.json') && names.has('api-pass.json') && names.has('credentials.json'),
    'PREPAID_API_COMPLETE_CUSTOMER_HANDOFF_REQUIRED', 409);
  out = absolute(out);
  for (const protectedRoot of [setup.workspaceDirectory, setup.applicationRoot,
    join(setup.directory, 'merchant-state'), join(setup.directory, 'outbox'), join(setup.directory, 'workflows')])
    need(!inside(protectedRoot, out) && !inside(out, protectedRoot), 'PREPAID_API_CUSTOMER_DIRECTORY_OVERLAP', 409);
  await ownedDirectory(out, {create: true});
  const lease = await acquireStateLease(out);
  try {
    const record = {schema: RECEIVING_SCHEMA, workspaceId: publication.workspaceId, orderReference,
      offerId: publication.offerId, exportId, manifest};
    await initialRecord({directory: out, name: 'receiving.json', lease,
      validate: value => {need(same(value, record), 'PREPAID_API_CUSTOMER_RECEIVING_CHANGED', 409); return value;},
      create: async () => record});
    for (const file of manifest.files) {
      signal?.throwIfAborted(); lease.assertHeld();
      if (await receivedMember(join(out, file.name), file)) continue;
      await connected(setup, launchFile, publication.workspaceId);
      await downloadMerchantWorkspaceFile({launchFile, exportId, name: file.name,
        out: join(out, file.name), expectedSha256: file.sha256});
      await receivedMember(join(out, file.name), file);
    }
    const handoff = validateHandoff(parse(await ownedBytes(join(out, 'handoff.json'), 131072)));
    const plan = await ownedBytes(join(out, 'api-pass.json'), 32 * 1024 * 1024);
    need(handoff.orderReference === orderReference && handoff.file.sha256 === digest(plan) &&
      handoff.file.bytes === plan.length, 'PREPAID_API_CUSTOMER_PLAN_CHANGED', 409);
    const result = {schema: RECEIVING_SCHEMA, status: 'COMPLETE', workspaceId: publication.workspaceId,
      orderReference, offerId: publication.offerId, exportId, directory: out,
      files: manifest.files.map(({downloadUrl, ...file}) => file)};
    await writeExact(join(out, 'complete.json'), encoded(result));
    return result;
  } finally {
    await lease.close();
  }
}
