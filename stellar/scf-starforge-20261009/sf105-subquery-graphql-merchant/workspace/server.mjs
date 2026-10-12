#!/usr/bin/env node
// MIT. One private operator workspace using the original SF105 compiler/runtime.
import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openWorkspaceStore, plain, digest } from './store.mjs';
import { requestJson, normalizeRunStart, normalizeRunContinuation, readRequestSet, verifyRequestSetSources,
  prepareRequestSet, recoverRequestSet, requestSetReference, inspectRequestRun, recoverRequestRun,
  prepareRunComparison } from './request-sets.mjs';
import { admitRunAttempt, runRequestSet, runJobView, controlRequestRun } from './request-runs.mjs';
import { prepareResponseComparison, inspectResponseComparison, comparisonChanges, reviewResponseComparison,
  recoverResponseComparison, inspectPendingResponseComparison } from './comparison.mjs';
import { describeResponseComparisonFiles } from './comparison-report.mjs';
import { createWorkspaceFiles } from './files.mjs';
import { prepareSavedMerchant, recoverSavedMerchant, continueSavedMerchant, inspectSavedMerchant, listSavedMerchants } from './preparation.mjs';
import { inspectProjectHandover, prepareProjectHandover, receiveProjectHandover, listProjectReceivings } from './handover.mjs';
import { inspectDraftSchema, reviewDraft, exportDraft, readExport, exportView, startDraftMerchant,
  compareDraft, reviseDraft, readRevisionReport } from './merchant.mjs';
import { prepareDeployment, readDeployment, deploymentView, inspectDeployment, stageDeployment,
  prepareHost, readHostRunbook, recoverDeployment, ensureDeploymentStore } from './deployment.mjs';
import { startReleaseConsole } from '../../sf82-seller-pilot/release-console.mjs';
import { authoringCatalog, captureAuthoringSchema, describeAuthoredOperation, compileAuthoredOperation,
  previewAuthoredOperation, readPreview, previewView, listPreviewOperations, recoverPreview } from './authoring.mjs';

