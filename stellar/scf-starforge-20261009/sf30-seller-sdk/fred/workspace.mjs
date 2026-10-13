// MIT. Private industrial operator UI over the maintained FRED project and native engines.
import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { loadDatasetConfig } from '../dataset-handler.mjs';
import { readPrivateJson } from '../routescan/quota.mjs';
import { Buyer } from '../../sf88-operator-buyer-cli/node/index.mjs';
import { need, inspectCapture, MAX_CAPTURE_BYTES, operationId } from './model.mjs';
import { jsonBytes, hash } from './source.mjs';
import { sendFredJsonFile } from './json-response.mjs';
import { pageFredBriefing } from './briefing/model.mjs';
import { inspectFredReleaseCapture } from './releases/model.mjs';
import { FRED_DDP_ACTIONS, MAX_DDP_CAPTURE_BYTES, runFredDdpAction, handleFredDdpHttp } from './ddp/http.mjs';
import { createFredDdpPublicationHttp } from './ddp/published-http.mjs';
import { runFredDdpPublicationOperation } from './ddp/published-workspace.mjs';
import { readFredWorkspaceLaunch, FRED_WORKSPACE_STARTUP } from './launch.mjs';
import { QCEW_WORKSPACE_REQUEST_BYTES, QCEW_WORKSPACE_ACTIONS,
  readQcewWorkspace, runQcewWorkspaceAction } from './qcew/workspace.mjs';
import { readFredProject, fredProjectView, getFredCapture, configureFredProject, importFredCapture, acquireFredCapture,
  selectFredCapture, combineFredTables, reviewFredCapture, compareFredCaptures, publishFredReview, exportFredProject,
  selectFredPublication, abandonFredOperation, previewFredBriefing, getFredBriefing, downloadFredBriefing,
  listFredBriefingTemplates, saveFredBriefingTemplate, previewFredBriefingSuccessor, saveFredBriefingSuccessor,
  getFredBriefingSuccessor, downloadFredBriefingSuccessor,
  listFredReleaseCaptures, getFredReleaseCapture, importFredReleaseCapture, acquireFredReleaseCapture,
  listFredReleaseWatches, saveFredReleaseWatch, previewFredReleasePlan, saveFredReleasePlan,
  getFredReleasePlan, downloadFredReleasePlan, acquireFredPlannedVintage } from './project.mjs';
import { startFredMerchant, readFredMerchant, prepareFredPurchase, executeFredPurchase,
  recoverFredPurchase, exportFredPurchase } from './merchant.mjs';
import { selectQcewPublication } from './qcew/project.mjs';
import { readQcewMerchant, startQcewMerchant } from './qcew/merchant.mjs';
import { prepareQcewPurchase, executeQcewPurchase, recoverQcewPurchase, exportQcewPurchase, listQcewPurchases,
  receiveQcewPurchase, readQcewPurchaseReceiving, exportQcewPurchaseReceiving } from './qcew/purchase.mjs';

const fredMerchantEngine = { read: readFredMerchant, start: startFredMerchant, prepare: prepareFredPurchase,
  execute: executeFredPurchase, recover: recoverFredPurchase, download: exportFredPurchase };
const countyMerchantEngine = { read: readQcewMerchant, start: startQcewMerchant, prepare: prepareQcewPurchase,
  execute: executeQcewPurchase, recover: recoverQcewPurchase, download: exportQcewPurchase };
async function selectEconomicPublication(directory, publicationId) {
  const state = await readFredProject(directory);
  const county = state.qcew?.publications?.some(item => item.id === publicationId);
  need(!(county && state.publications.some(item => item.id === publicationId)),
    'The original publication identity is ambiguous.', 'FRED_PUBLICATION_CONFLICT', 409);
  return county ? { kind: 'QCEW', directory: await selectQcewPublication(directory, publicationId), engine: countyMerchantEngine } :
    { kind: 'FRED', directory: await selectFredPublication(directory, publicationId), engine: fredMerchantEngine };
}


const securityHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
function send(res, status, value, contentType = 'application/json; charset=utf-8', filename) {
  const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value);
  res.writeHead(status, { ...securityHeaders, 'content-type': contentType, 'content-length': bytes.length,
    ...(filename ? { 'content-disposition': 'attachment; filename="' + filename + '"' } : {}) });
  res.end(bytes);
}
const sendJsonFile = (res, status, value, filename) =>
  sendFredJsonFile(res, status, value, { headers: securityHeaders, filename });
