// SPDX-License-Identifier: MIT
import { canonical, identity, clone, text, now } from './io.mjs';

export const REPORT_SCHEMA = 'tjl.economic-client-briefing.v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display = value => value === null || value === undefined ? '' : typeof value === 'object' ? canonical(value) : String(value);
const cell = value => '"' + display(value).replace(/"/g, '""') + '"';
export function seriesCatalog(capture) {
  if (capture.state !== 'COMPLETE' || !Array.isArray(capture.datasets)) throw new Error('Use a complete original source capture');
  const result = [], seen = new Set();
  for (const dataset of capture.datasets) {
    if (!Array.isArray(dataset.series)) throw new Error('The captured native dataset has no complete series array');
    for (const series of dataset.series) {
      if (!Object.hasOwn(series, 'series-key') || !Array.isArray(series.obs))
        throw new Error('The source has no original series-key or observation array');
      const seriesKey = clone(series['series-key']);
      const id = identity({ dataset_ref: capture.dataset_ref, series_key: seriesKey });
      if (seen.has(id)) throw new Error('The native source must join repeated series pages before report selection');
      seen.add(id);
      const metadata = Object.fromEntries(Object.entries(series).filter(([key]) => key !== 'obs'));
      const fields = [...new Set(series.obs.flatMap(row => Object.keys(row)))].sort();
      result.push({ id, dataset_ref: capture.dataset_ref, series_key: seriesKey,
        metadata, observation_count: series.obs.length, fields, observations: clone(series.obs) });
    }
  }
  return result;
}
export function describeCapture(capture) {
  return { operation_id: capture.operation_id, dataset_ref: capture.dataset_ref, state: capture.state,
    selection: capture.selection, release: capture.release, acquired_at: capture.acquired_at,
    number_encoding: capture.number_encoding, series: seriesCatalog(capture).map(({observations,...series}) => series),
    structures: capture.structures, metadata_joins:capture.metadata_joins, structure_sources:capture.structure_sources, series_sources:capture.series_sources, sources: capture.sources };
}
function rights(value) {
  if (!value || typeof value !== 'object') throw new Error('Retain the selected source citation and customer-use terms');
  return { citation: text(value.citation, 'source citation'), terms: text(value.terms, 'source terms'),
    customer_use: text(value.customer_use, 'the selected customer use'), source_url: text(value.source_url, 'source URL', 4096),
    access_basis: text(value.access_basis, 'the original licensed or public access basis'),
    notes: String(value.notes || '') };
}
export function reviewSelection(input, captures) {
  text(input.title, 'briefing title', 300); text(input.audience, 'intended audience', 1000);
  if (!Array.isArray(input.series) || (!input.series.length && !input.companion_ids?.length)) throw new Error('Select complete native series or an original companion briefing');
  if (input.series.length > 500) throw new Error('Select at most 500 series per client briefing');
  const seen = new Set(), selected = [];
  for (const row of input.series) {
    const capture = captures[row.capture_id];
    if (!capture) throw new Error('Unknown original source capture: ' + row.capture_id);
    const series = seriesCatalog(capture).find(item => item.id === row.series_id);
    if (!series) throw new Error('Use the original selected series identity');
    const binding = identity({dataset_ref:series.dataset_ref,series_key:series.series_key});
    if (seen.has(binding)) throw new Error('Select one captured edition of each native dataset/series in a briefing; compare different releases using saved briefing editions');
    seen.add(binding);
    if (!['observed','forecast','mixed','unclassified'].includes(row.role)) throw new Error('Choose the observed/forecast classification');
    const from = row.start === undefined || row.start === '' ? null : text(row.start, 'first native period', 100);
    const to = row.end === undefined || row.end === '' ? null : text(row.end, 'last native period', 100);
    const periods = series.observations.map(observation => display(observation.TIME_PERIOD));
    let first = 0, last = periods.length - 1;
    if (from !== null) { first = periods.indexOf(from); if (first < 0) throw new Error('Selected first period does not occur in the native series'); }
    if (to !== null) { last = periods.lastIndexOf(to); if (last < 0) throw new Error('Selected last period does not occur in the native series'); }
    if (last < first) throw new Error('Select a contiguous interval in the original source ordering');
    // The full source remains in the project; clipping preserves native order and
    // every historical observation at the selected first/last period.
    if (from !== null) while (first > 0 && periods[first - 1] === from) first--;
    if (to !== null) while (last + 1 < periods.length && periods[last + 1] === to) last++;
    const observations = series.observations.slice(first, last + 1);
    selected.push({ capture_id: row.capture_id, series_id: row.series_id, dataset_ref: capture.dataset_ref,
      series_key: series.series_key, title: text(row.title, 'series title', 500), role: row.role,
      frequency: text(row.frequency, 'reviewed original frequency', 500),
      units: text(row.units, 'reviewed original units', 1000),
      adjustment: String(row.adjustment || ''), methodology: String(row.methodology || ''),
      interpretation: String(row.interpretation || ''), native_order: { first, last, complete_count: series.observation_count },
      native_metadata: series.metadata, fields: series.fields, observations,
      release: clone(capture.release ?? null), source_selection: clone(capture.selection),
      acquired_at: capture.acquired_at, rights: rights(input.rights?.[row.capture_id]) });
  }
  return { schema: REPORT_SCHEMA, title: input.title.trim(), audience: input.audience.trim(),
    summary: String(input.summary || ''), editorial_notes: String(input.editorial_notes || ''),
    prepared_by: String(input.prepared_by || ''), series: selected,
    companion_ids: Array.isArray(input.companion_ids) ? [...new Set(input.companion_ids)] : [],
    source_ids: [...new Set(input.series.map(row => row.capture_id))] };
}
function grouped(rows) {
  const result = new Map();
  for (const row of rows) {
    const period = display(row.TIME_PERIOD);
    if (!result.has(period)) result.set(period, []);
    result.get(period).push(row);
  }
  return result;
}
export function compareBriefings(before, after) {
  const old = new Map(before.series.map(s => [identity({dataset_ref:s.dataset_ref,series_key:s.series_key}), s]));
  const next = new Map(after.series.map(s => [identity({dataset_ref:s.dataset_ref,series_key:s.series_key}), s]));
  const changes = [];
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    const left = old.get(key), right = next.get(key);
    if (!left || !right) { changes.push({series_id:key, kind:left ? 'removed_series' : 'added_series', before:left ?? null, after:right ?? null}); continue; }
    const a = grouped(left.observations), b = grouped(right.observations);
    const periods = [];
    for (const period of new Set([...a.keys(), ...b.keys()])) {
      const previous = a.get(period) || [], current = b.get(period) || [];
      if (canonical(previous) !== canonical(current)) periods.push({period,
        kind:previous.length ? (current.length ? 'changed_native_group' : 'removed_period') : 'added_period',
        before:previous, after:current});
    }
    const leftMeta = {...left}, rightMeta = {...right};
    for (const meta of [leftMeta,rightMeta]) { delete meta.observations; delete meta.capture_id; delete meta.acquired_at; }
    if (periods.length || canonical(leftMeta) !== canonical(rightMeta))
      changes.push({series_id:key, kind:'revised_series', periods, metadata_changed:canonical(leftMeta)!==canonical(rightMeta),
        before_metadata:leftMeta, after_metadata:rightMeta});
  }
  return { schema:'tjl.economic-client-comparison.v1', before:before.id ?? null, after:after.id ?? null,
    explanation:'Complete native observation groups are compared at each original TIME_PERIOD. Historical duplicates keep their source order; they are not collapsed into one value.',
    changed_series:changes.length, changes };
}
export function createReport(input, captures, {projectId,revision,previous,companions,createdAt=now()}={}) {
  const reviewed = reviewSelection(input,captures);
  const selectedCompanions = reviewed.companion_ids.map(id => {
    const value = companions[id]; if (!value) throw new Error('Unknown complete companion edition');
    return clone(value);
  });
  const sources = Object.fromEntries(reviewed.source_ids.map(id => [id, {
    capture_id:id, dataset_ref:captures[id].dataset_ref, selection:captures[id].selection,
    release:captures[id].release, acquired_at:captures[id].acquired_at,
    structures:captures[id].structures, metadata_joins:captures[id].metadata_joins, structure_sources:captures[id].structure_sources, series_sources:captures[id].series_sources, sources:captures[id].sources,
    number_encoding:captures[id].number_encoding, rights:reviewed.series.find(s=>s.capture_id===id).rights
  }]));
  const result = {...reviewed, project_id:projectId, revision, created_at:createdAt, sources,
    companions:selectedCompanions, original_request:clone(input),
    comparison:previous ? compareBriefings(previous,reviewed) : null};
  // Report identity hashes the complete reviewed content with comparison.after
  // explicitly null; the following after field is the derived self-reference.
  result.id = identity(result);
  if (result.comparison) result.comparison.after = result.id;
  return result;
}
export function renderReport(report, companionBodies = {}) {
  const json = JSON.stringify(report,null,2)+'\n';
  const columns = ['capture_id','dataset_ref','series_id','series_key','title','role','frequency','units','adjustment',
    'release','native_position','TIME_PERIOD','OBS_VALUE','observation_json','source_citation','source_terms','customer_use'];
  const csv = [columns.map(cell).join(',')];
  for (const series of report.series) series.observations.forEach((row,index) => {
    csv.push([series.capture_id,series.dataset_ref,series.series_id,series.series_key,series.title,series.role,
      series.frequency,series.units,series.adjustment,series.release,series.native_order.first+index,
      row.TIME_PERIOD,row.OBS_VALUE,row,series.rights.citation,series.rights.terms,series.rights.customer_use].map(cell).join(','));
  });
  const sourceRights = {schema:'tjl.economic-client-rights.v1',report_id:report.id,
    sources:Object.values(report.sources).map(s=>({capture_id:s.capture_id,dataset_ref:s.dataset_ref,
      release:s.release,acquired_at:s.acquired_at,...s.rights})),
    companions:report.companions.map(c=>({id:c.id,kind:c.kind,source_files:c.files})),
    use:'Keep these original citations, source terms and customer-use qualifications with every delivered edition.'};
  const sections = report.series.map(series => '<section><h2>'+esc(series.title)+'</h2><dl>'+
    [['Classification',series.role],['Original series',display(series.series_key)],['Dataset',series.dataset_ref],
     ['Frequency',series.frequency],['Units',series.units],['Adjustment',series.adjustment],['Release',display(series.release)],
     ['Acquired',series.acquired_at],['Source',series.rights.citation]].map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+
    '</dl><p>'+esc(series.interpretation)+'</p><p>'+esc(series.methodology)+'</p>'+
    '<details><summary>Complete native series metadata</summary><pre>'+esc(JSON.stringify(series.native_metadata,null,2))+'</pre></details>'+
    '<table><thead><tr><th>Native position</th><th>Period</th><th>Original value</th><th>Complete observation</th></tr></thead><tbody>'+
    series.observations.map((row,i)=>'<tr><td>'+(series.native_order.first+i)+'</td><td>'+esc(display(row.TIME_PERIOD))+
      '</td><td>'+esc(display(row.OBS_VALUE))+'</td><td><code>'+esc(canonical(row))+'</code></td></tr>').join('')+
    '</tbody></table><p class="source">'+esc(series.rights.terms)+'<br>'+esc(series.rights.customer_use)+'</p></section>').join('');
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(report.title)+'</title><style>body{max-width:1120px;margin:36px auto;padding:0 24px;color:#202020;background:#fff;font:15px/1.55 system-ui,sans-serif}h1{font-size:32px}h2{font-size:23px;border-top:1px solid #aaa;padding-top:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}dl{display:grid;grid-template-columns:140px 1fr;gap:4px}dt{font-weight:600}dd{margin:0}pre{white-space:pre-wrap;overflow-wrap:anywhere}p{white-space:pre-wrap}.source,footer{font-size:12px;color:#444}@media print{body{max-width:none;margin:0}thead{display:table-header-group}tr{break-inside:avoid}details{display:block}}</style>'+
    '<header><p>CLIENT ECONOMIC BRIEFING · Edition '+report.revision+'</p><h1>'+esc(report.title)+'</h1><p>'+esc(report.audience)+
    '</p><p>Prepared '+esc(report.created_at)+(report.prepared_by?' · '+esc(report.prepared_by):'')+'</p></header>'+
    '<p>'+esc(report.summary)+'</p>'+sections+
    (report.comparison?'<section><h2>Changes from the previous edition</h2><p>'+esc(report.comparison.explanation)+
      '</p><pre>'+esc(JSON.stringify(report.comparison,null,2))+'</pre></section>':'')+
    '<section><h2>Editorial notes</h2><p>'+esc(report.editorial_notes)+'</p></section>'+
    '<section><h2>Original companion editions</h2>'+report.companions.map(c=>'<article><h3>'+esc(c.label)+'</h3><p class="source">'+esc(c.id)+
      ' · The complete original report is embedded below; its exact source file, observations and project archive remain in the customer project.</p>'+
      (companionBodies[c.id]?'<iframe title="'+esc(c.label)+'" sandbox srcdoc="'+esc(companionBodies[c.id])+'" style="width:100%;height:1100px;border:1px solid #aaa"></iframe>':'')+'</article>').join('')+'</section>'+
    '<footer>Report '+esc(report.id)+'. Source numbers and historical observation groups retain their original representation. '+
    'Frequency, units and forecast classification are the selected reviewer’s recorded interpretation of the accompanying native metadata. '+
    'Keep SOURCE_RIGHTS.json with the report and observation CSV.</footer></html>\n';
  return {'briefing.json':json,'briefing.html':html,'observations.csv':csv.join('\r\n')+'\r\n',
    'SOURCE_RIGHTS.json':JSON.stringify(sourceRights,null,2)+'\n'};
}
