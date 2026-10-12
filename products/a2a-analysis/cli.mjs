#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { isCommandEntry } from './python-command.mjs';

const HELP = [
  'A2A analytical product',
  '',
  'a2a-product runtime prepare|install|resume|inspect|run|upgrade|recover|compare ...',
  'a2a-product workspace --database PRIVATE serve|status|response|workspace-export ...',
  'a2a-product archive inspect|receive ...',
  'a2a-product agent capture|init|check|serve ...',
  'a2a-product merchant workspace|action|export|receive|result|merchant|release-stage ...',
  'a2a-product receive catalog|run|submit|get|resume|cancel ...',
  '',
  'Every command operates the original selected component and accepts its original',
  'arguments. Append --help to a component for its complete command contract.',
  'Build selection a2a-analysis with the maintained distribution/build.mjs.',
  'Install features a2a and a2a-analysis with --operator in one original runtime.',
  'Then use runtime run --dir RUNTIME -- a2a-product COMPONENT ... to operate that',
  'installed source and its dependency tree. See OPERATING.md and RECEIVING.md.',
  ''
].join('\n');

const commands = Object.freeze({
  runtime: ['../../stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs', 'main'],
  workspace: ['./analysis-cli.mjs', 'main'],
  archive: ['./archive-cli.mjs', 'main'],
  agent: ['../../stellar-forge/a2a-analysis-agent/cli.mjs', 'main'],
  merchant: ['../../stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs', 'runA2ACli'],
  receive: ['../../stellar-forge/a2a-analysis-agent/receive.mjs', 'main']
});

export async function main(args = process.argv.slice(2)) {
  const [name, ...originalArgs] = args;
  if (!name || ['help', '--help', '-h'].includes(name)) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!Object.hasOwn(commands, name)) throw new TypeError('Unknown A2A product component: ' + name);
  const [path, entry] = commands[name];
  const original = await import(new URL(path, import.meta.url));
  const result = await original[entry](originalArgs);
  if (typeof result === 'number') process.exitCode = result;
  return result;
}

if (await isCommandEntry(import.meta.url)) main().catch(error => {
  process.stderr.write(JSON.stringify({ error: error.code ?? 'A2A_PRODUCT_COMMAND_ERROR',
    message: error.message }) + '\n');
  process.exitCode = 1;
});
