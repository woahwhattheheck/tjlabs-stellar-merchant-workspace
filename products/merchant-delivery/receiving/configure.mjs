#!/usr/bin/env node
// MIT. Prepare the original received SF98 workspace for the Applications registry.
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, lstat, mkdir, realpath, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';

const SELECTION = 'tjlabs.delivery-receiving.application-selection.v1';
const MANIFEST = 'tjlabs.delivery-receiving.application-configuration.v1';
const NATIVE = 'products/merchant-delivery/receiving/managed.mjs';
const HASH = /^[a-f0-9]{64}$/, ID = /^[a-f0-9]{24}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const encode = value => JSON.stringify(value, null, 2) + '\n';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function need(value, message) { if (!value) throw new Error(message); }
function fields(value, allowed, label) {
  need(plain(value) && Object.keys(value).every(key => allowed.includes(key)), label + ' contains an unsupported field.');
}
function absolute(value, label) {
  need(typeof value === 'string' && value !== '/' && isAbsolute(value) &&
    resolve(value) === value && !/[\u0000-\u001f]/.test(value), label + ' must be an absolute canonical path.');
  return value;
}
function within(root, path) {
  const value = relative(root, path);
  return value === '' || value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value);
}
function disjoint(left, right, label) {
  need(!within(left, right) && !within(right, left), label + ' must use separate directories.');
}
async function privateDirectory(path) {
  const stat = await lstat(path);
  need(stat.isDirectory() && !stat.isSymbolicLink() && !(stat.mode & 0o077) &&
    await realpath(path) === path, 'Use a private canonical directory: ' + path);
}
async function read(path, limit = 4 * 1024 * 1024) {
  path = absolute(path, 'Input');
  need(await realpath(dirname(path)) === dirname(path), 'Use the original canonical input parent.');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    need(before.isFile() && before.size <= BigInt(limit), 'Expected a bounded regular original file: ' + path);
    const bytes = await handle.readFile(), after = await handle.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    need(before.dev === after.dev && before.ino === after.ino && before.size === after.size &&
      before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs &&
      current.dev === after.dev && current.ino === after.ino && !current.isSymbolicLink() &&
      BigInt(bytes.length) === after.size, 'The original input changed during its read.');
    return { bytes, sha256: hash(bytes), value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } finally { await handle.close(); }
}
async function writeNew(path, body) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(body); await handle.sync(); }
  finally { await handle.close(); }
}
async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); }
  finally { await handle.close(); }
}
function selected(input) {
  fields(input, ['schema', 'runtimeWorkspace', 'runtimeId', 'runtimeDirectory', 'label',
    'receivedDirectory', 'port', 'environmentFile',
    'applicationId', 'expectedRevision', 'homeId'], 'Selection');
  need(input.schema === SELECTION, 'Use the documented delivery-receiving application selection schema.');
  need(ID.test(input.runtimeId ?? ''), 'Copy the actual runtimeId from runtime-workspace attach or status.');
  need(typeof input.label === 'string' && input.label.trim() === input.label &&
    input.label.length >= 1 && input.label.length <= 120, 'Use a label of 1–120 characters.');
  const result = { ...input };
  for (const key of ['runtimeWorkspace', 'runtimeDirectory', 'receivedDirectory'])
    result[key] = absolute(input[key], key);
  if (input.environmentFile !== undefined) result.environmentFile = absolute(input.environmentFile, 'environmentFile');
  result.port = input.port ?? 0;
  need(Number.isInteger(result.port) && result.port >= 0 && result.port <= 65535, 'port must be an integer from 0 to 65535.');
  if (input.applicationId !== undefined) need(ID.test(input.applicationId) && HASH.test(input.expectedRevision ?? ''),
    'Editing an existing application requires its actual ID and current revision.');
  else need(input.expectedRevision === undefined, 'An application revision belongs to its selected application ID.');
  if (input.homeId !== undefined) need(ID.test(input.homeId), 'homeId must be the actual existing managed home ID.');
  return result;
}

