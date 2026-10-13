// MIT. Typed host client using the original Tourism CLI writer and recovery envelope.
import path from 'node:path';
import * as Engine from './engine.mjs';
import * as Portable from './portable.mjs';
import {main as originalCLI,readWorking,workingGenesis} from './cli.mjs';
import {loadSource} from './build.mjs';
import {sha,canonical,need,clone,absolute,regular,utf8,optional,directory,publish,json,page} from './agent-io.mjs';

export const CONFIG_SCHEMA='stellar-forge.tourism-series-agent.v1';
export const ACTIONS=['importFile','importCsv','saveRegistry','saveMapping','saveCorrection','saveAnalysis','saveReport','prepareTarget','recordTargetReturn'];
export const SECTIONS=['files','sources','registries','mappings','mappingHistory','corrections','analyses','reports','targetPlans','targetReturns','operations','drafts','selection'];
const alias=value=>need(typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value),'Select an original configured alias.');
const hash=value=>need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'Retain the complete original SHA256.');
const same=(a,b)=>canonical(a)===canonical(b);
const recordId=value=>need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value),'Use an original stable operation ID.');
export function readTourismConfiguration(file){
 const selected=absolute(file,'configuration file'),config=JSON.parse(utf8(regular(selected,1024*1024)));
 need(config.schema===CONFIG_SCHEMA&&config.workspaces&&typeof config.workspaces==='object'&&!Array.isArray(config.workspaces),'Read the complete original Tourism connection configuration.');
 const result={schema:CONFIG_SCHEMA,workspaces:{}};
 for(const [name,row]of Object.entries(config.workspaces)){
  alias(name);need(row&&typeof row==='object'&&typeof row.label==='string'&&row.label.length<=300,'Retain a named workspace.');
  const workspacePath=absolute(row.workspacePath,'working recovery file'),operationsDirectory=absolute(row.operationsDirectory,'operation directory');
  need(row.genesis&&Object.keys(row.genesis).sort().join(',')==='createdAt,id,title','Retain the exact original workspace ID, title and createdAt.');
  const genesis=clone(row.genesis),genesisSha256=workingGenesis(genesis);
  const current=readWorking(workspacePath,{expectedGenesis:genesisSha256});
  const inputs={};
  for(const [input,item]of Object.entries(row.inputs??{})){
   alias(input);need(item&&typeof item==='object'&&['original','csv','operation'].includes(item.kind),'Choose an original binary file or exact CSV.');
   const inputPath=absolute(item.path,'original input file');hash(item.sha256);
   need(Number.isSafeInteger(item.bytes)&&item.bytes>=0&&item.bytes<=32*1024*1024,'Select a complete original input within32 MiB.');
   need(typeof item.filename==='string'&&item.filename&&item.filename.length<=240&&!/[\\/\u0000-\u001f\u007f]/.test(item.filename),'Retain the actual plain original filename.');
   inputs[input]={path:inputPath,sha256:item.sha256,bytes:item.bytes,filename:item.filename,kind:item.kind,label:String(item.label??item.filename)};
  }
  result.workspaces[name]={label:row.label,workspacePath,operationsDirectory,genesis,genesisSha256,inputs};
 }
 need(Object.keys(result.workspaces).length>0,'Select at least one original workspace.');return result;
}
function summary(selected){
 const ws=selected.record.workspace;
 return {id:ws.id,title:ws.title,createdAt:ws.createdAt,revision:ws.revision,headSha256:selected.headSha256,genesisSha256:selected.genesisSha256,
  format:selected.format,copyId:selected.record.copyId??null,unfinishedForms:Object.keys(selected.record.drafts),
  collections:Object.fromEntries(SECTIONS.map(name=>[name,Array.isArray(ws[name])?ws[name].length:typeof ws[name]==='object'?Object.keys(ws[name]).length:name==='drafts'?Object.keys(selected.record.drafts).length:name==='selection'?Object.keys(selected.record.selection).length:0])),
  selection:clone(selected.record.selection)};
}
export class TourismSeriesClient{
 #entry;#root;#tail=Promise.resolve();#closed=false;
 constructor(entry){
  need(entry&&entry.genesis&&entry.workspacePath&&entry.operationsDirectory,'Use the complete configured original connection.');
  this.#entry={...clone(entry),inputs:clone(entry.inputs??{})};this.#entry.genesisSha256=workingGenesis(entry.genesis);
  readWorking(this.#entry.workspacePath,{expectedGenesis:this.#entry.genesisSha256});
  this.#root=directory(absolute(entry.operationsDirectory,'operation directory'));
  publish(path.join(this.#root,'BINDING.json'),json({schema:CONFIG_SCHEMA,workspacePath:this.#entry.workspacePath,genesis:this.#entry.genesis}));
 }
 #current(expectedRevision,expectedHead){
  const selected=readWorking(this.#entry.workspacePath,{expectedGenesis:this.#entry.genesisSha256,expectedHead});
  if(expectedRevision!==undefined)need(selected.record.workspace.revision===expectedRevision,'Continue the same selected workspace revision.','TOURISM_AGENT_REVISION_CHANGED');
  return selected;
 }
 #enqueue(fn){need(!this.#closed,'The original Tourism client is closing.');const result=this.#tail.then(fn);this.#tail=result.catch(()=>{});return result;}
 status(){return summary(this.#current());}
 section({section,expectedRevision,expectedHead,offset,limit}){
  need(SECTIONS.includes(section),'Select one complete original workspace section.');
  const chosen=this.#current(expectedRevision,expectedHead),ws=chosen.record.workspace;
  let value=section==='drafts'?chosen.record.drafts:section==='selection'?chosen.record.selection:ws[section];
  let rows=Array.isArray(value)?value:Object.entries(value).map(([id,value])=>({id,value}));
  if(section==='files')rows=rows.map(({content_base64,...row})=>row);
  if(section==='sources')rows=rows.map(({text,rows,...source})=>({...source,rowCount:rows.length}));
  return {workspaceId:ws.id,revision:ws.revision,headSha256:chosen.headSha256,section,...page(rows,{offset,limit})};
 }
 rows({sourceId,expectedRevision,expectedHead,offset,limit}){
  const chosen=this.#current(expectedRevision,expectedHead),ws=chosen.record.workspace,source=ws.sources.find(x=>x.id===sourceId);
  need(source,'Select an original source edition.');return{workspaceId:ws.id,revision:ws.revision,headSha256:chosen.headSha256,sourceId,headers:source.headers,...page(source.rows,{offset,limit})};
 }
 project({expectedRevision,expectedHead,registryId,sourceIds,offset,limit}){
  const chosen=this.#current(expectedRevision,expectedHead),result=Engine.project(chosen.record.workspace,{registryId,sourceIds});
  const {rows,...rest}=result;return {workspaceId:chosen.record.workspace.id,revision:chosen.record.workspace.revision,headSha256:chosen.headSha256,...rest,...page(rows,{offset,limit})};
 }
 calculate({expectedRevision,expectedHead,...selection}){
  const chosen=this.#current(expectedRevision,expectedHead);
  return{workspaceId:chosen.record.workspace.id,revision:chosen.record.workspace.revision,headSha256:chosen.headSha256,result:Engine.runAnalysis(chosen.record.workspace,selection)};
 }
 input(name){
  const item=this.#entry.inputs[name];need(item,'Select an original configured input.');
  const bytes=regular(item.path,32*1024*1024);need(bytes.length===item.bytes&&sha(bytes)===item.sha256,'The configured complete original input changed.','TOURISM_AGENT_FILE_CHANGED');
  return{item,bytes};
 }
 #file(operationId){recordId(operationId);return path.join(this.#root,'request-'+sha(Buffer.from(operationId)) +'.json');}
 #retained(operationId){
  const file=this.#file(operationId),body=optional(file,128*1024*1024);if(!body)return null;
  const value=JSON.parse(utf8(body));
  need(value.schema==='stellar-forge.tourism-original-operation.v1'&&same(value.binding,{workspacePath:this.#entry.workspacePath,genesis:this.#entry.genesis})&&value.input.operationId===operationId&&ACTIONS.includes(value.action),'The retained operation belongs to another original workspace.','TOURISM_AGENT_OPERATION_CONFLICT');
  need(value.requestSha256===sha(Buffer.from(canonical({action:value.action,input:value.input}),'utf8')),'The retained original request changed.','TOURISM_AGENT_OPERATION_CONFLICT');
  return{file,value};
 }
 mutate(action,input,{inputAlias=null,expectedSha256=null,expectedHead=null,sourcePacket=null}={}){
  // Freeze the caller's complete submission before any queued task can yield.
  const submitted=clone(input),packet=sourcePacket===null?null:clone(sourcePacket);
  return this.#enqueue(async()=>{
   need(ACTIONS.includes(action),'Select an original Tourism mutation.');input=clone(submitted);sourcePacket=packet;recordId(input.operationId);
   const selected={action,input:clone(input),source:{inputAlias,expectedSha256},expectedHead,...(sourcePacket?{sourcePacket:clone(sourcePacket)}:{})};
   let saved=this.#retained(input.operationId);
   if(saved)need(same(saved.value.selection,selected),'The original operation ID belongs to a different complete request.','TOURISM_AGENT_OPERATION_CONFLICT');
   else{
    this.#current(); // Check original genesis before capturing any new input.
    if(inputAlias!==null){
     alias(inputAlias);hash(expectedSha256);const {item,bytes}=this.input(inputAlias);
     need(item.sha256===expectedSha256,'The selected input SHA differs from the original configured file.');
     need((action==='importCsv'&&item.kind==='csv')||(action==='importFile'&&item.kind==='original'),'Match the original input kind to the actual import action.');
     const key=action==='importCsv'?'text':'content_base64';need(input[key]===undefined,'Select the original configured file rather than a second inline body.');
     need(input.filename===item.filename,'Retain the configured original filename exactly.');
     input[key]=action==='importCsv'?utf8(bytes):bytes.toString('base64');
    }else need(expectedSha256===null,'Select the original configured input with its hash.');
    const value={schema:'stellar-forge.tourism-original-operation.v1',binding:{workspacePath:this.#entry.workspacePath,genesis:this.#entry.genesis},
     selection:selected,action,input,requestSha256:sha(Buffer.from(canonical({action,input}),'utf8'))};
    const file=this.#file(input.operationId),body=json(value);
    need(Buffer.byteLength(body,'utf8')<=128*1024*1024,'The complete prepared request exceeds 128 MiB. Retain the original operation file and reduce its selected operation scope before dispatch.','TOURISM_AGENT_REQUEST_SIZE');
    publish(file,body);saved={file,value};
   }
   return this.#dispatch(saved);
  });
 }
 applyInput({operationId,inputAlias,expectedSha256,expectedHead=null}){
  recordId(operationId);alias(inputAlias);hash(expectedSha256);
  const saved=this.#retained(operationId);
  if(saved){const original=saved.value.selection.sourcePacket;need(original&&original.alias===inputAlias&&original.sha256===expectedSha256&&saved.value.selection.expectedHead===expectedHead,'Continue the same full original operation file.','TOURISM_AGENT_OPERATION_CONFLICT');return this.#enqueue(()=>this.#dispatch(saved));}
  const {item,bytes}=this.input(inputAlias);need(item.kind==='operation'&&item.sha256===expectedSha256,'Select the configured complete operation JSON.');
  const request=JSON.parse(utf8(bytes));need(request&&ACTIONS.includes(request.action)&&request.input?.operationId===operationId,'Retain the original action and operation identity in the full source file.');
  return this.mutate(request.action,request.input,{expectedHead,sourcePacket:{alias:inputAlias,filename:item.filename,bytes:bytes.length,sha256:item.sha256,content_base64:bytes.toString('base64')}});
 }
 async #dispatch(saved){
  const argv=['apply','--workspace',this.#entry.workspacePath,'--request',saved.file,'--expected-genesis',this.#entry.genesisSha256];
  if(saved.value.selection.expectedHead)argv.push('--expected-head',saved.value.selection.expectedHead);
  const result=await originalCLI(argv);
  const receipt={schema:'stellar-forge.tourism-original-receipt.v1',requestSha256:saved.value.requestSha256,operationId:saved.value.input.operationId,
   workspaceId:result.id,revision:result.receipt.revision,receipt:result.receipt};
  publish(saved.file+'.receipt.json',json(receipt));
  return{...receipt,replayed:result.state==='REPLAYED',current:summary(this.#current())};
 }
 replay(operationId){return this.#enqueue(()=>{const saved=this.#retained(operationId);need(saved,'Select an already retained original request.');return this.#dispatch(saved);});}
 operation(operationId){
  const saved=this.#retained(operationId);need(saved,'Select an original retained request.');
  const selected=this.#current(),operation=selected.record.workspace.operations.find(x=>x.id===operationId),receipt=optional(saved.file+'.receipt.json');
  if(operation)Engine[saved.value.action](selected.record.workspace,saved.value.input);
  return{operationId,action:saved.value.action,requestSha256:saved.value.requestSha256,state:operation?'COMMITTED':'PREPARED',
   committedRevision:operation?.revision??null,receiptSaved:receipt!==null,current:summary(selected)};
 }
 async originalFile({kind,id,expectedRevision,expectedHead,operationId}){
  if(kind==='operation'){const saved=this.#retained(operationId);need(saved,'Select an original retained operation.');const receipt=optional(saved.file+'.receipt.json');
   return{name:'Tourism_Original_Operation.json',type:'application/json',bytes:Buffer.from(json({request:saved.value,receipt:receipt?JSON.parse(utf8(receipt)):null,status:this.operation(operationId)}))};}
  const selected=this.#current(expectedRevision,expectedHead),ws=selected.record.workspace;let name,type,bytes;
  if(kind==='workspace'){name='Tourism_Working_Recovery.json';type='application/json';bytes=Buffer.from(selected.text,'utf8');}
  else if(kind==='source'){const row=ws.sources.find(x=>x.id===id);need(row,'Select an original complete CSV.');name='Tourism_Original_Source.csv';type='text/csv';bytes=Buffer.from(row.text,'utf8');}
  else if(kind==='original'){const row=ws.files.find(x=>x.id===id);need(row,'Select a complete retained original file.');name=row.filename;type=row.mime_type;bytes=Buffer.from(row.content_base64,'base64');}
  else if(kind==='report'){name='Tourism_Complete_Report.html';type='text/html';bytes=Buffer.from(Engine.renderReport(ws,id),'utf8');}
  else if(kind==='target'){const row=ws.targetPlans.find(x=>x.id===id);need(row,'Select an original prepared target.');name='Tourism_Prepared_Target.csv';type='text/csv';bytes=Buffer.from(row.csv,'utf8');}
  else if(kind==='returned'){const row=ws.targetReturns.find(x=>x.id===id);need(row,'Select an original observed return.');name='Tourism_Observed_Return.json';type='application/json';bytes=Buffer.from(json(row));}
  else if(kind==='working-html'||kind==='handover'){
   const source=await loadSource();
   if(kind==='working-html'){name='Tourism_Series_Workspace.html';type='text/html';bytes=Buffer.from(Portable.workingHTML(source,selected.record),'utf8');}
   else{name='Tourism_Series_Complete.zip';type='application/zip';bytes=Buffer.from(Portable.zipBytes(Portable.completeFiles(source,selected.record)));}
   this.#current(expectedRevision,selected.headSha256); // Finish against the same complete source snapshot.
  }else throw Error('Select one documented complete original file kind.');
  return{name,type,bytes};
 }
 async close(){this.#closed=true;await this.#tail;}
}
