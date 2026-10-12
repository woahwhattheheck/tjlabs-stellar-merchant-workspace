#!/usr/bin/env node
// MIT. One portable receiving continuation of the actual SeaTable provider operation.
// Uses the original authoring, publisher, SF82, customer export, Applications and MCP.
// No provider extraction, signing, payment, replacement database or background job.
import assert from 'node:assert/strict';
import { constants, createReadStream, fstatSync } from 'node:fs';
import { readFile, open, mkdir, lstat, realpath, rename, unlink, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, basename, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const SCF = 'stellar/scf-starforge-20261009';
const PREFIX = SCF + '/sf30-seller-sdk/seatable/';
const ENV = 'SEATABLE_RECEIVING_LEASE_FD';
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const BOUND = 2 * 256 * 1024 * 1024 + 16777216;
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const stamp = () => new Date().toISOString();
const need = (value, message) => { if (!value) throw new Error(message); };
const absolute = (value, label) => {
  need(typeof value === 'string' && isAbsolute(value) && resolve(value) === value &&
    !/[\0\r\n]/.test(value), label + ' must be a canonical absolute path.');
  return value;
};
const inside = (root, path) => {
  const tail = relative(root, path);
  return tail === '' || !isAbsolute(tail) && tail !== '..' && !tail.startsWith('..' + sep);
};
async function privateDirectory(path, create = false) {
  if (create) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const stat = await lstat(path);
  need(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() &&
    !(stat.mode & 0o077) && await realpath(path) === path, 'Use an owned private directory: ' + path);
}
async function regular(path, { optional = false, privateFile = true, maximum = BOUND } = {}) {
  let file;
  try { file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  try {
    const before = await file.stat();
    need(before.isFile() && before.nlink === 1 && before.size <= maximum &&
      (!privateFile || before.uid === process.getuid() && !(before.mode & 0o077)),
    'Use a complete regular file within the declared bound: ' + path);
    const value = await file.readFile(), after = await file.stat();
    need(value.length === before.size && before.size === after.size &&
      before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
    'The retained file changed while reading: ' + path);
    return value;
  } finally { await file.close(); }
}
async function json(path, optional = false) {
  const value = await regular(path, { optional });
  return value === null ? null : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value));
}
async function syncDirectory(path) {
  const fd = await open(path, 'r'); try { await fd.sync(); } finally { await fd.close(); }
}
async function atomic(path, value) {
  await privateDirectory(dirname(path));
  const temporary = path + '.' + randomUUID() + '.partial';
  let file;
  try {
    file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL |
      (constants.O_NOFOLLOW ?? 0), 0o600);
    await file.writeFile(value); await file.sync(); await file.close(); file = null;
    const previous = await regular(path, { optional: true });
    if (previous?.equals(value)) { await unlink(temporary); return; }
    await rename(temporary, path); await syncDirectory(dirname(path));
  } finally {
    await file?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function retain(path, value) {
  const content = bytes(value), old = await regular(path, { optional: true });
  if (old) assert.deepEqual(old, content, 'The saved operation input is immutable: ' + basename(path));
  else await atomic(path, content);
  return identity(path);
}
async function identity(path, privateFile = true) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await file.stat();
    need(before.isFile() && before.nlink === 1 &&
      (!privateFile || before.uid === process.getuid() && !(before.mode & 0o077)),
    'Regular file identity required: ' + path);
    const digest = createHash('sha256'); let length = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) { digest.update(chunk); length += chunk.length; }
    const after = await file.stat();
    need(length === before.size && before.size === after.size && before.mtimeMs === after.mtimeMs &&
      before.ctimeMs === after.ctimeMs, 'File changed during complete identity read: ' + path);
    return { file: path, bytes: length, sha256: digest.digest('hex') };
  } finally { await file.close(); }
}
async function verifyIdentity(row, root) {
  need(row && HASH.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes >= 0 &&
    inside(root, absolute(row.file, 'retained file')), 'Retained file identity is outside this operation.');
  assert.deepEqual(await identity(row.file), row, 'Retained complete artifact identity.');
}
const PYTHON_LEASE = [
  'import fcntl, os, stat, sys',
  'root, node, script, input_path = sys.argv[1:]',
  'os.umask(0o077)',
  'os.makedirs(root, mode=0o700, exist_ok=True)',
  'd = os.lstat(root)',
  'if not stat.S_ISDIR(d.st_mode) or stat.S_ISLNK(d.st_mode) or d.st_uid != os.getuid() or d.st_mode & 0o077 or os.path.realpath(root) != root:',
  '    raise SystemExit("PRIVATE_ORIGINAL_RECEIVING_ROOT_REQUIRED")',
  'fd = os.open(os.path.join(root, "operation.lock"), os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)',
  's = os.fstat(fd)',
  'if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1 or s.st_uid != os.getuid() or s.st_mode & 0o077:',
  '    raise SystemExit("PRIVATE_ORIGINAL_RECEIVING_LEASE_REQUIRED")',
  'try:',
  '    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)',
  'except BlockingIOError:',
  '    raise SystemExit("ORIGINAL_RECEIVING_OPERATION_ACTIVE")',
  'os.set_inheritable(fd, True)',
  'os.environ["SEATABLE_RECEIVING_LEASE_FD"] = str(fd)',
  'os.execv(node, [node, script, "--locked-input", input_path])',
].join('\n') + '\n';

