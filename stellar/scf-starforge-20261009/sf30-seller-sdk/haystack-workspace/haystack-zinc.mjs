/**
 * Zinc 3.0 wire codec for the existing Haystack JSON-v4 value model.
 * Grammar: Project-Haystack/haystack-defs d042781e7031c125332920c9800e3d04e8f16cf7,
 * src/docHaystack/doc/Zinc.fandoc. No store, network or ontology conversion.
 * The owner validates complete values before encoding and after decoding.
 */
const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const TAG = /^[a-z][a-zA-Z0-9_]*$/;
const REF = /^[a-zA-Z0-9_:.~\-]+$/;
const UNIT = /^[a-zA-Z%_/$\u0080-\uFFFF]+$/u;
const ZONE = /^[a-zA-Z][a-zA-Z0-9_+\-]*$/;
const XSTR = /^[A-Z][a-zA-Z0-9_]*$/;
const TICK = String.fromCharCode(96);
const pointer = (path, key) => path + '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1');
function failure(options) {
  const make = options.error ?? ((code, message, details) => Object.assign(new Error(message), { name: 'HaystackError', code, status: 400, details }));
  if (typeof make !== 'function') throw new TypeError('error must be a function.');
  return (code, message, path, extra = {}) => { throw make(code, message, { path, ...extra }); };
}
function depthLimit(options, fail) {
  const maximum = options.maxDepth ?? 128;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1024)
    fail('ZINC_DEPTH_OPTION', 'maxDepth must be an integer from 1 through 1024.', '');
  return maximum;
}
function put(target, name, value) {
  Object.defineProperty(target, name, { value, enumerable: true, writable: true, configurable: true });
}
function validUnicode(value, fail, path) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) fail('INVALID_UNICODE', 'Unpaired Unicode surrogate.', path);
    } else if (c >= 0xDC00 && c <= 0xDFFF) fail('INVALID_UNICODE', 'Unpaired Unicode surrogate.', path);
  }
}

