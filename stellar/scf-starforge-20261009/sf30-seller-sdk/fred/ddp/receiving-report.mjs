// MIT. Versioned complete offline DDP receiving files; original data stays in the model.
import { canonical, clone, need } from '../model.mjs';
import { hash } from '../source.mjs';
import { validateFredDdpReceiving } from './receiving.mjs';

export const FRED_DDP_RECEIVING_RENDERER = 'FRED_DDP_RECEIVING_V1';
export const FRED_DDP_RECEIVING_FILE_LIMIT = 384 * 1024 * 1024;
export const FRED_DDP_RECEIVING_MEMBERS = Object.freeze([
  { path: 'ddp-receiving.json', contentType: 'application/json' },
  { path: 'ddp-receiving.csv', contentType: 'text/csv' },
  { path: 'ddp-receiving.html', contentType: 'text/html' }
]);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

// This self-contained V1 formatter also runs in the complete offline HTML.
// Keep its byte-producing behavior available when adding a later renderer.
function jsonTextV1(value) {
  if (Array.isArray(value)) return '[' + value.map(jsonTextV1).join(',') + ']';
  if (value && typeof value === 'object')
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + jsonTextV1(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function csvTextV1(receiving) {
  const stable = value => {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object')
      return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    return JSON.stringify(value);
  };
  const cell = value => {
    const text = value === undefined || value === null ? '' : typeof value === 'object' ? stable(value) : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const text = value => value?.label || value?.code || '';
  const meanings = new Map(receiving.meanings.map(item => [item.seriesId, item]));
  const headings = ['row_index', 'release', 'board_series_id', 'fred_series_id', 'package_series_id',
    'original_period', 'comparison_period', 'status', 'board_value', 'board_status', 'board_missing',
    'fred_observation_date', 'fred_value', 'fred_missing', 'raw_difference_fred_minus_board',
    'scaled_difference_fred_minus_board', 'board_units', 'board_multiplier', 'board_currency',
    'board_frequency', 'board_seasonal_adjustment', 'fred_units', 'fred_frequency', 'fred_seasonal_adjustment',
    'reviewed_period_rule', 'reviewed_board_scale', 'reviewed_fred_scale', 'meaning_compatible',
    'meaning_issues', 'original_board_observation', 'original_fred_observation', 'capture_id',
    'migration_plan_id', 'receiving_id', 'package_id', 'crosswalk_id'];
  const output = [headings.map(cell).join(',')];
  for (const row of receiving.rows) {
    const meaning = meanings.get(row.seriesId), before = row.source, after = row.target;
    output.push([row.index, row.release, row.boardSeriesId, row.fredSeriesId, row.seriesId,
      row.period, row.periodKey, row.status, before?.value, before?.status, before?.missing,
      after?.date, after?.value, after?.missing, row.rawDifference, row.difference,
      text(meaning?.source?.unit), text(meaning?.source?.multiplier), text(meaning?.source?.currency),
      text(meaning?.source?.frequency), text(meaning?.source?.seasonalAdjustment),
      meaning?.target?.units, meaning?.target?.frequency, meaning?.target?.seasonalAdjustment,
      meaning?.binding?.periodRule, meaning?.binding?.sourceScale, meaning?.binding?.targetScale,
      meaning?.compatible, meaning?.issues ?? [], before, after, after?.captureId,
      receiving.planId, receiving.id, receiving.packageId, receiving.crosswalkId].map(cell).join(','));
  }
  return output.join('\r\n') + '\r\n';
}
function offlineReaderV1() {
  'use strict';
  const data = JSON.parse(document.getElementById('receiving-data').textContent);
  const byId = id => document.getElementById(id);
  const series = byId('series'), status = byId('status'), query = byId('query'), changes = byId('changes');
  const body = byId('rows'), counts = byId('counts'), previous = byId('previous'), next = byId('next');
  const detail = byId('detail'), pageSize = 100, meanings = new Map(data.meanings.map(item => [item.seriesId, item]));
  const labels = new Map();
  for (const row of data.rows) if (!labels.has(row.seriesId))
    labels.set(row.seriesId, row.release + ' / ' + row.boardSeriesId + (row.fredSeriesId ? ' → ' + row.fredSeriesId : ''));
  for (const meaning of data.meanings) {
    const option = document.createElement('option'); option.value = meaning.seriesId;
    option.textContent = labels.get(meaning.seriesId) || meaning.source?.title || meaning.seriesId;
    series.append(option);
  }
  for (const name of Object.keys(data.summary.counts)) {
    const option = document.createElement('option'); option.value = name;
    option.textContent = name.replace(/_/g, ' ') + ' (' + data.summary.counts[name].toLocaleString() + ')'; status.append(option);
  }
  let offset = 0, filtered = data.rows;
  const display = value => value === null || value === undefined ? '—' : String(value);
  function show(row) {
    detail.textContent = JSON.stringify({ row, meaning: meanings.get(row.seriesId),
      source: data.source, planId: data.planId, packageId: data.packageId, crosswalkId: data.crosswalkId }, null, 2);
    byId('row-details').open = true;
  }
  function render() {
    body.replaceChildren();
    const selected = filtered.slice(offset, offset + pageSize);
    for (const row of selected) {
      const tr = document.createElement('tr');
      const values = [row.release + ' / ' + row.boardSeriesId, row.fredSeriesId, row.period,
        row.status.replace(/_/g, ' '), row.source?.value, row.target?.value, row.rawDifference, row.difference];
      values.forEach((value, index) => {
        const td = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) td.scope = 'row';
        td.textContent = display(value);
        if (index === 2) td.title = 'Comparison period: ' + display(row.periodKey);
        tr.append(td);
      });
      const actions = document.createElement('td'), button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Original rows';
      button.setAttribute('aria-label', 'Read original rows for ' + row.boardSeriesId + ', ' + row.period);
      button.addEventListener('click', () => show(row)); actions.append(button); tr.append(actions); body.append(tr);
    }
    if (!selected.length) {
      const tr = document.createElement('tr'), td = document.createElement('td');
      td.colSpan = 9; td.textContent = 'No observations match these filters.'; tr.append(td); body.append(tr);
    }
    counts.textContent = (filtered.length ? (offset + 1).toLocaleString() + '–' +
      Math.min(offset + pageSize, filtered.length).toLocaleString() : '0') + ' of ' +
      filtered.length.toLocaleString() + ' matching observations; ' + data.rows.length.toLocaleString() + ' retained in the complete report.';
    previous.disabled = offset === 0; next.disabled = offset + pageSize >= filtered.length;
  }
  function filter() {
    const phrase = query.value.trim().toLocaleLowerCase('en-US');
    filtered = data.rows.filter(row =>
      (!series.value || row.seriesId === series.value) && (!status.value || row.status === status.value) &&
      (!changes.checked || !['EQUAL', 'BOTH_MISSING'].includes(row.status)) &&
      (!phrase || [row.release, row.boardSeriesId, row.fredSeriesId, row.period, row.periodKey,
        row.source?.value, row.target?.value].join(' ').toLocaleLowerCase('en-US').includes(phrase)));
    offset = 0; render();
  }
  for (const control of [series, status, changes]) control.addEventListener('change', filter);
  query.addEventListener('input', filter);
  previous.addEventListener('click', () => { offset = Math.max(0, offset - pageSize); render(); });
  next.addEventListener('click', () => { offset += pageSize; render(); });
  const download = (name, type, text) => {
    const url = URL.createObjectURL(new Blob([text], { type })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  byId('download-json').addEventListener('click', () =>
    download('ddp-receiving.json', 'application/json', jsonTextV1(data) + '\n'));
  byId('download-csv').addEventListener('click', () =>
    download('ddp-receiving.csv', 'text/csv', csvTextV1(data)));
  filter();
}
function htmlV1(receiving, canonicalJson) {
  const safeJson = canonicalJson.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const title = 'DDP to FRED migration comparison';
  const summary = receiving.summary;
  const cards = [['Original series', summary.seriesCount], ['Observation rows', summary.rowCount],
    ['Different values', summary.differentCount], ['Missing-state changes', summary.missingChangedCount],
    ['Series needing meaning review', summary.meaningReviewSeriesCount], ['Source-only / target-only', summary.sourceOnlyCount + ' / ' + summary.targetOnlyCount]];
  const source = { source: receiving.source, packageId: receiving.packageId, packageSha256: receiving.packageSha256,
    crosswalkId: receiving.crosswalkId, crosswalkSha256: receiving.crosswalkSha256,
    planId: receiving.planId, receivingId: receiving.id, captures: receiving.captures };
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title><style>' +
    ':root{color-scheme:light;--ink:#202327;--muted:#555b63;--line:#c9cdd2;--paper:#fff;--surface:#f3f4f5}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    'main{max-width:1480px;margin:auto;padding:28px}h1{font-size:28px;line-height:1.2;margin:8px 0 12px}h2{font-size:19px;margin:0 0 14px}' +
    'p{max-width:100ch}a{color:inherit}.eyebrow{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}' +
    '.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;border:1px solid var(--line);background:var(--line);margin:24px 0}' +
    '.summary div{padding:14px;background:var(--surface)}dt{font-size:12px;color:var(--muted)}dd{font-size:24px;font-weight:600;margin:4px 0 0}' +
    'section,details{margin:24px 0}summary{font-weight:600;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--surface);border:1px solid var(--line);padding:16px;max-height:520px;overflow:auto;font-size:12px}' +
    '.controls{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin:16px 0}label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;min-width:150px;max-width:100%}' +
    '.check{flex-direction:row;align-items:center;padding:9px 0;min-width:0}input,select,button{font:inherit;color:inherit;border:1px solid #9da3ab;background:#fff;padding:8px 10px;border-radius:2px}' +
    'select{max-width:460px}button{cursor:pointer;font-weight:600}button:hover{background:var(--surface)}button:disabled{opacity:.45;cursor:default}input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid #25282d;outline-offset:2px}' +
    '.table-wrap{max-width:100%;overflow-x:auto;border:1px solid var(--line)}table{width:100%;border-collapse:collapse;min-width:1080px;font-size:13px;text-align:left}' +
    'caption{text-align:left;padding:12px;font-weight:600;background:var(--surface)}th,td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}thead th{background:var(--surface);white-space:nowrap}tbody th{font-weight:500;max-width:260px;overflow-wrap:anywhere}' +
    'td:nth-child(n+5):nth-child(-n+8){font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}td button{white-space:nowrap;font-size:12px;padding:5px 8px}' +
    '.pager{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:14px 0}.actions{display:flex;gap:8px;flex-wrap:wrap}.muted{color:var(--muted);font-size:13px}footer{border-top:1px solid var(--line);padding-top:18px;margin-top:30px;font-size:12px;color:var(--muted)}' +
    '@media(max-width:680px){main{padding:18px 14px}h1{font-size:24px}.controls{align-items:stretch}.controls label{width:100%}select,input{width:100%;max-width:100%}.check input{width:auto}.pager{align-items:start;flex-direction:column}}' +
    '</style></head><body><main><header><div class="eyebrow">Economic report workspace / Original package migration</div><h1>' +
    title + '</h1><p>Compare the original Board package with the exact planned FRED as-of acquisitions. Original period labels, values, missing markers, source coordinates and meaning decisions are retained for every row.</p>' +
    '<p class="muted">A Board package represents its captured current-published values. The FRED as-of selection is retained separately. Differences below are FRED minus Board; a converted difference is present only when the retained meaning is compatible.</p></header>' +
    '<dl class="summary">' + cards.map(([label, value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>').join('') + '</dl>' +
    '<div class="actions"><button id="download-json" type="button">Download complete JSON</button><button id="download-csv" type="button">Download complete CSV</button></div>' +
    '<details><summary>Original source, selection and migration identities</summary><pre>' + escapeHtml(JSON.stringify(source, null, 2)) + '</pre></details>' +
    '<section aria-labelledby="observations-heading"><h2 id="observations-heading">Observation comparison</h2><div class="controls">' +
    '<label>Original series<select id="series"><option value="">All original series</option></select></label>' +
    '<label>Status<select id="status"><option value="">All statuses</option></select></label>' +
    '<label>Find a series, period or value<input id="query" type="search" autocomplete="off"></label>' +
    '<label class="check"><input id="changes" type="checkbox" checked> Changes and review items only</label></div>' +
    '<p id="counts" class="muted" role="status" aria-live="polite"></p><div class="table-wrap" role="region" tabindex="0" aria-label="DDP and FRED observation comparison">' +
    '<table><caption>Original Board and FRED observations</caption><thead><tr><th scope="col">Board series</th><th scope="col">FRED series</th><th scope="col">Original period</th><th scope="col">Comparison</th><th scope="col">Board value</th><th scope="col">FRED value</th><th scope="col">Raw difference</th><th scope="col">Converted difference</th><th scope="col">Source detail</th></tr></thead><tbody id="rows"></tbody></table></div>' +
    '<div class="pager"><div class="actions"><button id="previous" type="button">Previous 100</button><button id="next" type="button">Next 100</button></div><span class="muted">Downloads contain all original rows and meaning records.</span></div></section>' +
    '<details id="row-details"><summary>Selected original observations and series meaning</summary><pre id="detail">Choose “Original rows” beside an observation.</pre></details>' +
    '<noscript><p>The complete data is embedded in this file. Enable JavaScript to filter observations and save its complete JSON or CSV, or use the accompanying files.</p></noscript>' +
    '<footer>Renderer FRED_DDP_RECEIVING_V1 · <a href="https://www.federalreserve.gov/data.htm">Federal Reserve Board data</a> · <a href="https://fred.stlouisfed.org/">FRED</a></footer></main>' +
    '<script type="application/json" id="receiving-data">' + safeJson.trim() + '</script><script>' +
    jsonTextV1.toString() + '\n' + csvTextV1.toString() + '\n(' + offlineReaderV1.toString() + ')();</script></body></html>\n';
}
export function validateFredDdpReceivingFileManifest(value) {
  need(value?.rendererVersion === FRED_DDP_RECEIVING_RENDERER && Array.isArray(value.files) &&
    value.files.length === FRED_DDP_RECEIVING_MEMBERS.length, 'Retain the original DDP receiving renderer and complete file inventory.');
  for (let index = 0; index < FRED_DDP_RECEIVING_MEMBERS.length; index++) {
    const expected = FRED_DDP_RECEIVING_MEMBERS[index], actual = value.files[index];
    need(actual?.path === expected.path && actual.contentType === expected.contentType &&
      Number.isSafeInteger(actual.bytes) && actual.bytes > 0 && actual.bytes <= FRED_DDP_RECEIVING_FILE_LIMIT &&
      /^[a-f0-9]{64}$/.test(actual.sha256 ?? ''), 'The retained DDP receiving file descriptor changed.');
  }
  return value;
}
/** Generate complete original members one at a time without retaining three large buffers. */
export function* generateFredDdpReceivingFiles(receiving, { rendererVersion = FRED_DDP_RECEIVING_RENDERER } = {}) {
  validateFredDdpReceiving(receiving, { copy: false });
  need(rendererVersion === FRED_DDP_RECEIVING_RENDERER, 'Use the original retained DDP receiving renderer.');
  const json = jsonTextV1(receiving) + '\n';
  for (let index = 0; index < FRED_DDP_RECEIVING_MEMBERS.length; index++) {
    const definition = FRED_DDP_RECEIVING_MEMBERS[index];
    const text = index === 0 ? json : index === 1 ? csvTextV1(receiving) : htmlV1(receiving, json);
    const body = Buffer.from(text);
    need(body.length <= FRED_DDP_RECEIVING_FILE_LIMIT, 'This complete DDP comparison file exceeds the 384 MiB reader capacity.');
    yield { ...definition, bytes: body.length, sha256: hash(body), body };
  }
}
export function createFredDdpReceivingFiles(receiving, { rendererVersion = FRED_DDP_RECEIVING_RENDERER } = {}) {
  return { rendererVersion, files: [...generateFredDdpReceivingFiles(receiving, { rendererVersion })] };
}
export function fredDdpReceivingFileManifest(prepared) {
  return validateFredDdpReceivingFileManifest({ rendererVersion: prepared.rendererVersion,
    files: prepared.files.map(({ body, ...descriptor }) => clone(descriptor)) });
}
export function verifyFredDdpReceivingFiles(receiving, retained) {
  validateFredDdpReceivingFileManifest(retained);
  const prepared = createFredDdpReceivingFiles(receiving, { rendererVersion: retained.rendererVersion });
  need(canonical(fredDdpReceivingFileManifest(prepared)) ===
    canonical({ rendererVersion: retained.rendererVersion, files: retained.files }),
    'The complete DDP receiving files differ from their original retained bytes.');
  return prepared;
}

/** Verify complete original byte identities while retaining only their small descriptors. */
export function verifyFredDdpReceivingManifest(receiving, retained) {
  validateFredDdpReceivingFileManifest(retained);
  const files = [];
  for (const { body, ...descriptor } of generateFredDdpReceivingFiles(receiving, { rendererVersion: retained.rendererVersion }))
    files.push(descriptor);
  const manifest = validateFredDdpReceivingFileManifest({ rendererVersion: retained.rendererVersion, files });
  need(canonical(manifest) === canonical({ rendererVersion: retained.rendererVersion, files: retained.files }),
    'The complete DDP receiving files differ from their original retained bytes.');
  return manifest;
}
