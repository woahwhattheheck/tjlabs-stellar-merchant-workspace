#!/usr/bin/env node
// MIT. Complete agency source refresh, assigned review and client handover on the native OCDS workspace.
import {readFile,writeFile,rename,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,join,dirname,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {setup,openWorkspace,fileIdentity,documents,summarizeScope,collect,freshDirectory,write,writeWindow,previousWindow} from './pilot-operator.mjs';
import {TRACKER_COLUMNS,trackerCsv} from './tracker-core.mjs';

const RUN_SCHEMA='tjlabs.ocds.agency-source-runs.v1', WINDOW_SCHEMA='tjlabs.ocds.agency-window.v1';
const json=value=>JSON.stringify(value,null,2)+'\n';
const need=(test,message)=>{if(!test)throw Error(message);};
const readJson=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const identity=(selection)=>{const value={...selection};for(const key of ['revision','expectedRevision','createdAt','updatedAt','schema','receivedFromPackageId'])delete value[key];return canonical(value);};
const fail=error=>({code:error.code||error.name||'SOURCE_OPERATION_ERROR',message:error.message||String(error),details:error.details||null});
async function moduleFor(env) {
  const source=await import(pathToFileURL(join(env.config.productSourceDirectory,'source-window.mjs')).href);
  need(typeof source.SourceOperations==='function','Install the native source-window extension with this operator.');
  return source;
}
async function selectionConfig(env,filename) {
  const file=filename?resolve(filename):env.config.sourceSelectionsFile?resolve(env.base,env.config.sourceSelectionsFile):null;
  need(file,'Set sourceSelectionsFile to the saved client-to-publisher selection file.');
  const config=await readJson(file);
  need(config.schema==='tjlabs.ocds.agency-source-selections.v1'&&Array.isArray(config.portfolios),'Use the complete source-selections template.');
  const seen=new Set();
  for(const row of config.portfolios){
    const portfolio=env.config.portfolios.find(value=>value.id===row.portfolioId);
    need(portfolio&&!seen.has(row.portfolioId),'Source selections must identify one configured portfolio once.');
    seen.add(row.portfolioId);need(Array.isArray(row.selections),'Each portfolio source selection is an array.');
    for(const selection of row.selections)need(Array.isArray(selection.ocids)&&selection.ocids.length>0
      &&selection.ocids.every(ocid=>portfolio.selectedOcids.includes(ocid)),'Source '+selection.id+' must stay within '+portfolio.id+' selected OCIDs.');
  }
  return config;
}
function saveSelections(operations,rows) {
  const changes=[];
  for(const input of rows){
    const {expectedRevision,...selection}=input,previous=operations.state().selections.find(value=>value.id===selection.id);
    const normalized={...selection,label:selection.label||selection.id,owner:selection.owner||operations.workspace.operator,
      enabled:selection.enabled!==false,acquireDocuments:selection.acquireDocuments!==false,
      documentEditionScope:selection.documentEditionScope||'current'};
    if(previous&&identity(previous)===identity(normalized)){changes.push({id:previous.id,revision:previous.revision,changed:false});continue;}
    const expected=previous?expectedRevision:0;
    need(Number.isSafeInteger(expected)&&expected===(previous?.revision||0),
      'Selection '+selection.id+' changed. Copy its current saved revision into expectedRevision in this selection file.');
    const value=operations.saveSelection(selection,{expectedRevision:expected});
    changes.push({id:value.id,revision:value.revision,changed:true});
  }
  return changes;
}
async function importAcquired(env,portfolio,operations) {
  if(!env.config.sourceOriginalsFile)return [];
  const document=await readJson(resolve(env.base,env.config.sourceOriginalsFile));
  need(document.schema==='tjlabs.ocds.agency-source-originals.v1'&&Array.isArray(document.originals),'Use the source-originals template.');
  const results=[];
  for(const item of document.originals.filter(value=>value.portfolioIds?.includes(portfolio.id))){
    need(portfolio.selectedOcids.includes(item.ocid),'An original document must belong to the selected client portfolio.');
    const file=resolve(env.base,item.path),info=await stat(file);
    need(info.isFile()&&info.size<=operations.maxDocumentBytes,'Original document file exceeds this configured source capacity.');
    const result=operations.importOriginalDocument({selectionId:item.selectionId,ocid:item.ocid,documentId:item.documentId,
      body:await readFile(file),observation:item.observation});
    results.push({operationId:item.observation.operationId,windowId:result.window.id,sha256:item.observation.sha256});
  }
  return results;
}
async function importSourceAcquisitions(env,portfolio,operations,task,run,selectionIds,baseline,onRetained) {
  if(!env.config.sourceAcquisitionsFile)return;
  const packet=await readJson(resolve(env.base,env.config.sourceAcquisitionsFile));
  need(packet.schema==='tjlabs.ocds.agency-source-acquisitions.v1'&&Array.isArray(packet.acquisitions),'Use the source-acquisitions template.');
  const rows=packet.acquisitions.filter(value=>value.windowName===run.name&&value.portfolioIds?.includes(portfolio.id));
  for(const item of rows){
    need(selectionIds.includes(item.selectionId),'An acquired original must belong to an enabled client source selection.');
    const saved=task.windowId?operations.window(task.windowId):null;
    const source=saved?.sources.find(value=>value.selectionId===item.selectionId);
    if(source?.status==='complete'&&!source.observations.some(value=>value.operationId===item.observation?.operationId))continue;
    const file=resolve(env.base,item.path),info=await stat(file);
    need(info.isFile()&&info.size<=64*1024*1024,'The acquired original publisher JSON exceeds the native source capacity.');
    const result=operations.adoptSourceObservation({selectionId:item.selectionId,selectionIds,
      ...(saved?{windowId:saved.id,expectedWindowRevision:saved.revision}:{}),
      name:run.name,baseline,context:{agencyRunId:run.operationId,portfolioId:portfolio.id},
      rawBytes:await readFile(file),observation:item.observation});
    task.windowId=result.window.id;
    task.sourceAcquisitions=[...(task.sourceAcquisitions||[]).filter(value=>value.operationId!==item.observation.operationId),
      {operationId:item.observation.operationId,sourceId:item.observation.sha256,windowId:result.window.id,
        transport:item.observation.transport,retrievedAt:item.observation.retrievedAt||null,completedBy:item.observation.completedBy||null,repeated:result.repeated}];
    await onRetained();
  }
}
function sourceRow(env,portfolio,ocid,state,exportedAt) {
  const context=env.contexts.get(ocid)||{},row=Object.fromEntries(TRACKER_COLUMNS.map(key=>[key,'']));
  for(const key of TRACKER_COLUMNS.slice(0,17))if(context[key]!==undefined)row[key]=context[key];
  const assigned=state.work.filter(value=>value.ocid===ocid&&value.status!=='resolved').at(-1);
  row.portfolio_id=portfolio.id;row.ocid=ocid;row.review_state='';
  row.assigned_owner=assigned?.owner||state.selections.find(value=>value.ocids.includes(ocid))?.owner||'';
  row.next_action=assigned?.nextAction||context.next_action||'';
  row.change_summary='Official notice reference; original family capture remains in its saved source window. '
    +state.documents.filter(value=>value.ocid===ocid&&value.available).length+' original document references have retained bytes.';
  row.deadline_source_url=context.source_url||'';row.deadline_timezone=context.deadline_timezone||'';
  row.deadline_context_status='public-notice-reference';row.exported_at=exportedAt;
  return row;
}
function collectCurrent(env,portfolio,workspace,operations,prior,exportedAt) {
  return workspace._snapshot(()=>{
    const view=workspace.view(),present=portfolio.selectedOcids.filter(ocid=>view.projects.some(project=>project.ocid===ocid));
    const result=collect(env,{...portfolio,selectedOcids:present},workspace,prior,exportedAt);
    const source=operations.state(),missing=portfolio.selectedOcids.filter(ocid=>!present.includes(ocid));
    result.rows.push(...missing.map(ocid=>sourceRow(env,portfolio,ocid,source,exportedAt)));
    result.portfolio=portfolio;result.source=source;result.snapshot.pendingOcids=missing;
    result.snapshot.sourceWindowIds=source.windows.filter(window=>window.selectedOcids.some(ocid=>portfolio.selectedOcids.includes(ocid))).map(window=>window.id);
    result.prepared=portfolio.selectedOcids.length?operations.prepareHandoff({ocids:portfolio.selectedOcids}):null;
    return result;
  });
}
function measuredScope(env,results,manualDocuments) {
  const retained=new Map(manualDocuments.filter(value=>value.available).map(value=>[value.sha256,value]));
  for(const result of results)for(const value of result.source.documentBodies||[])if(!retained.has(value.sha256))
    retained.set(value.sha256,{...value,id:value.sha256,available:true,ocids:[]});
  const missing=manualDocuments.filter(value=>!value.available);
  const meter=summarizeScope(env,results,[...retained.values(),...missing]);
  meter.values.sourceDocumentObservations=results.reduce((total,value)=>total+value.source.documents.reduce((n,document)=>n+(document.observations||[]).length,0),0);
  meter.values.assignedReviewsOpen=results.reduce((total,value)=>total+value.source.work.filter(work=>work.status!=='resolved').length,0);
  meter.values.nativeProcessesAwaitingOriginal=results.reduce((total,value)=>total+(value.snapshot?.pendingOcids?.length||0),0);
  meter.definitions.originalDocumentBytes='Distinct retained original document-body SHA-256 values across all client source stores and the manual original-document register.';
  return meter;
}
async function manualFiles(env,portfolio,out,files) {
  const selected=new Set(portfolio.selectedOcids),items=[];
  for(const document of files.filter(value=>value.ocids.some(ocid=>selected.has(ocid)))){
    const {path,...metadata}=document;
    if(!document.available){items.push(metadata);continue;}
    const suffix=/^\.[A-Za-z0-9]{1,12}$/.test(extname(path))?extname(path):'.bin';
    const relativePath='manual-documents/'+document.id+suffix;
    await mkdir(join(out,'manual-documents'),{recursive:true,mode:0o700});
    await copyFile(path,join(out,relativePath),1);
    const copied=await fileIdentity(join(out,relativePath));
    need(copied.sha256===document.sha256&&copied.bytes===document.bytes,'An original document changed during client handoff: '+document.id);
    items.push({...metadata,relativePath});
  }
  await write(out,'manual-documents.json',json({schema:'tjlabs.ocds.agency-documents.v1',documents:items}));
}
async function exportPortfolio(env,result,operations,out,manual,exportedAt) {
  need(result.prepared,'Select client OCIDs before handover.');
  const receipt=await operations.exportDirectory(out,{prepared:result.prepared});
  const window={schema:WINDOW_SCHEMA,kind:'client-source-handoff',exportedAt,productReference:env.config.productReference,portfolios:[result.snapshot]};
  await writeWindow(out,window,result.rows,result.comparisons);
  const selected=new Set(result.portfolio.selectedOcids);
  await write(out,'source-contexts.json',json({schema:'tjlabs.ocds.agency-source-context.v1',contexts:[...env.contexts.values()].filter(value=>selected.has(value.ocid))}));
  await manualFiles(env,result.portfolio,out,manual);
  await write(out,'tracker-contract.json',json({schema:'tjlabs.ocds.agency-tracker.v1',columns:TRACKER_COLUMNS,
    rowIdentity:['portfolio_id','ocid'],sourceOnlyRows:'Original notice text remains in source fields; absent native entry IDs and review revisions stay empty. Assigned source work supplies owner and next action.',
    applicationImport:'Map this exact CSV through the agency product CSV importer.'}));
  return {...receipt,portfolioId:result.portfolio.id,rows:result.rows.length,pendingOcids:result.snapshot.pendingOcids};
}
async function saveRun(out,run) {
  const temporary=join(out,'source-window-runs.json.pending');
  await writeFile(temporary,json(run),{mode:0o600});
  await rename(temporary,join(out,'source-window-runs.json'));
}
async function savedRun(filename,env) {
  const run=await readJson(resolve(filename));
  need(run.schema===RUN_SCHEMA&&Array.isArray(run.portfolios),'--run must name this operator source-window-runs.json.');
  need(run.portfolios.every(item=>env.config.portfolios.some(portfolio=>portfolio.id===item.portfolioId)),
    'The saved refresh belongs to a different agency portfolio configuration.');
  return run;
}
export async function main(argv=process.argv.slice(2)) {
  const command=argv[0],{values}=parseArgs({args:argv.slice(1),allowPositionals:false,strict:true,
    options:Object.fromEntries(['config','out','name','baseline','portfolio','run','file','directory','expected-revision'].map(name=>[name,{type:'string'}]))});
  need(['source-select','source-state','refresh','refresh-resume','source-handoff','source-receive'].includes(command),'Unknown agency source operation.');
  const env=await setup(values.config),native=await moduleFor(env);
  if(command==='source-select'||command==='source-state'){
    const configuration=command==='source-select'?await selectionConfig(env,values.file):null,result=[];
    for(const portfolio of env.config.portfolios){
      const workspace=await openWorkspace(env,portfolio);
      try{const operations=new native.SourceOperations(workspace);
        result.push({portfolioId:portfolio.id,...(configuration?{selections:saveSelections(operations,configuration.portfolios.find(value=>value.portfolioId===portfolio.id)?.selections||[])}:{state:operations.state()})});
      }finally{workspace.close();}
    }process.stdout.write(json({portfolios:result}));return;
  }
  if(command==='source-receive'){
    const portfolio=env.config.portfolios.find(value=>value.id===values.portfolio);need(portfolio,'Choose one destination --portfolio.');
    need(values.directory,'Choose the complete source handoff --directory.');
    need(/^\d+$/.test(values['expected-revision']||''),'Supply the current destination --expected-revision.');
    const workspace=await openWorkspace(env,portfolio);
    try{const operations=new native.SourceOperations(workspace);const result=await operations.receiveHandoff(resolve(values.directory),{expectedRevision:Number(values['expected-revision'])});
      process.stdout.write(json({portfolioId:portfolio.id,...result}));}
    finally{workspace.close();}return;
  }
  const prior=await previousWindow(values.baseline),manual=await documents(env),exportedAt=new Date().toISOString();
  if(command==='source-handoff'){
    const portfolio=env.config.portfolios.find(value=>value.id===values.portfolio);need(portfolio,'Choose one client --portfolio.');
    need(values.out,'Choose a new client handoff --out directory.');
    const workspace=await openWorkspace(env,portfolio);
    try{const operations=new native.SourceOperations(workspace),result=collectCurrent(env,portfolio,workspace,operations,prior,exportedAt);
      const out=resolve(values.out);process.stdout.write(json(await exportPortfolio(env,result,operations,out,manual,exportedAt)));}
    finally{workspace.close();}return;
  }
  const continuing=command==='refresh-resume';
  const configuration=continuing?null:await selectionConfig(env);
  if(!continuing){need(typeof values.name==='string'&&values.name.trim(),'Name this fresh publication window with --name.');
    if(values.name!=='baseline')need(prior,'Following client windows require the previous exact --baseline window.json.');}
  let run=continuing?await savedRun(values.run,env):{
    schema:RUN_SCHEMA,operationId:randomUUID(),name:values.name,createdAt:new Date().toISOString(),status:'running',
    productReference:env.config.productReference,previousWindow:prior,
    portfolios:env.config.portfolios.filter(value=>value.selectedOcids.length).map(value=>({portfolioId:value.id,workspaceId:null,windowId:null,status:'pending',error:null}))};
  need(run.portfolios.length>0,'Assign original selected OCIDs to at least one client portfolio.');
  const effectivePrior=continuing?run.previousWindow:prior,out=await freshDirectory(values.out),attemptedAt=new Date().toISOString();
  run={...run,status:'running',continuedAt:continuing?attemptedAt:null,updatedAt:attemptedAt};
  await saveRun(out,run);
  const controller=new AbortController(),stop=()=>controller.abort(Error('Agency source refresh interrupted'));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const results=[],handoffs=[];
  try{
    for(const portfolio of env.config.portfolios){
      const workspace=await openWorkspace(env,portfolio),operations=new native.SourceOperations(workspace);
      try{
        const task=run.portfolios.find(value=>value.portfolioId===portfolio.id);
        if(task&&!controller.signal.aborted){
          const metadata=workspace.metadata();
          need(!task.workspaceId||task.workspaceId===metadata.id,'The saved source run belongs to another client workspace: '+portfolio.id);
          task.workspaceId=metadata.id;task.status='running';task.error=null;await saveRun(out,run);
          try{
            if(!continuing){
              const selections=configuration.portfolios.find(value=>value.portfolioId===portfolio.id)?.selections||[];
              need(selections.length>0,'Configure saved publisher selections for '+portfolio.id+'.');
              task.savedSelections=saveSelections(operations,selections);
            }
            if(!task.windowId){
              const matches=operations.state().windows.filter(value=>value.context?.agencyRunId===run.operationId&&value.context?.portfolioId===portfolio.id);
              need(matches.length<=1,'More than one original window is bound to this agency run.');
              if(matches.length)task.windowId=matches[0].id;
            }
            const activeSelections=operations.state().selections.filter(value=>value.enabled&&value.ocids.every(ocid=>portfolio.selectedOcids.includes(ocid)));
            const covered=new Set(activeSelections.flatMap(value=>value.ocids));
            need(portfolio.selectedOcids.every(ocid=>covered.has(ocid)),'Every selected client OCID needs an enabled saved publisher selection.');
            const earlier=effectivePrior?.portfolios?.find(value=>value.id===portfolio.id);
            if(earlier)need(earlier.workspace.id===metadata.id,'The previous window belongs to another client workspace.');
            const baseline=portfolio.selectedOcids.map(ocid=>({ocid,entryId:earlier?.projects?.find(project=>project.ocid===ocid)?.entryId || null}));
            await importSourceAcquisitions(env,portfolio,operations,task,run,activeSelections.map(value=>value.id),baseline,()=>saveRun(out,run));
            task.importedOriginals=await importAcquired(env,portfolio,operations);
            const input=task.windowId?{windowId:task.windowId}:{name:run.name,selectionIds:activeSelections.map(value=>value.id),
              ...(effectivePrior?{baseline}:{}),context:{agencyRunId:run.operationId,portfolioId:portfolio.id}};
            const result=await operations.run(input,{signal:controller.signal,onProgress:async progress=>{
              task.windowId=progress.windowId;task.status=progress.status;task.lastStage=progress.stage;run.updatedAt=new Date().toISOString();
              await saveRun(out,run);process.stderr.write(json({portfolioId:portfolio.id,...progress}));
            }});
            task.windowId=result.window.id;task.status=result.window.status;task.error=null;
          }catch(error){task.status='interrupted';task.error=fail(error);}
          await saveRun(out,run);
        }
        const collectedAt=new Date().toISOString();
        const result=collectCurrent(env,portfolio,workspace,operations,effectivePrior,collectedAt);results.push(result);
        if(result.prepared){
          const clientDirectory=join(out,'handoffs',portfolio.id);
          handoffs.push(await exportPortfolio(env,result,operations,clientDirectory,manual,result.snapshot.capturedAt));
        }
      }finally{workspace.close();}
    }
  }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  const meter=measuredScope(env,results,manual),window={
    schema:WINDOW_SCHEMA,kind:run.name,exportedAt:new Date().toISOString(),productReference:env.config.productReference,
    previousExportedAt:effectivePrior?.exportedAt||null,agencyRunId:run.operationId,
    sourceObservations:{state:run.portfolios.every(value=>value.status==='complete')?'observed-refresh':'partial-refresh',
      portfolios:run.portfolios.map(value=>({portfolioId:value.portfolioId,windowId:value.windowId,status:value.status,error:value.error,sourceAcquisitions:value.sourceAcquisitions||[]}))},
    portfolios:results.map(value=>value.snapshot)};
  run.status=controller.signal.aborted?'interrupted':run.portfolios.every(value=>value.status==='complete')?'complete':'partial';
  run.completedAt=new Date().toISOString();run.handoffs=handoffs;await saveRun(out,run);
  await writeWindow(out,window,results.flatMap(value=>value.rows),results.flatMap(value=>value.comparisons));
  await write(out,'scope-meter.json',json(meter));
  await write(out,'assigned-review-index.json',json({schema:'tjlabs.ocds.agency-source-review-index.v1',operationId:run.operationId,
    portfolios:results.map(value=>({portfolioId:value.portfolio.id,workspace:value.source.workspace,
      work:value.source.work,sourceWindows:value.source.windows.map(window=>({id:window.id,name:window.name,status:window.status}))}))}));
  process.stdout.write(json({directory:out,operationId:run.operationId,status:run.status,rows:results.reduce((n,value)=>n+value.rows.length,0),
    handoffs:handoffs.map(value=>({portfolioId:value.portfolioId,directory:value.directory,handoffId:value.handoffId,rows:value.rows,pendingOcids:value.pendingOcids})),
    scope:meter.values,overages:meter.overages}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{process.stderr.write(json({error:fail(error)}));process.exitCode=1;});