/** Decode one complete grid. Original bytes remain with the importing owner. */
export function parseZinc(text, options = {}) {
  const fail = failure(options), maximum = depthLimit(options, fail);
  if (typeof text !== 'string') fail('ZINC_TEXT', 'Zinc source must be decoded text.', '');
  validUnicode(text, fail, '');
  let at = 0;
  const diagnostics = [];
  const space = () => { const start = at; while (text[at] === ' ') at++; return at > start; };
  const newline = () => {
    if (text[at] === '\n') { at++; return true; }
    if (text[at] === '\r' && text[at + 1] === '\n') { at += 2; return true; }
    return false;
  };
  const lineEnd = () => at === text.length || text[at] === '\n' || text[at] === '\r';
  const syntax = (message, path, offset = at, code = 'INVALID_ZINC') =>
    fail(code, message, path, { characterOffset: offset });
  const level = (depth, path) => {
    if (depth > maximum) fail('VALUE_DEPTH', 'Value nesting exceeds the supported depth.', path, { maximum, characterOffset: at });
  };
  function name(path) {
    const match = /^[a-z][a-zA-Z0-9_]*/.exec(text.slice(at));
    if (!match) syntax('Expected a lowercase Haystack tag name.', path);
    at += match[0].length; return match[0];
  }
  function quoted(path, uri = false) {
    const delimiter = uri ? TICK : '"';
    if (text[at++] !== delimiter) syntax('Expected a quoted value.', path);
    let result = '';
    while (at < text.length) {
      const c = text[at++];
      if (c === delimiter) { validUnicode(result, fail, path); return result; }
      if (c.charCodeAt(0) < 32) syntax('Control characters must be escaped in a quoted value.', path, at - 1);
      if (c !== '\\') { result += c; continue; }
      if (at === text.length) syntax('Incomplete quoted escape.', path);
      const escaped = text[at++];
      if (escaped === 'u') {
        const digits = text.slice(at, at + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(digits)) syntax('Unicode escapes require exactly four hexadecimal digits.', path);
        at += 4; result += String.fromCharCode(parseInt(digits, 16)); continue;
      }
      if (uri) {
        if (!':/?#[]@\\&=;'.includes(escaped) && escaped !== TICK)
          syntax('Unsupported URI escape.', path, at - 2);
        // URI escapes remove reserved-character meaning; retain the backslash.
        result += '\\' + escaped;
      } else {
        const escapes = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\', '$': '$' };
        if (!OWN(escapes, escaped)) syntax('Unsupported string escape.', path, at - 2);
        result += escapes[escaped];
      }
    }
    syntax('Unterminated quoted value.', path);
  }
  function diagnostic(code, message, path, offset, originalLiteral) {
    diagnostics.push({ code, severity: 'warning', message, details: { path, characterOffset: offset, originalLiteral } });
  }
  function numeric(literal, path, offset) {
    const result = Number(literal.replace(/_/g, ''));
    if (!Number.isFinite(result)) fail('ZINC_NUMBER_RANGE', 'Decimal exceeds the finite IEEE 754 range; use a typed Zinc special number.', path, { characterOffset: offset, originalLiteral: literal });
    if (Number.isInteger(result) && !Number.isSafeInteger(result))
      diagnostic('NUMBER_PRECISION', 'Integer-valued number is outside the exact integer range of the Haystack IEEE 754 representation.', path, offset, literal);
    if (result === 0 && /[1-9]/.test(literal.split(/[eE]/)[0]))
      diagnostic('NUMBER_UNDERFLOW', 'The original nonzero decimal rounds to zero in the Haystack IEEE 754 representation.', path, offset, literal);
    return result;
  }
  function tags(target, path, depth, end, commaOk = false) {
    let first = true;
    while (at < text.length) {
      const separated = space();
      if (end()) return;
      if (!first && !separated) syntax('Separate metadata tags with a space or an allowed dictionary comma.', path);
      const start = at, key = name(path);
      if (OWN(target, key)) syntax('Duplicate Haystack tag: ' + key + '.', pointer(path, key), start, 'DUPLICATE_ZINC_TAG');
      let child = { _kind: 'marker' };
      if (text[at] === ':') { at++; space(); child = value(pointer(path, key), depth + 1); }
      put(target, key, child);
      first = false;
      if (commaOk) {
        const after = at; space();
        if (text[at] === ',') { at++; space(); first = true; if (end()) return; }
        else at = after;
      }
    }
    if (!end()) syntax('Unterminated metadata.', path);
  }
  function value(path, depth) {
    level(depth, path); space();
    const c = text[at], start = at;
    if (c === '"') return quoted(path);
    if (c === TICK) return { _kind: 'uri', val: quoted(path, true) };
    if (c === '@' || c === '^') {
      at++;
      const match = /^[a-zA-Z0-9_:.~\-]+/.exec(text.slice(at));
      if (!match) syntax('Reference and symbol IDs must be nonempty.', path);
      at += match[0].length;
      const result = { _kind: c === '@' ? 'ref' : 'symbol', val: match[0] };
      if (c === '@') {
        const end = at; const separated = space();
        if (separated && text[at] === '"') result.dis = quoted(pointer(path, 'dis'));
        else at = end;
      }
      return result;
    }
    if (c === '[') {
      at++; space(); const result = [];
      if (text[at] === ']') { at++; return result; }
      while (at < text.length) {
        result.push(value(pointer(path, result.length), depth + 1)); space();
        if (text[at] === ']') { at++; return result; }
        if (text[at++] !== ',') syntax('Expected list comma or closing bracket.', path);
        space(); if (text[at] === ']') { at++; return result; }
      }
      syntax('Unterminated list.', path);
    }
    if (c === '{') {
      at++; const result = {};
      tags(result, path, depth, () => text[at] === '}', true);
      if (text[at++] !== '}') syntax('Unterminated dictionary.', path);
      return result;
    }
    if (text.startsWith('<<', at)) {
      at += 2; space(); newline(); space();
      const result = grid(path, depth + 1, true);
      if (!text.startsWith('>>', at)) syntax('Nested grid needs its closing >>.', path);
      at += 2; return result;
    }
    if (text.startsWith('C(', at) && !/^C\( *"/.test(text.slice(at))) {
      at += 2; const result = { _kind: 'coord' };
      for (const key of ['lat', 'lng']) {
        space(); const offset = at, match = /^-?\d[\d_]*(?:\.\d[\d_]*)?/.exec(text.slice(at));
        if (!match) syntax('Expected a decimal coordinate.', pointer(path, key));
        at += match[0].length; result[key] = numeric(match[0], pointer(path, key), offset); space();
        if (text[at++] !== (key === 'lat' ? ',' : ')')) syntax('Coordinate requires two decimal degrees.', path);
      }
      return result;
    }
    const extended = /^([A-Z][a-zA-Z0-9_]*)\(/.exec(text.slice(at));
    if (extended) {
      at += extended[0].length; space();
      const result = { _kind: 'xstr', type: extended[1], val: quoted(pointer(path, 'val')) };
      space(); if (text[at++] !== ')') syntax('XStr requires its closing parenthesis.', path);
      return result;
    }
    const match = /^[^ ,\n\r\t\]\}>]+/.exec(text.slice(at));
    if (!match) syntax('Expected a Zinc value.', path);
    const token = match[0]; at += token.length;
    if (token === 'N') return null;
    if (token === 'M') return { _kind: 'marker' };
    if (token === 'R') return { _kind: 'remove' };
    if (token === 'NA') return { _kind: 'na' };
    if (token === 'T' || token === 'F') return token === 'T';
    if (['INF', '-INF', 'NaN'].includes(token)) return { _kind: 'number', val: token };
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return { _kind: 'date', val: token };
    if (/^\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(token)) return { _kind: 'time', val: token };
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+\-]\d{2}:\d{2})$/.test(token)) {
      const result = { _kind: 'dateTime', val: token }, end = at;
      if (space()) {
        const zone = /^[a-zA-Z][a-zA-Z0-9_+\-]*/.exec(text.slice(at));
        if (zone && text[at + zone[0].length] !== ':') { result.tz = zone[0]; at += zone[0].length; }
        else at = end;
      }
      if (!token.endsWith('Z') && !OWN(result, 'tz')) syntax('A non-Z DateTime needs its original timezone name.', path, start, 'ZINC_DATETIME_ZONE');
      return result;
    }
    const decimal = /^(-?\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+\-]?\d[\d_]*)?)([a-zA-Z%_/$\u0080-\uFFFF]*)$/u.exec(token);
    if (decimal) {
      const result = numeric(decimal[1], decimal[2] ? pointer(path, 'val') : path, start);
      return decimal[2] ? { _kind: 'number', val: result, unit: decimal[2] } : result;
    }
    syntax('Unsupported or malformed Zinc literal.', path, start);
  }
  function grid(path, depth, nested) {
    level(depth, path); space();
    if (!text.startsWith('ver:', at)) syntax('Grid metadata must begin with ver:"3.0".', pointer(path, 'meta'));
    at += 4; space();
    const version = quoted(pointer(pointer(path, 'meta'), 'ver'));
    if (version !== '3.0') syntax('Only Zinc wire version 3.0 is supported.', pointer(pointer(path, 'meta'), 'ver'), at, 'GRID_VERSION');
    const result = { _kind: 'grid', meta: { ver: version }, cols: [], rows: [] };
    if (!lineEnd() && text[at] !== ' ') syntax('Separate grid metadata tags with a space.', pointer(path, 'meta'));
    tags(result.meta, pointer(path, 'meta'), depth + 1, lineEnd);
    if (!newline()) syntax('The metadata line needs a newline and column definitions.', path);
    const names = new Set(); space();
    while (at < text.length) {
      const columnPath = pointer(pointer(path, 'cols'), result.cols.length), column = { name: name(columnPath) };
      if (names.has(column.name)) syntax('Duplicate grid column.', columnPath, at, 'DUPLICATE_GRID_COLUMN');
      names.add(column.name);
      const meta = {};
      if (!lineEnd() && text[at] !== ',' && text[at] !== ' ') syntax('Separate column metadata tags with a space.', columnPath);
      tags(meta, pointer(columnPath, 'meta'), depth + 2, () => lineEnd() || text[at] === ',');
      if (Object.keys(meta).length) column.meta = meta;
      result.cols.push(column);
      if (text[at] !== ',') break;
      at++; space();
      if (at === text.length) syntax('A column comma must be followed by a column name.', pointer(path, 'cols'));
    }
    if (!result.cols.length) syntax('Zinc grids require at least one column.', path);
    if (at === text.length && !nested) return result;
    if (!newline()) syntax('Column definitions need their own complete line.', path);
    while (at < text.length) {
      space();
      if (nested && text.startsWith('>>', at)) return result;
      if (at === text.length) break;
      if (newline()) {
        while (space() || newline()) {}
        if (nested ? text.startsWith('>>', at) : at === text.length) return result;
        syntax('Blank lines cannot replace a data row; a one-column null row uses N.', path);
      }
      const row = {}, rowPath = pointer(pointer(path, 'rows'), result.rows.length);
      for (let i = 0; i < result.cols.length; i++) {
        space();
        const empty = lineEnd() || text[at] === ',' || (nested && text.startsWith('>>', at));
        if (!empty) put(row, result.cols[i].name, value(pointer(rowPath, result.cols[i].name), depth + 2));
        space();
        if (i < result.cols.length - 1) {
          if (text[at++] !== ',') syntax('Every row must supply the complete declared column count.', rowPath, at - 1, 'ZINC_ROW_WIDTH');
        } else if (text[at] === ',') syntax('Row contains more cells than its declared columns.', rowPath, at, 'ZINC_ROW_WIDTH');
      }
      result.rows.push(row);
      if (at === text.length && !nested) return result;
      if (!newline()) syntax('Expected the end of a complete data row.', rowPath);
    }
    if (nested) syntax('Unterminated nested grid.', path);
    return result;
  }
  const result = grid('', 0, false);
  while (space() || newline()) {}
  if (at !== text.length) syntax('Unexpected content after the complete Zinc grid.', '');
  return { grid: result, diagnostics };
}

