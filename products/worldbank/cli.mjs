#!/usr/bin/env node
// MIT. Compose the original World Bank, installed Applications and Analysis engines.
import { spawn } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectMerchantRuntime } from '../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs';
import { main as worldbank } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/worldbank/cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, '../..');
const pythonPackage = join(sourceRoot, 'stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python');
const worldbankCore = join(sourceRoot, 'stellar/scf-starforge-20261009/sf30-seller-sdk/worldbank/core.py');
const help = [
  'World Bank economic workspace',
  '',
  '  starforge worldbank-product workspace --directory DIR [--port 0] [--python python3]',
  '  starforge worldbank-product status --directory DIR',
  '  starforge worldbank-product action ACTION --directory DIR [--input FILE]',
  '  starforge worldbank-product analysis [--python PYTHON] prepare --handover ZIP --workspace DIR',
  '  starforge worldbank-product analysis [--python PYTHON] serve --workspace DIR [--port 0]',
  '  starforge worldbank-product analysis [--python PYTHON] receive --archive ZIP --sha256 SHA --workspace DIR --operation-id ID',
  '  starforge worldbank-product receive --runtime READY_DIR --workspace PRIVATE_DIR [--python PYTHON] [--python-dependencies DIR]',
  '',
  'workspace/status/action compose the original World Bank operator without changing its arguments.',
  'analysis composes the original SF88 Python engine; prepare selects the original World Bank core.',
  'receive uses the installed source manifest and retained 42-observation reference to complete',
  'managed Applications, merchant, resumed download, four reports, workbook and customer receiving.',
  'Repeat receive with the same runtime and private workspace to continue its original operation.',
  'Python 3.11+ and the original workbooks extra (openpyxl==3.1.5) are required for Analysis.',
  'See products/worldbank/OPERATING.md and RECEIVING.md for the complete operating workflow.'
].join('\n');

function fail(message) { return Object.assign(new TypeError(message), { code: 'WORLDBANK_PRODUCT' }); }
function pairs(args, allowed) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!allowed.includes(key) || Object.hasOwn(values, key) || typeof value !== 'string' || !value || value.startsWith('--'))
      throw fail('Unknown, repeated or incomplete option: ' + key);
    values[key] = value;
  }
  return values;
}
function child(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const worker = spawn(command, args, { stdio: 'inherit', ...options });
    let failure;
    const interrupt = () => { if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGINT'); };
    const terminate = () => { if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGTERM'); };
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    worker.once('error', error => { failure = error; });
    worker.once('close', (code, signal) => {
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
      if (failure) { reject(failure); return; }
      if (signal) {
        const error = fail('The original receiving process ended with ' + signal + '. Continue its same workspace.');
        error.exitCode = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
        reject(error); return;
      }
      resolveResult(Number.isInteger(code) ? code : 1);
    });
  });
}
export async function receiveWorldBankProduct({ runtime, workspace, python = process.env.PYTHON || 'python3', pythonDependencies } = {}) {
  if (!runtime || !workspace) throw fail('--runtime and --workspace are required.');
  const inspected = await inspectMerchantRuntime(resolve(runtime), { load: false, source: true });
  if (inspected.state !== 'READY') throw fail('Use the original READY installation.');
  const manifestFile = join(inspected.directory, 'package/manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (manifest.sourceSelection?.id !== 'worldbank')
    throw fail('Receive the World Bank source-selected package with --selection worldbank.');
  const helper = join(inspected.sourceRoot, 'products/worldbank/receiving.py');
  const argv = ['-B', helper, '--workspace', resolve(workspace)];
  if (pythonDependencies) argv.push('--python-dependencies', resolve(pythonDependencies));
  return child(python, argv, { env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1',
    STARFORGE_WORLDBANK_PRODUCT_RUNTIME: JSON.stringify({ ...inspected, node: process.execPath }) } });
}
export async function main(argv = process.argv.slice(2)) {
  const args = [...argv], command = args.shift();
  if (!command || ['--help', '-h', 'help'].includes(command)) { console.log(help); return 0; }
  if (['workspace', 'status', 'action'].includes(command)) return worldbank([command, ...args]);
  if (command === 'analysis') {
    let python = process.env.PYTHON || 'python3';
    if (args[0] === '--python') { args.shift(); python = args.shift(); if (!python || python.startsWith('--')) throw fail('--python requires an executable.'); }
    if (args[0] === 'prepare' && !args.includes('--worldbank-core')) args.push('--worldbank-core', worldbankCore);
    return child(python, ['-B', '-m', 'stellar_forge_buyer.worldbank_analysis', ...args], {
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: [pythonPackage, process.env.PYTHONPATH].filter(Boolean).join(process.platform === 'win32' ? ';' : ':') }
    });
  }
  if (command === 'receive') {
    const opts = pairs(args, ['--runtime', '--workspace', '--python', '--python-dependencies']);
    return receiveWorldBankProduct({ runtime: opts['--runtime'], workspace: opts['--workspace'], python: opts['--python'], pythonDependencies: opts['--python-dependencies'] });
  }
  throw fail('Choose workspace, status, action, analysis or receive; use --help.');
}
if (process.argv[1] && await realpath(resolve(process.argv[1])).then(path => pathToFileURL(path).href === import.meta.url, () => false))
  main().then(code => { if (Number.isInteger(code)) process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ error: { code: error.code || 'WORLDBANK_PRODUCT', message: error.message } }));
    process.exitCode = error.exitCode || 1;
  });
