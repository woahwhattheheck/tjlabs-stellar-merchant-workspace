#!/usr/bin/env node
/**
 * Create a complete editable workbook from one original saved migration register.
 * Requires the supplied @oai/artifact-tool runtime. Native GIS stays in mapping_register.py.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const REGISTER_SCHEMA = 'starforge.gis-migration-mapping-register.v1';
const BUILD_SCHEMA = 'starforge.gis-migration-mapping-workbook.v1';
const XLSX = 'Lutra-GIS-Mapping-Register.xlsx';
const FIRST = 8;
const TEXT_LIMIT = 30000;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const need = (condition, message) => { if (!condition) throw new Error(message); };
const col = index => {
  let value = index + 1, result = '';
  while (value) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
};
const quoted = name => "'" + name.replaceAll("'", "''") + "'";
const literal = value => typeof value === 'string' && value.startsWith('=') ? "'" + value : value;
const asText = value => value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
const strictBytes = text => {
  need(typeof text === 'string', 'Original file bytes are required.');
  const bytes = Buffer.from(text, 'base64');
  need(bytes.toString('base64') === text, 'Original file base64 is incomplete or changed.');
  return bytes;
};
function parse(raw) {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
  return JSON.parse(text.replace(/^\uFEFF/, ''), (key, value, context) => {
    if (typeof value !== 'number') return value;
    if (context && typeof context.source === 'string') return context.source;
    need(Number.isSafeInteger(value), 'Use the current supplied Node runtime to retain numeric source values.');
    return String(value);
  });
}
function exactCount(value) {
  const text = asText(value);
  if (/^(0|[1-9]\d{0,14})$/.test(text)) return Number(text);
  return text;
}
async function saveNew(filename, bytes) {
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  try {
    const st = await fs.lstat(filename);
    need(st.isFile() && !st.isSymbolicLink(), 'A regular output file is required: ' + filename);
    need((await fs.readFile(filename)).equals(bytes), 'Preserve the existing output; choose a new directory for changed source: ' + filename);
    return;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(path.dirname(filename), '.' + path.basename(filename) + '-' + crypto.randomUUID());
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    try { await fs.link(temporary, filename); }
    catch (error) { if (error.code !== 'EEXIST') throw error; await saveNew(filename, bytes); }
    const directory = await fs.open(path.dirname(filename), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    if (handle) await handle.close();
    await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function readRegular(filename) {
  const handle = await fs.open(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat();
    need(before.isFile(), 'A regular source file is required.');
    const bytes = await handle.readFile();
    const after = await handle.stat(), selected = await fs.lstat(filename);
    for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
      need(before[key] === after[key] && after[key] === selected[key], 'The selected source changed during its read.');
    }
    need(!selected.isSymbolicLink() && bytes.length === before.size, 'The selected source changed during its read.');
    return bytes;
  } finally { await handle.close(); }
}
function validate(register) {
  need(register && register.schema === REGISTER_SCHEMA, 'Select the maintained original mapping-register export.');
  need(register.workspace && typeof register.workspace.id === 'string' && typeof register.plan_id === 'string', 'Saved workspace/plan identity is required.');
  for (const key of ['fields', 'layers', 'keys', 'projects', 'native_profiles', 'decisions', 'provenance']) {
    need(Array.isArray(register[key]), 'Complete register section required: ' + key);
    need(register[key].every(value => value && typeof value === 'object' && !Array.isArray(value)), 'Malformed register row: ' + key);
  }
  need(register.layers.length && register.projects.length, 'A complete original layer and project selection is required.');
  need(register.review && Array.isArray(register.review.history), 'Original source-review history is required.');
  need(register.originals && typeof register.originals === 'object', 'Original plan/capture/audit files are required.');
  for (const key of ['plan', 'source_review', 'capture_manifest', 'source_inspection']) need(register.originals[key], 'Missing original: ' + key);
  const originals = [];
  for (const [key, value] of Object.entries(register.originals)) {
    need(/^[a-z][a-z0-9_]*$/.test(key), 'Unexpected original file key.');
    const bytes = strictBytes(value.content_base64), descriptor = value.descriptor;
    need(descriptor && asText(descriptor.bytes) === String(bytes.length) && descriptor.sha256 === sha(bytes), 'Original file hash/length differs: ' + key);
    const suffix = path.extname(descriptor.path);
    originals.push({ key, filename: 'originals/' + key + (/^\.[a-z0-9]{1,10}$/i.test(suffix) ? suffix : '.bin'), bytes, descriptor });
  }
  return originals;
}
function chunks(value) {
  const output = [];
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + TEXT_LIMIT, value.length);
    if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1]) && /[\uDC00-\uDFFF]/.test(value[end])) end--;
    output.push(value.slice(start, end)); start = end;
  }
  return output;
}
function dateValue(value) {
  const text = asText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : text;
}
async function renderFile(workbook, sheet, destination) {
  const image = await workbook.render({ sheetName: sheet, autoCrop: 'all', scale: 1, format: 'png' });
  await fs.writeFile(destination, new Uint8Array(await image.arrayBuffer()));
}
const C = (key, label, width, extra = {}) => ({ key, label, width, ...extra });
function definitions(register) {
  const names = new Map(register.layers.map(row => [row.layer_id, row.source_name]));
  const withName = rows => rows.map(row => ({ source_layer: names.get(row.layer_id) || row.layer_id || '', ...row }));
  const projects = new Map();
  for (const row of register.projects) {
    const prior = projects.get(row.project_id);
    need(!prior || ['title', 'project_crs', 'format', 'complete_definition_json'].every(key => prior[key] === row[key]), 'Each project must retain one complete saved definition.');
    if (!prior) projects.set(row.project_id, row);
  }
  return [
    { name: 'Field mapping', rows: withName(register.fields), columns: [
      C('source_layer', 'Source layer', 24), C('source_field', 'Source field', 29),
      C('destination_field', 'Destination name', 29, { edit: true }), C('mode', 'Conversion', 18, { edit: true }),
      C('physical_type_choice', 'Requested type', 18, { edit: true }), C('null_policy', 'Null policy', 18, { edit: true }),
      C('shapefile_name_choice', 'Shapefile name', 18, { edit: true }), C('note', 'Mapping note', 44, { edit: true }),
      C('layer_id', 'Original layer ID', 36)
    ], note: 'White choice cells carry the exported mapping. Agreed edits return through the original Mapping editor and a new saved plan review.' },
    { name: 'Source fields', rows: withName(register.fields), columns: [
      C('source_layer', 'Source layer', 24), C('source_field', 'Source field', 29),
      C('source_declared_type', 'Declared native type', 24), C('source_kinds', 'Observed value kinds', 28),
      C('present', 'Present', 13, { count: true }), C('absent', 'Absent', 13, { count: true }), C('nulls', 'Null values', 13, { count: true }),
      C('source_statistics_json', 'Complete observed statistics', 64), C('layer_id', 'Original layer ID', 36)
    ], note: 'Counts and complete observed statistics come from the original native source inspection. Large counts retain their exact decimal text.' },
    { name: 'Layers', rows: register.layers, columns: [
      C('source_name', 'Source layer', 28), C('table', 'Destination table', 28, { edit: true }),
      C('title', 'Layer title', 32, { edit: true }), C('geometry_null_policy', 'Null geometry policy', 23, { edit: true }),
      C('features', 'Features', 15, { count: true }), C('null_geometries', 'Null geometries', 17, { count: true }),
      C('geometry_types_json', 'Observed geometries', 30), C('issues', 'Source issues', 15, { count: true }),
      C('note', 'Layer note', 44, { edit: true }), C('layer_id', 'Original layer ID', 36)
    ], note: 'Layer destinations and geometry choices remain associated with the exact original source layer.' },
    { name: 'Coordinates', rows: register.layers, columns: [
      C('source_name', 'Source layer', 28), C('source_crs_choice', 'Selected source CRS', 28, { edit: true }),
      C('assigned_source_crs', 'Explicit assigned source CRS', 32, { edit: true }),
      C('target_crs', 'Selected target CRS', 28, { edit: true }), C('source_crs_wkt', 'Original native CRS WKT', 80),
      C('layer_id', 'Original layer ID', 36)
    ], note: 'An explicit source assignment and a destination transformation are separate saved choices. Full original WKT remains available in the cell or Text details.' },
    { name: 'Keys', rows: withName(register.keys), columns: [
      C('source_layer', 'Source layer', 28), C('key', 'Key name', 28, { edit: true }),
      C('position', 'Key position', 15, { count: true }), C('source_field', 'Original key field', 30),
      C('null_policy', 'Key null policy', 24, { edit: true }), C('note', 'Key note', 50, { edit: true }),
      C('layer_id', 'Original layer ID', 36)
    ], note: 'Each row retains one ordered key member. Composite-key order remains explicit.' },
    { name: 'Projects', rows: [...projects.values()], columns: [
      C('project_id', 'Definition ID', 26), C('title', 'Delivery title', 36, { edit: true }),
      C('project_crs', 'Selected project CRS', 28, { edit: true }), C('format', 'Destination format', 24, { edit: true }),
      C('complete_definition_json', 'Complete exported definition', 82)
    ], note: 'Each project has one editable definition. Ordered layer selections and their complete options remain in Project layers. Delivery title retains its original distinction from native workspace title.' },
    { name: 'Project layers', rows: withName(register.projects), columns: [
      C('project_id', 'Definition ID', 26), C('title', 'Exported delivery title', 32),
      C('layer_position', 'Layer order', 13, { count: true }), C('source_layer', 'Selected source layer', 28),
      C('layer_options_json', 'Complete layer options JSON', 76, { edit: true }), C('layer_id', 'Original layer ID', 36)
    ], note: 'Every selected project layer remains in saved order. Edit each project title/CRS/format once in Projects; proposed layer options remain beside the exact original layer ID.' },
    { name: 'Native types', rows: withName(register.native_profiles), columns: [
      C('source_layer', 'Source layer', 25), C('driver', 'Native driver', 21), C('position', 'Field order', 13, { count: true }),
      C('source_field', 'Source field', 29), C('destination_field', 'Resolved destination field', 30),
      C('physical_type', 'Resolved native type', 27), C('codec', 'Native codec', 24),
      C('complete_profile_json', 'Complete native profile', 72), C('layer_id', 'Original layer ID', 36)
    ], note: 'Resolved names/types/codecs come from the original full-source audit and selected native driver, alongside each requested choice.' },
    { name: 'Decisions', rows: withName(register.decisions), columns: [
      C('position', 'Order', 11, { count: true }), C('kind', 'Decision kind', 24), C('source_layer', 'Source layer', 26),
      C('project_id', 'Project definition', 26), C('decision', 'Saved pending decision', 62), C('note', 'Original note', 52),
      C('complete_decision_json', 'Complete original decision', 66), C('layer_id', 'Original layer ID', 36)
    ], note: 'This is the actual pending-decision list from the saved plan. Source review and later decisions stay in the original workspace history.' },
    { name: 'Sources', rows: register.provenance, columns: [
      C('kind', 'Source role', 28), C('source_id', 'Original source ID', 36), C('path', 'Retained source path', 76),
      C('bytes', 'Original bytes', 20, { count: true }), C('sha256', 'SHA-256', 70)
    ], note: 'These are the original selected file descriptors. The complete Mapping-Register.json carries the same provenance and exact original plan/selection bytes.' },
    { name: 'Review history', rows: register.review.history, columns: [
      C('id', 'Original review ID', 64), C('planId', 'Saved plan ID', 64), C('outcome', 'Original outcome', 24),
      C('at', 'Original review time', 26, { date: true }), C('actor', 'Original reviewer', 32),
      C('note', 'Complete review note', 74), C('planFile', 'Reviewed plan descriptor', 72)
    ], note: 'Ordered reviews are taken from the same saved workspace state as the plan. The Overview names the latest original review in that snapshot.' }
  ];
}
function formatBase(sheet, rows, columns) {
  sheet.showGridLines = false;
  const area = sheet.getRangeByIndexes(0, 0, Math.max(rows, FIRST), columns);
  area.format.font = { name: 'Arial', size: 10, color: '#202020' };
  area.format.verticalAlignment = 'top';
  area.format.wrapText = true;
  area.format.rowHeight = 30;
  sheet.freezePanes.freezeRows(FIRST - 1);
  sheet.freezePanes.freezeColumns(2);
}
function heading(sheet, title, note, columns) {
  const last = col(columns - 1);
  sheet.mergeCells('A1:' + last + '2');
  sheet.getRange('A1').values = [[title]];
  sheet.getRange('A1').format.font = { name: 'Arial', size: 16, bold: true, color: '#202020' };
  sheet.mergeCells('A3:' + last + '4');
  sheet.getRange('A3').values = [[note]];
  sheet.getRange('A3').format.font = { name: 'Arial', size: 10, color: '#505050' };
}
function sourceIdentity(register) {
  return [
    ['Saved workspace', register.workspace.id], ['Workspace title', register.workspace.title],
    ['Saved revision', asText(register.workspace.revision)], ['Saved plan', register.plan_id],
    ['Plan title', register.title], ['Source capture', register.capture_id], ['Source selection', register.selection_id],
    ['Predecessor plan', register.predecessor_plan_id || ''], ['Requested formats', register.formats.join(', ')],
    ['PostGIS schema', register.postgis_schema], ['Source edition JSON', register.source_edition_json],
    ['Corrected-source changes JSON', register.source_changes_json], ['Plan note', register.plan_note]
  ];
}
async function create(register, registerRaw, stage, input) {
  const workbook = Workbook.create();
  const overview = workbook.worksheets.add('Overview');
  const specs = definitions(register);
  for (const spec of specs) spec.sheet = workbook.worksheets.add(spec.name);
  const baseline = workbook.worksheets.add('Original choices');
  const details = workbook.worksheets.add('Text details');
  const originalFiles = workbook.worksheets.add('Original files');
  const identity = workbook.worksheets.add('Saved plan');
  const originalChoices = [], detailRows = [], counts = {}, changedRanges = [];
  const retainedText = (value, context) => {
    const text = asText(value);
    if (text.length <= TEXT_LIMIT) return literal(text);
    const id = 'text-' + String(detailRows.length + 1).padStart(6, '0');
    const parts = chunks(text), digest = sha(Buffer.from(text));
    parts.forEach((part, i) => detailRows.push([id, context, i + 1, parts.length, digest, literal(part)]));
    return 'Full value: Text details / ' + id + ' (' + text.length + ' characters; SHA-256 ' + digest + ')';
  };
  const table = (sheet, title, note, columns, matrix, name) => {
    const end = FIRST + matrix.length - 1;
    formatBase(sheet, Math.max(end, FIRST), columns.length);
    heading(sheet, title, note, columns.length);
    columns.forEach((item, i) => { sheet.getRange(col(i) + ':' + col(i)).format.columnWidth = item.width; });
    sheet.getRangeByIndexes(FIRST - 2, 0, 1, columns.length).values = [columns.map(item => item.label)];
    const header = sheet.getRangeByIndexes(FIRST - 2, 0, 1, columns.length);
    header.format.fill = '#E6E6E6'; header.format.font.bold = true;
    header.format.rowHeight = 38;
    header.format.borders = { bottom: { style: 'thin', color: '#909090' } };
    if (matrix.length) {
      sheet.getRangeByIndexes(FIRST - 1, 0, matrix.length, columns.length).values = matrix;
      const object = sheet.tables.add('A' + (FIRST - 1) + ':' + col(columns.length - 1) + end, true, name);
      object.style = 'TableStyleLight1'; object.showFilterButton = true;
      for (let i = 0; i < columns.length; i++) {
        const body = sheet.getRangeByIndexes(FIRST - 1, i, matrix.length, 1);
        body.format.fill = columns[i].edit ? '#FFFFFF' : '#F4F4F4';
        body.setNumberFormat(columns[i].count ? '#,##0;(#,##0);0' : columns[i].date ? 'yyyy-mm-dd hh:mm:ss' : '@');
        if (columns[i].count) body.format.horizontalAlignment = 'right';
      }
    }
    return end;
  };
  for (const [index, spec] of specs.entries()) {
    const edits = spec.columns.map((item, i) => ({ ...item, i })).filter(item => item.edit);
    const columns = [...spec.columns, ...(edits.length ? [C('_change', 'Workbook changes', 23)] : [])];
    const formulas = [];
    const matrix = spec.rows.map((row, rowIndex) => {
      const values = spec.columns.map(item => {
        const value = row[item.key];
        if (item.date) return dateValue(value);
        if (item.count) return exactCount(value);
        return retainedText(value, spec.name + ' row ' + (FIRST + rowIndex) + ' / ' + item.label);
      });
      if (edits.length) {
        const checks = [];
        for (const item of edits) {
          // The same displayed exported value is the initial baseline, including a long-text pointer.
          const value = values[item.i], baseRow = FIRST + originalChoices.length;
          originalChoices.push([spec.name, FIRST + rowIndex, item.label, value, row.layer_id || row.project_id || '']);
          checks.push('NOT(EXACT(' + col(item.i) + (FIRST + rowIndex) + ',' + quoted('Original choices') + '!$D$' + baseRow + '))');
        }
        values.push(null);
        formulas.push(['=IF(OR(' + checks.join(',') + '),"Proposed edit","As exported")']);
      }
      return values;
    });
    const end = table(spec.sheet, spec.name, spec.note, columns, matrix, 'MappingTable' + index);
    counts[spec.name] = { rows: spec.rows.length, end, columns: columns.length };
    if (edits.length && matrix.length) {
      const letter = col(columns.length - 1);
      spec.sheet.getRange(letter + FIRST + ':' + letter + end).formulas = formulas;
      changedRanges.push(quoted(spec.name) + '!' + letter + FIRST + ':' + letter + end);
      spec.sheet.getRange(letter + FIRST + ':' + letter + end).conditionalFormats.add('containsText', {
        text: 'Proposed edit', format: { fill: '#DCDCDC', font: { bold: true, color: '#202020' } }
      });
    }
  }
  table(baseline, 'Original exported choices', 'This comparison baseline remains the original saved plan. Workbook change indicators compare the visible choice cells against these exported values.',
    [C('', 'Worksheet', 25), C('', 'Workbook row', 17, { count: true }), C('', 'Choice', 31), C('', 'Original exported value', 88), C('', 'Original object ID', 40)],
    originalChoices, 'OriginalChoices');
  const identityRows = sourceIdentity(register).map(([key, value]) => [key, retainedText(value, 'Saved plan / ' + key)]);
  table(identity, 'Complete saved-plan context', 'The original workspace revision, source edition and full plan context accompany every mapping worksheet.',
    [C('', 'Original value', 33), C('', 'Complete retained content', 110)], identityRows, 'SavedPlanContext');
  const originalRows = input.originals.map(item => [item.key, item.filename, item.descriptor.path, item.bytes.length, sha(item.bytes)]);
  table(originalFiles, 'Exact original files', 'These complete original files are included beside the workbook. Their descriptors and base64 bytes also remain in Mapping-Register.json.',
    [C('', 'Role', 25), C('', 'Delivered file', 43), C('', 'Original path', 76), C('', 'Bytes', 18, { count: true }), C('', 'SHA-256', 70)],
    originalRows, 'OriginalSourceFiles');
  table(details, 'Complete long text', 'Cells exceeding the spreadsheet text limit point here. Concatenate parts in numeric order to recover each complete value; hashes refer to the original UTF-8 text.',
    [C('', 'Text ID', 24), C('', 'Workbook location', 58), C('', 'Part', 10, { count: true }), C('', 'Parts', 10, { count: true }), C('', 'Text SHA-256', 70), C('', 'Complete part', 120)],
    detailRows, 'CompleteTextParts');
  formatBase(overview, 33, 8);
  for (const letter of ['A','B','C','D','E','F','G','H']) overview.getRange(letter + ':' + letter).format.columnWidth = 16;
  heading(overview, 'GIS migration mapping register', 'Review the exported source and choices, record agreed edits, then save and review the next plan in the original migration workspace.', 8);
  const latest = register.review.latest;
  const rows = [
    ['Plan', register.title], ['Exported review', latest ? latest.outcome : 'No saved review'],
    ['Source constraints', register.review.source_constraints_valid ? 'Valid in original full-source review' : 'Source issues retained in original review'],
    ['Workbook choices', null], ['Proposed edits', null],
    ['Original source features', exactCount(register.review.features)], ['Source issues', exactCount(register.review.source_issues)],
    ['Mapped fields', null], ['Source layers', null], ['Ordered project selections', null], ['Pending source decisions', null],
    ['Latest original review time', latest?.at || ''], ['Original review ID', latest?.id || ''],
    ['Saved workspace', register.workspace.id], ['Saved plan ID', register.plan_id], ['Source capture ID', register.capture_id],
    ['Source register SHA-256', input.register_sha256], ['Source file', 'Mapping-Register.json'],
    ['Complete original inputs', 'originals/ — exact plan, audit, source inspection, capture and imported inputs'],
    ['Review route', 'Apply agreed edits in the original Mapping editor; save the complete plan and its source review before generating a later register.'],
    ['Long values', 'Text details retains every part of a value above the cell limit. Full original JSON and decimal values also remain in Mapping-Register.json.'],
    ['Workbook baseline', 'Original choices is the exported comparison baseline. Proposed edits keep the exported review identity above until a new plan is saved and reviewed.'],
    ['Number handling', 'Source counts up to 15 decimal digits are numeric. Larger counts, IDs, hashes and native numeric lexemes retain exact text.']
  ];
  rows.forEach(([key, value], i) => {
    const row = FIRST + i;
    overview.mergeCells('A' + row + ':B' + row);
    overview.mergeCells('C' + row + ':H' + row);
    overview.getRange('A' + row).values = [[key]];
    overview.getRange('A' + row).format.font.bold = true;
    if (value !== null) overview.getRange('C' + row).values = [[literal(value)]];
    overview.getRange('C' + row).setNumberFormat(typeof value === 'number' ? '#,##0' : '@');
    overview.getRange('A' + row + ':H' + row).format.rowHeight = i >= 18 ? 48 : 32;
  });
  const proposedRow = FIRST + 4;
  overview.getRange('C' + proposedRow).formulas = [[changedRanges.length ? '=' + changedRanges.map(range => 'COUNTIF(' + range + ',"Proposed edit")').join('+') : '=0']];
  overview.getRange('C' + proposedRow).setNumberFormat('#,##0');
  overview.getRange('C' + (FIRST + 3)).formulas = [['=IF(C' + proposedRow + '=0,"As exported","Contains proposed edits")']];
  for (const [row, name] of [[FIRST + 7,'Field mapping'],[FIRST + 8,'Layers'],[FIRST + 9,'Project layers'],[FIRST + 10,'Decisions']]) {
    const item = counts[name];
    overview.getRange('C' + row).formulas = [[item.rows ? '=COUNTA(' + quoted(name) + '!A' + FIRST + ':A' + item.end + ')' : '=0']];
    overview.getRange('C' + row).setNumberFormat('#,##0');
  }
  workbook.recalculate();
  const inspection = await workbook.inspect({ kind: 'region', sheetId: 'Overview', range: 'A8:H30', maxChars: 7000, tableMaxRows: 24, tableMaxCols: 8 });
  await fs.writeFile(path.join(stage, 'workbook-inspection.json'), json(inspection));
  // One real choice change verifies the live edit indicator; restore the source choice before export.
  const firstSpec = specs.find(spec => spec.rows.length && spec.columns.some(column => column.edit));
  if (firstSpec) {
    const index = firstSpec.columns.findIndex(column => column.edit);
    const cell = firstSpec.sheet.getCell(FIRST - 1, index), original = cell.values;
    cell.values = [['Workbook review check ' + input.register_sha256.slice(0, 8)]];
    workbook.recalculate();
    need(overview.getRange('C' + proposedRow).values[0][0] === 1, 'Workbook choice changes must update the original overview.');
    cell.values = original;
    workbook.recalculate();
    need(overview.getRange('C' + proposedRow).values[0][0] === 0, 'Restore the original saved choice before delivery.');
  }
  await renderFile(workbook, 'Overview', path.join(stage, 'overview.png'));
  for (const name of ['Field mapping', 'Projects']) {
    if (counts[name].rows <= 120) await renderFile(workbook, name, path.join(stage, name === 'Projects' ? 'projects.png' : 'field-mapping.png'));
  }
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(path.join(stage, XLSX));
  return { sheets: specs.map(spec => ({ name: spec.name, rows: spec.rows.length })), long_text_parts: detailRows.length,
    source_choices: originalChoices.length, exported_review: latest || null, proposed_edits_on_export: 0 };
}
async function publish(output, publication, stage) {
  need(publication.schema === BUILD_SCHEMA && Array.isArray(publication.files), 'Retain the original workbook publication.');
  const seen = new Set();
  for (const item of publication.files) {
    need(typeof item.path === 'string' && item.path && !path.isAbsolute(item.path)
      && !item.path.split(/[\\/]/).includes('..') && !seen.has(item.path), 'Keep distinct original workbook members.');
    seen.add(item.path);
    const destination = path.resolve(output, item.path);
    need(destination.startsWith(output + path.sep), 'Keep every workbook member in the selected delivery.');
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    let current;
    try { current = await readRegular(destination); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current) {
      need(current.length === item.bytes && sha(current) === item.sha256, 'The delivered file changed; preserve it and use a new output directory.');
      continue;
    }
    const retained = path.resolve(stage, item.path);
    need(retained.startsWith(stage + path.sep), 'Keep original staged member identity.');
    const bytes = await readRegular(retained);
    need(bytes.length === item.bytes && sha(bytes) === item.sha256, 'The retained workbook output changed before publication.');
    // Staged outputs are final and immutable here; linking avoids a duplicate allocation.
    try { await fs.link(retained, destination); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const actual = await readRegular(destination);
      need(actual.length === item.bytes && sha(actual) === item.sha256, 'A different file already occupies the delivery path.');
    }
    const parent = await fs.open(path.dirname(destination), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  }
  await saveNew(path.join(output, 'COMPLETE.json'), json({ ...publication, state: 'COMPLETE' }));
  await fs.rm(stage, { recursive: true, force: true });
  console.log(JSON.stringify({ ...publication, state: 'COMPLETE', output_directory: output }));
}
async function main() {
  const args = process.argv.slice(2);
  need(args.length === 2, 'Usage: build_mapping_register.mjs ORIGINAL_REGISTER_JSON OUTPUT_DIRECTORY');
  const sourcePath = path.resolve(args[0]), output = path.resolve(args[1]);
  const raw = await readRegular(sourcePath), register = parse(raw), originals = validate(register);
  const self = await readRegular(fileURLToPath(import.meta.url));
  const request = { schema: BUILD_SCHEMA, register_sha256: sha(raw), register_bytes: raw.length, builder_sha256: sha(self),
    workspace_id: register.workspace.id, workspace_revision: register.workspace.revision, plan_id: register.plan_id, capture_id: register.capture_id };
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  await saveNew(path.join(output, 'build-request.json'), json(request));
  const completedPath = path.join(output, 'COMPLETE.json'), pendingPath = path.join(output, 'PENDING.json');
  async function optional(filename) {
    try { return await readRegular(filename); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const completedRaw = await optional(completedPath);
  if (completedRaw) {
    const retained = JSON.parse(completedRaw.toString('utf8'));
    need(JSON.stringify(retained.request) === JSON.stringify(request), 'Keep the existing workbook operation for its exact input.');
    for (const item of retained.files) {
      need(item.path && path.resolve(output, item.path).startsWith(output + path.sep), 'Keep original workbook members.');
      const bytes = await readRegular(path.join(output, item.path));
      need(bytes.length === item.bytes && sha(bytes) === item.sha256, 'The delivered workbook/file was edited; retain it and select a new output directory.');
    }
    console.log(JSON.stringify({ ...retained, reused: true })); return;
  }
  const pendingRaw = await optional(pendingPath);
  if (pendingRaw) {
    const pending = JSON.parse(pendingRaw.toString('utf8'));
    need(JSON.stringify(pending.publication.request) === JSON.stringify(request)
      && /^\.render-[A-Za-z0-9_-]+$/.test(pending.stage), 'Keep the original staged workbook and input.');
    await publish(output, pending.publication, path.join(output, pending.stage)); return;
  }
  const stage = await fs.mkdtemp(path.join(output, '.render-'));
  await fs.chmod(stage, 0o700);
  const build = await create(register, raw, stage, { ...request, originals });
  const guide = 'GIS migration mapping register\n\n'
    + 'This workbook is generated from one original saved migration workspace revision and plan. Source identities, review history, original inputs and every mapping decision remain in Mapping-Register.json and originals/.\n\n'
    + 'Start in Overview, then use the worksheet filters for source fields, layer mappings, coordinates, ordered keys, projects, resolved native types and pending source decisions. White choice cells accept proposed edits. Workbook change indicators compare them with Original choices. The exported source-review outcome and review identity refer to the original saved plan.\n\n'
    + 'Apply agreed edits in the original Mapping editor, save the complete plan, and perform its normal source review. Generate the next workbook into a new output directory from that saved plan. Keep this delivered workbook and its original JSON together for comparison.\n\n'
    + 'Each project has one definition in Projects, with ordered member-specific options in Project layers. Full choices beyond the spreadsheet cell limit are retained as ordered Text details parts and in the original JSON, with an exact UTF-8 SHA-256. Use that complete source JSON or the original editor when changing those long choices. Original JSON files retain full bytes, decimal number lexemes, field order and source metadata. Counts above 15 decimal digits are shown as exact text.\n\n'
    + 'The workbook uses no macros or external data connections. The XLSX review surface, complete native plan, audit and source inputs travel together.\n';
  const delivered = [{ path: 'Mapping-Register.json', bytes: raw }, { path: 'Mapping-Register-Guide.txt', bytes: Buffer.from(guide) },
    ...originals.map(item => ({ path: item.filename, bytes: item.bytes }))];
  for (const name of await fs.readdir(stage)) delivered.push({ path: name, bytes: await readRegular(path.join(stage, name)) });
  for (const item of delivered) {
    const filename = path.join(stage, item.path);
    await saveNew(filename, item.bytes);
    const handle = await fs.open(filename, 'r');
    try { await handle.chmod(0o600); await handle.sync(); } finally { await handle.close(); }
  }
  const publication = { schema: BUILD_SCHEMA, request, build, files: delivered.map(item => ({ path: item.path, bytes: item.bytes.length, sha256: sha(item.bytes) })) };
  // This complete output manifest is durable before any final workbook path becomes visible.
  await saveNew(pendingPath, json({ publication, stage: path.basename(stage) }));
  await publish(output, publication, stage);
}
await main();
