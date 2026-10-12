#!/usr/bin/env node
// MIT. Prepare and reopen the installed original grant-portfolio application.
import {join, resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {lstat, realpath, readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {inspectMerchantRuntime} from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import {readDistributionSpecification} from '../../stellar/scf-starforge-20261009/distribution/specification.mjs';
import {absolute, privateDirectory, makePrivate, regular, readJSON, saveJSON,
  canonical, digest, need, operationLease} from '../../stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';

export const PRODUCT_SCHEMA = 'stellar-forge.grant-portfolio-installed-product.v1';
export const SDK_PATH = 'stellar/scf-starforge-20261009/sf30-seller-sdk';
export const AUTHORING_PATH = SDK_PATH + '/grant-portfolio';
const run = promisify(execFile);
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const environment = () => ({...process.env, PYTHONDONTWRITEBYTECODE:'1',
  SF30_XML_NODE:process.execPath, SF30_NDJSON_NODE:process.execPath,
  SF30_GRANT_PORTFOLIO_NODE:process.execPath});
export async function exists(path) {
  try {return await lstat(path);} catch (error) {if (error.code === 'ENOENT') return null; throw error;}
}
async function retain(path, value) {
  const previous = await readJSON(path, true);
  if (previous !== null) {
    need(same(previous, value), 'GRANT_PRODUCT_INPUT_CHANGED', 'The original product input changed: ' + path);
    return previous;
  }
  await saveJSON(path, value); return value;
}
export async function productDirectory(directory) {
  absolute(directory);
  if (!await exists(directory)) await makePrivate(directory);
  return privateDirectory(directory);
}

/** The maintained READY/profile/lock/source verifier owns runtime inspection. */
export async function installedSource(runtimeDirectory) {
  absolute(runtimeDirectory);
  need(await realpath(runtimeDirectory) === runtimeDirectory, 'GRANT_PRODUCT_RUNTIME_PATH_CHANGED');
  const runtime = await inspectMerchantRuntime(runtimeDirectory, {load:false});
  const manifestFile = join(runtimeDirectory, 'package', 'manifest.json');
  const manifestBytes = await regular(manifestFile);
  const manifest = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(manifestBytes));
  const declaration = await readJSON(join(runtime.sourceRoot, AUTHORING_PATH, 'source-files.json'));
  need(declaration.schema === 'stellar-forge.grant-portfolio-source-files.v1' &&
    Array.isArray(declaration.files) && declaration.files.length > 0 &&
    same(declaration.files, [...new Set(declaration.files)].sort()) &&
    declaration.files.every(name => typeof name === 'string' && !/[\x00-\x20\\]/.test(name) &&
      name.split('/').every(part => part && part !== '.' && part !== '..')),
  'GRANT_PRODUCT_SOURCE_DECLARATION_INVALID');
  const inventory = new Map((manifest.files ?? []).map(file => [file.path, file]));
  need(inventory.size === manifest.files?.length, 'GRANT_PRODUCT_SOURCE_INVENTORY_INVALID');
  const files = [];
  for (const relative of declaration.files) {
    const path = SDK_PATH + '/' + relative, declared = inventory.get(path);
    need(declared && /^[a-f0-9]{64}$/.test(declared.sha256 ?? ''),
      'GRANT_PRODUCT_SOURCE_INCOMPLETE', 'The installed native source is missing: ' + path);
    const bytes = await regular(join(runtime.sourceRoot, path));
    need(bytes.length === declared.bytes && digest(bytes) === declared.sha256,
      'GRANT_PRODUCT_SOURCE_CHANGED', 'The selected native source changed: ' + path);
    files.push({path, bytes:declared.bytes, sha256:declared.sha256});
  }
  const {spec} = await readDistributionSpecification({sourceRoot:runtime.sourceRoot});
  need(spec.commands['grant-portfolio'] === AUTHORING_PATH + '/cli.mjs' &&
    spec.commands['grant-portfolio-receive'] === AUTHORING_PATH + '/merchant-receiving.mjs' &&
    spec.applicationProviders?.['grant-portfolio'] === AUTHORING_PATH + '/application-provider.mjs' &&
    spec.merchantProviders?.['grant-portfolios'] === AUTHORING_PATH + '/merchant-provider.mjs',
  'GRANT_PRODUCT_REGISTRATION_INCOMPLETE');
  return {runtimeDirectory, sourceRoot:runtime.sourceRoot, sourceCommit:runtime.sourceCommit,
    manifestFile, manifestSha256:digest(manifestBytes),
    installationId:runtime.installationId, profileId:runtime.profileId,
    profileSha256:runtime.profileSha256, lockSha256:runtime.lockSha256,
    authoringDirectory:join(runtime.sourceRoot, AUTHORING_PATH),
    entrypoint:join(runtime.sourceRoot, 'stellar/scf-starforge-20261009/distribution/cli.mjs'),
    sourceFiles:files};
}

export async function inspectPython(pythonExecutable) {
  absolute(pythonExecutable);
  const program = [
    'import importlib.metadata as m, json, os, sys',
    'assert sys.version_info >= (3, 11), "Python 3.11 or newer is required"',
    'import jsonschema, referencing',
    'versions = {name: m.version(name) for name in ("jsonschema", "referencing")}',
    'def version(name): return tuple(int(x) for x in versions[name].split(".")[:2])',
    'assert (4, 23) <= version("jsonschema") < (5, 0), "Use the native publisher jsonschema>=4.23,<5 environment"',
    'assert (0, 35) <= version("referencing") < (1, 0), "Use referencing>=0.35,<1"',
    'print(json.dumps({"executable":os.path.abspath(sys.executable),"prefix":sys.prefix,"basePrefix":sys.base_prefix,"version":list(sys.version_info[:3]),"packages":versions}))',
  ].join('\n');
  const result = await run(pythonExecutable, ['-c', program], {
    env:environment(), encoding:'utf8', maxBuffer:32768, timeout:15000});
  const selected = JSON.parse(result.stdout);
  need(await realpath(selected.executable) === await realpath(pythonExecutable),
    'GRANT_PRODUCT_PYTHON_CHANGED');
  return selected;
}
export async function nativeJSON(state, args) {
  const result = await run(state.pythonExecutable,
    [join(state.installation.authoringDirectory, 'cli.py'), '--workspace', state.workspaceDirectory, ...args],
    {env:environment(), encoding:'utf8', maxBuffer:4 * 1024 * 1024});
  return JSON.parse(result.stdout);
}
async function bindingFor(state) {
  const value = await nativeJSON(state, ['binding']);
  need(value.schema === 'stellar-forge.grant-portfolio-managed-binding.v1' &&
    value.workspace === state.workspaceDirectory &&
    value.sourceRoot === join(state.installation.sourceRoot, SDK_PATH),
  'GRANT_PRODUCT_WORKSPACE_CHANGED');
  const {sha256, sourceRoot, ...body} = value;
  need(digest(JSON.stringify(canonical(body)) + '\n') === sha256,
    'GRANT_PRODUCT_BINDING_CHANGED');
  for (const file of state.installation.sourceFiles)
    need(value.source[file.path.slice(SDK_PATH.length + 1)] === file.sha256,
      'GRANT_PRODUCT_SOURCE_CHANGED');
  return value;
}

/** Retain one preparation; reopening keeps operator-edited packet handles and original source data. */
export async function prepareProduct({runtimeDirectory, directory, pythonExecutable,
  workspaceDirectory, title = 'Grant portfolio reconciliation'} = {}) {
  absolute(directory); absolute(runtimeDirectory); absolute(pythonExecutable);
  need(typeof title === 'string' && title.trim().length > 0 && title.trim().length <= 160 &&
    !/[\x00-\x1f\x7f]/.test(title), 'GRANT_PRODUCT_TITLE_REQUIRED');
  const installation = await installedSource(runtimeDirectory);
  const python = await inspectPython(pythonExecutable);
  workspaceDirectory = absolute(workspaceDirectory ?? join(directory, 'workspace'));
  await productDirectory(directory);
  const lease = await operationLease(join(directory, '.preparation.lock'));
  try {
    const input = {schema:PRODUCT_SCHEMA, directory, runtimeDirectory, workspaceDirectory,
      pythonExecutable, python, title:title.trim(), sourceCommit:installation.sourceCommit,
      installationId:installation.installationId, manifestSha256:installation.manifestSha256,
      profileSha256:installation.profileSha256, lockSha256:installation.lockSha256};
    const original = await readJSON(join(directory, 'PREPARATION.json'), true);
    if (original) need(same(original.input, input), 'GRANT_PRODUCT_PREPARATION_CHANGED');
    else {
      const members = (await readdir(directory)).filter(name => name !== '.preparation.lock');
      need(members.length === 0, 'GRANT_PRODUCT_DIRECTORY_IN_USE',
        'Choose a new private product directory; select an existing native workspace with --workspace.');
      await saveJSON(join(directory, 'PREPARATION.json'), {input, requestId:randomUUID(),
        createdAt:new Date().toISOString()});
    }
    const previous = await readJSON(join(directory, 'product.json'), true);
    if (previous) return productState(directory);
    const state = {schema:PRODUCT_SCHEMA, directory, title:input.title, workspaceDirectory,
      pythonExecutable, python, installation, connectionFile:join(directory, 'console.json'),
      connectionsFile:join(directory, 'grant-portfolios.json'),
      merchantOptionsFile:join(directory, 'merchant-options.json'),
      merchantOverlayFile:join(directory, 'merchant-overlay.json'),
      applicationSettingsFile:join(directory, 'application-settings.json'),
      merchantDirectory:join(directory, 'merchant')};
    if (!await exists(workspaceDirectory)) await nativeJSON(state, ['init']);
    // The original state command completes a marker-backed interrupted initialization.
    else if (!await exists(join(workspaceDirectory, 'workspace.sqlite')))
      await nativeJSON(state, ['state']);
    const binding = await bindingFor(state);
    state.workspaceId = binding.workspaceId; state.bindingSha256 = binding.sha256;
    state.workspaceIdentity = binding.workspaceIdentity;
    await retain(state.connectionsFile, {schema:'stellar-forge.grant-portfolio-connection.v1',
      workspaces:{portfolio:{label:state.title, workspaceId:state.workspaceId,
        consoleUrlFile:state.connectionFile, files:{}}}});
    await retain(state.merchantOptionsFile, {directory:state.merchantDirectory,
      connection:state.connectionsFile, name:state.title});
    await retain(state.merchantOverlayFile, {grantPortfolioConnection:state.connectionsFile});
    await retain(state.applicationSettingsFile, {workspaceDirectory, pythonExecutable,
      connectionFile:state.connectionFile, port:0});
    await retain(join(directory, 'PREPARED.json'), {schema:PRODUCT_SCHEMA,
      preparationId:(await readJSON(join(directory, 'PREPARATION.json'))).requestId,
      workspaceId:state.workspaceId, bindingSha256:state.bindingSha256,
      manifestSha256:installation.manifestSha256, sourceCommit:installation.sourceCommit});
    await retain(join(directory, 'product.json'), state);
    return productState(directory);
  } finally {await lease.close();}
}

export async function productState(directory) {
  absolute(directory); await privateDirectory(directory);
  const state = await readJSON(join(directory, 'product.json'));
  need(state.schema === PRODUCT_SCHEMA && state.directory === directory &&
    state.connectionFile === join(directory, 'console.json') &&
    state.connectionsFile === join(directory, 'grant-portfolios.json') &&
    state.applicationSettingsFile === join(directory, 'application-settings.json') &&
    state.merchantOptionsFile === join(directory, 'merchant-options.json') &&
    state.merchantOverlayFile === join(directory, 'merchant-overlay.json') &&
    state.merchantDirectory === join(directory, 'merchant'),
  'GRANT_PRODUCT_STATE_CHANGED');
  const installation = await installedSource(state.installation.runtimeDirectory);
  need(same(installation, state.installation), 'GRANT_PRODUCT_RUNTIME_CHANGED',
    'This product retains its selected runtime. Review an upgrade with the original Runtime workspace.');
  need(same(await inspectPython(state.pythonExecutable), state.python), 'GRANT_PRODUCT_PYTHON_CHANGED');
  const binding = await bindingFor(state);
  need(binding.workspaceId === state.workspaceId && binding.sha256 === state.bindingSha256 &&
    same(binding.workspaceIdentity, state.workspaceIdentity), 'GRANT_PRODUCT_WORKSPACE_CHANGED');
  const merchant = await import(pathToFileURL(join(installation.authoringDirectory, 'merchant.mjs')).href);
  const configured = await merchant.readGrantPortfolioConfiguration(state.connectionsFile);
  need(Object.keys(configured.workspaces).length === 1 &&
    configured.workspaces.portfolio?.workspaceId === state.workspaceId &&
    configured.workspaces.portfolio.consoleUrlFile === state.connectionFile,
  'GRANT_PRODUCT_MERCHANT_BINDING_CHANGED');
  return state;
}
export async function statusProduct(directory) {
  const product = await productState(directory);
  let client;
  try {
    if (await exists(product.connectionFile)) {
      const original = await nativeJSON(product, ['connection','--file',product.connectionFile]);
      need(original.workspaceId === product.workspaceId && original.bindingSha256 === product.bindingSha256,
        'GRANT_PRODUCT_ACTIVE_WORKSPACE_CHANGED');
      if (!original.writerActive)
        return {product, console:'RECOVERABLE', connection:original,
          workspace:await nativeJSON(product, ['state'])};
      const native = await import(pathToFileURL(join(product.installation.authoringDirectory, 'client.mjs')).href);
      client = await native.connectGrantPortfolio({consoleUrlFile:product.connectionFile});
      const launch = await client.launch();
      need(launch.workspaceId === product.workspaceId && launch.bindingSha256 === product.bindingSha256,
        'GRANT_PRODUCT_ACTIVE_WORKSPACE_CHANGED');
      return {product, console:'RUNNING', workspace:await client.state()};
    }
    return {product, console:'CLOSED', workspace:await nativeJSON(product, ['state'])};
  } finally {await client?.dispose();}
}
export async function runNative(directory, args) {
  const product = await productState(directory);
  need(Array.isArray(args) && args.length > 0 &&
    ['state','binding','connection','upload','source','portfolio','rows','detail','action','request','resume','export'].includes(args[0]) &&
    !args.includes('--workspace') && !args.includes('--python'),
  'GRANT_PRODUCT_NATIVE_COMMAND_INVALID', 'Use a declared original command on this saved workspace.');
  const native = await import(pathToFileURL(join(product.installation.authoringDirectory, 'cli.mjs')).href);
  return native.main(['--python',product.pythonExecutable,'--workspace',product.workspaceDirectory,...args]);
}
export async function openProduct(directory, {port = 0} = {}) {
  const product = await productState(directory);
  need(Number.isInteger(port) && port >= 0 && port <= 65535, 'GRANT_PRODUCT_PORT_INVALID');
  const native = await import(pathToFileURL(join(product.installation.authoringDirectory, 'cli.mjs')).href);
  return native.main(['--python',product.pythonExecutable,'--workspace',product.workspaceDirectory,
    'serve','--port',String(port),'--expected-binding',product.bindingSha256,
    '--connection-file',product.connectionFile]);
}
export function options(args, allowed) {
  const value = {};
  need(args.length % 2 === 0, 'GRANT_PRODUCT_ARGUMENTS_INVALID');
  for (let i = 0; i < args.length; i += 2) {
    need(allowed.includes(args[i]) && !Object.hasOwn(value,args[i]) &&
      typeof args[i + 1] === 'string' && args[i + 1].length > 0 && !args[i + 1].startsWith('--'),
    'GRANT_PRODUCT_ARGUMENTS_INVALID', 'Unexpected or duplicate product option: ' + args[i]);
    value[args[i]] = args[i + 1];
  }
  return value;
}
const HELP = 'Grant portfolio installed product\n' +
  'prepare --runtime READY_RUNTIME --directory PRIVATE_PRODUCT --python ABSOLUTE_PYTHON [--workspace EXISTING_NATIVE_WORKSPACE] [--title TITLE]\n' +
  'open --directory SAME_PRIVATE_PRODUCT [--port 0]\n' +
  'status --directory SAME_PRIVATE_PRODUCT\n' +
  'native --directory SAME_PRIVATE_PRODUCT -- ORIGINAL_COMMAND_AND_ARGUMENTS\n';
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && args[0] === '--help') {console.log(HELP); return 0;}
  const [command, ...rest] = args;
  if (command === 'native') {
    const separator = rest.indexOf('--');
    need(separator >= 0, 'GRANT_PRODUCT_NATIVE_COMMAND_REQUIRED', HELP);
    const selected = options(rest.slice(0,separator), ['--directory']);
    return runNative(absolute(selected['--directory']), rest.slice(separator + 1));
  }
  const allowed = command === 'prepare' ? ['--runtime','--directory','--python','--workspace','--title'] :
    command === 'open' ? ['--directory','--port'] : command === 'status' ? ['--directory'] : null;
  need(allowed, 'GRANT_PRODUCT_COMMAND_REQUIRED', HELP);
  const selected = options(rest, allowed), directory = absolute(selected['--directory']);
  if (command === 'prepare') {
    const result = await prepareProduct({runtimeDirectory:absolute(selected['--runtime']),directory,
      pythonExecutable:absolute(selected['--python']), workspaceDirectory:selected['--workspace'],
      title:selected['--title']});
    console.log(JSON.stringify(result,null,2)); return 0;
  }
  if (command === 'status') {console.log(JSON.stringify(await statusProduct(directory),null,2)); return 0;}
  need(selected['--port'] === undefined || /^(0|[1-9][0-9]{0,4})$/.test(selected['--port']),
    'GRANT_PRODUCT_PORT_INVALID');
  return openProduct(directory,{port:Number(selected['--port'] ?? 0)});
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().then(code => {process.exitCode = code;}).catch(error => {
    console.error(JSON.stringify({error:error.code ?? 'GRANT_PRODUCT_ERROR',message:error.message}));
    process.exitCode = 1;
  });
