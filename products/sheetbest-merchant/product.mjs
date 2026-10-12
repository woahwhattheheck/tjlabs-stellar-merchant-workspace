#!/usr/bin/env node
// MIT. One installed Sheet Best product over the original source workspace.
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { lstat, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { privateDirectory, readPrivate, readJson, bytes, digest, identity,
  acquireWorkspace, atomicJson, fault } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/postgres/publisher/files.mjs';
import { createOrVerify } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/sheetbest/workspace/packet.mjs';

export const PRODUCT_SCHEMA = 'stellar-forge.sheetbest-installed-product.v1';
export const AUTHORING_PATH = 'stellar/scf-starforge-20261009/sf30-seller-sdk/sheetbest/workspace';
const exists = async path => { try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
export const absolute = value => {
  if (typeof value !== 'string' || !value || value !== resolve(value)) throw fault('PRODUCT_ABSOLUTE_PATH_REQUIRED');
  return value;
};

export async function installedSource(runtimeDirectory) {
  absolute(runtimeDirectory);
  // This is the maintained READY/profile/lock/source verifier, not a separate installer.
  const runtime = await inspectMerchantRuntime(runtimeDirectory, { load: false });
  const manifestFile = join(runtimeDirectory, 'package', 'manifest.json');
  const manifestStat = await lstat(manifestFile);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 32 * 1024 * 1024) throw fault('SHEETBEST_MANIFEST_INVALID');
  const manifestBytes = await readFile(manifestFile);
  const manifest = JSON.parse(manifestBytes);
  const required = ['model.mjs', 'server.mjs', 'cli.mjs', 'launch.mjs', 'packet.mjs',
    'projection.mjs', 'provider.mjs', 'deployment.mjs', 'browser.mjs', 'index.html',
    'style.css', 'mcp.mjs', 'catalog.mjs', 'application.mjs', 'application-provider.mjs', 'merchant-provider.mjs'];
  const files = new Map((manifest.files ?? []).map(row => [row.path, row]));
  for (const name of required) {
    const file = files.get(AUTHORING_PATH + '/' + name);
    if (!file || !/^[a-f0-9]{64}$/.test(file.sha256 ?? ''))
      throw fault('SHEETBEST_INSTALLED_SOURCE_MISSING', 'The selected runtime must include the complete Sheet Best authoring product.');
  }
  return { runtimeDirectory, sourceRoot: runtime.sourceRoot, sourceCommit: runtime.sourceCommit,
    manifestFile, manifestSha256: digest(manifestBytes),
    entrypoint: join(runtime.sourceRoot, 'stellar/scf-starforge-20261009/distribution/cli.mjs'),
    authoringDirectory: join(runtime.sourceRoot, AUTHORING_PATH), files: required.map(name => files.get(AUTHORING_PATH + '/' + name)) };
}

export async function productState(directory, { verify = true } = {}) {
  absolute(directory); await privateDirectory(directory);
  const state = await readJson(join(directory, 'product.json'), 1024 * 1024);
  if (state.schema !== PRODUCT_SCHEMA || state.directory !== directory ||
      state.workspaceDirectory !== join(directory, 'workspace')) throw fault('SHEETBEST_PRODUCT_CHANGED');
  if (verify) {
    const selected = await installedSource(state.installation.runtimeDirectory);
    if (selected.sourceRoot !== state.installation.sourceRoot ||
        selected.manifestSha256 !== state.installation.manifestSha256)
      throw fault('SHEETBEST_PRODUCT_RUNTIME_CHANGED', 'Keep this product on its selected runtime; prepare a reviewed runtime upgrade separately.');
  }
  return state;
}

export async function prepareProduct({ runtimeDirectory, directory, title = 'Sheet Best merchant' }) {
  absolute(directory);
  if (typeof title !== 'string' || !title.trim() || title.length > 160) throw fault('PRODUCT_TITLE_REQUIRED');
  const installation = await installedSource(runtimeDirectory);
  await privateDirectory(directory, true);
  const release = await acquireWorkspace(directory);
  let workspace;
  try {
    const input = { schema: PRODUCT_SCHEMA, directory, title: title.trim(), runtimeDirectory,
      sourceRoot: installation.sourceRoot, manifestSha256: installation.manifestSha256 };
    const intentFile = join(directory, 'PREPARATION.json');
    if (await exists(intentFile)) {
      const saved = await readJson(intentFile);
      if (identity(saved.input) !== identity(input)) throw fault('SHEETBEST_PRODUCT_PREPARATION_CHANGED');
    } else {
      // Never take over an unrelated existing product or source database.
      if (await exists(join(directory, 'workspace')) || await exists(join(directory, 'product.json')))
        throw fault('SHEETBEST_PRODUCT_PREPARATION_MISSING');
      await createOrVerify(intentFile, bytes({ input, requestId: randomUUID(), createdAt: new Date().toISOString() }));
    }
    const workspaceDirectory = join(directory, 'workspace');
    const native = await import(pathToFileURL(join(installation.authoringDirectory, 'model.mjs')).href);
    const create = !await exists(join(workspaceDirectory, 'sources.sqlite')) ||
      !await exists(join(directory, 'product.json'));
    // The original INIT receipt owns initialization/reopening after an interrupted prepare.
    workspace = await native.openSheetBestAuthoring({ directory: workspaceDirectory, create });
    const status = await workspace.status();
    await workspace.close(); workspace = null;
    const state = { schema: PRODUCT_SCHEMA, directory, title: input.title, workspaceDirectory, installation,
      connectionsFile: join(directory, 'sheetbest-workspaces.json'),
      merchantOverlayFile: join(directory, 'merchant-overlay.json'),
      applicationSettingsFile: join(directory, 'application-settings.json'),
      sourceCLI: join(installation.authoringDirectory, 'cli.mjs') };
    await createOrVerify(state.connectionsFile, bytes({
      schema: 'stellar-forge.sheetbest-authoring-connection.v1',
      workspaces: { merchant: { label: input.title, directory: workspaceDirectory } },
    }));
    await createOrVerify(state.merchantOverlayFile, bytes({ sheetbestWorkspaceConnection: state.connectionsFile }));
    await createOrVerify(state.applicationSettingsFile, bytes({ workspaceDirectory }));
    const bridge = await import(pathToFileURL(join(installation.authoringDirectory, 'mcp.mjs')).href);
    const binding = await bridge.readSheetBestWorkspaceConfiguration(state.connectionsFile);
    if (binding.workspaces.merchant.directory !== workspaceDirectory) throw fault('SHEETBEST_PRODUCT_BINDING_CHANGED');
    await createOrVerify(join(directory, 'product.json'), bytes(state), 1024 * 1024);
    await atomicJson(directory, 'PREPARED.json', { schema: PRODUCT_SCHEMA, completedAt: new Date().toISOString(),
      manifestSha256: installation.manifestSha256, workspaceIdentity: binding.workspaces.merchant.identity,
      workspaceDirectory, providerRead: false, selectedVersion: status.selectedVersion });
    return state;
  } finally { try { await workspace?.close(); } finally { await release(); } }
}

export async function openProduct(directory, { port = 8471 } = {}) {
  const state = await productState(directory);
  const native = await import(pathToFileURL(join(state.installation.authoringDirectory, 'model.mjs')).href);
  const server = await import(pathToFileURL(join(state.installation.authoringDirectory, 'server.mjs')).href);
  const workspace = await native.openSheetBestAuthoring({ directory: state.workspaceDirectory });
  try { return { state, service: await server.serveSheetBestAuthoring({ workspace, port }) }; }
  catch (error) { await workspace.close(); throw error; }
}

export function options(argv, allowed, repeat = []) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!allowed.includes(name) || Object.hasOwn(values, name) && !repeat.includes(name) ||
        !argv[i + 1] || argv[i + 1].startsWith('--')) throw fault('PRODUCT_OPTION_INVALID', 'Invalid option: ' + name);
    const value = argv[++i];
    if (repeat.includes(name)) (values[name] ??= []).push(value); else values[name] = value;
  }
  return values;
}
const HELP = 'Sheet Best installed product\n' +
  'prepare --runtime READY_RUNTIME --directory PRIVATE_PRODUCT --title TITLE\n' +
  'open --directory SAME_PRIVATE_PRODUCT [--port 8471]\n' +
  'status --directory SAME_PRIVATE_PRODUCT\n' +
  'Preparation creates the original empty source workspace and private Applications/MCP bindings. It performs no provider read or publication.\n';

