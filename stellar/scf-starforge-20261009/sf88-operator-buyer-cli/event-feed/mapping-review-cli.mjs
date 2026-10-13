/* MIT. Complete source-bound colleague mapping files; native Review remains with Analysis. */
import {open,mkdir,link,unlink,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {resolve,dirname,basename,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as parser from './analysis-source.mjs';
import {createEventMappingWorkingAPI,eventMappingHash,MAX_EVENT_MAPPING_WORKING_BYTES} from './mapping-working.mjs';
import {createEventMappingReviewAPI,EVENT_MAPPING_ASSIGNMENT,EVENT_MAPPING_RETURN} from './mapping-review.mjs';
import {renderEventMappingWorking} from './mapping-working-html.mjs';

const workingAPI=createEventMappingWorkingAPI(parser);
const api=createEventMappingReviewAPI({workingAPI,eventMappingHash,eventMappingBytes:text=>Buffer.byteLength(text,'utf8')});
const here=dirname(fileURLToPath(import.meta.url)),MAX=MAX_EVENT_MAPPING_WORKING_BYTES,META=1024*1024;
const need=(ok,message)=>{if(!ok)throw Error(message);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':plain(value)?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const same=(a,b)=>canonical(a)===canonical(b);
const json=value=>{const text=JSON.stringify(value)+'\n';need(Buffer.byteLength(text,'utf8')<=MAX,'Keep the complete JSON within 192 MiB; no source or earlier work was omitted.');return text;};
function objectKeys(value,allowed,required,label){
 need(plain(value)&&Object.keys(value).every(key=>allowed.includes(key))&&required.every(key=>Object.hasOwn(value,key)),label+' must contain '+required.join(', ')+'; supported keys: '+allowed.join(', ')+'.');
 return value;
}
async function original(path,max=MAX){
 const file=await open(resolve(path),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=await file.stat();need(before.isFile()&&before.size<=max,'Open a complete regular input file within its allowance.');
  const body=await file.readFile(),after=await file.stat();
  need(before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&before.ino===after.ino&&before.dev===after.dev&&body.length===before.size,'The original input changed while being read.');
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);
  need(Buffer.byteLength(text,'utf8')===body.length,'Keep exact original UTF-8 bytes.');
  return text;
 }finally{await file.close();}
}
async function document(path,max=MAX){return JSON.parse(await original(path,max));}
async function bound(value){
 const comparison=value?.working?.original?.comparison??value?.original?.comparison;
 need(comparison?.receiver?.core_sha256===eventMappingHash(await original(join(here,'analysis-source.mjs'),2*META)),'Use the installed original parser selected by this complete source. Keep historical working files with their matching source and editable HTML.');
 return value;
}
async function workspace(path){return api.wrap(await bound(await document(path)));}
async function envelope(path,type){
 const value=await bound(await document(path));need(value.schema===type,'Select the complete original '+(type===EVENT_MAPPING_ASSIGNMENT?'assignment':'return')+' envelope.');
 return value;
}
async function location(path){
 let current=resolve(path),tail=[];
 for(;;){try{return join(await realpath(current),...tail);}catch(error){if(error.code!=='ENOENT')throw error;const parent=dirname(current);if(parent===current)throw error;tail.unshift(basename(current));current=parent;}}
}
async function preflight(outputs,inputs){
 const names=await Promise.all(outputs.map(x=>location(x.path))),originals=await Promise.all(inputs.map(location));
 need(new Set(names).size===names.length,'Use distinct complete output destinations.');
 need(!names.some(name=>originals.includes(name)),'Keep every original input; select different complete output filenames.');
 for(const output of outputs){
  try{need(await original(output.path,Math.max(Buffer.byteLength(output.text,'utf8'),1))===output.text,'Keep the different existing output; select a new destination or resume the exact original command.');}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
}
async function syncDirectory(path){
 let file;try{file=await open(path,constants.O_RDONLY);await file.sync();}
 catch(error){if(!['EINVAL','ENOTSUP','EISDIR','EPERM','EACCES','EBADF'].includes(error.code))throw error;}
 finally{if(file)await file.close();}
}
async function publish(path,text){
 const target=resolve(path),body=Buffer.from(text,'utf8');await mkdir(dirname(target),{recursive:true,mode:0o700});
 const temporary=join(dirname(target),'.event-mapping-colleague-'+randomUUID()+'.part');
 const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
 let reused=false;
 try{
  try{await file.writeFile(body);await file.sync();}finally{await file.close();}
  try{await link(temporary,target);await syncDirectory(dirname(target));}
  catch(error){if(error.code!=='EEXIST')throw error;need(await original(target,Math.max(body.length,1))===text,'Keep the different existing output; the preceding complete working output remains available for exact recovery.');reused=true;}
  return {path:target,bytes:body.length,sha256:eventMappingHash(text),reused};
 }finally{await unlink(temporary);}
}
async function output(outputs,inputs,extra={}){
 await preflight(outputs,inputs);
 const files=[];for(const entry of outputs)files.push(await publish(entry.path,entry.text));
 return {...extra,files};
}
function options(args){
 const value={};for(let i=0;i<args.length;i+=2){need(/^--[a-z-]+$/.test(args[i])&&args[i+1]!==undefined&&!Object.hasOwn(value,args[i]),'Use distinct named options with complete values.');value[args[i]]=args[i+1];}return value;
}
const SPECS={
 wrap:['in,out','in,out'],assign:['in,meta,out,envelope','in,meta,out,envelope'],open:['assignment,out','assignment,out'],
 return:['in,assignment-id,meta,out,envelope','in,assignment-id,meta,out,envelope'],
 preview:['in,return,out','in,return,out'],stage:['in,return,out','in,return,out'],
 resolve:['in,return-id,choices,out','in,return-id,choices,out'],
 apply:['in,return,preview,meta,choices,out','in,return,preview,meta,out'],
 assignment:['in,id,out','in,id,out'],'return-envelope':['in,id,out','in,id,out'],
 receipt:['in,id,out','in,id,out'],replace:['in,working,out','in,working,out'],
 pending:['in,patch,out','in,patch,out'],base:['in,out','in,out'],inspect:['in,out','in'],html:['in,out','in,out']
};
function checkedOptions(command,args){
 need(Object.hasOwn(SPECS,command),'Use '+Object.keys(SPECS).join(', ')+'.');
 const o=options(args),[a,r]=SPECS[command].map(s=>s.split(',').map(k=>'--'+k));
 need(Object.keys(o).every(k=>a.includes(k))&&r.every(k=>typeof o[k]==='string'&&o[k].length),'Select '+r.join(', ')+'; supported options: '+a.join(', ')+'.');return o;
}
async function metadata(path,kind){
 const keys=kind==='assign'?['issuer','recipient','note','at']:kind==='return'?['reviewer','note','at']:['actor','note','at'];
 return objectKeys(await document(path,META),keys,keys,'Original '+kind+' attribution');
}
function selectedChoices(value,clear){
 objectKeys(value,['mapping','reviewer','note'],[],'Complete receiving choices');
 need(Object.values(value).every(v=>v==='keep-current'||v==='use-returned'||(clear&&v===null)),'Choose keep-current or use-returned; use JSON null only to clear a saved choice.');return value;
}
export async function main(argv=process.argv.slice(2)){
 const [command,...rest]=argv,o=checkedOptions(command,rest),inputs=[];
 const read=async path=>{inputs.push(path);return workspace(path);};
 const emit=(value,extra={})=>output([{path:o['--out'],text:api.serialize(value)}],inputs,extra);
 if(command==='open'){
  inputs.push(o['--assignment']);const env=await envelope(o['--assignment'],EVENT_MAPPING_ASSIGNMENT);
  return emit(api.openAssignment(env),{assignment_id:env.assignment_id});
 }
 const value=await read(o['--in']);
 if(command==='wrap')return emit(value);
 if(command==='inspect'){
  const result=api.inspect(value);
  if(!o['--out'])return result;
  return output([{path:o['--out'],text:json(result)}],inputs);
 }
 if(command==='assign'||command==='return'){
  inputs.push(o['--meta']);const meta=await metadata(o['--meta'],command);
  const next=command==='assign'?api.createAssignment(value,meta):api.prepareReturn(value,o['--assignment-id'],meta);
  const id=command==='assign'?next.review_receiving.active_assignment_id:next.review_receiving.selected_return_id;
  const env=command==='assign'?api.assignmentEnvelope(next,id):api.returnEnvelope(next,id);
  // Preflight both outputs, then retain issuing/returning authority before publishing its envelope.
  return output([{path:o['--out'],text:api.serialize(next)},{path:o['--envelope'],text:json(env)}],inputs,{[command==='assign'?'assignment_id':'return_id']:id});
 }
 if(command==='assignment'||command==='return-envelope'){
  const env=command==='assignment'?api.assignmentEnvelope(value,o['--id']):api.returnEnvelope(value,o['--id']);
  return output([{path:o['--out'],text:json(env)}],inputs);
 }
 if(command==='receipt'){
  const receipt=value.review_receiving.receipts.find(x=>x.id===o['--id']);need(receipt,'Select the complete retained receiving receipt.');
  return output([{path:o['--out'],text:json({schema:'stellar-forge.event-mapping-colleague-receipt-source.v1',receipt_id:receipt.id,locally_applied:value.review_receiving.local_receipt_ids.includes(receipt.id),receipt,working:value})}],inputs);
 }
 if(command==='replace'){
  inputs.push(o['--working']);const next=await bound(await document(o['--working']));
  need(next.schema==='stellar-forge.event-mapping-working-copy.v1','Select the original base working document; complete colleague history stays in --in.');
  return emit(api.replaceWorking(value,next));
 }
 if(command==='pending'){
  inputs.push(o['--patch']);const patch=await document(o['--patch'],META);return emit(api.updatePending(value,patch));
 }
 if(command==='resolve'){
  inputs.push(o['--choices']);const choices=selectedChoices(await document(o['--choices'],META),true);
  let next=value;for(const [key,choice]of Object.entries(choices))next=api.setResolutionDraft(next,o['--return-id'],key,choice);
  return emit(next);
 }
 if(command==='base')return output([{path:o['--out'],text:workingAPI.serialize(value.working)}],inputs);
 if(command==='html'){
  const names=['mapping-working.mjs','analysis-source.mjs','mapping-working-ui.mjs','mapping-review.mjs','mapping-review-ui.mjs'];
  const sources=await Promise.all(names.map(name=>original(join(here,name),2*META)));
  const [modelSource,parserSource,controllerSource,reviewModelSource,reviewControllerSource]=sources;
  return output([{path:o['--out'],text:renderEventMappingWorking(value,{modelSource,parserSource,controllerSource,reviewModelSource,reviewControllerSource})}],inputs);
 }
 inputs.push(o['--return']);const env=await envelope(o['--return'],EVENT_MAPPING_RETURN);
 if(command==='stage')return emit(api.stageReturn(value,env),{return_id:env.return_id});
 if(command==='preview')return output([{path:o['--out'],text:json(api.previewReturn(value,env))}],inputs);
 if(command==='apply'){
  inputs.push(o['--preview'],o['--meta']);const saved=await document(o['--preview']),meta=await metadata(o['--meta'],'apply');
  need(saved.schema==='stellar-forge.event-mapping-colleague-preview.v1','Use the original complete saved receiving preview.');
  const current=api.previewReturn(value,env);
  for(const key of ['assignment_id','return_id','source_sha256','baseline_copy_id','returned_copy_id'])need(saved[key]===current[key],'The saved preview selects a different original assignment, return or source.');
  // Exact successful-result reruns are harmless; an unapplied input must still match the displayed whole preview.
  if(!current.already_applied)need(saved.current_digest===current.current_digest&&same(saved,current),'The complete current working copy or preview changed. Save and inspect a new preview before receiving.');
  let resolutions;if(o['--choices']){inputs.push(o['--choices']);resolutions=selectedChoices(await document(o['--choices'],META),false);}
  const next=api.applyReturn(value,env,{...meta,resolutions,expected_current_digest:saved.current_digest});
  return emit(next,{return_id:env.return_id,local_receipt_ids:next.review_receiving.local_receipt_ids});
 }
 throw Error('Select a complete supported colleague operation.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(value=>process.stdout.write(JSON.stringify(value)+'\n')).catch(error=>{process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1;});
