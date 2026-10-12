'use strict';

// Reconstruct documented source carriers as data; callers retain provider responses.
// Depends on the maintained connected_sha256 and connected_slack_pages readers.

function createSourceCarrierReader(dependencies) {
  if (!dependencies || typeof dependencies.sha256Bytes !== "function" ||
      typeof dependencies.sha256Utf8 !== "function" ||
      typeof dependencies.projectSlackReadFailure !== "function") {
    throw new TypeError("Supply the maintained SHA-256 and Slack read-failure functions");
  }
  const {sha256Bytes, sha256Utf8, projectSlackReadFailure} = dependencies;
  const schemas = new Set(["commons.source-bundle/v1", "commons.source-carrier.v1", "housing.source-chunk.v1"]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const keyOf = row => JSON.stringify([row.path, row.sha256]);
  const issue = (code, message, extra = {}) => Object.assign({code, message}, extra);
  function failure(code, message, extra) { const error = new Error(message); error.detail = issue(code, message, extra); return error; }
  function rowIdentity(row, where) {
    if (!object(row) || typeof row.path !== "string" || !row.path.length || row.path.includes("\0") ||
        !Number.isSafeInteger(row.bytes) || row.bytes < 0 ||
        typeof row.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(row.sha256)) {
      throw failure("INVALID_FILE_IDENTITY", "Expected a path, nonnegative byte count and full SHA-256", {where});
    }
    return {path: row.path, bytes: row.bytes, sha256: row.sha256.toLowerCase()};
  }
  function normalizeJsonWhitespace(text) {
    let quoted = false, escaped = false, replacements = 0, output = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        output += c;
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
      } else {
        if (c === '"') quoted = true;
        if (c === "\u00a0") { output += " "; replacements++; } else output += c;
      }
    }
    return {text: output, outside_string_nbsp_replacements: replacements};
  }
  function parseJson(text, where, normalizations) {
    const normalized = normalizeJsonWhitespace(text);
    let value;
    try { value = JSON.parse(normalized.text); }
    catch (error) { throw failure("INVALID_JSON", "Cannot parse complete JSON at " + where + ": " + error.message, {where}); }
    if (normalized.outside_string_nbsp_replacements) {
      normalizations.push({where, outside_string_nbsp_replacements: normalized.outside_string_nbsp_replacements,
        original_utf8: sha256Utf8(text), normalized_utf8: sha256Utf8(normalized.text)});
    }
    return value;
  }
  function decodeBase64(text, where, maximum) {
    if (typeof text !== "string" || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      throw failure("INVALID_BASE64", "Expected complete canonical base64 at " + where, {where});
    }
    const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
    const length = text.length / 4 * 3 - padding;
    if (length > maximum) throw failure("FILE_LIMIT", "Decoded source exceeds max_file_bytes", {where, bytes: length, maximum});
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    if (padding === 2 && (alphabet.indexOf(text[text.length - 3]) & 15) !== 0 ||
        padding === 1 && (alphabet.indexOf(text[text.length - 2]) & 3) !== 0) {
      throw failure("INVALID_BASE64", "Nonzero base64 padding bits at " + where, {where});
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (let i = 0; i < text.length; i += 4) {
      const a = alphabet.indexOf(text[i]), b = alphabet.indexOf(text[i + 1]);
      const c = text[i + 2] === "=" ? 0 : alphabet.indexOf(text[i + 2]);
      const d = text[i + 3] === "=" ? 0 : alphabet.indexOf(text[i + 3]);
      const n = (a << 18) | (b << 12) | (c << 6) | d;
      if (offset < length) bytes[offset++] = n >>> 16;
      if (offset < length) bytes[offset++] = (n >>> 8) & 255;
      if (offset < length) bytes[offset++] = n & 255;
    }
    return bytes;
  }
  function decodeUtf8(bytes, where) {
    let text = "", buffer = [];
    const bad = offset => { throw failure("INVALID_UTF8", "Invalid UTF-8 in complete source at byte " + offset, {where, byte_offset: offset}); };
    for (let i = 0; i < bytes.length;) {
      const start = i, lead = bytes[i++];
      let code = lead, count = 0, minimum = 0;
      if (lead <= 0x7f) { /* ASCII */ }
      else if (lead >= 0xc2 && lead <= 0xdf) { code = lead & 31; count = 1; minimum = 0x80; }
      else if (lead >= 0xe0 && lead <= 0xef) { code = lead & 15; count = 2; minimum = 0x800; }
      else if (lead >= 0xf0 && lead <= 0xf4) { code = lead & 7; count = 3; minimum = 0x10000; }
      else bad(start);
      if (i + count > bytes.length) bad(start);
      for (let j = 0; j < count; j++) {
        const c = bytes[i++];
        if (c < 0x80 || c > 0xbf) bad(i - 1);
        code = (code << 6) | (c & 63);
      }
      if (code < minimum || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) bad(start);
      buffer.push(String.fromCodePoint(code));
      if (buffer.length >= 4096) { text += buffer.join(""); buffer = []; }
    }
    return text + buffer.join("");
  }
  function read(inputs, options = {}) {
    if (!Array.isArray(inputs) || !inputs.length) throw new TypeError("inputs must be a nonempty array of {id, value}");
    if (!object(options)) throw new TypeError("options must be an object");
    const limits = {max_input_chars: 67108864, max_file_bytes: 67108864, max_total_bytes: 134217728,
      max_files: 4096, max_records: 65536, ...(options.limits || {})};
    for (const [name, value] of Object.entries(limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("Invalid reader limit: " + name);
    }
    const issues = [], sources = [], carriers = [], ignored = [], normalizations = [];
    const candidates = new Map(), declarations = new Map();
    let records = 0;
    const addDeclaration = (row, where) => {
      const id = rowIdentity(row, where), key = keyOf(id);
      const existing = declarations.get(key);
      if (existing && existing.bytes !== id.bytes) throw failure("CONFLICTING_BYTE_COUNT", "Conflicting byte counts for " + id.path, {where, path: id.path});
      declarations.set(key, id);
      return id;
    };
    const candidateFor = (id, where) => {
      const key = keyOf(id);
      let candidate = candidates.get(key);
      if (!candidate) {
        if (candidates.size >= limits.max_files) throw failure("FILE_LIMIT", "Source versions exceed max_files", {where, maximum: limits.max_files});
        candidate = {...id, content: null, chunks: new Map(), chunk_total: null, sources: [], issue: null};
        candidates.set(key, candidate);
      }
      if (candidate.bytes !== id.bytes) throw failure("CONFLICTING_BYTE_COUNT", "Conflicting byte counts for " + id.path, {where, path: id.path});
      candidate.sources.push(where);
      return candidate;
    };
    const completeFile = (candidate, base64, where) => {
      const bytes = decodeBase64(base64, where, limits.max_file_bytes);
      const actual = sha256Bytes(bytes);
      if (actual.bytes !== candidate.bytes || actual.sha256 !== candidate.sha256) {
        throw failure("SOURCE_DIGEST_MISMATCH", "Complete source differs from its declared bytes or SHA-256", {
          where, path: candidate.path, expected: {bytes: candidate.bytes, sha256: candidate.sha256}, actual});
      }
      const content = decodeUtf8(bytes, where);
      if (candidate.content !== null && candidate.content !== content) {
        throw failure("SOURCE_CONTENT_CONFLICT", "Conflicting source contents for " + candidate.path, {where, path: candidate.path});
      }
      candidate.content = content;
    };
    const fileRecord = (row, where) => {
      const id = addDeclaration(row, where), candidate = candidateFor(id, where);
      if (row.encoding !== "base64") throw failure("UNSUPPORTED_ENCODING", "Expected encoding base64 for " + id.path, {where, encoding: row.encoding});
      completeFile(candidate, row.content, where);
    };
    const visit = (value, where) => {
      records++;
      if (records > limits.max_records) throw failure("RECORD_LIMIT", "Carrier records exceed max_records", {where, maximum: limits.max_records});
      if (Array.isArray(value)) {
        if (value.length && value.every(row => object(row) && own(row, "path") && own(row, "bytes") && own(row, "sha256") && !own(row, "schema") && !own(row, "content") && !own(row, "base64"))) {
          for (let i = 0; i < value.length; i++) addDeclaration(value[i], where + "[" + i + "]");
          carriers.push({where, schema: "observed-file-manifest", files: value.length});
        } else {
          for (let i = 0; i < value.length; i++) visit(value[i], where + "[" + i + "]");
        }
        return;
      }
      if (!object(value) || !schemas.has(value.schema)) {
        ignored.push({where, schema: object(value) && typeof value.schema === "string" ? value.schema : null});
        return;
      }
      const metadata = {where, schema: value.schema};
      for (const field of ["repository", "source_ref", "merged_pr", "scope", "loader"]) if (own(value, field)) metadata[field] = value[field];
      carriers.push(metadata);
      if (value.schema === "commons.source-bundle/v1") {
        if (!Array.isArray(value.files) || !value.files.length) throw failure("EMPTY_BUNDLE", "A source bundle must contain complete file records", {where});
        for (let i = 0; i < value.files.length; i++) fileRecord(value.files[i], where + ".files[" + i + "]");
      } else if (value.schema === "commons.source-carrier.v1") {
        fileRecord(value, where);
      } else {
        const id = addDeclaration(value, where), candidate = candidateFor(id, where);
        if (!Number.isSafeInteger(value.index) || !Number.isSafeInteger(value.total) ||
            value.total < 1 || value.total > limits.max_records || value.index < 0 || value.index >= value.total ||
            typeof value.base64 !== "string") {
          throw failure("INVALID_CHUNK", "Expected a zero-based chunk index, total and base64 fragment", {where, path: id.path});
        }
        if (candidate.chunk_total !== null && candidate.chunk_total !== value.total) {
          throw failure("CHUNK_TOTAL_CONFLICT", "Chunk total differs for " + id.path, {where, path: id.path});
        }
        candidate.chunk_total = value.total;
        if (candidate.chunks.has(value.index) && candidate.chunks.get(value.index) !== value.base64) {
          throw failure("CHUNK_CONTENT_CONFLICT", "Different source fragments use the same chunk index", {where, path: id.path, index: value.index});
        }
        candidate.chunks.set(value.index, value.base64);
      }
    };
    const readText = (text, where) => {
      if (text.length > limits.max_input_chars) throw failure("INPUT_LIMIT", "Input exceeds max_input_chars", {where, chars: text.length, maximum: limits.max_input_chars});
      const start = text.replace(/^[ \t\r\n\u00a0]+/, "");
      if (start.startsWith("{") || start.startsWith("[")) {
        const parsed = parseJson(text, where, normalizations);
        if (object(parsed) && (typeof parsed.markdown_content === "string" || object(parsed.structuredContent) || Array.isArray(parsed.content))) {
          documentedPayload(parsed, where + ".parsed_json");
        } else visit(parsed, where);
        return;
      }
      const pattern = /^[ \t\u00a0]*```[ \t]*(?:json|application\/json)[ \t]*\r?\n([\s\S]*?)^[ \t\u00a0]*```[ \t]*(?:\r?\n|$)/gmi;
      let match, found = 0;
      while ((match = pattern.exec(text))) {
        const location = where + ".json_fence[" + found + "]";
        visit(parseJson(match[1], location, normalizations), location); found++;
      }
      if (!found) throw failure("NO_JSON_CARRIER", "No complete JSON document or JSON-labelled Markdown fence", {where});
    };
    const documentedPayload = (value, where) => {
      const projected = projectSlackReadFailure(value);
      if (projected) throw failure("PROVIDER_READ_FAILED", "Original provider read failed", {where, provider: projected});
      if (object(value) && typeof value.markdown_content === "string") {
        readText(value.markdown_content, where + ".markdown_content");
        return {canvas_id: value.canvas_id ?? null, format: "slack-canvas"};
      }
      if (typeof value === "string") { readText(value, where); return {format: "text"}; }
      if (Array.isArray(value) || object(value) && schemas.has(value.schema)) {
        visit(value, where); return {format: "source-record"};
      }
      if (object(value) && object(value.structuredContent)) {
        const inner = value.structuredContent, innerFailure = projectSlackReadFailure(inner);
        if (innerFailure) throw failure("PROVIDER_READ_FAILED", "Structured provider read failed", {where: where + ".structuredContent", provider: innerFailure});
        if (typeof inner.markdown_content === "string" || schemas.has(inner.schema)) return documentedPayload(inner, where + ".structuredContent");
      }
      if (object(value) && Array.isArray(value.content)) {
        let parsed = null, location = null;
        for (let i = 0; i < value.content.length; i++) {
          const block = value.content[i];
          if (!object(block) || block.type !== "text" || typeof block.text !== "string") continue;
          const start = block.text.replace(/^[ \t\r\n\u00a0]+/, "");
          if (!start.startsWith("{") && !start.startsWith("[")) continue;
          const at = where + ".content[" + i + "].text";
          const inner = parseJson(block.text, at, normalizations);
          const innerFailure = projectSlackReadFailure(inner);
          if (innerFailure) throw failure("PROVIDER_READ_FAILED", "Text provider payload reports a failure", {where: at, provider: innerFailure});
          if (Array.isArray(inner) || object(inner) && (typeof inner.markdown_content === "string" || schemas.has(inner.schema))) {
            if (parsed !== null) throw failure("AMBIGUOUS_PROVIDER_PAYLOAD", "Multiple source payloads in one provider envelope; select the intended input", {where});
            parsed = inner; location = at;
          }
        }
        if (parsed !== null) return documentedPayload(parsed, location);
      }
      throw failure("NO_DOCUMENTED_PAYLOAD", "Expected a source record, Canvas response, or complete JSON/Markdown text", {where});
    };
    const inputIds = new Set();
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i], id = object(input) && typeof input.id === "string" ? input.id : "input-" + i;
      try {
        if (!object(input) || !own(input, "value")) throw failure("INVALID_INPUT", "Input requires id and value", {input_index: i});
        if (inputIds.has(id)) throw failure("DUPLICATE_INPUT_ID", "Input IDs must be unique", {input_id: id});
        inputIds.add(id);
        const source = {id, raw: input.value}; sources.push(source);
        const rawText = typeof input.value === "string" ? input.value : JSON.stringify(input.value);
        if (typeof rawText !== "string") throw failure("INVALID_INPUT", "Input has no serializable provider representation", {input_id: id});
        if (rawText.length > limits.max_input_chars) throw failure("INPUT_LIMIT", "Input exceeds max_input_chars", {input_id: id, chars: rawText.length, maximum: limits.max_input_chars});
        source.retained_representation_utf8 = sha256Utf8(rawText);
        Object.assign(source, documentedPayload(input.value, id));
      } catch (error) {
        issues.push(error.detail || issue("READ_ERROR", error.message, {input_id: id}));
      }
    }
    for (const candidate of candidates.values()) {
      if (candidate.content !== null || candidate.chunk_total === null) continue;
      const missing = [];
      for (let i = 0; i < candidate.chunk_total; i++) if (!candidate.chunks.has(i)) missing.push(i);
      if (missing.length) {
        candidate.issue = issue("MISSING_CHUNKS", "Source file has missing chunks", {path: candidate.path, sha256: candidate.sha256, missing_indices: missing});
        continue;
      }
      try {
        let joined = "";
        for (let i = 0; i < candidate.chunk_total; i++) joined += candidate.chunks.get(i);
        completeFile(candidate, joined, candidate.sources[0] + ".joined_chunks");
      } catch (error) { candidate.issue = error.detail || issue("CHUNK_READ_ERROR", error.message, {path: candidate.path}); }
    }
    const desired = new Map(), selected = new Map();
    const explicit = own(options, "manifest");
    let manifestRows = explicit ? options.manifest : Array.from(declarations.values());
    if (object(manifestRows) && manifestRows.schema === "commons.source-manifest.v1") manifestRows = manifestRows.files;
    if (!Array.isArray(manifestRows)) issues.push(issue("INVALID_MANIFEST", "manifest must be a file-identity array or commons.source-manifest.v1"));
    else {
      for (let i = 0; i < manifestRows.length; i++) {
        try {
          const row = rowIdentity(manifestRows[i], "manifest[" + i + "]");
          const previous = desired.get(row.path);
          if (previous && (previous.sha256 !== row.sha256 || previous.bytes !== row.bytes)) {
            throw failure("AMBIGUOUS_SOURCE_VERSION", "Several complete editions name " + row.path + "; supply its selected manifest", {
              path: row.path, versions: [previous, row]});
          }
          desired.set(row.path, row);
        } catch (error) { issues.push(error.detail || issue("INVALID_MANIFEST", error.message)); }
      }
    }
    const files = [];
    let totalBytes = 0;
    for (const row of desired.values()) {
      const candidate = candidates.get(keyOf(row));
      if (!candidate) { issues.push(issue("MISSING_SOURCE", "Selected complete source was not supplied", row)); continue; }
      if (candidate.bytes !== row.bytes) { issues.push(issue("MANIFEST_BYTE_MISMATCH", "Selected manifest byte count differs", row)); continue; }
      if (candidate.issue) { issues.push(candidate.issue); continue; }
      if (candidate.content === null) { issues.push(issue("MISSING_SOURCE", "Complete source data is missing", row)); continue; }
      totalBytes += candidate.bytes;
      if (totalBytes > limits.max_total_bytes) { issues.push(issue("TOTAL_LIMIT", "Selected source bytes exceed max_total_bytes", {bytes: totalBytes, maximum: limits.max_total_bytes})); break; }
      const file = {...row, content: candidate.content, sources: candidate.sources.slice()};
      files.push(file); selected.set(keyOf(row), file);
    }
    if (!desired.size) issues.push(issue("NO_SELECTED_FILES", "No complete file identities were selected"));
    const manifest = {schema: "commons.source-manifest.v1", files: files.map(({path, bytes, sha256}) => ({path, bytes, sha256}))};
    const unselected = Array.from(candidates.values()).filter(row => !selected.has(keyOf(row))).map(({path, bytes, sha256, issue: problem}) => ({path, bytes, sha256, issue: problem}));
    return {
      status: issues.length ? "INCOMPLETE" : "COMPLETE",
      complete: issues.length === 0,
      coverage: {selection: explicit ? "explicit_manifest" : "all_observed_file_identities", input_count: inputs.length,
        selected_files: desired.size, reconstructed_files: files.length, reconstructed_bytes: files.reduce((n, file) => n + file.bytes, 0),
        carrier_records: carriers.length, ignored_json_records: ignored.length},
      files, manifest, sources, carriers, normalizations, issues, unselected, ignored, limits
    };
  }
  return {read, normalizeJsonWhitespace};
}

module.exports = {createSourceCarrierReader};
