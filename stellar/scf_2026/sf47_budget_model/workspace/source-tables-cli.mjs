#!/usr/bin/env node
// MIT. Headless source-table authoring uses the original Python planning writer.
import {readFile, mkdir, open, link, unlink} from 'node:fs/promises';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash, randomUUID} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {receivePlanningFile} from '../../../../stellar-forge/developer-site/dist/grant-plan-source.mjs';
import {
  importPlanningBook, serializePlanningBook, planningBookFromNative, addPlanningTable,
  receivePlanningEdition, retainPlanningTableReview, changePlanningMapping, rebasePlanningBook,
  requireCurrentBaseline, preparePlanningImport, completeNativePreview, acceptPlanningPreview,
  tableImportGuide, ROLES,
} from './source-tables-core.mjs';

const execute = promisify(execFile), HERE = dirname(fileURLToPath(import.meta.url));
const nativeCli = join(HERE, 'cli.py');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const MAX = 128 * 1024 * 1024;
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
const COMMANDS = {
  snapshot: ['workspace','plan','revision','python','output'],
  receive: ['project','role','file','delimiter','no-header','output'],
  configure: ['project','role','binding','table-mapping','output'],
  review: ['project','role','output'],
  rebase: ['project','workspace','plan','python','output'],
  preview: ['project','workspace','plan','python','output'],
  save: ['preview','workspace','python','note','request-id','output-directory'],
};
function need(value, message) { if (!value) throw new Error(message); }
function argumentsFor(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === 'help') return {command:'help'};
  need(own(COMMANDS, command), 'Choose snapshot, receive, configure, review, rebase, preview or save.');
  const options = {command};
  for (let i=0;i<rest.length;i++) {
    const key=rest[i].replace(/^--/,'');
    need(rest[i].startsWith('--') && COMMANDS[command].includes(key) && !own(options,key), 'Unknown or repeated option: '+rest[i]);
    if (key === 'no-header') options[key]=true;
    else { need(i+1<rest.length, 'Enter a value for '+rest[i]); options[key]=rest[++i]; }
  }
  return options;
}
function required(options, ...keys) { for (const key of keys) need(typeof options[key] === 'string' && options[key], 'Use --'+key+' with '+options.command+'.'); }
async function bytes(filename, maximum=MAX) {
  const raw=await readFile(resolve(filename)); need(raw.length<=maximum, 'The complete input exceeds '+maximum+' bytes.'); return raw;
}
async function readJson(filename) { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(filename)).replace(/^\uFEFF/,'')); }
async function readBook(filename) { return importPlanningBook(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(filename))); }
async function publish(filename, content) {
  const path=resolve(filename), raw=Buffer.isBuffer(content)?content:Buffer.from(content);
  const existing=async()=> { try { const prior=await readFile(path); return prior.equals(raw); } catch(error) { if(error.code==='ENOENT')return false;throw error; } };
  try { const prior=await readFile(path); need(prior.equals(raw),'Output already exists with different contents: '+path); return {path,bytes:raw.length,sha256:digest(raw)}; }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const temporary=join(dirname(path),'.source-table-'+randomUUID()+'.tmp');
  const handle=await open(temporary,'wx',0o600);
  try { await handle.writeFile(raw); await handle.sync(); } finally { await handle.close(); }
  try {
    try { await link(temporary,path); }
    catch(error) { if(error.code!=='EEXIST'||!await existing()) throw error; }
  } finally { await unlink(temporary).catch(()=>{}); }
  const readback=await readFile(path); need(readback.equals(raw),'The complete output could not be read back: '+path);
  return {path,bytes:raw.length,sha256:digest(raw)};
}
async function nativeText(args, options) {
  try {
    const result=await execute(options.python || 'python3',[nativeCli,...args],{encoding:'utf8',maxBuffer:MAX,windowsHide:true});
    return result.stdout;
  } catch(error) {
    let message=error.stderr || error.message;
    try { const body=JSON.parse(message); message=body.error?.message || message; } catch {}
    throw new Error('Original planner: '+String(message).trim());
  }
}
async function native(args, options) { return JSON.parse(await nativeText(args, options)); }
async function current(options) {
  required(options,'workspace','plan');
  return native(['show','--workspace',resolve(options.workspace),'--plan',options.plan,
    ...(options.revision?['--revision',options.revision]:[]),'--part','all'],options);
}
async function outputBook(options,book) {
  required(options,'output'); return {output:await publish(options.output,serializePlanningBook(book)),
    project:book.id,baseline:{id:book.baseline.id,revision:book.baseline.revision},
    roles:book.bindings.map(x=>x.role)};
}
function delimiter(value) {
  const choices={comma:',',tab:'\t',semicolon:';',pipe:'|'};
  need(own(choices,value),'Use --delimiter comma, tab, semicolon or pipe.');return choices[value];
}
async function previewProject(options) {
  required(options,'project','output','workspace','plan');
  const book=await readBook(options.project), plan=await current(options);
  requireCurrentBaseline(book,plan);
  const prepared=await preparePlanningImport(book);
  const directory=resolve(dirname(options.output));
  const inputDirectory=join(directory,'.planning-preview-'+prepared.id);
  await mkdir(inputDirectory,{recursive:true,mode:0o700});
  const patch=await publish(join(inputDirectory,'scenario-patch.json'),json(prepared.scenarioPatch));
  const planning=await publish(join(inputDirectory,'planning.json'),json(prepared.planning));
  const result=await native(['estimate','--workspace',resolve(options.workspace),'--plan',prepared.planId,
    '--expected-revision',String(prepared.expectedRevision),'--patch',patch.path,'--planning',planning.path],options);
  const preview=await completeNativePreview(prepared,result);
  return {output:await publish(options.output,json(preview)),project:book.id,plan:prepared.planId,
    baselineRevision:prepared.expectedRevision,workPackages:result.scenario.future_costs.length,
    awardRequestUsd:result.scenario.award_request_usd,hours:result.report.capacity.totalHours,
    changes:preview.review.changes.length,sourceRows:preview.review.sourceRows.length,
    peakCashGapUsd:result.report.cash.peakCashGapUsd,peakCashGapDay:result.report.cash.peakCashGapDay};
}
async function savePreview(options) {
  required(options,'preview','workspace','note','request-id','output-directory');
  need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(options['request-id']),'Use the original planner request-ID format: at most 100 letters, numbers, dots, hyphens or underscores.');
  const selected=await readJson(options.preview), prepared=await preparePlanningImport(selected.book);
  need(selected.id===prepared.id && selected.planId===prepared.planId && selected.expectedRevision===prepared.expectedRevision,
    'The complete preview must match its retained source project and native baseline.');
  // The actual writer receives reproducible inputs from the original source project.
  // Replays retain the original expected revision and request ID; native save
  // reconciles a committed request before its current-revision comparison.
  const draft=await acceptPlanningPreview(selected,prepared.book,{note:options.note,
    reviewedAt:selected.review.preparedAt});
  const directory=resolve(options['output-directory']);
  await mkdir(directory,{recursive:true,mode:0o700});
  const inputDirectory=join(directory,'.source-table-input');
  await mkdir(inputDirectory,{recursive:true,mode:0o700});
  const scenarioPatch=await publish(join(inputDirectory,'scenario-patch.json'),json(prepared.scenarioPatch));
  const planningInput={...prepared.planning,sourceTables:draft.planning.sourceTables};
  const planning=await publish(join(inputDirectory,'planning.json'),json(planningInput));
  const result=await native(['save','--workspace',resolve(options.workspace),'--plan',prepared.planId,
    '--expected-revision',String(prepared.expectedRevision),'--patch',scenarioPatch.path,
    '--planning',planning.path,'--note',options.note,'--request-id',options['request-id']],options);
  const artifacts=[];
  const planPath=join(directory,'plan.json');
  let planRaw;
  try {
    planRaw=await readFile(planPath);
    const prior=JSON.parse(planRaw);
    need(prior.id===result.id && prior.revision===result.revision && prior.contentSha256===result.contentSha256,
      'The existing full native plan belongs to another saved result.');
  } catch(error) {
    if(error.code!=='ENOENT') throw error;
    planRaw=Buffer.from(await nativeText(['show','--workspace',resolve(options.workspace),'--plan',result.id,
      '--revision',String(result.revision),'--part','all'],options));
  }
  artifacts.push(await publish(planPath,planRaw));
  artifacts.push(await publish(join(directory,'planning-source-tables.json'),draft.planning.sourceTables.text));
  artifacts.push(await publish(join(directory,'SOURCE_TABLES.md'),tableImportGuide(prepared.book)));
  const zipPath=join(directory,'planning.zip');
  let rawZip;
  try { rawZip=await readFile(zipPath); }
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    await native(['export','--workspace',resolve(options.workspace),'--plan',result.id,
      '--expected-revision',String(result.currentRevision),'--output',zipPath],options);
    rawZip=await readFile(zipPath);
  }
  // Use the same complete native ZIP receiver as the maintained submission editor.
  // This also reconciles an export completed before the process was interrupted.
  const received=await receivePlanningFile(new Uint8Array(rawZip),{
    filename:'planning.zip',digest:async raw=>digest(raw),
    inflate:async (raw,maximum)=>new Uint8Array(inflateRawSync(raw,{maxOutputLength:Math.max(1,maximum)})),
  });
  const receivedRevision=received.document.revisions.find(row=>row.revision===received.document.currentRevision);
  need(received.document.id===result.id && receivedRevision.revision===result.revision &&
    receivedRevision.contentSha256===result.contentSha256,
    'The complete native ZIP differs from this source-import revision.');
  const zip={plan:{id:result.id,revision:result.revision,contentSha256:result.contentSha256},
    output:{path:zipPath,bytes:rawZip.length,sha256:digest(rawZip)}};
  await publish(join(directory,'native-export.json'),json(zip));
  const complete={schema:'stellar-forge.planning-source-tables.delivery.v1',
    requestId:options['request-id'],project:prepared.book.id,planId:result.id,revision:result.revision,
    contentSha256:result.contentSha256,sourceImport:prepared.id,
    nativeExport:zip,artifacts};
  await publish(join(directory,'DELIVERY.json'),json(complete));
  return complete;
}
export async function runPlanningSourceTables(argv=process.argv.slice(2)) {
  const options=argumentsFor(argv);
  if(options.command==='help') return {help:[
    'snapshot --workspace PATH --plan ID --output source-project.json',
    'receive --project source-project.json --role packages --file costs.csv --delimiter comma --output next-project.json',
    'configure --project source-project.json --role packages --binding binding.json [--table-mapping mapping.json] --output mapped-project.json',
    'review --project mapped-project.json --role packages --output reviewed-project.json',
    'rebase --project source-project.json --workspace PATH --plan ID --output rebased-project.json',
    'preview --project reviewed-project.json --workspace PATH --plan ID --output preview.json',
    'save --preview preview.json --workspace PATH --note "Reviewed source revision" --request-id ORIGINAL_ID --output-directory NEW_DIRECTORY',
    'Use --python PATH on commands that invoke the original planner. Close its browser listener before headless commands open the same workspace.',
    'Every output is a complete new file. Retry the same save with the same preview, note, request ID and output directory.',
  ]};
  if(options.command==='snapshot') { required(options,'workspace','plan','output'); return outputBook(options,await planningBookFromNative(await current(options))); }
  if(options.command==='preview')return previewProject(options);
  if(options.command==='save')return savePreview(options);
  required(options,'project','output');
  let book=await readBook(options.project);
  if(options.command==='rebase')return outputBook(options,rebasePlanningBook(book,await current(options)));
  required(options,'role'); need(own(ROLES,options.role),'Choose packages, milestones, contributors or assignments.');
  if(options.command==='receive') {
    required(options,'file'); const raw=await bytes(options.file,16*1024*1024);
    const sourceText=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
    const filename=resolve(options.file).split(/[\\/]/).at(-1);
    if(book.bindings.some(x=>x.role===options.role))book=await receivePlanningEdition(book,options.role,{filename,sourceText});
    else { required(options,'delimiter'); book=await addPlanningTable(book,{role:options.role,filename,sourceText,delimiter:delimiter(options.delimiter),header:!options['no-header']}); }
  } else if(options.command==='configure') {
    const binding=book.bindings.find(x=>x.role===options.role);need(binding,'Receive the source table before configuring it.');
    need(options.binding||options['table-mapping'],'Provide --binding or --table-mapping.');
    if(options.binding) {
      const selected=await readJson(options.binding);
      need(selected&&typeof selected==='object'&&!Array.isArray(selected),'Use a complete binding JSON object.');
      const keys=Object.keys(selected);need(keys.every(x=>['fields','mode','excludedRows'].includes(x)),'Binding configuration accepts fields, mode and excludedRows.');
      Object.assign(binding,selected);
    }
    if(options['table-mapping'])book=changePlanningMapping(book,options.role,await readJson(options['table-mapping']));
    book=await importPlanningBook(book);
  } else if(options.command==='review')book=await retainPlanningTableReview(book,options.role);
  return outputBook(options,book);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  runPlanningSourceTables().then(result=>process.stdout.write(json(result))).catch(error=>{
    process.stderr.write(json({error:{code:error.code||'PLANNING_SOURCE_TABLES',message:error.message,
      ...(error.role?{role:error.role}:{}),...(error.record?{record:error.record,line:error.line}:{})}}));process.exitCode=1;
  });
}
