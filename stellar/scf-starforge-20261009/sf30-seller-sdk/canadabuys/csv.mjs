// MIT. Complete UTF-8 RFC 4180 intake. Original bytes remain in the workspace.
import { failure } from './core.mjs';
export function decodeCsv(input) {
  const bytes = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  let rawText;
  try { rawText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw failure('INVALID_UTF8', 'CanadaBuys source must be complete UTF-8 CSV'); }
  return { bytes, rawText };
}
export function parseCsv(rawText) {
  if (typeof rawText !== 'string') throw failure('INVALID_CSV', 'CSV source must be text');
  const source = rawText.replace(/^\uFEFF/, '');
  const records = [];
  let record = [], field = '', quoted = false, endedQuote = false, touched = false, line = 1;
  const finishField = () => { record.push(field); field = ''; endedQuote = false; };
  const finishRecord = () => { finishField(); records.push(record); record = []; touched = false; };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; endedQuote = true; }
      } else { field += char; if (char === '\n') line++; }
      touched = true;
      continue;
    }
    if (endedQuote && char !== ',' && char !== '\r' && char !== '\n')
      throw failure('INVALID_CSV', 'Unexpected text after a quoted field', 422, { physicalLine: line, recordNumber: records.length + 1 });
    if (char === '"') {
      if (field.length) throw failure('INVALID_CSV', 'A quote inside an unquoted field must be escaped', 422, { physicalLine: line });
      quoted = true; touched = true;
    } else if (char === ',') { finishField(); touched = true; }
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      finishRecord(); line++;
    } else { field += char; touched = true; }
  }
  if (quoted) throw failure('INCOMPLETE_CSV', 'Source ended inside a quoted field', 422, { physicalLine: line });
  if (touched || record.length || field.length || endedQuote) finishRecord();
  if (!records.length) throw failure('CSV_HEADER_REQUIRED', 'Source needs the complete CanadaBuys header row', 422);
  const columns = records.shift();
  if (columns.some(column => !column) || new Set(columns).size !== columns.length)
    throw failure('INVALID_CSV_HEADER', 'CSV headers must be nonempty and unique', 422);
  const rows = records.map((values, index) => {
    if (values.length !== columns.length)
      throw failure('CSV_COLUMN_COUNT', 'Every record must retain all original columns', 422,
        { rowNumber: index + 2, expectedColumns: columns.length, actualColumns: values.length });
    return { rowNumber: index + 2, row: Object.fromEntries(columns.map((column, columnIndex) => [column, values[columnIndex]])) };
  });
  return { columns, rows };
}
export function encodeCsv(columns, records, { spreadsheetSafe = false } = {}) {
  const field = value => {
    let body = value === null || value === undefined ? '' : String(value);
    if (spreadsheetSafe && /^[\t\r\n ]*[=+\-@]/.test(body)) body = "'" + body;
    return /[",\r\n]/.test(body) ? '"' + body.replaceAll('"', '""') + '"' : body;
  };
  return [columns, ...records.map(record => columns.map(column => record[column]))]
    .map(row => row.map(field).join(',')).join('\r\n') + '\r\n';
}
