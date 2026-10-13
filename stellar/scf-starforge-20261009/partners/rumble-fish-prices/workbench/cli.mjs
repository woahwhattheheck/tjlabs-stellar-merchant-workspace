#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWorkbench } from './runner.mjs';
import { startWorkbenchServer } from './server.mjs';
import { buildDelivery, unpackDelivery } from './delivery.mjs';
import { receiveConsumerFeed } from './wallet.mjs';

const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
const help = [
  'Stellar Prices workbench', '',
  'init    --dir WORKSPACE [--configuration JSON]',
  'serve   --dir WORKSPACE [--port 8788]',
  'inspect --dir WORKSPACE',
  'plan    --dir WORKSPACE --spec JSON',
  'collect --dir WORKSPACE --plan ID',
  'resume  --dir WORKSPACE --run ID',
  'result  --dir WORKSPACE --run ID --task ID [--format json|csv] [--out FILE]',
  'receive-values --file PUBLISHED_FEED_JSON [--prior WALLET_STATE_JSON] --out NEXT_WALLET_STATE_JSON',
  'customers --dir WORKSPACE',
  'customer-save --dir WORKSPACE --input CUSTOMER_INPUT_JSON',
  'customer --dir WORKSPACE --customer ID',
  'customer-edition --dir WORKSPACE --input EDITION_INPUT_JSON',
  'customer-review --dir WORKSPACE --input REVIEW_INPUT_JSON',
  'customer-values --dir WORKSPACE --customer ID [--edition ID] [--format json|csv] [--out FILE]',
  'export  --dir WORKSPACE --out DELIVERY_JSON',
  'unpack  --file DELIVERY_JSON --out NEW_DIRECTORY', '',
  'STELLAR_PRICES_API_KEY supplies the existing provider key to this process.',
  'The local operator link is printed by serve. No dependency install is required.',
].join('\n');
function parse(argv) {
  const command = argv.shift() ?? 'help', options = {};
  const accepted = new Set(['dir', 'configuration', 'port', 'spec', 'plan', 'run', 'task', 'format', 'out', 'file', 'input', 'customer', 'edition', 'prior']);
  while (argv.length) {
    const flag = argv.shift();
    if (!flag.startsWith('--') || !accepted.has(flag.slice(2)) || !argv.length || argv[0].startsWith('--') || Object.hasOwn(options, flag.slice(2))) throw new Error('Unknown, repeated or incomplete option: ' + flag);
    options[flag.slice(2)] = argv.shift();
  }
  return { command, options };
}
function required(options, name) { if (!options[name]) throw new Error('--' + name + ' is required.'); return options[name]; }
const loadJson = async path => JSON.parse(await readFile(resolve(path), 'utf8'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const ACTIVE = new Set(['RUNNING', 'RETRY_WAIT']);

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parse([...argv]);
  if (['help', '--help', '-h'].includes(command)) { process.stdout.write(help + '\n'); return; }
  if (command === 'unpack') { print(await unpackDelivery(await loadJson(required(options, 'file')), required(options, 'out'))); return; }
  if (command === 'receive-values') {
    const incoming = await loadJson(required(options, 'file'));
    const previous = options.prior ? await loadJson(options.prior) : null;
    const result = receiveConsumerFeed(previous, incoming);
    const out = resolve(required(options, 'out'));
    await writeFile(out, JSON.stringify(result.state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    print({ file: out, outcome: result.outcome, consumerId: result.view.consumerId, sourceRevision: result.view.sourceRevision, editionId: result.view.editionId, totals: result.view.totals });
    return;
  }
  const directory = required(options, 'dir');
  if (command === 'serve') {
    const service = await startWorkbenchServer({ directory, apiKey: process.env.STELLAR_PRICES_API_KEY,
      port: options.port === undefined ? 8788 : Number(options.port) });
    print({ origin: service.origin, operatorUrl: service.operatorUrl, workspace: resolve(directory) });
    const stop = () => service.close().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
    process.once('SIGINT', stop); process.once('SIGTERM', stop); return service;
  }
  if (!['init', 'inspect', 'plan', 'collect', 'resume', 'result', 'export', 'customers', 'customer-save', 'customer', 'customer-edition', 'customer-review', 'customer-values'].includes(command)) throw new Error('Unknown command: ' + command);
  const workbench = await openWorkbench({ directory, create: command === 'init', apiKey: process.env.STELLAR_PRICES_API_KEY,
    ...(command === 'init' && options.configuration ? { configuration: await loadJson(options.configuration) } : {}) });
  let stopping = false;
  const stop = () => { stopping = true; void workbench.pause().catch(() => {}); };
  try {
    if (['init', 'inspect'].includes(command)) { print(await workbench.snapshot()); return; }
    if (command === 'plan') { print(await workbench.plan(await loadJson(required(options, 'spec')))); return; }
    if (command === 'customers') { print(await workbench.consumers()); return; }
    if (command === 'customer') { print(await workbench.consumer({ consumerId: required(options, 'customer') })); return; }
    if (command === 'customer-save') { print(await workbench.saveConsumer(await loadJson(required(options, 'input')))); return; }
    if (command === 'customer-edition') { print(await workbench.createConsumerEdition(await loadJson(required(options, 'input')))); return; }
    if (command === 'customer-review') { print(await workbench.reviewConsumerEdition(await loadJson(required(options, 'input')))); return; }
    if (command === 'customer-values') {
      const format = options.format ?? 'json';
      const value = await workbench.consumerOutput({ consumerId: required(options, 'customer'), editionId: options.edition, format });
      const content = format === 'csv' ? value.content : JSON.stringify(value, null, 2) + '\n';
      if (options.out) { await writeFile(resolve(options.out), content, { flag: 'wx', mode: 0o600 }); print({ file: resolve(options.out), format }); }
      else process.stdout.write(content);
      return;
    }
    if (command === 'result') {
      const format = options.format ?? 'json';
      const result = await workbench.result({ runId: required(options, 'run'), taskId: required(options, 'task'), format });
      const content = format === 'csv' ? result.content : JSON.stringify(result, null, 2) + '\n';
      if (options.out) { await writeFile(resolve(options.out), content, { flag: 'wx', mode: 0o600 }); print({ file: resolve(options.out), format }); }
      else process.stdout.write(content);
      return;
    }
    if (command === 'export') {
      const bundle = await buildDelivery(workbench), out = resolve(required(options, 'out'));
      await writeFile(out, JSON.stringify(bundle, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      print({ file: out, files: bundle.files.length, bytes: bundle.bytes, revision: bundle.revision }); return;
    }
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const run = command === 'collect' ? await workbench.start({ planId: required(options, 'plan') }) : await workbench.resume({ runId: required(options, 'run') });
    print({ runId: run.id, status: run.status });
    let current;
    while (!stopping) {
      const snapshot = await workbench.snapshot(); current = snapshot.runs.find(item => item.id === run.id);
      if (!current || !ACTIVE.has(current.status)) break;
      await delay(700);
    }
    if (stopping) await workbench.pause();
    print({ run: (await workbench.snapshot()).runs.find(item => item.id === run.id) ?? current });
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await workbench.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write((error.code ? error.code + ': ' : '') + error.message + '\n'); process.exitCode = 1; });
}
