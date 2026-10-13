// MIT. DDP source upload, complete downloads and paged migration review over the original project.
import { need, operationId } from '../model.mjs';
import { sealFredDdpFile, MAX_DDP_FILE_BYTES, MAX_DDP_CAPTURE_BYTES } from './files.mjs';
import { sealFredDdpCrosswalk, pageFredDdpCrosswalk } from './crosswalk.mjs';
import { sealFredDdpPackage, pageFredDdpPackage } from './package.mjs';
import { readFredProject, listFredDdpSources, getFredDdpCrosswalk, importFredDdpCrosswalk,
  acquireFredDdpCrosswalk, getFredDdpPackage, importFredDdpPackage, previewFredDdpMigration,
  saveFredDdpMigration, getFredDdpMigration, downloadFredDdpMigration, acquireFredDdpMigration,
  getFredDdpReceiving, downloadFredDdpReceiving } from '../project.mjs';

export const FRED_DDP_ACTIONS = new Set([
  'ddp-crosswalk-import', 'ddp-crosswalk-capture', 'ddp-package-import',
  'ddp-migration-save', 'ddp-migration-acquire',
]);
const MEDIA = { 'board-sdmx-zip': 'application/zip', 'board-sdmx-xml': 'application/xml', 'ddp-csv': 'text/csv' };
function selection(request) {
  return { packageId: request.packageId, crosswalkId: request.crosswalkId, name: request.name,
    asOf: request.asOf, window: request.window, decisions: request.decisions, bindings: request.bindings,
    pageSize: request.pageSize, maxRows: request.maxRows, bookmark: request.bookmark ?? null, note: request.note ?? '' };
}
function integer(value, fallback, maximum, minimum = 0) {
  if (value === null || value === undefined) return fallback;
  need((typeof value === 'string' && /^\d+$/.test(value)) || typeof value === 'number',
    'Choose a complete DDP page number.');
  value = Number(value);
  need(Number.isSafeInteger(value) && value >= minimum && value <= maximum, 'Choose an available DDP page number.');
  return value;
}
function page(url) {
  return { offset: integer(url.searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER),
    limit: integer(url.searchParams.get('limit'), 100, 500, 1) };
}
function boolean(value) {
  need(value === null || value === '0' || value === '1', 'Choose a valid comparison filter.');
  return value !== '0';
}
function filename(value, fallback) {
  const name = String(value ?? '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
  return name && name !== '.' && name !== '..' ? name : fallback;
}
function originalFile(source, fallback) {
  const file = source.file;
  need(file && typeof file.base64 === 'string', 'The original DDP source file is required.');
  return { body: Buffer.from(file.base64, 'base64'), contentType: source.format ? MEDIA[source.format] : 'text/csv; charset=utf-8',
    path: filename(file.name, fallback) };
}
export async function runFredDdpAction({ request, directory, environment = process.env, signal }) {
  const common = { directory, id: request.id, expectedRevision: request.expectedRevision };
  switch (request.action) {
    case 'ddp-crosswalk-import': return importFredDdpCrosswalk({ ...common,
      capture: request.capture, crosswalkId: request.crosswalkId });
    case 'ddp-crosswalk-capture': return acquireFredDdpCrosswalk({ ...common, url: request.url, signal });
    case 'ddp-package-import': return importFredDdpPackage({ ...common,
      capture: request.capture, packageId: request.packageId });
    case 'ddp-migration-save': return saveFredDdpMigration({ ...common, ...selection(request), previewId: request.previewId });
    case 'ddp-migration-acquire': return acquireFredDdpMigration({ ...common,
      migrationId: request.migrationId, environment, signal,
      ...(Object.hasOwn(request, 'sourceMode') ? { sourceMode: request.sourceMode } : {}),
      ...(Object.hasOwn(request, 'metadata') ? { metadata: request.metadata } : {}),
      ...(Object.hasOwn(request, 'metadataSha256') ? { metadataSha256: request.metadataSha256 } : {}) });
    default: need(false, 'Choose a declared DDP project action.');
  }
}
async function readUpload(req) {
  need(/^multipart\/form-data;\s*boundary=/i.test(req.headers['content-type'] ?? ''),
    'Choose the original DDP source files.', 'FRED_DDP_UPLOAD_REQUIRED', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    need(size <= MAX_DDP_CAPTURE_BYTES + 2 * 1024 * 1024, 'The selected original files exceed the DDP upload capacity.',
      'FRED_DDP_UPLOAD_CAPACITY', 413);
    chunks.push(chunk);
  }
  let form;
  try {
    form = await new Request('http://localhost/ddp-import', { method: 'POST',
      headers: { 'content-type': req.headers['content-type'] }, body: Buffer.concat(chunks) }).formData();
  } catch { need(false, 'The original source upload is incomplete.', 'FRED_DDP_UPLOAD_INVALID'); }
  const metadata = form.get('request');
  need(typeof metadata === 'string' && metadata.length <= 65536, 'Retain the original DDP upload selection.');
  let request;
  try { request = JSON.parse(metadata); } catch { need(false, 'The DDP upload selection is incomplete.'); }
  need(request && typeof request === 'object' && !Array.isArray(request) &&
    ['ddp-crosswalk-import', 'ddp-package-import'].includes(request.action), 'Choose a DDP source import.');
  operationId(request.id);
  need(Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 1, 'Choose the original project revision.');
  const file = form.get('source'), supplements = form.getAll('supplement');
  need(file && typeof file.arrayBuffer === 'function' && supplements.length <= 1024 &&
    supplements.every(item => item && typeof item.arrayBuffer === 'function'), 'Select the complete original file set.');
  need(form.getAll('source').length === 1 && form.getAll('request').length === 1 &&
    [...form.keys()].every(key => ['request', 'source', 'supplement'].includes(key)),
    'Retain one original package and its declared source dictionaries.');
  need(file.size > 0, 'Choose a complete original source file.');
  if (/\.json$/i.test(file.name)) {
    need(file.size <= MAX_DDP_CAPTURE_BYTES, 'The retained JSON source exceeds its complete capture capacity.', 'FRED_DDP_UPLOAD_CAPACITY', 413);
    need(supplements.length === 0, 'A complete retained JSON source already contains its original file set.');
    let capture;
    try { capture = JSON.parse(await file.text()); } catch { need(false, 'The retained DDP JSON source is incomplete.'); }
    return { action: request.action, id: request.id, expectedRevision: request.expectedRevision, capture };
  }
  need(file.size + supplements.reduce((total, item) => total + item.size, 0) <= MAX_DDP_FILE_BYTES,
    'The complete original file set exceeds the DDP source capacity.', 'FRED_DDP_UPLOAD_CAPACITY', 413);
  const provenance = { kind: 'file', receivedAt: request.receivedAt };
  const source = sealFredDdpFile({ name: file.name,
    mediaType: request.action === 'ddp-crosswalk-import' ? 'text/csv' : MEDIA[request.format],
    bytes: new Uint8Array(await file.arrayBuffer()), provenance });
  if (request.action === 'ddp-crosswalk-import') {
    need(supplements.length === 0, 'The published crosswalk is one original CSV file.');
    return { action: request.action, id: request.id, expectedRevision: request.expectedRevision,
      capture: sealFredDdpCrosswalk({ file: source }) };
  }
  const supplementalFiles = [];
  for (const item of supplements) supplementalFiles.push(sealFredDdpFile({ name: item.name,
    mediaType: 'application/xml', bytes: new Uint8Array(await item.arrayBuffer()), provenance }));
  return { action: request.action, id: request.id, expectedRevision: request.expectedRevision,
    capture: sealFredDdpPackage({ file: source, release: request.release, format: request.format,
      supplementalFiles, csvLayout: request.csvLayout ?? null }) };
}

/** Returns true only after this module has handled the authenticated workspace route. */
export async function handleFredDdpHttp({ req, res, url, directory, body, send,
  sendJsonFile = (res, status, value, filename) => send(res, status, value, 'application/json; charset=utf-8', filename),
  execute, busy }) {
  if (req.method === 'POST' && url.pathname === '/api/ddp-import') {
    need(!busy(), 'The original workspace action is still running; read its state.', 'FRED_WORKSPACE_BUSY', 409);
    return send(res, 200, await execute(await readUpload(req))), true;
  }
  if (req.method === 'GET' && url.pathname === '/api/ddp-sources')
    return send(res, 200, await listFredDdpSources({ directory })), true;
  if (req.method === 'GET' && url.pathname === '/api/ddp-crosswalk') {
    const crosswalkId = url.searchParams.get('crosswalk'), capture = await getFredDdpCrosswalk({ directory, crosswalkId });
    if (url.searchParams.get('original') === '1') {
      const file = originalFile(capture, 'ddp-fred-crosswalk.csv');
      return send(res, 200, file.body, file.contentType, file.path), true;
    }
    if (url.searchParams.get('download') === '1') {
      await sendJsonFile(res, 200, capture, 'fred-ddp-crosswalk.json'); return true;
    }
    const project = await readFredProject(directory);
    return send(res, 200, { projectId: project.id, revision: project.revision,
      crosswalk: pageFredDdpCrosswalk(capture, { ...page(url), release: url.searchParams.get('release') || null,
        query: url.searchParams.get('query') || '' }) }), true;
  }
  if (req.method === 'GET' && url.pathname === '/api/ddp-package') {
    const packageId = url.searchParams.get('package'), capture = await getFredDdpPackage({ directory, packageId });
    if (url.searchParams.get('original') === '1') {
      const file = originalFile(capture, 'ddp-original-package');
      return send(res, 200, file.body, file.contentType, file.path), true;
    }
    if (url.searchParams.get('download') === '1') {
      await sendJsonFile(res, 200, capture, 'fred-ddp-package.json'); return true;
    }
    const project = await readFredProject(directory);
    return send(res, 200, { projectId: project.id, revision: project.revision,
      package: pageFredDdpPackage(capture, { ...page(url), section: url.searchParams.get('section') || 'series',
        seriesId: url.searchParams.get('seriesId') || null, frequency: url.searchParams.get('frequency') || null,
        query: url.searchParams.get('query') || '' }) }), true;
  }
  if (req.method === 'POST' && url.pathname === '/api/ddp-migration-preview') {
    const request = await body(req, MAX_DDP_CAPTURE_BYTES);
    return send(res, 200, await previewFredDdpMigration({ directory, ...selection(request),
      section: request.section ?? 'series', offset: integer(request.offset, 0, Number.MAX_SAFE_INTEGER),
      limit: integer(request.limit, 100, 500, 1) })), true;
  }
  if (req.method === 'GET' && url.pathname === '/api/ddp-migration') {
    const migrationId = url.searchParams.get('migration');
    if (url.searchParams.get('download') === '1') {
      const file = await downloadFredDdpMigration({ directory, migrationId });
      return send(res, 200, file.body, file.contentType, file.path), true;
    }
    return send(res, 200, await getFredDdpMigration({ directory, migrationId,
      section: url.searchParams.get('section') || 'series', ...page(url) })), true;
  }
  if (req.method === 'GET' && url.pathname === '/api/ddp-receiving') {
    const receivingId = url.searchParams.get('receiving'), format = url.searchParams.get('format');
    if (format !== null) {
      const file = await downloadFredDdpReceiving({ directory, receivingId, format });
      return send(res, 200, file.body, file.contentType, file.path), true;
    }
    return send(res, 200, await getFredDdpReceiving({ directory, receivingId,
      ...page(url), seriesId: url.searchParams.get('seriesId') || null, changesOnly: boolean(url.searchParams.get('changesOnly')) })), true;
  }
  return false;
}
export { MAX_DDP_CAPTURE_BYTES };