function child(command, args, options) {
  return new Promise((done, reject) => {
    const processChild = spawn(command, args, options);
    const forward = signal => {
      if (processChild.exitCode === null && processChild.signalCode === null) processChild.kill(signal);
    };
    const term = () => forward('SIGTERM'), interrupt = () => forward('SIGINT');
    process.on('SIGTERM', term); process.on('SIGINT', interrupt);
    const detach = () => { process.off('SIGTERM', term); process.off('SIGINT', interrupt); };
    processChild.once('error', error => { detach(); reject(error); });
    processChild.once('close', (code, signal) => { detach(); done({ code, signal }); });
  });
}
async function inputAt(file) {
  file = absolute(file, 'input');
  const data = await regular(file, { maximum: 1048576 }), input = JSON.parse(data);
  need(input.schema === 'stellar-forge.seatable-receiving-input.v1' && ID.test(input.operationId),
    'Supply the original SeaTable receiving operation and input schema.');
  for (const key of ['sourceRoot', 'runtimeDirectory', 'outputDirectory', 'python']) absolute(input[key], key);
  absolute(input.sourceManifest?.file, 'source manifest');
  absolute(input.browser?.module, 'existing Playwright module');
  absolute(input.browser?.executable, 'existing Chromium executable');
  need(HASH.test(input.sourceManifest.sha256) && HASH.test(input.consumerSha256), 'Exact source hashes are required.');
  need(hash(await regular(SELF, { privateFile: false })) === input.consumerSha256, 'Selected receiving entry changed.');
  need(!inside(input.sourceRoot, input.outputDirectory) && !inside(input.outputDirectory, input.sourceRoot),
    'Keep private operation output separate from the selected public source.');
  need(typeof input.reviewer === 'string' && input.reviewer.trim() && input.reviewer.length <= 128 &&
    !/[\0\r\n]/.test(input.reviewer), 'Use the actual reviewer identity.');
  need(Array.isArray(input.sources) && input.sources.length === 2 &&
    input.sources.some(row => row.id === 'sql' && row.primary === true && Number.isSafeInteger(row.expectedRows) && row.expectedRows >= 3) &&
    input.sources.some(row => row.id === 'view' && !row.primary && Number.isSafeInteger(row.expectedRows) && row.expectedRows >= 1),
    'Supply the actual complete SQL and nonempty native-view captures and their observed counts.');
  for (const row of input.sources) {
    absolute(row.sourceFile, 'capture-backed source');
    need(HASH.test(row.sourceSha256) && HASH.test(row.captureSha256), 'Pin both original declaration and capture bytes.');
    need(!inside(input.outputDirectory, row.sourceFile), 'Keep original provider input outside this receiving output.');
  }
  need(input.merchant?.payment?.network === 'stellar:testnet', 'Only the declared development challenge is in this receiving scope.');
  need(Number(process.versions.node.split('.')[0]) >= 24 && process.platform !== 'win32',
    'Use the original Node 24+ POSIX native runtime.');
  return { input, inputFile: file, inputSha256: hash(data), root: input.outputDirectory };
}
async function sourceAt(ctx) {
  const value = await regular(ctx.input.sourceManifest.file, { privateFile: false, maximum: 16 * 1024 * 1024 });
  assert.equal(hash(value), ctx.input.sourceManifest.sha256);
  const manifest = JSON.parse(value), files = new Map();
  need(Array.isArray(manifest.files) && manifest.files.length, 'Use the original distribution source manifest.');
  for (const row of manifest.files) {
    need(typeof row.path === 'string' && !isAbsolute(row.path) && row.path &&
      !row.path.includes('\\') && !row.path.split('/').some(part => !part || part === '.' || part === '..') &&
      HASH.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && !files.has(row.path),
    'Original manifest entries must be unique canonical source paths.');
    const file = join(ctx.input.sourceRoot, row.path);
    need(await realpath(file) === file, 'Use actual installed source files; no donor symlink substitution.');
    const actual = await identity(file, false);
    need(actual.bytes === row.bytes && actual.sha256 === row.sha256, 'Original selected source changed: ' + row.path);
    files.set(row.path, row);
  }
  for (const path of [
    PREFIX + 'receiving.mjs', PREFIX + 'receiving/native-consumer.mjs',
    PREFIX + 'receiving/applications-consumer.mjs', PREFIX + 'receiving/mcp-authoring-consumer.mjs',
    PREFIX + 'workspace/model.mjs', PREFIX + 'workspace/mcp.mjs', PREFIX + 'workspace/application.mjs',
    SCF + '/distribution/runtime-workspace/model.mjs', SCF + '/sf82-seller-pilot/release-console.mjs',
    'stellar-forge/mcp-merchant-operator/serve.mjs',
  ]) need(files.has(path), 'The original complete selected source must include ' + path);
  assert.equal(files.get(PREFIX + 'receiving.mjs').sha256, ctx.input.consumerSha256);
  const { inspectMerchantRuntime } = await import(pathToFileURL(join(ctx.input.sourceRoot,
    SCF + '/sf46-release/runtime-package.mjs')).href);
  const runtime = await inspectMerchantRuntime(ctx.input.runtimeDirectory, {
    expectedManifest: ctx.input.sourceManifest.sha256, load: false });
  need(runtime.sourceRoot === ctx.input.sourceRoot && runtime.sourceManifestSha256 === ctx.input.sourceManifest.sha256,
    'Use the same READY selected runtime and original manifest.');
  return { files, summary: { sourceCommit: runtime.sourceCommit, files: files.size,
    manifestSha256: ctx.input.sourceManifest.sha256, installationId: runtime.installationId,
    profileId: runtime.profileId, lockSha256: runtime.lockSha256 } };
}
async function execute(ctx) {
  const { input, root } = ctx;
  await privateDirectory(root);
  const fd = Number(process.env[ENV]), named = await lstat(join(root, 'operation.lock'));
  need(Number.isSafeInteger(fd) && fd >= 3, 'The same original operation lease is required.');
  const held = fstatSync(fd);
  need(held.isFile() && held.nlink === 1 && held.dev === named.dev && held.ino === named.ino &&
    !(held.mode & 0o077) && held.uid === process.getuid(), 'The inherited operation lease changed.');
  const source = await sourceAt(ctx), intentPath = join(root, 'receiving-intent.json');
  const basis = { schema: 'stellar-forge.seatable-receiving-intent.v1', operationId: input.operationId,
    inputSha256: ctx.inputSha256, source: source.summary, outputDirectory: root };
  let intent = await json(intentPath, true);
  if (intent) assert.deepEqual(intent.basis, basis, 'Resume only the exact saved operation input and installed source.');
  else { intent = { basis, createdAt: stamp(), stages: {}, children: [] }; await atomic(intentPath, bytes(intent)); }
  const persist = () => atomic(intentPath, bytes(intent));
  await retain(join(root, 'receiving-input.json'), input);
  await privateDirectory(join(root, 'logs'), true);
  const completed = await json(join(root, 'result.json'), true);
  if (completed?.state === 'PASS') {
    assert.equal(completed.inputSha256, ctx.inputSha256);
    for (const file of completed.completedFiles) await verifyIdentity(file, root);
    await packageWhole(ctx, completed, fd);
    console.log(JSON.stringify({ state: 'RETAINED_COMPLETE', operationId: input.operationId,
      result: join(root, 'result.json'), delivery: join(root, 'delivery.json'),
      additionalProviderReads: 0, additionalPayments: 0 }));
    return;
  }
  const environment = { ...process.env, [ENV]: '3' };
  for (const key of ['SEATABLE_RECEIVING_PAYER_SECRET', 'SEATABLE_RECEIVING_MERCHANT_SECRET',
    'NOCODB_RECEIVING_PAYER_SECRET', 'NOCODB_RECEIVING_MERCHANT_SECRET', 'MCP_OAUTH_CONFIG'])
    delete environment[key];
  async function runSource(name, sourceFile, inputFile, resultFile, args = ['--input', inputFile]) {
    if (intent.stages[name]) {
      await verifyIdentity(intent.stages[name], root);
      const saved = await json(resultFile);
      need(saved.state === 'PASS', 'The original completed ' + name + ' stage changed.');
      return saved;
    }
    const logPath = join(root, 'logs', name + '-' + randomUUID() + '.log');
    const log = await open(logPath, 'wx', 0o600);
    const record = { name, sourceFile, inputFile, log: logPath, state: 'DISPATCHING', at: stamp() };
    intent.children.push(record); await persist();
    let exited;
    try {
      exited = await child(process.execPath, [sourceFile, ...args], {
        cwd: input.sourceRoot, env: environment, stdio: ['ignore', log.fd, log.fd, fd] });
      await log.sync();
    } finally { await log.close(); }
    record.state = 'ENDED'; record.exit = exited; record.endedAt = stamp(); await persist();
    need(exited.code === 0, 'Original ' + name + ' child did not complete; inspect its saved log and same native requests.');
    const result = await json(resultFile);
    need(result.state === 'PASS', 'Original ' + name + ' result is incomplete.');
    intent.stages[name] = await identity(resultFile); await persist();
    console.log(JSON.stringify({ phase: 'SEATABLE_RECEIVING', stage: name, state: 'PASS', result: resultFile }));
    return result;
  }
  let failure;
  try {
    const corePath = PREFIX + 'receiving/native-consumer.mjs';
    const coreInput = { schema: 'stellar-forge.seatable-native-receiving-input.v1',
      operationId: input.operationId, operationDirectory: root, consumerSha256: source.files.get(corePath).sha256,
      sourceRoot: input.sourceRoot, sourceManifest: input.sourceManifest,
      sourceRefs: input.sourceRefs ?? {}, sources: input.sources, browser: input.browser,
      merchant: input.merchant, outputDirectory: join(root, 'core') };
    await retain(join(root, 'core-input.json'), coreInput);
    const core = await runSource('core', join(input.sourceRoot, corePath),
      join(root, 'core-input.json'), join(root, 'core', 'result.json'));
    need(core.sql.first.rows === input.sources.find(row => row.id === 'sql').expectedRows &&
      core.sql.second.rows === core.sql.first.rows &&
      core.view.rows === input.sources.find(row => row.id === 'view').expectedRows, 'Complete native provider counts changed.');

    const appsPath = PREFIX + 'receiving/applications-consumer.mjs';
    const appsInput = { operationId: input.operationId, inputSha256: ctx.inputSha256,
      sourceRoot: input.sourceRoot, sourceManifestSha256: input.sourceManifest.sha256,
      runtimeDirectory: input.runtimeDirectory, coreDirectory: join(root, 'core'),
      outputDirectory: join(root, 'applications'), browser: input.browser };
    await retain(join(root, 'applications-input.json'), appsInput);
    const apps = await runSource('applications', join(input.sourceRoot, appsPath),
      join(root, 'applications-input.json'), join(root, 'applications', 'result.json'));

    const basisFile = join(root, 'source-receiving-result.json');
    const previousBasis = await json(basisFile, true);
    const proof = previousBasis ?? {
      schema: 'stellar-forge.seatable-source-receiving-result.v1', operationId: input.operationId,
      inputSha256: ctx.inputSha256, state: 'PASS', completedAt: stamp(), source: source.summary,
      core: { resultSha256: intent.stages.core.sha256, sql: core.sql, view: core.view },
      applications: { resultSha256: intent.stages.applications.sha256, finalPhase: apps.finalPhase,
        applicationId: apps.applicationId, originalRunIds: apps.originalRunIds },
      completedFiles: [intent.stages.core, intent.stages.applications, ...apps.completedFiles,
        await identity(join(root, 'core-input.json')), await identity(join(root, 'core', 'intent.json'))],
      additionalProviderReads: 0, additionalPayments: 0,
      paymentScope: 'Original HTTP 402, pinned configuration and offline customer request; no signer or settlement.',
    };
    assert.equal(proof.inputSha256, ctx.inputSha256);
    for (const file of proof.completedFiles) await verifyIdentity(file, root);
    await retain(basisFile, proof);
    const mcpPath = PREFIX + 'receiving/mcp-authoring-consumer.mjs';
    const mcpInput = { schema: 'stellar-forge.seatable-mcp-receiving-input.v1',
      operationId: input.operationId, consumerSha256: source.files.get(mcpPath).sha256,
      completedOperation: { directory: root, resultSha256: (await identity(basisFile)).sha256 },
      sourceRoot: input.sourceRoot, sourceManifest: input.sourceManifest,
      runtimeDirectory: input.runtimeDirectory, python: input.python,
      browser: input.browser, reviewer: input.reviewer };
    await retain(join(root, 'mcp-input.json'), mcpInput);
    const mcp = await runSource('mcp', join(input.sourceRoot, mcpPath),
      join(root, 'mcp-input.json'), join(root, 'mcp-authoring', 'result.json'),
      ['--locked-input', join(root, 'mcp-input.json')]);
    for (const row of input.sources)
      assert.equal((await identity(row.sourceFile)).sha256, row.sourceSha256, 'Original provider declaration stayed unchanged.');
    const result = {
      schema: 'stellar-forge.seatable-receiving-result.v1', operationId: input.operationId,
      state: 'PASS', completedAt: stamp(), inputSha256: ctx.inputSha256,
      consumerSha256: input.consumerSha256, source: source.summary,
      core: { result: intent.stages.core, sql: core.sql, view: core.view, customer: core.customer },
      applications: { result: intent.stages.applications, applicationId: apps.applicationId,
        finalPhase: apps.finalPhase, originalRunIds: apps.originalRunIds },
      mcp: { result: intent.stages.mcp, stages: Object.keys(mcp.stages), cleanup: mcp.cleanup },
      completedFiles: [intent.stages.core, intent.stages.applications, intent.stages.mcp,
        ...apps.completedFiles, ...mcp.completedFiles, await identity(basisFile)],
      additionalProviderReads: 0, additionalPayments: 0,
      paymentScope: proof.paymentScope,
      privateCustody: 'The complete archive contains private source captures, workspaces and merchant staging. Use core/received-client for customer-facing generated source.',
    };
    for (const file of result.completedFiles) await verifyIdentity(file, root);
    intent.state = 'COMPLETE'; intent.completedAt = result.completedAt; await persist();
    await atomic(join(root, 'result.json'), bytes(result));
    await packageWhole(ctx, result, fd);
    console.log(JSON.stringify({ state: 'PASS', operationId: input.operationId,
      result: join(root, 'result.json'), delivery: join(root, 'delivery.json'),
      sqlRows: core.sql.first.rows, viewRows: core.view.rows,
      additionalProviderReads: 0, additionalPayments: 0 }));
  } catch (error) { failure = error; }
  if (failure) {
    try { await atomic(join(root, 'receiving-failure.json'), bytes({
      schema: 'stellar-forge.seatable-receiving-failure.v1', operationId: input.operationId,
      at: stamp(), inputSha256: ctx.inputSha256, completedStages: Object.keys(intent.stages),
      code: failure.code ?? 'RECEIVING_NOT_COMPLETE', message: String(failure.message),
      recovery: 'Keep the same input, operation.lock, original native request UUIDs, source and private output. Reopen this entry; completed stages are verified and retained.',
    })); } catch (journalError) {
      console.error(JSON.stringify({ state: 'FAILURE_JOURNAL_NOT_RETAINED', code: journalError.code ?? 'WRITE_FAILED' }));
    }
    throw failure;
  }
}

