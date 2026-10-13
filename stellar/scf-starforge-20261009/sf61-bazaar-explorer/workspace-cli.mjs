#!/usr/bin/env node
// MIT. Original retained catalog, request and transfer actions on one Atlas store.
import { createReadStream, constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAtlasWorkspace } from './workspace.mjs';
import { CAPTURE_FILTERS } from './capture-search.mjs';
import { writeWorkspaceTransfer, receiveWorkspaceTransfer, inspectWorkspaceTransfer } from './workspace-transfer.mjs';

const HELP = `Atlas retained catalogs, buyer requests and complete workspace transfer

  atlas-workspace summary --workspace /private/atlas
  atlas-workspace receive-page --workspace /private/atlas --input /data/page.json --name "Provider capture"
  atlas-workspace receive-capture --workspace /private/atlas --input /data/original-capture --name "Provider capture"
  atlas-workspace search --workspace /private/atlas --capture CAPTURE_ID [--query TEXT]
    [--type http|mcp] [--network NETWORK] [--scheme SCHEME] [--asset ASSET]
    [--pay-to RECIPIENT] [--extensions NAME] [--page 0] [--page-size 25] [--snapshot SHA256] [--all]
  atlas-workspace select --workspace /private/atlas --capture CAPTURE_ID
    --page-file page-000000.json --row 0 --accept 0 --label "Original request" [--selection ID]
  atlas-workspace selection --workspace /private/atlas --selection ID
  atlas-workspace prepare --workspace /private/atlas --selection ID --revision N --request /private/request.json
    [--body /private/request.body | --remove-body] [--ticket /private/ticket.json | --remove-ticket]
  atlas-workspace handoff --workspace /private/atlas --selection ID --revision N
  atlas-workspace export --workspace /private/atlas --output /private/atlas.ndjson
  atlas-workspace inspect --input /private/atlas.ndjson
  atlas-workspace receive --input /private/atlas.ndjson --workspace /private/received [--resume]

Search ranks the retained original pages with the maintained Bazaar query engine.
An empty query browses source order. All payment filters match the same original
accepted option. Output carries page/row/option indexes and both receiving and
provider-reported coverage. --all streams one complete response per NDJSON line
through the same pinned snapshot; --snapshot continues a previous response.

Request JSON contains the original explicit intentId, url, method and headers,
plus optional responseOut and ticketHeader. Body/ticket files retain exact UTF-8.
Omitted body/ticket options keep their current saved inputs. Preparation and
handoff use the original buyer; signing and payment stay in its operator workflow.

The browser and CLI share one private single-writer workspace. Close Atlas before
using this CLI on the same directory. Input/output/workspace paths are absolute.
Receive resumes only the same transfer; every original saved file travels together.
`;
const commands = {
  summary: { required: ['workspace'] },
  'receive-page': { required: ['workspace', 'input', 'name'] },
  'receive-capture': { required: ['workspace', 'input', 'name'] },
  search: { required: ['workspace', 'capture'], optional: ['query', 'type', 'network', 'scheme', 'asset', 'pay-to', 'extensions', 'page', 'page-size', 'snapshot', 'all'] },
  select: { required: ['workspace', 'capture', 'page-file', 'row', 'accept', 'label'], optional: ['selection'] },
  selection: { required: ['workspace', 'selection'] },
  prepare: { required: ['workspace', 'selection', 'revision', 'request'], optional: ['body', 'remove-body', 'ticket', 'remove-ticket'] },
  handoff: { required: ['workspace', 'selection', 'revision'] },
  export: { required: ['workspace', 'output'] },
  inspect: { required: ['input'] },
  receive: { required: ['input', 'workspace'], optional: ['resume'] }
};
const flags = new Set(['all', 'resume', 'remove-body', 'remove-ticket']);
const paths = new Set(['workspace', 'input', 'output', 'request', 'body', 'ticket']);
function argumentsFor(argv) {
  if (!argv.length || argv.includes('--help')) return { help: true };
  const [command, ...rest] = argv, definition = commands[command];
  if (!definition) throw new Error('Choose a command listed by --help');
  const accepted = new Set([...definition.required, ...(definition.optional ?? [])]), values = { command };
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index], key = token.startsWith('--') ? token.slice(2) : '';
    if (!accepted.has(key) || Object.hasOwn(values, key)) throw new Error(`Unexpected option: ${token}`);
    if (flags.has(key)) values[key] = true;
    else {
      const value = rest[++index];
      if (value === undefined || value.startsWith('--')) throw new Error(`${token} requires a value`);
      if (paths.has(key)) {
        if (!isAbsolute(value)) throw new Error(`${token} requires an absolute path`);
        values[key] = resolve(value);
      } else values[key] = value;
    }
  }
  for (const key of definition.required)
    if (!Object.hasOwn(values, key) || values[key] === '') throw new Error(`Missing --${key}`);
  for (const kind of ['body', 'ticket'])
    if (values[kind] && values['remove-' + kind]) throw new Error(`Choose --${kind} or --remove-${kind}`);
  return values;
}
function integer(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`${name} requires a nonnegative integer`);
  return Number(value);
}
async function inputText(filename, maximum) {
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maximum) throw new Error('Input exceeds its original file capacity: ' + basename(filename));
    const bytes = await file.readFile();
    if (bytes.length > maximum) throw new Error('Input exceeds its original file capacity: ' + basename(filename));
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } finally { await file.close(); }
}
export async function runWorkspaceCli(argv = process.argv.slice(2)) {
  const options = argumentsFor(argv);
  if (options.help) { console.log(HELP); return; }
  let workspace, input;
  const print = result => { console.log(JSON.stringify(result, null, 2)); return result; };
  try {
    if (options.command === 'inspect' || options.command === 'receive') {
      input = createReadStream(options.input);
      if (options.command === 'inspect') return print(await inspectWorkspaceTransfer(input));
      const result = await receiveWorkspaceTransfer(input, options.workspace, { resume: options.resume });
      workspace = await openAtlasWorkspace({ directory: options.workspace, create: false });
      result.workspace = await workspace.summary();
      return print(result);
    }
    workspace = await openAtlasWorkspace({ directory: options.workspace,
      create: ['receive-page', 'receive-capture'].includes(options.command) });
    if (options.command === 'summary') return print(await workspace.summary());
    if (options.command === 'export') return print(await writeWorkspaceTransfer(workspace, options.output));
    if (options.command === 'receive-page')
      return print(await workspace.receivePage({ name: options.name, pageText: await inputText(options.input, 1048576) }));
    if (options.command === 'receive-capture') {
      const started = await workspace.beginCapture({ name: options.name,
        sessionText: await inputText(join(options.input, 'session.json'), 1048576),
        manifestText: await inputText(join(options.input, 'manifest.json'), 8 * 1048576) });
      for (const file of started.missingPages)
        await workspace.putCapturePage({ captureId: started.captureId, file,
          text: await inputText(join(options.input, file), 1048576) });
      return print(await workspace.finishCapture({ captureId: started.captureId }));
    }
    if (options.command === 'search') {
      const filters = Object.fromEntries(CAPTURE_FILTERS.map(key => [key, options[key === 'payTo' ? 'pay-to' : key]])
        .filter(([, value]) => value !== undefined));
      const request = { captureId: options.capture, query: options.query ?? '', filters,
        page: integer(options.page, 0, '--page'), pageSize: integer(options['page-size'], 50, '--page-size'),
        snapshotId: options.snapshot ?? null };
      if (!options.all) return print(await workspace.capture(request));
      let pages = 0;
      for await (const page of workspace.capturePages(request)) { console.log(JSON.stringify(page)); pages++; }
      return { pages };
    }
    if (options.command === 'select') return print(await workspace.saveSelection({
      captureId: options.capture, pageFile: options['page-file'], row: integer(options.row, null, '--row'),
      accept: integer(options.accept, null, '--accept'), label: options.label,
      ...(options.selection ? { selectionId: options.selection } : {}) }));
    if (options.command === 'selection') return print(await workspace.selection({ selectionId: options.selection }));
    const selectionId = options.selection, revision = integer(options.revision, null, '--revision');
    if (options.command === 'handoff') return print(await workspace.createHandoff({ selectionId, revision }));
    if (options.command === 'prepare') {
      const request = JSON.parse(await inputText(options.request, 65536)), value = { selectionId, revision, request };
      for (const [kind, maximum] of [['body', 1048576], ['ticket', 16384]])
        if (options[kind]) value[kind + 'Text'] = await inputText(options[kind], maximum);
        else if (options['remove-' + kind]) value[kind + 'Text'] = null;
      return print(await workspace.prepareSelection(value));
    }
    throw new Error('Unrecognized Atlas workspace action');
  } finally { input?.destroy(); await workspace?.close?.(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runWorkspaceCli().catch(error => {
    console.error(`${error.code ?? 'ATLAS_WORKSPACE_OPERATION_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  });
