// MIT. Streamed portable handovers in the original authenticated economic workspace.
import { join, dirname, basename } from 'node:path';
import { readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { atomicJson } from '../../routescan/quota.mjs';
import { operationId } from '../model.mjs';
import { readFredProject } from '../project.mjs';
import { canonicalJSONDigest } from '../canonical-stream.mjs';
import { inspectFredOperatingPlanSource } from '../../../distribution/discovery/fred-operating-plan.mjs';
import { MAX_FRED_OPERATING_DESCRIPTOR_BYTES, need, same, directory as privateDirectory,
  opened, unchanged, describe, optional, readJson, writeJson, writeStream } from './files.mjs';
import { exportFredOperatingArchive, inspectFredOperatingArchive, receiveFredOperatingArchive,
  FRED_OPERATING_ARCHIVE_NAME, MAX_FRED_OPERATING_ARCHIVE_BYTES,
  MAX_FRED_OPERATING_PLAN_BYTES, MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES } from './archive.mjs';

const RUNNING = new Set(['EXPORTING','UPLOADING','INSPECTING','RECEIVING']);
const HASH = /^[a-f0-9]{64}$/;
const statusMaximum = 1024 * 1024;
const now = () => new Date().toISOString();
function count(value) { return Array.isArray(value) ? value.length : value === null ? 0 : 1; }
function integer(text, fallback, max) {
  if (text === null || text === undefined) return fallback;
  need(/^\d+$/.test(String(text)), 'Choose a complete page number.');
  const value = Number(text); need(Number.isSafeInteger(value) && value >= 0 && value <= max, 'Choose an available page number.'); return value;
}
function planSummary(plan) { const latest = plan?.revisions?.at(-1); return plan === null ? null : { id:plan.id, title:latest.title, revision:latest.revision }; }
function publicResult(value) {
  return { archive:value.archive, sourceId:value.source.id, sourceFile:value.sourceFile, manifestFile:value.manifestFile,
    sourceProject:value.source.project, inventoryCounts:Object.fromEntries(Object.entries(value.source.inventory).map(([key,val]) => [key,count(val)])),
    publishedCount:value.source.published.length, completePublishedCount:value.source.published.filter(item => item.artifact !== null).length,
    plan:planSummary(value.plan), projectDirectory:value.projectDirectory };
}

/** Called after the original workspace's host, origin, session and project checks. */
export function createFredOperatingHttp({ directory, projectId, qcewSourceContexts = null, currentPlanContext = null, openWorkspace }) {
  const root = join(dirname(directory), basename(directory) + '.operating-handovers');
  const active = new Map(), children = new Map(), tickets = new Map(), abort = new AbortController();
  let closing = false;
  const opRoot = id => { operationId(id); return join(root,id); };
  async function prepare(id) { await privateDirectory(root,true); const selected = opRoot(id); await privateDirectory(selected,true); return selected; }
  async function status(id) {
    const selected = opRoot(id);
    const request = await optional(selected,'REQUEST.json',MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES);
    if (!request) throw Object.assign(new Error('The handover request is not retained yet.'),{code:'ENOENT'});
    need(request.projectId === projectId, 'Choose a retained handover from this workspace.');
    const state = await optional(selected,'STATUS.json',statusMaximum) ?? {
      state:request.kind === 'EXPORT' ? 'INTERRUPTED' : 'INTERRUPTED', phase:request.kind === 'EXPORT' ? 'export' : 'upload',
      createdAt:request.createdAt, updatedAt:request.createdAt, result:null, error:null };
    const isActive = active.has(id);
    return { projectId,id,kind:request.kind,...state,state:RUNNING.has(state.state) && !isActive ? 'INTERRUPTED' : state.state,
      active:isActive,retryAction:isActive || state.state === 'COMPLETE' || state.state === 'INSPECTED' ? null : state.phase };
  }
  async function save(id,value) { await atomicJson(join(opRoot(id),'STATUS.json'),value); }
  async function currentRequest(id) {
    const value = await readJson(opRoot(id),'REQUEST.json',MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES);
    need(value.projectId === projectId, 'Continue the original workspace handover.'); return value;
  }
  async function retained(id) {
    const value = await optional(opRoot(id),'RESULT.json',statusMaximum);
    need(value && value.projectId === projectId, 'Complete the original handover phase first.'); return value;
  }
  async function source(id) {
    const saved = await retained(id);
    return readJson(saved.sourceDirectory,'source.json',MAX_FRED_OPERATING_DESCRIPTOR_BYTES,saved.result.sourceFile);
  }
  async function plan(id) {
    const saved = await retained(id);
    const value = saved.planPath ? await optional(dirname(saved.planPath),basename(saved.planPath),MAX_FRED_OPERATING_PLAN_BYTES) : null;
    if (value !== null) inspectFredOperatingPlanSource(value,await source(id));
    return value;
  }
  async function currentPlan() {
    if (!currentPlanContext) return null;
    const value = await optional(dirname(currentPlanContext.planPath),basename(currentPlanContext.planPath),MAX_FRED_OPERATING_PLAN_BYTES);
    if (value === null) return null;
    const original = await readJson(currentPlanContext.sourceDirectory,'source.json',MAX_FRED_OPERATING_DESCRIPTOR_BYTES,currentPlanContext.sourceFile);
    need(original.project.id === projectId,'The retained customer plan belongs to another received project.');
    inspectFredOperatingPlanSource(value,original); return value;
  }
  async function retainResult(id,value,phase) {
    const selected = opRoot(id), summary = publicResult(value);
    const planPath = phase === 'export' ? value.plan === null ? null : join(selected,'export','OPERATING-PLAN.json') :
      phase === 'receive' ? join(selected,'receive','received','OPERATING-PLAN.json') :
      value.plan === null ? null : join(selected,'inspection','OPERATING-PLAN.json');
    await atomicJson(join(selected,'RESULT.json'),{ projectId,archivePath:value.archivePath,
      sourceDirectory:value.sourceDirectory,planPath,result:summary });
    return summary;
  }
  async function phaseWork(id,phase) {
    const request = await currentRequest(id), selected = opRoot(id);
    if (phase === 'export') {
      need(request.kind === 'EXPORT','Resume the original export selection.');
      return exportFredOperatingArchive({ directory,outputDirectory:join(selected,'export'),capturedAt:request.capturedAt,
        publicationIds:request.publicationIds,plan:request.plan,expectedProject:{id:projectId,revision:request.expectedRevision},
        qcewSourceContexts,signal:abort.signal });
    }
    need(request.kind === 'IMPORT','Use an uploaded original handover.');
    const upload = await readJson(selected,'UPLOAD.json',65536);
    need(upload.bytes === request.bytes && (!request.sha256 || upload.sha256 === request.sha256),'The retained upload differs from the selected original file.');
    const archivePath = join(selected,FRED_OPERATING_ARCHIVE_NAME);
    if (phase === 'inspect') return inspectFredOperatingArchive({ archivePath,directory:join(selected,'inspection'),expectedArchive:upload,signal:abort.signal });
    need(phase === 'receive','Choose an original receiving phase.');
    // The receiving engine independently revalidates the entire original archive and
    // source graph. Its own retained plan receiver preserves later customer revisions.
    return receiveFredOperatingArchive({ archivePath,destination:join(selected,'receive'),expectedArchive:upload,
      qcewSourceContexts,signal:abort.signal });
  }
  function reserve(id) {
    need(!closing && active.size === 0,'Another complete handover is active in this workspace.');
    let done; const task = new Promise(resolve => { done = resolve; }); active.set(id,task);
    return () => { if (active.get(id) === task) active.delete(id); done(); };
  }
  async function start(id,phase) {
    need(!closing,'The original workspace is closing.');
    if (active.has(id)) return status(id);
    const release = reserve(id);
    try {
      const before = await status(id);
      if (before.state === 'COMPLETE') { release(); return status(id); }
      need((phase === 'export') === (before.kind === 'EXPORT'), 'Continue the original export or import operation.');
      need(phase !== 'receive' || before.state === 'INSPECTED' || before.phase === 'receive',
        'Inspect the complete original archive before receiving it.');
      const state = { state:phase === 'export' ? 'EXPORTING' : phase === 'inspect' ? 'INSPECTING' : 'RECEIVING',
        phase,createdAt:before.createdAt,updatedAt:now(),result:before.result,error:null };
      await save(id,state);
      const task = (async () => {
        try {
          const value = await phaseWork(id,phase), result = await retainResult(id,value,phase);
          await save(id,{...state,state:phase === 'inspect' ? 'INSPECTED' : 'COMPLETE',updatedAt:now(),result});
        } catch(error) {
          await save(id,{...state,state:'FAILED',updatedAt:now(),error:{code:error.code ?? 'FRED_OPERATING_HANDOVER_FAILED',message:error.message}});
        }
      })();
      task.finally(release).catch(() => {});
      return status(id);
    } catch(error) { release(); throw error; }
  }
  async function beginExport(request) {
    operationId(request.id); const selected = await prepare(request.id);
    const prior = await optional(selected,'REQUEST.json',MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES);
    if (prior) {
      need(prior.kind === 'EXPORT' && prior.projectId === projectId,'This operation already belongs to another original handover.');
      if (Object.keys(request).some(key => key !== 'id')) {
        same({ expectedRevision:request.expectedRevision,capturedAt:request.capturedAt,
          publicationIds:request.publicationIds ?? null,plan:request.plan ?? null },
        { expectedRevision:prior.expectedRevision,capturedAt:prior.capturedAt,publicationIds:prior.publicationIds,plan:prior.plan },
        'Retained export selection');
      }
    } else {
      const state = await readFredProject(directory);
      need(state.id === projectId && state.revision === request.expectedRevision && !state.pending,
        'Refresh the original complete project revision before preparing its handover.');
      need(typeof request.capturedAt === 'string' && new Date(request.capturedAt).toISOString() === request.capturedAt,
        'Keep the original handover capture time.');
      await writeJson(selected,'REQUEST.json',{schema:'stellar-forge.fred-operating-http-request.v1',kind:'EXPORT',
        projectId,id:request.id,createdAt:now(),expectedRevision:request.expectedRevision,capturedAt:request.capturedAt,
        publicationIds:request.publicationIds ?? null,plan:request.plan ?? null},MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES);
    }
    return start(request.id,'export');
  }
  async function upload(req,url) {
    const id = url.searchParams.get('id'); operationId(id);
    const bytes = integer(url.searchParams.get('bytes'),null,MAX_FRED_OPERATING_ARCHIVE_BYTES), sha256 = url.searchParams.get('sha256');
    need(bytes !== null && bytes > 0 && (sha256 === null || HASH.test(sha256)),'Choose the complete original archive length and optional hash.');
    need(/^application\/octet-stream(?:\s*;|$)/i.test(req.headers['content-type'] ?? ''),'Upload the original archive bytes.');
    const length = req.headers['content-length'];
    need(length === undefined || /^\d+$/.test(length) && Number(length) === bytes,'The upload length differs from its selection.');
    const release = reserve(id); let state = null, old = null;
    const onAbort = () => req.destroy(abort.signal.reason instanceof Error ? abort.signal.reason : new Error('The original workspace closed.'));
    abort.signal.addEventListener('abort',onAbort,{once:true});
    try {
      abort.signal.throwIfAborted();
      const selected = await prepare(id), prior = await optional(selected,'REQUEST.json',MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES);
      const selection = {kind:'IMPORT',projectId,id,bytes,sha256};
      if (prior) same({kind:prior.kind,projectId:prior.projectId,id:prior.id,bytes:prior.bytes,sha256:prior.sha256},selection,'Original upload selection');
      else await writeJson(selected,'REQUEST.json',{schema:'stellar-forge.fred-operating-http-request.v1',...selection,createdAt:now()},MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES);
      old = await status(id);
      state = {state:'UPLOADING',phase:'upload',createdAt:old.createdAt,updatedAt:now(),result:old.result,error:null};
      await save(id,state);
      req.setTimeout(60000,() => req.destroy(new Error('The original archive upload stopped making progress.')));
      const previous = await optional(selected,'UPLOAD.json',65536);
      let total = 0;
      async function* chunks() {
        for await (const chunk of req) { total += chunk.length; need(total <= bytes,'The upload exceeds its selected complete length.'); yield chunk; }
        need(total === bytes,'The original upload ended before all bytes arrived.');
      }
      const entry = await writeStream(selected,FRED_OPERATING_ARCHIVE_NAME,chunks(),
        previous ?? (sha256 ? {path:FRED_OPERATING_ARCHIVE_NAME,bytes,sha256} : null),abort.signal,MAX_FRED_OPERATING_ARCHIVE_BYTES);
      need(entry.bytes === bytes,'The retained archive length differs.');
      await writeJson(selected,'UPLOAD.json',entry,65536,abort.signal);
      if (old.state === 'COMPLETE' || old.state === 'INSPECTED') {
        const {projectId:ignoredProject,id:ignoredId,kind:ignoredKind,active:ignoredActive,retryAction:ignoredRetry,...rest} = old;
        await save(id,rest);
      }
    } catch(error) {
      if (state) await save(id,{...state,state:'FAILED',updatedAt:now(),error:{code:error.code ?? 'FRED_OPERATING_UPLOAD_FAILED',message:error.message}});
      throw error;
    } finally { abort.signal.removeEventListener('abort',onAbort); release(); }
    if (old.state === 'COMPLETE' || old.state === 'INSPECTED') return status(id);
    return start(id,'inspect');
  }
  async function sendArchive(id,res) {
    const saved = await retained(id), entry = saved.result.archive;
    const input = await opened(dirname(saved.archivePath),basename(saved.archivePath),MAX_FRED_OPERATING_ARCHIVE_BYTES);
    try {
      need(input.info.size === entry.bytes,'The original complete archive length changed.');
      res.writeHead(200,{'content-type':'application/gzip','content-length':entry.bytes,
        'content-disposition':'attachment; filename="'+FRED_OPERATING_ARCHIVE_NAME+'"',
        'x-fred-file-sha256':entry.sha256,'x-fred-project-id':projectId,'cache-control':'no-store',
        'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
      async function* chunks() {
        const digest = createHash('sha256'); let bytes = 0;
        for await (const chunk of input.file.createReadStream({autoClose:false})) { bytes += chunk.length; digest.update(chunk); yield chunk; }
        await unchanged(input); need(bytes === entry.bytes && digest.digest('hex') === entry.sha256,'The original complete archive changed during download.');
      }
      await pipeline(Readable.from(chunks()),res,{signal:abort.signal});
    } finally { await input.file.close(); }
  }
  async function ticket(req,res,url) {
    if (req.method !== 'GET' || url.pathname !== '/operating-handover-download') return false;
    const key = url.searchParams.get('ticket'), value = tickets.get(key);
    need(value && value.expires > Date.now(),'Prepare a fresh download from the original handover.');
    tickets.delete(key); await sendArchive(value.id,res); return true;
  }
  async function handle({req,res,url,body,send}) {
    if (!url.pathname.startsWith('/api/operating-handover')) return false;
    need(!closing,'The original workspace is closing.');
    const id = url.searchParams.get('id');
    if (req.method === 'GET' && url.pathname === '/api/operating-handovers') {
      const offset = integer(url.searchParams.get('offset'),0,1000000), limit = integer(url.searchParams.get('limit'),50,500);
      need(limit > 0,'Choose a page with at least one handover.');
      const names = await readdir(root).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      const all = [];
      for (const name of names.sort()) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(name)) continue;
        try { all.push(await status(name)); } catch(error) { if (error.code !== 'ENOENT') throw error; }
      }
      all.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
      const items = all.slice(offset,offset + limit);
      send(res,200,{projectId,total:all.length,offset,limit,nextOffset:offset + items.length < all.length ? offset + items.length : null,items}); return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/operating-handover/current-plan') { send(res,200,{projectId,plan:await currentPlan()}); return true; }
    if (req.method === 'GET' && url.pathname === '/api/operating-handover') { send(res,200,await status(id)); return true; }
    if (req.method === 'GET' && url.pathname === '/api/operating-handover/source') { send(res,200,await source(id)); return true; }
    if (req.method === 'GET' && url.pathname === '/api/operating-handover/plan') { send(res,200,{projectId,id,plan:await plan(id)}); return true; }
    if (req.method === 'GET' && url.pathname === '/api/operating-handover/file') { await sendArchive(id,res); return true; }
    if (req.method === 'POST' && url.pathname === '/api/operating-handover/upload') { send(res,202,await upload(req,url)); return true; }
    if (req.method !== 'POST') return false;
    const request = await body(req,MAX_FRED_OPERATING_EXPORT_REQUEST_BYTES); operationId(request.id);
    if (url.pathname === '/api/operating-handover/export') { send(res,202,await beginExport(request)); return true; }
    if (url.pathname === '/api/operating-handover/inspect' || url.pathname === '/api/operating-handover/receive') {
      send(res,202,await start(request.id,url.pathname.endsWith('/inspect') ? 'inspect' : 'receive')); return true;
    }
    if (url.pathname === '/api/operating-handover/download-ticket') {
      const saved = await retained(request.id);
      for (const [key,value] of tickets) if (value.expires <= Date.now()) tickets.delete(key);
      need(tickets.size < 64,'Use one of the prepared original downloads before preparing another.');
      const key = randomBytes(32).toString('hex'), expires = Date.now() + 60000;
      tickets.set(key,{id:request.id,expires});
      send(res,200,{url:'/operating-handover-download?ticket='+key,expiresAt:new Date(expires).toISOString(),archive:saved.result.archive}); return true;
    }
    if (url.pathname === '/api/operating-handover/open') {
      const state = await status(request.id), saved = await retained(request.id);
      need(state.state === 'COMPLETE' && saved.result.projectDirectory,'Receive the original complete project before opening it.');
      need(typeof openWorkspace === 'function','Use the original native workspace launch for this received project.');
      need(!closing,'The original workspace is closing.');
      let task = children.get(request.id);
      if (!task) {
        task = openWorkspace(saved.result.projectDirectory,qcewSourceContexts,saved.planPath ? {
          planPath:saved.planPath,sourceDirectory:saved.sourceDirectory,sourceFile:saved.result.sourceFile } : null);
        children.set(request.id,task);
        task.catch(() => { if (children.get(request.id) === task) children.delete(request.id); });
      }
      const child = await task;
      send(res,200,{projectId,id:request.id,startup:child.startup}); return true;
    }
    return false;
  }
  return {handle,ticket,close:async () => {
    closing = true; tickets.clear(); abort.abort(); await Promise.allSettled([...active.values()]);
    await Promise.allSettled([...children.values()].map(async task => (await task).close())); children.clear();
  }};
}
