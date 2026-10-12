// MIT. Complete selected comparison files; original data and shared pair pages use hard links.
import { constants } from 'node:fs';
import { open, mkdir, lstat, realpath, link, rm, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { digest, plain } from './store.mjs';
import { readComparison, comparisonRelativeFile } from './comparison.mjs';

const PACKET = 'stellar-forge.graphql-comparison-files.v1';
const SHA = /^[a-f0-9]{64}$/;
const MAX_FILE = 8 * 1024 * 1024;
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const style = 'body{font:15px/1.5 system-ui,sans-serif;color:#17191b;background:#f5f6f7;margin:0}main{max-width:1360px;margin:auto;padding:28px}h1{font-size:28px}h2{font-size:21px;margin-top:30px}a{color:#172b43}button,select,input{font:inherit;padding:8px;border:1px solid #8d9298;background:white;color:#17191b;border-radius:3px}button{cursor:pointer}button:disabled{color:#72777d}button:focus-visible,a:focus-visible{outline:3px solid #17191b;outline-offset:3px}.panel{background:white;padding:18px;border:1px solid #c4c8cc;margin:16px 0;border-radius:4px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;vertical-align:top;padding:10px;border:1px solid #d3d6d9;overflow-wrap:anywhere}th{background:#e9ebee}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.45 ui-monospace,monospace}code{overflow-wrap:anywhere}summary{cursor:pointer}p,li{overflow-wrap:anywhere}.bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.muted{color:#4e555c}@media(max-width:760px){main{padding:14px}.grid{grid-template-columns:minmax(0,1fr)}}';
const shell = (title, body, script = '') => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'unsafe-inline\';style-src \'unsafe-inline\';connect-src \'none\';img-src \'none\';base-uri \'none\';form-action \'none\'">'
  + '<title>' + escape(title) + '</title><style>' + style + '</style></head><body><main>' + body + '</main>' + script + '</body></html>\n';
function indexPage(value) {
  const record = value.record, review = record.review;
  const rows = record.definition.pairs.map(pair => {
    const result = record.analysis.find(row => row.pairId === pair.id), decision = review.decisions.find(row => row.pairId === pair.id);
    return '<tr><td><a href="pairs/' + pair.id + '.html">' + escape(pair.title) + '</a><br><code>' + escape(pair.id) + '</code></td>'
      + '<td>' + result.baseline.status + ' / ' + result.candidate.status + '</td><td>'
      + (result.response.jsonEquivalent === null ? 'Raw responses retained; structured comparison unavailable'
        : result.response.jsonEquivalent ? 'Equivalent JSON values' : result.response.changes.total + ' value changes')
      + '</td><td>' + escape(decision.decision) + '<pre>' + escape(decision.notes) + '</pre></td></tr>';
  }).join('');
  return shell(record.definition.title, '<p><strong>GraphQL response review</strong> · retained source only</p><h1>' + escape(record.definition.title)
    + '</h1><p>Project <code>' + escape(record.project) + '</code> · comparison <code>' + record.id + '</code> · review generation '
    + record.generation + '</p><p>Record SHA-256 <code>' + value.sha256 + '</code></p><section class="panel"><h2>Selected reviewer decision</h2><p>Reviewer label: '
    + escape(review.reviewer || 'Not yet reviewed') + '</p><pre>' + escape(review.notes) + '</pre><p>Saved '
    + escape(record.updatedAt) + '. This is a recorded review decision; it does not start a deployment or contact a service.</p></section>'
    + '<div class="scroll"><table><thead><tr><th>Selected case</th><th>HTTP baseline / candidate</th><th>Original response comparison</th><th>Decision and notes</th></tr></thead><tbody>'
    + rows + '</tbody></table></div><section class="panel"><h2>Open the source and history</h2><p><a href="comparison.json">Complete selected comparison and request</a></p><ul>'
    + value.records.slice(0, -1).map(item => '<li><a href="history/' + item.record.generation + '.json">Original review generation '
      + item.record.generation + '</a> · ' + escape(item.record.updatedAt) + '</li>').join('')
    + '</ul><p>Each case page contains both original preview records, complete requests, response bytes, source identities and every JSON value difference. '
    + 'Its original schema/query/plan draft files are included beside the saved previews. The selected reviewer decisions are in this index and comparison.json.</p>'
    + '<p>Object member order and decimal number formatting are ignored when comparing JSON values. Array positions remain significant. Missing and null differ. '
    + 'Non-JSON responses remain available as their original bytes. Original preview timestamp intervals include preparation, transport and retention work; they establish no causal performance improvement.</p>'
    + '<p>This packet opens without a server. Continue editing reviews by receiving the complete original project handover in the GraphQL workspace; the comparison packet is an independent read-only delivery.</p></section>');
}

const offline = String.raw`const packet = JSON.parse(document.getElementById('packet').textContent);
const byId = id => document.getElementById(id);
const node = (tag, text) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; return value; };
const rawBytes = value => Uint8Array.from(atob(value.responseBase64), char => char.charCodeAt(0));
const parse = value => { try { return parseResponse(new TextDecoder('utf-8', { fatal: true }).decode(rawBytes(value))); } catch { return parseResponse(null); } };
const sides = { baseline: parse(packet.baseline), candidate: parse(packet.candidate) };
let offset = 0, next = null;
function download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob(Array.isArray(bytes) ? bytes : [bytes], { type }));
  const a = node('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
for (const side of ['baseline', 'candidate']) {
  const original = packet[side], box = byId(side);
  box.append(node('h2', side === 'baseline' ? 'Baseline' : 'Candidate'));
  box.append(node('p', 'Preview ' + original.id + ' · operation ' + original.operation + ' · HTTP ' + original.status));
  box.append(node('pre', JSON.stringify({ source: original.source, requestSha256: original.requestSha256,
    responseSha256: original.responseSha256, responseBytes: original.responseBytes, draftRevision: original.draftRevision,
    inputDigest: original.inputDigest, createdAt: original.createdAt, completedAt: original.completedAt }, null, 2)));
  const draft = node('a', 'Open original schema/query/plan draft revision ' + original.draftRevision);
  draft.href = '../drafts/' + original.draftRevision + '.json'; box.append(draft);
  const request = node('details'); request.append(node('summary', 'Complete original query and variables'), node('pre', JSON.stringify(original.request, null, 2)));
  box.append(request);
  const raw = node('button', 'Download exact response bytes');
  raw.onclick = () => download(original.id + '-response.bin', rawBytes(original), original.responseType || 'application/octet-stream');
  box.append(raw);
}
function show() {
  const page = responseChangePage(sides.baseline, sides.candidate, { offset, limit: 50 });
  byId('rows').replaceChildren();
  if (!page.structured) {
    byId('position').textContent = 'Structured comparison unavailable. Baseline: ' + (page.baselineError || 'JSON parsed')
      + '; candidate: ' + (page.candidateError || 'JSON parsed') + '. Exact responses remain downloadable.';
  } else {
    for (const row of page.items) {
      const tr = node('tr'), path = node('td'), open = node('button', row.path || '(root)');
      open.onclick = () => {
        for (const exact of responseChanges(sides.baseline.value, sides.candidate.value)) {
          if (exact.path !== row.path) continue;
          byId('value-title').textContent = 'Complete returned values: ' + (row.path || '(root)');
          byId('value-baseline').textContent = [...valueJsonChunks(exact.baseline)].join('');
          byId('value-candidate').textContent = [...valueJsonChunks(exact.candidate)].join('');
          byId('value-panel').hidden = false; break;
        }
      };
      path.append(open); tr.append(path, node('td', row.change));
      for (const side of ['baseline', 'candidate']) {
        const td = node('td'); td.append(node('p', row[side].type), node('pre', row[side].text + (row[side].truncated ? '…' : ''))); tr.append(td);
      }
      byId('rows').append(tr);
    }
    byId('position').textContent = page.items.length ? 'Differences ' + (offset + 1) + '–' + (offset + page.items.length)
      + ' of ' + packet.analysis.response.changes.total : 'No differences in the returned JSON values.';
  }
  next = page.nextOffset; byId('next').disabled = next === null; byId('previous').disabled = offset === 0;
}
byId('next').onclick = () => { if (next !== null) { offset = next; show(); } };
byId('previous').onclick = () => { offset = Math.max(0, offset - 50); show(); };
byId('all-changes').onclick = () => {
  if (!sides.baseline.structured || !sides.candidate.structured) return;
  const chunks = [];
  for (const row of responseChanges(sides.baseline.value, sides.candidate.value)) chunks.push(JSON.stringify(changeDisplay(row)) + '\n');
  download(packet.pair.id + '-changes.jsonl', chunks, 'application/x-ndjson');
};
show();
`;
function pairPage(record, pair, baseline, candidate, valuesSource) {
  const analysis = record.analysis.find(row => row.pairId === pair.id);
  const packet = { comparisonId: record.id, definitionSha256: record.definitionSha256, pair, analysis, baseline, candidate };
  const body = '<p><a href="../index.html">Selected comparison and reviewer decisions</a></p><h1>' + escape(pair.title)
    + '</h1><p>' + escape(pair.objective) + '</p><p>Comparison <code>' + record.id + '</code> · cohort <code>'
    + record.definitionSha256 + '</code></p><section class="panel"><h2>Source and result context</h2><pre>'
    + escape(JSON.stringify({ context: analysis.context, sameStatus: analysis.sameStatus,
      sameResponseBytes: analysis.sameResponseBytes, response: analysis.response, timing: analysis.timing }, null, 2))
    + '</pre><p>These are two actual retained observations. The timestamp interval includes preparation, transport and retention; it does not isolate service or database execution time.</p></section>'
    + '<div class="grid"><section id="baseline" class="panel"></section><section id="candidate" class="panel"></section></div>'
    + '<section class="panel"><h2>Every returned value difference</h2><p>JSON object order and numeric formatting are ignored. Array order is preserved. Duplicate object keys use their last value; original byte equality is reported separately. Open a field to view its complete returned values.</p>'
    + '<div class="bar"><button id="previous" type="button">Previous differences</button><button id="next" type="button">Next differences</button>'
    + '<button id="all-changes" type="button">Download all change locations</button><span id="position" role="status"></span></div>'
    + '<div class="scroll"><table><thead><tr><th>JSON pointer</th><th>Change</th><th>Baseline value</th><th>Candidate value</th></tr></thead><tbody id="rows"></tbody></table></div></section>'
    + '<section id="value-panel" class="panel" hidden><h2 id="value-title"></h2><div class="grid"><pre id="value-baseline"></pre><pre id="value-candidate"></pre></div></section>';
  const data = JSON.stringify(packet).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const script = '<script type="application/json" id="packet">' + data + '</script><script type="module">'
    + valuesSource.replace(/^export /gm, '') + offline + '</script>';
  return shell(pair.title, body, script);
}
function safeName(value) {
  if (typeof value !== 'string' || !value || /[\\\u0000-\u001f\u007f]/.test(value) || value.startsWith('/')
      || value.split('/').some(part => !part || part === '.' || part === '..')) fail('Invalid comparison file name.');
  return value;
}
async function directory(path, create = false) {
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.mode & 0o077 || await realpath(path) !== resolve(path)) fail('Comparison files require a private original directory.');
}
async function bytesAt(root, name, expected) {
  safeName(name); const path = join(root, name);
  if (await realpath(path) !== resolve(root, name)) fail('A comparison file left its retained directory.');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.mode & 0o077 || info.size > MAX_FILE) fail('Comparison files must be bounded private regular files.');
    const bytes = await file.readFile();
    if (bytes.length !== info.size || bytes.length > MAX_FILE || expected && (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256))
      fail('A retained comparison file changed from its original bytes.', 409);
    return bytes;
  } finally { await file.close(); }
}
async function put(root, name, bytes, original) {
  safeName(name); const path = join(root, name), parent = dirname(path);
  await directory(parent, true);
  const info = { name, bytes: bytes.length, sha256: digest(bytes) };
  if (bytes.length > MAX_FILE) fail('The complete comparison file exceeds the original transfer size limit.');
  const temporary = join(parent, '.' + randomUUID() + '.next');
  try {
    if (original) await link(original, temporary);
    else {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    }
    try { await link(temporary, path); }
    catch (error) { if (error.code !== 'EEXIST') throw error; await bytesAt(root, name, info); }
    const folder = await open(parent, 'r');
    try { await folder.sync(); } finally { await folder.close(); }
  } finally { await rm(temporary, { force: true }); }
  return info;
}
function validateIndex(value, selection, reference) {
  if (!plain(value) || value.schema !== PACKET || JSON.stringify(value.selection) !== JSON.stringify(selection) || !plain(value.source)
      || value.source.recordSha256 !== reference.recordSha256 || value.source.definitionSha256 !== reference.definitionSha256
      || !Array.isArray(value.files) || !value.files.length || value.files.length > 512) fail('The retained comparison packet has a different selection.');
  const names = new Set(); let total = 0;
  for (const row of value.files) {
    safeName(row.name);
    if (names.has(row.name) || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > MAX_FILE || !SHA.test(row.sha256 ?? ''))
      fail('The comparison packet file index is inconsistent.');
    names.add(row.name); total += row.bytes;
  }
  if (!names.has('comparison.json') || !names.has('index.html') || total > 256_000_000)
    fail('This complete comparison packet exceeds or omits part of its original transfer contract.');
  return value;
}
export async function describeResponseComparisonFiles(store, selection) {
  const saved = await store.read(selection.project, selection.revision);
  const reference = (saved.comparisons ?? []).find(row => row.id === selection.comparisonId);
  if (!reference) fail('Choose a response comparison retained in this project revision.', 404);
  const key = digest(json({ selection, recordSha256: reference.recordSha256, reportVersion: 1 }));
  const root = join(store.root, 'comparison-files', key); await directory(root, true);
  let index;
  try {
    const raw = await bytesAt(root, 'packet-index.json');
    index = validateIndex(JSON.parse(raw.toString('utf8')), selection, reference);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!index) {
    const value = await readComparison(store, reference), record = value.record;
    const valuesSource = await readFile(new URL('comparison-values.mjs', import.meta.url), 'utf8');
    const reportSource = await readFile(new URL('comparison-report.mjs', import.meta.url), 'utf8');
    const renderer = { version: 1, valuesSha256: digest(valuesSource), reportSha256: digest(reportSource) };
    const shared = join(store.root, 'comparison-pages', digest(json({ comparisonId: record.id, definitionSha256: record.definitionSha256, renderer })));
    await directory(shared, true);
    const files = new Map(), previews = new Map(), drafts = new Map();
    const rememberDraft = (revision, sha256) => {
      if (drafts.has(revision) && drafts.get(revision) !== sha256) fail('The selected comparison records disagree about one original draft.');
      drafts.set(revision, sha256);
    };
    const retain = async (name, relative, expectedSha256) => {
      const bytes = await bytesAt(store.root, relative);
      if (expectedSha256 && digest(bytes) !== expectedSha256) fail('The selected original comparison source changed.', 409);
      const info = await put(root, name, bytes, join(store.root, relative)); files.set(name, info); return bytes;
    };
    for (const item of value.records) {
      await retain(item.record.generation === record.generation ? 'comparison.json' : 'history/' + item.record.generation + '.json',
        comparisonRelativeFile(record.id, item.record.generation), item.sha256);
      rememberDraft(item.record.request.expectedRevision, item.record.admissionSha256);
    }
    for (const pair of record.definition.pairs) {
      const sideValues = [];
      for (const side of [pair.baseline, pair.candidate]) {
        if (!previews.has(side.id)) {
          const bytes = await retain('previews/' + side.id + '.json', 'previews/' + side.id + '.json', side.recordSha256);
          previews.set(side.id, JSON.parse(bytes.toString('utf8')));
        }
        rememberDraft(side.draftRevision, side.draftSha256); sideValues.push(previews.get(side.id));
      }
      const name = pair.id + '.html', html = Buffer.from(pairPage(record, pair, ...sideValues, valuesSource));
      await put(shared, name, html);
      files.set('pairs/' + name, await put(root, 'pairs/' + name, html, join(shared, name)));
    }
    for (const [revision, sha256] of drafts) await retain('drafts/' + revision + '.json',
      'projects/' + saved.id + '/' + revision + '.json', sha256);
    files.set('index.html', await put(root, 'index.html', Buffer.from(indexPage(value))));
    index = { schema: PACKET, selection,
      source: { comparisonId: record.id, generation: record.generation, definitionSha256: record.definitionSha256,
        recordSha256: value.sha256, cases: record.definition.pairs.length, review: reference.review, renderer },
      files: [...files.values()].sort((a, b) => a.name.localeCompare(b.name)) };
    validateIndex(index, selection, reference); await put(root, 'packet-index.json', json(index));
  }
  return { directory: root, source: index.source, loaders: new Map(index.files.map(file => [file.name, { file,
    load: () => bytesAt(root, file.name, file) }])) };
}
