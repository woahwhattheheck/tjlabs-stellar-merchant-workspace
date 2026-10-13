// SPDX-License-Identifier: MIT
// Materialize the original declared browser routes for a complete static reader.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, mkdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBrowserAssets } from '../../stellar/scf-starforge-20261009/distribution/browser-assets.mjs';

const manifestUrl = new URL('./browser-assets.json', import.meta.url);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const SCHEMA = 'stellar-forge.grant-static-reader.v1';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
function need(condition, code, message) {
  if (!condition) throw Object.assign(new Error(message ?? code), { code });
}
function stamp(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino), size: String(stat.size),
    mtimeNs: String(stat.mtimeNs), ctimeNs: String(stat.ctimeNs) };
}
const sameStamp = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function sourceName(url) {
  const value = relative(repositoryRoot, fileURLToPath(url));
  need(value && value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value),
    'GRANT_STATIC_SOURCE_OUTSIDE_PACKAGE');
  return value.split(sep).join('/');
}
async function inspectSource(url) {
  const file = await open(url, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat({ bigint: true });
    need(stat.isFile() && stat.size <= BigInt(Number.MAX_SAFE_INTEGER), 'GRANT_STATIC_SOURCE_NOT_FILE');
    return stamp(stat);
  } finally { await file.close(); }
}
async function writeExclusive(filename, bytes) {
  const file = await open(filename, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); }
  finally { await file.close(); }
}

/** Copy every declared static file to its browser route, including source-owned
 * aliases outside dist. The returned entry is /grant.html; root routing remains
 * explicit in the complete route manifest for the publishing host. */
export async function exportGrantStaticReader({ directory } = {}) {
  need(typeof directory === 'string' && isAbsolute(directory) && resolve(directory) === directory &&
    !directory.includes('\0'), 'GRANT_STATIC_ABSOLUTE_DIRECTORY_REQUIRED');
  const rawManifest = await readFile(manifestUrl), assets = await readBrowserAssets(manifestUrl);
  need(assets.has('/grant.html'), 'GRANT_STATIC_GRANT_ENTRY_MISSING');
  const routes = [], destinations = new Map(), sources = new Map();
  for (const [route, asset] of assets) {
    let path;
    if (route === '/') {
      // Keep an exact original alias. A static publisher chooses its root rewrite
      // from this mapping; it must not overwrite the existing /index.html route.
      const alias = [...assets].find(([key, value]) => key !== '/' && !key.endsWith('/') && value.url.href === asset.url.href);
      path = alias ? alias[0].slice(1) : '_starforge-root.html';
    } else {
      need(!route.endsWith('/'), 'GRANT_STATIC_DIRECTORY_ROUTE_REQUIRES_HOST_ROUTING');
      path = route.slice(1);
    }
    need(path && !path.split('/').some(piece => !piece || piece === '.' || piece === '..') &&
      !['starforge-static-reader.json'].includes(path), 'GRANT_STATIC_DESTINATION_INVALID');
    const existing = destinations.get(path);
    need(!existing || existing.url.href === asset.url.href, 'GRANT_STATIC_ROUTE_COLLISION');
    destinations.set(path, asset);
    routes.push({ route, file: path, contentType: asset.type, source: sourceName(asset.url) });
    if (!sources.has(asset.url.href)) sources.set(asset.url.href, {
      url: asset.url, source: sourceName(asset.url), initial: await inspectSource(asset.url)
    });
  }
  for (const path of destinations.keys()) {
    const parts = path.split('/'); parts.pop();
    while (parts.length) {
      need(!destinations.has(parts.join('/')), 'GRANT_STATIC_FILE_DIRECTORY_COLLISION');
      parts.pop();
    }
  }
  // Detect a concurrently regenerated manifest before creating an output.
  need((await readFile(manifestUrl)).equals(rawManifest), 'GRANT_STATIC_MANIFEST_CHANGED');
  await mkdir(directory, { mode: 0o700 });
  const files = []; let totalBytes = 0;
  try {
    for (const [path, asset] of [...destinations].sort(([a], [b]) => a.localeCompare(b))) {
      const original = sources.get(asset.url.href), input = await open(asset.url,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let output;
      try {
        need(sameStamp(stamp(await input.stat({ bigint: true })), original.initial), 'GRANT_STATIC_SOURCE_CHANGED');
        const target = join(directory, ...path.split('/'));
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        output = await open(target, 'wx', 0o600);
        const hash = createHash('sha256'), git = createHash('sha1');
        git.update('blob ' + original.initial.size + '\0');
        let bytes = 0;
        for await (const chunk of input.createReadStream({ autoClose: false })) {
          await output.writeFile(chunk); hash.update(chunk); git.update(chunk); bytes += chunk.length;
        }
        need(String(bytes) === original.initial.size &&
          sameStamp(stamp(await input.stat({ bigint: true })), original.initial), 'GRANT_STATIC_SOURCE_CHANGED');
        await output.sync();
        files.push({ path, source: original.source, bytes, sha256: hash.digest('hex'), gitBlob: git.digest('hex') });
        totalBytes += bytes;
        need(Number.isSafeInteger(totalBytes), 'GRANT_STATIC_TOTAL_TOO_LARGE');
      } finally {
        try { await output?.close(); } finally { await input.close(); }
      }
    }
    for (const item of sources.values())
      need(sameStamp(await inspectSource(item.url), item.initial), 'GRANT_STATIC_SOURCE_CHANGED');
    need((await readFile(manifestUrl)).equals(rawManifest), 'GRANT_STATIC_MANIFEST_CHANGED');
    const byPath = new Map(files.map(file => [file.path, file]));
    const manifest = { schema: SCHEMA, entry: '/grant.html',
      sourceManifest: { path: sourceName(manifestUrl), bytes: rawManifest.length,
        sha256: sha256(rawManifest), gitBlob: blob(rawManifest) },
      totalBytes, files,
      routes: routes.map(route => ({ ...route, bytes: byPath.get(route.file).bytes,
        sha256: byPath.get(route.file).sha256 })),
      rootRoute: routes.find(route => route.route === '/') ?? null };
    const data = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    await writeExclusive(join(directory, 'starforge-static-reader.json'), data);
    return { schema: SCHEMA, directory, entry: '/grant.html', files: files.length, routes: routes.length,
      totalBytes, manifest: { file: 'starforge-static-reader.json', bytes: data.length, sha256: sha256(data) },
      rootRoute: manifest.rootRoute };
  } catch (error) {
    error.directory = directory;
    error.message += ' The new output directory retains completed files; select a new directory after correcting the source.';
    throw error;
  }
}
