#!/usr/bin/env node
// Apache-2.0. Join complete selected partner source to the original Installation seed.
import {readFile, open, mkdir, lstat, realpath, link, unlink} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readProfile} from '../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/profiles.mjs';
import {prepareInstallation, renderWorkorder} from '../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/prepare-core.mjs';
import {PartnerInstallation, PARTNER_SOURCE, canonicalDirectory, exact, plain, readPrivateJSON,
  requestId, selectedPath, partnerError} from './client.mjs';

export const PARTNER_SELECTION_SCHEMA = 'stellar-forge.partner-installation-selection.v1';
export const PARTNER_PROFILES = {mobility: 'mobility-source-review', education: 'education-quality-review'};
const need = (value, message) => { if (!value) throw partnerError('PARTNER_COMMISSIONING', message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ordered = value => Array.isArray(value) ? value.map(ordered) : plain(value) ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const same = (left, right) => JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
async function original(path) {
  path = selectedPath(path);
  need(await realpath(path) === path, 'Select a canonical original source file.');
  const info = await lstat(path);
  need(info.isFile() && !info.isSymbolicLink() && info.size <= 8 * 1024 * 1024, 'Select a complete original JSON source up to eight MiB.');
  const bytes = await readFile(path);
  need(bytes.length === info.size, 'The original source changed during receiving.');
  const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  return {path, bytes, sha256: hash(bytes), value};
}
async function publish(path, bytes) {
  try {
    const existing = await readFile(path);
    need(existing.equals(bytes), 'The retained complete output has different original bytes: ' + path);
    return {path, bytes: bytes.length, sha256: hash(bytes)};
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path + '.' + randomUUID() + '.tmp';
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(bytes); await file.sync();
    try { await link(temporary, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      need((await readFile(path)).equals(bytes), 'A simultaneous original output differs.');
    }
    const parent = await open(dirname(path), 'r');
    try { await parent.sync(); } finally { await parent.close(); }
  } finally { await file.close(); await unlink(temporary); }
  return {path, bytes: bytes.length, sha256: hash(bytes)};
}
/** Prepare complete original native inputs; the existing case owns preview/save/operation. */
export async function preparePartnerCommissioning({seedPath, bindingsPath, selectionPath, output}) {
  const [seed, bindings, selection] = await Promise.all([original(seedPath), original(bindingsPath), original(selectionPath)]);
  const selected = selection.value;
  exact(selected, ['schema', 'operationId', 'case', 'workshareCaseId', 'source', 'installation', 'actor', 'product'],
    ['schema', 'operationId', 'case', 'workshareCaseId', 'source', 'installation', 'actor', 'product']);
  need(selected.schema === PARTNER_SELECTION_SCHEMA, 'Select the complete partner installation source.');
  requestId(selected.operationId);
  need(Object.hasOwn(PARTNER_PROFILES, selected.product), 'Select the original mobility or education product.');
  need(same(selected.case, seed.value.source), 'Retain the original current case and pinned plan selection.');
  need(selected.workshareCaseId === (seed.value.document.workshare?.caseId ?? null),
    'Keep the original Workshare case from the maintained Installation seed.');
  exact(selected.source, ['sourceId', 'root', 'manifest', 'sha256', 'workshareReference'],
    ['sourceId', 'root', 'manifest', 'sha256', 'workshareReference']);
  need(typeof selected.source.workshareReference === 'string' && selected.source.workshareReference.trim(),
    'Name the actual original commercial/workshare source reference.');
  need(bindings.value.source?.sourceIds?.includes(selected.source.sourceId),
    'Use this selected original source attachment ID in the same native case bindings.');
  exact(selected.installation, ['directory', 'python', 'adapterSource', 'workspaceArchive'],
    ['directory', 'python']);
  need(typeof selected.actor === 'string' && selected.actor.trim(), 'Retain the actual receiving operator.');
  const base = dirname(selection.path), manifestPath = selectedPath(selected.source.manifest, base);
  const manifest = await original(manifestPath);
  need(manifest.sha256 === selected.source.sha256, 'The complete selected source manifest changed.');
  const sourceRoot = selectedPath(selected.source.root, base);
  const client = new PartnerInstallation({directory: selectedPath(selected.installation.directory, base),
    sourceDirectory: selectedPath(selected.installation.adapterSource ?? PARTNER_SOURCE, base),
    python: selectedPath(selected.installation.python, base)});
  let inspection;
  try { inspection = await client.source({source_root: sourceRoot, source_manifest: manifestPath}); }
  finally { await client.close(); }
  need(manifest.value.product === selected.product, 'The selected complete source belongs to another product.');
  const profile = readProfile(PARTNER_PROFILES[selected.product]);
  const prepared = prepareInstallation(seed.value, profile.value, bindings.value);
  need(same(prepared.document.workorder, seed.value.document.workorder) &&
    same(prepared.document.workshare, seed.value.document.workshare) &&
    same(prepared.document.checks, seed.value.document.checks), 'The original commercial phases and checks changed.');
  need(prepared.document.source.sourceIds.includes(selected.source.sourceId), 'Keep the actual selected source in the complete native Installation.');
  const argumentsValue = {source_root: sourceRoot, source_manifest: manifestPath,
    directory: selectedPath(selected.installation.directory, base), python: selectedPath(selected.installation.python, base),
    ...(selected.installation.workspaceArchive ? {workspace_archive: selectedPath(selected.installation.workspaceArchive, base)} : {})};
  const nativeRequest = {schema: 'stellar-forge.partner-operation-request.v1',
    operation: 'installation.prepare', request_id: selected.operationId, arguments: argumentsValue};
  output = selectedPath(output);
  await mkdir(output, {recursive: true, mode: 0o700});
  await canonicalDirectory(output, {privateOnly: true});
  const request = {schema: 'stellar-forge.partner-commissioning-request.v1',
    operationId: selected.operationId, case: selected.case,
    originalInputs: [seed, bindings, selection, manifest].map(({path, bytes, sha256}) => ({path, bytes: bytes.length, sha256})),
    profile: profile.source};
  const saved = [];
  saved.push(await publish(join(output, 'PREPARATION_REQUEST.json'), encode(request)));
  for (const [name, bytes] of [
    ['Original_Installation_Seed.json', seed.bytes], ['Original_Bindings.json', bindings.bytes],
    ['Partner_Selection.json', selection.bytes], ['Partner_Source.json', manifest.bytes],
    ['installation-input.json', encode(prepared.document)], ['installation-preview-input.json', encode(prepared.preview)],
    ['native-prepare-request.json', encode(nativeRequest)], ['WORKORDER.md', Buffer.from(renderWorkorder(prepared))],
  ]) saved.push(await publish(join(output, name), bytes));
  const result = {schema: 'stellar-forge.partner-installation-preparation.v1',
    operationId: selected.operationId, originalCase: selected.case,
    originalWorkshareCaseId: selected.workshareCaseId, originalWorkshareReference: selected.source.workshareReference,
    source: inspection.result, prepared, nativeRequest, outputs: saved};
  const outputIdentity = await publish(join(output, 'PARTNER_PREPARATION.json'), encode(result));
  return {result, output: outputIdentity};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const allowed = new Set(['seed', 'bindings', 'selection', 'out']), input = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i]?.slice(2);
      need(process.argv[i]?.startsWith('--') && allowed.has(key) && !Object.hasOwn(input, key) && process.argv[i + 1],
        'Use --seed ORIGINAL --bindings ORIGINAL --selection COMPLETE --out PRIVATE.');
      input[key] = process.argv[i + 1];
    }
    need([...allowed].every(key => input[key]), 'Select the complete original seed, bindings, source selection and output.');
    const result = await preparePartnerCommissioning({seedPath: input.seed, bindingsPath: input.bindings,
      selectionPath: input.selection, output: input.out});
    process.stdout.write(JSON.stringify({output: result.output, outputs: result.result.outputs,
      originalCase: result.result.originalCase, sourceFiles: result.result.source.files,
      selections: result.result.prepared.selections}, null, 2) + '\n');
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 2; }
}