async function body(req, max = MAX_CAPTURE_BYTES * 2) {
  need(/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? ''), 'Use a JSON request.', 'FRED_JSON_REQUIRED', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; need(size <= max, 'Request exceeds its source capacity.', 'FRED_REQUEST_TOO_LARGE', 413); chunks.push(chunk); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { need(false, 'Request is not complete JSON.'); }
}
function pageNumber(value, max = 1000000) {
  need(value === null || /^\d+$/.test(value) && Number(value) <= max, 'Invalid page offset.');
  return Number(value ?? 0);
}
function recurringSelection(request) {
  return { templateId: request.templateId, captureId: request.captureId, anchorDate: request.anchorDate ?? null,
    baselineReviewId: request.baselineReviewId ?? null, previousSuccessorId: request.previousSuccessorId ?? null,
    note: request.note ?? '' };
}
function changesOnlyQuery(value) {
  need(value === null || value === '0' || value === '1', 'Choose a valid comparison filter.');
  return value !== '0';
}
function releasePlanSelection(request) {
  return { watchId: request.watchId, beforeCaptureId: request.beforeCaptureId ?? null, afterCaptureId: request.afterCaptureId };
}
function releasePageOptions(url) {
  const offset = pageNumber(url.searchParams.get('offset'));
  const limit = url.searchParams.has('limit') ? pageNumber(url.searchParams.get('limit'), 500) : 100;
  need(limit >= 1, 'Choose a release page size from 1 to 500.');
  return { section: url.searchParams.get('section'), offset, limit };
}
function output(value) {
  if (!value || typeof value !== 'object') return value;
  const { result, ...plain } = value;
  return plain;
}
export async function startFredWorkspace({ directory, port = 0, buyerConfig, environment = process.env,
  facilitator, allowLocalFacilitator = false, merchantPort = 0, expectedBindingSha256 } = {}) {
  const launch = await readFredWorkspaceLaunch({ directory, buyerConfig, facilitator,
    allowLocalFacilitator, merchantPort, expectedBindingSha256 });
  const binding = launch.binding;
  directory = binding.directory; facilitator = binding.facilitator ?? undefined;
  merchantPort = binding.merchantPort;
  need(Number.isInteger(port) && port >= 0 && port <= 65535, 'Use an available local port.');
  const token = randomBytes(32).toString('hex'), abort = new AbortController(), assetMap = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/briefing.js', ['briefing.js', 'text/javascript; charset=utf-8']],
    ['/recurring.js', ['recurring.js', 'text/javascript; charset=utf-8']],
    ['/releases.js', ['releases.js', 'text/javascript; charset=utf-8']],
    ['/ddp.js', ['ddp.js', 'text/javascript; charset=utf-8']],
    ['/alfred.js', ['alfred.js', 'text/javascript; charset=utf-8']],
    ['/source/model.mjs', ['../model.mjs', 'text/javascript; charset=utf-8']],
    ['/source/alfred/model.mjs', ['../alfred/model.mjs', 'text/javascript; charset=utf-8']],
    ['/source/ddp/csv.mjs', ['../ddp/csv.mjs', 'text/javascript; charset=utf-8']],
    ['/alfred-guide', ['../alfred/README.md', 'text/plain; charset=utf-8']],
    ['/ddp-guide', ['../ddp/PROJECT.md', 'text/plain; charset=utf-8']],
    ['/ddp-published.js', ['ddp-published.js', 'text/javascript; charset=utf-8']],
    ['/ddp-published-guide', ['../ddp/PUBLISHED-WORKSPACE.md', 'text/plain; charset=utf-8']],
    ['/qcew.js', ['qcew.js', 'text/javascript; charset=utf-8']],
    ['/customer-work.mjs', ['customer-work.mjs', 'text/javascript; charset=utf-8']],
    ['/qcew-guide', ['../qcew/WORKSPACE.md', 'text/plain; charset=utf-8']],
    ['/county-merchant-guide', ['../qcew/MERCHANT.md', 'text/plain; charset=utf-8']],
    ['/recurring-guide', ['../TEMPLATES.md', 'text/plain; charset=utf-8']] ]);
  const publishedHttp = createFredDdpPublicationHttp({ directory });
  const assets = new Map();
  for (const [route, [file, type]] of assetMap) assets.set(route, [await readFile(new URL('./ui/' + file, import.meta.url)), type]);
  const buyer = launch.buyerSettings ? await new Buyer(launch.buyerSettings).ready() : null;
  const instanceId = randomUUID(), startedAt = new Date().toISOString();
  const launchView = () => ({ schema: FRED_WORKSPACE_STARTUP, state: 'LISTENING', binding,
    instanceId, startedAt, buyerConfigured: Boolean(buyer) });
  let merchant = null, runningPublication = null, runningKind = null, pending = null, closing = false, origin;
  const runtimeView = () => merchant ? { publicationId: runningPublication, kind: runningKind, url: merchant.url, mode: merchant.mode,
    editionId: merchant.editionId, snapshot: merchant.snapshot, resource: merchant.resource } : null;
  const originalPurchase = async (request,selected) => {
    operationId(request.intentId);
    const purchase=await readPrivateJson(join(selected.directory,'customer-requests',request.intentId,'prepared.json'),131072);
    need(purchase.intentId===request.intentId,'The retained native customer intent changed.','FRED_PURCHASE_CHANGED',409);
    need(request.expectedPurchaseSha256===undefined || request.expectedPurchaseSha256===purchase.purchaseSha256,
      'Open the original prepared customer request.','FRED_PURCHASE_CHANGED',409);
    return purchase;
  };
  const run = async request => {
    const id = request.id, expectedRevision = request.expectedRevision, common = { directory, id, expectedRevision };
    if (FRED_DDP_ACTIONS.has(request.action))
      return runFredDdpAction({ request, directory, environment, signal: abort.signal });
    if (QCEW_WORKSPACE_ACTIONS.includes(request.action))
      return runQcewWorkspaceAction({ directory, projectId: binding.projectId, request, environment });
    switch (request.action) {
      case 'configure': return configureFredProject({ ...common, selection: request.selection });
      case 'capture': return acquireFredCapture({ ...common, environment, signal: abort.signal });
      case 'import': return importFredCapture({ ...common, capture: request.capture });
      case 'combine': return combineFredTables({ ...common, captureIds: request.captureIds });
      case 'select': return selectFredCapture({ ...common, captureId: request.captureId });
      case 'review': return reviewFredCapture({ ...common, captureId: request.captureId, policy: request.policy, note: request.note, briefing: request.briefing ?? null });
      case 'template-save': return saveFredBriefingTemplate({ ...common, reviewId: request.reviewId,
        name: request.name, window: request.window ?? {}, previousTemplateId: request.previousTemplateId ?? null });
      case 'successor-save': return saveFredBriefingSuccessor({ ...common, ...recurringSelection(request),
        previewId: request.previewId });
      case 'release-import': return importFredReleaseCapture({ ...common,
        capture: request.capture, releaseCaptureId: request.releaseCaptureId });
      case 'release-capture': return acquireFredReleaseCapture({ ...common, selection: request.selection,
        environment, signal: abort.signal });
      case 'release-watch-save': return saveFredReleaseWatch({ ...common, name: request.name, series: request.series,
        templateId: request.templateId ?? null, observationStart: request.observationStart,
        observationEnd: request.observationEnd ?? 'as_of', baselineAsOf: request.baselineAsOf,
        catchUp: request.catchUp ?? 'all_vintages', pageSize: request.pageSize, maxRows: request.maxRows });
      case 'release-plan-save': return saveFredReleasePlan({ ...common, ...releasePlanSelection(request),
        previewId: request.previewId });
      case 'release-vintage-capture': return acquireFredPlannedVintage({ ...common, planId: request.planId,
        asOf: request.asOf, environment, signal: abort.signal });
      case 'publish': return publishFredReview({ ...common, reviewId: request.reviewId, origin: request.origin, path: request.path, payment: request.payment });
      case 'abandon': return abandonFredOperation({ ...common, pendingId: request.pendingId });
      case 'merchant-start': {
        need(!merchant, 'Stop the currently owned merchant before selecting another publication.', 'FRED_MERCHANT_RUNNING', 409);
        const selected = await selectEconomicPublication(directory, request.publicationId);
        merchant = await selected.engine.start({ directory: selected.directory, port: merchantPort, facilitator, allowLocalFacilitator });
        runningPublication = request.publicationId; runningKind = selected.kind; return runtimeView();
      }
      case 'merchant-stop': {
        need(!merchant || request.publicationId === runningPublication, 'Choose the original running merchant.', 'FRED_MERCHANT_CHANGED', 409);
        if (merchant) await merchant.close();
        merchant = null; runningPublication = null; runningKind = null; return { state: 'STOPPED' };
      }
      case 'prepare': {
        const selected = await selectEconomicPublication(directory, request.publicationId);
        return selected.engine.prepare({ directory: selected.directory, intentId: request.intentId, query: new URLSearchParams(request.query ?? ''),
          file: request.file ?? null, previous: request.previous ?? null, acceptIndex: request.acceptIndex ?? 0 });
      }
      case 'buy': {
        need(buyer, 'Start this workspace with the existing buyer configuration.', 'FRED_BUYER_REQUIRED');
        const selected = await selectEconomicPublication(directory, request.publicationId);
        const purchase=await originalPurchase(request,selected);
        return output(await selected.engine.execute({ directory: selected.directory, buyer, purchase, signal: abort.signal }));
      }
      case 'recover': {
        need(buyer, 'Start this workspace with the existing buyer configuration.', 'FRED_BUYER_REQUIRED');
        const selected = await selectEconomicPublication(directory, request.publicationId);
        await originalPurchase(request,selected);
        return output(await selected.engine.recover({ directory: selected.directory, buyer, intentId: request.intentId }));
      }
      case 'receive-county-purchase': {
        need(buyer, 'Start this workspace with the original configured buyer.', 'FRED_BUYER_REQUIRED');
        const selected = await selectEconomicPublication(directory, request.publicationId);
        need(selected.kind === 'QCEW', 'Choose the original county-report publication.');
        await originalPurchase(request,selected);
        return receiveQcewPurchase({ directory: selected.directory, buyer, intentId: request.intentId,
          receivingDirectory: request.receivingDirectory ?? null });
      }
      default: need(false, 'Unknown economic workspace action.');
    }
  };
  const execute = async request => {
    need(request && typeof request === 'object' && !Array.isArray(request) && typeof request.action === 'string',
      'Select a workspace action.');
      need(request.projectId===undefined || request.projectId===binding.projectId,
        'Continue this request in its original economic project.','FRED_WORKSPACE_BINDING_CHANGED',409);
      need((await readFredProject(directory)).id===binding.projectId,
        'The original project directory changed before dispatch.','FRED_WORKSPACE_BINDING_CHANGED',409);
    need(!pending, 'The original workspace action is still running; read its state.', 'FRED_WORKSPACE_BUSY', 409);
    if (request.action === 'ddp-published-run') {
      let retained, rejected;
      const ready = new Promise((accept, reject) => { retained = accept; rejected = reject; });
      const task = runFredDdpPublicationOperation({ directory, id: request.id, expectedRevision: request.expectedRevision,
        migrationId: request.migrationId, signal: abort.signal, onRetained: retained });
      const owned = { action: request.action, task }; pending = owned;
      task.catch(rejected).finally(() => { if (pending === owned) pending = null; });
      return ready;
    }
    const task = run(request); pending = { action: request.action, task };
    try { return await task; } finally { pending = null; }
  };
  const server = createServer((req, res) => {
    const handler = async () => {
      need(req.headers.host === new URL(origin).host && (!req.headers.origin || req.headers.origin === origin),
        'Use this workspace’s private local origin.', 'FRED_LOCAL_ORIGIN_REQUIRED', 403);
      const url = new URL(req.url, origin);
      const asset = assets.get(url.pathname);
      if (req.method === 'GET' && asset && !url.search) return send(res, 200, asset[0], asset[1]);
      if (!closing && await publishedHttp.ticket(req, res, url)) return;
      const supplied = req.headers.authorization, expected = 'Bearer ' + token;
      need(typeof supplied === 'string' && supplied.length === expected.length &&
        timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)), 'Use the original workspace session.', 'FRED_SESSION_REQUIRED', 403);
      need(!closing, 'The workspace is closing.', 'FRED_WORKSPACE_CLOSING', 503);
      const selectedProject=req.headers['x-fred-project-id'];
      need(selectedProject===undefined || selectedProject===binding.projectId,
        'Use the original selected economic project.','FRED_WORKSPACE_BINDING_CHANGED',409);
      need((await readFredProject(directory)).id===binding.projectId,
        'The original project directory changed.','FRED_WORKSPACE_BINDING_CHANGED',409);
      res.setHeader('x-fred-project-id',binding.projectId);
      if (req.method === 'GET' && url.pathname === '/api/launch') {
        need((await readFredProject(directory)).id === binding.projectId,
          'The original project directory changed.', 'FRED_WORKSPACE_BINDING_CHANGED', 409);
        return send(res, 200, launchView());
      }
      if (req.method === 'GET' && url.pathname === '/api/state')
        return send(res, 200, { project: await fredProjectView(directory),
          workspace:{projectId:binding.projectId,directory}, merchant: runtimeView(),
          busy: pending?.action ?? null, buyerConfigured: Boolean(buyer) });
      if (req.method === 'GET' && url.pathname.startsWith('/api/qcew/')) {
        const result = await readQcewWorkspace({ directory, projectId: binding.projectId, url, environment });
        return send(res, 200, result.value, result.contentType, result.filename);
      }
      if (req.method === 'GET' && url.pathname === '/api/observations') {
        const capture = await getFredCapture(directory, url.searchParams.get('capture')), model = inspectCapture(capture);
        const series = url.searchParams.get('series') ?? '', offset = pageNumber(url.searchParams.get('offset'));
        const rows = series ? model.rows.filter(row => row.series === series) : model.rows;
        return send(res, 200, { captureId: capture.captureSha256, series: model.series, total: rows.length,
          offset, limit: 100, rows: rows.slice(offset, offset + 100) });
      }
      if (req.method === 'GET' && url.pathname === '/api/source')
        return send(res, 200, await getFredCapture(directory, url.searchParams.get('capture')), 'application/json', 'fred-original-capture.json');
      if (req.method === 'GET' && url.pathname === '/api/compare') {
        const report = await compareFredCaptures({ directory, before: url.searchParams.get('before'), after: url.searchParams.get('after') });
        if (url.searchParams.get('download') === '1') return send(res, 200, report, 'application/json', 'fred-vintage-comparison.json');
        const offset = pageNumber(url.searchParams.get('offset')), { changes, ...summary } = report;
        return send(res, 200, { ...summary, total: changes.length, offset, limit: 100, changes: changes.slice(offset, offset + 100) });
      }
      if (req.method === 'POST' && url.pathname === '/api/briefing-preview') {
        const request = await body(req, 65536);
        return send(res, 200, await previewFredBriefing({ directory, captureId: request.captureId,
          briefing: request.briefing, offset: request.offset ?? 0, limit: 100 }));
      }
      if (req.method === 'GET' && url.pathname === '/api/briefing') {
        const reviewId = url.searchParams.get('review'), format = url.searchParams.get('format');
        if (format !== null) {
          const file = await downloadFredBriefing({ directory, reviewId, format });
          return send(res, 200, file.body, file.contentType, file.path);
        }
        const value = await getFredBriefing(directory, reviewId);
        const bytes = jsonBytes(value.manifest);
        return send(res, 200, { ...pageFredBriefing(value.report, { offset: pageNumber(url.searchParams.get('offset')), limit: 100 }),
          manifest: value.manifest, files: [...value.manifest.files, { path: 'briefing-manifest.json', bytes: bytes.length,
            sha256: hash(bytes), contentType: 'application/json', role: 'BRIEFING_MANIFEST' }] });
      }
      if (req.method === 'GET' && url.pathname === '/api/release-captures')
        return send(res, 200, await listFredReleaseCaptures({ directory }));
      if (req.method === 'GET' && url.pathname === '/api/release-watches')
        return send(res, 200, await listFredReleaseWatches({ directory }));
      if (req.method === 'GET' && url.pathname === '/api/release-capture') {
        const releaseCaptureId = url.searchParams.get('capture');
        const capture = await getFredReleaseCapture({ directory, releaseCaptureId });
        if (url.searchParams.get('download') === '1')
          return send(res, 200, capture, 'application/json; charset=utf-8', 'fred-release-capture.json');
        const model = inspectFredReleaseCapture(capture), page = releasePageOptions(url), section = page.section ?? 'series';
        need(['series', 'releases', 'calendar', 'vintages'].includes(section), 'Choose a release source table.');
        const all = model[section];
        need(page.offset <= all.length, 'Choose an offset inside the retained release source table.');
        const project = await readFredProject(directory), items = all.slice(page.offset, page.offset + page.limit);
        return send(res, 200, { projectId: project.id, revision: project.revision, releaseCaptureId,
          selection: model.selection, source: model.source,
          counts: { series: model.series.length, releases: model.releases.length,
            calendar: model.calendar.length, vintages: model.vintages.length },
          section, total: all.length, offset: page.offset, limit: page.limit,
          nextOffset: page.offset + items.length < all.length ? page.offset + items.length : null, items });
      }
      if (req.method === 'POST' && url.pathname === '/api/release-plan-preview') {
        const request = await body(req, 65536), offset = request.offset ?? 0, limit = request.limit ?? 100;
        need(Number.isInteger(offset) && offset >= 0 && offset <= 1000000, 'Choose a valid release page offset.');
        need(Number.isInteger(limit) && limit >= 1 && limit <= 500, 'Choose a release page size from 1 to 500.');
        return send(res, 200, await previewFredReleasePlan({ directory, ...releasePlanSelection(request),
          section: request.section ?? 'acquisitions', offset, limit }));
      }
      if (req.method === 'GET' && url.pathname === '/api/release-plan') {
        const planId = url.searchParams.get('plan');
        if (url.searchParams.get('download') === '1') {
          const file = await downloadFredReleasePlan({ directory, planId });
          return send(res, 200, file.body, file.contentType, file.path);
        }
        const page = releasePageOptions(url);
        return send(res, 200, await getFredReleasePlan({ directory, planId,
          ...page, section: page.section ?? 'acquisitions' }));
      }
      if (req.method === 'GET' && url.pathname === '/api/briefing-templates')
        return send(res, 200, await listFredBriefingTemplates({ directory }));
      if (req.method === 'POST' && url.pathname === '/api/briefing-successor-preview') {
        const request = await body(req, 65536);
        return send(res, 200, await previewFredBriefingSuccessor({ directory, ...recurringSelection(request),
          offset: request.offset ?? 0, limit: request.limit ?? 100, changesOnly: request.changesOnly ?? true }));
      }
      if (req.method === 'GET' && url.pathname === '/api/briefing-successor') {
        const successorId = url.searchParams.get('successor'), format = url.searchParams.get('format');
        if (format !== null) {
          const file = await downloadFredBriefingSuccessor({ directory, successorId, format });
          return send(res, 200, file.body, file.contentType, file.path);
        }
        return send(res, 200, await getFredBriefingSuccessor({ directory, successorId,
          offset: pageNumber(url.searchParams.get('offset')),
          limit: url.searchParams.has('limit') ? pageNumber(url.searchParams.get('limit'), 500) : 100,
          changesOnly: changesOnlyQuery(url.searchParams.get('changesOnly')) }));
      }
      if (req.method === 'GET' && url.pathname === '/api/bundle')
        return sendJsonFile(res, 200, await exportFredProject({ directory }), 'fred-economic-project.json');
      if (req.method === 'GET' && url.pathname === '/api/publication') {
        const selected = await selectEconomicPublication(directory, url.searchParams.get('publication'));
        const merchant = await selected.engine.read(selected.directory), { edition, plan, offers } = merchant;
        if (selected.kind === 'QCEW') return send(res, 200, { kind: selected.kind, edition, plan, offers,
          requests: await listQcewPurchases(selected.directory, { merchant }) });
        const names = await readdir(join(selected.directory, 'customer-requests')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
        const requests = [];
        for (const name of names) {
          if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(name)) continue;
          let saved;
          try { saved = await readPrivateJson(join(selected.directory, 'customer-requests', name, 'prepared.json'), 131072); }
          catch (error) { if (error.code === 'ENOENT') continue; throw error; }
          requests.push({ intentId: saved.intentId, url: saved.url, file: saved.file, purchaseSha256: saved.purchaseSha256 });
        }
        const { directory: privateDirectory, ...publicEdition } = edition;
        return send(res, 200, { kind: selected.kind, edition: publicEdition, plan, offers, requests });
      }
      if (req.method === 'GET' && url.pathname === '/api/preview') {
        const selected = await selectFredPublication(directory, url.searchParams.get('publication'));
        const { edition } = await readFredMerchant(selected), dataset = await loadDatasetConfig(join(selected, 'dataset.json'));
        const query = new URLSearchParams(url.searchParams.get('query') ?? '');
        need(!query.has('snapshot') || query.get('snapshot') === edition.snapshot, 'Keep the original edition snapshot.');
        query.delete('snapshot');
        const context = { query }, admission = dataset.admit(context), result = admission === true ? dataset.handle(context) : admission;
        return send(res, result.status, { mode: 'ORIGINAL_DATASET_PREVIEW', ...result.body });
      }
      if (req.method === 'GET' && url.pathname === '/api/customer-request') {
        const selected=await selectEconomicPublication(directory,url.searchParams.get('publication'));
        const purchase=await originalPurchase({intentId:url.searchParams.get('intent')},selected);
        return send(res,200,{projectId:binding.projectId,kind:selected.kind,purchase});
      }
      if (req.method === 'GET' && url.pathname === '/api/customer-download') {
        need(buyer, 'Start the workspace with the original buyer configuration.');
        const selected = await selectEconomicPublication(directory, url.searchParams.get('publication'));
        const result = await selected.engine.download({ directory: selected.directory, buyer, intentId: url.searchParams.get('intent') });
        return send(res, 200, result.bytes, result.contentType, result.filename);
      }
      if (await publishedHttp.handle({ req, res, url, body, send })) return;
      if (await handleFredDdpHttp({ req, res, url, directory, body, send, sendJsonFile, execute, busy: () => Boolean(pending) })) return;
      if (req.method === 'GET' && url.pathname === '/api/customer-received') {
        const selected = await selectEconomicPublication(directory, url.searchParams.get('publication'));
        need(selected.kind === 'QCEW', 'Choose the original county-report purchase.');
        const intentId = url.searchParams.get('intent'), file = url.searchParams.get('file');
        if (file !== null) {
          const result = await exportQcewPurchaseReceiving({ directory: selected.directory, intentId,
            file, editionId: url.searchParams.get('edition') });
          return send(res, 200, result.bytes, result.contentType, result.filename);
        }
        const received = await readQcewPurchaseReceiving({ directory: selected.directory, intentId });
        return send(res, 200, { receipt: received.receipt, directory: received.directory,
          editions: received.editions.map(item => ({ manifest: item.manifest,
            title: item.report.profile.definition.title, period: item.report.period })) });
      }
      if (req.method === 'POST' && ['/api/action', '/api/qcew/action'].includes(url.pathname)) {
        const countyAction = url.pathname === '/api/qcew/action';
        const request = await body(req, countyAction ? QCEW_WORKSPACE_REQUEST_BYTES : Math.max(MAX_DDP_CAPTURE_BYTES, MAX_CAPTURE_BYTES * 2));
        need(countyAction || FRED_DDP_ACTIONS.has(request?.action) || jsonBytes(request).length <= MAX_CAPTURE_BYTES * 2,
          'Request exceeds its original source capacity.', 'FRED_REQUEST_TOO_LARGE', 413);
        need(!countyAction || QCEW_WORKSPACE_ACTIONS.includes(request?.action), 'Choose a county report action.');
        return send(res, 200, await execute(request));
      }
      return send(res, 404, { code: 'FRED_ROUTE_NOT_FOUND', message: 'Workspace route not found.' });
    };
    handler().catch(error => {
      if (res.headersSent) { res.destroy(error); return; }
      if (!res.writableEnded && !res.destroyed) send(res, Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 400,
        { code: typeof error.code === 'string' ? error.code : 'FRED_OPERATION_FAILED', message: error.message,
          ...(error.retryAt ? { retryAt: error.retryAt } : {}) });
    });
  });
  server.headersTimeout = 10000; server.requestTimeout = 120000; server.keepAliveTimeout = 1000;
  await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
  origin = new URL('http://127.0.0.1:' + server.address().port).origin;
  let closePromise;
  return { server, directory, url: origin + '/#' + token, origin,
    startup: { ...launchView(), url: origin + '/#' + token }, close: () => closePromise ??= (async () => {
    closing = true; publishedHttp.close(); abort.abort();
    await pending?.task.catch(() => {});
    try { if (merchant) await merchant.close(); }
    finally { merchant = null; runningPublication = null; runningKind = null;
      await new Promise((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeIdleConnections?.(); }); }
  })() };
}
