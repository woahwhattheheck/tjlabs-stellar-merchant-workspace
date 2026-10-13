// MIT. Original ALFRED acquisition controls using the maintained source model.
import { canonical, need } from './source/model.mjs';
import { readFredAlfredMetadata } from './source/alfred/model.mjs';

const MAX_METADATA_BYTES = 64 * 1024 * 1024;
const utf8 = value => new TextEncoder().encode(value);
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const contextKey = value => value ? value.projectId + ':' + value.migrationId + ':' + value.asOf : '';
const requiredFields = ['title', 'units', 'frequency', 'seasonalAdjustment'];

export function mountFredAlfredAcquisition({ api, table, getState, getMigration, getRequest, onChange, message }) {
  const $ = id => document.getElementById(id);
  const panel = document.createElement('section');
  panel.setAttribute('aria-labelledby', 'ddp-source-heading');
  panel.innerHTML = '<h4 id="ddp-source-heading">Historical observation source</h4>' +
    '<div class="form-grid"><label>Acquisition source<select id="ddp-observation-source">' +
    '<option value="API_VINTAGE">FRED API historical edition</option>' +
    '<option value="ALFRED_VINTAGE">ALFRED original vintage download</option></select></label>' +
    '<p id="ddp-source-context" class="wide" role="status"></p></div>' +
    '<div id="ddp-alfred-controls" hidden><p>The returned original CSV must name each selected series and vintage. ' +
    'Historical metadata retains its original source text and covering dates.</p>' +
    '<label>Original historical metadata editions, when available<input id="ddp-alfred-file" type="file" accept=".json,application/json"></label>' +
    '<div class="buttons"><button id="ddp-alfred-review" type="button">Review selected metadata</button>' +
    '<button id="ddp-alfred-clear" type="button">Use observations without metadata</button>' +
    '<a href="/alfred-guide" target="_blank" rel="noopener">Source and metadata guide</a></div>' +
    '<p id="ddp-alfred-status" role="status">Without a metadata file, meaning coverage remains unavailable.</p>' +
    '<div id="ddp-alfred-metadata-table" class="table-wrap" role="region" aria-label="Historical metadata coverage" tabindex="0"></div>' +
    '<details id="ddp-alfred-original" hidden><summary>Inspect complete original metadata text</summary>' +
    '<label>Retained source series<select id="ddp-alfred-series"></select></label>' +
    '<p id="ddp-alfred-original-context"></p><pre id="ddp-alfred-original-text" tabindex="0"></pre></details></div>';
  $('ddp-migration-acquire').closest('.buttons').before(panel);
  $('ddp-alfred-original-text').style.cssText = 'max-height:20rem;overflow:auto;white-space:pre-wrap';
  let projectId = null, generation = 0, reviewing = false, preview = null, externalBusy = false;
  const plans = new Map();
  function context() {
    const project = getState(), migration = getMigration();
    if (!project || migration?.mode !== 'saved' || !migration.value?.migration?.summary?.ready) return null;
    const value = migration.value.migration;
    return { projectId: project.id, migrationId: migration.migrationId, asOf: value.input.asOf };
  }
  function retainedAcquisition() {
    let saved;
    try { saved = getRequest?.(); } catch { return null; }
    return saved?.action === 'ddp-migration-acquire' && saved.sourceMode === 'ALFRED_VINTAGE' ? saved : null;
  }
  function selectedFile() { return $('ddp-alfred-file').files[0] ?? null; }
  function clearPreview() {
    generation++; preview = null; reviewing = false;
    table('ddp-alfred-metadata-table', []);
    $('ddp-alfred-original').hidden = true; $('ddp-alfred-original-text').textContent = '';
    $('ddp-alfred-series').replaceChildren();
  }
  function renderOriginal() {
    const selected = preview?.editions.find(item => item.series.value === $('ddp-alfred-series').value);
    if (!selected) return;
    const source = selected.source;
    $('ddp-alfred-original-context').textContent = source.url + ' · received ' + source.receivedAt +
      ' · ' + source.bytes + ' bytes · SHA256 ' + source.sha256;
    $('ddp-alfred-original-text').textContent = source.body;
  }
  function renderPreview(value) {
    preview = value;
    table('ddp-alfred-metadata-table', value.rows);
    const count = value.rows.filter(row => row.Coverage === 'Covers selected vintage').length;
    $('ddp-alfred-status').textContent = value.file.name + ' · ' + value.file.bytes +
      ' bytes · ' + value.editions.length + ' original metadata editions · ' + count + ' of ' +
      value.rows.length + ' planned series have complete covering meaning. Metadata identity: ' + value.metadataSha256;
    $('ddp-alfred-series').replaceChildren();
    for (const edition of value.editions) {
      const option = document.createElement('option');
      option.value = edition.series.value; option.textContent = edition.series.value;
      $('ddp-alfred-series').append(option);
    }
    $('ddp-alfred-original').hidden = value.editions.length === 0;
    renderOriginal();
  }
  async function retainedPlan(request) {
    const identity = request.projectId + ':' + request.migrationId;
    if (plans.has(identity)) return plans.get(identity);
    const plan = await api('/api/ddp-migration?' + new URLSearchParams({
      migration: request.migrationId, download: '1'
    }), undefined, request.projectId);
    need(plan?.schema === 'stellar-forge.fred-ddp-migration-plan.v1' && plan.id === request.migrationId &&
      Array.isArray(plan.acquisitions) && plan.summary?.ready, 'Open the complete saved migration before selecting its historical metadata.');
    plans.set(identity, plan); return plan;
  }
  async function inspectFile(file, request) {
    need(file && file.size > 0 && file.size <= MAX_METADATA_BYTES,
      'Choose a complete original metadata JSON file up to 64 MiB.');
    const plan = await retainedPlan(request), bytes = await file.arrayBuffer();
    need(bytes.byteLength === file.size, 'The original metadata file changed while reading.');
    const fileSha256 = await sha256(bytes);
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    let editions;
    try { editions = JSON.parse(body); } catch { throw new Error('The original metadata file is not complete JSON.'); }
    need(Array.isArray(editions), 'Choose the complete array of original historical metadata editions.');
    const targets = new Set(plan.acquisitions.flatMap(item => item.series)), seen = new Set(), interpretations = new Map();
    const verifiedSources = new Map();
    for (const edition of editions) {
      const series = edition?.series?.value;
      need(typeof series === 'string' && targets.has(series) && !seen.has(series),
        'Keep one original metadata edition per planned FRED series.');
      seen.add(series);
      const value = readFredAlfredMetadata(edition, { series, vintage: plan.input.asOf });
      if (verifiedSources.get(edition.source.sha256) !== edition.source.body) {
        need(await sha256(utf8(edition.source.body)) === edition.source.sha256,
          'The retained historical metadata source bytes differ from their SHA256.');
        verifiedSources.set(edition.source.sha256, edition.source.body);
      }
      interpretations.set(series, value);
    }
    editions = [...editions].sort((a, b) => a.series.value < b.series.value ? -1 : a.series.value > b.series.value ? 1 : 0);
    const metadataSha256 = await sha256(utf8(canonical(editions)));
    const rows = [...targets].map(series => {
      const value = interpretations.get(series);
      const intervals = value ? requiredFields.map(field => {
        const item = value.editions[field];
        return field + ': ' + item.realtimeStart + '–' + item.realtimeEnd +
          (item.covers ? '' : ' (outside selected vintage)');
      }).join('; ') : '';
      return { Series: series, 'Selected vintage': plan.input.asOf,
        Coverage: !value ? 'Unavailable' : value.coverage === 'ALFRED_HISTORICAL_EDITION'
          ? 'Covers selected vintage' : 'Partial historical coverage',
        Title: value?.fields.title ?? '', Units: value?.fields.units ?? '',
        Frequency: value?.fields.frequency ?? '', 'Seasonal adjustment': value?.fields.seasonalAdjustment ?? '',
        'Original field intervals': intervals };
    });
    return { context: { projectId: request.projectId, migrationId: plan.id, asOf: plan.input.asOf },
      fileObject: file, file: { name: file.name, bytes: file.size, sha256: fileSha256 },
      editions, metadataSha256, rows };
  }
  async function reviewSelected() {
    const original = context(), file = selectedFile();
    need(original, 'Open a complete saved migration to review its historical source.');
    need(file, 'Choose the original historical metadata file.');
    const active = ++generation; reviewing = true; onChange();
    try {
      const value = await inspectFile(file, original);
      if (active !== generation || contextKey(context()) !== contextKey(original) || selectedFile() !== file) return;
      renderPreview(value);
      message('The complete original metadata and historical field coverage are ready for acquisition.');
    } finally { if (active === generation) reviewing = false; onChange(); }
  }
  function sync({ busy = false } = {}) {
    externalBusy = busy;
    const project = getState(), original = context(), retained = retainedAcquisition();
    if (project?.id !== projectId) {
      projectId = project?.id ?? null; plans.clear(); clearPreview(); reviewing = false;
      $('ddp-alfred-file').value = '';
      let stored;
      try { stored = sessionStorage.getItem('fred-ddp-source-mode:' + projectId); } catch {}
      $('ddp-observation-source').value = stored === 'ALFRED_VINTAGE' ? stored : 'API_VINTAGE';
    }
    if (preview && contextKey(preview.context) !== contextKey(original)) clearPreview();
    if (retained) $('ddp-observation-source').value = 'ALFRED_VINTAGE';
    const alfred = $('ddp-observation-source').value === 'ALFRED_VINTAGE';
    $('ddp-observation-source').disabled = busy || reviewing || Boolean(retained);
    $('ddp-alfred-controls').hidden = !alfred;
    $('ddp-alfred-file').disabled = busy || reviewing || (!original && !retained?.alfredMetadataFile);
    $('ddp-alfred-review').disabled = busy || reviewing || Boolean(retained) || !original || !selectedFile();
    $('ddp-alfred-clear').disabled = busy || reviewing || !selectedFile();
    $('ddp-source-context').textContent = retained ? 'Continue the original ALFRED acquisition for migration ' + retained.migrationId + '.' : !original ? 'Open a saved migration to select its observation source.'
      : alfred ? 'Original ALFRED observations as of ' + original.asOf + '. Each returned series/vintage column is checked.'
      : 'Original FRED API observations as of ' + original.asOf + ', using the configured host key.';
    if (alfred && !preview) $('ddp-alfred-status').textContent = retained?.alfredMetadataFile
      ? 'If the original metadata has not reached the project, re-select ' + retained.alfredMetadataFile.name +
        ' and continue the retained acquisition. Its complete file and edition identities are checked before sending.'
      : reviewing ? 'Reading complete original metadata and historical coverage…'
      : selectedFile() ? 'Review this original metadata file against the opened saved migration before acquisition.'
      : 'Observations can be acquired with unavailable metadata coverage. Original values remain available for review.';
    $('ddp-migration-acquire').textContent = alfred ? 'Acquire the reviewed ALFRED vintage' : 'Acquire the reviewed FRED selection';
  }
  function ready() {
    return !reviewing && ($('ddp-observation-source').value !== 'ALFRED_VINTAGE' || !selectedFile() ||
      preview?.fileObject === selectedFile() && contextKey(preview.context) === contextKey(context()));
  }
  async function prepare() {
    const original = context();
    need(original, 'Open the complete saved migration before acquisition.');
    if ($('ddp-observation-source').value !== 'ALFRED_VINTAGE') return { payload: {}, record: null };
    need(ready(), 'Review the selected original metadata before acquiring this vintage.');
    const value = selectedFile() ? preview : null;
    const metadataSha256 = value?.metadataSha256 ?? await sha256(utf8(canonical([])));
    need(contextKey(context()) === contextKey(original), 'The selected migration changed; open its original historical selection.');
    return { payload: { sourceMode: 'ALFRED_VINTAGE', metadataSha256,
      ...(value ? { alfredMetadataFile: value.file } : {}) },
      record: value ? { kind: 'alfred-metadata', file: value.fileObject } : null };
  }
  async function recover(saved, file) {
    file ??= selectedFile();
    if (!file) return null;
    const project = getState();
    const value = await inspectFile(file, { projectId: project.id, migrationId: saved.migrationId });
    need(value.file.name === saved.alfredMetadataFile.name &&
      value.file.bytes === saved.alfredMetadataFile.bytes && value.file.sha256 === saved.alfredMetadataFile.sha256 &&
      value.metadataSha256 === saved.metadataSha256, 'Select the unchanged original metadata file for this retained acquisition.');
    return value.editions;
  }
  $('ddp-observation-source').addEventListener('change', () => {
    try { sessionStorage.setItem('fred-ddp-source-mode:' + projectId, $('ddp-observation-source').value); } catch {}
    sync({ busy: externalBusy }); onChange();
  });
  $('ddp-alfred-file').addEventListener('change', () => { clearPreview(); reviewing = false; onChange(); });
  $('ddp-alfred-clear').addEventListener('click', () => {
    if (externalBusy || reviewing) return;
    $('ddp-alfred-file').value = ''; clearPreview(); onChange();
  });
  $('ddp-alfred-review').addEventListener('click', event => {
    event.preventDefault();
    if (!externalBusy && !reviewing) reviewSelected().catch(error => message(error.message, true));
  });
  $('ddp-alfred-series').addEventListener('change', renderOriginal);
  return { sync, ready, prepare, recover };
}
