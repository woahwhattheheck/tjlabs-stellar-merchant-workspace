#!/usr/bin/env node
// MIT. Operate complete Support customer procedures through the original plan model.
import { createHash } from 'node:crypto';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectOperatingPlan, operatingPlanRevision, compareOperatingPlan,
  receiveOperatingPlan, renderOperatingPlanMarkdown, renderOperatingPlanHTML } from './operating-plan.mjs';
import { createSupportOperatingPlan, inspectSupportOperatingSource,
  recordSupportOperatingResult } from './support-operating-plan.mjs';
import { recordSupportOperatingWork, createSupportOperatingReturn, inspectSupportOperatingReturn,
  compareSupportOperatingReturn, reviseSupportOperatingReturn, decideSupportOperatingReturn,
  applySupportOperatingReturn, renderSupportOperatingReturnHTML } from './support-operating-return.mjs';
import { saveTextExport } from './write-json.mjs';

const LIMIT = 32 * 1024 * 1024;
const RETURN_LIMIT = 128 * 1024 * 1024;
const RULES = {
  capture: ['request','out'], 'receive-source': ['request','out'],
  create: ['request','out'], record: ['plan','request','out'],
  inspect: ['source','out'], show: ['plan','revision','format','out'],
  compare: ['plan','catalog','revision','out'], receive: ['plan','existing','out'],
  'record-work': ['plan','request','out'], 'record-source-work': ['plan','request','out'],
  'return-create': ['plan','incoming','request','out'],
  'return-inspect': ['return','out'], 'return-compare': ['return','out'],
  'return-details': ['return','request','out'], 'return-decide': ['return','request','out'],
  'return-apply': ['return','plan','request','out','plan-out'],
  'return-show': ['return','format','out'],
};
export const SUPPORT_OPERATING_HELP = [
  'OAuth / Support customer operating procedures',
  '',
  'starforge support-operating-plan capture --request CAPTURE.json --out NEW.json',
  'starforge support-operating-plan receive-source --request RECEIVE.json --out NEW.json',
  'starforge support-operating-plan create --request INPUT.json --out NEW.json',
  'starforge support-operating-plan record --plan PLAN.json --request RESULT.json --out NEW.json',
  'starforge support-operating-plan inspect --source SOURCE.json [--out NEW.json]',
  'starforge support-operating-plan show --plan PLAN.json [--revision N] [--format json|markdown|html] [--out NEW]',
  'starforge support-operating-plan compare --plan PLAN.json --catalog CATALOG.json [--revision N] [--out NEW.json]',
  'starforge support-operating-plan receive --plan INCOMING.json [--existing CURRENT.json] --out NEW.json',
  'starforge support-operating-plan record-work --plan PLAN.json --request WORK.json --out NEW-PLAN.json',
  'starforge support-operating-plan record-source-work --plan PLAN.json --request SOURCE-WORK.json --out NEW-PLAN.json',
  'starforge support-operating-plan return-create --plan CURRENT.json --incoming INCOMING.json --request REVIEW.json --out NEW-REVIEW.json',
  'starforge support-operating-plan return-inspect --return REVIEW.json [--out NEW.json]',
  'starforge support-operating-plan return-compare --return REVIEW.json [--out NEW.json]',
  'starforge support-operating-plan return-details --return REVIEW.json --request DETAILS.json --out NEW-REVIEW.json',
  'starforge support-operating-plan return-decide --return REVIEW.json --request DECISION.json --out NEW-REVIEW.json',
  'starforge support-operating-plan return-apply --return REVIEW.json --plan CURRENT.json --request COMPLETE.json --out COMPLETED-REVIEW.json --plan-out NEW-PLAN.json',
  'starforge support-operating-plan return-show --return REVIEW.json [--format json|html] [--out NEW]',
  '',
  'create reads the full retained {source,catalog,id,title,customer,owner,period,savedAt,registrations,argvByPhase} input.',
  'record reads the original {source,stepId,status,result:{summary,evidenceIds},owner,savedAt} request.',
  'Both routes invoke the maintained Support validator and ordinary OperatingPlan model.',
  'The native source exporter retains original evidence before this procedure is prepared.',
  'No command here dispatches OAuth, payment, incident, case or recovery operations.',
  'record-work verifies complete carried files against the selected source artifacts.',
  'record-source-work reads selected evidence from an already-retained native source package.',
  'return-create keeps both complete histories and all selected compact source descriptors.',
  'return-apply saves the completed review first, then its full resulting plan; retain both.',
  'Outputs are create-only; an identical already-written result is acknowledged without replacement.',
].join('\n');
function error(code,message) { const e=new TypeError(message);e.code=code;return e; }
function required(value,label) {
  if(typeof value!=='string'||!value||value.includes('\0'))throw error('SUPPORT_PLAN_ARGUMENT',label+' must be non-empty text without NUL.');
  return value;
}
export function parseSupportOperatingArguments(input) {
  const args=[...input];
  if(!args.length||args.includes('--help')||args.includes('-h'))return {action:'help',options:{}};
  const action=args.shift(),allowed=RULES[action];
  if(!allowed)throw error('SUPPORT_PLAN_ARGUMENT','Unknown Support operating action: '+action);
  const options={};
  while(args.length){
    const flag=args.shift();
    if(!flag.startsWith('--')||!allowed.includes(flag.slice(2)))
      throw error('SUPPORT_PLAN_ARGUMENT','Unknown option for '+action+': '+flag);
    const name=flag.slice(2);
    if(Object.hasOwn(options,name))throw error('SUPPORT_PLAN_ARGUMENT','Repeated option: '+flag);
    if(!args.length||args[0].startsWith('--'))throw error('SUPPORT_PLAN_ARGUMENT','Missing value for '+flag);
    options[name]=required(args.shift(),flag);
  }
  const needed=['capture','receive-source','create'].includes(action)?['request','out']:
    ['record','record-work','record-source-work'].includes(action)?['plan','request','out']:
    action==='return-create'?['plan','incoming','request','out']:
    action==='return-apply'?['return','plan','request','out','plan-out']:
    ['return-details','return-decide'].includes(action)?['return','request','out']:
    action.startsWith('return-')?['return']:
    action==='inspect'?['source']:action==='compare'?['plan','catalog']:
    action==='receive'?['plan','out']:['plan'];
  for(const name of needed)if(!options[name])throw error('SUPPORT_PLAN_ARGUMENT','--'+name+' is required.');
  if(options.revision!==undefined){
    if(!/^[1-9][0-9]*$/.test(options.revision))throw error('SUPPORT_PLAN_ARGUMENT','--revision must be a positive integer.');
    options.revision=Number(options.revision);
    if(!Number.isSafeInteger(options.revision))throw error('SUPPORT_PLAN_ARGUMENT','--revision is too large.');
  }
  const formats=action==='return-show'?['json','html']:['json','markdown','html'];
  if(options.format&&!formats.includes(options.format))
    throw error('SUPPORT_PLAN_ARGUMENT','--format must be '+formats.join(' or ')+'.');
  if(options['plan-out']&&resolve(options['plan-out'])===resolve(options.out))
    throw error('SUPPORT_PLAN_ARGUMENT','The completed review and full plan require distinct output paths.');
  return {action,options};
}
async function readBytes(filename,signal,limit=LIMIT) {
  signal?.throwIfAborted();
  const file=resolve(filename),before=await stat(file);
  if(!before.isFile()||before.size>limit)throw error('SUPPORT_PLAN_INPUT','Use a regular input file up to '+limit+' bytes.');
  const bytes=await readFile(file,{signal});
  if(bytes.length>limit)throw error('SUPPORT_PLAN_INPUT','Input exceeds '+limit+' bytes.');
  return bytes;
}
async function readJSON(filename,signal,limit=LIMIT) {
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(filename,signal,limit)));
}
function requestFields(value,allowed,requiredFields=[]) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(key=>!allowed.includes(key))||
    requiredFields.some(key=>!Object.hasOwn(value,key)))
    throw error('SUPPORT_PLAN_INPUT','Supply exactly the supported complete request fields.');
  return value;
}
async function publish(filename,body,signal,limit=LIMIT) {
  signal?.throwIfAborted();
  const bytes=Buffer.from(body,'utf8');
  if(bytes.length>limit)throw error('SUPPORT_PLAN_OUTPUT','Output exceeds '+limit+' bytes.');
  let reused=false;
  try { await saveTextExport(filename,body); }
  catch(e) {
    if(e.code!=='EEXIST')throw e;
    const current=await readBytes(filename,signal,limit);
    if(!current.equals(bytes))throw error('SUPPORT_PLAN_OUTPUT_EXISTS','The output already contains different bytes. Preserve it and select a new output path.');
    reused=true;
  }
  return {file:resolve(filename),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),reused};
}
export async function mainSupportOperatingPlan(args=process.argv.slice(2),{log=console.log,signal}={}) {
  signal?.throwIfAborted();
  const {action,options}=parseSupportOperatingArguments(args);
  if(action==='help'){log(SUPPORT_OPERATING_HELP);return;}
  const plan=options.plan?inspectOperatingPlan(await readJSON(options.plan,signal)):null;
  let value,body,nativeReused,sourceReceipt;
  if(action==='capture'||action==='receive-source'){
    const request=await readJSON(options.request,signal);
    if(!request||typeof request!=='object'||Array.isArray(request)||Object.hasOwn(request,'signal'))
      throw error('SUPPORT_PLAN_INPUT','Use the complete original capture or receive request; cancellation is supplied by the caller.');
    const native=await import('../../sf74-merchant-support-console/oauth-operating-source.mjs');
    value=action==='capture'
      ?await native.captureOAuthOperatingSource({...request,signal})
      :await native.receiveOAuthOperatingSource({...request,signal});
    nativeReused=value.reused;
    const {reused,...stable}=value;
    body=JSON.stringify(stable,null,2)+'\n';
  }else if(action==='create'||action==='record'){
    const request=await readJSON(options.request,signal);
    if(!request||typeof request!=='object'||Array.isArray(request)||typeof request.savedAt!=='string'||!request.savedAt)
      throw error('SUPPORT_PLAN_INPUT','Retain the original explicit savedAt before creating or recording a plan.');
    value=action==='create'?createSupportOperatingPlan(request):recordSupportOperatingResult(plan,request);
  }
  else if(action==='record-work'||action==='record-source-work') {
    const request=await readJSON(options.request,signal);
    if(!request||typeof request!=='object'||Array.isArray(request)||Object.hasOwn(request,'signal')||
      typeof request.savedAt!=='string'||!request.savedAt)
      throw error('SUPPORT_PLAN_INPUT','Retain the original explicit savedAt; cancellation is supplied by the caller.');
    if(action==='record-work')value=await recordSupportOperatingWork(plan,request);
    else {
      requestFields(request,['directory','expectedSource','stepId','status','result','owner','savedAt'],
        ['directory','stepId','status','result','savedAt']);
      const native=await import('./support-operating-return-native.mjs');
      signal?.throwIfAborted();
      const selected=await native.recordSupportOperatingWorkFromSource(plan,{...request,signal});
      value=selected.plan;
      sourceReceipt={sourceId:selected.source.id,sourceFile:selected.sourceFile,manifestFile:selected.manifestFile};
    }
  }
  else if(action.startsWith('return-')) {
    const returned=options.return?await inspectSupportOperatingReturn(await readJSON(options.return,signal,RETURN_LIMIT)):null;
    if(action==='return-create') {
      const request=await readJSON(options.request,signal);
      value=await createSupportOperatingReturn(plan,inspectOperatingPlan(await readJSON(options.incoming,signal)),request);
    }else if(action==='return-inspect')value=returned;
    else if(action==='return-compare')value=await compareSupportOperatingReturn(returned);
    else if(action==='return-details')value=await reviseSupportOperatingReturn(returned,await readJSON(options.request,signal));
    else if(action==='return-decide') {
      const request=requestFields(await readJSON(options.request,signal),['key','decision'],['key','decision']);
      value=await decideSupportOperatingReturn(returned,request.key,request.decision);
    }else if(action==='return-apply') {
      const request=requestFields(await readJSON(options.request,signal),['savedAt'],['savedAt']);
      const applied=await applySupportOperatingReturn(returned,{current:plan,savedAt:request.savedAt});
      signal?.throwIfAborted();
      // Retain completion before publishing its full plan. Both paths acknowledge exact bytes on retry.
      const reviewReceipt=await publish(options.out,JSON.stringify(applied.value,null,2)+'\n',signal,RETURN_LIMIT);
      const planReceipt=await publish(options['plan-out'],JSON.stringify(applied.plan,null,2)+'\n',signal);
      log(JSON.stringify({schema:'stellar-forge.support-operating-cli-result.v1',action,
        reviewId:applied.value.review.id,planId:applied.plan.id,revision:applied.plan.revisions.length,
        review:reviewReceipt,plan:planReceipt,alreadyPresent:applied.alreadyPresent,
        addedRevisions:applied.addedRevisions,reviewedRevisions:applied.reviewedRevisions}));
      return applied;
    }else {
      value=returned;
      if(options.format==='html')body=await renderSupportOperatingReturnHTML(returned);
    }
  }
  else if(action==='inspect')value=inspectSupportOperatingSource(await readJSON(options.source,signal));
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
    const receipt=await publish(options.out,body,signal,action.startsWith('return-')?RETURN_LIMIT:LIMIT);
    log(JSON.stringify({schema:'stellar-forge.support-operating-cli-result.v1',action,
      planId:value?.revisions?value.id:plan?.id??null,
      revision:options.revision??value?.revisions?.length??plan?.revisions?.length??null,
      ...receipt,...(nativeReused===undefined?{}:{sourceReused:nativeReused}),
      ...(sourceReceipt?{source:sourceReceipt}:{}),
      ...(value?.review?{reviewId:value.review.id}:{} )}));
  }else log(body);
  return value;
}
if(process.argv[1]&&await realpath(resolve(process.argv[1])).then(
  name=>pathToFileURL(name).href===import.meta.url,()=>false))
  mainSupportOperatingPlan().catch(e=>{console.error((e.code?e.code+': ':'')+e.message);process.exitCode=1;});
