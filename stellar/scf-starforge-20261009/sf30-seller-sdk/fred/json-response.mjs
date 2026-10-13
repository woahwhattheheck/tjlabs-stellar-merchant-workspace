// MIT. Stream complete JSON downloads with the original formatted file bytes.
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

function* quoted(value) {
  yield '"';
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 16384, value.length);
    if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 &&
        value.charCodeAt(end - 1) <= 0xdbff && value.charCodeAt(end) >= 0xdc00 &&
        value.charCodeAt(end) <= 0xdfff) end--;
    yield JSON.stringify(value.slice(start, end)).slice(1, -1);
    start = end;
  }
  yield '"';
}
const omitted = value => value === undefined || typeof value === 'function' || typeof value === 'symbol';

/** Original project/source envelopes are JSON-safe plain objects and arrays. */
function* fragments(value, depth, ancestors) {
  if (typeof value === 'string') { yield* quoted(value); return; }
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError('A complete JSON value is required.');
    yield serialized; return;
  }
  if (ancestors.has(value)) throw new TypeError('The complete JSON source contains a cycle.');
  ancestors.add(value);
  try {
    const array = Array.isArray(value), keys = array ? null : Object.keys(value).filter(key => !omitted(value[key]));
    const count = array ? value.length : keys.length;
    const open = array ? '[' : '{', close = array ? ']' : '}';
    if (!count) { yield open + close; return; }
    const indent = '  '.repeat(depth), nextIndent = indent + '  ';
    yield open + '\n';
    for (let index = 0; index < count; index++) {
      if (index) yield ',\n';
      yield nextIndent;
      if (!array) { yield* quoted(keys[index]); yield ': '; }
      const item = value[array ? index : keys[index]];
      yield* fragments(array && omitted(item) ? null : item, depth + 1, ancestors);
    }
    yield '\n' + indent + close;
  } finally { ancestors.delete(value); }
}

/** Exact JSON.stringify(value, null, 2) plus one newline, in bounded chunks. */
export function* fredJsonFileChunks(value) {
  let pieces = [], size = 0;
  for (const piece of fragments(value, 0, new Set())) {
    pieces.push(piece); size += piece.length;
    if (size >= 65536) { yield pieces.join(''); pieces = []; size = 0; }
  }
  pieces.push('\n');
  yield pieces.join('');
}

/** Retain Content-Length and original download bytes while honoring HTTP backpressure. */
export async function sendFredJsonFile(res, status, value, { headers = {}, filename } = {}) {
  let bytes = 0;
  for (const chunk of fredJsonFileChunks(value)) bytes += Buffer.byteLength(chunk, 'utf8');
  res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8',
    'content-length': bytes,
    ...(filename ? { 'content-disposition': 'attachment; filename="' + filename + '"' } : {}) });
  await pipeline(Readable.from(fredJsonFileChunks(value), { objectMode: false, highWaterMark: 65536 }), res);
}
