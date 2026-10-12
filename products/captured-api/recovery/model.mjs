// MIT. Original captured-product recovery selections and complete SF101 source identities.
import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';

export const SELECTION_SCHEMA = 'stellar-forge.captured-api-recovery-selection.v1';
export const PROFILE_SCHEMA = 'stellar-forge.captured-api-recovery-profile.v1';
export const TARGET_SCHEMA = 'stellar-forge.captured-api-recovery-targets.v1';
export const RECEIVING_SCHEMA = 'stellar-forge.captured-api-recovery-receiving.v1';
export const OPERATION_SCHEMA = 'stellar-forge.captured-api-recovery-operation.v1';
export const PLAN_SCHEMA = 'stellar-forge.merchant-recovery-plan.v1';
export const BUNDLE_SCHEMA = 'stellar-forge.merchant-recovery.v1';
export const PLAN_ROOT = 'capturedRecoveryPlan';
export const PRODUCT_ROOT = 'capturedProduct';
export const HASH = /^[a-f0-9]{64}$/;
export const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const MAX_PLAN = 256 * 1024;
export const MAX_MANIFEST = 12 * 1024 * 1024;
export const MAX_ENTRIES = 10000;
export const MAX_FILE = 2 * 1024 ** 3;
export const MAX_TOTAL = 4 * 1024 ** 3;
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const canonical = value => JSON.stringify(value, (_, item) => plain(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const identity = value => digest(canonical(value));
export const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export const copy = value => structuredClone(value);
export const stamp = () => new Date().toISOString();
export const failure = (code, message = code, status = 409) =>
  Object.assign(new Error(message), { code, status });
export const need = (yes, code, message, status) => { if (!yes) throw failure(code, message, status); };
export function parse(raw, label = 'recovery record') {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { throw failure('CAPTURED_RECOVERY_JSON', 'Use the complete original ' + label + '.', 400); }
}
export function fields(value, allowed, required = []) {
  need(plain(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key)), 'CAPTURED_RECOVERY_INPUT',
  'Use the declared original recovery fields.', 400);
}
export function absolute(value) {
  need(typeof value === 'string' && isAbsolute(value) && value !== '/' && resolve(value) === value &&
    !/[\\\x00-\x1f\x7f]/.test(value), 'CAPTURED_RECOVERY_PATH',
  'Select an absolute canonical path without symlink or control characters.', 400);
  return value;
}
export const inside = (a, b) => a === b || b.startsWith(a + '/');
export const overlap = (a, b) => inside(a, b) || inside(b, a);
export function passEnv(value) {
  need(typeof value === 'string' && /^[A-Z][A-Z0-9_]{4,63}$/.test(value),
    'CAPTURED_RECOVERY_PASSPHRASE', 'Select the private SF101 passphrase environment name.', 400);
  return value;
}
export function relativeName(value, { empty = false } = {}) {
  need(typeof value === 'string' && (empty && value === '' || value.length > 0 &&
    value.length <= 4096 && !isAbsolute(value) && !/[\\\x00-\x1f\x7f]/.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..' && part.length <= 255)),
  'CAPTURED_RECOVERY_MEMBER', 'Use an original relative file name.', 400);
  return value;
}
export function selection(value) {
  fields(value, ['schema', 'directory', 'additionalRoots', 'sourceArchive'], ['schema', 'directory']);
  need(value.schema === SELECTION_SCHEMA, 'CAPTURED_RECOVERY_SELECTION');
  const additionalRoots = value.additionalRoots ?? [];
  need(Array.isArray(additionalRoots) && additionalRoots.length <= 18, 'CAPTURED_RECOVERY_ROOT_LIMIT');
  const names = new Set();
  const roots = additionalRoots.map(row => {
    fields(row, ['name', 'path'], ['name', 'path']);
    need(NAME.test(row.name) && ![PLAN_ROOT, PRODUCT_ROOT].includes(row.name) && !names.has(row.name),
      'CAPTURED_RECOVERY_ROOT_NAME', 'Use distinct declared additional root names.');
    names.add(row.name); return { name: row.name, path: absolute(row.path) };
  });
  return { schema: SELECTION_SCHEMA, directory: absolute(value.directory), additionalRoots: roots,
    ...(value.sourceArchive === undefined ? {} : { sourceArchive: absolute(value.sourceArchive) }) };
}
/** Coalesce selected children into their selected parent without expanding any declared path. */
export function coalesceRoots(candidates) {
  need(Array.isArray(candidates) && candidates.length > 0 && candidates.length <= 2048,
    'CAPTURED_RECOVERY_ROOT_LIMIT');
  const byPath = new Map();
  for (const row of candidates) {
    need(NAME.test(row.name) && row.name !== PLAN_ROOT, 'CAPTURED_RECOVERY_ROOT_NAME');
    absolute(row.path);
    if (!byPath.has(row.path)) byPath.set(row.path, { name: row.name, path: row.path });
  }
  const rows = [...byPath.values()].filter(row =>
    ![...byPath.values()].some(other => other.path !== row.path && inside(other.path, row.path)));
  rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const used = new Set();
  for (const row of rows) {
    let name = row.name, count = 1;
    while (used.has(name)) name = row.name.slice(0, 54) + '_' + (++count);
    row.name = name; used.add(name);
  }
  need(rows.length <= 19, 'CAPTURED_RECOVERY_ROOT_LIMIT',
    'Select up to nineteen distinct operating roots; the original typed plan is the twentieth root.');
  return rows;
}
/** Native SF101 traversal: a directory's complete children precede its next sibling. */
export function entryOrder(a, b) {
  const left = a.relative.split('/'), right = b.relative.split('/');
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return left.length - right.length;
}
export function treeIdentity(entries) {
  need(Array.isArray(entries) && entries.length > 0 && entries.length <= MAX_ENTRIES,
    'CAPTURED_RECOVERY_TREE');
  const hash = createHash('sha256').update('stellar-forge.captured-api-recovery-tree.v1\0');
  let files = 0, directories = 0, total = 0;
  const names = new Map();
  for (const entry of entries) {
    relativeName(entry.relative, { empty: true });
    need(!names.has(entry.relative) && ['file', 'directory'].includes(entry.kind), 'CAPTURED_RECOVERY_TREE');
    const parts = entry.relative.split('/');
    if (entry.relative) {
      const parent = parts.slice(0, -1).join('/');
      need(names.get(parent) === 'directory', 'CAPTURED_RECOVERY_TREE_PARENT');
    } else need(names.size === 0, 'CAPTURED_RECOVERY_TREE');
    names.set(entry.relative, entry.kind);
    if (entry.kind === 'directory') {
      directories++; hash.update(JSON.stringify([entry.relative, 'directory']) + '\n');
    } else {
      need(Number.isSafeInteger(entry.size) && entry.size >= 0 && entry.size <= MAX_FILE && HASH.test(entry.sha256),
        'CAPTURED_RECOVERY_TREE');
      files++; total += entry.size; hash.update(JSON.stringify([entry.relative, 'file', entry.size, entry.sha256]) + '\n');
    }
  }
  need(total <= MAX_TOTAL, 'CAPTURED_RECOVERY_SIZE');
  return { kind: entries[0].kind, sha256: hash.digest('hex'), files, directories, bytes: total };
}
export const rootEntries = (manifest, name) => manifest.entries
  .filter(row => row.path === name || row.path.startsWith(name + '/'))
  .map(row => ({ relative: row.path === name ? '' : row.path.slice(name.length + 1),
    kind: row.kind, ...(row.kind === 'file' ? { size: row.size, sha256: row.sha256 } : {}) }));
export function typedPlan(raw) {
  need(raw instanceof Uint8Array && raw.length > 0 && raw.length <= MAX_PLAN, 'CAPTURED_RECOVERY_PLAN_LIMIT');
  const plan = parse(raw, 'typed captured product plan'), profile = plan?.capturedApi;
  need(plan?.schema === PLAN_SCHEMA && profile?.schema === PROFILE_SCHEMA &&
    plain(profile.product) && profile.product.schema === 'stellar-forge.captured-api-product.v1' &&
    plain(profile.source) && plain(profile.source.trees) && Array.isArray(profile.roots) &&
    profile.roots.length > 0 && profile.roots.length <= 19 && plain(profile.summary) &&
    plain(profile.runtime) && Number.isSafeInteger(profile.owner?.uid) && profile.owner.uid >= 0 &&
    Number.isSafeInteger(profile.owner?.gid) && profile.owner.gid >= 0,
  'CAPTURED_RECOVERY_PROFILE', 'Select a complete original Captured API recovery plan.');
  const selected = selection(profile.selection);
  need(selected.directory === profile.product.directory, 'CAPTURED_RECOVERY_PRODUCT');
  absolute(profile.planFile);
  const names = new Set();
  for (const root of profile.roots) {
    fields(root, ['name', 'path', 'kind'], ['name', 'path', 'kind']);
    need(NAME.test(root.name) && root.name !== PLAN_ROOT && !names.has(root.name) &&
      ['file', 'directory'].includes(root.kind), 'CAPTURED_RECOVERY_ROOT');
    names.add(root.name); absolute(root.path);
    const tree = profile.source.trees[root.name];
    need(tree?.kind === root.kind && HASH.test(tree.sha256) &&
      ['files', 'directories', 'bytes'].every(key => Number.isSafeInteger(tree[key]) && tree[key] >= 0),
    'CAPTURED_RECOVERY_TREE');
    need(!overlap(root.path, profile.planFile), 'CAPTURED_RECOVERY_PLAN_OVERLAP');
    for (const other of profile.roots) if (root !== other)
      need(!overlap(root.path, other.path), 'CAPTURED_RECOVERY_ROOT_OVERLAP');
  }
  need(profile.roots.some(root => root.kind === 'directory' && inside(root.path, selected.directory)) &&
    Object.keys(profile.source.trees).length === profile.roots.length &&
    identity(plan.roots) === identity([...profile.roots.map(({ name, path }) => ({ name, path })),
      { name: PLAN_ROOT, path: profile.planFile }]), 'CAPTURED_RECOVERY_PROFILE');
  return { plan, profile, roots: [...profile.roots, { name: PLAN_ROOT, path: profile.planFile, kind: 'file' }] };
}
/** The caller first authenticates the complete original SF101 bundle. */
export function inspectCapturedRecoveryManifest({ planBytes, manifest }) {
  const raw = Buffer.from(planBytes), { profile, roots } = typedPlan(raw), planSha256 = digest(raw);
  need(manifest?.schema === BUNDLE_SCHEMA && Array.isArray(manifest.roots) &&
    Array.isArray(manifest.entries) && manifest.entries.length <= MAX_ENTRIES &&
    identity(manifest.roots) === identity(roots.map(({ name, kind }) => ({ name, kind }))),
  'CAPTURED_RECOVERY_MANIFEST');
  const planEntry = manifest.entries.find(row => row.path === PLAN_ROOT);
  need(planEntry?.kind === 'file' && planEntry.size === raw.length && planEntry.sha256 === planSha256 &&
    manifest.capture?.schema === 'stellar-forge.merchant-recovery-capture.v1' &&
    HASH.test(manifest.capture.id) && manifest.capture.planSha256 === planSha256,
  'CAPTURED_RECOVERY_PLAN_CHANGED', 'The encrypted snapshot must contain this exact original plan.');
  for (const root of profile.roots)
    need(identity(treeIdentity(rootEntries(manifest, root.name))) === identity(profile.source.trees[root.name]),
      'CAPTURED_RECOVERY_CAPTURE_CHANGED', 'The captured ' + root.name + ' differs from its reviewed complete source.');
  return { schema: PROFILE_SCHEMA, planSha256, profileSha256: identity(profile),
    captureId: manifest.capture.id, product: copy(profile.product), summary: copy(profile.summary) };
}
export function targets(value, expectedPlanSha256) {
  fields(value, ['schema', 'sourcePlanSha256', 'destinationParents'], ['schema', 'sourcePlanSha256', 'destinationParents']);
  need(value.schema === TARGET_SCHEMA && value.sourcePlanSha256 === expectedPlanSha256 &&
    Array.isArray(value.destinationParents) && value.destinationParents.length > 0 &&
    value.destinationParents.length <= 20, 'CAPTURED_RECOVERY_TARGETS',
  'Explicitly select the private receiving parents for this original source plan.', 400);
  const parents = value.destinationParents.map(absolute);
  need(new Set(parents).size === parents.length &&
    parents.every(parent => parents.every(other => parent === other || !overlap(parent, other))),
  'CAPTURED_RECOVERY_TARGETS');
  return { schema: TARGET_SCHEMA, sourcePlanSha256: expectedPlanSha256, destinationParents: parents };
}
