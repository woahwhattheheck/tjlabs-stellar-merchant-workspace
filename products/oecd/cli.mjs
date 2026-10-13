#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/** Complete OECD economic editions through the original installed source engines. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { runOecdCli } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd/cli.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const originalPrefix = 'stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd';
const originalCommands = new Set(['init', 'status', 'seed', 'capture', 'refresh', 'preview',
  'save', 'briefing', 'compare', 'activate', 'export-dataset', 'export-customer',
  'export-project', 'import', 'serve', 'mcp']);
export const help = [
  'OECD leading-indicator analyst and customer workspace',
  '',
  '  starforge oecd-product create --project DIR [--runtime READY_DIR] [--operation ID] [--title TEXT] [--python PYTHON]',
  '  starforge oecd-product workspace --project DIR [--create] [--python PYTHON]',
  '  starforge oecd-product inspect --runtime READY_DIR',
  '  starforge oecd-product receive --runtime READY_DIR --project DIR --config FILE [--python PYTHON]',
  '',
  'create runs the complete original source-only operation: retain fifteen OECD responses,',
  'save the first briefing and a revised edition, export the native dataset/project,',
  'and reopen that revised project in a separate customer workspace with exact reports.',
  'receive runs the complete original merchant/buyer operation with its supplied native',
  'payment, signer, buyer and spending configuration and the same retained project.',
  'Repeat either operation with its original project, operation/configuration and runtime.',
  '',
  'workspace opens the same original operator. All original commands remain available:',
  '  init status seed capture refresh preview save briefing compare activate',
  '  export-dataset export-customer export-project import serve mcp',
  'Use their unchanged --project/--request/--id/--manifest/--packet options.',
  'Python defaults to SF30_OECD_PYTHON or python3. The native Node engine uses this Node.',
  '',
  'Installed selection: oecd. Full source, operating and receiving guides: products/oecd/.'
].join('\n');

function error(message, code = 'OECD_PRODUCT') {
  return Object.assign(new TypeError(message), { code });
}
function options(args, allowed) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!allowed.includes(key) || Object.hasOwn(result, key) ||
        typeof value !== 'string' || !value || value.startsWith('--') || value.includes('\0'))
      throw error('Unknown, repeated or incomplete product option: ' + key);
    result[key] = value;
  }
  return result;
}
function selectedPath(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\0'))
    throw error(label + ' requires the selected native path.');
  return resolve(value);
}
function child(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const worker = spawn(command, args, { stdio: 'inherit', windowsHide: true, ...options });
    let failure;
    const send = signal => {
      if (worker.exitCode === null && worker.signalCode === null) worker.kill(signal);
    };
    const interrupt = () => send('SIGINT'), terminate = () => send('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    worker.once('error', caught => { failure = caught; });
    worker.once('close', (code, signal) => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
      if (failure) { reject(failure); return; }
      if (signal) {
        const stopped = error('The original OECD operation ended with ' + signal +
          '. Continue the same saved project and operation.', 'OECD_PRODUCT_INTERRUPTED');
        stopped.exitCode = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
        reject(stopped); return;
      }
      resolveResult(Number.isInteger(code) ? code : 1);
    });
  });
}

/** Inspect the unchanged native runtime and the exact selected package manifest. */
export async function inspectOecdProduct(runtime) {
  const inspected = await inspectMerchantRuntime(selectedPath(runtime, '--runtime'),
    { load: false, source: true });
  if (inspected.state !== 'READY') throw error('Use the original READY installation.');
  const bytes = await readFile(join(inspected.directory, 'package/manifest.json'));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== inspected.sourceManifestSha256)
    throw error('The original package manifest changed during runtime inspection.');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.sourceSelection?.id !== 'oecd')
    throw error('Install the complete OECD source selection with --selection oecd.');
  if (typeof inspected.entrypoint !== 'string' || !isAbsolute(inspected.entrypoint))
    throw error('The native runtime did not retain its original installed entrypoint.');
  return inspected;
}
function privateProject(project, runtime) {
  const directory = selectedPath(project, '--project');
  if (runtime && (directory === runtime.directory ||
      directory.startsWith(runtime.directory + sep)))
    throw error('Keep the saved OECD project outside its immutable installed runtime.');
  return directory;
}

/** Execute the original complete two-edition analyst/customer source programme. */
export async function createOecdProduct({ project, runtime, operation, title,
    python = process.env.SF30_OECD_PYTHON || 'python3' } = {}) {
  const installed = runtime === undefined ? null : await inspectOecdProduct(runtime);
  const directory = privateProject(project, installed);
  const root = installed?.sourceRoot || sourceRoot;
  const helper = join(root, originalPrefix, 'examples/create-briefing.mjs');
  const args = [helper, '--project', directory, '--python', python];
  if (operation !== undefined) {
    if (typeof operation !== 'string' || !operation || operation.includes('\0'))
      throw error('Retain the original briefing operation ID.');
    args.push('--operation', operation);
  }
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim() || title.includes('\0'))
      throw error('Use a nonempty briefing title.');
    args.push('--title', title);
  }
  return child(process.execPath, args, { env: { ...process.env, SF30_XML_NODE: process.execPath } });
}

/** Use the installed entrypoint for the unchanged configured native buyer run. */
export async function receiveOecdProduct({ runtime, project, config,
    python = process.env.SF30_OECD_PYTHON || 'python3' } = {}) {
  const installed = await inspectOecdProduct(runtime);
  const directory = privateProject(project, installed);
  const configuration = selectedPath(config, '--config');
  return child(process.execPath, [installed.entrypoint, 'oecd', 'receive',
    '--project', directory, '--config', configuration, '--python', python],
  { env: { ...process.env, SF30_XML_NODE: process.execPath } });
}

export async function main(argv = process.argv.slice(2)) {
  const args = [...argv], command = args.shift();
  if (!command || ['help', '--help', '-h'].includes(command) || args.includes('--help')) {
    process.stdout.write(help + '\n'); return 0;
  }
  if (command === 'workspace') return runOecdCli(['serve', ...args]);
  if (originalCommands.has(command)) return runOecdCli([command, ...args]);
  if (command === 'inspect') {
    const values = options(args, ['--runtime']);
    process.stdout.write(JSON.stringify(await inspectOecdProduct(values['--runtime']), null, 2) + '\n');
    return 0;
  }
  if (command === 'create') {
    const values = options(args, ['--project', '--runtime', '--operation', '--title', '--python']);
    return createOecdProduct({ project: values['--project'], runtime: values['--runtime'],
      operation: values['--operation'], title: values['--title'], python: values['--python'] });
  }
  if (command === 'receive') {
    const values = options(args, ['--runtime', '--project', '--config', '--python']);
    return receiveOecdProduct({ runtime: values['--runtime'], project: values['--project'],
      config: values['--config'], python: values['--python'] });
  }
  throw error('Choose a complete product or original workspace command; use --help.');
}

if (process.argv[1] && await realpath(resolve(process.argv[1])).then(
  path => pathToFileURL(path).href === import.meta.url, () => false)) {
  main().then(code => { if (Number.isInteger(code)) process.exitCode = code; })
    .catch(caught => {
      process.stderr.write(JSON.stringify({ error: { code: caught.code || 'OECD_PRODUCT',
        message: caught.message } }) + '\n');
      process.exitCode = caught.exitCode || 1;
    });
}
