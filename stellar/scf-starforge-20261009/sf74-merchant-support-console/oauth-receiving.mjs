// MIT. Receive original SF93 OAuth incidents through the existing SF74 console and CaseStore.
import {constants} from 'node:fs';
import {open, lstat, mkdir, realpath, readFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {start} from './server.mjs';
import {openCaseStore, caseMetadata, retainCaseArtifact, inspectCaseWriter, recoverCaseWriter} from './case-store.mjs';
import {serializeWorkspace, parseWorkspace} from './workspace-file.mjs';
import {parseRuntime, reviewRuntime, exportRuntimeHandoff, importRuntimeHandoff} from './runtime-support.mjs';
import {openIncidentStore, validateIncidentCapture} from '../sf93-seller-support-bundle/incident-store.mjs';
import {compileConfig} from '../sf93-seller-support-bundle/incident-config.mjs';
import {OAUTH_FILES, OAUTH_FILE_LIMIT, normalizeOAuthSource, readOAuthObservationFiles} from '../sf93-seller-support-bundle/oauth-observation.mjs';

const OPERATION = 'DBC61-SCF-OAUTH-SUPPORT-20261012';
const SCHEMA = 'stellar-forge.sf74.oauth-native-receiving.v1';
const SOURCE_SCHEMA = 'stellar-forge.sf74.oauth-native-selection.v1';
const PROFILE = 'oauth-native';
const MAX_ARTIFACT = 256 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const INCIDENT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const utf8 = new TextDecoder('utf-8', {fatal:true});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
};
function fail(code, message) { return Object.assign(new Error(message), {code}); }
function check(value, message, code='OAUTH_SUPPORT_RECEIVING_MISMATCH') { if (!value) throw fail(code, message); }
function stopping(signal) { if (signal?.aborted) throw signal.reason ?? fail('OAUTH_SUPPORT_STOPPED', 'The original programme stopped.'); }
function same(left, right, label) { check(isDeepStrictEqual(left, right), label + ' differs from the retained original selection.'); }
function fileName(path) {
  check(typeof path === 'string' && path && !path.includes('\\') && !path.startsWith('/') &&
    path.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid retained relative artifact path.');
  return path;
}
function child(root, name) {
  const result = resolve(root, fileName(name));
  check(result.startsWith(root + sep), 'Artifact leaves the owned customer directory.');
  return result;
}
async function directory(path, {create=false, privateMode=true}={}) {
  if (create) {
    try { await mkdir(path, {mode:0o700}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const info = await lstat(path);
  check(info.isDirectory() && !info.isSymbolicLink() && await realpath(path) === path,
    'Select an original ordinary directory without symbolic links: ' + path);
  if (typeof process.getuid === 'function') check(info.uid === process.getuid(), 'The customer directory belongs to another user.');
  if (privateMode) check((info.mode & 0o077) === 0, 'The selected customer directory must remain private.');
  return path;
}
async function readBytes(path, {optional=false, maximum=MAX_ARTIFACT}={}) {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  try {
    const before = await file.stat({bigint:true});
    check(before.isFile() && before.size > 0n && before.size <= BigInt(maximum), 'Retained artifact size or type changed.');
    if (typeof process.getuid === 'function') check(before.uid === BigInt(process.getuid()), 'Retained artifact owner changed.');
    check((before.mode & 0o077n) === 0n, 'Retained customer artifact must remain private.');
    const bytes = await file.readFile(), after = await file.stat({bigint:true});
    check(before.dev === after.dev && before.ino === after.ino && before.size === after.size &&
      before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs &&
      bytes.length === Number(after.size), 'Retained artifact changed during its complete read.');
    return bytes;
  } finally { await file.close(); }
}
async function retained(root, path, bytes, signal) {
  stopping(signal); fileName(path);
  const target = child(root, path);
  const receipt = await retainCaseArtifact(target, bytes);
  // The maintained publisher has completed. Do not discard its receipt on a late stop.
  return {path, bytes:receipt.bytes, sha256:receipt.sha256};
}
async function original(root, descriptor, signal) {
  stopping(signal);
  check(descriptor && Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0 && HASH.test(descriptor.sha256),
    'Invalid original artifact descriptor.');
  const bytes = await readBytes(child(root, descriptor.path));
  check(bytes.length === descriptor.bytes && digest(bytes) === descriptor.sha256, 'Original artifact bytes changed: ' + descriptor.path);
  stopping(signal); return bytes;
}
async function readJSON(root, path, {optional=false, signal}={}) {
  stopping(signal);
  const bytes = await readBytes(child(root, path), {optional});
  if (bytes === null) return null;
  const value = JSON.parse(utf8.decode(bytes));
  stopping(signal); return {value, bytes, sha256:digest(bytes)};
}
function withoutGeneration(value) { const {generatedAt, ...rest} = value; return rest; }
function identity(value) {
  return {workspaceSha256:digest(value.workspaceText), supportSha256:digest(value.supportText),
    metadataSha256:digest(canonical(caseMetadata(value.metadata)))};
}
function sameCase(value, input) {
  return value.workspaceText === input.workspaceText && value.supportText === input.supportText &&
    isDeepStrictEqual(caseMetadata(value.metadata), caseMetadata(input.metadata));
}
function selectedSourceFiles(sourceFiles) {
  check(sourceFiles && typeof sourceFiles === 'object' && !Array.isArray(sourceFiles), 'Supply the complete original OAuth file map.');
  same(Object.keys(sourceFiles).sort(), [...OAUTH_FILES].sort(), 'Original OAuth file names');
  return Object.fromEntries(OAUTH_FILES.map(name => {
    const bytes = sourceFiles[name];
    check(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= OAUTH_FILE_LIMIT,
      'Supply the complete bounded original OAuth bytes for ' + name);
    return [name, Buffer.from(bytes)];
  }));
}
function sourceDescriptors(files) {
  return Object.fromEntries(OAUTH_FILES.map(name => [name, {bytes:files[name].length, sha256:digest(files[name])}]));
}
function wireFiles(files) { return Object.fromEntries(OAUTH_FILES.map(name => [name, files[name].toString('base64')])); }

async function request(app, method, route, body, signal, {allowMissing=false}={}) {
  stopping(signal);
  const origin = new URL(app.url).origin;
  const timeout = AbortSignal.timeout(30_000);
  const selectedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetch(new URL(route, app.url), {
      method, redirect:'error', signal:selectedSignal,
      headers:{accept:'application/json', origin, ...(body === undefined ? {} : {'content-type':'application/json'})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
    const chunks = []; let length = 0;
    const reader = response.body?.getReader();
    if (reader) {
      try {
        for (;;) {
          const row = await reader.read(); if (row.done) break;
          length += row.value.length;
          check(length <= MAX_ARTIFACT, 'Original Support response exceeds the receiving limit.');
          chunks.push(Buffer.from(row.value));
        }
      } finally { await reader.cancel().catch(() => {}); }
    }
    const bytes = Buffer.concat(chunks, length);
    let value;
    try { value = JSON.parse(utf8.decode(bytes)); }
    catch { throw fail('OAUTH_SUPPORT_RESPONSE_INVALID', 'The original Support route did not return complete JSON: ' + route); }
    if (allowMissing && response.status === 404 && value.error === 'CASE_NOT_FOUND') return null;
    if (!response.ok) throw Object.assign(fail(value.error ?? 'OAUTH_SUPPORT_HTTP_FAILED',
      'The original Support route failed (' + response.status + '): ' + route +
      (typeof value.detail === 'string' ? '; ' + value.detail.slice(0,300) : '')), {status:response.status});
    stopping(signal); return value;
  } catch (error) {
    // A failed POST is not replayed here. The next invocation reads its frozen case ID/history first.
    if (method !== 'GET') error.originalRequest = {method, route, result:'not-acknowledged'};
    throw error;
  }
}
async function consoleOwned(options, signal, operation) {
  stopping(signal);
  let pending, owned, closing;
  const close = () => closing ??= (async () => {
    const app = owned ?? await pending?.catch(() => null);
    if (app) await app.close();
  })();
  const onStop = () => { void close().catch(() => {}); };
  signal?.addEventListener('abort', onStop, {once:true});
  let value, operationError;
  try {
    // Store the acquisition promise before awaiting. A stop during startup joins that late owner.
    pending = Promise.resolve().then(() => { stopping(signal); return start(options); });
    owned = await pending;
    stopping(signal); value = await operation(owned);
  } catch (error) { operationError = error; }
  let closeError;
  try { await close(); } catch (error) { closeError = error; }
  signal?.removeEventListener('abort', onStop);
  if (operationError && closeError) throw new AggregateError([operationError, closeError], 'Support receiving and original console cleanup both failed.');
  if (operationError) throw operationError;
  if (closeError) throw closeError;
  return value;
}
async function checkAssets(app, signal) {
  const result = [];
  for (const name of ['runtime-desk.mjs','incident-desk.mjs','oauth-desk.mjs','oauth-render.mjs','OAUTH_SUPPORT.md']) {
    stopping(signal);
    const source = await readFile(new URL(name, import.meta.url));
    const timeout = AbortSignal.timeout(15_000);
    const response = await fetch(new URL(name, app.url), {redirect:'error', signal:signal ? AbortSignal.any([signal, timeout]) : timeout});
    check(response.status === 200, 'The original console did not serve ' + name);
    const content = Buffer.from(await response.arrayBuffer());
    check(content.length === source.length && digest(content) === digest(source), 'The actual console asset differs from its selected source: ' + name);
    result.push({path:name, bytes:source.length, sha256:digest(source)});
  }
  return result;
}
async function captureRows(incidentStore, incidentIds, config, merchant, signal) {
  return incidentStore.transaction(async (state, io) => {
    stopping(signal); same(state.config, config, 'Original incident configuration');
    const rows = [], captures = new Map();
    for (const id of incidentIds) {
      const incident = state.incidents.find(item => item.id === id);
      check(incident && incident.merchantId === merchant.id && /^OAUTH_/.test(incident.kind),
        'Select the original OAuth incident in its existing merchant registration.');
      const row = {incident:structuredClone(incident), captures:{before:null, after:null}};
      for (const side of ['before','after']) {
        stopping(signal);
        const ref = incident[side + 'Capture']; if (!ref) continue;
        check(ref.kind === 'OAUTH_RESOURCE', 'The original incident points to a different capture kind.');
        if (!captures.has(ref.id)) {
          const bytes = await io.readCaptureBytes(ref);
          check(bytes.length === ref.bytes && digest(bytes) === ref.id, 'Original capture reference changed.');
          const files = validateIncidentCapture(bytes, ref.id);
          readOAuthObservationFiles(files);
          captures.set(ref.id, {bytes, files});
        }
        row.captures[side] = {ref:structuredClone(ref), original:captures.get(ref.id)};
      }
      check(row.captures.before || row.captures.after, 'The selected original incident has no retained capture.');
      rows.push(row);
    }
    return {revision:state.revision, configRevision:state.configRevision, configHash:state.configHash, rows};
  }, {readonly:true});
}
async function validatePrepared(root, record, workspaceText, signal) {
  const preparedBytes = await original(root, record.prepared, signal);
  const prepared = JSON.parse(utf8.decode(preparedBytes));
  check(prepared.incidentId === record.incident.id && prepared.revision === record.incident.revision,
    'The retained handoff no longer selects its original incident revision.');
  const imported = await importRuntimeHandoff(prepared.handoff), handoff = JSON.parse(prepared.handoff);
  check(imported.workspaceText === workspaceText, 'The original incident handoff changed its selected workspace.');
  const parsed = parseRuntime(imported.supportText);
  for (const side of ['before','after']) {
    const ref = record.captures[side], capture = parsed[side];
    if (ref === null) { check(capture === null, 'A missing original capture was invented.'); continue; }
    check(capture?.kind === 'OAUTH_RESOURCE' && capture.scope.routeId === record.incident.merchantId,
      'The original OAuth capture mapping changed.');
    const bytes = await original(root, ref.artifact, signal);
    check(digest(bytes) === ref.ref.id && bytes.length === ref.ref.bytes, 'Retained SF93 capture envelope differs.');
    const files = validateIncidentCapture(bytes, ref.ref.id);
    for (const name of OAUTH_FILES) {
      const retainedFile = capture.files[name];
      check(retainedFile && retainedFile.bytes === files[name].length &&
        retainedFile.sha256 === digest(files[name]) &&
        Buffer.from(retainedFile.data, 'base64').equals(files[name]), 'Support handoff changed original source bytes: ' + side + '/' + name);
    }
  }
  const reproduced = await exportRuntimeHandoff({...imported, metadata:caseMetadata(imported.metadata), generatedAt:handoff.generatedAt});
  check(reproduced.handoff === prepared.handoff && reproduced.html === prepared.html,
    'The original handoff or readable report is not reproducible from its retained source.');
  same(reproduced.report, prepared.report, 'Original prepared runtime report');
  return {prepared, imported:{...imported, metadata:caseMetadata(imported.metadata)}, report:reproduced.report};
}
async function freezeSelection({root, app, requestSelection, files, observation, incidentStore, config, merchant, signal}) {
  const existing = await readJSON(root, 'SELECTION.json', {optional:true, signal});
  if (existing) {
    check(existing.value.schema === SOURCE_SCHEMA, 'Unknown retained Support selection schema.');
    same(existing.value.request, requestSelection, 'Original receiving request');
    return existing;
  }
  const workspaceText = await serializeWorkspace({
    name:'OAuth Support — ' + merchant.label,
    inputs:{resource:requestSelection.oauth.resource, catalog:'', origin:requestSelection.sourceOrigin,
      network:'', payTo:'', method:'GET', credentialed:true},
    sources:{}, termsText:'', baselineOnly:false, workorderSource:'runtime'
  }, {now:observation.meta.generatedAt});
  const workspace = await parseWorkspace(workspaceText);
  const status = await request(app, 'GET', '/api/incidents/' + PROFILE + '?limit=100', undefined, signal);
  same(compileConfig(status.config), config, 'Actual console incident configuration');
  const profileRows = await request(app, 'GET', '/api/incidents/profiles', undefined, signal);
  check(profileRows.sources?.some(item => item.id === PROFILE), 'The original console did not retain its named incident source.');
  const inspected = await request(app, 'POST', '/api/runtime/inspect',
    {files:wireFiles(files), inputs:workspace.inputs, routeId:merchant.id}, signal);
  check(inspected.view?.kind === 'OAUTH_RESOURCE', 'The actual console did not inspect the original OAuth source kind.');
  const frozen = await captureRows(incidentStore, requestSelection.incidentIds, config, merchant, signal);
  const sourceFiles = {};
  for (const name of OAUTH_FILES) sourceFiles[name] = await retained(root, 'observations/' + name, files[name], signal);
  const workspaceArtifact = await retained(root, 'workspace.json', Buffer.from(workspaceText), signal);
  const records = [];
  for (const row of frozen.rows) {
    const captures = {before:null, after:null};
    for (const side of ['before','after']) {
      const selected = row.captures[side]; if (!selected) continue;
      const artifact = await retained(root, 'captures/' + selected.ref.id + '.json', selected.original.bytes, signal);
      captures[side] = {ref:selected.ref, artifact, files:sourceDescriptors(selected.original.files)};
    }
    const prepared = await request(app, 'POST', '/api/incidents/' + PROFILE + '/' + row.incident.id + '/case',
      {expectedRevision:row.incident.revision, workspaceText, routeId:merchant.id}, signal);
    const bytes = encode(prepared), preparedArtifact = await retained(root, 'prepared/' + digest(bytes) + '.json', bytes, signal);
    const record = {caseId:randomUUID(), incident:row.incident, captures, prepared:preparedArtifact};
    await validatePrepared(root, record, workspaceText, signal);
    records.push(record);
  }
  const value = {schema:SOURCE_SCHEMA, operationId:OPERATION, request:requestSelection,
    selectedAt:new Date().toISOString(), workspace:workspaceArtifact, sourceFiles,
    originalIncidentStore:{revision:frozen.revision, configRevision:frozen.configRevision, configHash:frozen.configHash},
    records};
  // No case mutation precedes this complete retained selection. A stopped first read can be selected again.
  const bytes = encode(value);
  await retained(root, 'SELECTION.json', bytes, signal);
  return {value, bytes, sha256:digest(bytes)};
}
async function findOriginalCase(app, id, expected, signal, requiredRevision=null) {
  const current = await request(app, 'GET', '/api/cases/' + id, undefined, signal, {allowMissing:true});
  if (current === null) {
    check(requiredRevision === null, 'A previously received original case is missing.');
    return null;
  }
  let before = null; const seen = new Set();
  for (;;) {
    const query = '?limit=100' + (before ? '&before=' + before : '');
    const history = await request(app, 'GET', '/api/cases/' + id + '/history' + query, undefined, signal);
    check(history.currentRevision === current.currentRevision && history.id === id,
      'Case history changed while its original version was selected.');
    for (const summary of history.revisions) {
      check(HASH.test(summary.revision) && !seen.has(summary.revision), 'Case history contains an invalid repeated revision.');
      seen.add(summary.revision);
      if (requiredRevision && summary.revision !== requiredRevision) continue;
      if (summary.workspaceBytes !== Buffer.byteLength(expected.workspaceText) ||
        !isDeepStrictEqual(caseMetadata(summary.metadata), caseMetadata(expected.metadata))) continue;
      const row = summary.revision === current.revision ? current :
        await request(app, 'GET', '/api/cases/' + id + '?revision=' + summary.revision, undefined, signal);
      check(row.currentRevision === current.currentRevision, 'The current case head changed during original-version readback.');
      if (sameCase(row, expected)) return row;
    }
    if (!history.nextBefore) break;
    check(!seen.has(history.nextBefore), 'Case history cursor repeats an earlier version.');
    before = history.nextBefore;
  }
  throw fail('OAUTH_SUPPORT_CASE_SELECTION_CHANGED',
    'The existing case ID has no matching retained original version; preserve its current head and history.');
}
async function receiveCase({root, app, casesDirectory, role, record, imported, selectionSha256, handoffSha256, signal}) {
  const path = 'receipts/' + role + '-' + record.caseId + '.json';
  const saved = await readJSON(root, path, {optional:true, signal});
  const expectedIdentity = identity(imported);
  if (saved) {
    check(saved.value.schema === 'stellar-forge.sf74.oauth-case-receipt.v1' &&
      saved.value.role === role && saved.value.caseId === record.caseId &&
      saved.value.selectionSha256 === selectionSha256 && saved.value.handoffSha256 === handoffSha256,
      'Original case receipt selected different work.');
    same(saved.value.identity, expectedIdentity, 'Original case receipt source');
  }
  let result = await findOriginalCase(app, record.caseId, imported, signal, saved?.value.revision ?? null);
  let recovery = null;
  if (result === null) {
    stopping(signal);
    const writer = await inspectCaseWriter(casesDirectory);
    if (writer.state === 'stopped') recovery = await recoverCaseWriter(casesDirectory);
    else check(writer.state === 'idle', 'The original CaseStore writer is ' + writer.state + '; preserve its actual owner.');
    const input = {id:record.caseId, expectedRevision:null, workspaceText:imported.workspaceText,
      supportText:imported.supportText, metadata:caseMetadata(imported.metadata)};
    await retained(root, 'intents/' + role + '-' + record.caseId + '.json',
      encode({schema:'stellar-forge.sf74.oauth-case-intent.v1', selectionSha256, role, ...input}), signal);
    const returned = await request(app, 'POST', '/api/cases', input, signal);
    check(returned.case?.id === record.caseId && HASH.test(returned.case.revision), 'The original save returned a different case.');
    result = await findOriginalCase(app, record.caseId, imported, signal, returned.case.revision);
  }
  const receipt = {schema:'stellar-forge.sf74.oauth-case-receipt.v1', operationId:OPERATION, role,
    caseId:record.caseId, revision:result.revision, selectionSha256, handoffSha256,
    identity:expectedIdentity, createdAt:result.createdAt, updatedAt:result.updatedAt,
    previousRevision:result.previousRevision};
  if (saved) same(receipt, saved.value, 'Retained original case receipt');
  else await retained(root, path, encode(receipt), signal);
  return {receipt, value:result, recovery, laterHeadPreserved:result.currentRevision !== result.revision};
}
async function exportedCase({root, app, record, sourceCase, signal}) {
  const path = 'exports/' + record.caseId + '.json';
  let saved = await readJSON(root, path, {optional:true, signal});
  if (!saved) {
    const value = sourceCase.value;
    const result = await request(app, 'POST', '/api/runtime/export',
      {workspaceText:value.workspaceText, supportText:value.supportText, metadata:caseMetadata(value.metadata)}, signal);
    const imported = await importRuntimeHandoff(result.handoff);
    check(sameCase(value, imported), 'The actual exported handoff changed the selected source case.');
    const handoffBytes = Buffer.from(result.handoff), htmlBytes = Buffer.from(result.html), reportBytes = encode(result.report);
    const handoff = await retained(root, 'exports/' + digest(handoffBytes) + '.handoff.json', handoffBytes, signal);
    const html = await retained(root, 'exports/' + digest(htmlBytes) + '.html', htmlBytes, signal);
    const report = await retained(root, 'exports/' + digest(reportBytes) + '.report.json', reportBytes, signal);
    const valueRecord = {schema:'stellar-forge.sf74.oauth-export-receipt.v1', operationId:OPERATION,
      caseId:record.caseId, sourceRevision:sourceCase.receipt.revision,
      identity:identity(value), handoff, html, report};
    const bytes = encode(valueRecord); await retained(root, path, bytes, signal);
    saved = {value:valueRecord, bytes, sha256:digest(bytes)};
  }
  const value = saved.value;
  check(value.schema === 'stellar-forge.sf74.oauth-export-receipt.v1' && value.caseId === record.caseId &&
    value.sourceRevision === sourceCase.receipt.revision, 'The original export receipt selects a different case.');
  same(value.identity, identity(sourceCase.value), 'Original export source');
  const handoffText = utf8.decode(await original(root, value.handoff, signal));
  const html = utf8.decode(await original(root, value.html, signal));
  const report = JSON.parse(utf8.decode(await original(root, value.report, signal)));
  const imported = await importRuntimeHandoff(handoffText), body = JSON.parse(handoffText);
  check(sameCase(sourceCase.value, imported), 'The retained export changed the actual source case.');
  const again = await exportRuntimeHandoff({...imported, generatedAt:body.generatedAt});
  check(again.handoff === handoffText && again.html === html, 'Original export bytes changed during complete receiving.');
  same(again.report, report, 'Retained export report');
  return {receipt:value, handoffText, html, report, imported, receiptSha256:saved.sha256};
}
async function coldCase(directoryPath, receipt, expected, signal) {
  stopping(signal);
  const store = await openCaseStore(directoryPath);
  const head = await store.read(receipt.caseId), seen = new Set(); let before = null, found = false;
  do {
    const page = await store.history(receipt.caseId, {before, limit:100});
    check(page.currentRevision === head.currentRevision, 'The cold original case history changed during selection.');
    for (const item of page.revisions) {
      check(!seen.has(item.revision), 'The cold original case history repeats a version.'); seen.add(item.revision);
      if (item.revision === receipt.revision) found = true;
    }
    before = page.nextBefore;
  } while (before && !found);
  check(found, 'The received original revision is no longer in the actual case history.');
  const value = await store.read(receipt.caseId, receipt.revision);
  check(value.currentRevision === head.currentRevision && sameCase(value, expected),
    'The independently reopened CaseStore changed its original source.');
  same(identity(value), receipt.identity, 'Cold original case identity');
  stopping(signal);
  return {caseId:receipt.caseId, revision:receipt.revision, currentRevision:value.currentRevision,
    laterHeadPreserved:value.currentRevision !== receipt.revision, identity:identity(value)};
}
async function browserReview({browser, app, root, exportRow, signal}) {
  if (!browser) return {state:'NOT_REQUESTED', screenshots:[]};
  check(browser && typeof browser.playwrightModule === 'string' && isAbsolute(browser.playwrightModule) &&
    typeof browser.executablePath === 'string' && isAbsolute(browser.executablePath),
    'Select the original installed Playwright module and browser executable.');
  stopping(signal);
  const playwright = await import(pathToFileURL(browser.playwrightModule).href);
  stopping(signal);
  let pending, owned, contextPending, context, closing;
  const close = () => closing ??= (async () => {
    const selected = owned ?? await pending?.catch(() => null);
    const selectedContext = context ?? await contextPending?.catch(() => null);
    const errors = [];
    if (selectedContext) try { await selectedContext.close(); } catch (error) { errors.push(error); }
    if (selected) try { await selected.close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'The original browser did not finish closing.');
  })();
  const abort = () => { void close().catch(() => {}); };
  signal?.addEventListener('abort', abort, {once:true});
  let value, problem;
  try {
    pending = playwright.chromium.launch({executablePath:browser.executablePath, headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage']});
    owned = await pending; stopping(signal);
    contextPending = owned.newContext({viewport:{width:1440,height:1000}});
    context = await contextPending; stopping(signal);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error.message).slice(0,400)));
    page.setDefaultTimeout(15_000);
    await page.goto(app.url, {waitUntil:'networkidle', timeout:30_000});
    check((await page.locator('body').innerText()).trim().length > 100, 'The original console did not render.');
    const screenshots = [];
    const screenshot = async name => {
      stopping(signal);
      const bytes = await page.screenshot({fullPage:true, timeout:20_000});
      // Content-addressed output lets an interrupted browser attempt leave evidence
      // without replacing a previous image when this same check is resumed.
      return retained(root, 'browser/' + name + '-' + digest(bytes) + '.png', bytes, signal);
    };
    screenshots.push(await screenshot('console-desktop'));
    const htmlPath = child(root, exportRow.receipt.html.path);
    await page.goto(pathToFileURL(htmlPath).href, {waitUntil:'load', timeout:30_000});
    const body = await page.locator('body').innerText();
    check(body.includes('OAuth') && body.includes('checks'), 'The actual customer report omitted the original OAuth interpretation.');
    screenshots.push(await screenshot('customer-report-desktop'));
    await page.setViewportSize({width:390,height:844});
    const width = await page.evaluate(() => ({viewport:innerWidth, document:document.documentElement.scrollWidth}));
    screenshots.push(await screenshot('customer-report-mobile'));
    check(errors.length === 0, 'The actual Support browser reported script errors: ' + errors.join('; '));
    value = {state:'COMPLETED', screenshots, mobile:{viewport:width.viewport, document:width.document,
      horizontalOverflow:width.document > width.viewport}, scriptErrors:errors};
  } catch (error) { problem = error; }
  let closeError;
  try { await close(); } catch (error) { closeError = error; }
  signal?.removeEventListener('abort', abort);
  if (problem && closeError) throw new AggregateError([problem, closeError], 'Support browser receiving and cleanup failed.');
  if (problem) throw problem;
  if (closeError) throw closeError;
  return value;
}

/**
 * Called by the sole original JOSE/MCP/SF93 programme after its watcher closes.
 * This function starts only owned original Support listeners. It creates no OAuth host,
 * verifier, watcher, new incident, acknowledgment, controller, or payment operation.
 */
export async function receiveOAuthSupport({
  root:programmeRoot, incidentDirectory, incidentIds, incidentConfig, merchant, selection,
  environment=process.env, sourceOrigin, sourceFiles, report, signal, browser
}) {
  stopping(signal);
  check(typeof programmeRoot === 'string' && isAbsolute(programmeRoot) && resolve(programmeRoot) === programmeRoot,
    'Use the original absolute native programme directory.');
  await directory(programmeRoot, {privateMode:false});
  check(typeof incidentDirectory === 'string' && isAbsolute(incidentDirectory), 'Select the original incident directory.');
  const sourceDirectory = resolve(incidentDirectory);
  await directory(sourceDirectory);
  check(Array.isArray(incidentIds) && incidentIds.length > 0 && incidentIds.length <= 64 &&
    incidentIds.every(id => INCIDENT_ID.test(id)) && new Set(incidentIds).size === incidentIds.length,
    'Select the complete distinct incident IDs from the original programme.');
  const oauth = normalizeOAuthSource(selection), files = selectedSourceFiles(sourceFiles);
  const observation = readOAuthObservationFiles(files), config = compileConfig(incidentConfig);
  const registered = config.merchants.find(item => item.id === merchant?.id);
  check(registered?.oauth && typeof merchant.label === 'string', 'Select the original configured OAuth merchant.');
  same(normalizeOAuthSource(registered.oauth), oauth, 'Original merchant OAuth binding');
  check(registered.label === merchant.label && observation.meta.registration.id === merchant.id,
    'Original merchant or source registration differs.');
  same(observation.meta.selection, oauth, 'Original capture selection');
  const originURL = new URL(sourceOrigin);
  check(['http:','https:'].includes(originURL.protocol) && !originURL.username && !originURL.password &&
    !originURL.search && !originURL.hash && originURL.pathname === '/', 'Select the actual original service origin.');
  if (browser) check(typeof browser.playwrightModule === 'string' && isAbsolute(browser.playwrightModule) &&
    typeof browser.executablePath === 'string' && isAbsolute(browser.executablePath),
    'Select the original installed browser paths before receiving.');
  const customerRoot = join(programmeRoot, 'customer');
  await directory(customerRoot, {create:true});
  for (const name of ['observations','captures','prepared','exports','receipts','intents','browser','source-cases','received-cases'])
    await directory(join(customerRoot, name), {create:true});
  const requestSelection = {
    operationId:OPERATION, programmeRoot, incidentDirectory:sourceDirectory,
    incidentIds:[...incidentIds].sort(), incidentConfigSha256:digest(canonical(config)),
    merchant:{id:merchant.id,label:merchant.label}, oauth, sourceOrigin:originURL.origin,
    sourceFiles:sourceDescriptors(files),
    consumer:{sha256:digest(await readFile(fileURLToPath(import.meta.url)))},
    browser:browser ? {playwrightModule:browser.playwrightModule,executablePath:browser.executablePath} : null
  };
  const profiles = {schema:'stellar-forge.support-incident-sources.v1',
    sources:[{id:PROFILE, label:merchant.label, directory:sourceDirectory,
      oauthResources:[{id:merchant.id,label:merchant.label,oauth}]}]};
  await retained(customerRoot, 'incident-sources.json', encode(profiles), signal);
  const profilePath = join(customerRoot, 'incident-sources.json');
  const incidentStore = await openIncidentStore(sourceDirectory);
  const sourceCases = join(customerRoot,'source-cases'), receivedCases = join(customerRoot,'received-cases');
  const options = casesDir => ({port:0, casesDir, incidentSources:profilePath, environment, allowLoopback:true, startupFormat:'json'});
  let frozen, sources, received, assetSelection;
  sources = await consoleOwned(options(sourceCases), signal, async app => {
    const health = await request(app, 'GET', '/health', undefined, signal);
    check(health.casesEnabled === true && health.incidentsEnabled === true && health.paidCalls === 0,
      'The original Support console is not ready.');
    assetSelection = await checkAssets(app, signal);
    frozen = await freezeSelection({root:customerRoot, app, requestSelection, files, observation,
      incidentStore, config, merchant, signal});
    check(frozen.value.operationId === OPERATION && frozen.value.records.length === requestSelection.incidentIds.length,
      'The retained selection changed its original operation or incident inventory.');
    const workspaceText = utf8.decode(await original(customerRoot, frozen.value.workspace, signal));
    same(frozen.value.records.map(row => row.incident.id).sort(), requestSelection.incidentIds, 'Retained incident inventory');
    check(frozen.value.records.every(row => UUID.test(row.caseId)) &&
      new Set(frozen.value.records.map(row => row.caseId)).size === frozen.value.records.length,
      'The original selected case IDs are not distinct.');
    for (const name of OAUTH_FILES) {
      const bytes = await original(customerRoot, frozen.value.sourceFiles[name], signal);
      check(bytes.equals(files[name]), 'The complete original source input changed.');
    }
    const rows = [];
    for (const record of frozen.value.records) {
      const prepared = await validatePrepared(customerRoot, record, workspaceText, signal);
      const sourceCase = await receiveCase({root:customerRoot, app, casesDirectory:sourceCases, role:'source',
        record, imported:prepared.imported, selectionSha256:frozen.sha256,
        handoffSha256:digest(prepared.prepared.handoff), signal});
      const exported = await exportedCase({root:customerRoot, app, record, sourceCase, signal});
      rows.push({record, prepared, sourceCase, exported});
    }
    return rows;
  });
  // The original source listener has joined all of its children before the fresh one opens.
  received = await consoleOwned(options(receivedCases), signal, async app => {
    const rows = [];
    const health = await request(app,'GET','/health',undefined,signal);
    check(health.casesEnabled === true, 'The received original Support console is not ready.');
    same(await checkAssets(app,signal), assetSelection, 'Received console source assets');
    for (const source of sources) {
      const imported = await request(app, 'POST', '/api/runtime/import', {handoffText:source.exported.handoffText}, signal);
      check(sameCase(source.sourceCase.value, imported), 'The actual receiving API changed original workspace, support or metadata.');
      const receivedCase = await receiveCase({root:customerRoot, app, casesDirectory:receivedCases, role:'received',
        record:source.record, imported, selectionSha256:frozen.sha256,
        handoffSha256:source.exported.receipt.handoff.sha256, signal});
      const reviewed = await request(app,'POST','/api/runtime/review',
        {supportText:receivedCase.value.supportText, inputs:receivedCase.value.inputs},signal);
      same(withoutGeneration(reviewed.report), withoutGeneration(source.exported.report),
        'Actual received comparison and actionable repair queue');
      const direct = reviewRuntime(receivedCase.value.supportText, receivedCase.value.inputs);
      same(withoutGeneration(direct), withoutGeneration(reviewed.report), 'Original receiving classifier');
      rows.push({incidentId:source.record.incident.id, originalIncident:source.record.incident,
        caseId:source.record.caseId, sourceRevision:source.sourceCase.receipt.revision,
        receivedRevision:receivedCase.receipt.revision, sourceReceipt:source.sourceCase.receipt,
        receivedReceipt:receivedCase.receipt, export:source.exported.receipt,
        captures:source.record.captures, comparison:source.exported.report.comparison,
        queue:source.exported.report.queue, identity:identity(receivedCase.value),
        sourceLaterHeadPreserved:source.sourceCase.laterHeadPreserved,
        receivedLaterHeadPreserved:receivedCase.laterHeadPreserved,
        writerRecovery:{source:source.sourceCase.recovery, received:receivedCase.recovery}});
    }
    const previousBrowser = await readJSON(customerRoot,'browser/RECEIPT.json',{optional:true,signal});
    let browserResult;
    if (previousBrowser) {
      check(previousBrowser.value.selectionSha256 === frozen.sha256, 'The saved browser check selects different original work.');
      for (const descriptor of previousBrowser.value.result.screenshots) await original(customerRoot,descriptor,signal);
      browserResult = previousBrowser.value.result;
    } else {
      browserResult = await browserReview({browser, app, root:customerRoot, exportRow:sources[0].exported, signal});
      if (browserResult.state === 'COMPLETED') await retained(customerRoot,'browser/RECEIPT.json',
        encode({schema:'stellar-forge.sf74.oauth-browser-receipt.v1',selectionSha256:frozen.sha256,result:browserResult}),signal);
    }
    return {rows,browser:browserResult};
  });
  const cold = [];
  for (const source of sources) {
    const row = received.rows.find(item => item.caseId === source.record.caseId);
    const sourceRead = await coldCase(sourceCases,row.sourceReceipt,source.sourceCase.value,signal);
    const receivedRead = await coldCase(receivedCases,row.receivedReceipt,source.sourceCase.value,signal);
    cold.push({caseId:row.caseId,source:sourceRead,received:receivedRead});
    const handoff = JSON.parse(source.exported.handoffText);
    const reopened = await openCaseStore(receivedCases);
    const selected = await reopened.read(row.caseId,row.receivedRevision);
    const returned = await exportRuntimeHandoff({workspaceText:selected.workspaceText,supportText:selected.supportText,
      metadata:caseMetadata(selected.metadata),generatedAt:handoff.generatedAt});
    check(returned.handoff === source.exported.handoffText && returned.html === source.exported.html,
      'Cold original receiving did not reproduce the same portable handoff and readable report.');
  }
  const result = {
    schema:SCHEMA, state:'COMPLETED', operationId:OPERATION,
    selection:{path:join(customerRoot,'SELECTION.json'),bytes:frozen.bytes.length,sha256:frozen.sha256},
    root:customerRoot, sourceCases, receivedCases,
    originalSourceFiles:frozen.value.sourceFiles, assets:assetSelection,
    cases:received.rows, coldReopen:cold, browser:received.browser,
    coverage:{cases:received.rows.length,
      beforeCaptures:received.rows.filter(row => row.captures.before).length,
      afterCaptures:received.rows.filter(row => row.captures.after).length,
      sameCaseIds:true, exactOriginalSourceBytes:true, originalExportImport:true,
      bothConsoleLifetimesClosed:true, originalWatchersStarted:0, paidOperations:0}
  };
  const resultPath = 'COMPLETE.json', previous = await readJSON(customerRoot,resultPath,{optional:true,signal});
  if (previous) {
    // Read-only revalidation can observe a later head. It cannot replace the original completion receipt.
    check(previous.value.schema === SCHEMA && previous.value.selection.sha256 === frozen.sha256,
      'The retained original completion selects different work.');
    same(previous.value.cases.map(row => ({caseId:row.caseId,sourceRevision:row.sourceRevision,receivedRevision:row.receivedRevision,identity:row.identity})),
      result.cases.map(row => ({caseId:row.caseId,sourceRevision:row.sourceRevision,receivedRevision:row.receivedRevision,identity:row.identity})),
      'Original completed case revisions');
    return {...previous.value, revalidated:{cases:cold, bothConsoleLifetimesClosed:true}};
  }
  await retained(customerRoot,resultPath,encode(result),signal);
  // The caller owns its report and durable programme journal. Never copy its environment or token.
  return result;
}
