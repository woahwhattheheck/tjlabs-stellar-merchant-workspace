// MIT. Resolve retained workspace paths without rewriting immutable source records.
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const WORKSPACE_PATHS_SCHEMA = 'stellar-forge.graphql-project-paths.v1';
const CONTEXT = Symbol('original GraphQL workspace path context');
const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };
const ownRoot = value => typeof value === 'string' && value.length < 4096 && isAbsolute(value)
  && value !== sep && resolve(value) === value && !/[\u0000-\u001f\u007f]/.test(value);
const within = (root, value) => {
  const name = relative(root, value);
  return !isAbsolute(name) && name !== '..' && !name.startsWith('..' + sep);
};
// Only paths within the original store layout select a workspace root. This
// avoids an old package path being mistaken for a later receiver nested inside it.
const LAYOUT = new Set(['projects', 'packages', 'deployments', 'release-stores', 'previews', 'comparisons', 'request-sets', 'request-runs', 'merchant-preparations']);
export function workspaceOrigin(roots, path) {
  return [...roots].sort((a, b) => b.length - a.length || a.localeCompare(b)).find(root => {
    if (!within(root, path)) return false;
    const name = relative(root, path);
    return !name || LAYOUT.has(name.split(sep)[0]);
  });
}
export function pathContext(value) { return value?.[CONTEXT] ?? null; }
export function attachPathContext(value, context) {
  if (value && typeof value === 'object' && context)
    Object.defineProperty(value, CONTEXT, { value: context, enumerable: false, configurable: true });
  return value;
}
export async function readProjectPaths(root, project) {
  let file;
  try {
    file = await open(join(root, 'projects', project, 'workspace-paths.json'),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) { if (error.code === 'ENOENT') return { root, project, roots: [root] }; throw error; }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 65536 || (stat.mode & 0o077)) fail('Project path history must remain private and regular.');
    const bytes = await file.readFile();
    if (bytes.length !== stat.size) fail('Project path history changed during this read.');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (value.schema !== WORKSPACE_PATHS_SCHEMA || value.project !== project || !Array.isArray(value.roots)
        || !value.roots.length || value.roots.length > 64 || value.roots.some(item => !ownRoot(item)))
      fail('Project path history is inconsistent.');
    return { root, project, roots: [...new Set([root, ...value.roots])].sort((a, b) => b.length - a.length || a.localeCompare(b)) };
  } finally { await file.close(); }
}
export async function bindProjectPaths(root, value) {
  const context = await readProjectPaths(root, value.id);
  attachPathContext(value, context);
  for (const reference of [...value.exports, ...(value.deployments ?? [])]) attachPathContext(reference, context);
  return value;
}
export function workspacePath(value, path) {
  const context = pathContext(value);
  if (!context) return path;
  if (!ownRoot(path)) fail('The retained record has a noncanonical workspace path.');
  const original = workspaceOrigin(context.roots, path);
  if (!original) fail('The retained record points outside its selected workspace history.');
  return resolve(context.root, relative(original, path));
}
export const referenceDirectory = reference => workspacePath(reference, reference.directory);
export function usedPathRoots(value, context, roots = new Set([context.root])) {
  if (typeof value === 'string' && isAbsolute(value)) {
    const original = workspaceOrigin(context.roots, value);
    if (original) roots.add(original);
  } else if (Array.isArray(value)) for (const item of value) usedPathRoots(item, context, roots);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) usedPathRoots(item, context, roots);
  return roots;
}
// Only native output metadata is passed to this helper. Draft/query/service data
// and all retained files keep their original bytes.
function metadata(value, reference) {
  if (typeof value === 'string') {
    const context = pathContext(reference);
    return context && isAbsolute(value) && workspaceOrigin(context.roots, value)
      ? workspacePath(reference, value) : value;
  }
  if (Array.isArray(value)) return value.map(item => metadata(item, reference));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, metadata(item, reference)]));
  return value;
}
export function localExportRecord(record, reference, launcher) {
  const context = pathContext(reference);
  if (!context) return record;
  const directory = referenceDirectory(reference);
  return attachPathContext({ ...record, directory,
    prepared: { ...metadata(record.prepared, reference), launcher },
    ...(record.evolution ? { evolution: metadata(record.evolution, reference) } : {}),
    ...(directory !== record.directory ? { handover: { sourceDirectory: record.directory, localDirectory: directory } } : {}),
  }, context);
}
export function localDeploymentRecord(record, reference) {
  const context = pathContext(reference);
  if (!context) return record;
  const directory = referenceDirectory(reference);
  return attachPathContext({ ...record, directory, prepared: metadata(record.prepared, reference),
    source: metadata(record.source, reference), releaseStore: workspacePath(reference, record.releaseStore),
    hosts: metadata(record.hosts, reference),
    ...(directory !== record.directory ? { handover: { sourceDirectory: record.directory, localDirectory: directory,
      next: 'Prepare a deployment here from the received merchant to bind this installed adapter and host.' } } : {}),
  }, context);
}
