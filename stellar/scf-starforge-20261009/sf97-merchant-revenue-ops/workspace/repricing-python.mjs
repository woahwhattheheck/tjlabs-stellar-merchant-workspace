// MIT. Reprice complete Python sources through their original compiler and SF82.
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, rm } from 'node:fs/promises';
import { isAbsolute, join, resolve, posix } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { compilePythonMerchant } from '../../sf30-seller-sdk/python/config.mjs';
import { inspectPythonRelease, stagePythonRelease, PYTHON_SOURCE_SCHEMA } from '../../sf82-seller-pilot/release-python.mjs';
import { inspectRelease, readReleaseState, stageRelease, normalizeReleaseRuntime } from '../../sf82-seller-pilot/releases.mjs';
import { validateRepricingReview } from './repricing.mjs';

export const PYTHON_REPRICING_KIND = 'PYTHON_MERCHANT_PACKAGE';
const PACKAGE = 'source-package', PREFIX = 'python/source/', MiB = 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (_, item) => plain(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const same = (left, right) => canonical(left) === canonical(right);
const descriptor = (file, data) => ({file, bytes:data.length, sha256:digest(data)});
const ordered = files => [...files].sort((left, right) => left.file.localeCompare(right.file));
const fail = (code, message, status = 422) => {
  throw Object.assign(new Error(message), {code, status});
};
const json = bytes => JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));

function absolute(path, name) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || path === '/')
    fail('ABSOLUTE_SOURCE_PATH_REQUIRED', name + ' requires an absolute normalized path.');
  return path;
}
async function directory(path, name) {
  absolute(path, name);
  if (!(await lstat(path)).isDirectory() || await realpath(path) !== path)
    fail('ORIGINAL_SOURCE_DIRECTORY_REQUIRED', name + ' must name its real original directory.');
  return path;
}
function sourcePath(path) {
  if (typeof path !== 'string' || !path.startsWith(PREFIX) || /[\\\u0000-\u001f\u007f]/.test(path) ||
      path.split('/').some(part => !part || part === '.' || part === '..'))
    fail('PYTHON_SOURCE_PATH_CHANGED', 'Use the original retained Python source paths.');
  return path;
}
async function bytesAt(path, maximum = 8 * MiB) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximum)
      fail('PYTHON_SOURCE_FILE_REQUIRED', 'An original Python file exceeds its native file-type or size limit.');
    const bytes = await handle.readFile();
    if (bytes.length > maximum)
      fail('PYTHON_SOURCE_FILE_TOO_LARGE', 'An original Python file grew beyond its native size limit.');
    return bytes;
  } finally { await handle.close(); }
}
async function writeOnce(path, bytes) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}
async function parents(root, name) {
  let folder = root;
  for (const part of name.split('/').slice(0, -1)) {
    folder = join(folder, part);
    try { await mkdir(folder, {mode:0o700}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; await directory(folder, 'Private Python source'); }
  }
}
async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

/** Keep the Python declaration as the editable source, with its native service. */
export function preparePythonDeclarationRepricing({declaration, review} = {}) {
  const decision = validateRepricingReview(review), original = structuredClone(declaration);
  const compiled = compilePythonMerchant(original);
  if (!isDeepStrictEqual(compiled.service, decision.seller))
    fail('PYTHON_SOURCE_MISMATCH', 'The original Python declaration does not compile to this saved seller.', 409);
  const proposed = structuredClone(original);
  for (const edit of decision.edits) {
    const definition = proposed.functions[edit.routeId];
    if (edit.paymentIndex !== 0 || !definition || definition.payment?.amount !== edit.expectedAmount)
      fail('PYTHON_PAYMENT_MISMATCH', 'The Python function does not contain this exact original payment amount.', 409);
    definition.payment.amount = edit.amount;
  }
  const after = compilePythonMerchant(proposed);
  if (!isDeepStrictEqual(after.service, decision.proposedSeller))
    fail('PYTHON_REPRICE_MISMATCH', 'The Python compiler returned different proposed seller terms.', 409);
  return {decision, declaration:proposed, service:after.service};
}

async function captureSource(folder) {
  await directory(folder, 'Python merchant release');
  const original = await inspectPythonRelease(folder), captured = new Map();
  for (const file of original.files) {
    const bytes = await bytesAt(join(folder, file.file));
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256)
      fail('PYTHON_SOURCE_CHANGED', 'The original Python release changed during capture. Reopen its saved version.', 409);
    captured.set(file.file, bytes);
  }
  const manifestBytes = captured.get('manifest.json');
  if (!manifestBytes || !same(json(manifestBytes), original.manifest))
    fail('PYTHON_SOURCE_CHANGED', 'The original Python manifest changed during capture.', 409);
  return {
    originalManifestBytes:manifestBytes,
    originalPlanBytes:captured.get('python/declaration.json'),
    originalRuntimeBytes:captured.get('python/merchant.json'),
    originalSellerBytes:captured.get('seller-service.json'),
    sourceFiles:original.manifest.files.filter(file => file.file.startsWith(PREFIX))
      .map(file => ({...file, data:captured.get(file.file)})),
  };
}

