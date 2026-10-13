#!/usr/bin/env node
// MIT. Operate complete FRED customer procedures through the original plan model.
import { createHash } from 'node:crypto';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectOperatingPlan, operatingPlanRevision, compareOperatingPlan,
  receiveOperatingPlan, renderOperatingPlanMarkdown, renderOperatingPlanHTML } from './operating-plan.mjs';
import { createFredOperatingPlan, inspectFredOperatingSource,
  recordFredOperatingResult } from './fred-operating-plan.mjs';
import { saveTextExport } from './write-json.mjs';

const LIMIT = 32 * 1024 * 1024;
const RULES = {
  capture: ['request','out'], 'inspect-package': ['request','out'], 'receive-source': ['request','out'],
  create: ['request','out'], record: ['plan','request','out'],
  inspect: ['source','out'], show: ['plan','revision','format','out'],
  compare: ['plan','catalog','revision','out'], receive: ['plan','existing','out'],
};
export const FRED_OPERATING_HELP = [
  'FRED economic customer operating procedures',
  '',
  'starforge fred-operating-plan capture --request CAPTURE.json --out NEW.json',
  'starforge fred-operating-plan inspect-package --request INSPECT.json [--out NEW.json]',
  'starforge fred-operating-plan receive-source --request RECEIVE.json --out NEW.json',
  'starforge fred-operating-plan create --request INPUT.json --out NEW.json',
  'starforge fred-operating-plan record --plan PLAN.json --request RESULT.json --out NEW.json',
  'starforge fred-operating-plan inspect --source source.json [--out NEW.json]',
  'starforge fred-operating-plan show --plan PLAN.json [--revision N] [--format json|markdown|html] [--out NEW]',
  'starforge fred-operating-plan compare --plan PLAN.json --catalog CATALOG.json [--revision N] [--out NEW.json]',
  'starforge fred-operating-plan receive --plan INCOMING.json [--existing CURRENT.json] --out NEW.json',
  '',
  'create reads the full retained {source,catalog,id,title,customer,owner,period,savedAt,registrations,argvByPhase} input.',
  'record reads the original {source,stepId,status,result:{summary,evidenceIds},owner,savedAt} request.',
  'Both routes invoke the maintained FRED validator and ordinary OperatingPlan model.',
  'The native source exporter retains original evidence before this procedure is prepared.',
  'Native capture/receive retain the original economic project and selected publications; plan commands retain reviewed procedure values.',
  'Original native projectReceipt and reused remain in the returned value; stable receipt files omit those replay observations.',
  'Outputs are create-only; an identical already-written result is acknowledged without replacement.',
].join('\n');
function error(code,message) { const e=new TypeError(message);e.code=code;return e; }
function required(value,label) {
  if(typeof value!=='string'||!value||value.includes('\0'))throw error('FRED_PLAN_ARGUMENT',label+' must be non-empty text without NUL.');
  return value;
}
export function parseFredOperatingArguments(input) {
  const args=[...input];
  if(!args.length||args.includes('--help')||args.includes('-h'))return {action:'help',options:{}};
  const action=args.shift(),allowed=RULES[action];
  if(!allowed)throw error('FRED_PLAN_ARGUMENT','Unknown FRED operating action: '+action);
  const options={};
  while(args.length){
    const flag=args.shift();
    if(!flag.startsWith('--')||!allowed.includes(flag.slice(2)))
      throw error('FRED_PLAN_ARGUMENT','Unknown option for '+action+': '+flag);
    const name=flag.slice(2);
    if(Object.hasOwn(options,name))throw error('FRED_PLAN_ARGUMENT','Repeated option: '+flag);
    if(!args.length||args[0].startsWith('--'))throw error('FRED_PLAN_ARGUMENT','Missing value for '+flag);
    options[name]=required(args.shift(),flag);
  }
  const needed=['capture','receive-source','create'].includes(action)?['request','out']:action==='inspect-package'?['request']:action==='record'?['plan','request','out']:
    action==='inspect'?['source']:action==='compare'?['plan','catalog']:
    action==='receive'?['plan','out']:['plan'];
  for(const name of needed)if(!options[name])throw error('FRED_PLAN_ARGUMENT','--'+name+' is required.');
  if(options.revision!==undefined){
    if(!/^[1-9][0-9]*$/.test(options.revision))throw error('FRED_PLAN_ARGUMENT','--revision must be a positive integer.');
    options.revision=Number(options.revision);
    if(!Number.isSafeInteger(options.revision))throw error('FRED_PLAN_ARGUMENT','--revision is too large.');
  }
  if(options.format&&!['json','markdown','html'].includes(options.format))
    throw error('FRED_PLAN_ARGUMENT','--format must be json, markdown or html.');
  return {action,options};
}
async function readBytes(filename,signal) {
  signal?.throwIfAborted();
  const file=resolve(filename),before=await stat(file);
  if(!before.isFile()||before.size>LIMIT)throw error('FRED_PLAN_INPUT','Use a regular input file up to 32 MiB.');
  const bytes=await readFile(file,{signal});
  if(bytes.length>LIMIT)throw error('FRED_PLAN_INPUT','Input exceeds 32 MiB.');
  return bytes;
}
async function readJSON(filename,signal) {
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(filename,signal)));
}
async function publish(filename,body,signal) {
  signal?.throwIfAborted();
  const bytes=Buffer.from(body,'utf8');
  if(bytes.length>LIMIT)throw error('FRED_PLAN_OUTPUT','Output exceeds 32 MiB.');
  let reused=false;
  try { await saveTextExport(filename,body); }
  catch(e) {
    if(e.code!=='EEXIST')throw e;
    const current=await readBytes(filename,signal);
    if(!current.equals(bytes))throw error('FRED_PLAN_OUTPUT_EXISTS','The output already contains different bytes. Preserve it and select a new output path.');
    reused=true;
  }
  return {file:resolve(filename),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),reused};
}
export async function mainFredOperatingPlan(args=process.argv.slice(2),{log=console.log,signal}={}) {
  signal?.throwIfAborted();
  const {action,options}=parseFredOperatingArguments(args);
  if(action==='help'){log(FRED_OPERATING_HELP);return;}
  const plan=options.plan?inspectOperatingPlan(await readJSON(options.plan,signal)):null;
  let value,body,nativeReused;
  if(['capture','inspect-package','receive-source'].includes(action)){
    const request=await readJSON(options.request,signal);
    if(!request||typeof request!=='object'||Array.isArray(request)||Object.hasOwn(request,'signal'))
      throw error('FRED_PLAN_INPUT','Use the complete original capture or receive request; cancellation is supplied by the caller.');
    const native=await import('../../sf30-seller-sdk/fred/operating/source.mjs');
    value=action==='capture'
      ?await native.captureFredOperatingSource({...request,signal})
      :action==='inspect-package'?await native.inspectFredOperatingSourcePackage({...request,signal})
      :await native.receiveFredOperatingSource({...request,signal});
    nativeReused=value.reused;
    const {reused,projectReceipt,...stable}=value;
    body=JSON.stringify(stable,null,2)+'\n';
  }else if(action==='create'||action==='record'){
    const request=await readJSON(options.request,signal);
    if(!request||typeof request!=='object'||Array.isArray(request)||typeof request.savedAt!=='string'||!request.savedAt)
      throw error('FRED_PLAN_INPUT','Retain the original explicit savedAt before creating or recording a plan.');
    value=action==='create'?createFredOperatingPlan(request):recordFredOperatingResult(plan,request);
  }
  else if(action==='inspect')value=inspectFredOperatingSource(await readJSON(options.source,signal));
  else if(action==='compare')value=compareOperatingPlan(plan,await readJSON(options.catalog,signal),{revision:options.revision});
  else if(action==='receive'){
    const existing=options.existing?inspectOperatingPlan(await readJSON(options.existing,signal)):null;
    value=receiveOperatingPlan(plan,existing).plan;
  }else{
    if(options.revision!==undefined)operatingPlanRevision(plan,options.revision);
    value=plan;
    if(options.format==='markdown')body=renderOperatingPlanMarkdown(plan,{revision:options.revision});
    else if(options.format==='html')body=renderOperatingPlanHTML(plan,{revision:options.revision});
  }
  signal?.throwIfAborted();
  body??=JSON.stringify(value,null,2)+'\n';
  if(options.out){
    const receipt=await publish(options.out,body,signal);
    log(JSON.stringify({schema:'stellar-forge.fred-operating-cli-result.v1',action,
      planId:value?.revisions?value.id:value?.plan?.id??plan?.id??null,
      sourceId:value?.source?.id??null,
      projectId:value?.source?.project?.id??null,
      revision:options.revision??value?.revisions?.length??value?.plan?.revisions?.length??plan?.revisions?.length??null,
      ...receipt,...(nativeReused===undefined?{}:{sourceReused:nativeReused})}));
  }else log(body);
  return value;
}
if(process.argv[1]&&await realpath(resolve(process.argv[1])).then(
  name=>pathToFileURL(name).href===import.meta.url,()=>false))
  mainFredOperatingPlan().catch(e=>{console.error((e.code?e.code+': ':'')+e.message);process.exitCode=1;});
