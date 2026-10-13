// MIT. Original regular-file USTAR/gzip mechanics shared by source editions and portable handovers.
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { MAX_FRED_OPERATING_PACKAGE_BYTES, MAX_FRED_OPERATING_DESCRIPTOR_BYTES,
  need, same, stop, pathName, ref, utf8, opened, unchanged, directory, writeStream } from './files.mjs';

export const MAX_FRED_OPERATING_ARCHIVE_BYTES = MAX_FRED_OPERATING_PACKAGE_BYTES + 128 * 1024 * 1024;
const MAX_MEMBERS = 100000;
function tarHeader(name,size) {
  pathName(name); need(size < 0o77777777777, 'This original file exceeds the portable archive member capacity.');
  const header = Buffer.alloc(512), split = name.lastIndexOf('/');
  let base = name, prefix = '';
  if(Buffer.byteLength(base) > 100) { need(split > 0,'Use a portable edition filename.'); prefix = name.slice(0,split); base = name.slice(split + 1); }
  need(Buffer.byteLength(base) <= 100 && Buffer.byteLength(prefix) <= 155,'Use a portable edition member path.');
  const field = (value,at,length) => Buffer.from(value).copy(header,at,0,length);
  const octal = (value,at,length) => field(value.toString(8).padStart(length - 1,'0') + '\0',at,length);
  field(base,0,100); octal(0o600,100,8); octal(0,108,8); octal(0,116,8); octal(size,124,12); octal(0,136,12);
  header.fill(32,148,156); header[156] = 48; field('ustar\0',257,6); field('00',263,2); field(prefix,345,155);
  let sum = 0; for(const byte of header) sum += byte;
  field(sum.toString(8).padStart(6,'0') + '\0 ',148,8); return header;
}

export async function writeFredOperatingTar({ root, files, output, name, signal }) {
  need(Array.isArray(files) && files.length > 0 && files.length <= MAX_MEMBERS, 'Keep a complete portable member inventory.');
  const names = new Set(); let total = 0;
  for (const entry of files) {
    ref(entry); need(!names.has(entry.path), 'The archive repeats a file.');
    names.add(entry.path); total += Math.ceil(entry.bytes / 512) * 512 + 512;
  }
  need(total + 1024 <= MAX_FRED_OPERATING_ARCHIVE_BYTES, 'The complete archive exceeds its expanded capacity.');
  async function* members() {
    for (const entry of files) {
      stop(signal); const input = await opened(root, entry.path);
      try {
        yield tarHeader(entry.path, entry.bytes);
        const digest = createHash('sha256'); let bytes = 0;
        for await (const chunk of input.file.createReadStream({ autoClose:false })) {
          stop(signal); bytes += chunk.length; digest.update(chunk); yield chunk;
        }
        await unchanged(input);
        same({ path:entry.path, bytes, sha256:digest.digest('hex') }, entry, 'Original archive member');
        if (bytes % 512) yield Buffer.alloc(512 - bytes % 512);
      } finally { await input.file.close(); }
    }
    yield Buffer.alloc(1024);
  }
  const gzip = createGzip({ level:6 }), input = Readable.from(members());
  const pumped = pipeline(input, gzip, { signal }); pumped.catch(() => {});
  try {
    const value = await writeStream(output, name, gzip, null, signal, MAX_FRED_OPERATING_ARCHIVE_BYTES);
    await pumped; return value;
  } finally { gzip.destroy(); input.destroy(); await pumped.catch(() => {}); }
}

/**
 * Receive the original writer's regular-file USTAR format. Either supply the exact
 * original inventory, or validate a small first manifest and return its inventory.
 * Every member is streamed, hashed and committed independently; retries reuse exact files.
 */