export async function configurationFiles(input, outputDirectory) {
  const selection = selected(input), out = absolute(outputDirectory, 'Output directory');
  await privateDirectory(selection.runtimeWorkspace);
  for (const [path, label] of [
    [selection.receivedDirectory, 'received source and destination state'],
    [selection.runtimeWorkspace, 'runtime workspace'],
    [selection.runtimeDirectory, 'installed runtime'],
  ]) disjoint(out, path, 'Configuration output and ' + label);
  const runtime = await inspectMerchantRuntime(selection.runtimeDirectory, { load: false });
  const native = await import(pathToFileURL(join(runtime.sourceRoot, NATIVE)).href);
  need(typeof native.inspectReceivingLaunch === 'function',
    'Select the installed merchant-delivery runtime containing customer receiving.');
  const original = await native.inspectReceivingLaunch({
    receivedDirectory: selection.receivedDirectory, port: selection.port,
  });
  need(original.schema === 'stellar-forge.delivery-receiving-launch.v1' &&
    original.receivedDirectory === selection.receivedDirectory &&
    HASH.test(original.bindingSha256 ?? '') && HASH.test(original.receiptSha256 ?? ''),
  'The installed product returned a different receiving workspace.');
  if (selection.environmentFile) {
    const info = await lstat(selection.environmentFile);
    need(info.isFile() && !info.isSymbolicLink() && !(info.mode & 0o077) &&
      await realpath(selection.environmentFile) === selection.environmentFile,
    'Select the existing private environment JSON. This helper does not read its values.');
    need(!within(out, selection.environmentFile), 'Keep the private environment outside the generated configuration.');
  }
  // The configuration retains immutable receipt/path identity. Current destination
  // edits and worker observations are obtained anew through the original model.
  const { review: currentReview, ...retainedOriginal } = original;
  const settings = { receivedDirectory: selection.receivedDirectory, port: selection.port,
    ...(selection.environmentFile ? { environmentFile: selection.environmentFile } : {}) };
  const review = { runtimeId: selection.runtimeId, kind: 'delivery-receiving', label: selection.label, settings,
    ...(selection.applicationId ? { applicationId: selection.applicationId, expectedRevision: selection.expectedRevision } : {}),
    ...(selection.homeId ? { homeId: selection.homeId } : {}) };
  return {
    'selection.json': encode(selection),
    'application-review.json': encode(review),
    'original-receiving.json': encode({ schema: 'tjlabs.delivery-receiving.configuration-observation.v1',
      meaning: 'Original received receipt and path identities. Applications reads current destination and worker state before start.',
      original: retainedOriginal, runtime: { directory: runtime.directory, sourceRoot: runtime.sourceRoot,
        sourceCommit: runtime.sourceCommit, sourceManifestSha256: runtime.sourceManifestSha256 } }),
  };
}

/** A completed configuration reopens unchanged. A matching interrupted
 * preparation completes missing files after verifying every existing byte. */
