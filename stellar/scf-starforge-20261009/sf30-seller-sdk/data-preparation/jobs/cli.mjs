#!/usr/bin/env node
// MIT. Whole original pipeline commissioning, merchant configuration and editable receiving.
import { readFile, lstat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePipelineJobConfiguration } from './configuration.mjs';
import { preparePipelineJob, receivePipelineJob, reopenPipelineJob } from './customer.mjs';

const help = [
  'Saved SQL pipeline jobs', '',
  'pipeline-jobs configure --directory DIR --origin HTTPS_ORIGIN --payment PAYMENT.json --python ABSOLUTE_PYTHON',
  '  [--timeout-ms N] [--input-storage-bytes N]',
  'pipeline-jobs service --directory DIR -- serve --state STATE_DIR [original jobs serve options]',
  'pipeline-jobs service --directory DIR -- work --state STATE_DIR [--once]',
  'pipeline-jobs prepare --project PROJECT.zip --sha256 SHA256 --directory PREPARED_DIR',
  '  --pipeline ID --revision N --report NAME [--inputs BINDINGS.json] [--reuse-execution ID] [--python ABSOLUTE_PYTHON]',
  'pipeline-jobs receive --source RESULT.zip --expected EXPECTED.json --package-directory PACKAGE_DIR',
  '  --directory EDITABLE_DIR [--job EXPECTED_JOB.json] [--python ABSOLUTE_PYTHON]',
  'pipeline-jobs reopen --package-directory PACKAGE_DIR --directory EDITABLE_DIR',
  '  [--expected EXPECTED.json] [--job EXPECTED_JOB.json] [--python ABSOLUTE_PYTHON]', '',
  'Preparation freezes the saved edition, complete source files and review before checkout.',
  'The existing Request workspace seals project.zip and selection.json and retains the approved input.',
  'The original Jobs and Buyer own purchase, execution, settlement and complete package download.',
  'Receive verifies the original result package and opens its whole editable project.',
  'Reopen checks the retained delivery offline and preserves later local pipeline editions.',
  'See products/data-preparation/COMMISSIONING.md for the complete installed customer flow.',
].join('\n');

const flags = {
  configure: ['--directory', '--origin', '--payment', '--python', '--timeout-ms', '--input-storage-bytes'],
  prepare: ['--project', '--sha256', '--directory', '--pipeline', '--revision', '--report', '--inputs', '--reuse-execution', '--python'],
  receive: ['--source', '--expected', '--package-directory', '--directory', '--job', '--python'],
  reopen: ['--package-directory', '--directory', '--expected', '--job', '--python'],
};
function options(argv, allowed) {
  const out = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!allowed.includes(key) || out.has(key) || !value || value.startsWith('--'))
      throw new TypeError('Supply one value per declared option: ' + key);
    out.set(key, value);
  }
  return out;
}
function required(out, key) {
  if (!out.has(key)) throw new TypeError('Supply ' + key);
  return out.get(key);
}
function positive(value, key) {
  if (!/^[1-9][0-9]*$/.test(value ?? '') || !Number.isSafeInteger(Number(value)))
    throw new TypeError(key + ' requires a positive safe integer');
  return Number(value);
}
async function json(path, maximum = 1048576) {
  const absolute = resolve(path), info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum)
    throw new TypeError('Select a complete regular JSON file within its allowance');
  const body = await readFile(absolute);
  if (body.length > maximum) throw new TypeError('The JSON file exceeds its allowance');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Select a complete JSON object');
  return value;
}
async function service(argv, print) {
  const separator = argv.indexOf('--');
  if (separator < 0) throw new TypeError('Use service --directory DIR -- serve|work [original options]');
  const own = options(argv.slice(0, separator), ['--directory']);
  const original = argv.slice(separator + 1);
  if (!['serve', 'work'].includes(original[0]) || original.includes('--config'))
    throw new TypeError('Select original serve or work; the configured directory supplies --config');
  const directory = resolve(required(own, '--directory'));
  const runtime = await json(join(directory, 'runtime.json'), 65536);
  const python = runtime.environment?.SF30_PREPARATION_PYTHON;
  if (runtime.schema !== 'stellar-forge.preparation-pipeline-job-runtime.v1' ||
      runtime.configuration !== 'merchant.json' || typeof python !== 'string' || !isAbsolute(python))
    throw new TypeError('Use the original configured pipeline merchant directory');
  const { runJobCommand } = await import('../../jobs/cli.mjs');
  const previous = process.env.SF30_PREPARATION_PYTHON;
  process.env.SF30_PREPARATION_PYTHON = python;
  try { return await runJobCommand([original[0], '--config', join(directory, 'merchant.json'), ...original.slice(1)], { print }); }
  finally {
    if (previous === undefined) delete process.env.SF30_PREPARATION_PYTHON;
    else process.env.SF30_PREPARATION_PYTHON = previous;
  }
}
export async function runPipelineJobCommand(argv = process.argv.slice(2),
  { print = value => process.stdout.write((typeof value === 'string' ? value : JSON.stringify(value)) + '\n') } = {}) {
  if (!argv.length || ['help', '--help', '-h'].includes(argv[0])) { print(help); return; }
  if (argv[0] === 'service') return service(argv.slice(1), print);
  if (!Object.hasOwn(flags, argv[0])) throw new TypeError('Choose a command from --help');
  const out = options(argv.slice(1), flags[argv[0]]);
  if (argv[0] === 'configure') {
    print(await writePipelineJobConfiguration({
      directory: resolve(required(out, '--directory')), publicOrigin: required(out, '--origin'),
      payment: await json(required(out, '--payment'), 65536), python: required(out, '--python'),
      ...(out.has('--timeout-ms') ? { timeoutMs: positive(out.get('--timeout-ms'), '--timeout-ms') } : {}),
      ...(out.has('--input-storage-bytes') ? { inputStorageBytes: positive(out.get('--input-storage-bytes'), '--input-storage-bytes') } : {}),
    }));
    return;
  }
  const controller = new AbortController(), stop = () => controller.abort(new Error('Pipeline customer operation interrupted'));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const common = { directory: resolve(required(out, '--directory')), signal: controller.signal,
      ...(out.has('--python') ? { python: out.get('--python') } : {}) };
    if (argv[0] === 'prepare') {
      print(await preparePipelineJob({ ...common, project: resolve(required(out, '--project')),
        sha256: required(out, '--sha256'), pipelineId: required(out, '--pipeline'),
        revision: positive(required(out, '--revision'), '--revision'), reportName: required(out, '--report'),
        ...(out.has('--inputs') ? { inputs: await json(out.get('--inputs')) } : {}),
        ...(out.has('--reuse-execution') ? { reuseExecution: out.get('--reuse-execution') } : {}),
      }));
    } else {
      const selected = { ...common, packageDirectory: resolve(required(out, '--package-directory')),
        ...(out.has('--expected') ? { expected: await json(out.get('--expected')) } : {}),
        ...(out.has('--job') ? { job: await json(out.get('--job')) } : {}),
      };
      if (argv[0] === 'receive') {
        required(out, '--expected');
        print(await receivePipelineJob({ ...selected, source: resolve(required(out, '--source')) }));
      } else print(await reopenPipelineJob(selected));
    }
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runPipelineJobCommand().catch(error => {
    process.stderr.write(JSON.stringify({ error: error.message, code: error.code }) + '\n'); process.exitCode = 1;
  });
