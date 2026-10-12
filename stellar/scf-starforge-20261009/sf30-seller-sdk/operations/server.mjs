// MIT. Private operator listener; original traffic/history APIs remain read-only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { observeSellerTraffic, trafficCsv, trafficPrometheus } from './traffic.mjs';
import { createTrafficHistory, historyCsv } from './history.mjs';
import { createDeliveryReader, deliveryCsv, deliveryPrometheus } from './delivery-view.mjs';
import { createMerchantOperationDesk } from './merchant-operations.mjs';
import { createAvailabilityDesk } from '../availability/desk.mjs';
import { createDeliveryDesk } from './delivery-control.mjs';
import { createMerchantIncidentSource } from './delivery-incidents.mjs';
import { readSupplierQuotas, supplierQuotasCsv } from './supplier-quotas.mjs';

const HOST = '127.0.0.1';
const POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

export async function startSellerOperations(session, { port = 8424, recentLimit = 160, deliveryOutbox = null, navigationOrigin = null,
  historyDirectory, historyRetentionDays = 90, historyCheckpointMs = 5000, operationControls = false,
  deliveryControls = true, deliveryRecovery = null, deliveryWorkspaceDirectory = null,
  deliveryWorkspaceOptions = {}, incidentSource = null } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('operations port must be 0–65535');
  if (!Number.isInteger(historyCheckpointMs) || historyCheckpointMs < 1000 || historyCheckpointMs > 60000)
    throw new RangeError('history checkpoint interval must be 1000–60000 ms');
  if (navigationOrigin !== null && (typeof navigationOrigin !== 'string' ||
      !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(navigationOrigin) ||
      Number(new URL(navigationOrigin).port)>65535)) throw new TypeError('navigationOrigin must be an explicit loopback workspace origin');
  const merchantDesk = createMerchantOperationDesk(session.operationControl,{enabled:operationControls});
  const availabilityDesk = createAvailabilityDesk(session.availability);
  if(deliveryWorkspaceDirectory!==null && (!deliveryOutbox || deliveryRecovery!==null))
    throw new TypeError('The receiver workspace requires the same original outbox and its own recovery controller');
  let deliveryWorkspaceModel=null,deliveryWorkspaceHandler=null,operationsOrigin=null;
  const incidents=incidentSource===null?null:createMerchantIncidentSource(incidentSource,()=>({seller:session.url,ops:operationsOrigin}));
  const deliveryDesk = createDeliveryDesk(deliveryOutbox,{enabled:deliveryControls,
    recovery:deliveryWorkspaceDirectory===null?deliveryRecovery:input=>deliveryWorkspaceModel.recoverDelivery(input),
    incidents,receiverWorkspace:deliveryWorkspaceDirectory===null?null:'/delivery-workspace/'});
  const assets = new Map(await Promise.all([
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/fulfillment', 'delivery.html', 'text/html; charset=utf-8'],
    ['/merchant-operations', 'merchant-operations.html', 'text/html; charset=utf-8'],
    ['/merchant-operations-panel.mjs', 'merchant-operations-panel.mjs', 'text/javascript; charset=utf-8'],
    ['/merchant-operations.css', 'merchant-operations.css', 'text/css; charset=utf-8'],
    ['/availability', '../availability/index.html', 'text/html; charset=utf-8'],
    ['/availability/panel.mjs', '../availability/panel.mjs', 'text/javascript; charset=utf-8'],
    ['/availability/style.css', '../availability/style.css', 'text/css; charset=utf-8'],
    ['/supplier-quotas', 'supplier-quotas.html', 'text/html; charset=utf-8'],
    ['/supplier-quotas-panel.mjs', 'supplier-quotas-panel.mjs', 'text/javascript; charset=utf-8'],
    ['/supplier-quotas.mjs', 'supplier-quotas.mjs', 'text/javascript; charset=utf-8'],
    ['/supplier-quotas.css', 'supplier-quotas.css', 'text/css; charset=utf-8'],
    ['/console.mjs', 'console.mjs', 'text/javascript; charset=utf-8'],
    ['/delivery-panel.mjs', 'delivery-panel.mjs', 'text/javascript; charset=utf-8'],
    ['/delivery-incidents-panel.mjs', 'delivery-incidents-panel.mjs', 'text/javascript; charset=utf-8'],
    ['/delivery.css', 'delivery.css', 'text/css; charset=utf-8'],
    ['/recent.mjs', 'recent.mjs', 'text/javascript; charset=utf-8'],
    ['/style.css', 'style.css', 'text/css; charset=utf-8'],
  ].map(async ([path, file, type]) => [path, { type, bytes: await readFile(new URL(file, import.meta.url)) }])));
  // The SAME outbox used by the merchant's original native settlement decorator.
  const readDelivery = deliveryOutbox ? createDeliveryReader(deliveryOutbox) : null;
  const observer = observeSellerTraffic(session, { recentLimit });
  let history, checkpointTimer, checkpointPending, savedRevision;
  const revision = snapshot => [snapshot.totals.started, snapshot.totals.completed,
    snapshot.observerErrors, snapshot.ignoredMetadata, snapshot.attached,
    snapshot.capturedAt.slice(0, 10)].join(':');
  function checkpoint() {
    if (stopping || !history || checkpointPending) return checkpointPending;
    const current = observer.snapshot(), currentRevision = revision(current);
    // An idle service must not rewrite months of aggregate data every tick.
    // A UTC date change still triggers retention; failed saves keep retrying.
    if (currentRevision === savedRevision) return;
    checkpointPending = history.checkpoint(current).then(() => {
      savedRevision = currentRevision;
    }).catch(() => {
      // History.status exposes the failure. Storage cannot interrupt HTTP work.
    }).finally(() => { checkpointPending = null; });
    return checkpointPending;
  }
  const storage = () => history ? { enabled: true, checkpointIntervalMs: historyCheckpointMs,
    ...history.status() } : { enabled: false };
  const snapshot = () => ({ ...observer.snapshot(), usageHistory: storage(),
    ...(typeof session.upstreamSnapshot === 'function' ? { upstreams: session.upstreamSnapshot() } : {}) });
  let allowedHosts = new Set(), allowedOrigins = new Set();
  let stopping = false, closing, listenerStop, startupCleanup, finalSnapshot;
  const pending = new Set(), closedOwners = new Set();
  const server = createServer((req, res) => {
    const operation = handleRequest(req, res).catch(() => {
      if (res.destroyed || res.writableEnded) return;
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end('Snapshot unavailable');
    });
    pending.add(operation);
    operation.then(() => pending.delete(operation), () => pending.delete(operation));
  });
  async function handleRequest(req, res) {
    const reply = (code, type, data, extra = {}) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
      res.writeHead(code, { 'content-type': type, 'content-length': String(bytes.length),
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
        'content-security-policy': POLICY, 'referrer-policy': 'no-referrer',
        'cross-origin-resource-policy': 'same-origin', ...extra });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    };
    try {
      // An explicitly composed workspace may open HTML through a user click.
      // Cross-origin API/export reads retain the original operator-only policy.
      let referringOrigin = null;
      try { if (req.headers.referer) referringOrigin = new URL(req.headers.referer).origin; } catch {}
      const userNavigation = navigationOrigin !== null && referringOrigin === navigationOrigin &&
        req.method === 'GET' && ['/', '/fulfillment', '/merchant-operations', '/availability', '/supplier-quotas'].includes(req.url) &&
        req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document' &&
        req.headers['sec-fetch-user'] === '?1';
      // Binding loopback alone does not stop hostile DNS names / browser cross-origin access.
      if (!allowedHosts.has(req.headers.host) ||
          (!userNavigation && ((req.headers.origin && !allowedOrigins.has(req.headers.origin)) ||
          ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])))) {
        return reply(403, 'text/plain', 'Operator origin required');
      }
      if (stopping) return reply(503, 'text/plain', 'Operator is closing', { connection: 'close' });
      if(req.url==='/delivery-workspace' || req.url?.startsWith('/delivery-workspace/')) {
        if(!deliveryWorkspaceHandler)return reply(503,'application/json; charset=utf-8',JSON.stringify({error:'DELIVERY_WORKSPACE_UNAVAILABLE'}));
        return deliveryWorkspaceHandler(req,res).catch(()=>{
          if(!res.destroyed&&!res.headersSent)reply(503,'application/json; charset=utf-8',JSON.stringify({error:'DELIVERY_WORKSPACE_UNAVAILABLE'}));
        });
      }
      if (merchantDesk.accepts(req.url)) {
        return merchantDesk.dispatch(req,allowedOrigins).then(result => {
          if (!res.destroyed) reply(result.status,'application/json; charset=utf-8',JSON.stringify(result.body),result.headers);
        });
      }
      if (availabilityDesk.accepts(req.url)) {
        return availabilityDesk.dispatch(req,allowedOrigins).then(result => {
          if (!res.destroyed) reply(result.status,'application/json; charset=utf-8',JSON.stringify(result.body),result.headers);
        });
      }
      if (deliveryDesk.accepts(req.url)) {
        return deliveryDesk.dispatch(req,allowedOrigins).then(result => {
          if (!res.destroyed) reply(result.status,'application/json; charset=utf-8',JSON.stringify(result.body),result.headers);
        });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'text/plain', 'Read only', { allow: 'GET, HEAD' });
      if (req.url === '/api/snapshot' || req.url === '/export.json') {
        return reply(200, 'application/json; charset=utf-8', JSON.stringify(snapshot()),
          req.url === '/export.json' ? { 'content-disposition': 'attachment; filename="seller-traffic.json"' } : {});
      }
      if (req.url === '/api/upstreams') {
        if (typeof session.upstreamSnapshot !== 'function') return reply(404, 'text/plain', 'No upstream adapter attached');
        return reply(200, 'application/json; charset=utf-8', JSON.stringify(session.upstreamSnapshot()));
      }
      if (['/api/supplier-quotas', '/supplier-quotas.json', '/supplier-quotas.csv'].includes(req.url)) {
        // Each explicit read observes the same original shared-account ledger.
        return readSupplierQuotas(session).then(view => {
          if (res.destroyed) return;
          if (req.url === '/supplier-quotas.csv') return reply(200, 'text/csv; charset=utf-8',
            supplierQuotasCsv(view), { 'content-disposition': 'attachment; filename="supplier-accounts.csv"' });
          return reply(200, 'application/json; charset=utf-8', JSON.stringify(view),
            req.url === '/supplier-quotas.json'
              ? { 'content-disposition': 'attachment; filename="supplier-accounts.json"' } : {});
        }, () => {
          if (!res.destroyed) reply(503, 'application/json; charset=utf-8',
            JSON.stringify({ error: 'SUPPLIER_QUOTA_UNAVAILABLE' }));
        });
      }
      if (req.url === '/export.csv') return reply(200, 'text/csv; charset=utf-8', trafficCsv(observer.snapshot()),
        { 'content-disposition': 'attachment; filename="seller-traffic.csv"' });
      if (['/api/delivery', '/delivery.json', '/delivery.csv', '/delivery.metrics'].includes(req.url)) {
        if (!readDelivery) {
          if (req.url !== '/api/delivery') return reply(404, 'text/plain', 'Outbox not attached');
          return reply(200, 'application/json; charset=utf-8',
            JSON.stringify({ schema: 'stellar-forge.sf98.operator-delivery.v1', available: false }));
        }
        // The journal read happens only for explicit operator GET/HEAD requests.
        // Read failures never affect seller HTTP traffic or reveal private paths.
        return readDelivery({fresh:req.url === '/api/delivery'}).then(view => {
          if (res.destroyed) return;
          if (req.url === '/delivery.metrics') return reply(200,
            'text/plain; version=0.0.4; charset=utf-8', deliveryPrometheus(view));
          if (req.url === '/delivery.csv') return reply(200, 'text/csv; charset=utf-8', deliveryCsv(view),
            { 'content-disposition': 'attachment; filename="merchant-delivery-recent.csv"' });
          return reply(200, 'application/json; charset=utf-8', JSON.stringify(view),
            req.url === '/delivery.json'
              ? { 'content-disposition': 'attachment; filename="merchant-delivery.json"' } : {});
        }, () => {
          if (!res.destroyed) reply(503, 'application/json; charset=utf-8',
            JSON.stringify({ error: 'DELIVERY_JOURNAL_UNAVAILABLE' }));
        });
      }
      if (req.url === '/metrics') {
        const http = trafficPrometheus(observer.snapshot());
        if (!readDelivery) return reply(200, 'text/plain; version=0.0.4; charset=utf-8', http);
        return readDelivery().then(view => {
          if (!res.destroyed) reply(200, 'text/plain; version=0.0.4; charset=utf-8',
            http + deliveryPrometheus(view));
        }, () => {
          if (!res.destroyed) reply(200, 'text/plain; version=0.0.4; charset=utf-8',
            http + '\n# TYPE sf98_outbox_read_available gauge\nsf98_outbox_read_available 0\n');
        });
      }
      if (req.url?.startsWith('/api/history') || req.url?.startsWith('/history.csv') || req.url?.startsWith('/history.json')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (!['/api/history', '/history.csv', '/history.json'].includes(url.pathname))
          return reply(404, 'text/plain', 'Not found');
        if (!history) return reply(url.pathname === '/api/history' ? 200 : 409,
          'application/json; charset=utf-8', JSON.stringify({
            schema: 'stellar-forge.seller-usage-history.v1', enabled: false,
            message: 'Start with --history-dir to retain aggregate usage across restarts.' }));
        let report;
        try {
          const keys = [...url.searchParams.keys()];
          if (keys.length > 3 || new Set(keys).size !== keys.length ||
              keys.some(key => !['from', 'to', 'routeId'].includes(key))) throw new TypeError();
          report = { ...history.query(Object.fromEntries(url.searchParams)), enabled: true,
            storage: storage() };
        } catch { return reply(400, 'text/plain', 'Invalid history date range or route filter'); }
        if (url.pathname === '/history.csv') return reply(200, 'text/csv; charset=utf-8', historyCsv(report),
          { 'content-disposition': 'attachment; filename="seller-usage-history.csv"' });
        return reply(200, 'application/json; charset=utf-8', JSON.stringify(report),
          url.pathname === '/history.json' ? { 'content-disposition': 'attachment; filename="seller-usage-history.json"' } : {});
      }
      const asset = assets.get(req.url);
      if (asset) return reply(200, asset.type, asset.bytes);
      return reply(404, 'text/plain', 'Not found');
    } catch { return reply(500, 'text/plain', 'Snapshot unavailable'); }
  }
  server.requestTimeout = 10000; server.headersTimeout = 8000; server.keepAliveTimeout = 2000;
  function stopListener() {
    if (listenerStop) return listenerStop;
    // server.listening becomes false before accepted connections finish. Keep
    // the original callback promise across retries until that listener drains.
    listenerStop = new Promise((done, fail) => {
      server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? fail(error) : done());
    }).catch(error => { listenerStop = null; throw error; });
    server.closeIdleConnections?.();
    return listenerStop;
  }
  function close() {
    if (closing) return closing;
    stopping = true;
    clearInterval(checkpointTimer);
    closing = (async () => {
      const failures = [];
      const finish = async (name, operation) => {
        if (closedOwners.has(name)) return true;
        try { await operation(); closedOwners.add(name); return true; }
        catch (error) { failures.push(error); return false; }
      };
      const listener = finish('listener', stopListener);
      await finish('observer', () => {
        observer.detach();
        finalSnapshot = observer.snapshot();
      });
      const handlerClosed = await finish('workspace-handler', () => deliveryWorkspaceHandler?.close());
      const [, , deliveryClosed, requestsClosed] = await Promise.all([
        finish('merchant-desk', () => merchantDesk.close()),
        finish('availability-desk', () => availabilityDesk.close()),
        finish('delivery-desk', () => deliveryDesk.close()),
        finish('requests', () => Promise.allSettled([...pending])),
      ]);
      // Accepted operation and read-only HTTP work can use the same delivery
      // model even after its response disconnects. Drain those callers first.
      if (handlerClosed && deliveryClosed && requestsClosed)
        await finish('workspace-model', () => deliveryWorkspaceModel?.close());
      if (requestsClosed && closedOwners.has('observer'))
        await finish('history', async () => {
          await checkpointPending;
          await history?.close(finalSnapshot);
        });
      await finish('startup-cleanup', () => startupCleanup?.());
      await listener;
      if (failures.length) {
        const error = new AggregateError(failures, 'Original seller operations did not fully close',
          { cause: failures[0] });
        error.close = close;
        throw error;
      }
    })().catch(error => { closing = null; throw error; });
    return closing;
  }
  try {
    if (historyDirectory !== undefined) {
      history = await createTrafficHistory({ directory: historyDirectory, retentionDays: historyRetentionDays });
      const initial = observer.snapshot();
      await history.checkpoint(initial); savedRevision = revision(initial);
    }
    await new Promise((done, fail) => {
      const onError = error => { server.removeListener('listening', onListen); fail(error); };
      const onListen = () => { server.removeListener('error', onError); done(); };
      server.once('error', onError); server.once('listening', onListen); server.listen(port, HOST);
    });
    const assigned = server.address().port;
    allowedHosts = new Set([`${HOST}:${assigned}`, `localhost:${assigned}`]);
    allowedOrigins = new Set([...allowedHosts].map(host => `http://${host}`));
    if (history) checkpointTimer = setInterval(checkpoint, historyCheckpointMs).unref();
    const url = `http://${HOST}:${assigned}`;
    operationsOrigin=url;
    if(deliveryWorkspaceDirectory!==null) {
      const [{openDeliveryWorkspace},{createDeliveryWorkspaceHandler}]=await Promise.all([
        import('../../sf98-merchant-delivery/workspace-model.mjs'),
        import('../../sf98-merchant-delivery/workspace-server.mjs')]);
      deliveryWorkspaceModel=await openDeliveryWorkspace({directory:deliveryWorkspaceDirectory,
        outboxDirectory:deliveryOutbox.dir,deliveryOptions:deliveryWorkspaceOptions});
      deliveryWorkspaceHandler=await createDeliveryWorkspaceHandler({model:deliveryWorkspaceModel,
        origins:[...allowedOrigins],basePath:'/delivery-workspace'});
    }
    return { server, url, merchantOperationsUrl:url + '/merchant-operations',
      availabilityUrl:url + '/availability',
      supplierQuotasUrl:url + '/supplier-quotas',
      availabilityControlUrl:availabilityDesk.controlFragment ? url + '/availability#' + availabilityDesk.controlFragment : null,
      operationControlUrl:merchantDesk.controlFragment ? url + '/merchant-operations#' + merchantDesk.controlFragment : null,
      deliveryControlUrl:deliveryDesk.controlFragment ? url + '/fulfillment#' + deliveryDesk.controlFragment : null,
      deliveryWorkspace:deliveryWorkspaceModel,
      deliveryWorkspaceUrl:deliveryWorkspaceModel?url+'/delivery-workspace/':null,
      observer, history, close };
  } catch (error) {
    // An original child may retain its own partial-start owner for retry.
    if (typeof error.close === 'function' && error.close !== close) startupCleanup = error.close.bind(error);
    try { await close(); }
    catch (cleanupError) { error.cleanupError = cleanupError; error.close = close; }
    throw error;
  }
}

