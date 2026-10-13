#!/usr/bin/env node
// MIT. Create and retain complete customer procedures from the original IATI case.
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { connectIatiWorkspace } from './client.mjs';
import { loadCommandCatalog } from '../../distribution/discovery/load.mjs';
import { saveExport, saveTextExport } from '../../distribution/discovery/write-json.mjs';
import { createDocumentOperatingProcedure, inspectDocumentOperatingSource,
  inspectDocumentOperatingProcedure, receiveDocumentOperatingProcedure,
  renderDocumentOperatingProcedure } from './document_evidence/operating_procedure.mjs';

const MAXIMUM = 64 * 1024 * 1024;
const HELP = [
  'IATI customer operating procedure',
  '',
  'starforge iati-document-procedure create --source CASE.json --out PROCEDURE.json [OPTIONS]',
  'starforge iati-document-procedure create --connection-file PRIVATE --evidence-id SHA --evidence-revision N --out PROCEDURE.json [OPTIONS]',
  'starforge iati-document-procedure capture --connection-file PRIVATE --evidence-id SHA --evidence-revision N --out CASE.json',
  'starforge iati-document-procedure show --file PROCEDURE.json --format plan|source|catalog|markdown|html|package --out FILE',
  'starforge iati-document-procedure receive --file PROCEDURE.json --plan EDITED_COMPLETE_PLAN.json --out NEXT_PROCEDURE.json',
  '',
  'Create options: --catalog COMPLETE_CATALOG.json or --source-root ROOT [--selection PRODUCT]',
  '  --title TEXT --customer TEXT --owner TEXT --period TEXT --purpose TEXT --receiving TEXT',
  '  --connection-file PRIVATE --packet-file NEW_COMPLETE_WORKSPACE.zip --id ORIGINAL_PROCEDURE_ID',
  '  --timeout-ms 1..900000 (existing console connection)',
  '',
  'Create reads an exact saved case and the actual selected toolkit catalog.',
  'The complete package contains its source history, all selected rows/observations,',
  'original comparisons/correction and the editable Operating Plans document.',
  'The existing browser Import complete plan accepts this package or its plan export.',
  'Receive incorporates a later complete edited plan with the same original history.',
  'All output paths are new files. Private connection contents are never embedded.',
  'No command acquires a public document or changes the original case.'
].join('\n');
const optionsByCommand = {
  create: ['source','connection-file','evidence-id','evidence-revision','catalog','source-root','selection',
    'title','customer','owner','period','purpose','receiving','packet-file','id','timeout-ms','out'],
  capture: ['connection-file','evidence-id','evidence-revision','timeout-ms','out'],
  show: ['file','format','out'],
  receive: ['file','plan','out']
};
function args(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || rest.includes('--help')) return { help: true };
  if (!Object.hasOwn(optionsByCommand, command)) throw new TypeError('Choose create, capture, show or receive.');
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i], value = rest[i + 1];
    if (!name.startsWith('--') || !optionsByCommand[command].includes(name.slice(2)) ||
        value === undefined || value.startsWith('--') || Object.hasOwn(options,name.slice(2)))
      throw new TypeError('Use each documented option once with its complete value.');
    options[name.slice(2)] = value;
  }
  return { command, options };
}
function required(options, name) {
  const value = options[name];
  if (typeof value !== 'string' || !value) throw new TypeError('Supply --' + name + '.');
  return value;
}
function integer(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) ||
      !Number.isSafeInteger(Number(value)) || Number(value) > maximum)
    throw new TypeError('Use a positive integer for --' + name + '.');
  return Number(value);
}
async function originalJson(filename) {
  const handle = await open(resolve(filename), 'r');
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size < 1n || before.size > BigInt(MAXIMUM))
      throw new TypeError('Choose one complete JSON file up to 64 MiB.');
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (bytes.length !== Number(before.size) || before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs)
      throw new TypeError('The selected complete input changed during reading.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { await handle.close(); }
}
async function capture(options, signal) {
  const client = await connectIatiWorkspace({
    consoleUrlFile: required(options,'connection-file'),
    ...(options['timeout-ms'] ? { timeoutMs: integer(options['timeout-ms'],'timeout-ms',900000) } : {})
  });
  try {
    if (typeof client.documentEvidence?.operatingSource !== 'function')
      throw new TypeError('Use the complete IATI client and console with operating-source support.');
    return inspectDocumentOperatingSource(await client.documentEvidence.operatingSource(
      required(options,'evidence-id'), { revision: integer(required(options,'evidence-revision'),'evidence-revision'), signal }));
  } finally { await client.dispose(); }
}
export async function runDocumentOperatingProcedureCli(argv = process.argv.slice(2)) {
  const parsed = args(argv);
  if (parsed.help) { process.stdout.write(HELP + '\n'); return; }
  const { command, options } = parsed;
  const output = required(options,'out'), controller = new AbortController();
  const interrupt = () => controller.abort(new Error('The original console read was interrupted.'));
  process.once('SIGINT',interrupt); process.once('SIGTERM',interrupt);
  try {
    let value;
    if (command === 'capture') value = await capture(options,controller.signal);
    else if (command === 'create') {
      if (options.source && (options['evidence-id'] || options['evidence-revision']))
        throw new TypeError('Choose a complete saved source file or an exact console case.');
      if (options.catalog && (options['source-root'] || options.selection))
        throw new TypeError('Choose the complete captured toolkit catalog or an installed source selection.');
      const source = options.source ? inspectDocumentOperatingSource(await originalJson(options.source))
        : await capture(options,controller.signal);
      const catalog = options.catalog ? await originalJson(options.catalog)
        : await loadCommandCatalog({ sourceRoot: options['source-root'], selection: options.selection });
      const settings = Object.fromEntries(['title','customer','owner','period','purpose','receiving']
        .filter(key => options[key] !== undefined).map(key => [key,options[key]]));
      value = createDocumentOperatingProcedure(source,catalog,{
        ...settings, id: options.id ?? randomUUID(),
        ...(options['connection-file'] ? { connectionFile: resolve(options['connection-file']) } : {}),
        ...(options['packet-file'] ? { packetFile: resolve(options['packet-file']) } : {})
      });
    } else {
      const bundle = inspectDocumentOperatingProcedure(await originalJson(required(options,'file')));
      value = command === 'receive'
        ? receiveDocumentOperatingProcedure(bundle,await originalJson(required(options,'plan')))
        : renderDocumentOperatingProcedure(bundle,options.format ?? 'package');
    }
    const content = typeof value === 'string' ? value : JSON.stringify(value,null,2) + '\n';
    if (Buffer.byteLength(content) > MAXIMUM) throw new TypeError('The complete output exceeds the 64 MiB file capacity.');
    if (typeof value === 'string') await saveTextExport(output,value);
    else await saveExport(output,value);
    const result = { output: resolve(output), format: options.format ?? command,
      bytes: Buffer.byteLength(content), ...(value?.plan?.id ? { planId: value.plan.id,
        revisions: value.plan.revisions.length, sourceRevision: value.source.plan.revision } : {}) };
    process.stdout.write(JSON.stringify(result,null,2) + '\n');
    return result;
  } finally { process.off('SIGINT',interrupt); process.off('SIGTERM',interrupt); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runDocumentOperatingProcedureCli().catch(error => {
    process.stderr.write(JSON.stringify({ error: { code: error.code ?? 'IATI_OPERATING_PROCEDURE_ERROR',
      message: String(error.message ?? error) } },null,2) + '\n');
    process.exitCode = 1;
  });