function quote(text, uri, fail, path) {
  if (typeof text !== 'string') fail('ZINC_TYPED_STRING', 'Expected a string.', path);
  validUnicode(text, fail, path);
  let result = uri ? TICK : '"';
  for (const c of text) {
    if (uri && (c === '\\' || c === TICK)) result += '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
    else if (!uri && (c === '\\' || c === '"')) result += '\\' + c;
    else if (c.charCodeAt(0) < 32) result += '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
    else result += c;
  }
  return result + (uri ? TICK : '"');
}
function decimalNumber(number) { return Object.is(number, -0) ? '-0' : String(number); }
function coordinateNumber(number) {
  const text = decimalNumber(number);
  if (!/[eE]/.test(text)) return text;
  const parts = /^(-?)(\d+)(?:\.(\d+))?[eE]([+\-]?\d+)$/.exec(text);
  const digits = parts[2] + (parts[3] ?? ''), point = parts[2].length + Number(parts[4]);
  return parts[1] + (point <= 0 ? '0.' + '0'.repeat(-point) + digits
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
    : digits.slice(0, point) + '.' + digits.slice(point));
}

/**
 * Produce a derived Zinc representation, ending in LF. JSON-v4 unitless
 * number/dict wrappers and absent versus empty column metadata are normalized.
 * Blank cells preserve omitted row members; N preserves explicit null. Zinc
 * consumers may treat them equivalently. Download original source for fidelity.
 */