export async function configure({ selectionFile, outputDirectory }) {
  const source = await read(absolute(selectionFile, 'Selection file'), 1024 * 1024);
  const out = absolute(outputDirectory, 'Output directory');
  await privateDirectory(dirname(out));
  let exists = true;
  try { await lstat(out); }
  catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
  if (exists) {
    await privateDirectory(out);
    let saved;
    try { saved = await read(join(out, 'configuration-manifest.json'), 1024 * 1024); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (saved) {
      need(saved.value.schema === MANIFEST && saved.value.selectionSha256 === source.sha256 &&
        Array.isArray(saved.value.files) && saved.value.files.length === 3,
      'This directory contains another original configuration. Preserve it and select the intended configuration.');
      const expectedNames = new Set(['selection.json', 'application-review.json', 'original-receiving.json']);
      for (const file of saved.value.files) {
        need(expectedNames.delete(file.path), 'The saved configuration contains an unexpected or duplicate file.');
        const actual = await read(join(out, file.path));
        need(actual.sha256 === file.sha256 && actual.bytes.length === file.bytes,
          'The retained configuration differs from its original manifest: ' + file.path);
      }
      need(expectedNames.size === 0 && (await readdir(out)).every(name =>
        name === 'configuration-manifest.json' || saved.value.files.some(file => file.path === name)),
      'Preserve unrelated files in this configuration directory.');
      return { status: 'REOPENED_CONFIGURATION', directory: out, manifest: saved.value,
        note: 'The original prepared bytes are retained. Review through Applications to inspect current runtime and destination state.' };
    }
  }
  const files = await configurationFiles(source.value, out);
  if (!exists) await mkdir(out, { mode: 0o700 });
  need((await readdir(out)).every(name => Object.hasOwn(files, name)),
    'An incomplete configuration contains unrelated files. Preserve that directory.');
  const missing = [];
  for (const [name, bytes] of Object.entries(files)) {
    let actual;
    try { actual = await read(join(out, name)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; missing.push(name); continue; }
    need(actual.sha256 === hash(bytes) && actual.bytes.length === Buffer.byteLength(bytes),
      'The interrupted configuration differs from this original selection: ' + name);
  }
  for (const name of missing) await writeNew(join(out, name), files[name]);
  const manifest = { schema: MANIFEST, selectionSha256: source.sha256, preparedAt: new Date().toISOString(),
    files: Object.entries(files).map(([path, bytes]) => ({ path, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) })) };
  await writeNew(join(out, 'configuration-manifest.json'), encode(manifest));
  await syncDirectory(out);
  return { status: exists ? 'CONFIGURATION_RESUMED' : 'CONFIGURATION_PREPARED', directory: out, manifest,
    next: 'Review application-review.json in the original runtime workspace, then save the exact returned review.' };
}

export async function requestFile({ reviewFile, outputFile, requestId }) {
  const original = await read(absolute(reviewFile, 'Review file'), 1024 * 1024);
  const review = original.value, out = absolute(outputFile, 'Request file');
  await privateDirectory(dirname(out));
  const saving = review?.schema === 'stellar-forge.application-review.v1';
  const starting = review?.schema === 'stellar-forge.application-start-review.v1';
  need((saving || starting) && ID.test(review.id ?? '') &&
    review.command?.command === 'delivery-receiving-workspace' && review.command.args?.[0] === 'managed' &&
    (!saving || review.kind === 'delivery-receiving'), 'Use the complete original customer receiving application review JSON.');
  if (starting) need(ID.test(review.applicationId ?? ''), 'The start review must retain its original application ID.');
  if (requestId !== undefined) need(UUID.test(requestId), 'requestId must be the same retained UUID.');
  const make = id => ({ requestId: id, reviewId: review.id,
    ...(review.applicationId ? { applicationId: review.applicationId } : {}) });
  let existing;
  try { existing = await read(out, 65536); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) {
    need(UUID.test(existing.value?.requestId ?? '') &&
      (requestId === undefined || existing.value.requestId === requestId) &&
      encode(existing.value) === encode(make(existing.value.requestId)),
    'This request file belongs to another selection. Keep it and choose a new file for the new action.');
    return { status: 'REOPENED_REQUEST', action: saving ? 'application-save' : 'application-start',
      file: out, sha256: existing.sha256, request: existing.value };
  }
  const request = make(requestId ?? randomUUID()), bytes = encode(request);
  await writeNew(out, bytes); await syncDirectory(dirname(out));
  return { status: 'REQUEST_PREPARED', action: saving ? 'application-save' : 'application-start',
    file: out, bytes: Buffer.byteLength(bytes), sha256: hash(bytes), request };
}

const HELP = 'Customer delivery receiving Applications configuration\n\n' +
  '  delivery-receiving-configure configure --selection ABSOLUTE_JSON --out NEW_PRIVATE_DIRECTORY\n' +
  '  delivery-receiving-configure request --review ORIGINAL_REVIEW_JSON --out PRIVATE_REQUEST_JSON [--request-id UUID]\n\n' +
  'Configure reads an existing received SF98 workspace and selected installed runtime,\n' +
  'then saves the exact application settings and original receipt/source identities.\n' +
  'The request command retains one stable save/start request from an actual native review.\n' +
  'Use the original Applications review, save, start and stop workflow on these files.\n' +
  'A complete matching configuration reopens unchanged; matching partial preparation resumes.\n';
export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv.length === 1 && argv[0] === '--help') { process.stdout.write(HELP); return; }
  const [command, ...rest] = argv, options = {};
  const allowed = command === 'configure' ? ['--selection', '--out'] :
    command === 'request' ? ['--review', '--out', '--request-id'] : null;
  need(allowed && rest.length % 2 === 0, HELP);
  for (let i = 0; i < rest.length; i += 2) {
    need(allowed.includes(rest[i]) && !Object.hasOwn(options, rest[i]) &&
      typeof rest[i + 1] === 'string' && rest[i + 1].length > 0, HELP);
    options[rest[i]] = rest[i + 1];
  }
  const result = command === 'configure'
    ? await configure({ selectionFile: options['--selection'], outputDirectory: options['--out'] })
    : await requestFile({ reviewFile: options['--review'], outputFile: options['--out'],
      ...(options['--request-id'] ? { requestId: options['--request-id'] } : {}) });
  process.stdout.write(encode(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; });
