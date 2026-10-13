// MIT. Private query credentials for the original SF30 upstream exchange.
// Configuration retains environment references. Values stay in request closures.
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const queryName = /^\$?[A-Za-z_][A-Za-z0-9_.-]{0,79}(?:\[[A-Za-z_][A-Za-z0-9_.-]{0,79}\])?$/;
const environmentName = /^[A-Za-z_][A-Za-z0-9_]*$/;
const invalid = () => { throw new TypeError('Invalid private upstream query credentials'); };
const fault = code => Object.assign(new Error(code), {code});

export function compileQueryEnvironment(value = {}) {
  if (!plain(value) || Object.keys(value).length > 16) invalid();
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, reference] of entries)
    if (!queryName.test(name) || typeof reference !== 'string' || !environmentName.test(reference)) invalid();
  return Object.freeze(Object.fromEntries(entries));
}

/** Public source names and mapped backend names cannot own a credential field. */
export function assertQueryCredentialSeparation(query, credentials) {
  const pairs = query instanceof Map ? [...query] : Array.isArray(query) ? query.map(name => [name, name]) : Object.entries(query);
  const publicNames = new Set(pairs.flat());
  if (Object.keys(credentials).some(name => publicNames.has(name)))
    throw new TypeError('Private query credentials conflict with public query mapping');
}

export function serverQueryCredentials(value = {}) {
  if (!plain(value) || Object.keys(value).length > 16) invalid();
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, credential] of entries) {
    if (!queryName.test(name) || typeof credential !== 'string' || !credential ||
        credential.length > 8192 || /[\x00-\x1f\x7f]/.test(credential) || !credential.isWellFormed()) invalid();
  }
  return Object.freeze(Object.fromEntries(entries));
}

/** Read only after an admitted attempt, or an explicit eager launch validation. */
export function resolveQueryEnvironment(references, env) {
  const values = Object.create(null);
  for (const [name, reference] of Object.entries(references)) {
    const value = Object.hasOwn(env, reference) ? env[reference] : undefined;
    if (typeof value !== 'string' || !value)
      throw new TypeError('Missing query credential environment variable: ' + reference);
    values[name] = value;
  }
  return serverQueryCredentials(values);
}

export async function resolveUpstreamQueryCredentials(configured, lifetime) {
  lifetime.signal.throwIfAborted();
  const values = typeof configured === 'function'
    ? await lifetime.wait(configured({signal:lifetime.signal})) : configured;
  lifetime.signal.throwIfAborted();
  return serverQueryCredentials(values);
}

const percentCase = text => text.replace(/%[0-9a-f]{2}/gi, value => value.toUpperCase());
const formEncode = text => encodeURIComponent(text)
  .replace(/[!'()~]/g, value => '%' + value.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+');

/**
 * A request-private redactor for common provider reflections. It preserves
 * unmodified JSON bytes, including large numeric literals. Exact credential
 * text and URI/form encodings are removed from JSON strings and text; binary
 * reflection is refused by the caller. No values or patterns are inspectable.
 */
export function createQueryCredentialGuard(credentials) {
  const values = Object.values(serverQueryCredentials(credentials));
  if (!values.length) return null;
  const patterns = new Set();
  for (const value of values) {
    for (const encoded of [value, encodeURIComponent(value), formEncode(value),
      JSON.stringify(value).slice(1, -1),
      value.split('').map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('')])
      patterns.add(percentCase(encoded));
  }
  const needles = [...patterns].sort((a, b) => b.length - a.length);
  const contains = value => {
    const text = percentCase(value);
    return needles.some(needle => text.includes(needle));
  };
  // A short operator token may occur in the normal marker itself.
  const marker = contains('[redacted]') ? '' : '[redacted]';
  function redact(value) {
    const normalized = percentCase(value), spans = [];
    for (const needle of needles) {
      let from = 0, at;
      while ((at = normalized.indexOf(needle, from)) !== -1) {
        if (spans.length >= 65536) throw fault('UPSTREAM_CREDENTIAL_REFLECTED');
        spans.push([at, at + needle.length]); from = at + 1;
      }
    }
    if (!spans.length) return value;
    spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const merged = [];
    for (const span of spans) {
      const last = merged.at(-1);
      if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
      else merged.push([...span]);
    }
    let cursor = 0, output = '';
    for (const [start, end] of merged) { output += value.slice(cursor, start) + marker; cursor = end; }
    return output + value.slice(cursor);
  }
  function text(value, {json = false, mixed = false} = {}) {
    let output = json ? value.replace(/"(?:\\[\s\S]|[^"\\])*"/g, literal => {
      let decoded;
      try { decoded = JSON.parse(literal); } catch { return redact(literal); }
      const clean = redact(decoded);
      return clean === decoded ? literal : JSON.stringify(clean);
    }) : redact(value);
    if (mixed) output = redact(output);
    // A credential outside a JSON string cannot be replaced without changing
    // JSON syntax or numeric meaning. The original exchange returns a safe error.
    if (contains(output)) throw fault('UPSTREAM_CREDENTIAL_REFLECTED');
    return output;
  }
  function stream(format, maxLineBytes = 1024 * 1024) {
    if (!['sse', 'ndjson'].includes(format) || !Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1)
      throw new TypeError('Invalid credential stream format');
    let pending = '', complete = false;
    // UTF-8 byte length without allocating a second full copy of each line.
    const byteLength = value => {
      let bytes = 0;
      for (const char of value) { const code = char.codePointAt(0); bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4; }
      return bytes;
    };
    const line = value => {
      if (byteLength(value) > maxLineBytes) throw fault('UPSTREAM_RESPONSE_TOO_LARGE');
      if (format === 'ndjson') return text(value, {json:true});
      // SSE data may contain JSON. Decode its string literals before applying
      // the same exact-value guard to fields, event IDs and comment lines.
      return text(value, {json:true, mixed:true});
    };
    return Object.freeze({
      write(value, final = false) {
        if (complete || typeof value !== 'string') throw new TypeError('Invalid credential stream state');
        pending += value;
        const output = [];
        let start = 0;
        for (let i = 0; i < pending.length; i++) {
          const char = pending[i];
          if (char !== '\n' && char !== '\r') continue;
          if (char === '\r' && i + 1 === pending.length && !final) break;
          const end = char === '\r' && pending[i + 1] === '\n' ? i + 2 : i + 1;
          output.push(line(pending.slice(start, i)) + pending.slice(i, end));
          start = end; i = end - 1;
        }
        pending = pending.slice(start);
        if (byteLength(pending) > maxLineBytes) throw fault('UPSTREAM_RESPONSE_TOO_LARGE');
        if (final) { if (pending) output.push(line(pending)); pending = ''; complete = true; }
        return output;
      },
    });
  }
  return Object.freeze({contains, text, stream});
}
