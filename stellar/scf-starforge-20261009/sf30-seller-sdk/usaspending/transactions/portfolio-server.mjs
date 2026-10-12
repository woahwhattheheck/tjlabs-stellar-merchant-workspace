// MIT. Loopback workbench backed by the original workspace and review writer.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildPortfolio, viewPortfolio, portfolioCsv, portfolioBrief } from './portfolio.mjs';

export async function servePortfolio(workspace, {port = 0} = {}) {
  const token = randomBytes(32).toString('hex');
  const assets = new Map(await Promise.all([['/', 'portfolio.html','text/html; charset=utf-8'], ['/app.js','portfolio-web.js','text/javascript; charset=utf-8'], ['/style.css','portfolio.css','text/css; charset=utf-8']].map(async ([route, file, mime]) => [route, {bytes: await readFile(new URL(file, import.meta.url)), mime}])));
  let origin;
  const equal = value => typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(value), Buffer.from(token));
  const server = createServer(async (req, res) => {
    const send = (status, value, mime = 'application/json; charset=utf-8') => {
      res.writeHead(status, {'content-type': mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
      res.end(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value));
    };
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return send(403, {error: 'PORTFOLIO_ORIGIN_REJECTED'});
      const url = new URL(req.url, origin), asset = assets.get(url.pathname);
      if (asset && req.method === 'GET') return send(200, asset.bytes, asset.mime);
      if (!equal(req.headers['x-portfolio-token'])) return send(401, {error: 'PORTFOLIO_SESSION_REQUIRED'});
      const selected = url.searchParams.getAll('capture');
      let captureIds;
      if (selected.length) {
        const initial = buildPortfolio(workspace.transactions);
        const byAward = new Map(initial.members.map(m => [m.capture.awardKey, m.capture.captureId]));
        for (const id of selected) byAward.set(workspace.transactions.capture(id).award_key, id);
        captureIds = [...byAward.values()];
      }
      const options = {captureIds, includeReviews: url.searchParams.get('reviews') === 'true'};
      if (req.method === 'GET' && url.pathname === '/api/view') {
        const packet = buildPortfolio(workspace.transactions, {...options, includeReviews: true});
        const view = viewPortfolio(packet, Object.fromEntries(['search','agency','recipient','status'].map(k => [k, url.searchParams.get(k) ?? ''])));
        return send(200, {...view, reviews: packet.members.map(m => ({captureId: m.capture.captureId, review: m.capture.review ?? null}))});
      }
      if (req.method === 'GET' && url.pathname === '/api/export') {
        const internal = buildPortfolio(workspace.transactions, {...options, includeReviews: true});
        const filtered = viewPortfolio(internal, Object.fromEntries(['search','agency','recipient','status'].map(k => [k, url.searchParams.get(k) ?? ''])));
        if (!filtered.rows.length) return send(400, {error:'PORTFOLIO_NO_AWARDS_MATCH_FILTER'});
        const packet = buildPortfolio(workspace.transactions, {...options, captureIds: filtered.rows.map(r => r.captureId)}), format = url.searchParams.get('format') ?? 'json';
        if (!['json','csv','md'].includes(format)) return send(400, {error: 'PORTFOLIO_FORMAT_INVALID'});
        res.setHeader('content-disposition', 'attachment; filename="federal-award-portfolio.' + format + '"');
        return send(200, format === 'json' ? packet : format === 'csv' ? portfolioCsv(packet) : portfolioBrief(packet), format === 'csv' ? 'text/csv; charset=utf-8' : format === 'md' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8');
      }
      if (req.method === 'POST' && url.pathname === '/api/review') {
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(415, {error: 'PORTFOLIO_JSON_REQUIRED'});
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) return send(413, {error: 'PORTFOLIO_REQUEST_TOO_LARGE'}); chunks.push(chunk); }
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        // Explicit revision goes directly to the existing source-bound review writer.
        if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) return send(400, {error: 'PORTFOLIO_REVIEW_REVISION_REQUIRED'});
        return send(200, workspace.transactions.saveReview(input));
      }
      return send(404, {error: 'PORTFOLIO_ROUTE_NOT_FOUND'});
    } catch (error) { return send(Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 400, {error: error.code ?? 'PORTFOLIO_REQUEST_FAILED', message: error.message}); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  origin = 'http://127.0.0.1:' + server.address().port;
  let closed = false;
  return {origin, url: origin + '/#' + token, close: async () => { if (closed) return; closed = true; server.closeIdleConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); workspace.close(); }};
}