export async function main(argv = process.argv.slice(2)) {
  if (!argv.length || argv[0] === '--help') { console.log(HELP); return 0; }
  const [command, ...rest] = argv;
  const allowed = command === 'prepare' ? ['--runtime', '--directory', '--title'] :
    command === 'open' ? ['--directory', '--port'] : command === 'status' ? ['--directory'] : [];
  if (!allowed.length) throw fault('PRODUCT_COMMAND_REQUIRED', HELP);
  const selected = options(rest, allowed), directory = absolute(selected['--directory']);
  if (command === 'prepare') {
    console.log(JSON.stringify(await prepareProduct({ runtimeDirectory: absolute(selected['--runtime']),
      directory, title: selected['--title'] }), null, 2)); return 0;
  }
  if (command === 'status') {
    const state = await productState(directory);
    const launch = await import(pathToFileURL(join(state.installation.authoringDirectory, 'launch.mjs')).href);
    console.log(JSON.stringify({ ...state, workspace: await launch.inspectSheetBestAuthoring(state.workspaceDirectory) }, null, 2));
    return 0;
  }
  const port = Number(selected['--port'] ?? 8471);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw fault('PRODUCT_PORT_INVALID');
  const { state, service } = await openProduct(directory, { port });
  console.log(JSON.stringify({ schema: PRODUCT_SCHEMA, url: service.url, directory, workspaceDirectory: state.workspaceDirectory }));
  let resolveDone; const done = new Promise(resolve => { resolveDone = resolve; });
  const close = () => resolveDone();
  process.once('SIGTERM', close); process.once('SIGINT', close);
  try { await done; } finally {
    process.removeListener('SIGTERM', close); process.removeListener('SIGINT', close); await service.close();
  }
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ error: error.code ?? 'SHEETBEST_PRODUCT_ERROR', message: error.message }));
    process.exitCode = 1;
  });