export async function extractFredOperatingTar({ root, archive, output, files = null,
  firstManifest = null, maximumPayload = MAX_FRED_OPERATING_PACKAGE_BYTES, signal }) {
  ref(archive, MAX_FRED_OPERATING_ARCHIVE_BYTES); await directory(output, true);
  need((files !== null) !== (firstManifest !== null), 'Supply one original member inventory.');
  let expected = files === null ? null : inventory(files), manifestResult = null;
  const input = await opened(root, archive.path, MAX_FRED_OPERATING_ARCHIVE_BYTES);
  const gunzip = createGunzip(), stream = input.file.createReadStream({ autoClose:false });
  const digest = createHash('sha256'); let compressed = 0;
  stream.on('data', chunk => { compressed += chunk.length; digest.update(chunk); });
  const pumped = pipeline(stream, gunzip, { signal }); pumped.catch(() => {});
  const iterator = gunzip[Symbol.asyncIterator](); let pending = Buffer.alloc(0), ended = false, expanded = 0, members = 0, payload = 0;
  function inventory(values) {
    need(Array.isArray(values) && values.length <= MAX_MEMBERS, 'Keep the complete archive inventory.');
    const map = new Map();
    for (const entry of values) { ref(entry); need(!map.has(entry.path), 'The original archive repeats a member.'); map.set(entry.path, entry); }
    return map;
  }
  async function take(length, allowEnd = false) {
    const parts = []; let bytes = 0;
    while (bytes < length) {
      stop(signal);
      if (pending.length) {
        const n = Math.min(length - bytes, pending.length); parts.push(pending.subarray(0,n)); pending = pending.subarray(n); bytes += n;
      } else {
        const next = await iterator.next();
        if (next.done) { ended = true; if (allowEnd && bytes === 0) return null; need(false, 'The complete original archive ended early.'); }
        pending = next.value; expanded += pending.length;
        need(expanded <= MAX_FRED_OPERATING_ARCHIVE_BYTES, 'The expanded archive exceeds its complete capacity.');
      }
    }
    return parts.length === 1 ? parts[0] : Buffer.concat(parts, bytes);
  }
  const textField = (header, at, size) => utf8.decode(header.subarray(at, at + size)).split('\0')[0];
  const numberField = (header, at, size) => {
    const text = textField(header, at, size).trim(); need(/^[0-7]+$/.test(text), 'Use the original USTAR numeric field.');
    const value = Number.parseInt(text, 8); need(Number.isSafeInteger(value) && value >= 0, 'The archive member exceeds capacity.'); return value;
  };
  try {
    for (;;) {
      const header = await take(512);
      if (header.every(byte => byte === 0)) {
        const second = await take(512); need(second.every(byte => byte === 0), 'The original archive terminator changed.');
        while (!ended) { const tail = await take(512, true); if (tail) need(tail.every(byte => byte === 0), 'The archive contains data after its terminator.'); }
        break;
      }
      need(++members <= MAX_MEMBERS, 'The archive exceeds its complete member capacity.');
      const saved = numberField(header,148,8); let sum = 0;
      for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
      need(saved === sum && textField(header,257,6) === 'ustar' && [0,48].includes(header[156]),
        'Receive the original regular-file USTAR archive.');
      const prefix = textField(header,345,155), name = pathName((prefix ? prefix + '/' : '') + textField(header,0,100));
      const size = numberField(header,124,12);
      payload += size; need(payload <= maximumPayload, 'The complete expanded member payload exceeds capacity.');
      if (expected === null) {
        need(members === 1 && name === firstManifest.name && size <= MAX_FRED_OPERATING_DESCRIPTOR_BYTES,
          'The complete handover manifest must be the first archive member.');
        const body = await take(size), entry = { path:name, bytes:size, sha256:createHash('sha256').update(body).digest('hex') };
        manifestResult = await firstManifest.read(body, entry);
        expected = inventory(manifestResult.files);
        need(!expected.has(name), 'The first manifest cannot repeat itself.');
        await writeStream(output, name, [body], entry, signal);
      } else {
        const entry = expected.get(name);
        need(entry && size === entry.bytes, 'The archive member differs from its complete original inventory.');
        async function* content() { let left = size; while (left) { const part = await take(Math.min(left,65536)); left -= part.length; yield part; } }
        await writeStream(output, name, content(), entry, signal); expected.delete(name);
      }
      if (size % 512) { const padding = await take(512 - size % 512); need(padding.every(byte => byte === 0), 'The original archive padding changed.'); }
    }
    await pumped; await unchanged(input);
    need(expected !== null && expected.size === 0, 'The complete archive omitted an original file.');
    same({ path:archive.path, bytes:compressed, sha256:digest.digest('hex') }, archive, 'Complete compressed archive');
    return manifestResult;
  } finally {
    gunzip.destroy(); stream.destroy(); await pumped.catch(() => {}); await input.file.close();
  }
}
