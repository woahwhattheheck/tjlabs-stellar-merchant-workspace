// MIT. Retained current-publication operations over the original native economic project.
import { constants, createWriteStream } from 'node:fs';
import { open, readdir, link, unlink, realpath, lstat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { privateDirectory, atomicJson, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { need, operationId } from '../model.mjs';
import { canonicalJSONChunks, canonicalJSONDigest } from '../canonical-stream.mjs';
import { readFredProject, getFredDdpPackage, getFredDdpCrosswalk, downloadFredDdpMigration, receiveFredProject } from '../project.mjs';
import { FRED_DDP_PROJECT_BUNDLE_MAX_BYTES } from './project-validation.mjs';
import { runFredDdpPublishedProgramme } from './published-cli.mjs';
import { createFredPublishedSourceCaptures } from './published-source.mjs';
import { readFredDdpCurrentPublicationComparison } from './published-comparison.mjs';

export const FRED_PUBLISHED_OPERATION = 'stellar-forge.fred-ddp-publication-operation.v1';
export const FRED_PUBLISHED_EDITION = 'stellar-forge.fred-ddp-publication-edition.v1';
export const FRED_PUBLISHED_STATUSES = Object.freeze(['EQUAL','DIFFERENT','BOTH_MISSING','MISSING_CHANGED','SOURCE_ONLY','TARGET_ONLY']);
export const FRED_PUBLISHED_CHUNK_BYTES = 192 * 1024;
const active = new Set(), reports = new Map();
const stamp = info => [info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs].join(':');
const media = name => name.endsWith('.tar.gz') ? 'application/gzip' : name.endsWith('.csv') ? 'text/csv; charset=utf-8'
  : name.endsWith('.jsonl') ? 'application/x-ndjson' : name.endsWith('.html') ? 'text/html; charset=utf-8'
  : name.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream';
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  need(Number.isSafeInteger(value) && value >= minimum && value <= maximum, 'Choose a valid ' + label + '.'); return value;
}
function portable(value) {
  need(typeof value === 'string' && value.length > 0 && value.length <= 240 &&
    /^[A-Za-z0-9._/-]+$/.test(value) && !isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..'),
    'Keep the complete original file under its relative edition path.');
  return value;
}
function under(directory, name) {
  portable(name); const path = resolve(directory,name);
  need(relative(resolve(directory),path) && !relative(resolve(directory),path).startsWith('..'), 'Choose a file in this original edition.');
  return path;
}
const rootFor = (directory,id) => join(resolve(directory),'ddp-publications',operationId(id));
async function optional(path, max = 1024 * 1024) {
  try { return await readPrivateJson(path,max); } catch(error) { if(error.code === 'ENOENT') return null; throw error; }
}
async function fileHandle(path, expected) {
  const file = await open(path,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    need(info.isFile(), 'Read a complete retained original file.');
    if(expected) need(info.size === expected.bytes && (!expected.stamp || stamp(info) === expected.stamp),
      'The retained publication file changed; reopen its original edition.', 'FRED_PUBLISHED_FILE_CHANGED',409);
    return { file, info };
  } catch(error) { await file.close(); throw error; }
}
async function originalJson(path,maximum) {
  const {file,info} = await fileHandle(path);
  try {
    need(info.size <= maximum,'The complete original manifest exceeds its source capacity.');
    const bytes = await file.readFile();
    need(bytes.length === info.size && stamp(await file.stat()) === stamp(info),'The original manifest changed while it was read.');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } finally { await file.close(); }
}
async function optionalOriginal(path,maximum) {
  try { return await originalJson(path,maximum); } catch(error) { if(error.code === 'ENOENT') return null; throw error; }
}
async function describe(path,name) {
  const {file,info} = await fileHandle(path); const digest = createHash('sha256'); let bytes = 0;
  try { for await(const chunk of file.createReadStream({autoClose:false})) { digest.update(chunk); bytes += chunk.length; }
    need(bytes === info.size && stamp(await file.stat()) === stamp(info), 'The original publication file changed while it was read.');
    return { name:portable(name), bytes, sha256:digest.digest('hex'), contentType:media(name), stamp:stamp(info), path };
  } finally { await file.close(); }
}
async function exactJson(path,value) {
  await privateDirectory(dirname(path));
  const wanted = canonicalJSONDigest(value);
  try {
    const current = await describe(path,'original.json');
    need(current.sha256 === wanted, 'The original publication input changed.', 'FRED_PUBLISHED_INPUT_CONFLICT',409); return current;
  } catch(error) { if(error.code !== 'ENOENT') throw error; }
  const temporary = path + '.' + randomUUID() + '.part';
  try {
    await pipeline(Readable.from(canonicalJSONChunks(value)),createWriteStream(temporary,{flags:'wx',mode:0o600}));
    try { await link(temporary,path); }
    catch(error) { if(error.code !== 'EEXIST') throw error; const current = await describe(path,'original.json');
      need(current.sha256 === wanted, 'The original publication input changed concurrently.', 'FRED_PUBLISHED_INPUT_CONFLICT',409); }
  } finally { await unlink(temporary).catch(error => { if(error.code !== 'ENOENT') throw error; }); }
}
function publicFile({path,stamp,...value}) { return value; }
function requestValue(value) {
  need(value?.schema === FRED_PUBLISHED_OPERATION && typeof value.projectId === 'string' &&
    /^fred-ddp-migration-plan-[a-f0-9]{64}$/.test(value.migrationId) && ['collect','retained'].includes(value.mode),
    'Read the original complete publication request.');
  operationId(value.id); integer(value.expectedRevision,'original project revision',1);
  const {requestSha256,...core} = value;
  need(sha(requestSha256) && canonicalJSONDigest(core) === requestSha256, 'The retained publication request identity changed.');
  portable(value.output); portable(value.manifest);
  return value;
}
async function record(directory,id) {
  const project = await readFredProject(directory), root = rootFor(directory,id);
  const request = requestValue(await readPrivateJson(join(root,'request.json'),131072));
  need(request.id === id && request.projectId === project.id, 'Reopen this publication with its original project.', 'FRED_PUBLISHED_PROJECT_CHANGED',409);
  const complete = await optional(join(root,'complete.json'),16 * 1024 * 1024);
  if(complete) need(complete.requestSha256 === request.requestSha256 && complete.result?.projectId === project.id &&
    Array.isArray(complete.files), 'The completed publication lost its original request or project.');
  return {project,root,request,complete};
}
function operationView({project,request,complete,progress},directory) {
  const running = active.has(rootFor(directory,request.id));
  return {schema:FRED_PUBLISHED_OPERATION,projectId:project.id,revision:project.revision,id:request.id,
    requestSha256:request.requestSha256,migrationId:request.migrationId,mode:request.mode,createdAt:request.createdAt,
    state:complete ? 'COMPLETE' : running ? 'RUNNING' : progress?.state === 'FAILED' ? 'FAILED' : 'INTERRUPTED',
    progress:progress ?? null,result:complete?.result ?? null,comparisonId:complete?.result?.comparisonId ?? null,
    files:complete?.files.map(publicFile) ?? [],expectedRevision:request.expectedRevision};
}
export async function readFredDdpPublicationOperation({directory,id} = {}) {
  const saved = await record(directory,id);
  return operationView({...saved,progress:await optional(join(saved.root,'progress.json'),131072)},directory);
}
export async function listFredDdpPublicationOperations({directory,offset = 0,limit = 100} = {}) {
  integer(offset,'publication offset'); integer(limit,'publication page size',1,500);
  const project = await readFredProject(directory); let names;
  try { names = await readdir(join(resolve(directory),'ddp-publications')); }
  catch(error) { if(error.code === 'ENOENT') names = []; else throw error; }
  const entries = [];
  for(const name of names.sort()) {
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(name)) continue;
    const request = await optional(join(rootFor(directory,name),'request.json'),131072);
    if(request) entries.push({name,createdAt:request.createdAt});
  }
  entries.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
  const selected = entries.slice(offset,offset + limit), items = [];
  for(const entry of selected) {
    const value = await readFredDdpPublicationOperation({directory,id:entry.name});
    const {files,progress,...summary} = value;
    items.push({...summary,fileCount:files.length,progress:progress?.step ?? progress?.state ?? null});
  }
  return {projectId:project.id,revision:project.revision,total:entries.length,offset,limit,
    nextOffset:offset + items.length < entries.length ? offset + items.length : null,items};
}
async function originalInputs(directory,migrationId) {
  const file = await downloadFredDdpMigration({directory,migrationId});
  const plan = JSON.parse(file.body.toString('utf8'));
  const packageCapture = await getFredDdpPackage({directory,packageId:plan.packageId});
  const crosswalk = await getFredDdpCrosswalk({directory,crosswalkId:plan.crosswalkId});
  need(plan.summary.ready && plan.acquisitions.length, 'Save a complete ready migration before opening a current publication.');
  return {plan,packageCapture,crosswalk};
}
async function prepare({directory,id,expectedRevision,migrationId,retained}) {
  directory = resolve(directory); operationId(id);
  const project = await readFredProject(directory), root = await privateDirectory(rootFor(directory,id));
  const saved = await optional(join(root,'request.json'),131072);
  if(saved) {
    requestValue(saved);
    need(saved.projectId === project.id && saved.id === id && saved.migrationId === migrationId &&
      saved.expectedRevision === expectedRevision,
      'Resume the original publication request and project revision.', 'FRED_PUBLISHED_REQUEST_CONFLICT',409);
    return {root,request:saved};
  }
  integer(expectedRevision,'original project revision',1);
  need(project.revision === expectedRevision && !project.pending,
    'Read the current project and resume its original pending action first.', 'FRED_PROJECT_REVISION_CHANGED',409);
  need((project.ddpMigrations ?? []).some(item => item.id === migrationId), 'Choose a migration saved in this original project.');
  const inputs = await originalInputs(directory,migrationId);
  const inputDirectory = await privateDirectory(join(root,'inputs'));
  await exactJson(join(inputDirectory,'package.json'),inputs.packageCapture);
  await exactJson(join(inputDirectory,'crosswalk.json'),inputs.crosswalk);
  await exactJson(join(inputDirectory,'plan.json'),inputs.plan);
  const workspace = retained ? await realpath(resolve(retained.workspace)) : root;
  need((await lstat(workspace)).isDirectory(),'Open the original completed programme directory.');
  const output = portable(retained?.output ?? 'current-publication'), manifest = portable(retained?.manifest ?? 'published-targets/manifest.json');
  const core = {schema:FRED_PUBLISHED_OPERATION,id,projectId:project.id,expectedRevision,migrationId,
    mode:retained ? 'retained' : 'collect',workspace,output,manifest,createdAt:new Date().toISOString()};
  const request = {...core,requestSha256:canonicalJSONDigest(core)};
  await atomicJson(root,'request.json',request,{exclusive:true});
  return {root,request};
}
function progressWriter(root) {
  let pending = Promise.resolve(), tail = '', latest = null, last = 0;
  const save = value => { latest = {...value,updatedAt:new Date().toISOString()};
    pending = pending.then(() => atomicJson(root,'progress.json',latest)); pending.catch(() => {}); };
  return {write(chunk) {
    tail += String(chunk); if(tail.length > 131072) tail = tail.slice(-65536);
    let split;
    while((split = tail.indexOf('\n')) >= 0) {
      const line = tail.slice(0,split); tail = tail.slice(split + 1); let value;
      try { value = JSON.parse(line); } catch { value = {step:'native-programme',message:line.slice(0,4000)}; }
      if(Date.now() - last > 750) { last = Date.now(); save({state:'RUNNING',...value}); }
    }
    return true;
  },save,async flush() { await pending; }};
}
function tarHeader(name,size) {
  portable(name); need(size < 0o77777777777, 'This original file exceeds the portable archive member capacity.');
  const header = Buffer.alloc(512), split = name.lastIndexOf('/');
  let base = name, prefix = '';
  if(Buffer.byteLength(base) > 100) { need(split > 0,'Use a portable edition filename.'); prefix = name.slice(0,split); base = name.slice(split + 1); }
  need(Buffer.byteLength(base) <= 100 && Buffer.byteLength(prefix) <= 155,'Use a portable edition member path.');
  const field = (value,at,length) => Buffer.from(value).copy(header,at,0,length);
  const octal = (value,at,length) => field(value.toString(8).padStart(length - 1,'0') + '\0',at,length);
  field(base,0,100); octal(0o600,100,8); octal(0,108,8); octal(0,116,8); octal(size,124,12); octal(0,136,12);
  header.fill(32,148,156); header[156] = 48; field('ustar\0',257,6); field('00',263,2); field(prefix,345,155);
  let sum = 0; for(const byte of header) sum += byte;
  field(sum.toString(8).padStart(6,'0') + '\0 ',148,8); return header;
}
async function archive(root,files) {
  const path = join(root,'edition-package.tar.gz'), temporary = path + '.' + randomUUID() + '.part';
  try {
    async function* members() {
      for(const entry of files) {
        const {file} = await fileHandle(entry.path,entry);
        try {
          yield tarHeader(entry.name,entry.bytes); let size = 0; const digest = createHash('sha256');
          for await(const chunk of file.createReadStream({autoClose:false})) { size += chunk.length; digest.update(chunk); yield chunk; }
          need(size === entry.bytes && digest.digest('hex') === entry.sha256 && stamp(await file.stat()) === entry.stamp,
            'The original archive member changed.');
          if(size % 512) yield Buffer.alloc(512 - size % 512);
        } finally { await file.close(); }
      }
      yield Buffer.alloc(1024);
    }
    await pipeline(Readable.from(members()),createGzip({level:6}),createWriteStream(temporary,{flags:'wx',mode:0o600}));
    try { await link(temporary,path); }
    catch(error) { if(error.code !== 'EEXIST') throw error;
      const old = await describe(path,'edition-package.tar.gz'), fresh = await describe(temporary,'edition-package.tar.gz');
      need(old.sha256 === fresh.sha256,'The complete retained edition archive changed.', 'FRED_PUBLISHED_OUTPUT_CONFLICT',409); }
  } finally { await unlink(temporary).catch(error => { if(error.code !== 'ENOENT') throw error; }); }
  return describe(path,'edition-package.tar.gz');
}
async function finish(directory,root,request,summary,progress) {
  const inputs = await originalInputs(directory,request.migrationId);
  const manifest = await originalJson(under(request.workspace,request.manifest),64 * 1024 * 1024);
  const outputDirectory = under(request.workspace,request.output);
  progress.save({state:'RUNNING',step:'opening-complete-original-comparison'}); await progress.flush();
  const report = await readFredDdpCurrentPublicationComparison(join(outputDirectory,'comparison'),
    {...inputs,manifest,directory:request.workspace});
  need(report && report.id === summary.comparisonId && summary.projectId === request.projectId,
    'The completed programme belongs to this original project and current publication.', 'FRED_PUBLISHED_PROJECT_CHANGED',409);
  const expectedCaptureIds = (await createFredPublishedSourceCaptures({directory:request.workspace,manifest,batchSize:10})).map(item => item.captureSha256);
  const bundle = await originalJson(join(outputDirectory,'original-project-with-current-publications.json'),FRED_DDP_PROJECT_BUNDLE_MAX_BYTES);
  need(summary.schema === 'tjlabs.scf-fred-ddp-current-published-programme.v1' && bundle.state?.id === request.projectId &&
    bundle.bundleSha256 === summary.bundleSha256 && summary.captureCount === expectedCaptureIds.length &&
    summary.observations === manifest.observationCount &&
    expectedCaptureIds.every(id => (bundle.captures ?? []).some(item => item.captureSha256 === id)) &&
    (bundle.ddpPackages ?? []).some(item => item.id === inputs.packageCapture.id && item.captureSha256 === inputs.packageCapture.captureSha256) &&
    (bundle.ddpCrosswalks ?? []).some(item => item.id === inputs.crosswalk.id && item.captureSha256 === inputs.crosswalk.captureSha256) &&
    (bundle.ddpMigrations ?? []).some(item => item.id === inputs.plan.id),
    'The complete native snapshot belongs to this original project, source population and programme result.',
    'FRED_PUBLISHED_PROJECT_CHANGED',409);
  await receiveFredProject({directory:join(root,'received-project'),bundle});
  const files = [], names = new Set();
  const add = async (path,name,expected) => {
    portable(name); need(!names.has(name),'The complete edition file inventory repeats a path.'); names.add(name);
    const entry = await describe(path,name);
    if(expected) need(entry.bytes === expected.bytes && entry.sha256 === expected.sha256,'The retained original file differs from its native descriptor.');
    files.push(entry);
  };
  for(const name of ['package.json','crosswalk.json','plan.json']) await add(join(root,'inputs',name),'inputs/' + name);
  await add(under(request.workspace,request.manifest),request.manifest);
  for(const capture of manifest.captures) for(const original of capture.files)
    await add(under(request.workspace,original.path),original.path,original);
  for(const original of report.files) await add(join(outputDirectory,'comparison',portable(original.name)),request.output + '/comparison/' + original.name,original);
  for(const name of ['comparison.json','report.html']) await add(join(outputDirectory,'comparison',name),request.output + '/comparison/' + name);
  for(const name of ['programme-summary.json','original-project-with-current-publications.json'])
    await add(join(outputDirectory,name),request.output + '/' + name);
  const edition = {schema:FRED_PUBLISHED_EDITION,operationId:request.id,projectId:request.projectId,migrationId:request.migrationId,
    result:summary,sourceMode:'PUBLIC_TABLE',timeBasis:'PUBLIC_TABLE_RETRIEVAL_DATE',
    programme:{packagePath:'inputs/package.json',crosswalkPath:'inputs/crosswalk.json',planPath:'inputs/plan.json',
      manifestPath:request.manifest,output:request.output,project:'retained-project',receive:'received-project'},
    files:files.map(publicFile)};
  await exactJson(join(root,'edition.json'),edition); await add(join(root,'edition.json'),'edition.json');
  progress.save({state:'RUNNING',step:'packing-complete-edition',files:files.length}); await progress.flush();
  files.push(await archive(root,files));
  const complete = {schema:FRED_PUBLISHED_EDITION,requestSha256:request.requestSha256,
    finishedAt:new Date().toISOString(),result:summary,files};
  await atomicJson(root,'complete.json',complete,{exclusive:true});
  reports.set(root,{report,stamp:files.find(file => file.name === request.output + '/comparison/comparison.json').stamp});
  progress.save({state:'COMPLETE',step:'complete',comparisonId:report.id,files:files.length}); await progress.flush();
  return readFredDdpPublicationOperation({directory,id:request.id});
}
/** HTTP starts acknowledge only after retaining the immutable original request. */
export async function runFredDdpPublicationOperation({directory,id,expectedRevision,migrationId,signal,onRetained,retained} = {}) {
  directory = resolve(directory); const root = await privateDirectory(rootFor(directory,id));
  return withPrivateLock(root,'publication.lock',async () => {
    const prepared = await prepare({directory,id,expectedRevision,migrationId,retained});
    const saved = await record(directory,id);
    if(saved.complete) { const value = await readFredDdpPublicationOperation({directory,id}); onRetained?.(value); return value; }
    active.add(root); const progress = progressWriter(root);
    try {
      progress.save({state:'RUNNING',step:prepared.request.mode === 'retained' ? 'opening-original-programme' : 'collecting-original-publications'});
      await progress.flush(); onRetained?.(await readFredDdpPublicationOperation({directory,id}));
      signal?.throwIfAborted();
      let summary = await optionalOriginal(join(under(prepared.request.workspace,prepared.request.output),'programme-summary.json'),4 * 1024 * 1024);
      if(!summary) {
        need(prepared.request.mode === 'collect', 'Finish the original retained programme before attaching its completed customer edition.');
        summary = await runFredDdpPublishedProgramme({workspace:root,packagePath:'inputs/package.json',crosswalkPath:'inputs/crosswalk.json',
          planPath:'inputs/plan.json',manifestPath:prepared.request.manifest,project:directory,
          receive:join(root,'received-project'),output:prepared.request.output,collect:true,intake:'published-targets',
          stdout:progress,stderr:progress,signal});
      }
      signal?.throwIfAborted();
      return await finish(directory,root,prepared.request,summary,progress);
    } catch(error) {
      await progress.flush().catch(() => {});
      await atomicJson(root,'progress.json',{state:'FAILED',step:'resume-original-operation',updatedAt:new Date().toISOString(),
        code:error.code ?? 'FRED_PUBLISHED_OPERATION_FAILED',message:String(error.message).slice(0,4000)}).catch(() => {});
      throw error;
    } finally { active.delete(root); }
  });
}
/** Local hosts attach an existing complete acquisition without collecting another edition. */
export function attachFredDdpPublishedProgramme({directory,id,expectedRevision,migrationId,workspace,output = 'current-publication',
  manifest = 'published-targets/manifest.json',signal,onRetained} = {}) {
  return runFredDdpPublicationOperation({directory,id,expectedRevision,migrationId,signal,onRetained,retained:{workspace,output,manifest}});
}
async function opened(directory,id) {
  const saved = await record(directory,id); need(saved.complete,'Finish this original publication operation before reading its report.','FRED_PUBLISHED_INCOMPLETE',409);
  const entry = saved.complete.files.find(file => file.name === saved.request.output + '/comparison/comparison.json');
  need(entry,'The completed edition retains its complete native comparison.');
  const {file,info} = await fileHandle(entry.path,entry); await file.close();
  let cached = reports.get(saved.root);
  if(!cached || cached.stamp !== stamp(info)) {
    const inputs = await originalInputs(directory,saved.request.migrationId);
    const manifest = await originalJson(under(saved.request.workspace,saved.request.manifest),64 * 1024 * 1024);
    const report = await readFredDdpCurrentPublicationComparison(join(under(saved.request.workspace,saved.request.output),'comparison'),
      {...inputs,manifest,directory:saved.request.workspace});
    need(report?.id === saved.complete.result.comparisonId,'The completed native report changed.');
    cached = {report,stamp:stamp(info)}; reports.set(saved.root,cached);
  }
  return {...saved,report:cached.report};
}
export async function readFredDdpPublicationReport({directory,id,offset = 0,limit = 100,query = ''} = {}) {
  integer(offset,'series offset'); integer(limit,'series page size',1,500);
  need(typeof query === 'string' && query.length <= 500,'Choose a series query of at most 500 characters.');
  const {project,request,report,complete} = await opened(directory,id), needle = query.toLowerCase();
  const series = report.series.filter(item => !needle || [item.sourceSeriesId,item.boardSeriesId,item.fredSeriesId,item.title].join(' ').toLowerCase().includes(needle));
  const rows = series.slice(offset,offset + limit), {series:_,rowIndex,files,...context} = report;
  return {projectId:project.id,revision:project.revision,operationId:id,requestSha256:request.requestSha256,...context,
    total:series.length,offset,limit,nextOffset:offset + rows.length < series.length ? offset + rows.length : null,query,rows,
    files:complete.files.map(publicFile)};
}
async function* indexedRows(file,checkpoint,end) {
  const buffer = Buffer.alloc(65536), decoder = new TextDecoder('utf-8',{fatal:true});
  let position = checkpoint.byte, expected = checkpoint.row, tail = '';
  while(expected < end) {
    const {bytesRead} = await file.read(buffer,0,buffer.length,position);
    need(bytesRead > 0,'The retained original row file ended before its indexed series.');
    position += bytesRead; tail += decoder.decode(buffer.subarray(0,bytesRead),{stream:true});
    let from = 0, newline;
    while((newline = tail.indexOf('\n',from)) >= 0) {
      const item = JSON.parse(tail.slice(from,newline)); from = newline + 1;
      need(item.index === expected++,'The retained row index changed.');
      yield item; if(expected >= end) return;
    }
    tail = tail.slice(from);
  }
}
export async function pageFredDdpPublicationRows({directory,id,comparisonId,offset = 0,limit = 100,seriesId = null,status = null} = {}) {
  integer(offset,'original row offset'); integer(limit,'row page size',1,500);
  need(status === null || FRED_PUBLISHED_STATUSES.includes(status),'Choose an original comparison status.');
  const saved = await opened(directory,id), report = saved.report;
  need(comparisonId === report.id,'Continue the same original comparison identity.','FRED_PUBLISHED_REPORT_CHANGED',409);
  need(seriesId === null || report.series.some(item => item.sourceSeriesId === seriesId),'Choose an original source series.');
  let row = 0; const spans = [];
  for(const item of report.series) {
    const count = FRED_PUBLISHED_STATUSES.reduce((sum,key) => sum + item.counts[key],0);
    if((seriesId === null || item.sourceSeriesId === seriesId) && (status === null || item.counts[status] > 0))
      spans.push({start:row,end:row + count,matches:status === null ? count : item.counts[status]});
    row += count;
  }
  const total = spans.reduce((sum,item) => sum + item.matches,0), rows = [];
  const entry = saved.complete.files.find(file => file.name === saved.request.output + '/comparison/observations.jsonl');
  need(entry,'The complete original row file is retained.');
  const {file} = await fileHandle(entry.path,entry); let cursor = offset;
  try {
    for(const span of spans) {
      if(span.end <= cursor) continue;
      const from = Math.max(cursor,span.start);
      let low = 0,high = report.rowIndex.rows.length;
      while(low < high) { const middle = (low + high) >>> 1; if(report.rowIndex.rows[middle].row <= from) low = middle + 1; else high = middle; }
      const checkpoint = report.rowIndex.rows[Math.max(0,low - 1)];
      need(checkpoint,'The original report retains its sparse row index.');
      for await(const item of indexedRows(file,checkpoint,span.end)) {
        if(item.index < from) continue;
        cursor = item.index + 1;
        if(status === null || item.status === status) rows.push(item);
        if(rows.length === limit) break;
      }
      if(rows.length === limit) break;
      cursor = span.end;
    }
  } finally { await file.close(); }
  const nextSpan = spans.find(span => span.end > cursor);
  return {projectId:saved.project.id,operationId:id,comparisonId:report.id,seriesId,status,total,offset,limit,
    nextOffset:nextSpan ? Math.max(cursor,nextSpan.start) : null,rows,
    sourceLocationBasis:report.sourceLocationBasis,differenceBasis:report.differenceBasis};
}
export async function openFredDdpPublicationFile({directory,id,name,expectedSha256} = {}) {
  const saved = await record(directory,id); need(saved.complete,'Finish this original publication before downloading its files.','FRED_PUBLISHED_INCOMPLETE',409);
  const descriptor = saved.complete.files.find(file => file.name === name);
  need(descriptor,'Choose a complete original file listed in this edition.','FRED_PUBLISHED_FILE_NOT_FOUND',404);
  need(expectedSha256 === descriptor.sha256,'Download the exact listed original file.','FRED_PUBLISHED_FILE_CHANGED',409);
  const {file} = await fileHandle(descriptor.path,descriptor);
  return {file,descriptor:publicFile(descriptor),projectId:saved.project.id,operationId:id};
}
export async function readFredDdpPublicationFileChunk({directory,id,name,expectedSha256,offset = 0,limit = FRED_PUBLISHED_CHUNK_BYTES} = {}) {
  integer(offset,'file byte offset'); integer(limit,'file chunk size',1,FRED_PUBLISHED_CHUNK_BYTES);
  const selected = await openFredDdpPublicationFile({directory,id,name,expectedSha256});
  try {
    need(offset <= selected.descriptor.bytes,'Choose a byte offset in this original file.');
    const body = Buffer.alloc(Math.min(limit,selected.descriptor.bytes - offset)); let count = 0;
    while(count < body.length) {
      const result = await selected.file.read(body,count,body.length - count,offset + count);
      need(result.bytesRead > 0,'The retained original file ended before its complete bytes.'); count += result.bytesRead;
    }
    return {projectId:selected.projectId,operationId:id,file:selected.descriptor,offset,bytes:body.length,
      nextOffset:offset + body.length < selected.descriptor.bytes ? offset + body.length : null,encoding:'base64',
      base64:body.toString('base64'),chunkSha256:createHash('sha256').update(body).digest('hex')};
  } finally { await selected.file.close(); }
}
