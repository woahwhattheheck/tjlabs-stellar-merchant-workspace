// MIT. Native query studies over the original local dataset workspace.
import { constants } from 'node:fs';
import { open, link, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDatasetWorkspaceSource } from './dataset-workspace.mjs';
import { openDatasetQueryStudies } from './dataset-query-studies.mjs';
import { STUDY_MAX_BYTES, validateStudy, createStudy, checkpointStudy, forkStudy } from './dataset-study-core.mjs';

const HELP=[
  'Dataset query studies — original local operator preview',
  'dataset-studies list --studies PRIVATE_DIR',
  'dataset-studies open --studies PRIVATE_DIR --id ID [--revision N] [--output NEW.json]',
  'dataset-studies history --studies PRIVATE_DIR --id ID',
  'dataset-studies create (--dataset CONFIG | --state DIR) --studies PRIVATE_DIR --title NAME [--id ID] [--resource HTTPS_URL]',
  'dataset-studies save --studies PRIVATE_DIR --input WORKING.json --expected-revision new|N',
  'dataset-studies import --studies PRIVATE_DIR --input WORKING.json [--id NEW_ID] [--title NAME]',
  'dataset-studies query (--dataset CONFIG | --state DIR) --studies PRIVATE_DIR --id ID --expected-revision N --query URL_PARAMETERS [--resource HTTPS_URL]',
  'dataset-studies export (--dataset CONFIG | --state DIR) --studies PRIVATE_DIR --id ID --expected-revision N --request-id UUID [--resource HTTPS_URL]',
  'dataset-studies resume (--dataset CONFIG | --state DIR) --studies PRIVATE_DIR --export-id SHA256 [--resource HTTPS_URL]',
  'dataset-studies exports --studies PRIVATE_DIR [--id ID]',
  'dataset-studies status --studies PRIVATE_DIR --export-id SHA256',
  'dataset-studies download --studies PRIVATE_DIR --export-id SHA256 --name FILE --output NEW_FILE',
  'dataset-studies comparisons --studies PRIVATE_DIR',
  'dataset-studies comparison-inspect --studies PRIVATE_DIR --baseline RESULT_SHA --target RESULT_SHA [--output NEW.json]',
  'dataset-studies comparison-create --studies PRIVATE_DIR --input ORIGINAL_REQUEST.json',
  'dataset-studies comparison-read --studies PRIVATE_DIR --id UUID [--kind all|added|removed|changed|unchanged|ambiguous|moved] [--offset N] [--limit N]',
  'dataset-studies comparison-members --studies PRIVATE_DIR --id UUID --ordinal N --side baseline|target [--offset N] [--limit N]',
  'dataset-studies comparison-resume --studies PRIVATE_DIR --id UUID',
  'dataset-studies comparison-download --studies PRIVATE_DIR --id UUID --name FILE --output NEW_FILE',
  'Comparisons use two COMPLETE retained results and explicit field/key mapping. No dataset source query is executed.',
  'Save retains unfinished input. Query explicitly executes the original engine and saves its successful page.',
  'Export starts from the saved successful query and reads every original page; resume uses the same retained job.',
  'Complete result files remain under the private studies directory. --output always creates a new file.',
].join('\n');
function parseArgs(args) {
  if(args.length===1&&args[0]==='--help')return{help:true};
  const [command,...rest]=args, options={command};
  const allowed={
    list:['studies'],open:['studies','id','revision','output'],history:['studies','id'],
    create:['studies','dataset','state','title','id','resource'],
    save:['studies','input','expected-revision'],import:['studies','input','id','title'],
    query:['studies','dataset','state','id','expected-revision','query','resource'],
    export:['studies','dataset','state','id','expected-revision','request-id','resource'],
    resume:['studies','dataset','state','export-id','resource'],
    exports:['studies','id'],status:['studies','export-id'],download:['studies','export-id','name','output'],
    comparisons:['studies'],'comparison-inspect':['studies','baseline','target','output'],
    'comparison-create':['studies','input'],'comparison-read':['studies','id','kind','offset','limit'],
    'comparison-members':['studies','id','ordinal','side','offset','limit'],
    'comparison-resume':['studies','id'],'comparison-download':['studies','id','name','output']
  }[command];
  if(!allowed)throw new TypeError('Choose a dataset study command; use --help.');
  for(let i=0;i<rest.length;i+=2) {
    const key=rest[i].slice(2);
    if(!rest[i].startsWith('--')||!allowed.includes(key)||Object.hasOwn(options,key)||rest[i+1]===undefined)
      throw new TypeError('Unknown, repeated or incomplete option; use --help.');
    options[key]=rest[i+1];
  }
  if(!options.studies)throw new TypeError('--studies PRIVATE_DIR is required.');
  return options;
}
function positive(value,label) {
  if(typeof value!=='string'||!/^[1-9][0-9]{0,7}$/.test(value))throw new TypeError(label+' must be a positive native revision.');
  return Number(value);
}
function nonnegative(value,label,fallback){
 if(value===undefined)return fallback;
 if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,12})$/.test(value))throw new TypeError(label+' must be a nonnegative integer.');
 return Number(value);
}
async function readComparisonRequest(path){
 if(typeof path!=='string'||!path)throw new TypeError('--input ORIGINAL_REQUEST.json is required.');
 const handle=await open(resolve(path),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const info=await handle.stat();if(!info.isFile()||info.size>65536)throw new TypeError('Select a complete original comparison request within 64 KiB.');
  const bytes=await handle.readFile();if(bytes.length>65536)throw new TypeError('The original request exceeds 64 KiB.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{await handle.close();}
}
async function readWorking(path) {
  if(typeof path!=='string'||!path)throw new TypeError('--input is required.');
  const file=await open(resolve(path),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {
    const info=await file.stat();if(!info.isFile()||info.size>STUDY_MAX_BYTES)throw new TypeError('Choose a complete working JSON file up to 8 MiB.');
    const bytes=await file.readFile();if(bytes.length>STUDY_MAX_BYTES)throw new TypeError('Working file exceeds 8 MiB.');
    return validateStudy(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  } finally {await file.close();}
}
async function writeNew(path,produce) {
  if(typeof path!=='string'||!path)throw new TypeError('--output NEW_FILE is required.');
  const target=resolve(path),temp=join(dirname(target),'.dataset-study-'+randomUUID()+'.pending');
  const file=await open(temp,'wx',0o600);
  try {await produce(file);await file.sync();} catch(error){await file.close();await unlink(temp).catch(()=>{});throw error;}
  await file.close();
  try {
    await link(temp,target);
    const parent=await open(dirname(target),constants.O_RDONLY);try{await parent.sync();}finally{await parent.close();}
  } finally {await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  return target;
}
export async function main(args=process.argv.slice(2)) {
  const o=parseArgs(args);if(o.help){console.log(HELP);return;}
  const needsSource=['create','query','export','resume'].includes(o.command);
  const source=needsSource?await openDatasetWorkspaceSource({datasetPath:o.dataset,stateDirectory:o.state,resource:o.resource}):null;
  const store=await openDatasetQueryStudies({directory:o.studies,schema:source?.schema,queryPage:source?.queryPage});
  let result;
  try {
    if(o.command==='list')result=await store.list();
    else if(o.command==='open') {
      result=await store.get(o.id,{revision:o.revision===undefined?undefined:positive(o.revision,'--revision')});
      if(o.output)result={...result,output:await writeNew(o.output,file=>file.writeFile(JSON.stringify(result.study)+'\n'))};
    } else if(o.command==='history')result={id:o.id,revisions:await store.history(o.id)};
    else if(o.command==='create') {
      const at=new Date().toISOString();
      const study=checkpointStudy(createStudy({schema:await source.schema(),id:o.id??randomUUID(),title:o.title??'Untitled dataset study',at}),{at,reason:'Created native query study'});
      result=await store.save({study,expectedRevision:null});
    } else if(o.command==='save') {
      const study=await readWorking(o.input),expectedRevision=o['expected-revision']==='new'?null:positive(o['expected-revision'],'--expected-revision');
      result=await store.save({study,expectedRevision});
    } else if(o.command==='import') {
      const original=await readWorking(o.input),at=new Date().toISOString();
      const study=forkStudy(original,{id:o.id??randomUUID(),title:o.title,at});
      result=await store.save({study,expectedRevision:null});
    } else if(o.command==='query') {
      const expectedRevision=positive(o['expected-revision'],'--expected-revision'),saved=await store.get(o.id);
      if(saved.storageRevision!==expectedRevision)throw Object.assign(new Error('The saved study changed; reopen before querying.'),{code:'DATASET_STUDY_CONFLICT'});
      if(typeof o.query!=='string')throw new TypeError('--query URL_PARAMETERS is required.');
      // Preserve the entire original document and execute only the explicitly selected native query.
      const {sameSource,updateStudy}=await import('./dataset-study-core.mjs');
      if(!sameSource(saved.study,await source.schema()))throw Object.assign(new Error('The selected source differs from the saved study; rebind explicitly in the workspace.'),{code:'DATASET_STUDY_SOURCE_CHANGED'});
      const response=await source.preview(o.query),at=new Date().toISOString();
      const study=checkpointStudy(updateStudy(saved.study,{draft:{...saved.study.working.draft,mode:'raw',raw:o.query},
        lastSuccess:{...response,executedAt:at}}),{at,reason:'Executed native query'});
      result=await store.save({study,expectedRevision});
    } else if(o.command==='export') {
      const expectedRevision=positive(o['expected-revision'],'--expected-revision'),saved=await store.get(o.id,{revision:expectedRevision});
      if(!saved.study.working.lastSuccess)throw new TypeError('Save a successful original query before exporting its full result.');
      const {query,snapshot}=saved.study.working.lastSuccess;
      result=await store.beginExport({studyId:o.id,expectedRevision,query,snapshot,requestId:o['request-id']});
      result=await store.waitExport(result.export.id);
    } else if(o.command==='resume') {
      result=await store.resumeExport(o['export-id']);result=await store.waitExport(result.export.id);
    } else if(o.command==='exports')result=await store.listExports({studyId:o.id});
    else if(o.command==='status')result=await store.exportStatus(o['export-id']);
    else if(o.command==='download') {
      const retained=await store.readExportFile(o['export-id'],o.name);
      try {
        const output=await writeNew(o.output,async file=>{for await(const chunk of retained.stream)await file.writeFile(chunk);});
        result={exportId:o['export-id'],file:retained.descriptor,output};
      } finally {retained.stream.destroy();}
    }
    else if(o.command==='comparisons')result=await store.comparisonList();
    else if(o.command==='comparison-inspect'){
      result=await store.comparisonInspect({baselineId:o.baseline,targetId:o.target});
      if(o.output)result={...result,output:await writeNew(o.output,file=>file.writeFile(JSON.stringify(result,null,2)+'\n'))};
    }else if(o.command==='comparison-create'){
      result=await store.comparisonCreate(await readComparisonRequest(o.input));
      result=await store.waitComparison(result.comparison.id);
    }else if(o.command==='comparison-read')result=await store.comparisonRead({id:o.id,kind:o.kind,offset:nonnegative(o.offset,'--offset',0),limit:nonnegative(o.limit,'--limit',25)});
    else if(o.command==='comparison-members')result=await store.comparisonMembers({id:o.id,ordinal:nonnegative(o.ordinal,'--ordinal'),side:o.side,offset:nonnegative(o.offset,'--offset',0),limit:nonnegative(o.limit,'--limit',25)});
    else if(o.command==='comparison-resume'){result=await store.comparisonResume(o.id);result=await store.waitComparison(o.id);}
    else if(o.command==='comparison-download'){
      const retained=await store.openComparisonFile(o.id,o.name);
      try{
        const output=await writeNew(o.output,async target=>{for await(const chunk of retained.readonlyFileHandle.createReadStream({start:0,autoClose:false}))await target.writeFile(chunk);});
        result={comparisonId:o.id,file:{name:retained.name,bytes:retained.bytes,sha256:retained.sha256},output};
      }finally{await retained.readonlyFileHandle.close();}
    }
    console.log(JSON.stringify(result,null,2));return result;
  } finally {await store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{console.error(JSON.stringify({error:error.code??'DATASET_STUDY_COMMAND_FAILED',message:error.message}));process.exitCode=1;});
