#!/usr/bin/env node
// MIT. Complete command-line operation of the source-owned Open Contracting workspace.
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OcdsWorkspace, failure, sha256 } from './workspace.mjs';
import { captureFindTender } from './capture.mjs';
import { startOcdsServer } from './server.mjs';

const HELP = [
  'Open Contracting workspace',
  '',
  'ocds <command> --workspace DIRECTORY [options]',
  '',
  'init                     Create a private retained workspace',
  'serve                    Open the operator browser service',
  'status                   Read current sources, processes, reviews and deliveries',
  'import --file FILE       Import complete OCDS JSON, preserving its original bytes',
  'capture                  Fetch Find a Tender records/releases and every source page',
  'resume --capture-id ID   Continue the same saved source capture',
  'review --ocid OCID       Save a process review with --expected-revision',
  'compare --before ID --after ID   Compare two exact editions of one process',
  'export --format json|csv|html    Export all selected original editions and reviews',
  'package                  Export a complete portable workspace JSON package',
  'receive --file FILE      Merge a portable package with --expected-revision',
  'receiving --package-id ID        Read a retained receiving record',
  'source-state             Read saved publisher selections, document acquisitions and assigned work',
  'source-select --file JSON --expected-revision N   Save an explicit publisher selection',
  'source-refresh --name NAME [--selection-id ID]   Run a fresh publisher/document window',
  'source-resume --window-id ID     Continue the same saved source/document work',
  'source-review --review-id ID --file PATCH_JSON    Save an assigned review with its revision',
  'source-observe --selection-id ID --file SOURCE_JSON --observation JSON [--window-id ID --expected-revision N]',
  'source-original --selection-id ID --file ORIGINAL --observation JSON [--ocid OCID]',
  'source-document --document-id ID [--sha256 SHA] --out FILE   Save exact original bytes',
  'source-export --ocid OCID --directory NEW_FOLDER   Complete editable source handoff',
  'source-receive --directory HANDOFF_FOLDER --expected-revision N',
  'source-receiving --package-id ID   Read complete received source context',
  'merchant-prepare         Prepare the selected process datasets with original SF30',
  'merchant-preview --merchant DIRECTORY   Read the prepared dataset locally',
  'merchant-serve --merchant DIRECTORY     Start its configured native merchant',
  'delivery-receive --delivery DIRECTORY   Receive the finalized original SF100 delivery',
  '',
  'Common: --operator NAME --title TITLE --out FILE',
  'Selection: --scope all|shortlist --ocid OCID (repeat for several processes)',
  'Source: --label LABEL --url ORIGINAL_URL',
  'Capture: --kind releases|record --ocid OCID OR --notice-id ID',
  '         OR --updated-from UTC --updated-to UTC; --stages planning,tender,award --limit 100',
  'Review: --expected-revision N --disposition unreviewed|reviewing|pursue|passed',
  '        --owner NAME --next-action TEXT --note TEXT --shortlist true|false',
  'Serve: --host 127.0.0.1 --port 0',
  'Merchant: --payment PUBLIC_TERMS_JSON --origin HTTPS_ORIGIN --path /procurement',
  '          --query JSON_FILE --facilitator HTTPS_URL --expected-bundle-sha256 SHA',
  ''
].join('\n');
const options = Object.fromEntries([
  'workspace', 'operator', 'title', 'file', 'out', 'label', 'url', 'kind', 'notice-id',
  'updated-from', 'updated-to', 'stages', 'limit', 'capture-id', 'scope', 'format',
  'expected-revision', 'disposition', 'owner', 'next-action', 'note', 'shortlist',
  'before', 'after', 'package-id', 'host', 'port', 'merchant', 'delivery', 'payment',
  'origin', 'path', 'default-limit', 'max-limit', 'query', 'facilitator',
  'expected-bundle-sha256', 'availability-directory', 'name', 'window-id', 'review-id', 'document-id', 'sha256', 'directory', 'observation', 'baseline'
].map(name => [name, { type: 'string' }]));
options.ocid = { type: 'string', multiple: true };
options['selection-id'] = { type: 'string', multiple: true };
options.help = { type: 'boolean', short: 'h' };
options['allow-local-facilitator'] = { type: 'boolean' };
function integer(value, name, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw failure('INVALID_NUMBER', name + ' must be a non-negative integer');
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw failure('INVALID_NUMBER', name + ' is outside the supported integer range');
  return number;
}
function one(values, name, flag = '--ocid') {
  if (!values?.length || values.length !== 1) throw failure('ONE_SELECTION_REQUIRED', name + ' requires exactly one ' + flag);
  return values[0];
}
function need(value, name) { if (value === undefined || value === '') throw failure('ARGUMENT_REQUIRED', name + ' is required'); return value; }
async function sourceFile(filename) {
  const bytes = await readFile(resolve(filename));
  const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  let document;
  try { document = JSON.parse(body.replace(/^\uFEFF/, '')); }
  catch { throw failure('INVALID_JSON', filename + ' is not complete UTF-8 JSON'); }
  return { document, body, bytes };
}
async function output(value, filename, raw = false) {
  const body = raw ? value : JSON.stringify(value, null, 2) + '\n';
  if (filename) {
    const target = resolve(filename); await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, body, { flag: 'wx', mode: 0o600 });
    process.stdout.write(JSON.stringify({ file: target, bytes: Buffer.byteLength(body), sha256: sha256(body) }) + '\n');
  } else process.stdout.write(body);
}
function retainService(service, kind, directory, operator) {
  const address = service.server?.address?.();
  const origin = service.origin || service.url || (address ? 'http://127.0.0.1:' + address.port : null);
  const metadata = service.workspace?.metadata?.();
  process.stdout.write(JSON.stringify({
    schema: kind, origin, directory: resolve(directory), workspaceId: metadata?.id || null,
    revision: metadata?.revision ?? null, operator, pid: process.pid,
    ...(service.snapshot ? { snapshot: service.snapshot } : {})
  }) + '\n');
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    Promise.resolve().then(() => typeof service.close === 'function' ? service.close() : service.stop?.()).then(() => { process.exitCode = 0; })
      .catch(error => { process.stderr.write(JSON.stringify({ error: { code: error.code, message: error.message } }) + '\n'); process.exitCode = 1; });
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
export async function main(args = process.argv.slice(2)) {
  const command = args[0];
  if (!command || command === 'help' || command === '--help' || command === '-h') { process.stdout.write(HELP); return; }
  const { values: value, positionals } = parseArgs({ args: args.slice(1), options, allowPositionals: false, strict: true });
  if (value.help) { process.stdout.write(HELP); return; }
  const directory = need(value.workspace, '--workspace'), operator = value.operator || 'operator';
  const expectedRevision = integer(value['expected-revision'], '--expected-revision');
  const selection = { scope: value.scope || 'all', ocids: value.ocid };
  if (command === 'serve') {
    const service = await startOcdsServer({ directory, operator, title: value.title, host: value.host || '127.0.0.1', port: integer(value.port, '--port', 0) });
    retainService(service, 'stellar-forge.ocds-startup.v1', directory, operator); return service;
  }
  if (command === 'merchant-preview' || command === 'merchant-serve') {
    const module = await import('./merchant.mjs'), merchantDirectory = need(value.merchant, '--merchant');
    const nativeOptions = { expectedBundleSha256: value['expected-bundle-sha256'] };
    if (command === 'merchant-preview') {
      const query = value.query ? (await sourceFile(value.query)).document : {};
      return output(await module.previewMerchant(merchantDirectory, query, nativeOptions), value.out);
    }
    const service = await module.serveMerchant(merchantDirectory, {
      ...nativeOptions, port: integer(value.port, '--port', 0), facilitator: value.facilitator,
      allowLocalFacilitator: value['allow-local-facilitator'] || false, availabilityDirectory: value['availability-directory']
    });
    retainService(service, 'stellar-forge.ocds-merchant-startup.v1', merchantDirectory, operator); return service;
  }
  const workspace = new OcdsWorkspace(directory, { operator, title: value.title });
  try {
    let result;
    switch (command) {
      case 'source-state': case 'source-select': case 'source-refresh': case 'source-resume':
      case 'source-review': case 'source-original': case 'source-observe': case 'source-document': case 'source-export':
      case 'source-receive': case 'source-receiving': {
        const {SourceOperations} = await import('./source-window.mjs');
        const operations = new SourceOperations(workspace);
        if (command==='source-state') result=operations.state();
        else if (command==='source-select') result=operations.saveSelection((await sourceFile(need(value.file,'--file'))).document,{expectedRevision});
        else if (command==='source-refresh' || command==='source-resume') {
          const input = command==='source-resume' ? {windowId:need(value['window-id'],'--window-id')}
            : {name:need(value.name,'--name'),selectionIds:value['selection-id'],
              baseline:value.baseline ? await (async()=>{const prior=(await sourceFile(value.baseline)).document;return prior.current || prior.baseline;})() : undefined};
          const controller = new AbortController(), stop=()=>controller.abort(failure('SOURCE_WINDOW_INTERRUPTED','Source window interrupted',499));
          process.once('SIGINT',stop);process.once('SIGTERM',stop);
          try { result=await operations.run(input,{signal:controller.signal,
            onProgress:progress=>process.stderr.write(JSON.stringify({sourceWindow:progress})+'\n')}); }
          finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
        } else if (command==='source-review') {
          const patch=(await sourceFile(need(value.file,'--file'))).document;
          if (expectedRevision!==undefined) patch.expectedRevision=expectedRevision;
          result=operations.reviewWork(need(value['review-id'],'--review-id'),patch);
        } else if (command==='source-observe') {
          const observation=(await sourceFile(need(value.observation,'--observation'))).document;
          const filename=resolve(need(value.file,'--file'));
          if((await stat(filename)).size>64*1024*1024)throw failure('SOURCE_ORIGINAL_IDENTITY','The publisher source exceeds the native source capacity',413);
          const original=await sourceFile(filename);
          result=operations.adoptSourceObservation({selectionId:one(value['selection-id'],'source-observe','--selection-id'),
            windowId:value['window-id'],expectedWindowRevision:expectedRevision,name:value.name,rawBytes:original.bytes,observation,
            baseline:value.baseline?await(async()=>{const prior=(await sourceFile(value.baseline)).document;return prior.current||prior.baseline;})():undefined});
        } else if (command==='source-original') {
          const observation=(await sourceFile(need(value.observation,'--observation'))).document;
          const filename=resolve(need(value.file,'--file'));
          if((await stat(filename)).size>operations.maxDocumentBytes)throw failure('DOCUMENT_CAPACITY','The original file exceeds the configured document capacity',413);
          const body=await readFile(filename);
          result=operations.importOriginalDocument({selectionId:one(value['selection-id'],'source-original','--selection-id'),
            ocid:value.ocid?one(value.ocid,'source-original'):undefined,documentId:value['document-id'],body,observation});
        } else if (command==='source-document') {
          const original=operations.document(need(value['document-id'],'--document-id'),{sha256:value.sha256});
          return output(original.body,need(value.out,'--out'),true);
        } else if (command==='source-export') result=await operations.exportDirectory(need(value.directory,'--directory'),{ocids:value.ocid});
        else if (command==='source-receive') result=await operations.receiveHandoff(need(value.directory,'--directory'),{expectedRevision});
        else result=operations.receiving(need(value['package-id'],'--package-id'));
        break;
      }
      case 'init': case 'status': result = workspace.view(); break;
      case 'import': {
        const original = await sourceFile(need(value.file, '--file'));
        result = workspace.importDocument(original.document, { rawBytes: original.bytes, label: value.label || value.file, url: value.url }, expectedRevision); break;
      }
      case 'capture': case 'resume': {
        const spec = command === 'resume' ? { captureId: need(value['capture-id'], '--capture-id') } : {
          kind: value.kind || 'releases', ocid: value.ocid ? one(value.ocid, 'capture') : undefined,
          noticeId: value['notice-id'], updatedFrom: value['updated-from'], updatedTo: value['updated-to'],
          stages: value.stages, limit: integer(value.limit, '--limit', 100)
        };
        result = await captureFindTender(workspace, spec, { onProgress: progress => process.stderr.write(JSON.stringify({ capture: progress }) + '\n') }); break;
      }
      case 'review': {
        const patch = { expectedRevision };
        for (const [flag, field] of [['disposition', 'disposition'], ['owner', 'owner'], ['next-action', 'nextAction'], ['note', 'note']])
          if (value[flag] !== undefined) patch[field] = value[flag];
        if (value.shortlist !== undefined) {
          if (!['true', 'false'].includes(value.shortlist)) throw failure('INVALID_SHORTLIST', '--shortlist must be true or false');
          patch.shortlisted = value.shortlist === 'true';
        }
        result = workspace.updateReview(one(value.ocid, 'review'), patch); break;
      }
      case 'compare': result = workspace.compare(need(value.before, '--before'), need(value.after, '--after')); break;
      case 'export': {
        const report = workspace.report({ ...selection, format: value.format || 'json' });
        return output(report.body, value.out, true);
      }
      case 'package': result = workspace.exportPackage(selection); break;
      case 'receive': {
        const original = await sourceFile(need(value.file, '--file'));
        result = workspace.receivePackage(original.document, { expectedRevision }); break;
      }
      case 'receiving': result = workspace.getReceiving(need(value['package-id'], '--package-id')); break;
      case 'merchant-prepare': {
        const module = await import('./merchant.mjs');
        const payment = value.payment ? (await sourceFile(value.payment)).document : undefined;
        result = await module.prepareMerchant(workspace, { ...selection, scope: value.scope || 'shortlist', expectedRevision,
          payment, origin: value.origin, path: value.path || '/procurement', name: value.name,
          defaultLimit: integer(value['default-limit'], '--default-limit', 10), maxLimit: integer(value['max-limit'], '--max-limit', 20) }); break;
      }
      case 'delivery-receive': {
        const module = await import('./merchant.mjs');
        result = await module.adoptDelivery(workspace, need(value.delivery, '--delivery'), { expectedRevision }); break;
      }
      default: throw failure('UNKNOWN_COMMAND', 'Unknown command ' + command + '; run ocds --help');
    }
    return output(result, value.out);
  } finally { workspace.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({ error: { code: error.code || 'OCDS_ERROR', message: error.message, ...(error.details ? { details: error.details } : {}) } }) + '\n');
    process.exitCode = 1;
  });
}
