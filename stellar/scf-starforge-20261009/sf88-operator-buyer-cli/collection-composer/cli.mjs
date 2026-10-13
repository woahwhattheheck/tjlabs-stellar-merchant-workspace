#!/usr/bin/env node
// MIT — Local authoring commands for the existing private collection store.
import { createReadStream, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { realpath, open } from 'node:fs/promises';
import { isAbsolute, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openCollections } from '../collections/model.mjs';
import { initializationBytes } from '../initialization.mjs';
import { openCollectionComposer, inspectCollectionCatalog } from './model.mjs';
import { fields, need } from './plan.mjs';
import { parsePlanPackage } from './package-format.mjs';
import { INPUT_UPLOAD_SCHEMA, INPUT_CHUNK_BYTES, INPUT_LIMITS, inputManifestJson,
  validateInputManifest, inputChunkLength } from './input-format.mjs';

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
  '  starforge buyer-collection-plans share-export --directory ABS --collection ID',
  '    --edition-sha256 SHA256 [--headers ABS_SELECTION_JSON]',
  '  starforge buyer-collection-plans share-receive --directory ABS --file ABS_PACKAGE_JSONL',
  '  starforge buyer-collection-plans share-list --directory ABS',
  '  starforge buyer-collection-plans share-show --directory ABS --package SHA256',
  '  starforge buyer-collection-plans share-file --directory ABS --package SHA256',
  '  starforge buyer-collection-plans adopt-review --directory ABS --package SHA256 --file ABS_BINDINGS_JSON',
  '  starforge buyer-collection-plans adopt --directory ABS --package SHA256 --file ABS_BINDINGS_JSON',
  '    --review-sha256 SHA256',
  '',
  '  starforge buyer-collection-plans input-import --directory ABS --kind catalog|body --file ABS [--name NAME]',
  '  starforge buyer-collection-plans input-list --directory ABS [--kind catalog|body] [--query TEXT]',
  '    [--offset N] [--limit N]',
  '  starforge buyer-collection-plans input-show --directory ABS --input SHA256',
  '  starforge buyer-collection-plans input-file --directory ABS --input SHA256',
  '  starforge buyer-collection-plans input-catalog --directory ABS --input SHA256',
  '',
  'Use an existing Request Collections directory. All output is JSON.',
  'Save keeps immutable plan revisions. Prepare retains one named period and its source inputs.',
  'Repeat the same prepare request to resume its original identity.',
  'Create joins that reviewed period to the original collection screen and CLI.',
  'Queue, approval, execution and recovery remain in the original buyer-collections command.',
  'Share exports retain catalog/body inputs and produce an actual portable file path.',
  'Receive can resume the same file. Review binds local operators, access and output paths.',
  'Adopt saves a new immutable plan; prepare/create/run remain explicit original commands.',
  'Input import retains actual catalog/body bytes with resumable chunks; use the returned input.path in a plan.',
].join('\n');
const MODES = {
  'input-import': ['--directory','--kind','--file'],
  'input-list': ['--directory'],
  'input-show': ['--directory','--input'],
  'input-file': ['--directory','--input'],
  'input-catalog': ['--directory','--input'],
  list: ['--directory'], show: ['--directory', '--id', '--revision'],
  save: ['--directory', '--file'], catalog: ['--file'],
  editions: ['--directory'], edition: ['--directory', '--collection'],
  prepare: ['--directory', '--id', '--revision', '--collection', '--name'],
  create: ['--directory', '--collection', '--edition-sha256', '--preview-sha256'],
  'share-export': ['--directory', '--collection', '--edition-sha256'],
  'share-receive': ['--directory', '--file'],
  'share-list': ['--directory'],
  'share-show': ['--directory', '--package'],
  'share-file': ['--directory', '--package'],
  'adopt-review': ['--directory', '--package', '--file'],
  adopt: ['--directory', '--package', '--file', '--review-sha256'],
};
const OPTIONAL = { 'share-export': ['--headers'], 'input-import':['--name'],
  'input-list':['--kind','--query','--offset','--limit'] };