function prepareCaptured(captured, coreReview) {
  const {originalManifestBytes, originalPlanBytes, originalRuntimeBytes, originalSellerBytes} = captured;
  if (![originalManifestBytes, originalPlanBytes, originalRuntimeBytes, originalSellerBytes].every(Buffer.isBuffer))
    fail('PREPARED_PYTHON_SOURCE_CHANGED', 'Retain the complete original Python declaration, runtime, service and manifest.', 409);
  const manifest = json(originalManifestBytes), python = manifest.python;
  if (manifest.schema !== PYTHON_SOURCE_SCHEMA || !Array.isArray(manifest.files) || !python ||
      !['ENTRY_MODULE_ONLY', 'SOURCE_DIRECTORY'].includes(python.sourceScope))
    fail('PYTHON_SOURCE_REQUIRED', 'Choose an original complete Python seller release.');
  sourcePath(python.entry);
  if (python.declarationSourceFile !== null) sourcePath(python.declarationSourceFile);
  const fileMap = new Map(manifest.files.map(file => [file.file, file]));
  for (const [name, bytes] of [['python/declaration.json', originalPlanBytes], ['python/merchant.json', originalRuntimeBytes]]) {
    const file = fileMap.get(name);
    if (!file || file.bytes !== bytes.length || file.sha256 !== digest(bytes))
      fail('PREPARED_PYTHON_SOURCE_CHANGED', 'A retained Python declaration differs from its native source manifest.', 409);
  }
  if (manifest.serviceConfigSha256 !== digest(originalSellerBytes))
    fail('PREPARED_PYTHON_SOURCE_CHANGED', 'The retained Python seller differs from its original source manifest.', 409);
  const expectedFiles = ordered(manifest.files.filter(file => file.file.startsWith(PREFIX)));
  if (!Array.isArray(captured.sourceFiles) || captured.sourceFiles.length > 512 ||
      !same(expectedFiles, ordered(captured.sourceFiles.map(({file, bytes, sha256}) => ({file, bytes, sha256})))))
    fail('PREPARED_PYTHON_SOURCE_CHANGED', 'Retain every original Python application, helper and asset exactly once.', 409);
  let totalBytes = 0;
  for (const file of captured.sourceFiles) {
    sourcePath(file.file);
    if (!Buffer.isBuffer(file.data) || file.data.length !== file.bytes || digest(file.data) !== file.sha256)
      fail('PREPARED_PYTHON_SOURCE_CHANGED', 'A retained Python application, helper or asset differs from its original bytes.', 409);
    totalBytes += file.bytes;
  }
  if (totalBytes > 32 * MiB)
    fail('PYTHON_SOURCE_TOO_LARGE', 'The original Python source exceeds its native 32 MiB limit.');
  const original = json(originalPlanBytes), runtime = json(originalRuntimeBytes);
  const repriced = preparePythonDeclarationRepricing({declaration:original, review:coreReview});
  if (!isDeepStrictEqual(json(originalSellerBytes), repriced.decision.seller))
    fail('PYTHON_SOURCE_MISMATCH', 'The selected Python release belongs to another saved seller.', 409);
  const configFile = python.declarationSourceFile ?? 'python/declaration.json';
  // Relocate only original path bindings. Preserve the resolved interpreter from
  // the original native runtime; never resolve its former relative path anew.
  const portable = {...repriced.declaration,
    application:posix.relative(posix.dirname(configFile), python.entry),
    ...(Object.hasOwn(runtime, 'python') ? {python:runtime.python} : {})};
  const portableBytes = encode(portable), planBytes = encode(repriced.declaration);
  if (portableBytes.length > MiB || planBytes.length > MiB)
    fail('PYTHON_DECLARATION_TOO_LARGE', 'The repriced declaration exceeds its native 1 MiB limit.');
  const proposedFiles = ordered(captured.sourceFiles.map(file => {
    const data = file.file === python.declarationSourceFile ? portableBytes : file.data;
    return {...descriptor(file.file, data), data};
  }));
  const sourceDescriptors = proposedFiles.map(({file, bytes, sha256}) => ({file, bytes, sha256}));
  const review = {kind:PYTHON_REPRICING_KIND,
    inputManifestSha256:digest(originalManifestBytes), sourceFile:'python/declaration.json',
    originalSourceSha256:python.sourceSha256, originalPlanSha256:digest(originalPlanBytes),
    originalRuntimeSha256:digest(originalRuntimeBytes), proposedPlanSha256:digest(planBytes),
    portablePlanSha256:digest(portableBytes), proposedSourceSha256:digest(canonical(sourceDescriptors)),
    python:{entry:python.entry, sourceScope:python.sourceScope,
      declarationSourceFile:python.declarationSourceFile, applicationSha256:python.applicationSha256,
      executionSha256:python.executionSha256, fileCount:python.fileCount, totalBytes:python.totalBytes,
      interpreter:python.interpreter}};
  return {...captured, coreReview:repriced.decision, review, plan:repriced.declaration,
    portablePlan:portable, configFile, proposedFiles};
}

