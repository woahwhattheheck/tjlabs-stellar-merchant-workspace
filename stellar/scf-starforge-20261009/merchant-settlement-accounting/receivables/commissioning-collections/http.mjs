// MIT. Composable commissioning routes share the original accounting authorization.
import {readFile} from 'node:fs/promises';
import {readBrowserAssets} from '../../../distribution/browser-assets.mjs';
import {renderCustomerTar} from '../core.mjs';
import {accountingWorkspaceBinding} from '../../workspace/binding.mjs';

export const COMMISSIONING_OPERATOR_REQUEST_BYTES = 32 * 1024 * 1024;
export const COMMISSIONING_OPERATOR_SOURCE_BYTES = 8 * 1024 * 1024;
const STATIC = await readBrowserAssets(new URL('./browser-assets.json', import.meta.url));
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const problem = (code, message, status = 400, details) => Object.assign(new Error(message), {code, status, details});

export function commissioningBasePath(value, fallback) {
  const path = String(value || fallback).replace(/\/+$/, '');
  if (!path.startsWith('/') || /[?#\\\u0000-\u001f]/.test(path) || path.includes('//') || path.split('/').includes('..')) {
    throw new TypeError('A local absolute route path is required.');
  }
  return path;
}
export function commissioningSecurityHeaders(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}
export function commissioningJson(response, status, value) {
  const bytes = Buffer.from(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item));
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length});
  response.end(bytes);
}
function localRequest(request, configuredPort, mutation) {
  const raw = request.headers.host;
  if (typeof raw !== 'string' || raw.includes('@') || /[\s/#?]/.test(raw)) throw problem('INVALID_HOST', 'Use the local workspace address.', 403);
  let host;
  try { host = new URL('http://' + raw); } catch { throw problem('INVALID_HOST', 'Use the local workspace address.', 403); }
  const port = configuredPort || request.socket?.localPort;
  if (!LOOPBACK.has(host.hostname.toLowerCase()) || (port && Number(port) !== (host.port ? Number(host.port) : 80))) {
    throw problem('INVALID_HOST', 'Use the local workspace address and port.', 403);
  }
  if (request.headers.origin !== undefined) {
    let origin;
    try { origin = new URL(String(request.headers.origin)); } catch { throw problem('INVALID_ORIGIN', 'Open this request in the local workspace.', 403); }
    if (origin.protocol !== 'http:' || origin.host.toLowerCase() !== host.host.toLowerCase() || origin.username || origin.password) {
      throw problem('INVALID_ORIGIN', 'Open this request in the local workspace.', 403);
    }
  }
  if (mutation) {
    if (request.headers['x-workspace-request'] !== '1') throw problem('WORKSPACE_REQUEST_REQUIRED', 'Use the workspace client to save changes.', 403);
    if (String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw problem('JSON_REQUIRED', 'Send an application/json request.', 415);
    }
    if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') {
      throw problem('UNSUPPORTED_ENCODING', 'Send an uncompressed JSON request.', 415);
    }
  }
}
async function readBody(request) {
  const maximum = COMMISSIONING_OPERATOR_REQUEST_BYTES, declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > maximum)) {
    throw problem('REQUEST_TOO_LARGE', 'The request exceeds the workspace document limit.', 413);
  }
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximum) throw problem('REQUEST_TOO_LARGE', 'The request exceeds the workspace document limit.', 413);
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw problem('INVALID_JSON', 'The request body must contain valid JSON.'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw problem('INVALID_JSON', 'Send a JSON operator request.');
  return value;
}
function identifier(raw) {
  let value;
  try { value = decodeURIComponent(raw); } catch { throw problem('INVALID_IDENTIFIER', 'The record identifier is malformed.'); }
  if (!value || value.length > 240 || value === '.' || value === '..' || /[\\/\u0000-\u001f]/.test(value)) {
    throw problem('INVALID_IDENTIFIER', 'The record identifier is malformed.');
  }
  return value;
}
function queryValue(query) {
  const value = query instanceof URLSearchParams ? Object.fromEntries(query) : Object.fromEntries(
    Object.entries(query ?? {}).filter(([, item]) => item !== undefined && item !== null));
  for (const key of ['offset', 'limit']) if (typeof value[key] === 'string' && /^(0|[1-9][0-9]*)$/.test(value[key])) {
    const number = Number(value[key]);
    if (Number.isSafeInteger(number)) value[key] = number;
  }
  return value;
}
function sendFile(response, result, head = false) {
  if (!result || result.bytes === undefined || typeof result.name !== 'string') throw problem('DOCUMENT_NOT_FOUND', 'The requested document is unavailable.', 404);
  const bytes = Buffer.isBuffer(result.bytes) ? result.bytes : Buffer.from(result.bytes);
  const filename = result.name.replace(/[\r\n"\\]/g, '_').split('/').pop();
  response.writeHead(200, {'Content-Type': result.type || 'application/octet-stream', 'Content-Length': bytes.length,
    'Content-Disposition': 'attachment; filename="' + filename + '"'});
  response.end(head ? undefined : bytes);
}
export function commissioningPublicError(error) {
  const code = String(error?.code || 'INTERNAL_ERROR');
  let status = Number(error?.status || error?.statusCode);
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    status = /NOT_FOUND|UNKNOWN_(INVOICE|CUSTOMER|RECEIPT|DOCUMENT|SOURCE|CAPTURE)/i.test(code) ? 404 :
      /CONFLICT|STALE|REVISION|VERSION|REQUEST_ID_REUSED|LEASE|ALREADY/i.test(code) ? 409 : code === 'INTERNAL_ERROR' ? 500 : 400;
  }
  return {status, value: {error: {
    code, message: code === 'INTERNAL_ERROR' ? 'The workspace could not finish this request. Keep the operation and retry after recovery.' : String(error?.message || code),
    ...(error?.details === undefined ? {} : {details: error.details}),
    ...(typeof error?.outcomeUnknown === 'boolean' ? {outcomeUnknown: error.outcomeUnknown} : {}),
    ...(typeof error?.reopenRequired === 'boolean' ? {reopenRequired: error.reopenRequired} : {}),
    ...(error?.commitUncertainty === undefined ? {} : {commitUncertainty: error.commitUncertainty}),
  }}};
}

export async function commissioningCollectionsAsset(path, {
  apiPath = '/api/receivables/commissioning', uiPath = '/receivables/commissioning',
  receivablesApiPath = '/api/receivables', receivablesUiPath = '/receivables',
  xeroApiPath = '/api/receivables/xero', xeroUiPath = '/receivables/xero', workspaceId = null, sourcesSha256 = null, revision = null,
} = {}) {
  apiPath = commissioningBasePath(apiPath, '/api/receivables/commissioning');
  uiPath = commissioningBasePath(uiPath, '/receivables/commissioning');
  const dependencyPath = new URL('../xero/client.mjs', 'http://localhost' + uiPath + '/').pathname;
  if (path === dependencyPath) return {bytes: await readFile(new URL('../xero/client.mjs', import.meta.url)), type: 'text/javascript; charset=utf-8'};
  if (path !== uiPath && !path.startsWith(uiPath + '/')) return null;
  const name = path === uiPath ? 'index.html' : path.slice(uiPath.length + 1) || 'index.html';
  if (name === 'config.json') return {bytes: Buffer.from(JSON.stringify({
    apiPath, uiPath, workspaceId, sourcesSha256, revision,
    receivablesApiPath: commissioningBasePath(receivablesApiPath, '/api/receivables'),
    receivablesUiPath: commissioningBasePath(receivablesUiPath, '/receivables'),
    xeroApiPath: commissioningBasePath(xeroApiPath, '/api/receivables/xero'),
    xeroUiPath: commissioningBasePath(xeroUiPath, '/receivables/xero'),
    requestBytes: COMMISSIONING_OPERATOR_REQUEST_BYTES, sourceBytes: COMMISSIONING_OPERATOR_SOURCE_BYTES,
  })), type: 'application/json; charset=utf-8'};
  const entry = STATIC.get('/receivables/commissioning/' + name);
  return entry ? {bytes: await readFile(entry.url), type: entry.type} : null;
}

/** The supplied controller owns the same original receivables state and journal. */
export async function handleCommissioningCollectionsRequest(controller, {
  method, path, query = {}, value, apiPath = '/api/receivables/commissioning',
}) {
  apiPath = commissioningBasePath(apiPath, '/api/receivables/commissioning');
  if (path !== apiPath && !path.startsWith(apiPath + '/')) return null;
  const parts = path.slice(apiPath.length).split('/').filter(Boolean).map(identifier);
  const route = parts.join('/'), search = queryValue(query);
  let result;
  if (method === 'GET') {
    if (route === '' || route === 'candidates') result = await controller.candidates(search);
    else if (route === 'sources') result = await controller.sources(search);
    else if (parts[0] === 'sources' && parts.length === 2) result = await controller.source(parts[1], search);
    else if (parts[0] === 'sources' && parts.length === 4 && parts[2] === 'files') {
      const selected = await controller.sourceFile(parts[1], parts[3]); return {file: selected, type: selected.type};
    } else if (route === 'captures') result = await controller.captures(search);
    else if (parts[0] === 'captures' && parts.length === 2) result = await controller.detail(parts[1]);
    else if (parts[0] === 'captures' && parts.length === 4 && parts[2] === 'files') {
      const selected = await controller.file(parts[1], parts[3]); return {file: selected, type: selected.type};
    } else if (parts[0] === 'captures' && parts.length === 3 && parts[2] === 'export') {
      const bundle = await controller.export(parts[1]), name = search.name;
      if (name === 'handover.tar') {
        const selected = {name: 'commissioning-' + parts[1] + '.tar', type: 'application/x-tar', bytes: renderCustomerTar(bundle.files)};
        return {file: selected, type: selected.type};
      }
      if (name) {
        const selected = bundle.files.find(item => item.name === name);
        if (!selected) throw problem('DOCUMENT_NOT_FOUND', 'Choose a file listed in this saved commissioning handover.', 404);
        return {file: selected, type: selected.type};
      }
      result = bundle.value;
    } else if (parts[0] === 'requests' && parts.length === 2) result = await controller.request(parts[1]);
    else throw problem('NOT_FOUND', 'This commissioning collections route does not exist.', 404);
  } else if (method === 'POST') {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw problem('INVALID_JSON', 'Send a JSON operator request.');
    if (route === 'sources/inspect') result = await controller.inspectSource(value);
    else if (route === 'sources') result = await controller.importSource(value);
    else if (parts[0] === 'sources' && parts.length === 3 && parts[2] === 'preview') result = await controller.preview(parts[1], value);
    else if (parts[0] === 'sources' && parts.length === 3 && parts[2] === 'captures') result = await controller.capture(parts[1], value);
    else throw problem('NOT_FOUND', 'This commissioning collections operation does not exist.', 404);
  } else throw problem('METHOD_NOT_ALLOWED', 'Use a supported commissioning collections operation.', 405);
  return {value: result};
}

export async function createCommissioningCollectionsHandler(controller, options = {}) {
  const apiPath = commissioningBasePath(options.apiPath, '/api/receivables/commissioning');
  const uiPath = commissioningBasePath(options.uiPath, '/receivables/commissioning');
  if (typeof controller.init === 'function') await controller.init();
  return async function commissioningCollectionsHandler(request, response) {
    let url;
    try { url = new URL(request.url || '/', 'http://localhost'); } catch { return false; }
    const api = url.pathname === apiPath || url.pathname.startsWith(apiPath + '/');
    const ui = url.pathname === uiPath || url.pathname.startsWith(uiPath + '/');
    const sharedClient = url.pathname === new URL('../xero/client.mjs', 'http://localhost' + uiPath + '/').pathname;
    if (!api && !ui && !sharedClient) return false;
    commissioningSecurityHeaders(response);
    try {
      const mutation = request.method === 'POST', head = request.method === 'HEAD';
      localRequest(request, options.port, mutation);
      if (request.method === 'GET' || head) {
        if (url.pathname === uiPath) { response.writeHead(302, {Location: uiPath + '/'}); response.end(); return true; }
        const asset = (ui || sharedClient) ? await commissioningCollectionsAsset(url.pathname, {...options, apiPath, uiPath,
          ...accountingWorkspaceBinding(controller.workspace.directory, controller.workspace.state), revision:controller.workspace.state.revision}) : null;
        if (asset) {
          response.writeHead(200, {'Content-Type': asset.type, 'Content-Length': asset.bytes.length});
          response.end(head ? undefined : asset.bytes); return true;
        }
      }
      if (!['GET', 'HEAD', 'POST'].includes(request.method)) throw problem('METHOD_NOT_ALLOWED', 'Use a supported commissioning collections operation.', 405);
      if (ui || sharedClient) throw problem('NOT_FOUND', 'This commissioning collections asset does not exist.', 404);
      const value = mutation ? await readBody(request) : undefined;
      const result = await handleCommissioningCollectionsRequest(controller, {
        method: head ? 'GET' : request.method, path: url.pathname, query: url.searchParams, value, apiPath,
      });
      if (!result) throw problem('NOT_FOUND', 'This workspace route does not exist.', 404);
      if (result.file) sendFile(response, result.file, head);
      else {
        const requestId = result.value?.operation?.id || value?.requestId;
        if (typeof requestId === 'string' && !/[\r\n]/.test(requestId)) response.setHeader('X-Request-Id', requestId);
        if (head) { response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'}); response.end(); }
        else commissioningJson(response, 200, result.value);
      }
    } catch (error) {
      if (response.headersSent) { response.end(); return true; }
      const failure = commissioningPublicError(error);
      if (failure.status === 405) response.setHeader('Allow', ui ? 'GET, HEAD' : 'GET, HEAD, POST');
      commissioningJson(response, failure.status, failure.value);
    }
    return true;
  };
}
