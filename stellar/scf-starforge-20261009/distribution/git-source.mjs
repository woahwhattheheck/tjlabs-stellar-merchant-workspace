// MIT. Read one Git snapshot in batches; the repository remains the source cache.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
// Keep original source members within the same 8 MiB limit enforced by runtime-unpack.py.
export const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const READ_BATCH_BYTES = MAX_SOURCE_FILE_BYTES;
const READ_BATCH_OBJECTS = 128;
const CACHE_BYTES = 2 * MAX_SOURCE_FILE_BYTES;
const CACHE_OBJECTS = 512;
const round = value => Math.round(value * 100) / 100;

export function openGitSource({ repository, ref = 'HEAD', offline = false, onProgress = () => {} }) {
  if (typeof ref !== 'string' || !ref || typeof offline !== 'boolean' || typeof onProgress !== 'function')
    throw new TypeError('Expected a Git ref, an offline boolean and a progress callback');
  const repo = resolve(repository), started = performance.now(), cache = new Map();
  const sizes = new Map(), verified = new Set();
  let cacheBytes = 0;
  const counts = { gitCommands: 0, gitMilliseconds: 0, metadataBatches: 0, contentBatches: 0,
    fetchBatches: 0, requestedObjects: 0, cachedObjects: 0, fetchedObjects: 0, uniqueBytes: 0,
    contentBytes: 0, peakBatchBytes: 0, peakCacheBytes: 0 };
  let commit, remotes;
  const progress = (phase, details = {}) => onProgress({ phase, ...(commit ? { sourceCommit: commit } : {}),
    elapsedMilliseconds: round(performance.now() - started), ...details });
  function git(args, { input, maxBuffer = MAX_SOURCE_BYTES + 1024 * 1024, optional = false } = {}) {
    const begin = performance.now();
    counts.gitCommands++;
    try {
      return execFileSync('git', ['--no-replace-objects', '--no-lazy-fetch', ...args], {
        cwd: repo, input, maxBuffer, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch (error) {
      if (optional && error.status === 1) return Buffer.alloc(0);
      // A configured remote can contain credentials. Do not copy command output
      // or URLs into the release receipt or operator progress stream.
      const failure = new Error(`Git source operation failed (exit ${error.status ?? 'unknown'}). ` +
        'Use Git with --no-lazy-fetch support and check access to the configured repository.');
      failure.code = 'GIT_SOURCE_FAILED';
      throw failure;
    } finally { counts.gitMilliseconds += performance.now() - begin; }
  }
  progress('resolve');
  commit = git(['rev-parse', '--verify', '--end-of-options', ref + '^{commit}']).toString().trim();
  if (!OID.test(commit)) throw new TypeError('Git did not resolve one immutable commit');
  const tree = git(['ls-tree', '-r', '-z', '--full-tree', commit]).toString('utf8')
    .split('\0').filter(Boolean).map(line => {
      const tab = line.indexOf('\t'), fields = line.slice(0, tab).split(' ');
      if (tab < 0 || fields.length !== 3 || !OID.test(fields[2])) throw new TypeError('Invalid Git tree entry');
      return { mode: fields[0], type: fields[1], blob: fields[2], path: line.slice(tab + 1) };
    });
  progress('resolved', { treeFiles: tree.length });

  function inspect(blobs) {
    if (!blobs.length) return new Map();
    counts.metadataBatches++;
    const lines = git(['cat-file', '--batch-check'], { input: blobs.join('\n') + '\n',
      maxBuffer: Math.max(1024 * 1024, blobs.length * 128) }).toString('utf8').trimEnd().split('\n');
    if (lines.length !== blobs.length) throw new TypeError('Incomplete Git object metadata batch');
    const result = new Map();
    for (let i = 0; i < blobs.length; i++) {
      const fields = lines[i].split(' ');
      if (fields[0] !== blobs[i]) throw new TypeError('Git object metadata order changed');
      if (fields.length === 2 && fields[1] === 'missing') { result.set(blobs[i], null); continue; }
      const size = Number(fields[2]);
      if (fields.length !== 3 || fields[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0)
        throw new TypeError('Expected regular Git blob metadata');
      if (size > MAX_SOURCE_FILE_BYTES) {
        const paths = tree.filter(item => item.blob === blobs[i]).map(item => item.path);
        const error = new RangeError(`Distribution source file exceeds ${MAX_SOURCE_FILE_BYTES} bytes (${size}): ${paths.join(', ') || blobs[i]}`);
        error.code = 'DISTRIBUTION_SOURCE_FILE_TOO_LARGE';
        error.sourceCommit = commit; error.gitBlob = blobs[i]; error.paths = paths;
        error.bytes = size; error.limitBytes = MAX_SOURCE_FILE_BYTES;
        throw error;
      }
      result.set(blobs[i], size);
    }
    return result;
  }
  function promisorRemotes() {
    if (remotes) return remotes;
    const configuration = git(['config', '--null', '--get-regexp',
      '^(extensions[.]partialclone|remote[.].*[.](promisor|partialclonefilter))$'], { optional: true }).toString();
    const found = new Set(); let last;
    for (const entry of configuration.split('\0').filter(Boolean)) {
      const at = entry.indexOf('\n'), key = entry.slice(0, at), value = entry.slice(at + 1);
      if (key.toLowerCase() === 'extensions.partialclone') { last = value; continue; }
      const match = /^remote\.(.+)\.(promisor|partialclonefilter)$/i.exec(key);
      if (match && (match[2].toLowerCase() === 'partialclonefilter' || /^(true|yes|on|1)$/i.test(value)))
        found.add(match[1]);
    }
    if (last) { found.delete(last); found.add(last); }
    remotes = [...found];
    return remotes;
  }
  function acquire(blobs, metadata) {
    let missing = blobs.filter(blob => metadata.get(blob) === null);
    if (!missing.length) return metadata;
    if (!offline) {
      for (const remote of promisorRemotes()) {
        progress('fetching', { objects: missing.length, remote });
        counts.fetchBatches++;
        // Exact blob IDs come only from the selected immutable tree. Keep the
        // checkout, branch refs and FETCH_HEAD intact. Git's configured object
        // database (including existing alternates) owns all acquired objects.
        try {
          git(['-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--no-tags', '--no-write-fetch-head', '--no-auto-maintenance',
            '--recurse-submodules=no', '--filter=blob:none', '--stdin', '--', remote],
          { input: missing.join('\n') + '\n' });
        } catch (error) {
          progress('fetch-incomplete', { objects: missing.length, remote, code: error.code });
        }
        const observed = inspect(missing);
        for (const [blob, size] of observed) metadata.set(blob, size);
        const remaining = missing.filter(blob => metadata.get(blob) === null);
        counts.fetchedObjects += missing.length - remaining.length;
        missing = remaining;
        if (!missing.length) break;
      }
    }
    if (missing.length) {
      progress('source-needed', { objects: missing.length, offline });
      const error = new Error(`${missing.length} selected Git source objects are unavailable. ` +
        (offline ? 'Acquire them in the same repository, then repeat the offline build.' :
          'Check its configured promisor remote, then repeat the same commit with a new output directory.'));
      error.code = 'MISSING_SOURCE_OBJECTS'; error.missingObjects = missing; error.sourceCommit = commit;
      throw error;
    }
    return metadata;
  }
  function cached(blob) {
    const bytes = cache.get(blob);
    if (bytes !== undefined) { cache.delete(blob); cache.set(blob, bytes); }
    return bytes;
  }
  function retain(blob, bytes) {
    while (cache.size && (cacheBytes + bytes.length > CACHE_BYTES || cache.size >= CACHE_OBJECTS)) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).length; cache.delete(oldest);
    }
    cache.set(blob, bytes); cacheBytes += bytes.length;
    counts.peakCacheBytes = Math.max(counts.peakCacheBytes, cacheBytes);
  }
  function clearContentCache() { cache.clear(); cacheBytes = 0; }

  // Yield verified original files in bounded Git batches. Metadata and hashes
  // persist across rereads; content can leave memory after its current consumer.
  function* readEntries(items) {
    for (const item of items)
      if (!item || !['100644', '100755'].includes(item.mode) || item.type !== 'blob' || !OID.test(item.blob))
        throw new TypeError('Only regular source files may be packaged: ' + (item?.path ?? 'missing entry'));
    const requested = [...new Set(items.map(item => item.blob))];
    const unknown = requested.filter(blob => !sizes.has(blob));
    if (unknown.length) {
      counts.requestedObjects += unknown.length;
      progress('inspect', { files: items.length, objects: unknown.length });
      const metadata = inspect(unknown);
      counts.cachedObjects += unknown.filter(blob => metadata.get(blob) !== null).length;
      acquire(unknown, metadata);
      for (const [blob, size] of metadata) sizes.set(blob, size);
    }
    const added = requested.filter(blob => !verified.has(blob)).reduce((sum, blob) => sum + sizes.get(blob), 0);
    if (counts.uniqueBytes + added > MAX_SOURCE_BYTES)
      throw new RangeError(`Distribution Git source exceeds ${MAX_SOURCE_BYTES} bytes: ${counts.uniqueBytes + added}`);
    let index = 0;
    while (index < items.length) {
      const batch = [], batchBlobs = new Set(); let bytesInBatch = 0;
      while (index < items.length && batch.length < READ_BATCH_OBJECTS) {
        const item = items[index], addedBytes = batchBlobs.has(item.blob) ? 0 : sizes.get(item.blob);
        if (batch.length && bytesInBatch + addedBytes > READ_BATCH_BYTES) break;
        batch.push(item); batchBlobs.add(item.blob); bytesInBatch += addedBytes; index++;
      }
      // Touch cached batch members before inserting new ones so eviction never
      // removes a member of this <=8 MiB/128-object batch from the 16 MiB cache.
      const missing = [...batchBlobs].filter(blob => cached(blob) === undefined);
      if (missing.length) {
        const size = missing.reduce((sum, blob) => sum + sizes.get(blob), 0);
        counts.contentBatches++; counts.contentBytes += size;
        counts.peakBatchBytes = Math.max(counts.peakBatchBytes, size);
        const data = git(['cat-file', '--batch'], { input: missing.join('\n') + '\n',
          maxBuffer: size + missing.length * 128 + 1024 });
        let offset = 0;
        for (const blob of missing) {
          const end = data.indexOf(10, offset), length = sizes.get(blob);
          if (end < offset || data.toString('ascii', offset, end) !== `${blob} blob ${length}`)
            throw new TypeError('Git content batch header does not match selected source');
          const start = end + 1, stop = start + length;
          if (stop >= data.length || data[stop] !== 10) throw new TypeError('Incomplete Git source content');
          const view = data.subarray(start, stop);
          const actual = createHash(blob.length === 64 ? 'sha256' : 'sha1')
            .update(`blob ${length}\0`).update(view).digest('hex');
          if (actual !== blob) throw new TypeError('Git source content identity changed');
          // Independent allocation prevents one tiny retained member from
          // keeping the entire original Git subprocess output alive.
          retain(blob, Buffer.from(view)); offset = stop + 1;
          if (!verified.has(blob)) { verified.add(blob); counts.uniqueBytes += length; }
        }
        if (offset !== data.length) throw new TypeError('Unexpected trailing Git source content');
      }
      for (const item of batch) yield [item.path, cached(item.blob)];
    }
    progress('loaded', { files: items.length, objects: requested.length,
      bytes: requested.reduce((sum, blob) => sum + sizes.get(blob), 0),
      cacheBytes, peakBatchBytes: counts.peakBatchBytes });
  }
  function readFiles(items) { return new Map(readEntries(items)); }
  return { commit, tree, readFiles, readEntries, clearContentCache, progress,
    metrics: () => ({ ...counts, gitMilliseconds: round(counts.gitMilliseconds),
      elapsedMilliseconds: round(performance.now() - started), offline }) };
}
