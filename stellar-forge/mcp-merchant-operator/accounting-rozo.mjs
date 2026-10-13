// MIT. Configured MCP operations borrow the original opened Accounting workspace.
import { RozoAccountingWorkspace } from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/rozo-workspace.mjs';
import { createHash } from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,message)=>Object.assign(new Error(message),{code});
const page=(items,args,view)=>{const offset=args.offset??0,limit=args.limit??25;return {view,total:items.length,offset,limit,items:items.slice(offset,offset+limit)};};
const fields=(value,names)=>Object.fromEntries(names.filter(name=>value[name]!==undefined).map(name=>[name,value[name]]));
const commands={
 source_review:['source.review',['captureId','decision','reason']],
 coding_save:['coding.save',['movementId','basisSha256','expectedVersion','recognitionDate','reason','providerEvidenceAcknowledged','allocations']],
 disposition_save:['disposition.save',['period','movementId','basisSha256','missing','kind','reason']],
 period_review:['period.review',['period','sourceIds','dataContext','contextSha256','note']],
 period_close:['period.close',['reviewId','contextSha256','note']],
 period_reopen:['period.reopen',['closeId','reason']]
};
function request(args,command,payload){return {schema:'stellar-forge.rozo-accounting-request.v1',
 requestId:args.requestId,expectedRevision:args.expectedRevision,actor:args.actor,command,payload};}
async function sourceInput(args,loadSource){
 const raw=await loadSource(args.source,64*1024*1024);
 if(!raw.length||digest(raw)!==args.sourceSha256)throw fail('ACCOUNTING_ROZO_SOURCE_CHANGED','The host-declared original ROZO source differs from the selected SHA-256.');
 return {...fields(args,['name','provenance','dataContext']),contentBase64:raw.toString('base64'),sha256:args.sourceSha256};
}
export async function callRozoAccounting(workspace,accountant,operation,args,loadSource){
 const rozo=new RozoAccountingWorkspace(workspace),action=operation.slice('merchant_accounting_rozo_'.length);
 if(action==='status'){
  const {sources,captures,rows,periods,closes,reviews,requests,...metadata}=await rozo.view();
  const lists={sources,captures,rows,closes,reviews,requests,periods:periods.definitions??[]};
  const view=args.view??'summary';
  return {...metadata,periodSelection:periods.selection??null,counts:Object.fromEntries(Object.entries(lists).map(([key,items])=>[key,items.length])),
   ...(view==='summary'?{}:{page:page(lists[view],args,view)})};
 }
 if(action==='source_preview'){
  const {movements,pending,...preview}=await rozo.previewSource(await sourceInput(args,loadSource));
  return {...preview,pending,page:page(movements,args,'movements')};
 }
 if(action==='source_capture')return rozo.mutate(request(args,'source.capture',
  {...await sourceInput(args,loadSource),previewSha256:args.previewSha256}));
 if(commands[action]){const [command,names]=commands[action];return rozo.mutate(request(args,command,fields(args,names)));}
 if(action==='period_save'){
  const {state,...saved}=await rozo.savePeriod({...fields(args,['requestId','id','expectedVersion','name','from','until','note','select','actor']),revision:args.expectedRevision});
  return {...saved,revision:state.revision,workspaceId:rozo.binding().workspaceId};
 }
 if(action==='period_preview'){
  const preview=await rozo.periodPreview(fields(args,['period','sourceIds','dataContext']));
  const arrays=['issues','lines','excluded','outside','sourceCaptures'],view=args.view??'summary';
  const metadata=Object.fromEntries(Object.entries(preview).filter(([key])=>!arrays.includes(key)));
  return {...metadata,counts:Object.fromEntries(arrays.map(key=>[key,preview[key]?.length??0])),
   ...(view==='summary'?{}:{page:page(preview[view]??[],args,view)})};
 }
 if(action==='request')return rozo.status(args.requestId);
 if(action==='resume')return rozo.resume(args.requestId);
 if(action==='accountant_prepare'||action==='accountant_create'){
  const file=await rozo.closeFile(args.closeId);
  if(file.row.status!=='CLOSED')throw fail('ACCOUNTING_ROZO_CLOSE_REOPENED','Select the current issued original ROZO close after completing any correction.');
  if(digest(file.bytes)!==args.sourceSha256)throw fail('ACCOUNTING_ROZO_CLOSE_CHANGED','The issued original close differs from the reviewed SHA-256.');
  const rozoSource={contentBase64:file.bytes.toString('base64'),sha256:args.sourceSha256};
  if(action==='accountant_prepare')return accountant.prepareRozo({rozoSource});
  return accountant.create({...fields(args,['id','name','actor','revision']),rozoSource});
 }
 throw fail('ACCOUNTING_UNKNOWN_TOOL','Choose an advertised original ROZO accounting tool.');
}
