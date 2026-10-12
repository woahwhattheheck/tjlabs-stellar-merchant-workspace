// MIT. Typed companion for the original local preparation operator service.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';

export class PreparationClient {
  constructor(origin, { fetchImpl = globalThis.fetch } = {}) {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/')
      throw new TypeError('Use the original loopback preparation server origin');
    this.origin = url.origin; this.fetchImpl = fetchImpl;
  }
  async request(path, { signal, ...options } = {}) {
    const response = await this.fetchImpl(this.origin + path, { ...options, signal });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error ?? `Preparation HTTP ${response.status}`), { status: response.status });
    return result;
  }
  post(path, value, options = {}) {
    return this.request(path, { ...options, method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Preparation-Request': '1' }, body: JSON.stringify(value) });
  }
  state(options) { return this.request('/api/state', options); }
  sourcePage(id, { offset = 0, limit = 100, ...options } = {}) { return this.request('/api/source?' + new URLSearchParams({ id, offset, limit }), options); }
  resultPage(id, { offset = 0, limit = 100, ...options } = {}) { return this.request('/api/result?' + new URLSearchParams({ id, offset, limit }), options); }
  async importFile(file, { alias, format = 'csv', label = basename(file), nullToken, signal } = {}) {
    const info = await stat(file);
    if (!info.isFile()) throw new TypeError('Input must be a regular file');
    const params = new URLSearchParams({ alias, format, label, filename: basename(file) });
    if (nullToken !== undefined) params.set('nullToken', nullToken);
    return this.request('/api/import?' + params, { method: 'POST', headers: {
      'Content-Type': 'application/octet-stream', 'Content-Length': String(info.size), 'X-Preparation-Request': '1'
    }, body: createReadStream(file), duplex: 'half', signal });
  }
  saveRecipe(recipe, options) { return this.post('/api/recipe', recipe, options); }
  run(recipeId, revision, options) { return this.post('/api/run', { recipe_id: recipeId, revision }, options); }
  start(runId, options) { return this.post('/api/start', { run_id: runId }, options); }
  rerun(runId, options) { return this.post('/api/rerun', { run_id: runId }, options); }
  cancel(runId, options) { return this.post('/api/cancel', { run_id: runId }, options); }
  recover(options) { return this.post('/api/recover', {}, options); }
  review(review, options) { return this.post('/api/review', review, options); }
  exportWorkspace(options) { return this.post('/api/export', {}, options); }
  merchant(runId, options) { return this.post('/api/merchant', { run_id: runId }, options); }
  report(runId, options) { return this.post('/api/report', { run_id: runId }, options); }
  resultURL(runId, file = 'result.jsonl') {
    if (!['result.csv','result.jsonl','schema.json'].includes(file)) throw new TypeError('Unknown result download');
    return this.origin + '/api/file?' + new URLSearchParams({ id: runId, file });
  }
  downloadURL(relative) {
    if (!/^\/downloads\/[a-f0-9]{32}\.(zip|html)$/.test(relative)) throw new TypeError('Unknown prepared download');
    return this.origin + relative;
  }
  async *resultRows(runId, { pageSize = 200, signal } = {}) {
    let offset = 0;
    do {
      const page = await this.resultPage(runId, { offset, limit: pageSize, signal });
      for (const values of page.rows) yield Object.fromEntries(page.columns.map((column, i) => [column, values[i]]));
      offset = page.nextOffset;
    } while (offset !== null);
  }
}
