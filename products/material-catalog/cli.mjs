#!/usr/bin/env node
// MIT. TokenJunkieLabs product entrypoint; native command processes retain their own lifecycle.
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { main as nativeMain } from '../../stellar/scf-starforge-20261009/distribution/cli.mjs';

const commands = new Map([
  ['opensearch-workspace', 'Open the material catalog, customer matching and search operator workspace'],
  ['opensearch-catalog', 'Operate saved catalogs, revisions, decisions and complete portable handovers'],
  ['opensearch-prepare', 'Prepare the selected search merchant and its generated customer client'],
  ['opensearch', 'Preflight or run the prepared native Stellar search merchant'],
]);
const help = [
  'TokenJunkieLabs Stellar merchant workspace',
  '',
  'Material catalog and OpenSearch operations:',
  ...[...commands].map(([command, description]) => '  starforge-materials ' + command.padEnd(25) + description),
  '',
  '  starforge-materials doctor [--native]         Inspect the selected native runtime dependencies',
  '  starforge-materials source                    Show this exact installed product source',
  '  starforge-materials registrations             Show the retained product command declarations',
  '',
  'Use starforge-materials COMMAND --help for the maintained command options.',
  'Start with the customer operating guide in README.md.',
  '',
].join('\n');

export async function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args;
  if (!command || ['--help', '-h', 'help'].includes(command)) {
    if (rest.length) throw new TypeError('Product help takes no options');
    console.log(help); return;
  }
  if (!commands.has(command) && !['doctor', 'source', 'registrations'].includes(command))
    throw new TypeError('Unknown product command: ' + command + '. Use starforge-materials --help.');
  return nativeMain(args);
}
if (process.argv[1] && await realpath(resolve(process.argv[1])).then(
  entry => pathToFileURL(entry).href === import.meta.url, () => false))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
