// SPDX-License-Identifier: MIT
import { mkdir, readFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createEconDataClient } from './econdata-client.mjs';
import { SCHEMA, identity, canonical, clone, now, key, text, readJson, writeJson, writeAtomic,
  blob, readBlob, workspaceLease, encodePacket, decodePacket, sha } from './io.mjs';
import { seriesCatalog, describeCapture, reviewSelection, createReport, renderReport, compareBriefings } from './briefing.mjs';
import { withOecd, acquireOecdEdition } from './oecd-bridge.mjs';
import { createCustomerReviews, reviewObjects, verifyReviews } from './customer-reviews.mjs';

const INITIAL_CONFIG={credentialEnv:'ECONDATA_CREDENTIALS',baseUrl:'https://www.econdata.co.za/sdmx-codera/v1',
  timeoutMs:120000,maxResponseBytes:64*1024*1024};
function configuration(input={}) {
  const value={...INITIAL_CONFIG,...input};
  value.baseUrl=new URL(value.baseUrl).href.replace(/\/+$/,'');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.credentialEnv)) throw new Error('Select a credential environment variable name');
  const allowed=new Set([...Object.keys(INITIAL_CONFIG),'authUrl','oecd']);
  for (const name of Object.keys(value)) if(!allowed.has(name)) throw new Error('Unknown source configuration: '+name);
  if (value.oecd) {
    if (typeof value.oecd !== 'object') throw new Error('Use the original installed OECD launch configuration');
    for(const name of Object.keys(value.oecd)) if(!['client_module','project_directory','python','create'].includes(name))
      throw new Error('Unknown OECD launch setting: '+name);
  }
  return value;
}
export async function openWorkspace(directory,{create=false,label='Economic client workspace',config={}}={}) {
  directory=resolve(directory);
  const release=await workspaceLease(directory);
  try {
    const path=join(directory,'project.json');
    let state=await readJson(path,null);
    if (!state) {
      if(!create) throw new Error('Select the existing client workspace or create it explicitly');
      state={schema:SCHEMA,project_id:randomUUID(),label:text(label,'project label',300),created_at:now(),
        revision:0,config:configuration(config),draft:null,captures:{},registries:{},companions:{},briefings:{},
        active_briefing:null,requests:{}};
      await writeJson(path,state);
    }
    if(state.schema!==SCHEMA)throw new Error('Unknown client workspace');
    let closed=false;
    const client=()=>createEconDataClient({directory:join(directory,'econdata'),...state.config,
      oecd:undefined});
    async function save(){state.updated_at=now();await writeJson(path,state);}
    function ensure(){if(closed)throw new Error('Workspace is closed');}
    async function perform(operationId,action,input,run) {
      ensure();key(operationId,'operation identity');
      const request={action,input:clone(input)},hash=identity(request);
      let operation=state.requests[operationId];
      if(operation && operation.request_sha256!==hash)throw new Error('Continue the same operation with its original input');
      if(operation?.state==='COMPLETE')return clone(operation.result);
      if(!operation)operation=state.requests[operationId]={operation_id:operationId,request_sha256:hash,
        request,started_at:now(),state:'STARTED'};
      operation.state='RUNNING';delete operation.error;await save();
      try {
        const result=await run(operation);
        operation.result=clone(result);operation.state='COMPLETE';operation.finished_at=now();await save();
        return clone(result);
      } catch(error) {
        operation.state='ATTENTION';operation.error={name:error.name,message:error.message,at:now()};
        await save();throw error;
      }
    }
    const reviews=createCustomerReviews({directory,getState:()=>state,perform,readSource:id=>client().readSource(id)});
    function summary(){
      return {schema:state.schema,project_id:state.project_id,label:state.label,revision:state.revision,config:state.config,
        created_at:state.created_at,updated_at:state.updated_at,draft:state.draft,
        captures:Object.values(state.captures).map(c=>({id:c.operation_id,state:c.state,dataset_ref:c.dataset_ref,
          release:c.release,acquired_at:c.acquired_at,series_count:c.state==='COMPLETE'?seriesCatalog(c).length:0})),
        registries:Object.keys(state.registries),companions:Object.values(state.companions),
        briefings:Object.values(state.briefings).map(b=>({id:b.id,revision:b.revision,title:b.title,created_at:b.created_at,files:b.files})),
        active_briefing:state.active_briefing,reviews:reviews.list(),
        requests:Object.values(state.requests).map(r=>({operation_id:r.operation_id,action:r.request.action,
          state:r.state,error:r.error,result:r.state==='COMPLETE'?r.result:undefined}))};
    }
    const api={
      directory,
      async close(){if(!closed){closed=true;await release();}},
      state:()=>clone(summary()),
      request:id=>{const value=state.requests[key(id)];if(!value)throw new Error('Unknown saved operation');return clone(value);},
      configure:(id,input)=>perform(id,'configure',input,async()=>{
        if(input.expected_revision!==state.revision)throw new Error('Refresh the current project revision');
        const chosen=configuration(input.config);
        if(Object.values(state.requests).some(r=>['registry','capture'].includes(r.request.action))&&
          chosen.baseUrl!==configuration(state.config).baseUrl)throw new Error('Keep the original API authority for this retained source project');
        state.config=chosen;state.revision++;return {revision:state.revision,config:state.config};
      }),
      registry:(id,input)=>perform(id,'registry',input,async()=>{
        const result=await client().registry(id,input);
        if(result.state!=='COMPLETE')throw new Error('The original registry operation needs continuation');
        state.registries[id]=result;return result;
      }),
      registryResult:id=>clone(state.registries[key(id)]??null),
      capture:(id,input)=>perform(id,'capture',input,async()=>{
        const result=await client().capture(id,input);
        if(result.state!=='COMPLETE')throw new Error('The original source capture needs continuation');
        // Complete shape validation occurs before it becomes a selectable source.
        seriesCatalog(result);state.captures[id]=result;
        return {capture_id:id,...describeCapture(result)};
      }),
      captureInfo:id=>{const c=state.captures[key(id)];if(!c)throw new Error('Unknown source capture');return describeCapture(c);},
      rows:(id,seriesId,{offset=0,limit=100}={})=>{
        if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new Error('Use an exact row range, at most 1000 rows');
        const capture=state.captures[key(id)];if(!capture)throw new Error('Unknown capture');
        const series=seriesCatalog(capture).find(s=>s.id===seriesId);if(!series)throw new Error('Unknown original series');
        return {capture_id:id,series_id:seriesId,total:series.observation_count,offset,
          next_offset:offset+limit<series.observation_count?offset+limit:null,rows:series.observations.slice(offset,offset+limit)};
      },
      saveDraft:(id,input)=>perform(id,'save-draft',input,async()=>{
        if(input.expected_revision!==state.revision)throw new Error('Refresh the current project revision');
        state.draft=clone(input.draft);state.revision++;return {revision:state.revision,draft:state.draft};
      }),
      preview:input=>reviewSelection(input,state.captures),
      saveBriefing:(id,input)=>perform(id,'save-briefing',input,async operation=>{
        if(input.expected_revision!==state.revision)throw new Error('Refresh the current project revision before saving a new edition');
        const previous=state.active_briefing?state.briefings[state.active_briefing].report:null;
        const report=createReport(input.draft,state.captures,{projectId:state.project_id,
          revision:Object.keys(state.briefings).length+1,previous,companions:state.companions,createdAt:operation.started_at});
        const companionBodies={};
        for(const c of report.companions)if(c.files['briefing.html'])companionBodies[c.id]=(await readBlob(directory,c.files['briefing.html'])).toString('utf8');
        const originals=renderReport(report,companionBodies),files={};
        for(const[name,content]of Object.entries(originals))files[name]=await blob(directory,content);
        state.briefings[report.id]={id:report.id,revision:report.revision,title:report.title,created_at:report.created_at,report,files};
        state.active_briefing=report.id;state.draft=clone(input.draft);state.revision++;
        return {id:report.id,revision:state.revision,edition:report.revision,files};
      }),
      briefing:id=>{const b=state.briefings[key(id)];if(!b)throw new Error('Unknown saved briefing');return clone(b);},
      activate:(id,input)=>perform(id,'activate',input,async()=>{
        if(input.expected_revision!==state.revision)throw new Error('Refresh the current project revision');
        if(!state.briefings[key(input.briefing_id)])throw new Error('Unknown saved briefing');
        state.active_briefing=input.briefing_id;state.revision++;return {active_briefing:state.active_briefing,revision:state.revision};
      }),
      compare:(before,after)=>{
        const a=state.briefings[key(before)],b=state.briefings[key(after)];
        if(!a||!b)throw new Error('Select two original saved briefings');
        return compareBriefings(a.report,b.report);
      },
      file:async(id,name)=>{
        const b=state.briefings[key(id)];if(!b||!b.files[name])throw new Error('Unknown original report file');
        return {body:await readBlob(directory,b.files[name]),identity:b.files[name],
          content_type:name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.csv')?'text/csv; charset=utf-8':'application/json'};
      },
      source:id=>client().readSource(id),
      reviews:reviews.list,reviewCreate:reviews.create,reviewFile:reviews.file,reviewDocument:reviews.document,
      reviewReceive:reviews.receive,reviewPreview:reviews.preview,reviewResolve:reviews.resolve,reviewReturnFile:reviews.returnFile,
      oecdState:()=>withOecd(state.config.oecd,c=>c.state()),
      oecdSeed:(id,input)=>perform(id,'oecd-seed',input,()=>withOecd(state.config.oecd,c=>c.seed(input))),
      oecdSave:(id,input)=>perform(id,'oecd-save',input,()=>withOecd(state.config.oecd,c=>c.save(input))),
      oecdAttach:(id,input)=>perform(id,'oecd-attach',input,async()=>{
        const edition=await acquireOecdEdition(state.config.oecd,input.briefing_id);
        const files={};for(const f of edition.files)files[f.name]={...await blob(directory,f.body),content_type:f.content_type};
        const value={kind:edition.kind,label:edition.label,briefing_id:edition.briefing_id,briefing:edition.briefing,
          acquired_at:edition.acquired_at,source_project_directory:state.config.oecd.project_directory,files};
        const companionId=identity({kind:value.kind,briefing_id:value.briefing_id,files:value.files});
        state.companions[companionId]={id:companionId,...value};return state.companions[companionId];
      }),
      companionFile:async(id,name)=>{
        const c=state.companions[key(id)];if(!c?.files[name])throw new Error('Unknown original companion file');
        return {body:await readBlob(directory,c.files[name]),identity:c.files[name],content_type:c.files[name].content_type};
      },
      oecdReopen:(id,input)=>perform(id,'oecd-reopen',input,async()=>{
        const c=state.companions[key(input.companion_id)];
        if(!c?.files['oecd-project.zip'])throw new Error('Select an original complete OECD project');
        if(resolve(state.config.oecd.project_directory)===resolve(c.source_project_directory))
          throw new Error('Select a fresh receiving OECD project directory before reopening the original companion');
        const bytes=await readBlob(directory,c.files['oecd-project.zip']);
        const result=await withOecd(state.config.oecd,client=>client.importProject(bytes));
        // Confirm every report byte on the actual receiving original engine.
        await withOecd(state.config.oecd,async client=>{
          for(const name of ['briefing.html','briefing.json','observations.csv','SOURCE_RIGHTS.json','SOURCE_RIGHTS.md']){
            const actual=await client.reportFile(c.briefing_id,name);
            if(sha(actual.body)!==c.files[name].sha256||actual.body.length!==c.files[name].bytes)
              throw new Error('The reopened original OECD report differs: '+name);
          }
          if(c.files['original-source-rows.json']){
            const expected=JSON.parse((await readBlob(directory,c.files['original-source-rows.json'])).toString('utf8'));
            const actual=await client.sourceRows(c.briefing_id);
            if(canonical(expected.rows)!==canonical(actual.rows)||canonical(expected.snapshot)!==canonical(actual.snapshot))
              throw new Error('The reopened original OECD observations or snapshot differ');
          }
        });
        return {state:'COMPLETE',companion_id:c.id,native_result:result,files:c.files};
      }),
      exportProject:async()=>{
        ensure();
        const clientState=await client().exportState();
        const objects={};
        for(const b of Object.values(state.briefings))for(const object of Object.values(b.files))
          objects[object.sha256]={...object,content_base64:(await readBlob(directory,object)).toString('base64')};
        for(const c of Object.values(state.companions))for(const object of Object.values(c.files))
          objects[object.sha256]={...object,content_base64:(await readBlob(directory,object)).toString('base64')};
        await verifyReviews(directory,state);
        for(const object of reviewObjects(state))objects[object.sha256]={...object,content_base64:(await readBlob(directory,object)).toString('base64')};
        const saved=clone(state);
        // Machine-local launch locations are preserved as source references; a
        // receiver binds its actual installed module and new project directory.
        const packet={schema:'tjl.economic-client-project.v1',project:saved,objects:Object.values(objects),econdata:clientState};
        packet.content_sha256=identity(packet);
        return encodePacket(packet);
      },
      importProject:async(body,{config:receiverConfig}={})=>{
        ensure();
        const packet=decodePacket(body),digest=packet.content_sha256;
        if(state.received_packet_sha256===sha(body)){
          if(receiverConfig && state.received_import && canonical(configuration(receiverConfig))!==canonical(state.received_import.receiving_config))
            throw new Error('Continue this original project receive with its retained receiving configuration; use configure for later changes');
          for(const b of Object.values(state.briefings))for(const object of Object.values(b.files))await readBlob(directory,object);
          for(const c of Object.values(state.companions))for(const object of Object.values(c.files))await readBlob(directory,object);
          await verifyReviews(directory,state);
          return summary();
        }
        if(Object.keys(state.captures).length||Object.keys(state.briefings).length||Object.keys(state.companions).length)
          throw new Error('Receive the complete project into a fresh named workspace');
        delete packet.content_sha256;if(identity(packet)!==digest)throw new Error('Complete project content differs');
        if(packet.project?.schema!==SCHEMA||!Array.isArray(packet.objects))throw new Error('Unknown saved client project');
        for(const original of packet.objects){
          const bytes=Buffer.from(original.content_base64,'base64');
          if(bytes.toString('base64')!==original.content_base64||bytes.length!==original.bytes||sha(bytes)!==original.sha256)
            throw new Error('Original customer object differs');
          const received=await blob(directory,bytes);
          if(received.path!==original.path)throw new Error('Original customer object path differs');
        }
        const incoming=clone(packet.project);
        incoming.config=configuration(receiverConfig||incoming.config);
        const sourceClient=createEconDataClient({directory:join(directory,'econdata'),...incoming.config,oecd:undefined});
        await sourceClient.importState(packet.econdata);
        for(const c of Object.values(incoming.captures))seriesCatalog(c);
        for(const b of Object.values(incoming.briefings))for(const object of Object.values(b.files))await readBlob(directory,object);
        for(const c of Object.values(incoming.companions))for(const object of Object.values(c.files))await readBlob(directory,object);
        await verifyReviews(directory,incoming);
        incoming.received_packet_sha256=sha(body);
        incoming.received_import={packet_sha256:sha(body),content_sha256:digest,
          source_project_id:packet.project.project_id,receiving_config:clone(incoming.config),received_at:now()};
        state=incoming;await save();return summary();
      }
    };
    return api;
  }catch(error){await release();throw error;}
}
