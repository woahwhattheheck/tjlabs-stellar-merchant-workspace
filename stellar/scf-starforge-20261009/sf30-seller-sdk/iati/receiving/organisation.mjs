// MIT. Complete customer receiving on the original IATI organisation engine.
// Usage: node organisation.mjs /absolute/private/receiving-config.json
import { open, mkdir, lstat, realpath, readFile, link, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA = 'stellar-forge.iati-organisation-receiving.v1';
const PREFIX = 'merchant_source_iati_organisation_';
const SHA = /^[0-9a-f]{64}$/;
const REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MAX_METADATA = 64 * 1024 * 1024;
const fail = message => Object.assign(new Error(message), { code: 'ORGANISATION_RECEIVING' });
const need = (condition, message) => { if (!condition) throw fail(message); };
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
  return value;
}
const canonical = value => JSON.stringify(ordered(value));
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const equivalent = (left, right) => canonical(left) === canonical(right);
const missing = error => error.code === 'ENOENT';
const positive = value => Number.isSafeInteger(value) && value > 0;

async function directory(path) {
  need(typeof path === 'string' && isAbsolute(path) && !path.includes('\0'), 'Use absolute original host directories.');
  await mkdir(path, { recursive: true, mode: 0o700 });
  const selected = await lstat(path);
  need(selected.isDirectory() && !selected.isSymbolicLink() && await realpath(path) === resolve(path) &&
    (process.platform === 'win32' || !(selected.mode & 0o077)), 'Receiving directories must remain private real directories.');
  return resolve(path);
}
async function digestFile(path) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const first = await handle.stat();
    need(first.isFile(), 'Use a complete regular receiving file.');
    const digest = createHash('sha256'); let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) { bytes += chunk.length; digest.update(chunk); }
    const last = await handle.stat();
    need(first.dev === last.dev && first.ino === last.ino && first.size === last.size &&
      first.mtimeMs === last.mtimeMs && bytes === first.size, 'A receiving file changed while reading.');
    return { bytes, sha256: digest.digest('hex') };
  } finally { await handle.close(); }
}
async function readJSON(path) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    need(info.isFile() && info.size <= MAX_METADATA, 'The original receiving JSON must be a complete bounded regular file.');
    const bytes = await handle.readFile();
    need(bytes.length === info.size, 'The receiving JSON changed while reading.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { await handle.close(); }
}
async function optionalJSON(path) {
  try { return await readJSON(path); } catch (error) { if (missing(error)) return null; throw error; }
}
async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}
async function exactFile(path, bytes) {
  try {
    const current = await digestFile(path);
    need(current.bytes === bytes.length && current.sha256 === hash(bytes), 'Existing receiving output belongs to different complete bytes: ' + path);
    return { path, ...current, reopened: true };
  } catch (error) { if (!missing(error)) throw error; }
  const temporary = join(dirname(path), '.receiving-' + randomUUID());
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const current = await digestFile(path);
      need(current.bytes === bytes.length && current.sha256 === hash(bytes), 'A concurrent receiving output differs.');
    }
    await syncDirectory(dirname(path));
    return { path, bytes: bytes.length, sha256: hash(bytes), reopened: false };
  } finally { await handle?.close(); await unlink(temporary).catch(error => { if (!missing(error)) throw error; }); }
}
async function exactJSON(path, value) { return exactFile(path, jsonBytes(value)); }
function planIdentity(plan) {
  need(plain(plan) && SHA.test(plan.id ?? '') && positive(plan.revision) && SHA.test(plan.recordSha256 ?? ''),
    'The original engine did not return an immutable organisation plan.');
  return { id: plan.id, revision: plan.revision, recordSha256: plan.recordSha256,
    sourceId: plan.sourceId, candidateSha256: plan.candidateSha256, state: plan.state };
}
function samePlan(actual, expected, message) {
  need(equivalent(planIdentity(actual), planIdentity(expected)), message);
}
function resultIdentity(action, value) {
  if (action === 'release') return { plan: planIdentity(value.plan), release: value.release,
    files: Object.fromEntries(Object.entries(value.files).map(([kind, file]) =>
      [kind, { name: file.name, bytes: file.bytes, sha256: file.sha256, media: file.media }])) };
  if (action === 'compare') return value;
  return planIdentity(value);
}
function validateConfiguration(value) {
  need(plain(value), 'Use the complete original receiving configuration.');
  for (const key of ['iatiDirectory', 'mcpDirectory', 'senderConnectionFile', 'receiverConnectionFile', 'exportsDirectory', 'outputDirectory'])
    need(typeof value[key] === 'string' && isAbsolute(value[key]) && !value[key].includes('\0'), 'Select original absolute ' + key + '.');
  for (const key of ['sourceId', 'organisationKey', 'planId']) need(SHA.test(value[key] ?? ''), 'Select the original ' + key + '.');
  need(positive(value.releasedRevision), 'Select the original released revision.');
  for (const name of ['save', 'review', 'release', 'compare']) {
    const request = value[name + 'Request'];
    need(plain(request) && REQUEST.test(request.requestId ?? ''), 'Supply the unchanged original ' + name + ' request.');
  }
  need(typeof value.reviewRequest.actor === 'string' && value.reviewRequest.actor.trim(), 'Retain the original named reviewer.');
  for (const key of ['expectedBudgetRows', 'expectedDocumentRows'])
    need(Number.isSafeInteger(value[key]) && value[key] >= 0, 'Supply the original complete ' + key + '.');
  return value;
}

