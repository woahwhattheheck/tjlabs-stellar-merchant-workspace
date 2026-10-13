#!/usr/bin/env node
// MIT. Continue the original programmes inside a verified selected installed package.
import {readFile, writeFile, mkdir, rename, lstat, realpath, readdir, symlink, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve, dirname, join, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const operation = 'SCF-RECEIVABLES-NATIVE-2A51-20261012';
const defaultSelection = 'merchant-receivables';
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const now = () => new Date().toISOString();
function need(value, code, message) {
  if (!value) throw Object.assign(new Error(message), {code});
}
function inside(parent, child) {
  const value = relative(parent, child);
  return value === '' || value !== '..' && !value.startsWith('../') && !isAbsolute(value);
}
async function exists(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function record(path) {
  const info = await exists(path);
  if (!info) return null;
  need(info.isFile() && !info.isSymbolicLink(), 'RECEIVING_RECORD_INVALID', 'Expected retained regular record: ' + path);
  return JSON.parse(await readFile(path, 'utf8'));
}
async function immutable(path, value) {
  const bytes = json(value), old = await exists(path);
  if (old) {
    need(old.isFile() && !old.isSymbolicLink() && await readFile(path, 'utf8') === bytes,
      'RECEIVING_RECORD_CONFLICT', 'Retained record differs: ' + path);
    return;
  }
  // A temporary record is recoverable after a parent interruption; publish by rename only after complete close.
  const pending = path + '.pending';
  const held = await exists(pending);
  if (held) {
    need(held.isFile() && !held.isSymbolicLink() && await readFile(pending, 'utf8') === bytes,
      'RECEIVING_RECORD_CONFLICT', 'Interrupted record differs: ' + pending);
  } else await writeFile(pending, bytes, {flag: 'wx', mode: 0o600});
  await rename(pending, path);
}
async function execute(command, args, options = {}) {
  return await new Promise((fulfil, reject) => {
    const child = spawn(command, args, {cwd: options.cwd, env: options.env, stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.once('spawn', () => process.stdout.write(json({event: 'ORIGINAL_PROCESS_ADMITTED', pid: child.pid, command: [command, ...args]}).trimEnd() + '\n'));
    child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', part => { stdout += part; });
    child.stderr?.on('data', part => { stderr += part; });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => fulfil({command: [command, ...args], exitCode, signal, stdout, stderr}));
  });
}
async function plainDirectory(path, label) {
  const result = await realpath(path), info = await lstat(result);
  need(info.isDirectory() && !info.isSymbolicLink(), 'RECEIVING_DIRECTORY_INVALID', label + ' must be an existing directory');
  return result;
}
function argumentsFor(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--held-lock') { options.held = true; continue; }
    if (key === '--help') { options.help = true; continue; }
    need(['--archive', '--sha256', '--source-ref', '--out', '--sdk-profile',
      '--sdk-node-modules', '--mcp-node-modules', '--python', '--mode', '--selection'].includes(key) &&
      !Object.hasOwn(options, key) && args[i + 1] && !args[i + 1].startsWith('--'),
      'RECEIVING_ARGUMENT_INVALID', 'Unknown, repeated or missing argument: ' + key);
    options[key] = args[++i];
  }
  return options;
}
async function archiveIdentity(path, expected) {
  const info = await lstat(path);
  need(info.isFile() && !info.isSymbolicLink() && info.size <= 64 * 1024 * 1024,
    'RECEIVING_ARCHIVE_INVALID', 'Select a regular original archive up to 64 MiB');
  const bytes = await readFile(path);
  need(sha(bytes) === expected, 'RECEIVING_ARCHIVE_CHANGED', 'Original archive SHA256 differs');
  return {bytes: bytes.length, sha256: expected};
}
async function verifyPackage(directory, expectedSource, allowRuntime, selection) {
  const manifestBytes = await readFile(join(directory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  need(manifest.schema === 'stellar-forge.merchant-distribution-manifest.v1' &&
    manifest.packageName === '@tokenjunkielabs/starforge-merchant' &&
    manifest.sourceCommit === expectedSource && manifest.sourceSelection?.id === selection,
    'RECEIVING_SELECTION_CHANGED', 'Use the exact maintained merchant-receivables selected archive');
  need(Array.isArray(manifest.files) && manifest.files.length && Array.isArray(manifest.distributionInputs),
    'RECEIVING_MANIFEST_INVALID', 'Original source inventory required');
  const expected = new Set(['manifest.json']);
  for (const [path, digest] of Object.entries(manifest.packageFiles ?? {})) {
    need(['package.json', 'README.md', 'LICENSE'].includes(path), 'RECEIVING_MANIFEST_INVALID', 'Unknown package metadata member');
    const file = join(directory, path), info = await lstat(file), bytes = await readFile(file);
    need(info.isFile() && !info.isSymbolicLink() && sha(bytes) === digest, 'RECEIVING_SOURCE_CHANGED', 'Package member changed: ' + path);
    expected.add(path);
  }
  need(expected.size === 4, 'RECEIVING_MANIFEST_INVALID', 'Complete package metadata is required');
  for (const entry of manifest.files) {
    need(typeof entry.path === 'string' && entry.packagePath === 'source/' + entry.path &&
      !entry.path.split('/').some(part => !part || part === '.' || part === '..') &&
      !/[\u0000-\u0020\u007f\\?#%:]/.test(entry.path) && !expected.has(entry.packagePath),
      'RECEIVING_MANIFEST_INVALID', 'Invalid or repeated original member');
    const file = join(directory, entry.packagePath), info = await lstat(file), bytes = await readFile(file);
    need(info.isFile() && !info.isSymbolicLink() && bytes.length === entry.bytes && sha(bytes) === entry.sha256,
      'RECEIVING_SOURCE_CHANGED', 'Original source changed: ' + entry.path);
    expected.add(entry.packagePath);
  }
  const runtimeFiles = new Set(allowRuntime ? [
    'source/PAYMENT_CHECK.mjs', 'source/MCP_RECEIVABLES_CHECK.mjs',
    'source/PAYMENT_CHECK_RESULT.json', 'source/MCP_RECEIVABLES_CHECK_RESULT.json'
  ] : []);
  const moduleLinks = new Set(allowRuntime ? [
    'source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node_modules',
    'source/stellar-forge/mcp-paid-agent/node_modules'
  ] : []);
  async function walk(path, prefix = '') {
    for (const item of await readdir(path, {withFileTypes: true})) {
      const name = prefix + item.name;
      if (moduleLinks.has(name)) { need(item.isSymbolicLink(), 'RECEIVING_MODULE_LINK_CHANGED', 'Expected original module link: ' + name); continue; }
      need(!item.isSymbolicLink(), 'RECEIVING_SOURCE_CHANGED', 'Unexpected link in installed source: ' + name);
      if (item.isDirectory()) await walk(join(path, item.name), name + '/');
      else need(item.isFile() && (expected.has(name) || runtimeFiles.has(name)),
        'RECEIVING_SOURCE_CHANGED', 'Unexpected installed member: ' + name);
    }
  }
  await walk(directory);
  return {manifest, manifestSha256: sha(manifestBytes), files: manifest.files.length};
}
async function run() {
  const options = argumentsFor(process.argv.slice(2));
  const mode = options['--mode'] ?? 'original-programmes';
  const selection = options['--selection'] ?? defaultSelection;
  need(['original-programmes', 'admission'].includes(mode), 'RECEIVING_MODE_INVALID', 'Choose original-programmes or admission.');
  need(['merchant-receivables', 'merchant-commissioning-collections'].includes(selection) &&
    (mode === 'admission' || selection === defaultSelection), 'RECEIVING_SELECTION_INVALID', 'Use an original maintained selected product.');
  if (options.help) {
    console.log('node continue-installed.mjs --archive ORIGINAL.tgz --sha256 SHA256 --source-ref COMMIT --out SAME_PRIVATE_CONTINUATION --sdk-profile EXISTING/package.json --mcp-node-modules EXISTING/node_modules [--sdk-node-modules EXISTING/node_modules] [--python python3] [--mode admission] [--selection merchant-receivables|merchant-commissioning-collections]\nBuild the original selected product first. Admission retains the exact installed release without launching an accounting programme. This command reuses installed dependencies and never dispatches hosted compute or a payment.');
    return;
  }
  for (const key of ['--archive', '--sha256', '--source-ref', '--out', '--sdk-profile', '--mcp-node-modules'])
    need(typeof options[key] === 'string', 'RECEIVING_ARGUMENT_REQUIRED', 'Required ' + key);
  need(/^[a-f0-9]{64}$/.test(options['--sha256']) && /^[a-f0-9]{40}$/.test(options['--source-ref']),
    'RECEIVING_SOURCE_INVALID', 'Exact original archive and source identities required');
  need(process.platform === 'linux' && (Number(process.versions.node.split('.')[0]) > 22 || Number(process.versions.node.split('.')[0]) === 22 && Number(process.versions.node.split('.')[1]) >= 16),
    'RECEIVING_RUNTIME_INVALID', 'Use the original Linux Node22.16+ receiving runtime');
  const output = resolve(options['--out']), parent = await plainDirectory(dirname(output), 'Output parent');
  need(dirname(output) === parent, 'RECEIVING_OUTPUT_INVALID', 'Output parent must be its actual original path');
  if (!options.held) {
    const args = process.argv.slice(2);
    const result = await execute('flock', ['--exclusive', '--nonblock', output + '.lock',
      process.execPath, fileURLToPath(import.meta.url), ...args, '--held-lock'], {inherit: true});
    process.exitCode = result.exitCode ?? 1;
    return;
  }
  const archive = await realpath(options['--archive']);
  const sdkProfile = await realpath(options['--sdk-profile']);
  const sdkProfileBytes = await readFile(sdkProfile);
  const sdk = await plainDirectory(options['--sdk-node-modules'] ?? join(dirname(sdkProfile), 'node_modules'), 'Stellar modules');
  const mcp = await plainDirectory(options['--mcp-node-modules'], 'MCP modules');
  need(!inside(output, archive) && !inside(output, sdkProfile) && !inside(output, sdk) && !inside(output, mcp) && !inside(sdk, output) && !inside(mcp, output),
    'RECEIVING_INPUT_OVERLAP', 'Source archive and original dependencies must remain outside the output');
  const provenance = JSON.parse(await readFile(join(here, 'programs', 'original-programs.json'), 'utf8'));
  need(provenance.operation === operation && provenance.programs.length === 2,
    'RECEIVING_PROGRAM_INVALID', 'Original two-programme inventory required');
  const programmes = [];
  for (const item of mode === 'original-programmes' ? provenance.programs : []) {
    need(['PAYMENT_CHECK.mjs', 'MCP_RECEIVABLES_CHECK.mjs'].includes(item.path) &&
      !programmes.some(value => value.path === item.path), 'RECEIVING_PROGRAM_INVALID', 'Invalid original programme');
    const bytes = await readFile(join(here, 'programs', item.path));
    need(bytes.length === item.bytes && sha(bytes) === item.sha256 &&
      createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') === item.gitBlob,
      'RECEIVING_PROGRAM_CHANGED', 'Original programme changed: ' + item.path);
    programmes.push({...item, bytesValue: bytes});
  }
  const identity = {
    schema: 'commons.receivables-installed-continuation.v1', operation,
    predecessor: provenance.predecessor, sourceCommit: options['--source-ref'], selection,
    ...(mode === 'admission' ? {mode} : {}),
    archive, archiveIdentity: await archiveIdentity(archive, options['--sha256']),
    sdkProfile, sdkProfileSha256: sha(sdkProfileBytes), sdkNodeModules: sdk, mcpNodeModules: mcp,
    programmes: programmes.map(({bytesValue, ...item}) => item)
  };
  const existing = await exists(output);
  if (existing) need(existing.isDirectory() && !existing.isSymbolicLink(),
    'RECEIVING_OUTPUT_INVALID', 'Original continuation must be a real directory');
  else await mkdir(output, {mode: 0o700});
  const prior = await record(join(output, 'identity.json'));
  if (prior) need(same(prior, identity), 'RECEIVING_OPERATION_CONFLICT', 'Resume the original archive, source and dependency binding');
  else {
    need((await readdir(output)).every(name => name === 'identity.json.pending'),
      'RECEIVING_OUTPUT_NOT_EMPTY', 'Use the existing same continuation or a new empty private directory');
    await immutable(join(output, 'identity.json'), identity);
  }
  const installed = join(output, 'package'), staging = join(output, 'package.pending');
  if (!await exists(installed)) {
    // Only an unexecuted extraction directory is replaceable. Programme admission happens later.
    const phases = await exists(join(output, 'phases'));
    need(!phases, 'RECEIVING_SOURCE_MISSING', 'Retained programme has lost its original installed source');
    if (await exists(staging)) await rm(staging, {recursive: true, force: true});
    const unpack = resolve(here, '../../stellar/scf-starforge-20261009/distribution/runtime-unpack.py');
    const result = await execute(options['--python'] ?? 'python3', [unpack, '--archive', archive,
      '--sha256', options['--sha256'], '--out', staging], {cwd: output});
    await immutable(join(output, 'unpack.json'), result);
    need(result.exitCode === 0, 'RECEIVING_UNPACK_FAILED', 'Original unpack failed; retained unpack.json has the complete output');
    await verifyPackage(staging, identity.sourceCommit, false, selection);
    await rename(staging, installed);
  }
  const checked = await verifyPackage(installed, identity.sourceCommit, true, selection);
  const sourceRoot = join(installed, 'source');
  for (const item of programmes) {
    const target = join(sourceRoot, item.path), info = await exists(target);
    if (info) need(info.isFile() && !info.isSymbolicLink() && sha(await readFile(target)) === item.sha256,
      'RECEIVING_PROGRAM_CHANGED', 'Retained original programme changed: ' + item.path);
    else await writeFile(target, item.bytesValue, {flag: 'wx', mode: 0o600});
  }
  for (const [path, target] of [
    ['stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node_modules', sdk],
    ['stellar-forge/mcp-paid-agent/node_modules', mcp]
  ]) {
    const link = join(sourceRoot, path), info = await exists(link);
    if (info) need(info.isSymbolicLink() && await realpath(link) === target,
      'RECEIVING_MODULE_LINK_CHANGED', 'Original module binding changed: ' + path);
    else { await mkdir(dirname(link), {recursive: true}); await symlink(target, link, 'dir'); }
  }
  const environment = {};
  for (const key of ['PATH', 'HOME', 'LANG', 'LC_ALL']) if (process.env[key] !== undefined) environment[key] = process.env[key];
  const temporary = join(output, 'runtime'); await mkdir(temporary, {recursive: true, mode: 0o700});
  Object.assign(environment, {PYTHONDONTWRITEBYTECODE: '1', TMPDIR: temporary,
    SCF_MCP_RECEIVABLES_TMP: temporary, SCF_INVOICE_SDK_PACKAGE: sdkProfile});
  const phaseRoot = join(output, 'phases'); await mkdir(phaseRoot, {recursive: true, mode: 0o700});
  const phases = [{name: 'installed-provider-admission', entry: join(here, 'inspect-installed.mjs'),
    args: ['--source', sourceRoot, '--ref', identity.sourceCommit,
      ...(mode === 'admission' ? ['--selection', selection, '--customer-handover'] : [])]}, ...programmes.map(item =>
    ({name: item.path, entry: join(sourceRoot, item.path), args: []}))];
  const results = [];
  for (const phase of phases) {
    const directory = join(phaseRoot, phase.name); await mkdir(directory, {recursive: true, mode: 0o700});
    const phaseIdentity = {phase: phase.name, sourceCommit: identity.sourceCommit,
      archiveSha256: identity.archiveIdentity.sha256, entrySha256: sha(await readFile(phase.entry))};
    let result = await record(join(directory, 'result.json'));
    if (result) {
      need(same(result.identity, phaseIdentity), 'RECEIVING_PHASE_CHANGED', 'Original completed phase identity differs: ' + directory);
      for (const file of result.nativeOutputs ?? []) {
        need(['PAYMENT_CHECK_RESULT.json', 'MCP_RECEIVABLES_CHECK_RESULT.json'].includes(file.path),
          'RECEIVING_RESULT_INVALID', 'Unknown original programme result member');
        const bytes = await readFile(join(sourceRoot, file.path));
        need(bytes.length === file.bytes && sha(bytes) === file.sha256,
          'RECEIVING_RESULT_CHANGED', 'Original native output changed: ' + file.path);
      }
    }
    if (!result) {
      need(!await record(join(directory, 'started.json')), 'RECEIVING_OUTCOME_UNKNOWN',
        'Reconcile the original admitted phase before another launch: ' + directory);
      await immutable(join(directory, 'started.json'), {phase: phase.name, startedAt: now(),
        sourceCommit: identity.sourceCommit, archiveSha256: identity.archiveIdentity.sha256,
        controllerPid: process.pid, command: [process.execPath, phase.entry, ...phase.args]});
      try {
        result = {...await execute(process.execPath, [phase.entry, ...phase.args], {cwd: sourceRoot, env: environment}),
          phase: phase.name, completedAt: now()};
      } catch (error) {
        result = {phase: phase.name, exitCode: null, completedAt: now(),
          launchError: {code: error.code ?? 'SPAWN_ERROR', message: error.message}};
      }
      result.identity = phaseIdentity;
      result.nativeOutputs = [];
      if (phase.name.endsWith('.mjs')) {
        const path = phase.name.replace(/\.mjs$/, '_RESULT.json'), info = await exists(join(sourceRoot, path));
        if (info) {
          need(info.isFile() && !info.isSymbolicLink(), 'RECEIVING_RESULT_INVALID', 'Original output must be a regular file');
          const bytes = await readFile(join(sourceRoot, path));
          result.nativeOutputs.push({path, bytes: bytes.length, sha256: sha(bytes)});
        }
      }
      await immutable(join(directory, 'result.json'), result);
    }
    results.push({phase: phase.name, exitCode: result.exitCode, result: join(directory, 'result.json')});
    console.log(json({event: 'ORIGINAL_PHASE_RECEIVED', ...results.at(-1)}).trimEnd());
    if (result.exitCode !== 0) break;
  }
  const release = mode === 'admission' ? {
    schema: 'stellar-forge.retained-customer-installed-release.v1', operation,
    sourceCommit: identity.sourceCommit, sourceSelection: selection,
    archive: {path: archive, ...identity.archiveIdentity}, packageDirectory: installed, sourceRoot,
    manifestFile: join(installed, 'manifest.json'), manifestSha256: checked.manifestSha256,
    packageName: checked.manifest.packageName, originalSourceFiles: checked.files,
    dependencies: {sdkProfile, sdkProfileSha256: identity.sdkProfileSha256,
      sdkNodeModules: sdk, mcpNodeModules: mcp},
    admission: {complete: results.length === phases.length && results.every(item => item.exitCode === 0), results},
  } : null;
  if (release) await immutable(join(output, 'installed-release.json'), release);
  const report = {schema: 'commons.receivables-installed-result.v1', operation,
    sourceCommit: identity.sourceCommit, sourceSelection: selection, manifestSha256: checked.manifestSha256,
    originalSourceFiles: checked.files, predecessor: provenance.predecessor,
    archive: identity.archiveIdentity, ...(release ? {mode, sourceRoot, installedRelease: join(output, 'installed-release.json')} : {}), results, complete: results.length === phases.length && results.every(item => item.exitCode === 0)};
  await immutable(join(output, 'receiving-result.json'), report);
  console.log(json(report).trimEnd());
  process.exitCode = report.complete ? 0 : 1;
}
run().catch(error => {
  process.stderr.write(json({operation, code: error.code ?? 'RECEIVING_FAILED', message: error.message}));
  process.exitCode = 1;
});
