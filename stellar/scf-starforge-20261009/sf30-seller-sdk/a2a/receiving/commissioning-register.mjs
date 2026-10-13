// SPDX-License-Identifier: MIT
// Additive local receiving over the completed original analysis + merchant programme.
import { realpathSync, lstatSync, readdirSync, openSync, readSync, closeSync, fstatSync, constants } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { acquireDatasetLease } from '../../dataset-refresh/writer-lease.mjs';
import { openA2AWorkspace } from '../workspace.mjs';
import { startA2AWorkspaceServer } from '../server.mjs';
import { commissioningTemplate, assertCommissioningSend } from '../commissioning.mjs';
import { decodePacket, inspectResultPacket } from '../portable.mjs';
import { receiveCommissioningBrowser } from './commissioning-browser.mjs';
import {
  canonical, clone, sha, atomicFile, readVerifiedFile, privateDirectory, fail
} from '../foundation.mjs';

export const REGISTER_OPERATION = 'SCF-A2A-CUSTOMER-COMMISSIONING-OPERATOR-0C7A-20261012';
export const REGISTER_SCHEMA = 'stellar-forge.a2a-commissioning-receiving.v1';
const ORIGINAL_OPERATION = 'SCF-A2A-NATIVE-ANALYSIS-0C7A-20261012';
const MERCHANT_OPERATION = 'SCF-A2A-MERCHANT-TASK-WORKSPACE-0C7A-20261012';
const REL = 'stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/';
const SOURCE_SCHEMA = 'stellar-forge.a2a-commissioning-source.v1';
const RECORDING = { bytes: 2965230, sha256: '34fb0322092a51525e94beda0d6c3b21548b7261d65d80909b27eb6fa6a2d466' };
const json = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const need = (value, code) => { if (!value) fail(code, code, 409); };
function maybe(path) {
  try { return json(readVerifiedFile(path)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function selectedFile(path, maximum = 256 * 1024 * 1024) {
  path = resolve(path);
  need(realpathSync(path) === path && lstatSync(path).isFile(), 'REGISTER_ORDINARY_INPUT');
  const bytes = readVerifiedFile(path, maximum);
  return { path, bytes, sha256: sha(bytes) };
}
function executableIdentity(path) {
  path = resolve(path);
  need(realpathSync(path) === path, 'REGISTER_RUNTIME_PATH');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW), hash = createHash('sha256');
  try {
    const before = fstatSync(fd), chunk = Buffer.allocUnsafe(65536);
    need(before.isFile(), 'REGISTER_RUNTIME_FILE');
    let length = 0;
    for (;;) {
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      hash.update(chunk.subarray(0, count)); length += count;
    }
    const after = fstatSync(fd), current = lstatSync(path);
    need(before.dev === after.dev && before.ino === after.ino && before.size === length &&
      before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs &&
      current.dev === before.dev && current.ino === before.ino && current.size === before.size,
      'REGISTER_RUNTIME_CHANGED');
    return { path, bytes: length, sha256: hash.digest('hex') };
  } finally { closeSync(fd); }
}
function relativeFile(path) {
  need(typeof path === 'string' && path && !path.includes('\\') && !path.includes('\0') &&
    !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..'),
    'REGISTER_RELATIVE_SOURCE');
  return path;
}
function sourceSelection(sourceRoot, manifestFile) {
  const source = realpathSync(sourceRoot);
  need(source === realpathSync(fileURLToPath(new URL('../../../../../', import.meta.url))) &&
    realpathSync(fileURLToPath(import.meta.url)) === join(source, REL, 'receiving/commissioning-register.mjs'),
    'REGISTER_EXECUTED_SOURCE');
  const selected = selectedFile(manifestFile), manifest = json(selected.bytes);
  need(manifest.schema === SOURCE_SCHEMA && /^[a-f0-9]{40}$/.test(manifest.sourceCommit ?? '') &&
    Array.isArray(manifest.files) && manifest.files.length > 0, 'REGISTER_SOURCE_MANIFEST');
  const seen = new Set();
  for (const row of manifest.files) {
    relativeFile(row.path); need(!seen.has(row.path), 'REGISTER_DUPLICATE_SOURCE'); seen.add(row.path);
    const file = selectedFile(join(source, row.path), 32 * 1024 * 1024);
    need(file.bytes.length === row.bytes && file.sha256 === row.sha256, 'REGISTER_SOURCE_CHANGED');
  }
  // The selected application is a closed source tree. Installed third-party
  // modules, Git metadata and Python bytecode caches are runtime material;
  // every other ordinary source leaf must occur in this exact manifest.
  const actual = new Set(), runtimeDirectories = new Set(['node_modules', '.git', '__pycache__']);
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (runtimeDirectories.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (path === selected.path) continue; // This separately hashed manifest cannot list itself.
      const stamp = lstatSync(path);
      need(!stamp.isSymbolicLink(), 'REGISTER_SOURCE_SYMLINK');
      if (stamp.isDirectory()) walk(path);
      else {
        need(stamp.isFile(), 'REGISTER_SOURCE_KIND');
        actual.add(relative(source, path).split(sep).join('/'));
      }
    }
  };
  walk(source);
  need(actual.size === seen.size && [...actual].every(path => seen.has(path)),
    'REGISTER_FULL_SOURCE_INVENTORY');
  for (const name of [
    'workspace.mjs', 'portable.mjs', 'foundation.mjs', 'transport.mjs', 'server.mjs', 'commissioning.mjs',
    'merchant.mjs', 'managed-launch.mjs',
    'schema.sql', 'web/app.mjs', 'web/commissioning.mjs', 'web/index.html', 'web/style.css',
    'receiving/commissioning-register.mjs', 'receiving/commissioning-browser.mjs'
  ]) need(seen.has(REL + name), 'REGISTER_SOURCE_CLOSURE');
  need(seen.has('stellar-forge/developer-site/a2a-customer-commissioning.json'), 'REGISTER_TEMPLATE_SOURCE');
  need(seen.has('stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs'),
    'REGISTER_WRITER_SOURCE');
  return { source, file: selected, manifest };
}
function basisSelection({ merchantDirectory, analysisResult, recordingFile }) {
  const directory = realpathSync(merchantDirectory), resultFile = selectedFile(join(directory, 'result.json'));
  const result = json(resultFile.bytes);
  need(result.schema === 'stellar-forge.a2a-merchant-commission.v1' &&
    result.operationId === MERCHANT_OPERATION && result.complete === true && result.ownersClosed === true &&
    result.browser?.complete === true && result.release?.closed === true &&
    result.payment?.verified === false && result.payment?.settled === false, 'REGISTER_ORIGINAL_MERCHANT_INCOMPLETE');
  const seen = new Set();
  for (const row of result.files) {
    relativeFile(row.path); need(!seen.has(row.path), 'REGISTER_ORIGINAL_DUPLICATE_OUTPUT'); seen.add(row.path);
    const file = selectedFile(join(directory, row.path));
    need(file.bytes.length === row.bytes && file.sha256 === row.sha256, 'REGISTER_ORIGINAL_OUTPUT_CHANGED');
  }
  for (const path of ['handoff/workspace-forward.json.gz', 'handoff/workspace-original.json.gz', 'handoff/result-v1.json.gz'])
    need(seen.has(path), 'REGISTER_ORIGINAL_PACKET_REQUIRED');
  const analysis = selectedFile(analysisResult), parent = json(analysis.bytes);
  need(parent.operationId === ORIGINAL_OPERATION && parent.status === 'ORIGINAL_SOURCE_A2A_RECEIVING_COMPLETE' &&
    parent.merchant?.projectId === result.projectId && parent.merchant?.task?.taskId === result.task.taskId &&
    parent.merchant?.editionId === result.editionId && parent.merchant?.complete === true,
    'REGISTER_ORIGINAL_ANALYSIS_INCOMPLETE');
  const recording = selectedFile(recordingFile, 32 * 1024 * 1024), original = json(recording.bytes);
  need(recording.bytes.length === RECORDING.bytes && recording.sha256 === RECORDING.sha256 &&
    parent.source?.recording?.bytes === RECORDING.bytes && parent.source.recording.sha256 === RECORDING.sha256 &&
    original.schema === 'stellar-forge.sensorthings-connector-responses.v1' &&
    original.source?.operationId === 'SCF_SENSORTHINGS_HAMBURG_NATIVE_1B40_20261012' && original.responses?.length === 28,
    'REGISTER_ORIGINAL_SOURCE_RECORDING');
  const sourceEdition = parent.source.editions?.find(row => row.window === 'window-1');
  need(sourceEdition?.editionId && sourceEdition.dataset?.rows === 660, 'REGISTER_ORIGINAL_SOURCE_EDITION');
  const forward = selectedFile(join(directory, 'handoff/workspace-forward.json.gz'));
  const prior = selectedFile(join(directory, 'handoff/workspace-original.json.gz'));
  const output = selectedFile(join(directory, 'handoff/result-v1.json.gz'));
  const packet = decodePacket(forward.bytes), edition = inspectResultPacket(output.bytes);
  need(packet.projectId === result.projectId && edition.project.id === result.projectId &&
    edition.edition.id === result.editionId && edition.nativeTaskId === result.task.taskId,
    'REGISTER_ORIGINAL_NATIVE_BINDING');
  return { directory, resultFile, result, analysis, parent, recording, sourceEdition, forward, prior, output };
}
function publicIdentity(file) { return { path: file.path, bytes: file.bytes.length, sha256: file.sha256 }; }
export async function receiveCommissioningRegister({
  directory, sourceRoot, sourceManifest, merchantDirectory, analysisResult, recordingFile,
  playwright, chromium, onProgress = value => process.stdout.write(JSON.stringify(value) + '\n')
}) {
  // All executed source and original completed input identities precede operation creation.
  const source = sourceSelection(sourceRoot, sourceManifest);
  const original = basisSelection({ merchantDirectory, analysisResult, recordingFile });
  const browser = executableIdentity(chromium), library = executableIdentity(playwright);
  const root = privateDirectory(directory), owner = await acquireDatasetLease(join(root, 'owner'));
  const selection = {
    operationId: REGISTER_OPERATION, originalOperationId: ORIGINAL_OPERATION, originalMerchantOperationId: MERCHANT_OPERATION,
    sourceRoot: source.source, sourceCommit: source.manifest.sourceCommit,
    sourceManifest: publicIdentity(source.file), originalMerchantResult: publicIdentity(original.resultFile),
    originalAnalysisResult: publicIdentity(original.analysis), recording: publicIdentity(original.recording),
    originalForward: publicIdentity(original.forward), originalResult: publicIdentity(original.output),
    node: { executable: process.execPath, version: process.version },
    playwright: library, chromium: browser
  };
  const journal = join(root, 'receiving.json');
  let data = maybe(journal), workspace, receiver, server;
  const save = () => { owner.assertHeld(); atomicFile(journal, Buffer.from(canonical(data)), { replace: true }); };
  const retain = (path, bytes, mediaType = 'application/json', persist = true) => {
    relativeFile(path); const b = Buffer.from(bytes), file = { path, bytes: b.length, sha256: sha(b), mediaType };
    atomicFile(join(root, path), b);
    if (data.files[path]) need(canonical(data.files[path]) === canonical(file), 'REGISTER_OUTPUT_CHANGED');
    data.files[path] = file; if (persist) save(); return file;
  };
  const progress = async (stage, details = {}) => {
    data.stage = stage; data.updatedAt = new Date().toISOString(); save();
    await onProgress({ operationId: REGISTER_OPERATION, stage, ...details });
  };
  async function closeOwners() {
    const errors = [];
    for (const item of [server, receiver, workspace]) if (item) {
      try { await item.close(); } catch (error) { errors.push(error); }
    }
    server = receiver = workspace = null;
    if (errors.length) throw new AggregateError(errors, 'Original commissioning receiving owners did not close.');
  }
  const finish = () => {
    need(data.finalCandidate?.ownersClosed === true, 'REGISTER_FINAL_CANDIDATE');
    atomicFile(join(root, 'result.json'), Buffer.from(canonical(data.finalCandidate)));
    const result = json(readVerifiedFile(join(root, 'result.json')));
    need(canonical(result) === canonical(data.finalCandidate), 'REGISTER_FINAL_RESULT_CHANGED');
    for (const file of result.files) {
      const bytes = readVerifiedFile(join(root, file.path));
      need(bytes.length === file.bytes && sha(bytes) === file.sha256, 'REGISTER_FINAL_FILE_CHANGED');
    }
    data.complete = true; save(); return result;
  };
  async function action(name, kind, fields = {}, target = workspace) {
    let step = data.actions[name];
    if (!step) {
      const payload = {
        id: original.result.projectId, expectedRevision: target.get(original.result.projectId).revision,
        requestId: randomUUID(), ...clone(fields)
      };
      step = { action: kind, payload }; data.actions[name] = step; save();
    }
    need(step.action === kind, 'REGISTER_ACTION_CHANGED');
    const result = await target.dispatch(kind, step.payload);
    need(result.state === 'complete', 'REGISTER_LOCAL_ACTION_FAILED');
    const selected = { requestId: result.requestId, revision: result.revision, result: clone(result.result) };
    if (step.result) need(canonical(step.result) === canonical(selected), 'REGISTER_LOCAL_REPLAY_CHANGED');
    step.result = selected; save(); return result;
  }
  function receive(name, bytes, target) {
    let step = data.receives[name];
    if (!step) { step = { requestId: randomUUID(), sha256: sha(bytes) }; data.receives[name] = step; save(); }
    need(step.sha256 === sha(bytes), 'REGISTER_RECEIVE_CHANGED');
    const result = target.receivePacket(bytes, { requestId: step.requestId });
    const { project, replay, ...record } = result;
    if (step.result) need(canonical(step.result) === canonical(record), 'REGISTER_RECEIVE_REPLAY_CHANGED');
    step.result = clone(record); save(); return result;
  }
  async function browserPhase(name, target, expected) {
    const key = 'browser-' + name;
    server = await startA2AWorkspaceServer({ workspace: target, port: data.ports[name] ?? 0 });
    const port = Number(new URL(server.origin).port);
    if (data.ports[name]) need(data.ports[name] === port, 'REGISTER_BROWSER_PORT_CHANGED');
    data.ports[name] = port; save();
    const result = await receiveCommissioningBrowser({
      directory: join(root, key), url: server.origin, workspaceId: target.workspaceId,
      projectId: original.result.projectId, phase: name, inputs: data.browserInputs, expected,
      playwright: library.path, chromium: browser.path
    });
    need(result.complete && result.closed, 'REGISTER_BROWSER_NOT_CLOSED');
    for (const file of result.files)
      retain(key + '/' + file.path, readVerifiedFile(join(root, key, file.path)), file.mediaType);
    const journalBytes = readVerifiedFile(join(root, key, 'browser.json'));
    retain(key + '/browser.json', journalBytes);
    retain(key + '/result.json', readVerifiedFile(join(root, key, 'result.json')));
    await server.close(); server = null;
    data.browsers[name] = result; save(); return result;
  }
  try {
    if (data) need(data.schema === REGISTER_SCHEMA && canonical(data.selection) === canonical(selection), 'REGISTER_SELECTION_CHANGED');
    else {
      data = { schema: REGISTER_SCHEMA, selection, createdAt: new Date().toISOString(), run: 0,
        actions: {}, receives: {}, files: {}, ports: {}, browsers: {}, complete: false };
      save();
    }
    if (data.complete || data.finalCandidate) return finish();
    data.run++; save();
    retain('inputs/original-merchant-result.json', original.resultFile.bytes);
    retain('inputs/original-analysis-result.json', original.analysis.bytes);
    retain('inputs/original-workspace-forward.json.gz', original.forward.bytes, 'application/gzip');
    retain('inputs/original-result.json.gz', original.output.bytes, 'application/gzip');
    retain('inputs/original-hamburg-recording.json', original.recording.bytes);
    retain('source-manifest.json', source.file.bytes);
    await progress('original-complete-inputs-verified', { projectId: original.result.projectId });

    workspace = await openA2AWorkspace({ directory: join(root, 'working'), connections: [],
      operator: 'Explicit Hamburg commissioning reference receiver',
      fetchImpl: async () => { fail('REGISTER_UNEXPECTED_NETWORK', 'This receiving continuation does not acquire another native task.'); } });
    receive('original-forward', original.forward.bytes, workspace);
    let p = workspace.get(original.result.projectId);
    need(!p.networkEnabled, 'REGISTER_ORIGINAL_CONNECTION_AUTHORITY');
    const queryPacket = inspectResultPacket(workspace.exportResult(p.id, original.result.editionId).bytes);
    need(workspace.exportResult(p.id, original.result.editionId).sha256 === original.output.sha256,
      'REGISTER_LEGACY_RESULT_BYTES_CHANGED');
    const queryMessage = queryPacket.packet.messages.find(message =>
      message.native.message.parts.some(part => part.data?.action === 'run' &&
        part.data.procedureId === 'query_observations_complete'));
    need(queryMessage && queryMessage.native.message.parts[0].data.parametersText === '[]',
      'REGISTER_ORIGINAL_QUERY_REQUEST');
    const catalogues = p.artifactCaptures.filter(capture => capture.complete &&
      capture.files.some(file => file.filename === 'catalog.json'));
    need(catalogues.length === 1, 'REGISTER_ORIGINAL_CATALOGUE_CAPTURE');
    const capture = catalogues[0];
    await action('accept-original-catalogue', 'review_result', {
      observationId: capture.observationId, captureId: capture.id, decision: 'accepted',
      note: 'Local reference receiving of the complete original catalogue already captured by the original programme; no additional agent call.'
    });
    const catalogue = await action('freeze-original-catalogue', 'freeze_result', {
      observationId: capture.observationId, title: 'Original approved analytical catalogue — reference receiving'
    });
    const catalogueEditionId = catalogue.result.editionId;
    const cataloguePacket = workspace.exportResult(p.id, catalogueEditionId);
    retain('inputs/original-catalogue-edition.json.gz', cataloguePacket.bytes, 'application/gzip');
    const catalogFile = capture.files.find(file => file.filename === 'catalog.json');
    const catalogValue = json(workspace.readSource(p.id, catalogFile.sha256).bytes);
    const procedure = catalogValue.procedures.find(row => row.id === 'query_observations_complete');
    need(procedure?.views.length > 0, 'REGISTER_ORIGINAL_PROCEDURE_VIEWS');
    const publication = workspace.get(p.id).publications.find(row => row.id === original.result.publicationId);
    need(publication?.service.routes.length > 0, 'REGISTER_ORIGINAL_PUBLICATION');
    const serviceUrl = new URL(publication.service.routes[0].path, publication.service.publicOrigin).href;
    const originalTemplate = commissioningTemplate();
    retain('inputs/commissioning-plan.json', originalTemplate.bytes);
    const realization = {
      schema: 'stellar-forge.a2a-commissioning-reference-realization.v1',
      operationId: REGISTER_OPERATION, context: 'reference', originalOperationId: ORIGINAL_OPERATION,
      originalProjectId: p.id, originalTaskId: original.result.task.taskId,
      statement: 'Authored application receiving realization. No real customer approval, independent-buyer adoption or settled payment is claimed.',
      originalInput: { recording: RECORDING, sourceEdition: clone(original.sourceEdition),
        start: '2026-09-14T00:00:00Z', endExclusive: '2026-10-12T10:31:58Z',
        population: 'Original numeric Hamburg Datastream 18571, complete selected fixed window.' },
      procedure: clone(procedure), merchantServiceUrl: serviceUrl,
      originalResult: { editionId: original.result.editionId, sha256: original.output.sha256,
        files: clone(queryPacket.files), payment: clone(original.result.payment) }
    };
    retain('inputs/reference-approval.json', Buffer.from(canonical(realization)));
    retain('inputs/reference-receiving.json', Buffer.from(canonical({
      schema: 'stellar-forge.a2a-commissioning-reference-receiving.v1',
      statement: realization.statement, originalMerchantResultSha256: original.resultFile.sha256,
      originalAnalysisResultSha256: original.analysis.sha256, result: clone(original.result),
      selectedSource: clone(realization.originalInput), acceptedNativeFiles: clone(queryPacket.files)
    })));
    const file = (path, filename, mediaType = 'application/json') => ({
      ...data.files[path], path: join(root, path), filename, mediaType
    });
    const selectedInputs = {
      files: {
        plan: file('inputs/commissioning-plan.json', 'a2a-customer-commissioning.json'),
        approval: file('inputs/reference-approval.json', 'explicit-reference-approval.json'),
        receiving: file('inputs/reference-receiving.json', 'original-complete-receiving.json'),
        recording: file('inputs/original-hamburg-recording.json', 'original-hamburg-28-responses.json')
      },
      scheduledDate: original.result.completedAt.slice(0, 10),
      attribution: realization.statement + ' The full original thirty-job template is retained. A-Q01 is used for the separately attributed original Hamburg task; the other planned rows remain unselected.',
      buyer: {
        organization: 'Explicit original Hamburg reference receiver',
        accountableBuyer: 'Authored reference operator; no customer purchaser',
        receivingPerson: 'Original programme receiving operator',
        population: realization.originalInput.population,
        independenceBasis: 'Reference only. Independent customer adoption is not asserted.'
      },
      buyerReason: 'Keep the original full public-source demonstration separate from the prospective customer programme.',
      merchant: {
        organization: 'Original SF30/SF82 reference installation',
        installationId: 'original-merchant-reference:' + p.id, serviceUrl,
        accountableOperator: 'Original A2A merchant programme'
      },
      merchantReason: 'Retain the existing original publication and challenge-only reference terms; no payment or settlement is claimed.',
      period: {
        startsAt: realization.originalInput.start, endsAt: realization.originalInput.endExclusive,
        sourceEditionId: original.sourceEdition.editionId,
        licenseBasis: 'Retained source declaration: Datenlizenz Deutschland — Namensnennung — Version 2.0; attribution Freie und Hansestadt Hamburg, Behörde für Wirtschaft und Innovation. Original source: https://suche.transparenz.hamburg.de/dataset/elektro-ladestandorte-hamburg36 .',
        population: realization.originalInput.population
      },
      correctedPopulation: realization.originalInput.population + ' Includes all 660 original rows, source-native null/status values and identifiers; no independent measurement correction is asserted.'
    };
    if (data.browserInputs) need(canonical(data.browserInputs) === canonical(selectedInputs), 'REGISTER_REFERENCE_INPUT_CHANGED');
    data.browserInputs = selectedInputs; save();
    const expected = {
      catalogueEditionId, procedureId: procedure.id, parametersText: '[]', viewCount: procedure.views.length,
      messageId: queryMessage.id, editionId: original.result.editionId, publicationId: publication.id
    };
    await progress('actual-commissioning-browser');
    const initial = await browserPhase('initial', workspace, expected);
    p = workspace.get(p.id);
    const selectedPlan = p.commissioningView.plans.find(row => row.id === initial.planId);
    need(selectedPlan?.counts.accepted === 1 && selectedPlan.counts.acceptedAdopted === 1 &&
      selectedPlan.counts.acceptedPrepared === 0 && selectedPlan.counts.verifiedSettlements === null,
      'REGISTER_REFERENCE_COUNTS');
    const rejected = (fn, code) => {
      let observed; try { fn(); } catch (error) { observed = error.code; }
      need(observed === code, 'REGISTER_REJECTION_' + code); return observed;
    };
    const initialJournal = json(readVerifiedFile(join(root, 'browser-initial/browser.json')));
    const correctionRevision = initialJournal.steps['period-correction'].response.revision;
    const currentRevision = p.revision;
    data.guards = {
      changedApproval: rejected(() => assertCommissioningSend(workspace.raw(p.id, correctionRevision),
        initial.unsentMessageId), 'COMMISSION_APPROVAL_CHANGED'),
      supersededUnsentMessage: rejected(() => assertCommissioningSend(workspace.raw(p.id),
        initial.unsentMessageId), 'COMMISSION_SUPERSEDED_MESSAGE'),
      originalTaskCount: selectedPlan.counts.observedTasks,
      originalResultSha256: workspace.exportResult(p.id, original.result.editionId).sha256
    };
    need(data.guards.originalResultSha256 === original.output.sha256 && workspace.get(p.id).revision === currentRevision,
      'REGISTER_GUARD_SIDE_EFFECT');
    const originalOperations = decodePacket(original.forward.bytes).history.at(-1).body.operations;
    need(canonical(workspace.raw(p.id).operations) === canonical(originalOperations),
      'REGISTER_ADDITIONAL_NATIVE_OPERATION');
    save();

    const first = await action('handoff-first', 'create_handoff', {
      title: 'Original task with complete reference commissioning',
      notes: 'Full original task, complete source recording, corrected approval, unsent preparation history and attributed retrospective receiving; no new native query or settlement.'
    });
    const firstPacket = workspace.exportPacket(p.id, { handoffId: first.result.handoffId });
    retain('handoff/commissioning-original.json.gz', firstPacket.bytes, 'application/gzip');
    retain('handoff/commissioning-original-report.json', Buffer.from(canonical(
      workspace.commissioningReport(p.id, { revision: firstPacket.manifest.revision })) + '\n'));

    receiver = await openA2AWorkspace({ directory: join(root, 'received'), connections: [],
      operator: 'Receiving host original commissioning reviewer' });
    const fresh = receive('commissioning-fresh', firstPacket.bytes, receiver);
    need(['imported', 'already_present'].includes(fresh.status) && !receiver.get(p.id).networkEnabled,
      'REGISTER_FRESH_RECEIVING');
    const same = receive('commissioning-same', firstPacket.bytes, receiver);
    need(same.status === 'already_present', 'REGISTER_SAME_RECEIVING');
    await receiver.close(); receiver = null;

    await browserPhase('forward', workspace, {
      ...expected, planId: initial.planId, preparationId: initial.preparationId,
      receivingSource: initial.receivingSource, historicalRevision: firstPacket.manifest.revision
    });
    const next = await action('handoff-forward', 'create_handoff', {
      title: 'Original commissioning with cumulative receiving decisions',
      notes: 'Preserves the original complete handoff and both subsequent changes-requested/accepted decisions against the same native task.'
    });
    const forward = workspace.exportPacket(p.id, { handoffId: next.result.handoffId });
    retain('handoff/commissioning-forward.json.gz', forward.bytes, 'application/gzip');
    need(workspace.exportPacket(p.id, { handoffId: first.result.handoffId }).sha256 === firstPacket.sha256,
      'REGISTER_HISTORICAL_HANDOFF_CHANGED');

    receiver = await openA2AWorkspace({ directory: join(root, 'received'), connections: [],
      operator: 'Receiving host original commissioning reviewer' });
    const advanced = receive('commissioning-forward', forward.bytes, receiver);
    need(['advanced', 'already_present'].includes(advanced.status), 'REGISTER_FORWARD_RECEIVING');
    const beforeOlder = receiver.get(p.id).revision;
    const older = receive('commissioning-older', firstPacket.bytes, receiver);
    need(older.status === 'older_retained' && receiver.get(p.id).revision === beforeOlder, 'REGISTER_OLDER_RECEIVING');
    need(receiver.exportPacket(p.id, { handoffId: first.result.handoffId }).sha256 === firstPacket.sha256 &&
      receiver.exportPacket(p.id, { handoffId: next.result.handoffId }).sha256 === forward.sha256 &&
      receiver.exportResult(p.id, original.result.editionId).sha256 === original.output.sha256,
      'REGISTER_COMPLETE_RECEIVED_BYTES');
    await browserPhase('received', receiver, {
      ...expected, planId: initial.planId, preparationId: initial.preparationId,
      receivingSource: initial.receivingSource, historicalRevision: firstPacket.manifest.revision
    });
    const received = receiver.get(p.id), finalReport = receiver.commissioningReport(p.id);
    retain('handoff/commissioning-received-report.json', Buffer.from(canonical(finalReport) + '\n'));
    data.receivedRevision = received.revision; data.planId = initial.planId; save();
    await closeOwners();

    // Reopen the same received private workspace before publication.
    receiver = await openA2AWorkspace({ directory: join(root, 'received'), connections: [],
      operator: 'Receiving host original commissioning reviewer' });
    need(receiver.get(p.id).revision === data.receivedRevision &&
      receiver.exportPacket(p.id, { handoffId: next.result.handoffId }).sha256 === forward.sha256 &&
      canonical(receiver.commissioningReport(p.id).commissioning) === canonical(finalReport.commissioning),
      'REGISTER_REOPEN_CHANGED');
    await closeOwners();
    await progress('all-original-receiving-owners-closed');

    for (const row of source.manifest.files) {
      const bytes = selectedFile(join(source.source, row.path)).bytes;
      need(bytes.length === row.bytes && sha(bytes) === row.sha256, 'REGISTER_SOURCE_CHANGED_DURING_RUN');
      retain('source/' + row.path, bytes, 'application/octet-stream', false);
    }
    data.finalCandidate = {
      schema: REGISTER_SCHEMA, operationId: REGISTER_OPERATION, complete: true, ownersClosed: true,
      completedAt: new Date().toISOString(), selection,
      originalProjectId: p.id, originalTaskId: original.result.task.taskId, planId: initial.planId,
      originalResultSha256: original.output.sha256, currentRevision: data.receivedRevision,
      handoffs: { original: { id: first.result.handoffId, sha256: firstPacket.sha256 },
        forward: { id: next.result.handoffId, sha256: forward.sha256 } },
      attribution: realization.statement, guards: data.guards, receives: clone(data.receives),
      counts: clone(finalReport.commissioning.counts),
      settlement: { verified: null, status: 'not_evaluated', authority: 'Original SF30/SF82 records' },
      browsers: Object.fromEntries(Object.entries(data.browsers).map(([key, value]) => [key, {
        complete: value.complete, closed: value.closed, files: value.files, pageErrors: value.pageErrors
      }])),
      files: Object.values(data.files).sort((a, b) => a.path.localeCompare(b.path))
    };
    save(); return finish();
  } catch (error) {
    if (data && !data.complete) {
      data.lastError = { code: error.code ?? 'REGISTER_RECEIVING_FAILED', message: String(error.message),
        stage: data.stage ?? null, at: new Date().toISOString() };
      try { save(); } catch {}
    }
    throw error;
  } finally {
    try { await closeOwners(); } finally { await owner.close(); }
  }
}
export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: {
    directory: { type: 'string' }, source: { type: 'string' }, 'source-manifest': { type: 'string' },
    'original-merchant': { type: 'string' }, 'original-analysis-result': { type: 'string' },
    recording: { type: 'string' }, playwright: { type: 'string' }, chromium: { type: 'string' },
    help: { type: 'boolean' }
  } });
  if (values.help) {
    process.stdout.write('node receiving/commissioning-register.mjs --directory ABS --source ABS --source-manifest ABS --original-merchant ABS --original-analysis-result ABS --recording ABS --playwright ABS --chromium ABS\nUses the completed original analysis/merchant results and its exact Hamburg recording; local register/browser/portable receiving only. Source manifest schema: stellar-forge.a2a-commissioning-source.v1 with sourceCommit and all application source files[{path,bytes,sha256}]. The inventory must match the complete source tree; only node_modules, .git, __pycache__ and the separately hashed manifest itself are excluded.\n');
    return;
  }
  for (const name of ['directory', 'source', 'source-manifest', 'original-merchant', 'original-analysis-result', 'recording', 'playwright', 'chromium'])
    need(typeof values[name] === 'string' && values[name].startsWith('/'), 'REGISTER_EXPLICIT_PATH_' + name);
  const result = await receiveCommissioningRegister({
    directory: values.directory, sourceRoot: values.source, sourceManifest: values['source-manifest'],
    merchantDirectory: values['original-merchant'], analysisResult: values['original-analysis-result'],
    recordingFile: values.recording, playwright: values.playwright, chromium: values.chromium
  });
  process.stdout.write(JSON.stringify({ operationId: REGISTER_OPERATION, complete: result.complete,
    result: join(resolve(values.directory), 'result.json') }) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => {
    process.stderr.write(JSON.stringify({ code: error.code ?? 'REGISTER_RECEIVING_FAILED', message: error.message }) + '\n');
    process.exitCode = 1;
  });
