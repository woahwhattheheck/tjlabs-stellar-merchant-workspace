// MIT. Local industrial operator for the existing x402engine receiving workspace.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, randomUUID, createHash } from 'node:crypto';
import { readFile, open, link, unlink, chmod } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { openX402VideoJob } from './x402engine.mjs';
import { privateDirectory } from '../../sf88-operator-buyer-cli/node/store.mjs';
import { VerifiedFile } from '../../sf88-operator-buyer-cli/node/result.mjs';

const assets = new URL('./public/', import.meta.url);
const types = { 'index.html': 'text/html; charset=utf-8', 'app.mjs': 'text/javascript; charset=utf-8',
  'style.css': 'text/css; charset=utf-8' };
const safeCode = error => /^[A-Z][A-Z0-9_]{0,119}$/.test(error?.code ?? '') ? error.code : 'VIDEO_OPERATOR_FAILED';
function headers(response) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self'; " +
    "connect-src 'self'; media-src 'self' blob:; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
}
function json(response, status, value) {
  const bytes = Buffer.from(JSON.stringify(value) + '\n');
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': bytes.length });
  response.end(bytes);
}
function equals(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function authorize(request, token, cookieName) {
  const bearer = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
  const cookie = request.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return equals(bearer ?? cookie ?? '', token);
}
async function emptyBody(request) {
  let size = 0; const parts = [];
  for await (const part of request) { size += part.length; if (size > 1024) throw Object.assign(new Error(), { code: 'VIDEO_BODY_TOO_LARGE' }); parts.push(part); }
  const text = Buffer.concat(parts).toString('utf8').trim();
  if (text && text !== '{}') throw Object.assign(new Error(), { code: 'VIDEO_EMPTY_ACTION_REQUIRED' });
}
async function tarWorkspace(exported, destination) {
  const temporary = destination + '.' + randomUUID() + '.partial';
  const child = spawn('tar', ['--format=posix', '-czf', temporary, '-C', exported.directory, '.'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-4096); });
  try {
    const [code, signal] = await once(child, 'close');
    if (code !== 0) throw Object.assign(new Error(), { code: 'VIDEO_ARCHIVE_CREATION_FAILED', nativeCode: code, nativeSignal: signal });
    await chmod(temporary, 0o600);
    const file = await open(temporary, 'r');
    try { await file.sync(); } finally { await file.close(); }
    await link(temporary, destination);
    const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of createReadStream(destination)) { bytes += chunk.length; hash.update(chunk); }
    return { path: destination, bytes, sha256: hash.digest('hex'), state: 'COMPLETE' };
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
function byteRange(value, total) {
  if (!value) return { start: 0, end: total - 1, status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    start = Math.max(0, total - suffix); end = total - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || end < start) return null;
  return { start, end, status: 206 };
}
class ArchiveFile extends VerifiedFile {
  constructor(saved) { super(); this.saved = saved; }
  _metadata() { return this.saved; }
}
async function sendFile(request, response, file, contentType, filename, transfers) {
  const range = byteRange(request.headers.range, file.saved.bytes);
  if (!range) { response.writeHead(416, { 'content-range': 'bytes */' + file.saved.bytes }); response.end(); return; }
  const extra = { 'content-type': contentType, 'content-length': range.end - range.start + 1,
    'accept-ranges': 'bytes', etag: '"' + file.saved.sha256 + '"' };
  if (filename) extra['content-disposition'] = 'attachment; filename="' + filename + '"';
  if (range.status === 206) extra['content-range'] = 'bytes ' + range.start + '-' + range.end + '/' + file.saved.bytes;
  response.writeHead(range.status, extra);
  if (request.method === 'HEAD') { response.end(); return; }
  const transfer = new AbortController();
  const disconnected = () => transfer.abort();
  transfers.add(transfer); response.once('close', disconnected);
  if (response.destroyed) transfer.abort();
  try {
    let position = 0;
    for await (const chunk of file.chunks({ signal: transfer.signal })) {
      const left = Math.max(0, range.start - position), right = Math.min(chunk.length, range.end + 1 - position);
      if (right > left && !response.write(chunk.subarray(left, right)))
        await once(response, 'drain', { signal: transfer.signal });
      position += chunk.length;
    }
    response.end();
  } finally { response.off('close', disconnected); transfers.delete(transfer); }

}

export async function startX402VideoOperator({ directory, host = '127.0.0.1', port = 0,
  exportsDirectory = join(dirname(directory), 'video-exports'), token = randomBytes(32).toString('base64url'),
  transport, fetchImpl } = {}) {
  if (!['127.0.0.1', '::1'].includes(host) || !Number.isSafeInteger(port) || port < 0 || port > 65535 ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw Object.assign(new Error(), { code: 'VIDEO_OPERATOR_CONFIG_INVALID' });
  const job = await openX402VideoJob({ directory, transport, fetchImpl });
  let origin, active = null, lastError = null, lastArchive = null, controller = null;
  const cookieName = 'video_receiving_' + randomBytes(12).toString('hex');
  const transfers = new Set();
  const snapshot = async () => ({ job: await job.inspect(), receiving: active !== null, lastError,
    archive: lastArchive ? { bytes: lastArchive.bytes, sha256: lastArchive.sha256,
      download: '/api/archive', filename: lastArchive.filename } : null });
  const server = createServer(async (request, response) => {
    headers(response);
    try {
      const url = new URL(request.url, origin);
      if (url.origin !== origin) { json(response, 400, { error: 'VIDEO_ORIGIN_INVALID' }); return; }
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/assets/'))) {
        const name = url.pathname === '/' ? 'index.html' : url.pathname.slice('/assets/'.length);
        if (!Object.hasOwn(types, name)) { json(response, 404, { error: 'VIDEO_NOT_FOUND' }); return; }
        const bytes = await readFile(new URL(name, assets));
        response.writeHead(200, { 'content-type': types[name], 'content-length': bytes.length }); response.end(bytes); return;
      }
      if (!authorize(request, token, cookieName)) { json(response, 401, { error: 'VIDEO_OPERATOR_AUTH_REQUIRED' }); return; }
      if (request.method === 'POST' && request.headers.origin && request.headers.origin !== origin) {
        json(response, 403, { error: 'VIDEO_ORIGIN_INVALID' }); return;
      }
      if (request.method === 'POST') await emptyBody(request);
      if (request.method === 'POST' && url.pathname === '/api/auth') {
        response.setHeader('set-cookie', cookieName + '=' + token + '; Path=/; HttpOnly; SameSite=Strict');
        response.writeHead(204); response.end(); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/status') { json(response, 200, await snapshot()); return; }
      if (request.method === 'POST' && url.pathname === '/api/poll') {
        if (active) { json(response, 409, { error: 'VIDEO_RECEIVING_ACTIVE' }); return; }
        await job.poll(); json(response, 200, await snapshot()); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/receive') {
        if (!active) {
          controller = new AbortController(); lastError = null;
          active = job.receive({ signal: controller.signal }).catch(error => { lastError = safeCode(error); })
            .finally(() => { active = null; controller = null; });
        }
        json(response, 202, await snapshot()); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/pause') {
        controller?.abort(); if (active) await active;
        json(response, 200, await snapshot()); return;
      }
      if (request.method === 'POST' && url.pathname === '/api/export') {
        if (active) { json(response, 409, { error: 'VIDEO_RECEIVING_ACTIVE' }); return; }
        await privateDirectory(exportsDirectory);
        const id = randomUUID(), target = join(exportsDirectory, id);
        const exported = await job.exportWorkspace(target);
        const archive = await tarWorkspace(exported, target + '.tar.gz');
        lastArchive = { ...archive, filename: 'x402engine-video-' + (await job.inspect()).id.slice(0,16) + '.tar.gz' };
        json(response, 200, await snapshot()); return;
      }
      if (['GET', 'HEAD'].includes(request.method) && ['/api/video', '/api/video/download'].includes(url.pathname)) {
        const file = await job.result();
        await sendFile(request, response, file, file.saved.contentType,
          url.pathname.endsWith('/download') ? 'received-video' + ({ 'video/mp4': '.mp4',
            'video/webm': '.webm', 'video/quicktime': '.mov', 'video/mpeg': '.mpeg' }[file.saved.contentType] ?? '') : null, transfers);
        return;
      }
      if (['GET', 'HEAD'].includes(request.method) && url.pathname === '/api/archive') {
        if (!lastArchive) { json(response, 404, { error: 'VIDEO_EXPORT_REQUIRED' }); return; }
        await sendFile(request, response, new ArchiveFile(lastArchive), 'application/gzip', lastArchive.filename, transfers);
        return;
      }
      json(response, 404, { error: 'VIDEO_NOT_FOUND' });
    } catch (error) {
      if (response.destroyed) return;
      if (response.headersSent) response.destroy(error);
      else json(response, error?.code === 'VIDEO_RESULT_NOT_RECEIVED' ? 409 : 500, { error: safeCode(error) });
    }
  });
  server.listen({ host, port }); await once(server, 'listening');
  const address = server.address();
  origin = 'http://' + (host === '::1' ? '[::1]' : host) + ':' + address.port;
  return { origin, url: origin + '/#' + token, job,
    async close() { controller?.abort(); if (active) await active;
      for (const transfer of transfers) transfer.abort();
      await new Promise((done, reject) => {
        server.close(error => error ? reject(error) : done());
        server.closeAllConnections();
      }); } };
}