async function packageWhole(ctx, result, lease) {
  const root = ctx.root, archive = join(root, 'SeaTable_Complete_Receiving.tar.gz');
  const prior = await json(join(root, 'delivery.json'), true);
  if (prior) {
    need(prior.schema === 'stellar-forge.seatable-receiving-delivery.v1' &&
      prior.operationId === ctx.input.operationId &&
      prior.result.sha256 === (await identity(join(root, 'result.json'))).sha256, 'The retained whole delivery changed.');
    await verifyIdentity(prior.archive, root); return prior;
  }
  let plan = await json(join(root, 'archive-plan.json'), true);
  if (!plan) {
    const files = [], directories = [];
    const excluded = new Set(['operation.lock', 'delivery.json', 'archive-plan.json',
      'archive-members.bin', 'SeaTable_Complete_Receiving.tar.gz', 'receiving-failure.json']);
    async function scan(directory) {
      for (const name of (await readdir(directory)).sort()) {
        const file = join(directory, name), path = relative(root, file).split(sep).join('/');
        if (directory === root && (excluded.has(name) || name.startsWith('SeaTable_Complete_Receiving.tar.gz.'))) continue;
        const stat = await lstat(file);
        need(!stat.isSymbolicLink(), 'A closed receiving tree must not acquire a symlink: ' + path);
        if (stat.isDirectory()) { directories.push(path); await scan(file); }
        else {
          need(stat.isFile() && stat.nlink === 1, 'Only original regular private receiving files are packaged.');
          files.push({ path, ...await identity(file) });
        }
      }
    }
    await scan(root);
    plan = { schema: 'stellar-forge.seatable-receiving-archive-plan.v1',
      operationId: ctx.input.operationId, resultSha256: (await identity(join(root, 'result.json'))).sha256,
      directories, files, createdAt: stamp(), format: 'posix-tar-gzip', private: true };
    await retain(join(root, 'archive-plan.json'), plan);
  }
  need(plan.operationId === ctx.input.operationId && plan.resultSha256 ===
    (await identity(join(root, 'result.json'))).sha256, 'The complete archive basis is immutable.');
  for (const row of plan.files) {
    need(row.file === join(root, row.path) && inside(root, row.file), 'Archive member scope changed.');
    await verifyIdentity({ file: row.file, bytes: row.bytes, sha256: row.sha256 }, root);
  }
  const members = [...plan.directories, ...plan.files.map(row => row.path), 'archive-plan.json'];
  need(new Set(members).size === members.length && members.every(path =>
    path && !isAbsolute(path) && !path.split('/').some(part => !part || part === '.' || part === '..') &&
    !path.includes('\0')), 'Archive member paths must be canonical.');
  const listFile = join(root, 'archive-members.bin'), list = Buffer.from(members.join('\0') + '\0');
  const oldList = await regular(listFile, { optional: true });
  if (oldList) assert.deepEqual(oldList, list); else await atomic(listFile, list);
  let present = true;
  try { await lstat(archive); } catch (error) { if (error.code !== 'ENOENT') throw error; present = false; }
  if (!present) {
    const temporary = archive + '.' + randomUUID() + '.partial';
    const exited = await child('tar', ['--create', '--gzip', '--file', temporary,
      '--directory', root, '--no-recursion', '--null', '--files-from', listFile],
    { stdio: ['ignore', 'inherit', 'inherit', lease], env: { ...process.env, [ENV]: '3' } });
    need(exited.code === 0, 'The complete private archive remains unpublished; retain the original archive plan.');
    const file = await open(temporary, 'r'); try { await file.sync(); } finally { await file.close(); }
    await rename(temporary, archive); await syncDirectory(root);
  }
  // Verify the retained archive against the exact frozen inventory. This also
  // reconciles a completed archive whose delivery-receipt response was lost.
  const verifier = [
    'import hashlib, json, sys, tarfile',
    'archive, plan_file = sys.argv[1:]',
    'with open(plan_file, "rb") as f: plan_bytes = f.read()',
    'plan = json.loads(plan_bytes)',
    'expected = {r["path"]: (r["bytes"], r["sha256"]) for r in plan["files"]}',
    'expected["archive-plan.json"] = (len(plan_bytes), hashlib.sha256(plan_bytes).hexdigest())',
    'directories = set(plan["directories"]); seen = set()',
    'with tarfile.open(archive, "r|gz") as tar:',
    '    for member in tar:',
    '        name = member.name.rstrip("/") if member.isdir() else member.name',
    '        if name in seen: raise SystemExit("DUPLICATE_ARCHIVE_MEMBER")',
    '        seen.add(name)',
    '        if member.isdir():',
    '            if name not in directories: raise SystemExit("UNEXPECTED_ARCHIVE_DIRECTORY")',
    '            continue',
    '        if not member.isfile() or name not in expected: raise SystemExit("UNEXPECTED_ARCHIVE_MEMBER")',
    '        count = 0; digest = hashlib.sha256()',
    '        with tar.extractfile(member) as f:',
    '            while True:',
    '                part = f.read(65536)',
    '                if not part: break',
    '                count += len(part); digest.update(part)',
    '        if (count, digest.hexdigest()) != expected[name]: raise SystemExit("ARCHIVE_MEMBER_CHANGED")',
    'if seen != set(expected) | directories: raise SystemExit("ARCHIVE_INCOMPLETE")',
    'print(json.dumps({"state":"VERIFIED","files":len(expected),"directories":len(directories)}))',
  ].join('\n') + '\n';
  const verified = await child(ctx.input.python, ['-I', '-B', '-c', verifier, archive, join(root, 'archive-plan.json')],
    { stdio: ['ignore', 'inherit', 'inherit', lease], env: { ...process.env, [ENV]: '3' } });
  need(verified.code === 0, 'The whole archive did not match its original private inventory.');
  const delivery = { schema: 'stellar-forge.seatable-receiving-delivery.v1',
    operationId: ctx.input.operationId, completedAt: stamp(), state: 'COMPLETE', private: true,
    result: await identity(join(root, 'result.json')), archive: await identity(archive),
    inventory: await identity(join(root, 'archive-plan.json')), files: plan.files.length + 1,
    source: result.source, additionalProviderReads: 0, additionalPayments: 0 };
  await atomic(join(root, 'delivery.json'), bytes(delivery)); return delivery;
}