export function encodeZinc(grid, options = {}) {
  const fail = failure(options), maximum = depthLimit(options, fail);
  function checkDepth(depth, path) {
    if (depth > maximum) fail('VALUE_DEPTH', 'Value nesting exceeds the supported depth.', path, { maximum });
  }
  function object(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      fail('ZINC_OBJECT', 'Expected a plain Haystack object.', path);
  }
  function members(value, path, required, optional = []) {
    object(value, path);
    const allowed = new Set([...required, ...optional]);
    for (const key of required) if (!OWN(value, key)) fail('ZINC_TYPED_MEMBER', 'Required typed member is missing.', pointer(path, key));
    for (const key of Object.keys(value)) if (!allowed.has(key)) fail('ZINC_UNREPRESENTABLE', 'Zinc cannot retain this additional typed member.', pointer(path, key));
  }
  function dict(value, path, depth, omit = []) {
    object(value, path); checkDepth(depth, path);
    if (OWN(value, '_kind') && value._kind !== 'dict') fail('ZINC_DICT', 'Expected a dictionary.', path);
    const pairs = [];
    for (const key of Object.keys(value)) {
      if (key === '_kind' || omit.includes(key)) continue;
      if (!TAG.test(key)) fail('ZINC_UNREPRESENTABLE', 'Zinc cannot retain a dictionary key outside the tag grammar.', pointer(path, key));
      // Explicit :M also avoids optional DateTime timezone/tag ambiguity.
      pairs.push(key + ':' + valueText(value[key], pointer(path, key), depth + 1));
    }
    return pairs.join(' ');
  }
  function valueText(value, path, depth) {
    checkDepth(depth, path);
    if (value === null) return 'N';
    if (typeof value === 'boolean') return value ? 'T' : 'F';
    if (typeof value === 'string') return quote(value, false, fail, path);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('NONFINITE_JSON_NUMBER', 'Special numbers require their original typed number object.', path);
      return decimalNumber(value);
    }
    if (Array.isArray(value)) return '[' + Array.from({ length: value.length }, (_, i) => {
      if (!OWN(value, i)) fail('ZINC_UNREPRESENTABLE', 'Zinc lists require explicit values, including null.', pointer(path, i));
      return valueText(value[i], pointer(path, i), depth + 1);
    }).join(',') + ']';
    object(value, path);
    const kind = OWN(value, '_kind') ? value._kind : 'dict';
    if (kind === 'dict') return '{' + dict(value, path, depth) + '}';
    if (kind === 'grid') return '<<\n' + gridText(value, path, depth + 1) + '>>';
    if (['marker', 'remove', 'na'].includes(kind)) {
      members(value, path, ['_kind']); return { marker: 'M', remove: 'R', na: 'NA' }[kind];
    }
    if (kind === 'number') {
      members(value, path, ['_kind', 'val'], ['unit']);
      const n = value.val, hasUnit = OWN(value, 'unit');
      if (hasUnit && (typeof value.unit !== 'string' || !UNIT.test(value.unit))) fail('ZINC_UNREPRESENTABLE', 'The original unit cannot be encoded in Zinc.', pointer(path, 'unit'));
      if (hasUnit && value.unit.startsWith('_')) fail('ZINC_UNREPRESENTABLE', 'A leading unit underscore is ambiguous with a Zinc digit separator; use the original JSON export.', pointer(path, 'unit'));
      if (['INF', '-INF', 'NaN'].includes(n)) {
        if (hasUnit) fail('ZINC_UNREPRESENTABLE', 'The Zinc grammar cannot retain a unit on this special number.', path);
        return n;
      }
      if (typeof n !== 'number' || !Number.isFinite(n)) fail('ZINC_NUMBER', 'Expected a finite number or a typed special number.', pointer(path, 'val'));
      // A unit like e3 would be an exponent, so emit an explicit exponent first.
      const number = decimalNumber(n), unit = hasUnit ? value.unit : '';
      return number + (/^[eE][+\-]?\d/.test(unit) && !/[eE]/.test(number) ? 'e0' : '') + unit;
    }
    if (kind === 'coord') {
      members(value, path, ['_kind', 'lat', 'lng']);
      for (const [key, limit] of [['lat', 90], ['lng', 180]])
        if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || Math.abs(value[key]) > limit) fail('INVALID_COORDINATE', 'Coordinate is outside its finite degree range.', pointer(path, key));
      return 'C(' + coordinateNumber(value.lat) + ',' + coordinateNumber(value.lng) + ')';
    }
    if (kind === 'xstr') {
      members(value, path, ['_kind', 'type', 'val']);
      if (!XSTR.test(value.type)) fail('ZINC_XSTR', 'Invalid original XStr type.', pointer(path, 'type'));
      return value.type + '(' + quote(value.val, false, fail, pointer(path, 'val')) + ')';
    }
    const optional = kind === 'ref' ? ['dis'] : kind === 'dateTime' ? ['tz'] : [];
    members(value, path, ['_kind', 'val'], optional);
    if (typeof value.val !== 'string') fail('ZINC_TYPED_STRING', 'Typed value needs its original string.', pointer(path, 'val'));
    if (kind === 'ref' || kind === 'symbol') {
      if (!REF.test(value.val)) fail('INVALID_REFERENCE_ID', 'Invalid reference or symbol ID.', pointer(path, 'val'));
      return (kind === 'ref' ? '@' : '^') + value.val + (OWN(value, 'dis') ? ' ' + quote(value.dis, false, fail, pointer(path, 'dis')) : '');
    }
    if (kind === 'uri') return quote(value.val, true, fail, pointer(path, 'val'));
    if (kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value.val)) fail('ZINC_UNREPRESENTABLE', 'Zinc requires the original four-digit calendar date.', path);
      return value.val;
    }
    if (kind === 'time') {
      if (!/^\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(value.val)) fail('ZINC_UNREPRESENTABLE', 'Zinc time supports at most nine fractional digits.', path);
      return value.val;
    }
    if (kind === 'dateTime') {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+\-]\d{2}:\d{2})$/.test(value.val))
        fail('ZINC_UNREPRESENTABLE', 'Zinc requires a four-digit DateTime with an explicit offset and at most nine fractional digits.', path);
      if (OWN(value, 'tz') && (typeof value.tz !== 'string' || !ZONE.test(value.tz))) fail('ZINC_UNREPRESENTABLE', 'Invalid original timezone name.', pointer(path, 'tz'));
      if (!value.val.endsWith('Z') && !OWN(value, 'tz')) fail('ZINC_UNREPRESENTABLE', 'A non-Z DateTime needs its original timezone; none will be inferred.', path);
      return value.val + (OWN(value, 'tz') ? ' ' + value.tz : '');
    }
    fail('UNKNOWN_HAYSTACK_KIND', 'The original kind has no Zinc representation.', pointer(path, '_kind'));
  }
  function gridText(value, path, depth) {
    checkDepth(depth, path); members(value, path, ['_kind', 'meta', 'cols', 'rows']);
    if (value._kind !== 'grid') fail('EXPECTED_GRID', 'Expected a complete Haystack grid.', path);
    object(value.meta, pointer(path, 'meta'));
    if (value.meta.ver !== '3.0') fail('GRID_VERSION', 'Only Zinc wire version 3.0 is supported.', pointer(path, 'meta'));
    if (!Array.isArray(value.cols) || !value.cols.length) fail('ZINC_UNREPRESENTABLE', 'Zinc requires at least one declared column.', pointer(path, 'cols'));
    if (!Array.isArray(value.rows)) fail('GRID_ROWS', 'Expected the original rows array.', pointer(path, 'rows'));
    const metadata = dict(value.meta, pointer(path, 'meta'), depth + 1, ['ver']), names = new Set();
    const cols = value.cols.map((col, i) => {
      const p = pointer(pointer(path, 'cols'), i); members(col, p, ['name'], ['meta']);
      if (typeof col.name !== 'string' || !TAG.test(col.name) || names.has(col.name)) fail('GRID_COLUMN_NAME', 'Columns need unique valid tag names.', p);
      names.add(col.name);
      const meta = OWN(col, 'meta') ? dict(col.meta, pointer(p, 'meta'), depth + 2) : '';
      return col.name + (meta ? ' ' + meta : '');
    });
    const rows = value.rows.map((row, i) => {
      const p = pointer(pointer(path, 'rows'), i); object(row, p);
      if (OWN(row, '_kind') && row._kind !== 'dict') fail('ZINC_DICT', 'Expected a row dictionary.', p);
      for (const name of Object.keys(row)) if (name !== '_kind' && !names.has(name)) fail('ZINC_UNREPRESENTABLE', 'Zinc cannot retain a row member absent from its original columns.', pointer(p, name));
      if (value.cols.length === 1 && !OWN(row, value.cols[0].name)) fail('ZINC_UNREPRESENTABLE', 'A one-column absent cell cannot be encoded without changing it to explicit null; use the original JSON export.', p);
      return value.cols.map(col => OWN(row, col.name) ? valueText(row[col.name], pointer(p, col.name), depth + 2) : '').join(',');
    });
    return 'ver:"3.0"' + (metadata ? ' ' + metadata : '') + '\n' + cols.join(',') + '\n' + (rows.length ? rows.join('\n') + '\n' : '');
  }
  return gridText(grid, '', 0);
}
