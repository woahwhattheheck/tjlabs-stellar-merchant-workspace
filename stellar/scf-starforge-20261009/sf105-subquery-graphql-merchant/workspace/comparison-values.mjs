// MIT. The same exact-value comparison runs in the native workspace and offline review pages.
export const RESPONSE_COMPARISON_ALGORITHM = 'stellar-forge.graphql-response-values.v1';
const NUMBER = Symbol('original JSON number');
const MISSING = Symbol('absent JSON member');
const integer = value => {
  const negative = value.startsWith('-'), digits = value.replace(/^[+-]/, '').replace(/^0+/, '') || '0';
  return { negative: negative && digits !== '0', digits };
};
const magnitude = (a, b) => a.length === b.length ? a === b ? 0 : a < b ? -1 : 1 : a.length < b.length ? -1 : 1;
function plus(a, b) {
  const out = []; let i = a.length - 1, j = b.length - 1, carry = 0;
  while (i >= 0 || j >= 0 || carry) {
    const value = (i >= 0 ? a.charCodeAt(i--) - 48 : 0) + (j >= 0 ? b.charCodeAt(j--) - 48 : 0) + carry;
    out.push(String(value % 10)); carry = Math.floor(value / 10);
  }
  return out.reverse().join('');
}
function minus(a, b) {
  const out = []; let i = a.length - 1, j = b.length - 1, borrow = 0;
  while (i >= 0) {
    let value = a.charCodeAt(i--) - 48 - (j >= 0 ? b.charCodeAt(j--) - 48 : 0) - borrow;
    borrow = value < 0 ? 1 : 0; if (borrow) value += 10; out.push(String(value));
  }
  return out.reverse().join('').replace(/^0+/, '') || '0';
}
function exponent(raw, shift) {
  const a = integer(raw), b = integer(String(shift));
  if (a.negative === b.negative) {
    const value = plus(a.digits, b.digits); return a.negative && value !== '0' ? '-' + value : value;
  }
  const order = magnitude(a.digits, b.digits);
  if (!order) return '0';
  const greater = order > 0 ? a : b, lesser = order > 0 ? b : a;
  const value = minus(greater.digits, lesser.digits);
  return greater.negative ? '-' + value : value;
}
/** Decimal normalization uses digit strings, never a rounded JS Number or a huge power. */
export function canonicalJsonNumber(raw) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match) throw new Error('The JSON parser did not retain a numeric source token.');
  let coefficient = (match[2] + (match[3] ?? '')).replace(/^0+/, '');
  if (!coefficient) return '0';
  const trailing = coefficient.length - coefficient.replace(/0+$/, '').length;
  if (trailing) coefficient = coefficient.slice(0, -trailing);
  return match[1] + coefficient + 'e' + exponent(match[4] ?? '0', trailing - (match[3]?.length ?? 0));
}
export function valueKind(value) {
  if (value === MISSING) return 'absent';
  if (value === null) return 'null';
  if (typeof value === 'object' && Object.hasOwn(value, NUMBER)) return 'number';
  return Array.isArray(value) ? 'array' : typeof value;
}
// Parse structure iteratively. Numeric literals are retained before any Number conversion.
// JSON string decoding uses the ordinary string grammar; duplicate object keys keep the last value.
function exactJson(text) {
  let at = 0, result, hasRoot = false;
  const stack = [], numberToken = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const invalid = () => { throw new SyntaxError('Invalid JSON source.'); };
  const whitespace = () => { while (at < text.length && (text[at] === ' ' || text[at] === '\t'
    || text[at] === '\n' || text[at] === '\r')) at++; };
  const string = () => {
    if (text[at] !== '"') invalid();
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === '"') return JSON.parse(text.slice(start, at));
      if (char === '\\') at++;
    }
    invalid();
  };
  const accept = value => {
    const parent = stack.at(-1);
    if (!parent) { if (hasRoot) invalid(); result = value; hasRoot = true; return; }
    if (parent.kind === 'array') parent.value.push(value);
    else Object.defineProperty(parent.value, parent.key, {
      value, enumerable: true, writable: true, configurable: true,
    });
    parent.state = 'after';
  };
  const value = () => {
    const char = text[at];
    if (char === '{' || char === '[') {
      at++; const object = char === '{', item = object ? {} : [];
      accept(item); stack.push({ value: item, kind: object ? 'object' : 'array', state: 'first' }); return;
    }
    if (char === '"') { accept(string()); return; }
    for (const [token, scalar] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, at)) { at += token.length; accept(scalar); return; }
    }
    numberToken.lastIndex = at;
    const match = numberToken.exec(text);
    if (!match) invalid();
    at = numberToken.lastIndex;
    const raw = match[0];
    accept(Object.freeze({ [NUMBER]: { raw, canonical: canonicalJsonNumber(raw) } }));
  };
  while (true) {
    whitespace();
    const frame = stack.at(-1);
    if (!frame) {
      if (hasRoot) { if (at !== text.length) invalid(); return result; }
      value(); continue;
    }
    if (frame.kind === 'array') {
      if (frame.state === 'first' && text[at] === ']') { at++; stack.pop(); continue; }
      if (frame.state === 'first' || frame.state === 'value') { value(); continue; }
      if (text[at] === ']') { at++; stack.pop(); continue; }
      if (text[at] !== ',') invalid();
      at++; frame.state = 'value'; continue;
    }
    if (frame.state === 'first' && text[at] === '}') { at++; stack.pop(); continue; }
    if (frame.state === 'first' || frame.state === 'key') {
      frame.key = string(); frame.state = 'colon'; continue;
    }
    if (frame.state === 'colon') {
      if (text[at] !== ':') invalid(); at++; frame.state = 'value'; continue;
    }
    if (frame.state === 'value') { value(); continue; }
    if (text[at] === '}') { at++; stack.pop(); continue; }
    if (text[at] !== ',') invalid();
    at++; frame.state = 'key';
  }
}
export function parseResponse(text) {
  if (typeof text !== 'string') return { structured: false, error: 'The original response is not valid UTF-8 JSON.' };
  try { return { structured: true, value: exactJson(text), error: null }; }
  catch (error) {
    return { structured: false, error: error instanceof SyntaxError
      ? 'The original response is not valid JSON.' : error.message || 'Exact JSON comparison is unavailable.' };
  }
}
function scalarEqual(a, b) {
  const kind = valueKind(a);
  return kind === valueKind(b) && (kind === 'number' ? a[NUMBER].canonical === b[NUMBER].canonical : Object.is(a, b));
}
const escaped = value => value.replace(/~/g, '~0').replace(/\//g, '~1');
/** Object order is immaterial; array positions remain significant. Missing differs from null. */
export function* responseChanges(baseline, candidate) {
  const stack = [{ baseline, candidate, path: '' }];
  while (stack.length) {
    const row = stack.at(-1), { baseline: a, candidate: b, path } = row;
    if (row.cursor !== undefined) {
      if (row.cursor >= row.length) { stack.pop(); continue; }
      const key = row.keys ? row.keys[row.cursor++] : String(row.cursor++);
      stack.push({ path: path + '/' + escaped(key), baseline: Object.hasOwn(a, key) ? a[key] : MISSING,
        candidate: Object.hasOwn(b, key) ? b[key] : MISSING });
      continue;
    }
    const ak = valueKind(a), bk = valueKind(b);
    if (ak === 'absent' || bk === 'absent' || ak !== bk) {
      stack.pop(); yield { baseline: a, candidate: b, path, change: ak === 'absent' ? 'added' : bk === 'absent' ? 'removed' : 'changed' }; continue;
    }
    if (ak !== 'array' && ak !== 'object') {
      stack.pop();
      if (!scalarEqual(a, b)) yield { baseline: a, candidate: b, path, change: 'changed' };
      continue;
    }
    row.keys = ak === 'array' ? null : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    row.length = row.keys ? row.keys.length : Math.max(a.length, b.length); row.cursor = 0;
  }
}
export function changeArea(path) {
  const root = path.split('/')[1];
  return root === 'data' || root === 'errors' || root === 'extensions' ? root : 'envelope';
}
export function* valueJsonChunks(value) {
  const stack = [{ value }];
  while (stack.length) {
    const item = stack.at(-1), current = item.value, kind = valueKind(current);
    if (item.cursor !== undefined) {
      if (item.cursor >= item.length) { stack.pop(); yield kind === 'array' ? ']' : '}'; continue; }
      if (item.cursor) yield ',';
      const key = item.keys ? item.keys[item.cursor++] : String(item.cursor++);
      if (kind === 'object') yield JSON.stringify(key) + ':';
      stack.push({ value: current[key] }); continue;
    }
    if (kind !== 'object' && kind !== 'array') {
      stack.pop(); yield kind === 'absent' ? '(absent)' : kind === 'number' ? current[NUMBER].raw : JSON.stringify(current); continue;
    }
    item.keys = kind === 'array' ? null : Object.keys(current).sort();
    item.length = item.keys ? item.keys.length : current.length; item.cursor = 0;
    yield kind === 'array' ? '[' : '{';
  }
}
export function valueDisplay(value, limit = 512) {
  let text = '', truncated = false;
  for (const chunk of valueJsonChunks(value)) {
    if (text.length + chunk.length > limit) { text += chunk.slice(0, Math.max(0, limit - text.length)); truncated = true; break; }
    text += chunk;
  }
  return { type: valueKind(value), text, truncated,
    ...(valueKind(value) === 'array' ? { length: value.length } : {}),
    ...(valueKind(value) === 'object' ? { members: Object.keys(value).length } : {}) };
}
export function changeDisplay(row, limit = 512) {
  return { path: row.path, area: changeArea(row.path), change: row.change,
    baseline: valueDisplay(row.baseline, limit), candidate: valueDisplay(row.candidate, limit) };
}
function structure(parsed) {
  if (!parsed.structured) return { structured: false, error: parsed.error, root: null, errors: null };
  const value = parsed.value, errors = valueKind(value) === 'object' && Object.hasOwn(value, 'errors') ? value.errors : MISSING;
  return { structured: true, error: null, root: valueKind(value),
    errors: { present: errors !== MISSING, type: valueKind(errors), count: Array.isArray(errors) ? errors.length : null } };
}
export function summarizeResponses(baseline, candidate) {
  const left = structure(baseline), right = structure(candidate);
  const counts = { total: 0, added: 0, removed: 0, changed: 0, data: 0, errors: 0, extensions: 0, envelope: 0 };
  if (baseline.structured && candidate.structured) for (const row of responseChanges(baseline.value, candidate.value)) {
    counts.total++; counts[row.change]++; counts[changeArea(row.path)]++;
  }
  return { baseline: left, candidate: right, jsonEquivalent: baseline.structured && candidate.structured ? counts.total === 0 : null,
    changes: baseline.structured && candidate.structured ? counts : null };
}
export function responseChangePage(baseline, candidate, { offset = 0, limit = 50 } = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Choose a nonnegative change offset and a page of 1–100 differences.');
  if (!baseline.structured || !candidate.structured) return { offset, limit, items: [], nextOffset: null,
    structured: false, baselineError: baseline.error, candidateError: candidate.error };
  const items = []; let index = 0, more = false, characters = 0;
  for (const row of responseChanges(baseline.value, candidate.value)) {
    if (index++ < offset) continue;
    if (items.length >= limit) { more = true; break; }
    const displayed = changeDisplay(row), size = JSON.stringify(displayed).length;
    if (items.length && characters + size > 1024 * 1024) { more = true; break; }
    items.push(displayed); characters += size;
  }
  return { offset, limit, items, nextOffset: more ? offset + items.length : null, structured: true };
}
