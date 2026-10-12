#!/usr/bin/env node
// MIT. One real-engine merchant and customer receiving operation, resumable in place.
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initializeCouchdbWorkspace, readCouchdbWorkspaceIdentity } from './operator.mjs';
import { startCouchdbWorkspace } from './server.mjs';
import { connectCouchdbWorkspace } from './client.mjs';
import { receiveCouchdbProject } from './portable.mjs';
import { validateConnection, compileQueries } from './declaration.mjs';
import { MerchantCouchdbWorkspaces } from './agent/client.mjs';
import { need, only, text, object, UUID, bytes, identity, digest, readJson, readPrivate, privateDirectory, acquireWorkspace, retain, retainJSON, exists, syncDirectory } from './common.mjs';
const SCHEMA='stellar-forge.couchdb-native-receiving.v1';
function stepId(id,name){
  const buffer=createHash('sha256').update(id+'\0'+name).digest().subarray(0,16);buffer[6]=(buffer[6]&15)|64;buffer[8]=(buffer[8]&63)|128;
  const hex=buffer.toString('hex');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
async function savedStep(client,operationId,command,makeInput,report){
  let prior;try{prior=await client.query('operation',{id:operationId});}catch(error){if(error.status!==404)throw error;}
  if(prior)need(prior.command===command,'COUCHDB_RECEIVING_STEP_CHANGED');
  const result=prior?(prior.state==='COMPLETE'?prior:await client.resume(operationId,{wait:true,timeoutMs:3600000})):
    await client.action(command,await makeInput(),{id:operationId,wait:true,timeoutMs:3600000});
  report?.({operationId,command,state:result.state});
  need(result.state==='COMPLETE','COUCHDB_RECEIVING_STEP_INCOMPLETE',JSON.stringify({operationId,command,state:result.state,error:result.error}));
  return result.value;
}
export async function receiveCouchdbNative({directory,inputFile,environment=process.env,report}={}){
  need(process.platform==='linux','COUCHDB_RECEIVING_LINUX_REQUIRED','Use the existing Linux client with Node 24, util-linux flock and Python 3; it connects to the selected original CouchDB host.');
  const root=resolve(text(directory)),source=resolve(text(inputFile)),raw=await readPrivate(source,1048576),input=JSON.parse(raw);
  only(input,['schema','id','connection','queries','plan','terms','reviewer','note','runtime'],'COUCHDB_RECEIVING_INPUT_INVALID');
  need(input.schema===SCHEMA&&UUID.test(input.id??'')&&object(input.plan)&&object(input.terms),'COUCHDB_RECEIVING_INPUT_INVALID');
  const connection=validateConnection(input.connection);compileQueries(input.queries);text(input.reviewer,128);text(input.note,2000);
  await privateDirectory(root,true);const unlock=await acquireWorkspace(root);let owner,receiver,merchant;
  try{
    await retainJSON(join(root,'receiving-input.json'),{schema:SCHEMA,inputSha256:digest(raw),input});
    if(await exists(join(root,'receiving-result.json')))return readJson(join(root,'receiving-result.json'),1048576);
    const workspaceId=stepId(input.id,'workspace'),sender=join(root,'sender'),moved=join(root,'sender-unavailable'),received=join(root,'receiver');
    let transfer=await exists(join(root,'transfer.json'))?await readJson(join(root,'transfer.json'),1048576):null;
    if(!transfer){
      await initializeCouchdbWorkspace({directory:sender,id:workspaceId});
      owner=await startCouchdbWorkspace({directory:sender,expectedWorkspaceId:workspaceId,port:0,environment});
      const client=await connectCouchdbWorkspace({connectionFile:owner.startup.connectionFile,expectedWorkspaceId:workspaceId});
      const step=(name,command,make)=>savedStep(client,stepId(input.id,name),command,make,report);
      const selected=await step('connection','connection.save',()=>({label:'Original native receiving source',connection}));
      const captured=await step('capture','capture',()=>({connectionId:selected.id}));
      const fields=await step('fields','capture.fields',()=>({captureId:captured.id}));
      need(fields.complete&&fields.manifestSha256===captured.manifestSha256,'COUCHDB_RECEIVING_FIELDS_CHANGED');
      const mapping=await step('mapping','mapping.save',()=>({captureId:captured.id,expectedCaptureSha256:captured.manifestSha256,title:input.plan.title??'CouchDB dataset',queries:input.queries}));
      const product=await step('product','product.create',()=>({title:input.plan.title??'CouchDB dataset',mappingId:mapping.id}));
      const plan=await step('plan','publisher.plan',()=>({productId:product.id,plan:{...input.plan,sourceHash:mapping.sourceHash}}));
      const extracted=await step('extract','publisher.extract',()=>({productId:product.id,planId:plan.id}));
      const inspected=await client.query('publisher.inspect',{productId:product.id,runId:extracted.id});
      need(inspected.run.data.candidate,'COUCHDB_RECEIVING_CANDIDATE_REQUIRED',JSON.stringify(inspected.run.data.error));
      const review=await step('review','publisher.review',async()=>{
        const target=await client.query('publisher.target',{productId:product.id});
        need(target.initializable||target.connected,'COUCHDB_RECEIVING_TARGET_REQUIRED');
        return {productId:product.id,runId:extracted.id,expectedCandidateDigest:inspected.run.data.candidate.candidateDigest,
          review:{reviewer:input.reviewer,note:input.note,...(target.initializable?{initialize:true}:{expectedSnapshot:target.versions.current,expectedRevision:target.versions.revision})}};
      });
      const published=await step('publish','publisher.publish',()=>({productId:product.id,runId:extracted.id,reviewId:review.data.review.id}));
      let publicationRecoveryOperationId=null;
      if(published.state!=='PUBLISHED'){
        need(published.state==='PUBLICATION_UNKNOWN','COUCHDB_RECEIVING_PUBLICATION_REQUIRED',JSON.stringify(published.data?.error));
        // A new owner performs a new native observation of the same publication.
        // The first publish operation and its original uncertain reply stay intact.
        publicationRecoveryOperationId=stepId(input.id,'publish-recovery-'+client.info.instanceId);
        await savedStep(client,publicationRecoveryOperationId,'publisher.recover',()=>({productId:product.id,runId:extracted.id}),report);
      }
      const publicationObserved=await client.query('publisher.inspect',{productId:product.id,runId:extracted.id});
      need(publicationObserved.run.state==='PUBLISHED'&&publicationObserved.run.data.review?.id===review.data.review.id,
        'COUCHDB_RECEIVING_PUBLICATION_REQUIRED',JSON.stringify(publicationObserved.run.data?.error));
      const reviewed=await step('deployment-review','deployment.review',()=>({productId:product.id,runId:extracted.id,terms:input.terms}));
      const preparedId=stepId(input.id,'deployment');
      const prepared=await step('deployment','deployment.prepare',()=>({productId:product.id,runId:extracted.id,terms:input.terms,expectedReviewSha256:reviewed.reviewSha256}));
      const stage=await step('stage','release.stage',()=>({deploymentId:preparedId,expectedSourceSha256:prepared.sourceSha256,releaseId:'couchdb-native',runtime:input.runtime??{port:0}}));
      const consoleId=stepId(input.id,'console-'+client.info.instanceId);
      let consoleValue=await savedStep(client,consoleId,'release.console.open',()=>({}),report);
      async function nativeAction(action,parameters={}){
        const current=await client.query('release.status');
        return savedStep(client,stepId(input.id,action+'-'+client.info.instanceId),'release.command',()=>({
          consoleInstanceId:consoleValue.instanceId,action,expectedGeneration:current.native.state.generation,
          ...(action==='stop'?{}:{expectedDigest:stage.release.digest}),parameters}),report);
      }
      let native=await client.query('release.status');
      if(native.native.state.active!=='couchdb-native')await nativeAction('activate',{id:'couchdb-native'});
      native=await client.query('release.status');
      if(!native.native.console.managesRunningSeller)await nativeAction('run');
      native=await client.query('release.status');need(native.native.console.managesRunningSeller,'COUCHDB_RECEIVING_SELLER_REQUIRED');
      const exportId=stepId(input.id,'customer');
      await step('customer','client.generate',()=>({consoleInstanceId:consoleValue.instanceId,instanceId:native.native.console.instanceId}));
      const customer=await client.query('client.manifest',{exportId}),customerDirectory=join(root,'customer');
      await privateDirectory(customerDirectory,true);
      for(const file of [...customer.manifest.files,customer.manifestFile]){
        let offset=0,readId;const chunks=[];
        do{
          const part=await client.query('client.file',{exportId,file:file.name,expectedManifestSha256:customer.manifestFile.sha256,expectedSha256:file.sha256,offset,limit:196608,...(readId?{readId}:{})});
          const chunk=Buffer.from(part.data,'base64');need(part.offset===offset&&part.bytesRead===chunk.length&&part.file.sha256===file.sha256,'COUCHDB_RECEIVING_CLIENT_CHANGED');
          chunks.push(chunk);offset+=chunk.length;readId=part.readId;if(part.nextOffset===null)break;need(part.nextOffset===offset,'COUCHDB_RECEIVING_CLIENT_CHANGED');
        }while(offset<=file.bytes);
        const receivedFile=Buffer.concat(chunks);need(receivedFile.length===file.bytes&&digest(receivedFile)===file.sha256,'COUCHDB_RECEIVING_CLIENT_CHANGED');await retain(join(customerDirectory,file.name),receivedFile);
      }
      await nativeAction('stop',{instanceId:native.native.console.instanceId});
      await savedStep(client,stepId(input.id,'console-close-'+client.info.instanceId),'release.console.close',()=>({instanceId:consoleValue.instanceId}),report);
      merchant=new MerchantCouchdbWorkspaces({couchdbWorkspaces:{workspaces:{original:{workspaceId,label:'Native receiving source',connectionFile:owner.startup.connectionFile,imports:{},deliveries:{},receivers:{}}}}});
      const viaMerchant=await merchant.call('merchant_couchdb_operation',{workspace:'original',workspaceId,operationId:stepId(input.id,'publish')});
      need(viaMerchant.result.state==='COMPLETE'&&identity(viaMerchant.result.value)===identity(published),'COUCHDB_RECEIVING_MERCHANT_CHANGED');
      const archived=await step('archive','project.export',()=>({}));
      const download=await client.download('export',{id:stepId(input.id,'archive')},{directory:join(root,'download'),id:stepId(input.id,'download'),expectedSha256:archived.archive.sha256,expectedBytes:Number(archived.archive.bytes)});
      transfer={schema:'stellar-forge.couchdb-native-transfer.v1',workspaceId,capture:captured,mappingId:mapping.id,productId:product.id,planId:plan.id,
        runId:extracted.id,reviewId:review.data.review.id,publicationOperationId:stepId(input.id,'publish'),
        publicationResultSha256:identity(published),publicationRecoveryOperationId,deploymentId:preparedId,
        sourceSha256:prepared.sourceSha256,executionSha256:prepared.executionSha256??prepared.dataset.executionSha256,
        releaseDigest:stage.release.digest,customer:{exportId,manifestSha256:customer.manifestFile.sha256,directory:customerDirectory,files:customer.manifest.files.length+1},
        archive:{file:download.file,sha256:download.sha256,bytes:download.bytes},merchantOperationReopened:true};
      await retainJSON(join(root,'transfer.json'),transfer);
      await merchant.close();merchant=null;await owner.close();owner=null;
    }
    need(transfer.workspaceId===workspaceId,'COUCHDB_RECEIVING_TRANSFER_CHANGED');
    if(await exists(sender)){need((await readCouchdbWorkspaceIdentity(sender)).id===workspaceId&&!await exists(moved),'COUCHDB_RECEIVING_SENDER_CHANGED');await rename(sender,moved);await syncDirectory(root);}
    need(!await exists(sender),'COUCHDB_RECEIVING_ORIGINAL_STILL_PRESENT');
    const receivedResult=await receiveCouchdbProject({file:transfer.archive.file,expectedSha256:transfer.archive.sha256,directory:received,environment});
    receiver=await startCouchdbWorkspace({directory:received,expectedWorkspaceId:workspaceId,port:0,environment});
    const client=await connectCouchdbWorkspace({connectionFile:receiver.startup.connectionFile,expectedWorkspaceId:workspaceId});
    const capture=await client.query('capture',{id:transfer.capture.id,limit:1});
    need(capture.manifestSha256===transfer.capture.manifestSha256,'COUCHDB_RECEIVING_CAPTURE_CHANGED');
    const replay=await client.query('operation',{id:transfer.publicationOperationId});
    need(replay.state==='COMPLETE'&&identity(replay.value)===transfer.publicationResultSha256&&
      replay.value.data.review.id===transfer.reviewId,'COUCHDB_RECEIVING_REVIEW_CHANGED');
    if(transfer.publicationRecoveryOperationId){
      const recovery=await client.query('operation',{id:transfer.publicationRecoveryOperationId});
      need(recovery.state==='COMPLETE'&&recovery.command==='publisher.recover'&&recovery.value.data.review.id===transfer.reviewId,
        'COUCHDB_RECEIVING_RECOVERY_CHANGED');
    }
    const candidate=await client.query('publisher.inspect',{productId:transfer.productId,runId:transfer.runId});
    need(candidate.run.data.review.id===transfer.reviewId&&candidate.run.state==='PUBLISHED','COUCHDB_RECEIVING_PUBLISHER_CHANGED');
    const customer=await client.query('client.manifest',{exportId:transfer.customer.exportId});
    need(customer.manifestFile.sha256===transfer.customer.manifestSha256,'COUCHDB_RECEIVING_CUSTOMER_CHANGED');
    const rebound=await savedStep(client,stepId(input.id,'receiving-binding'),'deployment.rebind',()=>({
      productId:transfer.productId,deploymentId:transfer.deploymentId,expectedSourceSha256:transfer.sourceSha256,expectedExecutionSha256:transfer.executionSha256}),report);
    need(rebound.sourceSha256!==transfer.sourceSha256&&rebound.dataset.datasetDirectory===join(received,'datasets',transfer.productId),'COUCHDB_RECEIVING_BINDING_CHANGED');
    await savedStep(client,stepId(input.id,'receiving-stage'),'release.stage',()=>({deploymentId:stepId(input.id,'receiving-binding'),expectedSourceSha256:rebound.sourceSha256,releaseId:'couchdb-received',runtime:input.runtime??{port:0}}),report);
    const result={schema:SCHEMA,state:'COMPLETE',id:input.id,inputSha256:digest(raw),workspaceId,
      actualEngine:transfer.capture.engine,actualDocuments:transfer.capture.counts,sourceCaptureSha256:capture.manifestSha256,
      publication:{productId:transfer.productId,runId:transfer.runId,reviewId:transfer.reviewId,originalOperationId:transfer.publicationOperationId,
        originalState:replay.value.state,recoveryOperationId:transfer.publicationRecoveryOperationId,state:candidate.run.state},
      originalSourceUnavailable:!await exists(sender),receiver:received,archive:transfer.archive,customer:transfer.customer,
      merchantOperationReopened:true,sourceSha256:transfer.sourceSha256,receivingSourceSha256:rebound.sourceSha256,receiving:receivedResult};
    await retainJSON(join(root,'receiving-result.json'),result);return result;
  }finally{try{await merchant?.close();}finally{try{await owner?.close();}finally{try{await receiver?.close();}finally{await unlock();}}}}
}
export async function main(argv=process.argv.slice(2)){
  if(!argv.length||argv.includes('--help')){process.stdout.write('couchdb-receive --directory PRIVATE_OPERATION --input PRIVATE_NATIVE_SELECTION_JSON\n');return;}
  const options=Object.create(null);for(let i=0;i<argv.length;i+=2){
    need(['--directory','--input'].includes(argv[i])&&typeof argv[i+1]==='string'&&!Object.hasOwn(options,argv[i]),'COUCHDB_RECEIVING_USAGE');options[argv[i]]=argv[i+1];
  }
  const result=await receiveCouchdbNative({directory:options['--directory'],inputFile:options['--input'],report:value=>process.stderr.write(JSON.stringify(value)+'\n')});
  process.stdout.write(bytes(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(bytes({error:error.code??'COUCHDB_RECEIVING_FAILED',message:error.message}));process.exitCode=1;});
