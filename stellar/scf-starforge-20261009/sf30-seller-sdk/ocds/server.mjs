// MIT. Loopback operator service for retained OCDS projects.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { OcdsWorkspace, failure } from './workspace.mjs';
import { captureFindTender } from './capture.mjs';
import { SourceOperations } from './source-window.mjs';

const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
function sendJSON(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}
async function requestJSON(request, maximum = 256 * 1024 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw failure('JSON_REQUIRED', 'Send this request as application/json', 415);
  if (Number(request.headers['content-length']) > maximum) throw failure('REQUEST_CAPACITY', 'Request exceeds the configured source capacity', 413);
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximum) throw failure('REQUEST_CAPACITY', 'Request exceeds the configured source capacity', 413);
    chunks.push(chunk);
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, bytes));
    const value = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('object');
    return value;
  } catch { throw failure('INVALID_JSON', 'Request must contain a complete JSON object'); }
}
function writeAllowed(request, origin) {
  const source = request.headers.origin;
  if (!source) return;
  let parsed;
  try { parsed = new URL(source); } catch { throw failure('ORIGIN_REJECTED', 'Open this workspace directly before saving', 403); }
  const target = new URL(origin);
  if (parsed.protocol !== target.protocol || !loopback.has(parsed.hostname) || parsed.port !== target.port || parsed.username || parsed.password)
    throw failure('ORIGIN_REJECTED', 'Open this workspace directly before saving', 403);
}
function attachment(response, report) {
  const name = String(report.filename || 'ocds-export.json').replace(/[^a-zA-Z0-9._-]/g, '_');
  response.writeHead(200, { 'Content-Type': report.mime, 'Content-Length': Buffer.byteLength(report.body),
    'Content-Disposition': 'attachment; filename="' + name + '"', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' });
  response.end(report.body);
}
export async function startOcdsServer({ directory, operator = 'operator', title, host = '127.0.0.1', port = 0, maxRequestBytes = 256 * 1024 * 1024, captureOptions = {}, sourceOptions = {} } = {}) {
  if (!loopback.has(host)) throw failure('LOOPBACK_REQUIRED', 'The operator workspace listens on 127.0.0.1, localhost or ::1');
  port = Number(port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw failure('INVALID_PORT', 'Port must be an integer between 0 and 65535');
  const workspace = new OcdsWorkspace(directory, { operator, title });
  let html, sourceHtml, sourceOperations;
  try {
    html = await readFile(new URL('./web/index.html', import.meta.url));
    sourceHtml = await readFile(new URL('./web/source-windows.html', import.meta.url));
    sourceOperations = new SourceOperations(workspace,{fetchImpl:captureOptions.fetchImpl,...sourceOptions});
  }
  catch (error) { workspace.close(); throw error; }
  let origin = '', closing = false;
  const activeCaptures = new Set(), sourceTasks = new Set(), sourceControllers = new Map();
  const server = createServer(async (request, response) => {
    response.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const requestHost = request.headers.host;
      let hostURL;
      try { hostURL = new URL('http://' + requestHost); } catch { throw failure('HOST_REJECTED', 'Invalid workspace host', 400); }
      if (!loopback.has(hostURL.hostname) || hostURL.port !== new URL(origin).port) throw failure('HOST_REJECTED', 'Open the local workspace address', 403);
      const url = new URL(request.url, origin);
      if (url.origin !== origin) throw failure('PATH_REJECTED', 'Invalid request path', 400);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) writeAllowed(request, origin);
      if (request.method === 'GET' && ['/', '/index.html', '/source-windows'].includes(url.pathname)) {
        const page = url.pathname === '/source-windows' ? sourceHtml : html;
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': page.length, 'Cache-Control': 'no-cache',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff' }); response.end(page); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/source-operations') {
        sendJSON(response,200,sourceOperations.state());return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/source-windows/')) {
        sendJSON(response,200,sourceOperations.window(decodeURIComponent(url.pathname.slice('/api/source-windows/'.length))));return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/source-receiving/')) {
        sendJSON(response,200,sourceOperations.receiving(decodeURIComponent(url.pathname.slice('/api/source-receiving/'.length))));return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/source-documents/')) {
        const original=sourceOperations.document(decodeURIComponent(url.pathname.slice('/api/source-documents/'.length)),{sha256:url.searchParams.get('sha256') || undefined});
        attachment(response,{mime:'application/octet-stream',filename:original.metadata.latest?.originalFilename || 'original-document.bin',body:original.body});return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/source-reviews/')) {
        sendJSON(response,200,sourceOperations.review(decodeURIComponent(url.pathname.slice('/api/source-reviews/'.length))));return;
      }
      if (request.method === 'POST' && url.pathname === '/api/source-selections') {
        const body=await requestJSON(request,1024*1024);
        const selection=sourceOperations.saveSelection(body.selection,{expectedRevision:body.expectedRevision});
        sendJSON(response,200,{...sourceOperations.state(),selection});return;
      }
      if (request.method === 'POST' && url.pathname === '/api/source-windows') {
        const input=await requestJSON(request,1024*1024),controller=new AbortController();
        let windowId=input.windowId || null;
        activeCaptures.add(controller);
        const task=sourceOperations.run(input,{signal:controller.signal,onProgress:progress=>{
          windowId=progress.windowId;sourceControllers.set(windowId,controller);
        }});
        const retained=task.catch(()=>{}).finally(()=>{
          activeCaptures.delete(controller);if(windowId && sourceControllers.get(windowId)===controller)sourceControllers.delete(windowId);sourceTasks.delete(retained);
        });
        sourceTasks.add(retained);
        if (!windowId || !sourceControllers.has(windowId)) {
          const result=await task;sendJSON(response,200,result);return;
        }
        sendJSON(response,202,{workspace:workspace.metadata(),window:sourceOperations.window(windowId),started:true});return;
      }
      if (request.method === 'POST' && /^\/api\/source-windows\/[^/]+\/cancel$/.test(url.pathname)) {
        const id=decodeURIComponent(url.pathname.slice('/api/source-windows/'.length,-'/cancel'.length));
        const controller=sourceControllers.get(id);
        if(controller)controller.abort(failure('SOURCE_WINDOW_INTERRUPTED','Operator paused this source window',499));
        sendJSON(response,200,{window:sourceOperations.window(id),pauseRequested:!!controller});return;
      }
      if (request.method === 'PATCH' && url.pathname.startsWith('/api/source-reviews/')) {
        const id=decodeURIComponent(url.pathname.slice('/api/source-reviews/'.length));
        const review=sourceOperations.reviewWork(id,await requestJSON(request,1024*1024));
        sendJSON(response,200,{...sourceOperations.state(),review});return;
      }
      if (request.method === 'POST' && url.pathname === '/api/source-observation') {
        const body=await requestJSON(request,maxRequestBytes);
        if(body.bodyBase64!==undefined && (typeof body.bodyBase64!=='string'
          || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.bodyBase64)))
          throw failure('SOURCE_ORIGINAL_IDENTITY','Supply the complete original source bytes as base64');
        const result=sourceOperations.adoptSourceObservation({...body,
          rawBytes:body.bodyBase64!==undefined?Buffer.from(body.bodyBase64,'base64'):undefined});
        sendJSON(response,200,result);return;
      }
      if (request.method === 'POST' && url.pathname === '/api/source-original') {
        const body=await requestJSON(request,maxRequestBytes);
        if(typeof body.bodyBase64!=='string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.bodyBase64))
          throw failure('DOCUMENT_BYTES_REQUIRED','Supply the complete original document bytes as base64');
        const result=sourceOperations.importOriginalDocument({...body,body:Buffer.from(body.bodyBase64,'base64')});
        sendJSON(response,200,result);return;
      }
      if (request.method === 'POST' && url.pathname === '/api/source-export') {
        const body=await requestJSON(request,1024*1024);
        if(typeof body.directory!=='string'||!body.directory.trim())throw failure('DIRECTORY_REQUIRED','Choose a new local handoff folder');
        sendJSON(response,200,await sourceOperations.exportDirectory(body.directory,{ocids:body.ocids}));return;
      }
      if (request.method === 'POST' && url.pathname === '/api/source-receive') {
        const body=await requestJSON(request,1024*1024);
        if(typeof body.directory!=='string'||!body.directory.trim())throw failure('DIRECTORY_REQUIRED','Choose the complete local handoff folder');
        sendJSON(response,200,await sourceOperations.receiveHandoff(body.directory,{expectedRevision:body.expectedRevision,expectedHandoffId:body.expectedHandoffId}));return;
      }
      if (request.method === 'GET' && url.pathname === '/health') { sendJSON(response, 200, { schema: 'stellar-forge.ocds-health.v1', workspace: workspace.metadata() }); return; }
      if (request.method === 'GET' && url.pathname === '/api/workspace') { sendJSON(response, 200, workspace.view()); return; }
      if (request.method === 'GET' && url.pathname.startsWith('/api/entries/')) {
        sendJSON(response, 200, workspace.getEntry(decodeURIComponent(url.pathname.slice('/api/entries/'.length)))); return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/sources/')) {
        sendJSON(response, 200, workspace.getSource(decodeURIComponent(url.pathname.slice('/api/sources/'.length)))); return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/receiving/')) {
        sendJSON(response, 200, workspace.getReceiving(decodeURIComponent(url.pathname.slice('/api/receiving/'.length)))); return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/captures/')) {
        sendJSON(response, 200, workspace.getCapture(decodeURIComponent(url.pathname.slice('/api/captures/'.length)))); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/compare') {
        sendJSON(response, 200, workspace.compare(url.searchParams.get('before'), url.searchParams.get('after'))); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/export') {
        attachment(response, workspace.report({ format: url.searchParams.get('format') || 'json', scope: url.searchParams.get('scope') || 'all', ocids: url.searchParams.getAll('ocid') })); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/package') {
        const packet = workspace.exportPackage({ scope: url.searchParams.get('scope') || 'all', ocids: url.searchParams.getAll('ocid') });
        attachment(response, { mime: 'application/json; charset=utf-8', filename: 'ocds-workspace-' + packet.packageId.slice(0, 12) + '.json', body: JSON.stringify(packet, null, 2) + '\n' }); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/import') {
        const body = await requestJSON(request, maxRequestBytes);
        sendJSON(response, 200, workspace.importDocument(body.document, { rawText: body.rawText, label: body.label, url: body.url, retrievedAt: body.retrievedAt }, body.expectedRevision)); return;
      }
      if (request.method === 'PATCH' && /^\/api\/projects\/[^/]+\/review$/.test(url.pathname)) {
        const ocid = decodeURIComponent(url.pathname.slice('/api/projects/'.length, -'/review'.length));
        sendJSON(response, 200, workspace.updateReview(ocid, await requestJSON(request, 1024 * 1024))); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/receive') {
        const body = await requestJSON(request, maxRequestBytes);
        sendJSON(response, 200, workspace.receivePackage(body.package, { expectedRevision: body.expectedRevision })); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/capture') {
        const spec = await requestJSON(request, 64 * 1024);
        const controller = new AbortController(); activeCaptures.add(controller);
        try {
          const result = await captureFindTender(workspace, spec, { ...captureOptions, signal: controller.signal });
          if (!response.destroyed) sendJSON(response, 200, result);
        } finally { activeCaptures.delete(controller); }
        return;
      }
      throw failure('NOT_FOUND', 'Workspace route does not exist', 404);
    } catch (error) {
      if (!response.headersSent && !response.destroyed) sendJSON(response, Number.isInteger(error.status) ? error.status : 500,
        { error: { code: error.code || 'WORKSPACE_ERROR', message: error.message || 'Workspace request failed', ...(error.details !== undefined ? { details: error.details } : {}) } });
      else if (!response.destroyed) response.destroy(error);
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 30000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); }).catch(error => { workspace.close(); throw error; });
  const address = server.address(), hostname = address.address.includes(':') ? '[' + address.address + ']' : address.address;
  origin = 'http://' + hostname + ':' + address.port;
  const close = async () => {
    if (closing) return; closing = true;
    for (const controller of activeCaptures) controller.abort(failure('CAPTURE_INTERRUPTED', 'Workspace is closing; resume its saved capture', 499));
    await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); });
    await Promise.allSettled([...sourceTasks]);
    workspace.close();
  };
  return { server, workspace, sourceOperations, origin, url: origin, close };
}