export async function receiveOrganisation(input, { write = value => process.stdout.write(JSON.stringify(value) + '\n') } = {}) {
  const config = validateConfiguration(typeof input === 'string' ? await readJSON(resolve(input)) : input);
  const output = await directory(config.outputDirectory);
  await directory(config.exportsDirectory);
  const requestsDirectory = await directory(join(output, 'requests'));
  const observationsDirectory = await directory(join(output, 'observations'));
  const filesDirectory = await directory(join(output, 'files'));
  const { connectIatiWorkspace } = await import(pathToFileURL(join(config.iatiDirectory, 'client.mjs')).href);
  const { MerchantSourceWorkspaces, readSourceWorkspaceConfiguration, SOURCE_WORKSPACE_CONNECTION_SCHEMA } =
    await import(pathToFileURL(join(config.mcpDirectory, 'source-workspace.mjs')).href);
  const connectionDocument = {
    schema: SOURCE_WORKSPACE_CONNECTION_SCHEMA,
    workspaces: {
      sender: { format: 'iati', label: 'Original organisation publisher workspace', consoleUrlFile: config.senderConnectionFile, files: {} },
      receiver: { format: 'iati', label: 'Independent organisation receiving workspace', consoleUrlFile: config.receiverConnectionFile, files: {} }
    }
  };
  // This document contains declared file references, never their bearer-token contents.
  const mcpConfigurationFile = join(output, 'mcp-workspaces.json');
  await exactJSON(mcpConfigurationFile, connectionDocument);
  const mcpConfiguration = { exportsDirectory: resolve(config.exportsDirectory),
    sourceWorkspaces: await readSourceWorkspaceConfiguration(mcpConfigurationFile) };
  let merchant = new MerchantSourceWorkspaces(mcpConfiguration), sender, receiver;
  let runIdentity, originalRecords, release, senderNote, receiverNote, packet, phase = 'connect';
  const observations = [];
  const observe = async (name, value) => {
    const bytes = jsonBytes(value), sha256 = hash(bytes);
    const file = name + '-' + sha256 + '.json';
    await exactFile(join(observationsDirectory, file), bytes);
    observations.push({ name, file: 'observations/' + file, bytes: bytes.length, sha256 });
    return value;
  };
  const progress = (name, details = {}) => { phase = name; write({ schema: SCHEMA, phase: name, ...details }); };
  const call = async (alias, action, args = {}) => {
    const value = await merchant.call(PREFIX + action, { workspace: alias, ...args });
    need(value.workspace === alias, 'The original MCP response changed workspace alias.');
    return ['export', 'file'].includes(action) ? value : value.native;
  };
  const checkWorkspace = async (client, alias, expected) => {
    const [native, throughMCP] = await Promise.all([client.organisationStatus(), call(alias, 'status')]);
    need(native.workspaceSha256 === expected && throughMCP.workspaceSha256 === expected,
      'An original workspace connection changed during receiving.');
    return native;
  };
  const pages = async (alias, selected, section, expected) => {
    const rows = []; let offset = 0, snapshot, total, pageCount = 0;
    do {
      const page = await call(alias, 'rows', { ...selected, section, offset, limit: 37,
        ...(snapshot === undefined ? {} : { expectedSnapshot: snapshot }) });
      need(Array.isArray(page.rows) && SHA.test(page.snapshotSha256 ?? '') && page.offset === offset &&
        Number.isSafeInteger(page.total), 'The native register page is incomplete.');
      if (snapshot === undefined) { snapshot = page.snapshotSha256; total = page.total; }
      need(page.snapshotSha256 === snapshot && page.total === total, 'The immutable organisation register changed while paging.');
      rows.push(...page.rows); pageCount += 1;
      if (page.nextOffset === null) break;
      need(page.nextOffset === rows.length && page.nextOffset > offset, 'The native row continuation did not advance.');
      offset = page.nextOffset;
    } while (true);
    need(rows.length === total && (expected === undefined || total === expected), 'The complete original ' + section + ' row count differs.');
    need(new Set(rows.map(row => row.id)).size === rows.length, 'The original register repeated a row identity.');
    return { selected, section, total, pageCount, snapshotSha256: snapshot, rows };
  };
  const originalRequest = async (action, client, supplied, createComparison = false) => {
    let record = await client.organisationRequest(supplied.requestId);
    if (record.state === 'NOT_RECORDED' && action === 'compare' && createComparison) {
      await client.organisationCompare(supplied);
      record = await client.organisationRequest(supplied.requestId);
    }
    need(record.state === 'RECORDED' && record.action === action && equivalent(record.input, supplied),
      'The supplied ' + action + ' does not match its retained original request.');
    return record;
  };
  const replay = async (client, alias, current) => {
    for (const [action, baseline] of Object.entries(originalRecords)) {
      const supplied = config[action + 'Request'];
      const actual = await call(alias, action, { definition: supplied });
      need(equivalent(resultIdentity(action, actual), resultIdentity(action, baseline.result)),
        'Original ' + action + ' replay changed its retained historical result.');
      const read = await originalRequest(action, client, supplied);
      need(equivalent(resultIdentity(action, read.result), resultIdentity(action, baseline.result)),
        'Original request reopening changed its historical result.');
      const byMCP = await call(alias, 'request', { requestId: supplied.requestId });
      need(byMCP.state === 'RECORDED' && byMCP.action === action && equivalent(byMCP.input, supplied),
        'MCP request recovery lost the complete original input.');
    }
    const after = await client.organisationPlan(config.planId);
    samePlan(after, current, 'Historical request replay replaced the current receiving edition.');
    return { current: planIdentity(after), requests: Object.fromEntries(Object.entries(originalRecords)
      .map(([action, record]) => [action, { requestId: record.requestId, historicalRevision: record.plan.revision }])) };
  };
  const noteEdition = async (client, alias, note, seed) => {
    const requestId = 'organisation-receiving-' + alias + '-' + hash(canonical(seed));
    const path = join(requestsDirectory, alias + '-note.json');
    let prepared = await optionalJSON(path);
    const existing = await client.organisationRequest(requestId);
    if (existing.state === 'RECORDED') {
      need(existing.action === 'save', 'The original receiving note ID belongs to another action.');
      if (prepared) need(equivalent(prepared, existing.input), 'The retained receiving note input differs from its native request.');
      prepared = existing.input;
    }
    if (!prepared) {
      const current = await client.organisationPlan(config.planId);
      need(current.sourceId === config.sourceId && current.organisationKeys.includes(config.organisationKey),
        'The selected current plan no longer covers the received source and organisation.');
      prepared = {
        requestId, id: current.id, expectedRevision: current.revision, name: current.name,
        sourceId: current.sourceId, organisationKeys: current.organisationKeys,
        assessment: current.assessment, acquisition: current.acquisition, edits: current.edits,
        notes: (current.notes ? current.notes + '\n\n' : '') + note, actor: config.reviewRequest.actor
      };
    }
    need(prepared.requestId === requestId && prepared.id === config.planId && prepared.sourceId === config.sourceId &&
      typeof prepared.notes === 'string' && prepared.notes.endsWith(note),
      'The retained note request belongs to a different receiving selection.');
    await exactJSON(path, prepared);
    const saved = await call(alias, 'save', { definition: prepared });
    const recovered = await client.organisationRequest(requestId);
    need(recovered.state === 'RECORDED' && equivalent(recovered.input, prepared), 'The receiving note did not retain its exact native request.');
    samePlan(saved, recovered.result, 'The receiving note returned a different original revision.');
    const current = await client.organisationPlan(config.planId);
    need(current.revision >= saved.revision, 'The current edition lost the received note.');
    return { saved, current, request: prepared };
  };
  const chunk = async (metadata, offset, limit, readId) => {
    const result = await merchant.call('merchant_source_file_read', { workspace: 'sender',
      exportId: metadata.exportId, offset, limit, ...(readId === undefined ? {} : { readId }) });
    need(result.workspace === 'sender' && result.exportId === metadata.exportId &&
      result.file?.sha256 === metadata.sha256 && result.file.bytes === metadata.bytes &&
      result.offset === offset && typeof result.data === 'string' && result.encoding === 'base64',
      'The retained MCP chunk changed its original file selection.');
    const bytes = Buffer.from(result.data, 'base64');
    need(bytes.toString('base64') === result.data && bytes.length === result.bytesRead &&
      bytes.length === Math.min(limit, metadata.bytes - offset) &&
      result.nextOffset === (offset + bytes.length < metadata.bytes ? offset + bytes.length : null),
      'The original retained chunk is incomplete.');
    return { result, bytes };
  };
  const download = async (metadata, name, interrupt = false, discard = false) => {
    need(SHA.test(metadata.exportId ?? '') && metadata.sha256 === metadata.exportId &&
      Number.isSafeInteger(metadata.bytes) && metadata.bytes >= 0, 'The original export descriptor is incomplete.');
    const target = discard ? null : join(filesDirectory, name);
    const temporary = target ? join(filesDirectory, '.receiving-' + randomUUID()) : null;
    let handle, activeRead, offset = 0, chunks = 0, cut, reopenedRead = false;
    const digest = createHash('sha256');
    try {
      if (temporary) handle = await open(temporary, 'wx', 0o600);
      do {
        const limit = interrupt && chunks === 0 ? Math.min(5003, Math.max(1, metadata.bytes - 1)) : 65536;
        const value = await chunk(metadata, offset, limit, activeRead);
        activeRead = value.result.readId;
        digest.update(value.bytes); await handle?.writeFile(value.bytes);
        offset += value.bytes.length; chunks += 1;
        if (cut && chunks === 2) {
          need(value.result.readId !== cut.readId, 'The resumed original file read reused a released cursor.');
          reopenedRead = true;
        }
        if (value.result.nextOffset === null) { activeRead = undefined; break; }
        if (interrupt && chunks === 1) {
          cut = { offset, readId: activeRead, prefixSha256: hash(value.bytes), completeSha256: metadata.sha256 };
          await merchant.call('merchant_source_file_release', { workspace: 'sender', readId: activeRead });
          activeRead = undefined;
        }
      } while (true);
      const sha256 = digest.digest('hex');
      need(offset === metadata.bytes && sha256 === metadata.sha256, 'The complete original download differs from its native descriptor.');
      if (cut) need(reopenedRead, 'The original prefix read did not reopen to completion.');
      if (handle) {
        await handle.sync(); await handle.close(); handle = null;
        try { await link(temporary, target); }
        catch (error) {
          if (error.code !== 'EEXIST') throw error;
          const previous = await digestFile(target);
          need(previous.bytes === offset && previous.sha256 === sha256, 'An existing complete downloaded member differs.');
        }
        await syncDirectory(filesDirectory);
      }
      return { ...(name ? { name, file: 'files/' + name } : {}), bytes: offset, sha256, chunks,
        ...(cut ? { releasedPrefix: cut, reopenedRead: true } : {}) };
    } finally {
      if (activeRead) await merchant.call('merchant_source_file_release', { workspace: 'sender', readId: activeRead }).catch(() => {});
      await handle?.close();
      if (temporary) await unlink(temporary).catch(error => { if (!missing(error)) throw error; });
    }
  };
  const exportSelection = async () => {
    const selected = await optionalJSON(join(output, 'selected-packet.json'));
    if (selected) {
      need(selected.organisation === config.planId && selected.revision === config.releasedRevision &&
        selected.kind === 'organisation' && selected.sha256 === selected.exportId,
        'The saved packet selection differs from the released edition.');
      return selected;
    }
    // Recover a completed original export whose local reply was lost before this receipt.
    let offset = 0, snapshot, candidates = [];
    do {
      const response = await merchant.call('merchant_source_exports', { workspace: 'sender', offset, limit: 100,
        ...(snapshot ? { expectedSnapshot: snapshot } : {}) });
      const native = response.native; snapshot ??= native.snapshot;
      candidates.push(...native.items.filter(item => item.kind === 'organisation' &&
        item.organisation === config.planId && item.revision === config.releasedRevision));
      if (native.nextOffset === null) break;
      offset = native.nextOffset;
    } while (true);
    candidates.sort((a, b) => a.created.localeCompare(b.created) || a.exportId.localeCompare(b.exportId));
    const retained = candidates[0] ?? await call('sender', 'export', { id: config.planId, revision: config.releasedRevision });
    await exactJSON(join(output, 'selected-packet.json'), retained);
    return retained;
  };
  try {
    sender = await connectIatiWorkspace({ consoleUrlFile: config.senderConnectionFile });
    receiver = await connectIatiWorkspace({ consoleUrlFile: config.receiverConnectionFile });
    const [senderStatus, receiverStatus] = await Promise.all([sender.organisationStatus(), receiver.organisationStatus()]);
    need(SHA.test(senderStatus.workspaceSha256 ?? '') && SHA.test(receiverStatus.workspaceSha256 ?? '') &&
      senderStatus.workspaceSha256 !== receiverStatus.workspaceSha256, 'Use two independently opened original workspaces.');
    runIdentity = {
      schema: SCHEMA, sourceId: config.sourceId, organisationKey: config.organisationKey, planId: config.planId,
      releasedRevision: config.releasedRevision, expectedBudgetRows: config.expectedBudgetRows,
      expectedDocumentRows: config.expectedDocumentRows,
      senderWorkspaceSha256: senderStatus.workspaceSha256, receiverWorkspaceSha256: receiverStatus.workspaceSha256,
      requests: Object.fromEntries(['save', 'review', 'release', 'compare'].map(action => [action, config[action + 'Request']]))
    };
    await exactJSON(join(output, 'receiving-selection.json'), runIdentity);
    await checkWorkspace(sender, 'sender', senderStatus.workspaceSha256);
    await checkWorkspace(receiver, 'receiver', receiverStatus.workspaceSha256);
    progress('original-source-and-plan');
    const profile = await sender.organisationProfile(config.sourceId);
    const profileMCP = await call('sender', 'profile', { sourceId: config.sourceId });
    need(profile.source.id === config.sourceId && equivalent(profileMCP, profile),
      'The original source profile differs between native client and MCP.');
    await observe('publisher-profile', profile);
    const released = await sender.organisationPlan(config.planId, { revision: config.releasedRevision });
    need(released.sourceId === config.sourceId && released.organisationKeys.includes(config.organisationKey) &&
      released.state === 'RELEASED', 'Select the actual reviewed and released organisation edition.');
    samePlan(await call('sender', 'plan', { id: config.planId, revision: config.releasedRevision }), released,
      'MCP selected a different historical release.');
    await observe('released-plan', released);
    originalRecords = {};
    for (const action of ['save', 'review', 'release', 'compare'])
      originalRecords[action] = await originalRequest(action, sender, config[action + 'Request'], true);
    release = originalRecords.release.result;
    samePlan(release.plan, released, 'The original release request does not select the supplied released revision.');
    await exactJSON(join(output, 'original-requests.json'), originalRecords);
    progress('complete-registers');
    const sourceSelection = { sourceId: config.sourceId, organisationKey: config.organisationKey };
    const candidateSelection = { id: config.planId, revision: config.releasedRevision, organisationKey: config.organisationKey };
    const registers = {};
    for (const [view, selected] of [['source', sourceSelection], ['candidate', candidateSelection]]) {
      for (const [section, expected] of [['budgets', config.expectedBudgetRows], ['documents', config.expectedDocumentRows]]) {
        const all = await pages('sender', selected, section, expected);
        const typed = await sender.organisationRows({ ...selected, section, offset: 0, limit: 37 });
        need(typed.snapshotSha256 === all.snapshotSha256 && equivalent(typed.rows, all.rows.slice(0, 37)),
          'The typed client selected a different immutable register page.');
        registers[view + '-' + section] = all;
        await observe(view + '-' + section, all);
      }
    }
    const documentRows = registers['source-documents'];
    const chosen = documentRows.rows.find(row => typeof row.url === 'string' && row.url !== row.url.trim()) ??
      documentRows.rows[0] ?? registers['source-budgets'].rows[0];
    need(chosen, 'The original publisher has no row available for exact target receiving.');
    const detailSelection = { ...sourceSelection, rowId: chosen.id,
      expectedSnapshot: (documentRows.rows.includes(chosen) ? documentRows : registers['source-budgets']).snapshotSha256 };
    const detail = await call('sender', 'detail', detailSelection);
    const target = detail.targets.find(item => item.kind === 'element' && item.path !== detail.row.path) ??
      detail.targets.find(item => item.kind === 'element');
    need(target, 'The original row did not expose its XML-bound element targets.');
    const selectedDetail = await call('sender', 'detail', { ...detailSelection, targetId: target.id });
    need(selectedDetail.selectedTarget?.id === target.id && selectedDetail.selectedTarget.nodeSha256 === target.nodeSha256 &&
      typeof selectedDetail.selectedTarget.xml === 'string' && hash(Buffer.from(selectedDetail.selectedTarget.xml)) === target.nodeSha256,
      'Selected target detail did not return its exact original element XML.');
    const typedDetail = await sender.organisationDetail({ ...detailSelection, targetId: target.id });
    need(equivalent(typedDetail, selectedDetail), 'Typed and MCP target detail selected different original XML.');
    const rootDetail = await call('sender', 'detail', { ...sourceSelection, rowId: config.organisationKey });
    need(rootDetail.row.organisationKey === config.organisationKey, 'Whole-organisation detail changed its selected organisation.');
    await observe('selected-row-and-target', selectedDetail);
    await observe('whole-organisation-detail', rootDetail);
    progress('complete-native-files');
    packet = await exportSelection();
    const downloads = [await download(packet, 'organisation.zip', true)];
    for (const [kind, name] of [['source', 'organisation-source.xml'], ['candidate', 'organisation-candidate.xml'],
      ['report', 'organisation-report.html'], ['budgets', 'organisation-budgets.csv'], ['documents', 'organisation-documents.csv']]) {
      const retained = await call('sender', 'file', { id: config.planId, revision: config.releasedRevision, kind });
      const native = release.files[kind];
      need(retained.fileKind === kind && retained.organisation === config.planId && retained.revision === config.releasedRevision &&
        retained.bytes === native.bytes && retained.sha256 === native.sha256,
        'The retained ' + kind + ' member differs from the original release descriptor.');
      downloads.push(await download(retained, name));
    }
    await exactJSON(join(output, 'received-files.json'), downloads.map(({ chunks, releasedPrefix, reopenedRead, ...file }) => file));
    await observe('complete-file-receiving', downloads);
    progress('historical-request-replay');
    await checkWorkspace(sender, 'sender', senderStatus.workspaceSha256);
    senderNote = await noteEdition(sender, 'sender',
      'Retained complete organisation handover ' + packet.sha256 + ' from released revision ' + config.releasedRevision +
      ' for the independently opened receiving workspace ' + receiverStatus.workspaceSha256 + '.',
      { binding: runIdentity, packetSha256: packet.sha256 });
    need(senderNote.saved.revision > config.releasedRevision, 'The later sender note did not create its separate native edition.');
    await observe('sender-note', senderNote.saved);
    await observe('sender-replay', await replay(sender, 'sender', senderNote.current));
    progress('independent-workspace-receiving');
    await checkWorkspace(receiver, 'receiver', receiverStatus.workspaceSha256);
    const received = await call('receiver', 'receive', { exportId: packet.exportId, fromWorkspace: 'sender' });
    need(received.state === 'COMPLETE' && received.packet.sha256 === packet.sha256 && received.packet.bytes === packet.bytes,
      'The receiver did not accept the complete selected native archive.');
    samePlan(received.plan, released, 'The receiver changed the selected historical release.');
    await observe('first-receive', received);
    receiverNote = await noteEdition(receiver, 'receiver',
      'Received complete organisation handover ' + packet.sha256 + ' from released revision ' + config.releasedRevision +
      '. Full source XML, candidate XML, HTML review and both CSV registers were retained and checked against their native file descriptors.',
      { binding: runIdentity, packetSha256: packet.sha256 });
    await observe('receiver-note', receiverNote.saved);
    const beforeAgain = await receiver.organisationPlan(config.planId);
    const repeated = await call('receiver', 'receive', { exportId: packet.exportId, fromWorkspace: 'sender' });
    samePlan(repeated.plan, released, 'Repeated packet receiving changed the historical selected release.');
    samePlan(repeated.currentPlan, beforeAgain, 'Repeated older packet receiving replaced the current receiving note.');
    samePlan(await receiver.organisationPlan(config.planId), beforeAgain, 'The receiving current pointer changed during original packet replay.');
    await observe('repeat-receive-preserves-current', repeated);
    await observe('receiver-replay', await replay(receiver, 'receiver', beforeAgain));
    const receivedRows = await pages('receiver', { id: config.planId, revision: beforeAgain.revision,
      organisationKey: config.organisationKey }, 'budgets', config.expectedBudgetRows);
    need(equivalent(receivedRows.rows, registers['candidate-budgets'].rows),
      'The receiving-note edition changed original budget rows.');
    await observe('receiver-complete-budgets', receivedRows);
    progress('retained-file-reopen');
    await merchant.close();
    merchant = new MerchantSourceWorkspaces(mcpConfiguration);
    await checkWorkspace(sender, 'sender', senderStatus.workspaceSha256);
    const reopened = await download(packet, null, false, true);
    need(reopened.sha256 === packet.sha256 && reopened.bytes === packet.bytes,
      'The original retained packet changed after MCP close and reopen.');
    await observe('mcp-close-reopen-complete-file', reopened);
    const finalSender = await sender.organisationPlan(config.planId);
    const finalReceiver = await receiver.organisationPlan(config.planId);
    samePlan(finalSender, senderNote.current, 'The final sender edition changed during receiving.');
    samePlan(finalReceiver, beforeAgain, 'The final receiver edition changed during receiving.');
    await merchant.close(); merchant = null;
    await Promise.all([sender.dispose(), receiver.dispose()]);
    const result = {
      schema: SCHEMA, state: 'COMPLETE', selectionSha256: hash(jsonBytes(runIdentity)),
      sourceId: config.sourceId, organisationKey: config.organisationKey,
      releasedPlan: planIdentity(released), senderCurrent: planIdentity(finalSender), receiverCurrent: planIdentity(finalReceiver),
      sourceRows: { budgets: registers['source-budgets'].total, documents: registers['source-documents'].total },
      candidateRows: { budgets: registers['candidate-budgets'].total, documents: registers['candidate-documents'].total },
      packet: { bytes: packet.bytes, sha256: packet.sha256, file: 'files/organisation.zip' },
      files: downloads.map(({ chunks, releasedPrefix, reopenedRead, ...file }) => file),
      originalRequestIds: Object.fromEntries(Object.entries(originalRecords).map(([key, value]) => [key, value.requestId])),
      laterRequestIds: { sender: senderNote.request.requestId, receiver: receiverNote.request.requestId },
      completePrefixReopen: true, historicalReplayPreservedCurrent: true, receiverEditsPreserved: true,
      mcpRestartRead: { bytes: reopened.bytes, sha256: reopened.sha256 }, resourcesClosed: true
    };
    await exactJSON(join(output, 'organisation-receiving.json'), result);
    await exactJSON(join(output, 'observed-files-' + hash(jsonBytes(observations)) + '.json'), observations);
    progress('complete', { state: result.state, sourceId: result.sourceId, packet: result.packet, resourcesClosed: true });
    return result;
  } catch (error) {
    const retained = { schema: SCHEMA, state: 'INTERRUPTED', phase,
      ...(runIdentity ? { selectionSha256: hash(jsonBytes(runIdentity)) } : {}),
      code: String(error.code ?? 'ERROR'), message: String(error.message ?? error).replace(/#[A-Za-z0-9_-]{32,256}/g, '#[redacted]').slice(0, 4000) };
    await observe('interrupted', retained).catch(() => {});
    throw error;
  } finally {
    await merchant?.close();
    await Promise.allSettled([sender?.dispose(), receiver?.dispose()]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    process.stderr.write('Usage: node organisation.mjs /absolute/private/receiving-config.json\n');
    process.exitCode = 2;
  } else {
    try { await receiveOrganisation(process.argv[2]); }
    catch (error) {
      process.stderr.write(JSON.stringify({ state: 'INTERRUPTED', code: String(error.code ?? 'ERROR'),
        message: String(error.message ?? error).replace(/#[A-Za-z0-9_-]{32,256}/g, '#[redacted]').slice(0, 4000) }) + '\n');
      process.exitCode = 1;
    }
  }
}