const STATIC = new Map([['/', ['index.html', 'text/html']], ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/authoring-ui.mjs', ['authoring-ui.mjs', 'text/javascript']],
  ['/request-sets-ui.mjs', ['request-sets-ui.mjs', 'text/javascript']],
  ['/preparation-ui.mjs', ['preparation-ui.mjs', 'text/javascript']],
  ['/comparison-values.mjs', ['comparison-values.mjs', 'text/javascript']],
  ['/comparison-ui.mjs', ['comparison-ui.mjs', 'text/javascript']],
  ['/handover-ui.mjs', ['handover-ui.mjs', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']]]);
const HELP = 'node workspace/server.mjs --workspace PRIVATE_DIRECTORY [--port 0]';
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
async function bodyOf(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 7 * 1024 * 1024) fail('Project input exceeds 7 MiB.', 413);
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { fail('Send a UTF-8 JSON object.'); }
  if (!plain(body)) fail('Send a JSON object.');
  return body;
}
const publicDraft = async value => ({ ...value, exports: await Promise.all(value.exports.map(async reference => {
  try { return exportView(await readExport(reference)); }
  catch (error) { return { ...reference, unavailable: true, error: error.message, files: [] }; }
})), deployments: await Promise.all((value.deployments ?? []).map(async reference => {
  try { return deploymentView(await readDeployment(reference)); }
  catch (error) { return { ...reference, unavailable: true, error: error.message }; }
})) });

export async function startWorkspace({ workspace, port = 0, noSignals = false } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail('Port must be 0–65535.');
  const store = await openWorkspaceStore(workspace), token = randomBytes(32).toString('hex');
  const files = createWorkspaceFiles(store);
  const releaseConsoles = new Map();
  const connections = new Set();
  const runJobs = new Map();
  const runWorkers = new Set();
  let runSequence = 0;
  store.requestRunsVersion = ids => JSON.stringify(ids.map(id => {
    const job = runJobs.get(id); return [id, job?.serial ?? 0, Boolean(job?.settled)];
  }));
  store.requestRunsActive = ids => ids.some(id => { const job = runJobs.get(id); return job && !job.settled; });
  let origin, active = null, stopping = false, busy = false, pending = Promise.resolve();
  const runtime = () => active ? { project: active.project, exportId: active.exportId,
    mode: active.session.mode, url: active.session.url,
    offers: active.session.url + '/_seller/offers', readiness: active.session.url + '/_seller/ready', state: 'RUNNING' } : { state: 'STOPPED' };
  async function current(body) {
    const saved = await store.read(body.id);
    if (body.expectedRevision !== saved.revision) fail('The saved project changed. Reopen it before continuing.', 409);
    return saved;
  }
  function savedExport(saved, id) {
    const reference = saved.exports.find(value => value.id === id);
    if (!reference) fail('Choose an export retained in this project.', 404);
    return reference;
  }
  function savedDeployment(saved, id) {
    const reference = (saved.deployments ?? []).find(value => value.id === id);
    if (!reference) fail('Choose a deployment retained in this project.', 404);
    return reference;
  }
  async function attachDeployment(saved, result) {
    const updated = await store.save({ id: saved.id, input: saved.input,
      expectedRevision: saved.revision, deploymentRecord: result.reference });
    return { project: await publicDraft(updated), deployment: deploymentView(result.record) };
  }
  async function preparationResult(result) {
    const reference = result.record.output && result.project.exports.find(item => item.id === result.record.output.id);
    return { ...result, project: await publicDraft(result.project),
      exported: reference ? exportView(await readExport(reference)) : null };
  }
  async function attachPreview(saved, result) {
    const previous = (saved.previews ?? []).find(item => item.id === result.reference.id);
    const updated = previous ? saved : await store.save({ id: saved.id, input: saved.input,
      expectedRevision: saved.revision, previewRecord: result.reference });
    return { project: await publicDraft(updated), preview: result.record, recovered: Boolean(previous) };
  }
  async function connected(req, res, operation) {
    const controller = new AbortController(); connections.add(controller);
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', abort); res.once('close', abort);
    try { return await operation(controller.signal); }
    finally { req.off('aborted', abort); res.off('close', abort); connections.delete(controller); }
  }
  async function mutate(operation) {
    if (stopping) fail('Workspace is closing.', 503);
    if (busy) fail('A workspace operation is already in progress.', 409);
    busy = true;
    let finish;
    pending = new Promise(yes => { finish = yes; });
    try { return await operation(); } finally { busy = false; finish(); }
  }

  async function withRunWriter(operation) {
    while (busy) await pending;
    if (stopping) fail('Workspace is closing.', 503);
    return mutate(operation);
  }
  async function requestRunStatus(value) {
    if (value.compact === true) {
      const saved = await store.read(value.project), reference = (saved.requestRuns ?? []).find(item => item.id === value.runId);
      if (!reference) fail('Choose a run retained in the original project.', 404);
      return { project: saved.id, currentRevision: saved.revision, reference, job: runJobView(runJobs.get(value.runId)) };
    }
    const result = await inspectRequestRun(store, value);
    return { ...result, project: await publicDraft(result.project), job: runJobView(runJobs.get(value.runId)) };
  }
  async function requestSetStatus(value) {
    if (Object.keys(value).some(key => !['project', 'requestSetId', 'recordSha256'].includes(key)))
      fail('Choose an original saved request set.');
    const saved = await store.read(value.project), retained = await readRequestSet(store,
      { id: value.requestSetId, project: saved.id, recordSha256: value.recordSha256 });
    await verifyRequestSetSources(store, retained.record);
    return { project: await publicDraft(saved), record: retained.record, recordSha256: retained.sha256,
      reference: requestSetReference(retained.record, retained.sha256),
      attached: (saved.requestSets ?? []).some(item => item.id === retained.record.id && item.recordSha256 === retained.sha256) };
  }
  async function beginRequestRun(kind, value) {
    const request = kind === 'start' ? normalizeRunStart(value) : normalizeRunContinuation(value);
    const runId = kind === 'start' ? request.id : request.runId;
    const intent = digest(requestJson({ kind, request })), existing = runJobs.get(runId);
    if (existing && !existing.settled) {
      if (existing.id !== request.id || existing.intent !== intent)
        fail('The original run already has an active attempt. Pause or cancel that attempt before continuing.', 409);
      return existing.admission;
    }
    const job = { id: request.id, runId, project: request.project, intent, serial: ++runSequence,
      controller: new AbortController(), pauseRequested: false, state: 'VALIDATING',
      startedAt: new Date().toISOString(), promise: null, admission: null, settled: false, settlement: null };
    // Reserve this exact attempt before any asynchronous source or store read.
    runJobs.set(runId, job); runWorkers.add(job);
    job.admission = (async () => {
      try {
        const admitted = await mutate(() => admitRunAttempt(store, kind, request));
        const result = await requestRunStatus({ project: request.project, runId });
        if (stopping) {
          job.state = 'NOT_STARTED'; job.finishedAt = new Date().toISOString();
          return { ...result, job: runJobView(job), dispatched: false };
        }
        if (admitted.dispatch) {
          job.promise = runRequestSet(store, admitted, { withWriter: withRunWriter, job, isClosing: () => stopping });
        } else {
          job.state = 'FINISHED'; job.finishedAt = new Date().toISOString();
        }
        return { ...result, job: runJobView(job), dispatched: admitted.dispatch,
          originalAttempt: admitted.attempt.completed?.result ?? null };
      } catch (error) {
        job.state = 'NOT_STARTED'; job.finishedAt = new Date().toISOString();
        job.error = { code: error.code ?? 'RUN_NOT_STARTED', message: error.message };
        throw error;
      }
    })();
    job.settlement = (async () => {
      try { await job.admission; } catch {}
      try { if (job.promise) await job.promise; }
      finally { job.settled = true; runWorkers.delete(job); }
    })();
    return job.admission;
  }

  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      if (stopping) return send(503, { error: 'Workspace is closing.' });
      if (req.headers.host !== new URL(origin).host || req.headers.origin && req.headers.origin !== origin)
        return send(403, { error: 'Use the exact local workspace address.' });
      const url = new URL(req.url, origin);
      if (url.origin !== origin) return send(403, { error: 'Use the local workspace address.' });
      if (req.method === 'GET' && STATIC.has(url.pathname)) {
        const [name, type] = STATIC.get(url.pathname);
        res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
        res.end(await readFile(new URL(name, import.meta.url))); return;
      }
      if (!url.pathname.startsWith('/api/')) return send(404, { error: 'Not found.' });
      if (!equal(req.headers['x-workspace-token'], token)) return send(401, { error: 'Open the complete private URL printed by the launcher.' });
      if (req.method === 'GET') {
        if (['/api/preparation', '/api/preparations', '/api/preparation/file'].includes(url.pathname)) {
          const value = Object.fromEntries(url.searchParams);
          for (const key of ['generation', 'revision', 'offset', 'limit']) if (value[key] !== undefined) {
            if (!/^(0|[1-9]\d*)$/.test(value[key]) || !Number.isSafeInteger(Number(value[key])))
              fail('Choose an original preparation history selector.');
            value[key] = Number(value[key]);
          }
          if (url.pathname.endsWith('/file')) {
            if (Object.keys(value).some(key => !['project', 'revision', 'preparationId', 'file', 'expectedManifestSha256'].includes(key)))
              fail('Choose a file from the original preparation packet.');
            const { file: name, expectedManifestSha256, ...selection } = value;
            const file = await files.read({ ...selection, kind: 'preparation' }, name, expectedManifestSha256);
            res.writeHead(200, { 'Content-Type': file.type,
              'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(file.name.split('/').at(-1)) });
            res.end(file.bytes); return;
          }
          if (url.pathname === '/api/preparations') return send(200, await listSavedMerchants(store, value));
          const result = await inspectSavedMerchant(store, value);
          return send(200, { ...result, project: await publicDraft(result.project) });
        }
        if (url.pathname === '/api/requests/file') {
          const value = Object.fromEntries(url.searchParams);
          if (Object.keys(value).some(key => !['project', 'revision', 'requestSetId', 'runId', 'generation', 'file', 'expectedManifestSha256'].includes(key)))
            fail('Choose an original request packet file.');
          for (const key of ['revision', 'generation']) if (value[key] !== undefined) {
            if (!/^[1-9]\d*$/.test(value[key]) || !Number.isSafeInteger(Number(value[key]))) fail('Choose an original saved selection.');
            value[key] = Number(value[key]);
          }
          const { file: name, expectedManifestSha256, ...selected } = value;
          const file = await files.read({ ...selected, kind: 'requests' }, name, expectedManifestSha256);
          res.writeHead(200, { 'Content-Type': file.type,
            'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(file.name.split('/').at(-1)) });
          res.end(file.bytes); return;
        }
        if (url.pathname === '/api/request-set') return send(200, await requestSetStatus(Object.fromEntries(url.searchParams)));
        if (url.pathname === '/api/request-run') {
          const value = Object.fromEntries(url.searchParams);
          if (Object.keys(value).some(key => !['project', 'runId', 'generation', 'expectedRecordSha256', 'compact'].includes(key)))
            fail('Choose an original run checkpoint.');
          if (value.generation !== undefined) {
            if (!/^[1-9]\d*$/.test(value.generation) || !Number.isSafeInteger(Number(value.generation))) fail('Choose an original run generation.');
            value.generation = Number(value.generation);
          }
          if (value.compact !== undefined) {
            if (!['true', 'false'].includes(value.compact) || value.generation !== undefined || value.expectedRecordSha256 !== undefined)
              fail('Compact run status selects the current original checkpoint.');
            value.compact = value.compact === 'true';
          }
          return send(200, await requestRunStatus(value));
        }
        if (['/api/comparison', '/api/comparison/changes', '/api/comparison/pending', '/api/comparison/file'].includes(url.pathname)) {
          const value = Object.fromEntries(url.searchParams);
          for (const key of ['revision', 'generation', 'offset', 'limit']) if (value[key] !== undefined) {
            if (!/^(0|[1-9]\d*)$/.test(value[key]) || !Number.isSafeInteger(Number(value[key]))) fail('Use an original integer comparison selector.');
            value[key] = Number(value[key]);
          }
          if (url.pathname.endsWith('/file')) {
            if (Object.keys(value).some(key => !['project', 'revision', 'comparisonId', 'file', 'expectedManifestSha256'].includes(key)))
              fail('Choose an original comparison file selection.');
            const file = await files.read({ project: value.project, revision: value.revision, kind: 'comparison',
              comparisonId: value.comparisonId }, value.file, value.expectedManifestSha256);
            res.writeHead(200, { 'Content-Type': file.type,
              'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(file.name.split('/').at(-1)) });
            res.end(file.bytes); return;
          }
          return send(200, url.pathname.endsWith('/pending') ? await inspectPendingResponseComparison(store, value)
            : url.pathname.endsWith('/changes') ? await comparisonChanges(store, value)
              : await inspectResponseComparison(store, value));
        }
        if (url.pathname === '/api/handover/receivings') return send(200, await listProjectReceivings(store, {
          offset: Number(url.searchParams.get('offset') ?? 0), limit: Number(url.searchParams.get('limit') ?? 20),
          ...(url.searchParams.has('expectedSnapshotSha256') ? { expectedSnapshotSha256: url.searchParams.get('expectedSnapshotSha256') } : {}) }));
        if (url.pathname === '/api/projects') return send(200, { projects: await store.list(), directory: store.root, runtime: runtime() });
        if (url.pathname === '/api/runtime') return send(200, runtime());
        if (url.pathname === '/api/project') {
          const rev = url.searchParams.get('revision');
          if (rev !== null && !/^[1-9]\d*$/.test(rev)) fail('Invalid revision.');
          return send(200, await publicDraft(await store.read(url.searchParams.get('id'), rev === null ? undefined : Number(rev))));
        }
        if (url.pathname === '/api/history') return send(200, await store.history(url.searchParams.get('id')));
        if (url.pathname === '/api/authoring/previews' || url.pathname === '/api/authoring/preview') {
          const saved = await store.read(url.searchParams.get('id'));
          if (url.pathname.endsWith('/previews')) return send(200, { operations: await listPreviewOperations(store, saved) });
          const id = url.searchParams.get('previewId');
          const reference = (saved.previews ?? []).find(item => item.id === id) ?? { id, project: saved.id };
          return send(200, await readPreview(store, reference));
        }
        if (url.pathname === '/api/evolution/report') {
          const saved = await store.read(url.searchParams.get('id'));
          return send(200, await readRevisionReport(savedExport(saved, url.searchParams.get('exportId'))));
        }
        if (url.pathname === '/api/deployment' || url.pathname === '/api/deployment/host') {
          const saved = await store.read(url.searchParams.get('id'));
          const reference = savedDeployment(saved, url.searchParams.get('deploymentId'));
          return send(200, url.pathname === '/api/deployment/host'
            ? await readHostRunbook(reference, url.searchParams.get('hostId')) : await inspectDeployment(reference));
        }
        return send(404, { error: 'Not found.' });
      }
      if (req.method !== 'POST') return send(405, { error: 'Use GET or POST.' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return send(415, { error: 'Use application/json.' });
      const body = await bodyOf(req);

      if (['/api/preparation/prepare', '/api/preparation/recover', '/api/preparation/continue'].includes(url.pathname)) {
        const operation = url.pathname.endsWith('/prepare') ? prepareSavedMerchant
          : url.pathname.endsWith('/recover') ? recoverSavedMerchant : continueSavedMerchant;
        return send(201, await mutate(async () => preparationResult(await operation(store, body))));
      }
      if (url.pathname === '/api/preparation/packet') {
        if (Object.keys(body).some(key => !['project', 'revision', 'preparationId'].includes(key)))
          fail('Choose a retained original preparation packet.');
        return send(201, await mutate(async () => {
          const selection = { ...body, kind: 'preparation' }, value = await files.manifest(selection);
          return { state: 'PREPARED', selection: value.manifest.selection,
            directory: join(store.root, 'preparation-packets', value.manifest.source.packetSha256),
            ...value, manifestSha256: value.manifestFile.sha256 };
        }));
      }
      if (url.pathname === '/api/requests/packet') {
        if (Object.keys(body).some(key => !['project', 'revision', 'requestSetId', 'runId', 'generation'].includes(key)))
          fail('Choose the original saved request-set or run packet.');
        return send(201, await mutate(async () => {
          const selection = { ...body, kind: 'requests' };
          const manifest = await files.manifest(selection), source = manifest.manifest.source;
          return { state: 'PREPARED', selection, packetSha256: source.packetSha256,
            directory: join(store.root, 'request-packets', source.packetSha256),
            source, files: manifest.manifest.files, ...manifest };
        }));
      }
      if (url.pathname === '/api/request-set/prepare' || url.pathname === '/api/request-set/recover') {
        const result = await mutate(() => url.pathname.endsWith('/prepare')
          ? prepareRequestSet(store, body) : recoverRequestSet(store, body));
        return send(201, { project: await publicDraft(result.project), record: result.record,
          recordSha256: result.sha256, reference: result.reference, replayed: result.replayed ?? false });
      }
      if (url.pathname === '/api/request-run/start' || url.pathname === '/api/request-run/continue')
        return send(202, await beginRequestRun(url.pathname.endsWith('/start') ? 'start' : 'continue', body));
      if (url.pathname === '/api/request-run/control') {
        const selected = runJobs.get(body.runId);
        if (selected?.id === body.attemptId && selected.state === 'VALIDATING') await selected.admission;
        // The active case owns mutate through its source request. Controls persist
        // their own immutable input and reach that original controller directly.
        return send(200, await controlRequestRun(store, body, id => runJobs.get(id)));
      }
      if (url.pathname === '/api/request-run/recover') {
        await mutate(() => recoverRequestRun(store, body));
        return send(201, await requestRunStatus({ project: body.project, runId: body.runId }));
      }
      if (url.pathname === '/api/request-run/compare') {
        const result = await mutate(() => prepareRunComparison(store, body));
        return send(201, { ...result, project: await publicDraft(result.project) });
      }

      if (['/api/comparison/prepare', '/api/comparison/review', '/api/comparison/recover'].includes(url.pathname)) {
        const operation = url.pathname.endsWith('/prepare') ? prepareResponseComparison
          : url.pathname.endsWith('/review') ? reviewResponseComparison : recoverResponseComparison;
        const result = await mutate(() => operation(store, body));
        return send(201, { ...result, project: await publicDraft(result.project) });
      }
      if (url.pathname === '/api/comparison/packet') {
        if (Object.keys(body).some(key => !['project', 'revision', 'comparisonId'].includes(key))) fail('Choose a retained comparison packet.');
        return send(201, await mutate(async () => {
          const selection = { project: body.project, revision: body.revision, kind: 'comparison', comparisonId: body.comparisonId };
          const manifest = await files.manifest(selection), packet = await describeResponseComparisonFiles(store, selection);
          return { selection, directory: packet.directory, ...manifest };
        }));
      }
      if (url.pathname === '/api/handover/inspect') return send(200, await inspectProjectHandover(store, body));
      if (url.pathname === '/api/handover/prepare')
        return send(201, await mutate(() => prepareProjectHandover(store, body)));
      if (url.pathname === '/api/handover/receive')
        return send(201, await mutate(() => receiveProjectHandover(store, body)));
      if (url.pathname === '/api/schema') return send(200, await inspectDraftSchema(body.schemaText));
      if (url.pathname === '/api/authoring/catalog') return send(200, authoringCatalog(body.schemaText));
      if (url.pathname === '/api/authoring/open') return send(200, describeAuthoredOperation(body));
      if (url.pathname === '/api/authoring/compile') return send(200, compileAuthoredOperation(body));
      if (url.pathname === '/api/authoring/capture') return send(200, await mutate(() =>
        connected(req, res, signal => captureAuthoringSchema({ ...body, signal }))));
      if (url.pathname === '/api/authoring/preview' || url.pathname === '/api/authoring/recover') {
        return send(201, await mutate(async () => {
          const saved = await current(body);
          const result = url.pathname.endsWith('/recover') ? await recoverPreview(store, saved, body.previewId)
            : await connected(req, res, signal => previewAuthoredOperation(store, saved,
              { id: body.previewId, operation: body.operation, variables: body.variables, allowLoopback: body.allowLoopback, signal }));
          return attachPreview(saved, result);
        }));
      }
      if (url.pathname === '/api/review') return send(200, await reviewDraft(body.input));
      if (url.pathname === '/api/evolution/compare') {
        const saved = await current(body);
        return send(200, await compareDraft(body.input, savedExport(saved, body.baselineExportId)));
      }
      if (url.pathname === '/api/save') {
        if (Object.keys(body).some(key => !['id', 'input', 'expectedRevision'].includes(key)))
          fail('Save accepts draft fields only; prepare exports and deployments through their workspace actions.');
        return send(200, await publicDraft(await mutate(() => store.save({ id: body.id, input: body.input, expectedRevision: body.expectedRevision }))));
      }
      if (url.pathname === '/api/export' || url.pathname === '/api/evolution/prepare') {
        const request = { id: body.preparationId ?? randomUUID(), project: body.id,
          expectedRevision: body.expectedRevision, ...(body.inputDigest !== undefined ? { inputDigest: body.inputDigest } : {}),
          kind: url.pathname === '/api/evolution/prepare' ? 'revision' : 'merchant',
          ...(url.pathname === '/api/evolution/prepare' ? {
            baselineExportId: body.baselineExportId, comparisonDigest: body.comparisonDigest } : {}) };
        return send(201, await mutate(async () => preparationResult(await prepareSavedMerchant(store, request))));
      }
      if (['/api/deployment/prepare', '/api/deployment/stage', '/api/deployment/host', '/api/deployment/recover'].includes(url.pathname)) {
        const result = await mutate(async () => {
          const saved = await current(body);
          if (url.pathname === '/api/deployment/prepare') return attachDeployment(saved,
            await prepareDeployment(store, saved, savedExport(saved, body.exportId), { allowLoopbackUpstream: body.allowLoopbackUpstream }));
          const reference = savedDeployment(saved, body.deploymentId);
          const prepared = url.pathname === '/api/deployment/stage' ? await stageDeployment(reference, body.options)
            : url.pathname === '/api/deployment/host' ? await prepareHost(reference, body.host) : await recoverDeployment(reference);
          return attachDeployment(saved, prepared);
        });
        return send(201, result);
      }
      if (url.pathname === '/api/deployment/console') {
        return send(200, await mutate(async () => {
          const saved = await current(body), reference = savedDeployment(saved, body.deploymentId);
          const inspected = await inspectDeployment(reference);
          if (inspected.requiresPreparation) fail(inspected.handover.next, 409);
          const record = await readDeployment(reference); await ensureDeploymentStore(record);
          let session = releaseConsoles.get(record.releaseStore);
          if (!session) {
            session = await startReleaseConsole(record.releaseStore, { port: 0 });
            if (stopping) { await session.close(); fail('Workspace closed during release console startup.', 503); }
            releaseConsoles.set(record.releaseStore, session);
            const forget = () => { if (releaseConsoles.get(record.releaseStore) === session) releaseConsoles.delete(record.releaseStore); };
            session.closed.then(forget, forget);
          }
          return { project: saved.id, store: record.releaseStore, operatorUrl: session.operatorUrl,
            releaseId: record.release?.id ?? null };
        }));
      }
      if (url.pathname === '/api/start') {
        const result = await mutate(async () => {
          if (active) fail('Stop the current managed merchant before starting another.', 409);
          const saved = await current(body), reference = saved.exports.find(value => value.id === body.exportId);
          if (!reference || reference.inputDigest !== saved.inputDigest) fail('Export the current reviewed project before starting it.', 409);
          const record = await readExport(reference);
          if (body.allowLoopback !== undefined && typeof body.allowLoopback !== 'boolean') fail('Invalid local-backend option.');
          if (body.facilitator !== undefined && (typeof body.facilitator !== 'string' || body.facilitator.length > 2048)) fail('Invalid facilitator URL.');
          const session = await startDraftMerchant(record, { allowLoopback: body.allowLoopback === true, facilitator: body.facilitator || undefined });
          if (stopping) { await session.close(); fail('Workspace closed during merchant startup.', 503); }
          active = { project: saved.id, exportId: record.id, session };
          return runtime();
        });
        return send(200, result);
      }
      if (url.pathname === '/api/stop') return send(200, await mutate(async () => {
        if (active) { await active.session.close(); active = null; }
        return runtime();
      }));
      return send(404, { error: 'Not found.' });
    } catch (error) {
      if (!res.headersSent) send(error.code === 'ENOENT' ? 404 : error.code === 'EEXIST' ? 409 : error.status ?? 400,
        { error: error.message ?? 'The workspace operation failed.' });
      else res.end();
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000; server.maxHeadersCount = 40;
  try { await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', () => { server.off('error', no); yes(); }); }); }
  catch (error) { await store.close(); throw error; }
  origin = 'http://127.0.0.1:' + server.address().port;
  let closing;
  const signals = [];
  const close = () => closing ??= (async () => {
    stopping = true;
    for (const connection of connections) connection.abort();
    for (const job of runWorkers) { job.pauseRequested = true; job.controller.abort(); }
    for (const [name, handler] of signals) process.off(name, handler);
    const closed = new Promise((yes, no) => server.close(error => error ? no(error) : yes()));
    await pending;
    // No new writer is admitted after stopping. Retain each in-flight native
    // response/checkpoint and attempt result before releasing the original store.
    await Promise.allSettled([...runWorkers].map(job => job.settlement));
    try {
      const sessions = [...releaseConsoles.values(), ...(active ? [active.session] : [])];
      const results = await Promise.allSettled(sessions.map(session => session.close()));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    } finally { active = null; releaseConsoles.clear(); await closed; await store.close(); }
  })();
  if (!noSignals) for (const name of ['SIGINT', 'SIGTERM']) {
    const handler = () => close().catch(() => { process.exitCode = 1; });
    signals.push([name, handler]); process.once(name, handler);
  }
  return { url: origin + '/#' + token, origin, token, directory: store.root,
    files, close };
}
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { console.log(HELP); return; }
  const values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--workspace', '--port'].includes(args[i]) || values.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) fail(HELP);
    values.set(args[i], args[i + 1]);
  }
  if (!values.has('--workspace') || values.has('--port') && !/^\d{1,5}$/.test(values.get('--port'))) fail(HELP);
  const session = await startWorkspace({ workspace: resolve(values.get('--workspace')), port: Number(values.get('--port') ?? 0) });
  console.log('GraphQL merchant workspace: ' + session.url + '\nProjects: ' + session.directory + '\nCtrl-C drains this workspace\'s managed merchants and release consoles.');
  return session;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
