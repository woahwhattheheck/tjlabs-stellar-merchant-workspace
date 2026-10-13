// MIT. Operate the new adapter on the one already-open original Research listener.
import {readFile,open,mkdir,rename} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const need=(v,m)=>{if(!v)throw Error(m);};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function save(path,value){await mkdir(dirname(path),{recursive:true});const body=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n');
 const f=await open(path+'.writing','w',0o600);try{await f.writeFile(body);await f.sync();}finally{await f.close();}await rename(path+'.writing',path);}
async function optional(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function receiveStudyFlowMcp({app,sourceRoot,operationDirectory,baseline,signal}){
 const out=join(resolve(operationDirectory),'mcp-receiving'),journalPath=join(out,'operation.json');
 let journal=await optional(journalPath);
 if(journal?.complete)return journal;
 if(!journal)journal={schema:'commons.study-flow-mcp-receiving/v1',operationId:baseline.operationId,dossierId:baseline.dossierId,
  originalRevision:baseline.native.revision,workspaceId:app.workspaceId,startedAt:new Date().toISOString(),steps:{},exports:[]};
 need(journal.operationId===baseline.operationId&&journal.dossierId===baseline.dossierId&&journal.workspaceId===app.workspaceId,'Original MCP receiving binding changed');
 const checkpoint=()=>save(journalPath,journal);
 const phase=async(name,run)=>{if(signal?.aborted)throw Error('MCP receiving cancelled');if(journal.steps[name]?.complete)return journal.steps[name].value;
  journal.phase=name;await checkpoint();console.log(JSON.stringify({phase:'mcp-'+name,state:'running'}));const value=await run();
  journal.steps[name]={complete:true,value,completedAt:new Date().toISOString()};await checkpoint();return value;};
 const prefix=join(resolve(sourceRoot),'stellar-forge/mcp-merchant-operator');
 const {MerchantResearchWorkspaces}=await import(pathToFileURL(join(prefix,'research-workspace.mjs')).href);
 const {researchWorkspaceTools}=await import(pathToFileURL(join(prefix,'catalog/research-workspace.mjs')).href);
 const definitions=researchWorkspaceTools((name,description,properties,required,annotations)=>({name,description,properties,required,annotations}));
 const tools=definitions.filter(v=>v.name.startsWith('merchant_research_study_flow'));
 need(tools.length===6,'Original provider catalog does not expose all six Study Flow tools');
 const connection=join(out,'private','original-connection.json');
 await save(connection,{schema:'stellar-forge.research-workspace-connection.v1',mode:'RESEARCH_DOSSIER_WORKSPACE',url:app.url,
  workspaceId:app.workspaceId,instanceId:app.instanceId});
 const config={exportsDirectory:join(out,'exports'),researchWorkspaces:{workspaces:{original:{
  label:'Original retained Study Flow dossier',consoleUrlFile:connection,directory:join(operationDirectory,'dossiers'),sources:{}}}}};
 let merchant=new MerchantResearchWorkspaces(config);
 const call=(name,args={})=>merchant.call(name,{workspace:'original',...args});
 const selected={dossierId:baseline.dossierId,revision:baseline.native.revision};
 const attach=async()=>{const r=await call('merchant_research_attach');need(r.status.workspaceId===app.workspaceId,'Original attachment workspace changed');return r;};
 try{
  await attach();
  await phase('catalog-and-original-source',async()=>{
   const source=await call('merchant_research_study_flow_sources',{...selected,questionId:baseline.questionId,offset:0,limit:1});
   const next=await call('merchant_research_study_flow_sources',{...selected,questionId:baseline.questionId,offset:source.nextOffset,limit:1});
   need(source.total===2&&source.items.length===1&&source.nextOffset===1&&next.items.length===1&&next.nextOffset===null,'Original source pagination changed');
   await save(join(out,'sources.json'),{pages:[source,next]});
   return {toolNames:tools.map(v=>v.name),providerTools:definitions.length,revision:source.dossier.revision,occurrences:2,complete:true};
  });
  const full=await call('merchant_research_study_flow_report',{...selected,editionId:baseline.native.updateEditionId});
  need(full.report.summary.records===2&&full.report.summary.reportingComplete===false,'Original report scope changed');
  await phase('preview-and-original-count-input',async()=>{
   const body=await readFile(join(operationDirectory,'inputs','selected-original-record-counts.csv'),'utf8');
   const parsed=await call('merchant_research_study_flow_import_counts',{dossierId:baseline.dossierId,expectedRevision:baseline.native.revision,
    body,filename:'selected-original-record-counts.csv',reference:'Original retained metadata reporting counts',reason:'Receive the original authored count input through the existing Research attachment'});
   need(parsed.sha256===sha(Buffer.from(body))&&parsed.importFile.body===body,'Original count input bytes changed');
   const preview=await call('merchant_research_study_flow_preview',{dossierId:baseline.dossierId,expectedRevision:baseline.native.revision,
    flowId:baseline.native.updateFlowId,sourceMode:'retained',basisEditionId:baseline.native.updateEditionId,definition:full.report.definition});
   need(preview.report.summary.records===2&&preview.report.summary.reportingComplete===false,'Original preview scope changed');
   await save(join(out,'preview.json'),preview);await save(join(out,'import-counts.json'),parsed);
   return {revision:preview.dossier.revision,countInputSha256:parsed.sha256,summary:preview.report.summary};
  });
  await phase('recover-original-request',async()=>{
   const history=await call('merchant_research_study_flow',{...selected,flowId:baseline.native.updateFlowId,section:'operations',limit:100});
   const retained=history.items.find(v=>v.action==='review');need(retained?.request,'Original reviewed request absent');
   await save(join(out,'original-review-request.json'),retained.request);
   const replay=await call('merchant_research_study_flow_review',{dossierId:baseline.dossierId,...retained.request});
   need(replay.duplicate===true&&replay.operation.requestId===retained.requestId&&replay.dossier.revision===baseline.native.revision,'Original exact request recovery changed history');
   await save(join(out,'original-review-response.json'),replay);
   return {requestId:retained.requestId,duplicate:true,revision:replay.dossier.revision};
  });
  const labels=[['study-flow-json','.json'],['study-flow-svg','.svg'],['study-flow-html','.html'],
   ...['counts','records','reports','studies','reasons','issues'].map(section=>['study-flow-csv','-'+section+'.csv',section])];
  for(const[kind,suffix,flowSection]of labels){
   await phase('export-'+(flowSection??kind),async()=>{
    const expected=baseline.native.files.find(f=>f.filename==='study-flow-'+baseline.native.updateEditionId+suffix);
    // Reconcile an accepted export whose reply/checkpoint was interrupted.
    const retained=[];let next={offset:0,limit:100};
    while(next){const inventory=await call('merchant_research_exports',{dossierId:baseline.dossierId,...next});
     retained.push(...inventory.items);next=inventory.next;}
    const existing=retained.filter(v=>v.kind===kind&&v.selection?.revision===selected.revision&&
     v.selection?.flowEditionId===baseline.native.updateEditionId&&
     (flowSection===undefined||v.selection.section===flowSection)&&(!expected||v.exportId===expected.sha256));
    let receipt=existing.at(-1);
    if(receipt)receipt={workspace:'original',...receipt,state:receipt.verification?'RETAINED_DIGEST_MISMATCH':'RETAINED'};
    else receipt=await call('merchant_research_export',{...selected,kind,flowEditionId:baseline.native.updateEditionId,
     ...(flowSection?{flowSection}:{}),...(expected?{expectedSha256:expected.sha256}:{})});
    need(receipt.state==='RETAINED'&&receipt.selection.flowEditionId===baseline.native.updateEditionId,'Original export receipt changed');
    if(expected)need(receipt.bytes===expected.bytes&&receipt.exportId===expected.sha256,'Original exported bytes differ');
    journal.exports.push(receipt);await save(join(out,'receipt-'+(flowSection??kind)+'.json'),receipt);return receipt;
   });
  }
  await phase('original-reader-restart',async()=>{
   const receipt=journal.exports.find(v=>v.kind==='study-flow-svg');need(receipt,'Retained original SVG required');
   const prefix=await call('merchant_research_file_read',{kind:receipt.kind,exportId:receipt.exportId,offset:0,limit:512});
   need(prefix.bytesRead===512&&prefix.nextOffset===512,'Original prefix read changed');
   const bytes=[Buffer.from(prefix.data,'base64')];await save(join(out,'svg-prefix.bin'),bytes[0]);
   await merchant.close();merchant=new MerchantResearchWorkspaces(config);await attach();
   let offset=512,readId;
   while(offset!==null){
    const chunk=await call('merchant_research_file_read',{kind:receipt.kind,exportId:receipt.exportId,offset,limit:1024,...(readId?{readId}:{})});
    need(chunk.offset===offset&&chunk.file.sha256===receipt.exportId&&chunk.file.bytes===receipt.bytes,'Original resumed reader identity changed');
    bytes.push(Buffer.from(chunk.data,'base64'));offset=chunk.nextOffset;readId=chunk.readId;
   }
   const complete=Buffer.concat(bytes);need(complete.length===receipt.bytes&&sha(complete)===receipt.exportId,'Complete original SVG receiving mismatch');
   await save(join(out,'received-original.svg'),complete);
   const inventory=await call('merchant_research_exports',{dossierId:baseline.dossierId,offset:0,limit:100});
   need(inventory.items.some(v=>v.exportId===receipt.exportId&&v.kind===receipt.kind),'Retained export inventory lost after attachment restart');
   await save(join(out,'retained-exports-after-restart.json'),inventory);
   return {bytes:complete.length,sha256:sha(complete),prefix:512,restarted:true,complete:true,retainedExports:inventory.total};
  });
  const after=await call('merchant_research_study_flow',selected);
  need(after.dossier.revision===baseline.native.revision,'MCP receiving changed the accepted dossier revision');
  journal.complete=true;journal.completedAt=new Date().toISOString();journal.finalRevision=after.dossier.revision;
  journal.actualScope='Existing provider catalog and attachment; original source pagination/report/count import/retained preview; exact already-committed request recovery; nine complete original exports; byte-complete reader recovery after attachment restart. No new search, source, screening, flow edition or paid request.';
  await checkpoint();await save(join(out,'result.json'),journal);return journal;
 }catch(error){journal.error={at:new Date().toISOString(),phase:journal.phase,message:error.message};await checkpoint().catch(()=>{});throw error;}
 finally{await merchant.close();}
}
