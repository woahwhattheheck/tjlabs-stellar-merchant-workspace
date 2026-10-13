// MIT. One local HTTP view over the original CIIM receiving desk.
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
import { openCiimDesk, LIMITS } from './model.mjs';
import { privateDirectory, readPrivate, atomicJson, syncDirectory, digest, fault } from '../../postgres/publisher/files.mjs';
import { readBrowserAssets } from '../../../distribution/browser-assets.mjs';

export const STARTUP_SCHEMA = 'tjl.ciim.desk-startup.v1';
const SESSION_HEADER = 'x-ciim-session';
const MAX_JSON = 16 * 1024 * 1024;
const cleanFilename = value => String(value || 'receiving-file').replace(/[\r\n"\\/\x00-\x1f\x7f]/g, '_').slice(0, 180);
function need(value, code, message, status = 400) { if (!value) throw fault(code, message, status); }
function secureHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}
function json(response, status, value) {
  const raw = Buffer.from(JSON.stringify(value) + '\n');
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': raw.length });
  response.end(raw);
}
function query(url) {
  const output = {};
  for (const [key, value] of url.searchParams) {
    need(!Object.hasOwn(output, key), 'DUPLICATE_PARAMETER', 'Select each parameter once.');
    output[key] = value;
  }
  for (const key of ['offset', 'limit']) if (Object.hasOwn(output, key)) {
    need(/^(0|[1-9]\d*)$/.test(output[key]) && Number.isSafeInteger(Number(output[key])), 'INVALID_PAGE', 'Use a nonnegative integer page position.');
    output[key] = Number(output[key]);
  }
  return output;
}
async function jsonBody(request) {
  need(/^application\/json(?:;|$)/i.test(request.headers['content-type'] || ''), 'JSON_REQUIRED', 'Send application/json.', 415);
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    need(bytes <= MAX_JSON, 'REQUEST_TOO_LARGE', 'The decision request exceeds 16 MiB.', 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    need(value && typeof value === 'object' && !Array.isArray(value), 'OBJECT_REQUIRED', 'Send one JSON request object.');
    return value;
  } catch (error) { if (error.code) throw error; throw fault('JSON_INVALID', 'The request is not valid UTF-8 JSON.'); }
}
function fileHeaders(response, item) {
  need(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && /^[a-f0-9]{64}$/.test(item.sha256), 'EXPORT_INVALID', 'The original export descriptor is incomplete.', 500);
  const filename = cleanFilename(item.filename);
  response.setHeader('Content-Type', item.mime || 'application/octet-stream');
  response.setHeader('Content-Length', item.bytes);
  response.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename));
  response.setHeader('X-Content-SHA256', item.sha256);
  response.setHeader('ETag', '"' + item.sha256 + '"');
}
async function sendFile(response, item) {
  const handle = await open(item.file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    need(info.isFile() && info.nlink === 1 && !(info.mode & 0o077) && info.size === item.bytes, 'EXPORT_CHANGED', 'The retained export file changed.', 409);
    fileHeaders(response, item);
    await pipeline(handle.createReadStream({ autoClose: false }), response);
  } finally { await handle.close(); }
}