/** Read the original native snapshot without importing or running its Python. */
export async function preparePythonRepricingSource(folder, coreReview) {
  return prepareCaptured(await captureSource(folder), coreReview);
}

const shell = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
function runGuide(prepared) {
  const config = prepared.configFile, root = prepared.review.python.sourceScope === 'SOURCE_DIRECTORY'
    ? ' --python-root ' + shell('python/source') : '';
  const fence = String.fromCharCode(96).repeat(3);
  return '# Repriced Python merchant source\n\n' +
    'This directory contains the complete source generated by the original Python release writer. ' +
    'Run the original release command from this directory, using your installed toolkit and original release store.\n\n' +
    fence + 'sh\nnode /path/to/toolkit/stellar/scf-starforge-20261009/sf82-seller-pilot/release-cli.mjs stage ' +
    '--store /absolute/path/to/merchant-releases --id reviewed-python-price --python ' + shell(config) + root + '\n' + fence + '\n\n' +
    'Supply the intended native facilitator and port through the original release command. ' +
    'Use its existing comparison, activation, run and rollback workflow for this immutable release. ' +
    'The saved pricing decision retains the original declaration and manifest beside this package.\n';
}

/** Save complete original source with the native Python snapshot writer. */
export async function writePythonRepricingSource(prepared, parent, finalParent = parent) {
  await directory(parent, 'Pending pricing decision'); absolute(finalParent, 'Committed pricing decision');
  const rebuilt = prepareCaptured(prepared, prepared.coreReview);
  if (!same(rebuilt.review, prepared.review) || !same(rebuilt.plan, prepared.plan) ||
      !same(rebuilt.portablePlan, prepared.portablePlan))
    fail('PREPARED_PYTHON_SOURCE_CHANGED', 'The prepared Python source differs from its reviewed price decision.', 409);
  const input = join(parent, '.python-input-' + randomUUID()), folder = join(parent, PACKAGE);
  let created = false;
  try {
    await mkdir(input, {mode:0o700}); created = true;
    for (const file of rebuilt.proposedFiles) {
      await parents(input, file.file);
      await writeOnce(join(input, file.file), file.data);
    }
    if (rebuilt.review.python.declarationSourceFile === null) {
      await parents(input, rebuilt.configFile);
      await writeOnce(join(input, rebuilt.configFile), encode(rebuilt.portablePlan));
    }
    const sourceRoot = rebuilt.review.python.sourceScope === 'SOURCE_DIRECTORY' ? join(input, 'python/source') : undefined;
    const saved = await stagePythonRelease(folder, join(input, rebuilt.configFile), {sourceRoot});
    if (!isDeepStrictEqual(saved.service, rebuilt.coreReview.proposedSeller) ||
        saved.python.applicationSha256 !== rebuilt.review.python.applicationSha256 ||
        saved.python.executionSha256 !== rebuilt.review.python.executionSha256 ||
        saved.python.sourceSha256 !== rebuilt.review.proposedSourceSha256 ||
        saved.python.sourceScope !== rebuilt.review.python.sourceScope ||
        saved.python.declarationSourceFile !== rebuilt.review.python.declarationSourceFile)
      fail('SAVED_PYTHON_SOURCE_CHANGED', 'The original Python writer returned different application source or proposed terms.', 409);
    await writeOnce(join(parent, 'source-manifest.json'), rebuilt.originalManifestBytes);
    await writeOnce(join(parent, 'source-plan.json'), rebuilt.originalPlanBytes);
    await writeOnce(join(parent, 'source-runtime.json'), rebuilt.originalRuntimeBytes);
    await writeOnce(join(parent, 'proposed-python-plan.json'), encode(rebuilt.plan));
    await writeOnce(join(folder, 'RUN.md'), Buffer.from(runGuide(rebuilt)));
    const readback = await inspectPythonRelease(folder);
    if (!same(readback.manifest, saved.manifest))
      fail('SAVED_PYTHON_SOURCE_CHANGED', 'The retained Python package changed after its native writer completed.', 409);
    await syncDirectory(folder); await syncDirectory(parent);
    return {review:rebuilt.review, sourcePackage:join(finalParent, PACKAGE),
      package:{name:PACKAGE, kind:PYTHON_REPRICING_KIND,
        manifestSha256:digest(await bytesAt(join(folder, 'manifest.json'), 2 * MiB)),
        sourceFile:rebuilt.configFile, originalSourceSha256:rebuilt.review.originalSourceSha256,
        planSha256:rebuilt.review.proposedPlanSha256}};
  } finally { if (created) await rm(input, {recursive:true, force:true}); }
}