const ADOPTION_FIELDS = ['planId', 'name', 'description', 'operatorBindings', 'requestBindings',
  'outputDirectory', 'deliveryParameter', 'deliveryValue'];
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
      need((MODES[mode].includes(key) || (OPTIONAL[mode] ?? []).includes(key)) && !Object.hasOwn(options, key), 'COLLECTION_AUTHORING_CLI_ARGUMENT');
      options[key] = value;
    }
  }
  need(MODES[mode].every(key => Object.hasOwn(options, key)), 'COLLECTION_AUTHORING_CLI_VALUE_REQUIRED');
  return { mode, options, values };
}
/** Read private local authoring input through the existing bounded reader. */
async function inputJson(path) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true })
      .decode(await initializationBytes(path, 1048576)));
  } catch (error) {
    if (error.code) throw error;
    need(false, 'COLLECTION_AUTHORING_JSON_INVALID');
  }
}

/** Stream and resume the same source package without buffering its complete body. */
export async function receiveCollectionPlanPackage(sharing, path) {
  need(typeof path === 'string' && isAbsolute(path) && resolve(path) === path
    && !path.includes('\0'), 'COLLECTION_PACKAGE_FILE_PATH_REQUIRED');
  const source = createReadStream(path, { highWaterMark: 65536 });
  let status, complete = false;
  const received = new Map(), sizes = new Map();
  try {
    for await (const record of parsePlanPackage(source)) {
      if (record.type === 'manifest') {
        status = await sharing.receiveManifest({ manifest: record.manifest });
        for (const object of status.objects) {
          received.set(object.sha256, object.receivedBytes); sizes.set(object.sha256, object.bytes);
        }
      } else if (record.type === 'object') {
        need(status && received.has(record.sha256), 'COLLECTION_PACKAGE_OBJECT_UNKNOWN');
        const size = Buffer.from(record.base64, 'base64').length;
        const offset = received.get(record.sha256);
        // Every record is still validated by the shared parser when its saved chunk is skipped.
        if (record.offset + size <= offset) continue;
        need(record.offset === offset, 'COLLECTION_PACKAGE_RESUME_OFFSET_CHANGED');
        const receipt = await sharing.receiveChunk({ packageSha256: status.packageSha256,
          objectSha256: record.sha256, offset: record.offset, base64: record.base64 });
        need(receipt.packageSha256 === status.packageSha256 && receipt.objectSha256 === record.sha256
          && receipt.bytes === sizes.get(record.sha256) && Number.isSafeInteger(receipt.receivedBytes)
          && receipt.receivedBytes >= record.offset + size && receipt.receivedBytes <= receipt.bytes,
        'COLLECTION_PACKAGE_RECEIPT_CHANGED');
        received.set(record.sha256, receipt.receivedBytes);
      } else if (record.type === 'complete') {
        need(status?.packageSha256 === record.packageSha256, 'COLLECTION_PACKAGE_IDENTITY_CHANGED');
        complete = true;
      }
    }
    // Exhaust the parser before accepting completion: trailing or truncated records must fail.
    need(complete && status, 'COLLECTION_PACKAGE_INCOMPLETE');
    return await sharing.finishReceiving({ packageSha256: status.packageSha256 });
  } finally {
    source.destroy();
  }
}

