#!/usr/bin/env node
// MIT. Original collection-review core with create-only portable files and existing asset server.
import { open, mkdir, link, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { startSetupServer } from './serve.mjs';
import { createCollectionWorkspace,addCollectionSource,collectionDraft,saveCollectionRevision,receiveCollectionWorkspace,
 createCollectionPacket,openCollectionPacket,collectionReport,createCollectionArchive,collectionSourceTables,retainCollectionWorkingCopy,collectionEditionReport,prepareCollectionEditionRequest } from './dist/collection-review-workspace.mjs';
import { renderCollectionReview } from './dist/collection-review-report.mjs';
import { renderCollectionEditionComparison } from './dist/collection-review-edition-report.mjs';
import { assertCollectionPublication } from './dist/collection-review-publication.mjs';
const json=value=>JSON.stringify(value,null,2)+'\n';
async function read(path,limit=64*1024*1024){
 const file=await open(resolve(path),constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
 try{const stat=await file.stat();if(!stat.isFile()||stat.size>limit)throw Error('Select an ordinary complete file within the supported size limit.');
 const bytes=await file.readFile();if(bytes.length!==stat.size||bytes.length>limit)throw Error('The selected input changed while being read.');
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}finally{await file.close();}
}
async function write(path,value){
 const target=resolve(path),temporary=target+'.'+randomUUID()+'.tmp',bytes=typeof value==='string'||value instanceof Uint8Array?value:json(value);
 await mkdir(dirname(target),{recursive:true});let file;
 try{file=await open(temporary,'wx',0o600);await file.writeFile(bytes);await file.sync();await file.close();file=null;
 await link(temporary,target);const dir=await open(dirname(target),'r');try{await dir.sync();}finally{await dir.close();}}
 finally{if(file)await file.close();await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 return target;
}
function options(argv){
 const result={};for(let i=0;i<argv.length;i++){const key=argv[i];if(!/^--[a-z-]+$/.test(key)||Object.hasOwn(result,key.slice(2)))throw Error('Use each named option once.');
 const name=key.slice(2);if(['native','select-all'].includes(name)){result[name]=true;continue;}if(argv[i+1]===undefined||argv[i+1].startsWith('--'))throw Error('Supply a value for '+key);result[name]=argv[++i];}return result;
}
const needed=(o,key)=>{if(!o[key])throw Error('Supply --'+key);return o[key];};
export const COLLECTION_REVIEW_HELP='Collection review\n\n'+
 'serve [--port 8787]\n'+
 'init --name NAME --actor OPERATOR --out NEW_WORKSPACE.json\n'+
 'source --project WORKSPACE --file ORIGINAL --format archiveblack-html|structured-json --url ORIGINAL_URL --observed-at ISO --out NEW_WORKSPACE.json\n'+
 'show --project WORKSPACE [--revision REVISION_ID]\n'+
 'publish --project WORKSPACE --out NEW_SHAREABLE_PACKET.json\n'+
 'publication-check --file COMPLETE_UTF8_OR_JSON_ARTIFACT\n'+
 'draft --project WORKSPACE [--revision REVISION_ID] [--select-all] --out NEW_DRAFT.json\n'+
 'prepare --project WORKSPACE --draft DRAFT.json --actor OPERATOR [--note NOTE] --out NEW_REQUEST.json\n'+
 'compare-editions --project WORKSPACE --from SOURCE_ID --to SOURCE_ID [--draft DRAFT.json] --out NEW_PLAN.json\n'+
 'edition-report --project WORKSPACE --plan PLAN.json --out NEW_COMPARISON.html\n'+
 'prepare-edition --project WORKSPACE --plan PLAN.json --actor OPERATOR [--note NOTE] --out NEW_REQUEST.json\n'+
 'save --project WORKSPACE --request ORIGINAL_REQUEST.json --out NEW_WORKSPACE.json\n'+
 'keep-draft --project WORKSPACE --draft UNFINISHED_TEXT --actor OPERATOR [--note NOTE] --out NEW_WORKSPACE.json\n'+
 'receive --project LOCAL_WORKSPACE --incoming COLLEAGUE_WORKSPACE --out NEW_WORKSPACE.json\n'+
 'report --project WORKSPACE [--revision REVISION_ID] --out NEW_REVIEW.html\n'+
 'tables --project WORKSPACE [--revision REVISION_ID] --out NEW_SOURCE_TABLES_PROJECT.json\n'+
 'export --project WORKSPACE [--revision REVISION_ID] [--native] --out NEW_COLLECTION.zip\n\n'+
 'Every output uses a new file. Save retries use the same prepared request. Receiving keeps the current local head and all incoming branches. Sources and linked media are never fetched by these commands.\n';
export async function runCollectionReview(argv=[]){
 const [command='help',...rest]=argv;if(['help','--help','-h'].includes(command)){console.log(COLLECTION_REVIEW_HELP);return;}
 const o=options(rest);
 if(command==='serve'){
  const port=o.port===undefined?8787:Number(o.port);if(!Number.isInteger(port)||port<0||port>65535)throw Error('Use a port from 0 through65535.');
  const handle=await startSetupServer({port,entry:'/collection-review.html'}),stop=()=>handle.stop();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);handle.server.once('close',()=>{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);});
  console.log(json({url:handle.url,port:handle.port,entry:handle.entry,note:'Keep this same origin for browser drafts; export complete packets for another device.'}));return;
 }
 if(command==='init'){
  const w=await createCollectionWorkspace({name:needed(o,'name'),actor:needed(o,'actor')});console.log(json({out:await write(needed(o,'out'),await createCollectionPacket(w)),workspaceId:w.id,revision:w.headId}));return;
 }
 if(command==='publication-check'){console.log(json(assertCollectionPublication(await read(needed(o,'file')))));return;}
 const w=await openCollectionPacket(await read(needed(o,'project')));
 let output,detail={workspaceId:w.id};
 if(command==='show'){console.log(json(await collectionReport(w,o.revision||w.headId)));return;}
 if(command==='source'){
  const result=await addCollectionSource(w,{format:needed(o,'format'),sourceText:await read(needed(o,'file'),4*1024*1024),filename:resolve(o.file).split(/[\\/]/).pop(),
   url:needed(o,'url'),observedAt:needed(o,'observed-at')});output=await createCollectionPacket(result.workspace);detail={...detail,sourceId:result.source.id,occurrences:result.source.entries.length,reused:result.reused};
 }else if(command==='draft'){
  output=collectionDraft(w,o.revision||w.headId);if(o['select-all'])output.collectionIds=w.sources.map(s=>s.id);
 }else if(command==='compare-editions'){
  const state=o.draft?JSON.parse(await read(o.draft,2*1024*1024)):collectionDraft(w),fromSourceId=needed(o,'from'),toSourceId=needed(o,'to');
  const comparison=await collectionEditionReport(w,{state,fromSourceId,toSourceId});
  output={schema:'stellar-forge.collection-edition-input.v1',expectedRevision:w.headId,fromSourceId,toSourceId,state,decisions:comparison.rows.map(row=>row.decision)};
  detail={...detail,counts:comparison.counts,note:'Resolve each original occurrence in this retained plan; prepare-edition produces the same original save request format.'};
 }else if(command==='edition-report'||command==='prepare-edition'){
  const plan=JSON.parse(await read(needed(o,'plan'),16*1024*1024));
  if(plan.schema!=='stellar-forge.collection-edition-input.v1')throw Error('Choose the original complete edition plan.');
  if(command==='edition-report')output=renderCollectionEditionComparison(await collectionEditionReport(w,{baseRevision:plan.expectedRevision,state:plan.state,fromSourceId:plan.fromSourceId,toSourceId:plan.toSourceId,decisions:plan.decisions}));
  else{const result=await prepareCollectionEditionRequest(w,{id:randomUUID(),expectedRevision:plan.expectedRevision,actor:needed(o,'actor'),note:o.note||'',createdAt:new Date().toISOString(),state:plan.state,fromSourceId:plan.fromSourceId,toSourceId:plan.toSourceId,decisions:plan.decisions});output=result.request;detail={...detail,requestId:output.id,effects:result.report.effects};}
 }else if(command==='prepare'){
  output={id:randomUUID(),expectedRevision:w.headId,actor:needed(o,'actor'),note:o.note||'',createdAt:new Date().toISOString(),state:JSON.parse(await read(needed(o,'draft'),2*1024*1024))};
  await saveCollectionRevision(w,output);detail.requestId=output.id; // pure validation; no mutation is published
 }else if(command==='save'){
  const request=JSON.parse(await read(needed(o,'request'),64*1024*1024)),result=await saveCollectionRevision(w,request);
  output=await createCollectionPacket(result.workspace);detail={...detail,revision:result.revision.id,reused:result.reused};
 }else if(command==='keep-draft'){
  const stateText=await read(needed(o,'draft'),2*1024*1024),result=await retainCollectionWorkingCopy(w,{baseRevision:w.headId,stateText,actor:needed(o,'actor'),note:o.note||''});
  output=await createCollectionPacket(result.workspace);detail.workingCopy=result.draft.id;
 }else if(command==='receive'){
  const result=await receiveCollectionWorkspace(w,await openCollectionPacket(await read(needed(o,'incoming'))));
  output=await createCollectionPacket(result.workspace);detail={...detail,receivedHeadId:result.receivedHeadId,preservedHeadId:result.preservedHeadId};
 }else if(command==='publish'){
  output=await createCollectionPacket(w);detail.publication=assertCollectionPublication(output);
 }else if(command==='report'){output=renderCollectionReview(await collectionReport(w,o.revision||w.headId));
 }else if(command==='tables'){output=(await collectionSourceTables(w,o.revision||w.headId)).project;
 }else if(command==='export'){const result=await createCollectionArchive(w,o.revision||w.headId,{native:Boolean(o.native)});output=result.bytes;detail={...detail,files:result.manifest.files.length,bytes:output.length,revision:result.manifest.selectedRevisionId};
 }else throw Error('Choose a supported collection-review command. Use help.');
 detail.out=await write(needed(o,'out'),output);console.log(json(detail));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 runCollectionReview(process.argv.slice(2)).catch(error=>{console.error(json({error:error.code||'COLLECTION_REVIEW',message:error.message}));process.exitCode=1;});
