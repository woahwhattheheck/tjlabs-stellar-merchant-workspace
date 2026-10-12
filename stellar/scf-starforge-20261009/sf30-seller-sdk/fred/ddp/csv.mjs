// MIT. Original quoted CSV records, including their source locations.
import { need } from '../model.mjs';

export function readFredDdpCsv(text, { maxRows = 1000000, maxColumns = 16384, maxCellCharacters = 8 * 1024 * 1024 } = {}) {
  need(typeof text === 'string', 'The original CSV text is required.');
  for (const [name, value] of Object.entries({ maxRows, maxColumns, maxCellCharacters }))
    need(Number.isSafeInteger(value) && value >= 1, name + ' must be a positive integer.');
  const records = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0, rowStart = i, rowLine = 1, line = 1;
  let cells = [], value = '', quoted = false, closed = false, started = false, dirty = false;
  const field = () => {
    need(cells.length < maxColumns, 'The original CSV exceeds its column capacity.');
    cells.push(value); value = ''; quoted = false; closed = false; started = false;
  };
  const record = end => {
    field();
    need(records.length < maxRows, 'The original CSV exceeds its record capacity.');
    records.push({ row: records.length + 1, cells, location: { start: rowStart, end, line: rowLine } });
    cells = []; dirty = false;
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { value += '"'; i += 2; }
        else { quoted = false; closed = true; i++; }
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && text[i + 1] === '\n') { value += '\r\n'; i += 2; }
        else { value += ch; i++; }
        line++;
      } else { value += ch; i++; }
      need(value.length <= maxCellCharacters, 'The original CSV exceeds its cell capacity.');
      continue;
    }
    if (ch === ',') { field(); dirty = true; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      record(i);
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line++; rowLine = line; rowStart = i;
      continue;
    }
    need(!closed, 'Only a delimiter or record ending may follow a quoted CSV field.');
    if (ch === '"') {
      need(!started, 'A quoted CSV field must begin at its original field boundary.');
      quoted = true; started = true; dirty = true; i++; continue;
    }
    value += ch; started = true; dirty = true; i++;
    need(value.length <= maxCellCharacters, 'The original CSV exceeds its cell capacity.');
  }
  need(!quoted, 'The original CSV ends inside a quoted field.');
  if (dirty || started || closed || cells.length) record(i);
  return { records, hadBom: text.charCodeAt(0) === 0xfeff, lines: line, characters: text.length };
}
export function fredDdpCsv(rows) {
  need(Array.isArray(rows) && rows.every(Array.isArray), 'CSV export requires complete rows.');
  return rows.map(row => row.map(value => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }).join(',')).join('\r\n') + '\r\n';
}