async function prepareSelection(selectionFile) {
  selectionFile = absolute(selectionFile, 'private receiving selection');
  const selection = await json(selectionFile);
  need(selection.schema === 'stellar-forge.seatable-receiving-selection.v1' &&
    ID.test(selection.operationId), 'Use the original receiving-selection schema and operation identity.');
  for (const key of ['sourceRoot', 'runtimeDirectory', 'outputDirectory', 'python', 'inputFile'])
    absolute(selection[key], key);
  absolute(selection.browser?.module, 'existing Playwright module');
  absolute(selection.browser?.executable, 'existing Chromium executable');
  need(!inside(selection.outputDirectory, selection.inputFile) &&
    !inside(selection.sourceRoot, selection.inputFile),
    'Keep the prepared private input outside the selected source and its receiving output.');
  need(typeof selection.reviewer === 'string' && selection.reviewer.trim() &&
    selection.reviewer.length <= 128 && !/[\0\r\n]/.test(selection.reviewer), 'Actual reviewer identity required.');
  need(selection.merchant?.payment?.network === 'stellar:testnet', 'Only the original development challenge is in scope.');
  const sourceManifestFile = absolute(selection.sourceManifest?.file, 'original source manifest');
  const sourceManifest = await regular(sourceManifestFile, { privateFile: false, maximum: 16 * 1024 * 1024 });
  need(HASH.test(selection.sourceManifest.sha256) &&
    hash(sourceManifest) === selection.sourceManifest.sha256, 'Review the actual installed source manifest hash.');
  const input = { schema: 'stellar-forge.seatable-receiving-input.v1',
    operationId: selection.operationId, consumerSha256: hash(await regular(SELF, { privateFile: false })),
    sourceRoot: selection.sourceRoot, sourceManifest: selection.sourceManifest,
    runtimeDirectory: selection.runtimeDirectory, outputDirectory: selection.outputDirectory,
    python: selection.python, browser: selection.browser, reviewer: selection.reviewer,
    merchant: selection.merchant, sourceRefs: selection.sourceRefs ?? {}, sources: [] };
  await sourceAt({ input });
  need(Array.isArray(selection.sources) && selection.sources.length === 2 &&
    selection.sources.some(row => row.id === 'sql') && selection.sources.some(row => row.id === 'view'),
    'Select one existing SQL capture and one existing native-view capture.');
  const [{ readSeaTableSourceFile }, { readSeaTableCapture, bindSeaTableCapture }] = await Promise.all([
    import(pathToFileURL(join(selection.sourceRoot, PREFIX, 'declaration.mjs')).href),
    import(pathToFileURL(join(selection.sourceRoot, PREFIX, 'capture.mjs')).href),
  ]);
  for (const row of selection.sources) {
    const sourceFile = absolute(row.sourceFile, 'captured source');
    need(!inside(selection.outputDirectory, sourceFile), 'Original provider input stays outside this receiving output.');
    const original = await readSeaTableSourceFile(sourceFile);
    need(original.config.connection.kind === 'capture' && original.captureFile,
      'Capture-backed original input required. Preparation makes no provider request.');
    if (row.sourceSha256 !== undefined) assert.equal(original.hash, row.sourceSha256);
    const capture = await readSeaTableCapture(original.captureFile, original.config.connection.sha256);
    if (row.captureSha256 !== undefined) assert.equal(capture.manifestSha256, row.captureSha256);
    const records = bindSeaTableCapture(capture, original.config), sql = row.id === 'sql';
    assert.equal(capture.manifest.responseKind, sql ? 'PAGED_SQL_READ' : 'PAGED_VIEW_READ');
    assert.equal(capture.manifest.countVerified, sql);
    assert.equal(capture.manifest.atomicSourceSnapshot, false);
    need(records.length === capture.manifest.rowCount && records.length >= (sql ? 3 : 1),
      'Use actual complete nonempty captures; SQL needs three rows for cursor comparison.');
    const query = original.queries[row.query];
    need(query && Array.isArray(row.publicColumns) && row.publicColumns.length &&
      new Set(row.publicColumns).size === row.publicColumns.length &&
      row.publicColumns.every(name => Object.hasOwn(query.projection, name)) &&
      row.publicColumns.includes(row.orderColumn) &&
      query.projection[row.orderColumn].source === '$recordId',
    'Explicitly select the actual public aliases and original native row-identity order.');
    input.sources.push({ id: row.id, primary: sql, sourceFile, sourceSha256: original.hash,
      captureSha256: capture.manifestSha256, expectedRows: records.length, query: row.query,
      publicColumns: row.publicColumns, orderColumn: row.orderColumn });
  }
  await privateDirectory(dirname(selection.inputFile));
  const saved = await retain(selection.inputFile, input);
  // Full normal receiving validation is performed before returning the prepared
  // input; this is still a read-only source operation with no workspace open.
  await inputAt(saved.file);
  console.log(JSON.stringify({ state: 'PREPARED', operationId: input.operationId, input: saved,
    sources: input.sources.map(row => ({ id: row.id, sourceSha256: row.sourceSha256,
      captureSha256: row.captureSha256, rows: row.expectedRows, query: row.query,
      publicColumns: row.publicColumns, orderColumn: row.orderColumn })),
    additionalProviderReads: 0, additionalPayments: 0 }));
  return saved;
}

const argv = process.argv.slice(2);
try {
  need(argv.length === 2 && ['--prepare', '--input', '--locked-input'].includes(argv[0]),
    'Usage: seatable-receive --prepare /absolute/private/selection.json OR --input /absolute/private/receiving-input.json');
  process.umask(0o077);
  if (argv[0] === '--prepare') await prepareSelection(argv[1]);
  else {
  const ctx = await inputAt(argv[1]);
  if (argv[0] === '--input') {
    const exited = await child(ctx.input.python, ['-I', '-B', '-c', PYTHON_LEASE,
      ctx.root, process.execPath, SELF, ctx.inputFile], { stdio: 'inherit', env: process.env });
    process.exitCode = exited.code ?? 2;
  } else await execute(ctx);
  }
} catch (error) {
  console.error(JSON.stringify({ state: 'NOT_COMPLETE', code: error.code ?? 'SEATABLE_RECEIVING_NOT_COMPLETE',
    message: String(error.message), recovery: 'Keep the same operation input and private output; reconcile the saved native request before any new command.' }));
  process.exitCode = 2;
}
