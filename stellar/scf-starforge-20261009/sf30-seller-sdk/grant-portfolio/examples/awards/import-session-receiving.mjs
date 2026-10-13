#!/usr/bin/env node
// MIT. One complete internal CSV-session receiving course over the original Console.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,mkdir,realpath,lstat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {connectGrantPortfolio,saveGrantPortfolioFile} from '../../client.mjs';
import {prepareAwardCsvImport,exportAwardApplications} from '../../awards-exchange.mjs';
import {prepareAwardCsvImportSession,reviewAwardCsvSessionBatch,submitAwardCsvSessionBatch,
  inspectAwardCsvImportSession} from '../../awards-import-session.mjs';
import {ordinary,readJson,retainedJson} from '../../awards-import-session-cli.mjs';

const OPERATION='AWARDS-CSV-SESSION-INTERNAL-RECEIVING-7DE2-20261013';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>assert.deepEqual(canonical(a),canonical(b));
const row=(collection,id,fields)=>({collection,id,expectedRevision:0,fields});
async function optional(path){try{return await readJson(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function privateDir(path){
  await mkdir(path,{mode:0o700,recursive:true});
  const actual=await lstat(path);assert(actual.isDirectory()&&!(actual.mode&0o077)&&await realpath(path)===path);
}
async function file(path,bytes){
  const result=await saveGrantPortfolioFile({descriptor:{bytes:bytes.length,sha256:sha(bytes)},response:new Response(bytes)},path);
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{await handle.sync();}finally{await handle.close();}
  const parent=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY);
  try{await parent.sync();}finally{await parent.close();}
  return {path:result.path,bytes:bytes.length,sha256:sha(bytes)};
}
async function originalRequest(client,id){
  try{return await client.request(id);}
  catch(error){if(error.status===404&&error.nativeCode==='NOT_FOUND')return null;throw error;}
}
export async function runReceiving({phase,sourceConnection,recipientConnection,out,actor}){
  assert(['import','receive','reopen'].includes(phase));
  assert(typeof actor==='string'&&actor.trim()&&actor.length<=240);
  assert(out===resolve(out));await privateDir(out);
  for(const name of ['actions','evidence','exports'])await privateDir(join(out,name));
  let ids=await optional(join(out,'selection.json'));
  if(!ids){
    assert.equal(phase,'import','Start this original course with its internal import phase.');
    ids={schema:'stellar-forge.awards-import-session-receiving-selection.v1',operation:OPERATION,actor,
      run:randomUUID(),portfolio:randomUUID(),programme:randomUUID(),partner:randomUUID(),round:randomUUID(),
      session:randomUUID(),documents:[randomUUID(),randomUUID()],
      applications:Array.from({length:240},()=>randomUUID())};
    await retainedJson(join(out,'selection.json'),ids);
  }
  assert.equal(ids.operation,OPERATION);assert.equal(ids.actor,actor);
  let source,recipient;
  try{
    source=await connectGrantPortfolio({consoleUrlFile:sourceConnection,timeoutMs:900000});
    recipient=await connectGrantPortfolio({consoleUrlFile:recipientConnection,timeoutMs:900000});
    const sourceState=await source.state(),targetState=await recipient.state();
    assert.notEqual(sourceState.workspaceId,targetState.workspaceId,'Use two actual independently owned workspaces.');
    const launch=async client=>{
      const actual=await client.launch();
      return {workspaceId:actual.workspaceId,pid:actual.pid,bindingSha256:actual.bindingSha256,
        sourceRoot:actual.sourceRoot,python:actual.python};
    };
    async function action(client,key,actionName,payload){
      const path=join(out,'actions',key+'.input.json');
      let input=await optional(path);
      if(!input){
        input={operationId:'csv-session-'+ids.run+'-'+key,action:actionName,payload:await payload()};
        await retainedJson(path,input);
      }
      assert.equal(input.action,actionName);
      let request=await originalRequest(client,input.operationId);
      if(!request)request=await client.action(input);
      same(request.input,input);
      if(request.state==='RUNNING')request=await client.wait(request.id,{timeoutMs:900000,pollMs:500});
      await retainedJson(join(out,'actions',key+'.return-'+sha(json(request))+'.json'),request);
      assert.equal(request.state,'COMPLETED',JSON.stringify(request.error));
      same(request.input,input);
      return request;
    }
    async function downloadExport(client,key,portfolio){
      const request=await action(client,key,'portfolio.export',async()=>({portfolioId:portfolio.id,revision:portfolio.revision}));
      const path=join(out,'exports',key+'.zip');
      await client.downloadExport(request.result.sha256,path,{bytes:request.result.bytes});
      const raw=await ordinary(path,4*1024*1024*1024);
      assert.equal(sha(raw),request.result.sha256);assert.equal(raw.length,request.result.bytes);
      return {path,sha256:sha(raw),bytes:raw.length,requestId:request.id};
    }
    async function compareHistory(reference,target,final){
      const revisions=[];
      for(let revision=1;revision<=final.revision;revision++){
        const expected=await reference.portfolio(final.id,{revision}),actual=await target.portfolio(final.id,{revision});
        same(actual,expected);revisions.push({revision,snapshot:actual.snapshot,tableSha256:actual.tableSha256});
        for(const table of Object.keys(expected.tableSha256)){
          const a=[],b=[];
          for await(const page of reference.pages({portfolioId:final.id,revision,table,limit:250}))a.push(...page.rows);
          for await(const page of target.pages({portfolioId:final.id,revision,table,limit:250}))b.push(...page.rows);
          same(a,b);
        }
      }
      return revisions;
    }
    if(phase==='import'){
      let complete=await optional(join(out,'import-complete.json'));
      if(complete){
        assert.equal(complete.sourceWorkspaceId,sourceState.workspaceId);
        const final=await source.portfolio(complete.portfolio.id);
        same(final,complete.portfolio);
        const archive=await ordinary(complete.archive.path,4*1024*1024*1024);
        assert.equal(sha(archive),complete.archive.sha256);
        return complete;
      }
      const initial=await action(source,'fixture-programme','portfolio.save',async()=>({
        name:'Internal reviewed CSV import receiving',
        notes:'Synthetic implementation acceptance only; no customer, funding award or payment.',
        sources:[],review:{status:'draft',reviewer:actor,note:'Internal software fixture.'},
        programme:{schema:'stellar-forge.grant-programme.v1',actor,expectedProgrammeRevision:0,
          settings:{asOf:'2026-10-13',riskScaleMaximum:5,highRiskScore:15},changes:[
            row('nodes',ids.programme,{kind:'portfolio',code:'CSV-INTERNAL',title:'Internal import programme',owner:actor}),
            row('partners',ids.partner,{code:'INTERNAL',name:'Internal fictional applicant',roles:['internal-acceptance-fixture']}),
          ]},
      }));
      const round=await action(source,'fixture-round','portfolio.save',async()=>{
        const current=await source.portfolio(initial.result.id),{name,notes,sources,review}=current.definition;
        return {id:current.id,expectedPortfolioRevision:current.revision,name,notes,sources,review,
          awards:{schema:'stellar-forge.grant-awards.v1',actor,expectedAwardsRevision:0,changes:[
            row('rounds',ids.round,{code:'CSV-ROUND',title:'Explicit internal import round',programmeNodeId:ids.programme,owner:actor,
              opensDate:'2026-10-13',closesDate:'2026-10-13',status:'published',scoringMethod:'none',
              process:'Internal evidence import only.',criteria:[{id:'evidence',title:'Internal explanation',kind:'eligibility',required:false}]}),
          ]}};
      });
      const basis=round.result;
      const cell=value=>'"'+String(value).replace(/"/g,'""')+'"';
      const rows=ids.applications.map((id,index)=>[
        'INTERNAL-'+index,'Internal application '+index,'Internal fictional applicant','INTERNAL',
        '9007199254740993.0100','GBP','Synthetic internal source '+index+' '+('x'.repeat(4400)),
      ]);
      const csv=Buffer.from([['Reference','Title','Legal name','Partner','Amount','Currency','Answer'],...rows]
        .map(record=>record.map(cell).join(',')).join('\r\n')+'\r\n','utf8');
      const originalFile=await file(join(out,'original-applications.csv'),csv);
      const common={filename:'original-applications.csv',roundId:ids.round,actor,status:'draft',
        mapping:{reference:'Reference',title:'Title',legalName:'Legal name',partnerKey:'Partner',amount:'Amount',currency:'Currency',
          answers:{evidence:'Answer'}},
        identities:{applications:Object.fromEntries(ids.applications.map((id,index)=>['INTERNAL-'+index,id])),
          partners:{INTERNAL:ids.partner}}};
      assert.throws(()=>prepareAwardCsvImport(basis,{...common,csv,operationId:'oversized-'+ids.run,documentId:randomUUID()}),
        /exceeds the original request limit/);
      let session=await optional(join(out,'session.json'));
      if(!session){
        session=prepareAwardCsvImportSession(basis,{...common,csv,sessionId:ids.session,workspaceId:sourceState.workspaceId,
          batches:[0,1].map(index=>({operationId:'csv-batch-'+ids.run+'-'+index,documentId:ids.documents[index],
            rowIndexes:Array.from({length:120},(_,n)=>index*120+n)}))});
        await retainedJson(join(out,'session.json'),session);
      }
      assert.equal(session.source.sha256,originalFile.sha256);
      const firstAlready=await originalRequest(source,session.batches[0].operationId);
      if(!firstAlready)await assert.rejects(()=>reviewAwardCsvSessionBatch(source,session,csv,1),/earlier batch/);
      const mutated=Buffer.from(csv);mutated[mutated.length-3]^=1;
      await assert.rejects(()=>reviewAwardCsvSessionBatch(source,session,mutated,0),/same complete original CSV/);
      const returns=[];
      for(let index=0;index<2;index++){
        let batch=await optional(join(out,'batch-'+index+'.json'));
        if(!batch){
          ({batch}=await reviewAwardCsvSessionBatch(source,session,csv,index));
          await retainedJson(join(out,'batch-'+index+'.json'),batch);
        }
        let request=await submitAwardCsvSessionBatch(source,session,batch,csv);
        if(request.state==='RUNNING')request=await source.wait(request.id,{timeoutMs:900000,pollMs:500});
        assert.equal(request.state,'COMPLETED',JSON.stringify(request.error));
        // Deliberately recover the committed original request before saving its
        // first local return, exercising outcome-before-local-receipt recovery.
        const revision=(await source.state()).revision;
        const recovered=await submitAwardCsvSessionBatch(source,session,batch,csv);
        same(recovered,request);assert.equal((await source.state()).revision,revision);
        await retainedJson(join(out,'actions','batch-'+index+'.complete.json'),recovered);
        returns.push({id:request.id,inputSha256:request.inputSha256,bytes:Buffer.byteLength(JSON.stringify(batch.plan.action))});
      }
      const observation=await inspectAwardCsvImportSession(source,session,csv);
      assert.equal(observation.state,'COMPLETE');assert.equal(observation.completedRows,240);
      await retainedJson(join(out,'evidence','session-complete.json'),observation);
      const final=await source.portfolio(basis.id);
      assert.equal(final.definition.awards.records.applications.length,240);
      for(const application of final.definition.awards.records.applications)
        assert.equal(application.requestedAmount.value,'9007199254740993.0100');
      const documents=final.definition.programme.records.documents.filter(record=>ids.documents.includes(record.id));
      assert.equal(documents.length,2);
      for(const document of documents){
        assert.equal(document.object.sha256,originalFile.sha256);
        const opened=await source.openProgrammeDocument({portfolioId:final.id,revision:final.revision,id:document.id});
        await saveGrantPortfolioFile(opened,join(out,'evidence',document.id+'.csv'));
        assert.equal(sha(await ordinary(join(out,'evidence',document.id+'.csv'),8*1024*1024)),originalFile.sha256);
      }
      const applicationFiles=[];
      for(const format of ['json','csv']){
        const exported=exportAwardApplications(final,{roundId:ids.round,format});
        applicationFiles.push(await file(join(out,'exports','applications.'+format),exported.bytes));
      }
      const archive=await downloadExport(source,'source-complete',final);
      complete={schema:'stellar-forge.awards-import-session-receiving.v1',operation:OPERATION,phase,state:'COMPLETE',
        sourceWorkspaceId:sourceState.workspaceId,sourceLaunch:await launch(source),portfolio:final,originalFile,
        requests:returns,sessionSha256:session.sha256,archive,applicationFiles,
        meaning:'240 internal draft records imported; no actual application, funding award, payment or customer acceptance.'};
      await retainedJson(join(out,'import-complete.json'),complete);return complete;
    }
    const imported=await readJson(join(out,'import-complete.json'));
    assert.equal(imported.sourceWorkspaceId,sourceState.workspaceId);
    same(await source.portfolio(imported.portfolio.id),imported.portfolio);
    if(phase==='receive'){
      const retained=await optional(join(out,'receive-complete.json'));
      if(retained){same(await recipient.portfolio(imported.portfolio.id),imported.portfolio);return retained;}
      const uploaded=await recipient.uploadFile(imported.archive.path,{sha256:imported.archive.sha256});
      const received=await action(recipient,'receive-complete','portfolio.receive',async()=>({object:uploaded.sha256}));
      assert.equal(received.result.snapshot,imported.portfolio.snapshot);
      const revisions=await compareHistory(source,recipient,imported.portfolio);
      const original=await ordinary(imported.originalFile.path,8*1024*1024);
      for(const documentId of ids.documents){
        const response=await recipient.openProgrammeDocument({portfolioId:imported.portfolio.id,
          revision:imported.portfolio.revision,id:documentId});
        const path=join(out,'evidence','received-'+documentId+'.csv');
        await saveGrantPortfolioFile(response,path);assert.equal(sha(await ordinary(path,8*1024*1024)),sha(original));
      }
      const session=await readJson(join(out,'session.json'));
      await assert.rejects(()=>inspectAwardCsvImportSession(recipient,session,original),/original workspace/);
      const before=(await recipient.state()).revision;
      await action(recipient,'receive-complete','portfolio.receive',async()=>({object:uploaded.sha256}));
      assert.equal((await recipient.state()).revision,before);
      const reexport=await downloadExport(recipient,'recipient-complete',imported.portfolio);
      const complete={schema:'stellar-forge.awards-import-session-receiving.v1',operation:OPERATION,phase,state:'COMPLETE',
        sourceLaunch:await launch(source),recipientLaunch:await launch(recipient),received:received.result,revisions,reexport};
      await retainedJson(join(out,'receive-complete.json'),complete);return complete;
    }
    const received=await readJson(join(out,'receive-complete.json'));
    const sourceLaunch=await launch(source),recipientLaunch=await launch(recipient);
    assert.notEqual(sourceLaunch.pid,received.sourceLaunch.pid,'Cold reopen the original source Console before this phase.');
    assert.notEqual(recipientLaunch.pid,received.recipientLaunch.pid,'Cold reopen the original receiving Console before this phase.');
    assert.equal(recipientLaunch.workspaceId,received.recipientLaunch.workspaceId);
    const revisions=await compareHistory(source,recipient,imported.portfolio);
    const csv=await ordinary(imported.originalFile.path,8*1024*1024),session=await readJson(join(out,'session.json'));
    const state=await inspectAwardCsvImportSession(source,session,csv);assert.equal(state.state,'COMPLETE');
    const before=(await source.state()).revision;
    same(await submitAwardCsvSessionBatch(source,session,await readJson(join(out,'batch-1.json')),csv),
      await readJson(join(out,'actions','batch-1.complete.json')));
    assert.equal((await source.state()).revision,before);
    const complete={schema:'stellar-forge.awards-import-session-receiving.v1',operation:OPERATION,phase,state:'COMPLETE',
      sourceLaunch,recipientLaunch,revisions,session:state,sourceArchive:imported.archive,recipientArchive:received.reexport,
      selectedSourceRows:240,originalAmount:'9007199254740993.0100'};
    await retainedJson(join(out,'complete.json'),complete);return complete;
  }finally{await source?.dispose();await recipient?.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const pairs=process.argv.slice(2),options={};
  assert.equal(pairs.length,10);
  for(let i=0;i<pairs.length;i+=2){assert(['--phase','--source-connection','--recipient-connection','--out','--actor'].includes(pairs[i]));
    assert(!Object.hasOwn(options,pairs[i]));options[pairs[i]]=pairs[i+1];}
  runReceiving({phase:options['--phase'],sourceConnection:options['--source-connection'],
    recipientConnection:options['--recipient-connection'],out:resolve(options['--out']),actor:options['--actor']})
    .then(value=>console.log(JSON.stringify({operation:OPERATION,phase:value.phase,state:value.state})))
    .catch(error=>{console.error(error.stack);process.exitCode=1;});
}
