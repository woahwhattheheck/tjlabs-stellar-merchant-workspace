// MIT. Bounded canonical JSON hashing with the original FRED byte identities.
import { createHash } from 'node:crypto';
import { canonical } from './model.mjs';

function* fragments(value, primitive, sizes, depth = 0) {
  if (typeof value === 'string') {
    if (value.length <= 16384) { yield JSON.stringify(value); return; }
    yield '"';
    for (let start = 0; start < value.length;) {
      let end = Math.min(start + 16384, value.length);
      // JSON.stringify must see each original surrogate pair together.
      if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 &&
          value.charCodeAt(end - 1) <= 0xdbff && value.charCodeAt(end) >= 0xdc00 &&
          value.charCodeAt(end) <= 0xdfff) end--;
      yield JSON.stringify(value.slice(start, end)).slice(1, -1);
      start = end;
    }
    yield '"'; return;
  }
  if (value === null || typeof value !== 'object') { yield primitive(value); return; }
  if (Array.isArray(value)) {
    if (sizes && value.length) sizes.prettyExtra += value.length * (1 + 2 * (depth + 1)) + 1 + 2 * depth;
    yield '[';
    for (let index = 0; index < value.length; index++) {
      if (index) yield ',';
      if (index in value) yield* fragments(value[index], primitive, sizes, depth + 1);
    }
    yield ']'; return;
  }
  const keys = Object.keys(value).sort();
  if (sizes && keys.length) sizes.prettyExtra += keys.length * (2 + 2 * (depth + 1)) + 1 + 2 * depth;
  yield '{'; let separator = '';
  for (const key of keys) {
    yield separator; separator = ',';
    yield* fragments(key, primitive, null); yield ':';
    yield* fragments(value[key], primitive, sizes, depth + 1);
  }
  yield '}';
}

function* chunks(value, primitive, sizes) {
  let pieces = [], characters = 0;
  for (const piece of fragments(value, primitive, sizes)) {
    pieces.push(piece); characters += piece.length;
    if (characters >= 65536) {
      yield pieces.join(''); pieces = []; characters = 0;
    }
  }
  if (pieces.length) yield pieces.join('');
}

/** Original sorted-key compact JSON. No trailing newline is emitted. */
export function* canonicalJSONChunks(value, { primitive = canonical } = {}) {
  yield* chunks(value, primitive, null);
}

/**
 * Hash and count the same compact bytes without allocating the whole string.
 * For the original JSON-safe graphs, prettyBytes is the exact UTF-8 length of
 * JSON.stringify(value, null, 2). Both byte counts exclude the final newline.
 */
export function canonicalJSONInfo(value, { primitive = canonical } = {}) {
  const hash = createHash('sha256'), sizes = { prettyExtra: 0 };
  let bytes = 0;
  for (const chunk of chunks(value, primitive, sizes)) {
    hash.update(chunk, 'utf8'); bytes += Buffer.byteLength(chunk, 'utf8');
  }
  return { sha256: hash.digest('hex'), bytes, prettyBytes: bytes + sizes.prettyExtra };
}

export function canonicalJSONDigest(value, options = {}) {
  return canonicalJSONInfo(value, options).sha256;
}