export async function startCiimDeskServer({
  directory, create = false, python = 'python3', host = '127.0.0.1', port = 0,
  expectedWorkspaceId, expectedMarkerSha256,
} = {}) {
  need(host === '127.0.0.1', 'LOOPBACK_REQUIRED', 'Use the private 127.0.0.1 listener.');
  need(Number.isInteger(port) && port >= 0 && port <= 65535, 'PORT_INVALID', 'Choose an available local port.');
  if (expectedWorkspaceId || expectedMarkerSha256) {
    need(!create && typeof expectedWorkspaceId === 'string' && /^[a-f0-9]{64}$/.test(expectedMarkerSha256 || ''),
      'BINDING_REQUIRED', 'Managed startup needs the complete original workspace binding.');
    const original = await readPrivate(join(directory, 'desk.json'), 65536);
    const marker = JSON.parse(original.toString('utf8'));
    need(marker.workspaceId === expectedWorkspaceId && digest(original) === expectedMarkerSha256,
      'WORKSPACE_CHANGED', 'The selected receiving desk marker changed.', 409);
  }
  const desk = await openCiimDesk({ directory, create, python });
  let server, startup, closing = false, closed = false, closePromise;
  const active = new Set();
  const session = randomBytes(32).toString('hex');
  const connectionFile = join(directory, 'desk-connection.json');
  const listenerFile = join(directory, 'desk-listener.json');
  const incoming = join(directory, 'http-incoming');
  try {
    await privateDirectory(incoming, true);
    const state = await desk.state();
    const markerBytes = await readPrivate(join(directory, 'desk.json'), 65536);
    const markerSha256 = digest(markerBytes);
    const marker = JSON.parse(markerBytes.toString('utf8'));
    need(marker.workspaceId === state.workspaceId &&
      (!expectedWorkspaceId || expectedWorkspaceId === state.workspaceId) &&
      (!expectedMarkerSha256 || expectedMarkerSha256 === markerSha256),
      'WORKSPACE_CHANGED', 'The opened desk differs from its selected marker.', 409);
    let listenPort = port;
    if (port === 0) {
      try {
        const preference = JSON.parse((await readPrivate(listenerFile, 4096)).toString('utf8'));
        need(preference.schema === 'tjl.ciim.desk-listener.v1' && preference.workspace === directory &&
          Number.isInteger(preference.port) && preference.port >= 1 && preference.port <= 65535,
          'LISTENER_PREFERENCE_CHANGED', 'The original local listener preference differs.', 409);
        listenPort = preference.port;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const assets = await readBrowserAssets(new URL('./browser-assets.json', import.meta.url));
    const tokenBytes = Buffer.from(session);
    let origin;
    async function authorize(request, url) {
      need(request.headers.host === new URL(origin).host, 'HOST_REJECTED', 'Use the original private listener.', 403);
      need(!request.headers.origin || request.headers.origin === origin, 'ORIGIN_REJECTED', 'Use the same local application.', 403);
      need(request.headers['sec-fetch-site'] !== 'cross-site', 'ORIGIN_REJECTED', 'Cross-site requests are not accepted.', 403);
      if (!url.pathname.startsWith('/api/')) return;
      const supplied = Buffer.from(String(request.headers[SESSION_HEADER] || ''));
      need(supplied.length === tokenBytes.length && timingSafeEqual(supplied, tokenBytes),
        'SESSION_REQUIRED', 'Open the original local link or enter its session token.', 401);
    }
    async function upload(request) {
      const encodedName = request.headers['x-ciim-filename'];
      need(typeof encodedName === 'string' && encodedName.length <= 2048, 'FILENAME_REQUIRED', 'Select the original ZIP filename.');
      let filename;
      try { filename = decodeURIComponent(encodedName); } catch { throw fault('FILENAME_INVALID', 'The original filename encoding is invalid.'); }
      need(filename && !filename.includes('\0') && filename.length <= 512, 'FILENAME_INVALID', 'Choose a valid original filename.');
      need(/^application\/(?:zip|octet-stream)(?:;|$)/i.test(request.headers['content-type'] || ''), 'ZIP_REQUIRED', 'Send the original ZIP bytes.', 415);
      const declared = request.headers['content-length'];
      if (declared !== undefined) need(/^\d+$/.test(declared) && Number(declared) <= LIMITS.archiveBytes, 'ARCHIVE_TOO_LARGE', 'The original archive exceeds the supported size.', 413);
      const expected = request.headers['x-ciim-sha256'];
      if (expected !== undefined) need(/^[a-f0-9]{64}$/.test(expected), 'SHA256_INVALID', 'Use the complete original SHA256.');
      const path = join(incoming, randomUUID() + '.zip');
      const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      const hash = createHash('sha256'); let bytes = 0, complete = false;
      try {
        for await (const chunk of request) {
          bytes += chunk.length;
          need(bytes <= LIMITS.archiveBytes, 'ARCHIVE_TOO_LARGE', 'The original archive exceeds the supported size.', 413);
          hash.update(chunk); await file.writeFile(chunk);
        }
        need(bytes > 0 && (declared === undefined || Number(declared) === bytes), 'UPLOAD_INCOMPLETE', 'The original archive transfer is incomplete.');
        const sha256 = hash.digest('hex');
        need(!expected || expected === sha256, 'UPLOAD_CHANGED', 'The transferred archive differs from its expected SHA256.');
        await file.sync(); complete = true;
        await file.close();
        return await desk.prepareImport({ archiveFile: path, filename, sha256, bytes });
      } finally {
        if (!complete) await file.close();
        await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    }
    async function handle(request, response) {
      secureHeaders(response);
      need(!closing, 'DESK_CLOSING', 'The receiving desk is closing.', 503);
      const url = new URL(request.url, origin);
      await authorize(request, url);
      if (request.method === 'GET' && assets.has(url.pathname)) {
        const asset = assets.get(url.pathname), bytes = await readFile(asset.url);
        response.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': bytes.length }); response.end(bytes); return;
      }
      need(url.pathname.startsWith('/api/'), 'NOT_FOUND', 'The requested view does not exist.', 404);
      const params = query(url);
      if (request.method === 'GET') {
        if (url.pathname === '/api/launch') return json(response, 200, startup);
        if (url.pathname === '/api/describe') return json(response, 200, desk.describe());
        if (url.pathname === '/api/state') return json(response, 200, await desk.state());
        if (url.pathname === '/api/view') return json(response, 200, await desk.view(params));
        if (url.pathname === '/api/record') return json(response, 200, await desk.record(params));
        if (url.pathname === '/api/export/workspace') return sendFile(response, await desk.exportWorkspace());
        if (url.pathname === '/api/export/handback') return sendFile(response, await desk.exportHandback({ handbackId: params.handbackId }));
        if (url.pathname === '/api/attachment') {
          const item = await desk.attachment(params);
          need(Buffer.isBuffer(item.body) && item.body.length === item.bytes && digest(item.body) === item.sha256, 'ATTACHMENT_CHANGED', 'The retained original attachment changed.', 409);
          fileHeaders(response, item); response.end(item.body); return;
        }
      }
      if (request.method === 'POST') {
        if (url.pathname === '/api/act') {
          const body = await jsonBody(request);
          need(!(expectedMarkerSha256 && body.type === 'workspace.restore'), 'MANAGED_WORKSPACE_BINDING',
            'Restore into a fresh desk before selecting its original marker in Applications.', 409);
          const result = await desk.act(body);
          if (body.type === 'workspace.restore') {
            const marker = await readPrivate(join(directory, 'desk.json'), 65536);
            startup = { ...startup, workspaceId: result.state.workspaceId, markerSha256: digest(marker) };
            await atomicJson(directory, 'desk-connection.json', { schema: 'tjl.ciim.desk-connection.v1', ...startup, sessionHeader: SESSION_HEADER });
          }
          return json(response, 200, result);
        }
        if (url.pathname === '/api/import') return json(response, 200, await upload(request));
      }
      throw fault('ROUTE_NOT_FOUND', 'The selected operation is not available on this route.', 404);
    }
    server = createServer((request, response) => {
      const work = handle(request, response).catch(error => {
        if (!response.headersSent && !response.destroyed) {
          const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
          json(response, status, { error: { code: error.code || 'DESK_ERROR', message: status === 500 ? 'The local operation could not finish. Reopen its saved state and original request.' : error.message, ...(error.details ? { details: error.details } : {}) } });
        } else if (!response.destroyed) response.destroy();
      }).finally(() => active.delete(work));
      active.add(work);
    });
    server.requestTimeout = 600000;
    server.headersTimeout = 15000;
    server.keepAliveTimeout = 5000;
    server.maxHeadersCount = 50;
    server.listen(listenPort, host);
    try { await once(server, 'listening'); }
    catch (error) {
      if (error.code === 'EADDRINUSE' && port === 0 && listenPort)
        throw fault('ORIGINAL_LISTENER_IN_USE', 'The original desk port '+listenPort+' is occupied. Close its owning listener, then reopen this desk to recover the original browser request.', 409);
      throw error;
    }
    origin = 'http://' + host + ':' + server.address().port;
    await atomicJson(directory, 'desk-listener.json', { schema: 'tjl.ciim.desk-listener.v1', workspace: directory, port: server.address().port });
    startup = { schema: STARTUP_SCHEMA, status: 'CIIM_DESK_READY', workspaceId: state.workspaceId,
      workspace: directory, markerSha256, pid: process.pid, url: origin + '/#' + session, connectionFile };
    await atomicJson(directory, 'desk-connection.json', { schema: 'tjl.ciim.desk-connection.v1', ...startup, sessionHeader: SESSION_HEADER });
    async function close() {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        const stopped = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        server.closeIdleConnections?.();
        await Promise.allSettled([...active]);
        await stopped;
        await desk.close();
        try {
          const value = JSON.parse((await readPrivate(connectionFile, 65536)).toString('utf8'));
          if (value.url === startup.url && value.pid === process.pid) { await unlink(connectionFile); await syncDirectory(directory); }
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        closed = true;
      })();
      return closePromise;
    }
    const running = { ...startup };
    Object.defineProperties(running, { close: { value: close }, closed: { get: () => closed }, startup: { get: () => ({ ...startup }) } });
    return running;
  } catch (error) {
    closing = true;
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await desk.close();
    throw error;
  }
}
