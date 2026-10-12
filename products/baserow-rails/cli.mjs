#!/usr/bin/env node
// MIT. Complete Baserow/Rails product entry over its original source and customer owners.
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SDK = '../../stellar/scf-starforge-20261009/sf30-seller-sdk/';
const native = Object.freeze({
  source: SDK + 'baserow/cli.mjs',
  workspace: SDK + 'baserow/workspace/cli.mjs',
  publisher: SDK + 'baserow/publisher/cli.mjs',
  deployment: SDK + 'baserow/deployment-cli.mjs',
  customer: SDK + 'baserow/customer/cli.mjs',
});
const ruby = Object.freeze({
  receive: SDK + 'baserow/customer/customer.rb',
  dataset: SDK + 'developer/ruby-client/examples/native_dataset_customer.rb',
  commission: SDK + 'baserow/customer/lifecycle.rb',
  operator: SDK + 'developer/ruby-client/examples/rails_dataset/operator/install.rb',
  'dataset-source': SDK + 'developer/ruby-client/examples/rails_dataset/operator/source_cli.rb',
  'dataset-mapping-lifecycle': SDK + 'developer/ruby-client/examples/rails_dataset/operator/mapping_example.rb',
});
const customerRequire = SDK + 'baserow/customer/baserow_customer_receiving.rb';
const HELP = [
  'Baserow to Rails customer workspace',
  '',
  'starforge baserow-rails source COMMAND ...',
  'starforge baserow-rails workspace COMMAND --directory PRIVATE_WORKSPACE ...',
  'starforge baserow-rails publisher COMMAND ...',
  'starforge baserow-rails deployment COMMAND ...',
  'starforge baserow-rails customer COMMAND ...',
  'starforge baserow-rails client export|inspect|copy|resume ...',
  '',
  'Ruby commands select the actual existing interpreter before --:',
  'starforge baserow-rails receive --ruby /absolute/ruby -- COMMAND ...',
  'starforge baserow-rails dataset --ruby /absolute/ruby -- COMMAND ...',
  'starforge baserow-rails commission --ruby /absolute/ruby -- run|resume|reopen|status ...',
  'starforge baserow-rails operator --ruby /absolute/ruby -- --directory PRIVATE_APPLICATION ...',
  'starforge baserow-rails dataset-source --ruby /absolute/ruby -- COMMAND ...',
  'starforge baserow-rails dataset-mapping-lifecycle --ruby /absolute/ruby -- run|reopen ...',
  '',
  'source/workspace/publisher/deployment/customer use the original Node entrypoints.',
  'client exports or receives the complete Ruby, Rails and Baserow client package.',
  'receive runs the original complete Baserow customer receiving/file commands.',
  'dataset receives an existing finalized SF100 room into the original Ruby client.',
  'commission continues an original Baserow run through full independent application receiving.',
  'operator opens the original received Rails application on a loopback address.',
  'dataset-source receives all source rows, authors mappings and operates the original import.',
  'dataset-mapping-lifecycle continues the installed application through real forms and full receiving.',
  '',
  'Use --help immediately after a Node group for its complete command contract.',
  'For a Ruby command, select --ruby first and append --help after --.',
  'Keep the host Ruby/Bundler environment and the original private workspace.',
  'The original commands retain all request, preview, source and receiving records.',
  '',
  'Product guides: products/baserow-rails/{README,OPERATING,RECEIVING}.md',
  'Source selection: baserow-rails',
  '',
].join('\n');

function need(condition, code, message) {
  if (!condition) throw Object.assign(new Error(message ?? code), { code });
}
function local(relative) { return fileURLToPath(new URL(relative, import.meta.url)); }

async function runRuby(command, argv) {
  need(argv[0] === '--ruby' && typeof argv[1] === 'string' && argv[2] === '--',
    'BASEROW_RAILS_RUBY_REQUIRED', 'Select --ruby /absolute/ruby -- before the original Ruby arguments.');
  const executable = argv[1];
  need(isAbsolute(executable) && executable === resolve(executable) && !/[\0\r\n]/.test(executable),
    'BASEROW_RAILS_RUBY_PATH', 'Select the absolute existing Ruby executable.');
  const info = await stat(executable);
  need(info.isFile(), 'BASEROW_RAILS_RUBY_PATH');
  await access(executable, constants.X_OK);
  const entry = local(ruby[command]), args = argv.slice(3);
  await access(entry, constants.R_OK);
  // Retain the selected executable spelling. Resolving a language environment's
  // symlink can change its dependency lookup and its original receiving identity.
  const originalArgs = command === 'operator'
    ? ['-r', local(customerRequire), entry, ...args] : [entry, ...args];
  const grouped = process.platform !== 'win32';
  const child = spawn(executable, originalArgs, {
    cwd: process.cwd(), env: process.env, stdio: 'inherit', shell: false, detached: grouped,
  });
  let ended = false, cancellation = null, timer = null;
  const send = signal => {
    if (ended || !child.pid) return;
    try { if (grouped) process.kill(-child.pid, signal); else child.kill(signal); }
    catch (issue) { if (issue.code !== 'ESRCH') throw issue; }
  };
  const stop = signal => {
    if (cancellation) { send('SIGKILL'); return; }
    cancellation = signal;
    send(signal);
    timer = setTimeout(() => send('SIGKILL'), 15000);
    timer.unref();
  };
  const interrupted = () => stop('SIGINT'), terminated = () => stop('SIGTERM');
  process.on('SIGINT', interrupted); process.on('SIGTERM', terminated);
  try {
    const result = await new Promise((complete, reject) => {
      child.once('error', issue => { ended = true; reject(issue); });
      child.once('close', (code, signal) => { ended = true; complete({ code, signal }); });
    });
    const code = result.code ?? (result.signal === 'SIGINT' ? 130 : result.signal === 'SIGTERM' ? 143 : 1);
    if (code !== 0) process.exitCode = code;
    return { exitCode: code, exitSignal: result.signal, requestedSignal: cancellation };
  } finally {
    if (timer) clearTimeout(timer);
    process.off('SIGINT', interrupted); process.off('SIGTERM', terminated);
  }
}

/** The original owners parse arguments and preserve their complete native output. */
export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === 'help') {
    process.stdout.write(HELP); return;
  }
  if (Object.hasOwn(native, command)) {
    const original = await import(new URL(native[command], import.meta.url));
    need(typeof original.main === 'function', 'BASEROW_RAILS_NATIVE_ENTRY_CHANGED');
    return original.main(rest);
  }
  if (command === 'client') {
    const [action, ...args] = rest;
    need(['export', 'inspect', 'copy', 'resume'].includes(action),
      'BASEROW_RAILS_CLIENT_COMMAND', 'Choose client export, inspect, copy or resume.');
    const original = await import(new URL(native.customer, import.meta.url));
    return original.main(['client-' + action, ...args]);
  }
  if (Object.hasOwn(ruby, command)) return runRuby(command, rest);
  throw Object.assign(new Error('Choose a Baserow/Rails command from --help.'),
    { code: 'BASEROW_RAILS_COMMAND' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(issue => {
    process.stderr.write((issue.code ?? 'BASEROW_RAILS') + ': ' + issue.message + '\n');
    process.exitCode = 1;
  });