async function existingRelease(root, id) {
  try { await lstat(join(root, 'releases', id)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  return inspectRelease(root, id);
}
function matchingRelease(release, expected) {
  if (release.id !== expected.id || release.label !== expected.label ||
      release.publicOrigin !== expected.publicOrigin || release.inputPackage !== undefined ||
      !same(release.runtime, expected.runtime) || !same(release.python, expected.python) ||
      Object.entries(expected.source).some(([key, value]) => release.source?.[key] !== value))
    fail('REPRICING_RELEASE_CONFLICT', 'That release ID belongs to a different Python source, runtime or label.', 409);
  return release;
}

/** Stage or recover the same original Python release and stable pricing ID. */
export async function stagePythonRepricingSource({directory:decision, releaseStore, runtime = {}, id, label} = {}) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id))
    fail('RELEASE_ID_REQUIRED', 'Use the original release ID format: 1-64 lowercase letters, digits, underscores or hyphens.');
  label = label ?? id;
  if (typeof label !== 'string' || !label.trim() || label.length > 240 || /[\u0000-\u001f\u007f]/.test(label))
    fail('RELEASE_LABEL_REQUIRED', 'Use a nonempty, single-line release label up to 240 characters.');
  label = label.trim();
  const root = await directory(releaseStore, 'Original release store');
  await readReleaseState(root);
  const folder = join(await directory(decision, 'Saved pricing decision'), PACKAGE);
  const snapshot = await inspectPythonRelease(folder);
  const supplied = typeof runtime === 'string'
    ? json(await bytesAt(absolute(runtime, 'Release runtime'), MiB)) : runtime;
  const normalized = normalizeReleaseRuntime(supplied);
  if (normalized.handlers || normalized.upstreams || normalized.allowLoopbackUpstream)
    fail('SOURCE_OWNS_RELEASE_BINDINGS', 'The retained Python package owns its original application bindings.');
  const configFile = snapshot.python.declarationSourceFile ?? 'python/declaration.json';
  const options = {id, label, python:join(folder, configFile), runtime:supplied,
    ...(snapshot.python.sourceScope === 'SOURCE_DIRECTORY' ? {pythonRoot:join(folder, 'python/source')} : {})};
  const expected = {id, label, publicOrigin:snapshot.service.publicOrigin, runtime:normalized, python:snapshot.python,
    source:{offersSha256:snapshot.manifest.offersSha256, serviceConfigSha256:snapshot.manifest.serviceConfigSha256,
      kind:'PYTHON_APPLICATION', declarationSha256:snapshot.python.configSha256,
      applicationSha256:snapshot.python.applicationSha256, sourceSha256:snapshot.python.sourceSha256}};
  const previous = await existingRelease(root, id);
  if (previous) return {status:'RELEASE_STAGED', release:matchingRelease(previous, expected), recovered:true};
  try { await stageRelease(root, options); }
  catch (error) {
    const observed = await existingRelease(root, id);
    if (observed) return {status:'RELEASE_STAGED', release:matchingRelease(observed, expected), recovered:true};
    throw error;
  }
  return {status:'RELEASE_STAGED', release:matchingRelease(await inspectRelease(root, id), expected), recovered:false};
}
