import { createHash } from 'node:crypto';
import { readFile, mkdir, open, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
export const DELIVERY_SCHEMA = 'tjlabs.stellar-prices.workbench-delivery.v1';
const MAX_FILES = 20_000, MAX_BYTES = 256 * 1024 * 1024, MAX_PATH_BYTES = 4096;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => Object.assign(new Error(message), { code: 'DELIVERY_INVALID', status: 400 });
const safePath = path => typeof path === 'string' && Buffer.byteLength(path, 'utf8') <= MAX_PATH_BYTES && !/[\x00-\x1f\x7f]/.test(path) && !path.includes('\\') && !path.startsWith('/') && !path.split('/').some(part => !part || part === '.' || part === '..');

export async function buildDelivery(workbench) {
  const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (!Array.isArray(metadata.files) || !metadata.files.length) throw fail('The source manifest is missing.');
  const files = [], seen = new Set(); let totalBytes = 0;
  function add(entry) {
    if (!safePath(entry.path) || seen.has(entry.path)) throw fail('The delivery has an invalid or duplicate path.');
    totalBytes += entry.bytes;
    if (files.length >= MAX_FILES || totalBytes > MAX_BYTES) throw fail('The complete source and saved results exceed the portable limit of 20,000 files or 256 MiB. Retain the original workspace directory for continued operation.');
    files.push(entry); seen.add(entry.path);
  }
  for (const path of metadata.files) {
    if (!safePath(path)) throw fail('The source manifest contains an invalid relative path.');
    const bytes = await readFile(join(root, path));
    add({ path, encoding: 'base64', bytes: bytes.length, sha256: sha256(bytes), content: bytes.toString('base64') });
  }
  const retained = await workbench.exportState();
  for (const file of retained.files) add({ ...file, path: 'workspace/' + file.path });
  return { schema: DELIVERY_SCHEMA, createdAt: new Date().toISOString(), workspaceId: retained.workspaceId,
    revision: retained.revision, sourceVersion: metadata.version, bytes: totalBytes,
    entrypoint: 'node cli.mjs serve --dir ./workspace', files };
}

export async function unpackDelivery(bundle, destination) {
  if (bundle?.schema !== DELIVERY_SCHEMA || !Array.isArray(bundle.files) || !bundle.files.length || bundle.files.length > MAX_FILES) throw fail('Unsupported workbench delivery.');
  const target = resolve(destination), seen = new Set(), checked = []; let totalBytes = 0;
  for (const file of bundle.files) {
    if (!safePath(file.path) || seen.has(file.path) || file.encoding !== 'base64' || typeof file.content !== 'string') throw fail('Invalid delivery entry.');
    const path = resolve(target, file.path);
    if (!path.startsWith(target + sep)) throw fail('The delivery path leaves its new directory.');
    const bytes = Buffer.from(file.content, 'base64'); totalBytes += bytes.length;
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256 || totalBytes > MAX_BYTES) throw fail('Saved file content does not match its delivery identity.');
    seen.add(file.path); checked.push({ path, bytes });
  }
  for (const path of ['package.json', 'cli.mjs', 'runner.mjs', 'client.mjs']) if (!seen.has(path)) throw fail('Missing delivered source: ' + path);
  if (!bundle.files.some(file => file.path.startsWith('workspace/'))) throw fail('The retained workspace is missing.');
  await mkdir(target, { mode: 0o700 });
  try {
    for (const file of checked) {
      await mkdir(dirname(file.path), { recursive: true, mode: 0o700 });
      const handle = await open(file.path, 'wx', 0o600);
      try { await handle.writeFile(file.bytes); await handle.sync(); } finally { await handle.close(); }
    }
  } catch (error) { await rm(target, { recursive: true, force: true }); throw error; }
  return { directory: target, workspace: join(target, 'workspace'), files: checked.length, bytes: totalBytes, revision: bundle.revision };
}
