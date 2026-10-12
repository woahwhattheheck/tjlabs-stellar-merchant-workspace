// MIT. The Board's complete DDP-to-FRED crosswalk and reviewed source mapping.
import { canonical, clone, need, plain } from '../model.mjs';
import { ddpDigest, fredDdpFileText, fredDdpFileDescriptor, validateFredDdpSourceFile } from './files.mjs';
import { readFredDdpCsv } from './csv.mjs';

const SCHEMA = 'stellar-forge.fred-ddp-crosswalk.v1';
const MODEL = 'stellar-forge.fred-ddp-crosswalk-model.v1';
const fieldNames = ['ddp_release', 'board_series_id', 'fred_series_id'];
const keyOf = row => row.release + '\u0000' + row.boardSeriesId;
const same = (a,b) => canonical(a) === canonical(b);
function originalName(value, label, max = 512) {
  need(typeof value === 'string' && value.length >= 1 && value.length <= max &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value), 'Invalid original ' + label + '.');
  return value;
}
export function fredDdpSourceSeries(value) {
  need(plain(value), 'An original Board series selection is required.');
  return { release: originalName(value.release, 'release', 100), boardSeriesId: originalName(value.boardSeriesId, 'Board series ID') };
}
export function fredDdpTargetSeries(value) {
  need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value), 'Invalid mapped FRED series ID.');
  return value;
}
function parseCrosswalk(file) {
  const csv = readFredDdpCsv(fredDdpFileText(file));
  need(csv.records.length >= 2, 'Receive the complete original crosswalk, including its header and mappings.');
  const header = csv.records[0].cells;
  need(header.length >= 3 && header.length <= 100 && new Set(header).size === header.length &&
    fieldNames.every(name => header.includes(name)), 'The original crosswalk requires ddp_release, board_series_id and fred_series_id.');
  const rows = [];
  for (const record of csv.records.slice(1)) {
    if (record.cells.every(cell => cell === '')) continue;
    need(record.cells.length === header.length, 'An original crosswalk row has a different field count.');
    const original = Object.fromEntries(header.map((name,index) => [name, record.cells[index]]));
    const source = fredDdpSourceSeries({ release: original.ddp_release, boardSeriesId: original.board_series_id });
    const fredSeriesId = original.fred_series_id === '' ? null : fredDdpTargetSeries(original.fred_series_id);
    rows.push({ row: record.row, ...source, fredSeriesId, original, location: clone(record.location) });
  }
  need(rows.length > 0, 'The original crosswalk has no mappings.');
  return { header: clone(header), rows };
}
function groupsOf(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, { release: row.release, boardSeriesId: row.boardSeriesId, rows: [], targets: new Set() });
    const group = groups.get(key); group.rows.push(row); if (row.fredSeriesId !== null) group.targets.add(row.fredSeriesId);
  }
  return groups;
}
export function sealFredDdpCrosswalk({file}) {
  const original = validateFredDdpSourceFile(file);
  parseCrosswalk(original);
  const core = { schema: SCHEMA, file: original }, captureSha256 = ddpDigest(core);
  return { ...core, id: 'fred-ddp-crosswalk-' + captureSha256, captureSha256 };
}
export function inspectFredDdpCrosswalk(capture) {
  need(plain(capture) && capture.schema === SCHEMA, 'A complete original DDP crosswalk capture is required.');
  const normalized = sealFredDdpCrosswalk({file:capture.file});
  need(same(capture, normalized), 'The original crosswalk capture identity changed.');
  const parsed = parseCrosswalk(capture.file), groups = groupsOf(parsed.rows);
  const releases = [...new Set(parsed.rows.map(row => row.release))].sort();
  const summary = { rowCount: parsed.rows.length, sourceSeriesCount: groups.size,
    targetSeriesCount: new Set(parsed.rows.flatMap(row => row.fredSeriesId === null ? [] : [row.fredSeriesId])).size,
    releaseCount: releases.length, ambiguousSourceSeriesCount: 0, unmappedSourceSeriesCount: 0, duplicateRowCount: 0 };
  for (const group of groups.values()) {
    if (group.targets.size > 1) summary.ambiguousSourceSeriesCount++;
    if (group.targets.size === 0) summary.unmappedSourceSeriesCount++;
    summary.duplicateRowCount += group.rows.length - new Set(group.rows.map(row => row.fredSeriesId)).size;
  }
  return { schema: MODEL, id: capture.id, captureSha256: capture.captureSha256,
    source: fredDdpFileDescriptor(capture.file), ...parsed, releases, summary };
}
export function validateFredDdpCrosswalk(capture) { inspectFredDdpCrosswalk(capture); return clone(capture); }
export function pageFredDdpCrosswalk(capture, {offset=0,limit=100,release=null,query=''}={}) {
  const model = inspectFredDdpCrosswalk(capture);
  need(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 1000,
    'Choose a valid original crosswalk page.');
  need((release === null || typeof release === 'string') && typeof query === 'string' && query.length <= 500, 'Invalid crosswalk filter.');
  const term = query.toLocaleLowerCase('en-US');
  const filtered = model.rows.filter(row => (release === null || row.release === release) &&
    (!term || [row.release,row.boardSeriesId,row.fredSeriesId ?? ''].some(value => value.toLocaleLowerCase('en-US').includes(term))));
  const { rows, ...metadata } = model;
  return { ...metadata, filter: {release,query}, offset,limit,total:filtered.length,
    nextOffset: offset + limit < filtered.length ? offset + limit : null, rows: clone(filtered.slice(offset,offset+limit)) };
}
export function resolveFredDdpMappings({crosswalk,series,decisions=[]}) {
  const source = inspectFredDdpCrosswalk(crosswalk), groups = groupsOf(source.rows);
  need(Array.isArray(series) && series.length > 0 && series.length <= 100000, 'Select the original package series to map.');
  need(Array.isArray(decisions) && decisions.length <= series.length, 'Invalid reviewed crosswalk decisions.');
  const selected = series.map(fredDdpSourceSeries), selectedKeys = new Set(selected.map(keyOf)), reviewed = new Map();
  need(selectedKeys.size === selected.length, 'Select each original Board release and series only once.');
  for (const raw of decisions) {
    const item = fredDdpSourceSeries(raw), key = keyOf(item);
    need(selectedKeys.has(key) && !reviewed.has(key), 'Each mapping decision must refer to one selected original series.');
    need(raw.action === 'map' || raw.action === 'exclude', 'Choose map or exclude for a reviewed mapping decision.');
    need(typeof raw.note === 'string' && raw.note.trim().length > 0 && raw.note.length <= 4000, 'Retain the reason for an explicit mapping decision.');
    const decision = { ...item, action:raw.action, note:raw.note };
    if (raw.action === 'map') {
      decision.fredSeriesId = fredDdpTargetSeries(raw.fredSeriesId);
      need(groups.get(key)?.targets.has(decision.fredSeriesId), 'A reviewed target must occur in this original crosswalk for the selected Board series.');
    }
    reviewed.set(key,decision);
  }
  const rows = selected.map((item,index) => {
    const group = groups.get(keyOf(item)), candidates = group ? [...group.targets].sort() : [], decision = reviewed.get(keyOf(item)) || null;
    const status = decision?.action === 'exclude' ? 'EXCLUDED' : decision?.action === 'map' || candidates.length === 1 ? 'MAPPED' :
      candidates.length > 1 ? 'AMBIGUOUS' : 'UNMAPPED';
    return { index,...item,status,fredSeriesId:status === 'MAPPED' ? decision?.fredSeriesId || candidates[0] : null,
      candidates,sourceRows:clone(group?.rows || []),decision:clone(decision) };
  });
  const summary = { seriesCount:rows.length,mappedCount:0,excludedCount:0,ambiguousCount:0,unmappedCount:0,targetSeriesCount:0 };
  for (const row of rows) summary[{MAPPED:'mappedCount',EXCLUDED:'excludedCount',AMBIGUOUS:'ambiguousCount',UNMAPPED:'unmappedCount'}[row.status]]++;
  const targets = [...new Set(rows.filter(row => row.status === 'MAPPED').map(row => row.fredSeriesId))].sort();
  summary.targetSeriesCount = targets.length;
  const core = { schema:'stellar-forge.fred-ddp-mappings.v1',crosswalkId:source.id,crosswalkSha256:source.captureSha256,
    series:clone(selected),decisions:clone([...reviewed.values()]),rows,targets,summary };
  return { ...core,id:'fred-ddp-mappings-'+ddpDigest(core) };
}
export function validateFredDdpMappings(value,{crosswalk}={}) {
  need(plain(value) && crosswalk, 'Original crosswalk context is required to validate reviewed mappings.');
  const expected = resolveFredDdpMappings({crosswalk,series:value.series,decisions:value.decisions});
  need(same(value,expected), 'The reviewed mapping changed from its original crosswalk and decisions.'); return clone(value);
}
export function compareFredDdpCrosswalks({before,after}) {
  const a = inspectFredDdpCrosswalk(before), b = inspectFredDdpCrosswalk(after), left=groupsOf(a.rows),right=groupsOf(b.rows);
  const keys=[...new Set([...left.keys(),...right.keys()])].sort(),rows=[];
  const summary={addedCount:0,removedCount:0,changedCount:0,unchangedCount:0};
  for (const key of keys) {
    const old=left.get(key),current=right.get(key),identity=old||current;
    const beforeTargets=old?[...old.targets].sort():[],afterTargets=current?[...current.targets].sort():[];
    const status=!old?'ADDED':!current?'REMOVED':same(beforeTargets,afterTargets)?'UNCHANGED':'CHANGED';
    summary[{ADDED:'addedCount',REMOVED:'removedCount',CHANGED:'changedCount',UNCHANGED:'unchangedCount'}[status]]++;
    rows.push({release:identity.release,boardSeriesId:identity.boardSeriesId,status,beforeTargets,afterTargets,
      beforeRows:clone(old?.rows||[]),afterRows:clone(current?.rows||[])});
  }
  const core={schema:'stellar-forge.fred-ddp-crosswalk-comparison.v1',beforeId:a.id,afterId:b.id,
    beforeSource:a.source,afterSource:b.source,summary,rows};
  return {...core,id:'fred-ddp-crosswalk-comparison-'+ddpDigest(core)};
}