/** Retain public local source bytes through bounded chunks from one held regular file. */
export async function importCollectionInput(inputs,{path,kind,name}) {
  need(typeof path==='string' && isAbsolute(path) && resolve(path)===path && !path.includes('\0')
    && await realpath(path)===path,'COLLECTION_INPUT_FILE_PATH_REQUIRED');
  need(Object.hasOwn(INPUT_LIMITS,kind),'COLLECTION_INPUT_KIND_INVALID');
  const file=await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before=await file.stat();
    need(before.isFile() && Number.isSafeInteger(before.size) && before.size<=INPUT_LIMITS[kind]
      && before.size>=(kind==='catalog'?1:0),'COLLECTION_INPUT_SIZE_INVALID');
    const digest=value=>createHash('sha256').update(value).digest('hex');
    const unchanged=async()=>{
      const after=await file.stat();
      need(before.dev===after.dev && before.ino===after.ino && before.size===after.size
        && before.mtimeMs===after.mtimeMs && before.ctimeMs===after.ctimeMs,'COLLECTION_INPUT_FILE_CHANGED');
    };
    async function part(index,length) {
      const bytes=Buffer.alloc(length); let read=0;
      while(read<length) {
        const result=await file.read(bytes,read,length-read,index*INPUT_CHUNK_BYTES+read);
        need(result.bytesRead>0,'COLLECTION_INPUT_FILE_CHANGED'); read+=result.bytesRead;
      }
      return bytes;
    }
    const chunkSha256=[];
    for(let offset=0,index=0;offset<before.size;offset+=INPUT_CHUNK_BYTES,index++)
      chunkSha256.push(digest(await part(index,Math.min(INPUT_CHUNK_BYTES,before.size-offset))));
    await unchanged();
    const manifest=validateInputManifest({schema:INPUT_UPLOAD_SCHEMA,kind,name:name??basename(path),
      bytes:before.size,chunkSha256});
    const uploadId=digest(inputManifestJson(manifest));
    const status=await inputs.begin({manifest});
    need(status.uploadId===uploadId && Array.isArray(status.receivedChunks),'COLLECTION_INPUT_RECEIPT_CHANGED');
    const received=new Set(status.receivedChunks);
    need(received.size===status.receivedChunks.length && [...received].every(index=>
      Number.isSafeInteger(index) && index>=0 && index<manifest.chunkSha256.length),
      'COLLECTION_INPUT_RECEIPT_CHANGED');
    for(let index=0;index<manifest.chunkSha256.length;index++) {
      if(received.has(index)) continue;
      const bytes=await part(index,inputChunkLength(manifest,index));
      need(digest(bytes)===manifest.chunkSha256[index],'COLLECTION_INPUT_FILE_CHANGED');
      const receipt=await inputs.receiveChunk({uploadId,index,source:bytes});
      need(receipt.uploadId===uploadId && receipt.index===index && receipt.bytes===bytes.length
        && receipt.sha256===manifest.chunkSha256[index],'COLLECTION_INPUT_RECEIPT_CHANGED');
    }
    await unchanged();
    const completed=await inputs.complete({uploadId});
    need(completed.uploadId===uploadId && completed.phase==='READY' && completed.input?.id===uploadId,
      'COLLECTION_INPUT_RECEIPT_CHANGED');
    return completed;
  } finally {await file.close();}
}
function integerOption(value,fallback) {
  if(value===undefined)return fallback;
  need(/^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value)),
    'COLLECTION_INPUT_LIST_INVALID');
  return Number(value);
}

export async function runCollectionComposerCommand(args) {
  const { mode, options, values } = readCollectionComposerArguments(args);
  if (mode === 'help') return { help: HELP };
  if (mode === 'catalog') return inspectCollectionCatalog({ path: options['--file'] });
  const collections = await openCollections({ directory: options['--directory'], existingOnly: true });
  const composer = openCollectionComposer({ collections });
  try {
    if (mode === 'input-import') return await importCollectionInput(composer.inputs,
      {path:options['--file'],kind:options['--kind'],name:options['--name']});
    if (mode === 'input-list') return await composer.inputs.list({kind:options['--kind'],
      query:options['--query']??'',offset:integerOption(options['--offset'],0),limit:integerOption(options['--limit'],50)});
    if (mode === 'input-show') return await composer.inputs.inspect({uploadId:options['--input']});
    if (mode === 'input-file') return await composer.inputs.file({uploadId:options['--input']});
    if (mode === 'input-catalog') return await composer.inputs.catalog({uploadId:options['--input']});
    if (mode === 'list') return await composer.listPlans();
    if (mode === 'show') return await composer.inspectPlan(options['--id'], options['--revision']);
    if (mode === 'save') {
      const input = await inputJson(options['--file']);
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
    if (mode === 'share-export') {
      const headerSelections = options['--headers'] === undefined ? undefined
        : await inputJson(options['--headers']);
      need(headerSelections === undefined || Array.isArray(headerSelections),
        'COLLECTION_PACKAGE_HEADER_SELECTION_INVALID');
      return await composer.sharing.exportPackage({ collectionId: options['--collection'],
        expectedEditionSha256: options['--edition-sha256'],
        ...(headerSelections === undefined ? {} : { headerSelections }) });
    }
    if (mode === 'share-receive')
      return await receiveCollectionPlanPackage(composer.sharing, options['--file']);
    if (mode === 'share-list') return await composer.sharing.listPackages();
    if (mode === 'share-show')
      return await composer.sharing.inspectPackage({ packageSha256: options['--package'] });
    if (mode === 'share-file')
      return await composer.sharing.packageFile({ packageSha256: options['--package'] });
    if (mode === 'adopt-review' || mode === 'adopt') {
      const bindings = fields(await inputJson(options['--file']), ADOPTION_FIELDS,
        'COLLECTION_ADOPTION_BINDINGS_FIELDS_INVALID');
      const input = { ...bindings, packageSha256: options['--package'] };
      if (mode === 'adopt-review') return await composer.sharing.reviewAdoption(input);
      return await composer.sharing.adoptPlan({ ...input,
        expectedReviewSha256: options['--review-sha256'] });
    }
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
