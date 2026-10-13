#!/usr/bin/env node
// MIT — Local authoring commands for the existing private collection store.
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openCollections } from '../collections/model.mjs';
import { initializationBytes } from '../initialization.mjs';
import { openCollectionComposer, inspectCollectionCatalog } from './model.mjs';
import { fields, need } from './plan.mjs';

export const HELP = [
  'Starforge customer request plans',
  '',
  '  starforge buyer-collection-plans list --directory ABS',
  '  starforge buyer-collection-plans show --directory ABS --id PLAN --revision SHA256',
  '  starforge buyer-collection-plans save --directory ABS --file ABS_PLAN_JSON',
  '  starforge buyer-collection-plans catalog --file ABS_CATALOG_JSON',
  '  starforge buyer-collection-plans editions --directory ABS',
  '  starforge buyer-collection-plans edition --directory ABS --collection ID',
  '  starforge buyer-collection-plans prepare --directory ABS --id PLAN --revision SHA256',
  '    --collection ID --name NAME [--value name=value ...]',
  '  starforge buyer-collection-plans create --directory ABS --collection ID',
  '    --edition-sha256 SHA256 --preview-sha256 SHA256',
  '',
  'Use an existing Request Collections directory. All output is JSON.',
  'Save keeps immutable plan revisions. Prepare retains one named period and its source inputs.',
  'Repeat the same prepare request to resume its original identity.',
  'Create joins that reviewed period to the original collection screen and CLI.',
  'Queue, approval, execution and recovery remain in the original buyer-collections command.',
].join('\n');
const MODES = {
  list: ['--directory'], show: ['--directory', '--id', '--revision'],
  save: ['--directory', '--file'], catalog: ['--file'],
  editions: ['--directory'], edition: ['--directory', '--collection'],
  prepare: ['--directory', '--id', '--revision', '--collection', '--name'],
  create: ['--directory', '--collection', '--edition-sha256', '--preview-sha256'],
};
export function readCollectionComposerArguments(args) {
  need(Array.isArray(args) && args.every(item => typeof item === 'string'), 'COLLECTION_AUTHORING_CLI_ARGUMENT');
  if (args.length === 0 || args.length === 1 && ['help', '--help', '-h'].includes(args[0]))
    return { mode: 'help', options: {}, values: {} };
  const [mode, ...rest] = args;
  need(Object.hasOwn(MODES, mode) && rest.length % 2 === 0, 'COLLECTION_AUTHORING_CLI_ARGUMENT');
  const options = {}, values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index], value = rest[index + 1];
    need(value.length > 0, 'COLLECTION_AUTHORING_CLI_VALUE_REQUIRED');
    if (key === '--value') {
      const equals = value.indexOf('='), name = value.slice(0, equals);
      need(mode === 'prepare' && equals >= 1 && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)
        && !Object.hasOwn(values, name), 'COLLECTION_AUTHORING_CLI_PARAMETER_INVALID');
      values[name] = value.slice(equals + 1);
    } else {
      need(MODES[mode].includes(key) && !Object.hasOwn(options, key), 'COLLECTION_AUTHORING_CLI_ARGUMENT');
      options[key] = value;
    }
  }
  need(MODES[mode].every(key => Object.hasOwn(options, key)), 'COLLECTION_AUTHORING_CLI_VALUE_REQUIRED');
  return { mode, options, values };
}
export async function runCollectionComposerCommand(args) {
  const { mode, options, values } = readCollectionComposerArguments(args);
  if (mode === 'help') return { help: HELP };
  if (mode === 'catalog') return inspectCollectionCatalog({ path: options['--file'] });
  const collections = await openCollections({ directory: options['--directory'], existingOnly: true });
  const composer = openCollectionComposer({ collections });
  try {
    if (mode === 'list') return await composer.listPlans();
    if (mode === 'show') return await composer.inspectPlan(options['--id'], options['--revision']);
    if (mode === 'save') {
      let input;
      try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true })
        .decode(await initializationBytes(options['--file'], 1048576))); }
      catch (error) {
        if (error.code) throw error;
        need(false, 'COLLECTION_AUTHORING_JSON_INVALID');
      }
      // Accept the portable plain plan or the complete saved-plan response.
      const plan = input?.schema === 'stellar-forge.sf88.collection-plan-revision.v1'
        ? fields(input, ['schema', 'id', 'planSha256', 'savedAt', 'plan']).plan : input;
      return await composer.savePlan({ plan });
    }
    if (mode === 'editions') return await composer.listEditions();
    if (mode === 'edition') return await composer.inspectEdition(options['--collection']);
    if (mode === 'prepare') return await composer.prepareEdition({
      planId: options['--id'], planSha256: options['--revision'],
      collectionId: options['--collection'], name: options['--name'], values,
    });
    return await composer.createEdition({ collectionId: options['--collection'],
      expectedEditionSha256: options['--edition-sha256'], expectedPreviewSha256: options['--preview-sha256'] });
  } finally { composer.close(); await collections.close(); }
}
export async function main(args = process.argv.slice(2)) {
  const value = await runCollectionComposerCommand(args);
  process.stdout.write((value.help ?? JSON.stringify(value, null, 2)) + '\n');
  return value;
}
if (process.argv[1] && await realpath(resolve(process.argv[1])).then(
  entry => pathToFileURL(entry).href === import.meta.url, () => false))
  main().catch(error => { console.error(error.code ?? 'COLLECTION_AUTHORING_FAILED'); process.exitCode = 1; });
