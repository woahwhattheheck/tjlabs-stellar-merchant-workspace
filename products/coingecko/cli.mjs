#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Product entrypoint: original operator, installed lifecycle and complete customer files.
import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const help = String.raw`CoinGecko market workspace — Node 24 or newer

  starforge coingecko-product workspace --state PRIVATE_DIR [--port 0] [--config OPERATOR_CONFIG.json]
  starforge coingecko-product operator COMMAND [ORIGINAL_OPTIONS]
  starforge coingecko-product provider compile|serve [ORIGINAL_OPTIONS]

  starforge coingecko-product delivery create --archive ORIGINAL.json.gz --out PRIVATE_DELIVERY
  starforge coingecko-product delivery inspect --directory PRIVATE_DELIVERY
  starforge coingecko-product delivery receive --directory PRIVATE_DELIVERY --state PRIVATE_MARKET
      --actor "Recipient operator" --operation ORIGINAL_OPERATION [--name "Received project"]

  starforge coingecko-product managed-receive --manifest ORIGINAL_MANIFEST.json --out ORIGINAL_OUTPUT
  starforge coingecko-product runtime --directory ORIGINAL_READY_RUNTIME [--load]

workspace opens the complete source, collection, research and provider interface.
operator forwards unchanged options to the existing CoinGecko CLI, including
project, config, request, collection, import, snapshot, compare, note, export,
restore, status, list and the original native queue controls.
provider uses the existing five-family provider compiler and seller.

delivery creates the full customer report, exact typed/CSV research files,
all original sources, complete project archive and original runnable source.
receive calls the original transactional restore in a separate market project.
Repeat its original operation to resume; completed receiving preserves later work.
managed-receive runs the existing complete Applications/browser/recovery driver.

See products/coingecko/OPERATING.md and RECEIVING.md.
`;

function fail(message) { return Object.assign(new Error(message), { code: 'COINGECKO_PRODUCT_INPUT' }); }
function options(args, allowed, booleans = []) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.includes(key) || Object.hasOwn(result, key)) throw fail('Unknown or repeated option: ' + key);
    if (booleans.includes(key)) { result[key] = true; continue; }
    const value = args[++i];
    if (typeof value !== 'string' || !value || value.startsWith('--')) throw fail(key + ' requires a value.');
    result[key] = value;
  }
  return result;
}
function required(opts, name) {
  if (!opts[name]) throw fail(name + ' is required.');
  return opts[name];
}
const output = result => process.stdout.write(JSON.stringify(result, null, 2) + '\n');
export async function main(argv = process.argv.slice(2)) {
  const args = [...argv], command = args.shift();
  if (!command || ['--help', '-h', 'help'].includes(command)) { process.stdout.write(help); return 0; }
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) throw fail('Use Node 24 or newer for the original SQLite market workspace.');
  if (['workspace', 'operator', 'provider'].includes(command)) {
    const { main: operator } = await import('../../stellar/scf-starforge-20261009/partners/coingecko-stellar-market/cli.mjs');
    if (command === 'workspace') return operator(['serve', ...args]);
    return operator(command === 'provider' ? ['provider', ...args] : args);
  }
  if (command === 'delivery') {
    const action = args.shift();
    const { createCoinGeckoDelivery, inspectCoinGeckoDelivery, receiveCoinGeckoDelivery } = await import('./delivery.mjs');
    let result;
    if (action === 'create') {
      const opts = options(args, ['--archive', '--out']);
      result = await createCoinGeckoDelivery({ archive: required(opts, '--archive'), output: required(opts, '--out') });
    } else if (action === 'inspect') {
      const opts = options(args, ['--directory']);
      result = await inspectCoinGeckoDelivery({ directory: required(opts, '--directory') });
    } else if (action === 'receive') {
      const opts = options(args, ['--directory', '--state', '--actor', '--operation', '--name']);
      result = await receiveCoinGeckoDelivery({ directory: required(opts, '--directory'), state: required(opts, '--state'),
        actor: required(opts, '--actor'), operation: required(opts, '--operation'), name: opts['--name'] });
    } else throw fail('Choose delivery create, inspect or receive.');
    // Keep the complete manifest in delivery.json; CLI output is a useful operation result.
    const { manifest, ...status } = result;
    output(manifest ? { ...status, project: manifest.project, counts: manifest.counts,
      archive: manifest.archive, report: manifest.report, families: manifest.families, sourceBases: manifest.sourceBases } : status);
    return result;
  }
  if (command === 'managed-receive') {
    const opts = options(args, ['--manifest', '--out']);
    const { receiveCoinGeckoApplication } = await import('../../stellar/scf-starforge-20261009/partners/coingecko-stellar-market/receiving/applications.mjs');
    const result = await receiveCoinGeckoApplication({ manifest: resolve(required(opts, '--manifest')), output: resolve(required(opts, '--out')) });
    output(result); return result;
  }
  if (command === 'runtime') {
    const opts = options(args, ['--directory', '--load'], ['--load']);
    const { inspectMerchantRuntime } = await import('../../stellar/scf-starforge-20261009/sf46-release/runtime-package.mjs');
    const result = await inspectMerchantRuntime(resolve(required(opts, '--directory')), { load: opts['--load'] === true, source: true });
    output(result); return result;
  }
  throw fail('Choose workspace, operator, provider, delivery, managed-receive or runtime. Use --help.');
}
if (process.argv[1] && await realpath(resolve(process.argv[1])).then(path => pathToFileURL(path).href === import.meta.url, () => false))
  main().then(result => { if (Number.isInteger(result)) process.exitCode = result; }).catch(error => {
    process.stderr.write(JSON.stringify({ error: { code: error.code ?? 'COINGECKO_PRODUCT', message: error.message } }) + '\n');
    process.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
  });
