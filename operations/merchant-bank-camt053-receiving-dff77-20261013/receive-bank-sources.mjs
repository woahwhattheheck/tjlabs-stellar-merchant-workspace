// SPDX-License-Identifier: MIT
// Full original collections and profile histories through the installed configured-source product.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {connectAccountingBankSourcesClient} from '../../../../../stellar-forge/mcp-merchant-operator/accounting-bank-sources-client.mjs';
import {canonicalHash,validateBankSourceRequest,BANK_SOURCE_KINDS} from '../../../../../stellar-forge/mcp-merchant-operator/accounting-bank-sources-contract.mjs';
import {sourceInputForItem} from './public/source-collection-model.mjs';
import {readBankStatementSource} from './source.mjs';
import {sourcePreview,previewIdentity} from './domain.mjs';

const execute=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const json=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const cli=fileURLToPath(new URL('../../../../../stellar-forge/mcp-merchant-operator/accounting-bank-sources-cli.mjs',import.meta.url));
async function keep(root,name,value){
 const path=join(root,name),bytes=Buffer.isBuffer(value)?value:json(value);
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 await writeFile(path,bytes,{flag:'wx',mode:0o600});
 return {path,bytes:bytes.length,sha256:hash(bytes)};
}
function originalItems(actual,expected,{sameIds=true,sameMapping=true}={}){
 assert.equal(actual.items.length,expected.items.length);
 for(let i=0;i<expected.items.length;i++){
  const a=actual.items[i],b=expected.items[i];
  if(sameIds)assert.equal(a.id,b.id);
  assert.deepEqual(a.file,b.file);assert.equal(a.included,b.included);assert.equal(a.note,b.note);
  if(sameMapping)assert.deepEqual(a.mapping,b.mapping);
 }
}
export async function prepareBankSourceInputs({profileOutput,out,workspaceId}){
 await mkdir(out,{mode:0o700});
 const received=await read(join(profileOutput,'RECEIVING_RESULT.json'));
 assert.equal(received.completed,true);assert.equal(received.workspaceId,workspaceId);
 assert.equal(received.originalFiles,22);assert.equal(received.versions,2);
 const collection=await read(received.originalCollectionPath),library=await read(join(profileOutput,'profile-library-v2.json'));
 const receiving=await read(join(profileOutput,'receiving-library-initial.json'));
 const review=await read(join(profileOutput,'current-complete-source-review.json'));
 for(const value of [collection,library,receiving])assert.equal(value.workspaceId,workspaceId);
 assert.equal(collection.items.length,22);assert.equal(collection.items.filter(x=>x.included).length,2);
 const profile=library.profiles.find(x=>x.id===received.profileId);assert(profile);assert.equal(profile.versions.length,2);
 const aliases={},pins={},copies=[],originals=[],reports={};
 async function configured(alias,name,bytes){
  const saved=await keep(out,'configured/'+alias,bytes);copies.push(saved);aliases[alias]=saved.path;
  return pins[alias]={sourceAlias:alias,name,bytes:bytes.length,sha256:hash(bytes)};
 }
 await configured('source_collection','complete-original-collection.json',await readFile(received.originalCollectionPath));
 await configured('source_profiles','complete-original-profiles.json',await readFile(join(profileOutput,'profile-library-v2.json')));
 await configured('source_receiving','receiving-profile-library.json',await readFile(join(profileOutput,'receiving-library-initial.json')));
 for(const [index,item]of collection.items.entries()){
  const bytes=Buffer.from(item.file.dataBase64,'base64');assert.equal(bytes.length,item.file.bytes);assert.equal(hash(bytes),item.file.sha256);
  const alias='source_original_'+String(index).padStart(3,'0');
  await configured(alias,item.file.name,bytes);originals.push({alias,itemId:item.id});
  if(item.included){
   const source=sourceInputForItem(item),report=readBankStatementSource(source),preview={...sourcePreview(report),reviewSha256:previewIdentity(report,source)};
   const retained=review.items.find(x=>x.id===item.id);assert(retained);assert.equal(retained.status,'REVIEWED');assert.deepEqual(preview,retained.preview);
   reports[item.id]={source,report,preview};
  }
 }
 const result={schema:'stellar-forge.bank-source-agent-inputs.v1',workspaceId,profileOutput,aliases,pins,originals,collection,library,receiving,
  profileId:profile.id,reports,copies,originalFiles:collection.items.length,originalBytes:collection.items.reduce((n,x)=>n+x.file.bytes,0)};
 result.manifest=await keep(out,'COMPLETE_INPUTS.json',result);return result;
}
function reference(operation,file,key){
 const pin=operation.receipt.files.find(x=>x.name===file);assert(pin,'Retain complete output '+file);
 return {key,preparationId:operation.receipt.preparationId,file,name:file,bytes:pin.bytes,sha256:pin.sha256};
}
function alias(input,sourceAlias,key){return {key,...input.pins[sourceAlias]};}
async function receiveFiles(client,receipt,out){
 const files=[];
 for(const pin of receipt.files){
  const reply=await client.fileBytes(receipt,pin.name),bytes=reply.bytes;
  assert.equal(bytes.length,pin.bytes);assert.equal(hash(bytes),pin.sha256);
  files.push({name:pin.name,role:pin.role,...await keep(out,pin.name,bytes)});
 }
 return files;
}
async function receiveViews(client,receipt,out){
 const views=[];
 async function selected(name,args){
  const value=await client.viewAll({preparationId:receipt.preparationId,...args});
  assert.equal(value.workspaceId,receipt.workspaceId);assert.equal(value.preparationId,receipt.preparationId);
  const file=await keep(out,name+'.json',value);views.push({name,args,...file,value});return value.view.page.items;
 }
 const rows=await selected('complete',{});
 if(receipt.viewType==='library')for(const item of rows)await selected('profile-'+item.id,{profileId:item.id});
 if(receipt.viewType==='inspection'){
  for(const item of rows.filter(x=>x.status==='REVIEWED')){
   const statements=await selected('statements-'+item.id,{itemId:item.id,section:'statements'});
   await selected('issues-'+item.id,{itemId:item.id,section:'issues'});
   for(const statement of statements)for(const section of ['rows','pending','excluded']){
    const name=section+'-'+item.id+'-'+hash(Buffer.from(statement.id)).slice(0,20);
    await selected(name,{itemId:item.id,statementId:statement.id,section});
   }
  }
 }
 return views;
}
async function fileJson(operation,name){const file=operation.files.find(x=>x.name===name);assert(file);return read(file.path);}
async function inspectOriginals(operation,input){
 const review=await fileJson(operation,'review.json');assert.equal(review.items.length,22);
 for(const item of input.collection.items){
  const file=operation.files.find(x=>x.name==='original-'+item.id);assert(file);assert.equal(file.bytes,item.file.bytes);assert.equal(file.sha256,item.file.sha256);
  assert.deepEqual(await readFile(file.path),Buffer.from(item.file.dataBase64,'base64'));
  const row=review.items.find(x=>x.id===item.id);assert(row);assert.equal(row.included,item.included);assert.equal(row.note,item.note);
  if(item.included){assert.equal(row.status,'REVIEWED');assert.deepEqual(row.preview,input.reports[item.id].preview);
   assert.deepEqual(await fileJson(operation,'report-'+item.id+'.json'),input.reports[item.id].report);
   assert.deepEqual(await fileJson(operation,'preview-'+item.id+'.json'),input.reports[item.id].preview);
   assert.deepEqual(await fileJson(operation,'source-'+item.id+'.json'),input.reports[item.id].source);
  }else assert.equal(row.status,'EXCLUDED');
 }
 return review;
}
export async function receiveBankSourceAgent({url,workspace,environment,out,workspaceId,input}){
 await mkdir(out,{mode:0o700});assert.equal(input.workspaceId,workspaceId);
 const result={schema:'stellar-forge.bank-source-agent-receiving.v1',completed:false,workspaceId,workspace,startedAt:new Date().toISOString(),
  inputManifest:input.manifest,operations:[],commands:[],kinds:[],cliKinds:['collection_inspect'],originalFiles:22,profileVersions:2};
 const client=await connectAccountingBankSourcesClient({url,workspace,environment});let failure;
 const request=(kind,inputs,parameters)=>validateBankSourceRequest({workspaceId,requestId:randomUUID(),actor:'Original configured-source receiving operator',kind,inputs,parameters});
 async function capture(name,selected,receipt,extra={}){
  assert.equal(receipt.state,'COMPLETE');assert.equal(receipt.requestSha256,canonicalHash(selected));assert.equal(receipt.workspaceId,workspaceId);
  const root=join(out,'operations',name);await mkdir(root,{recursive:true,mode:0o700});
  const operation={name,request:selected,receipt,...extra,files:await receiveFiles(client,receipt,join(root,'files')),views:await receiveViews(client,receipt,join(root,'views'))};
  operation.record=await keep(root,'COMPLETE_OPERATION.json',operation);result.operations.push(operation);return operation;
 }
 async function operate(name,kind,inputs,parameters){
  const selected=request(kind,inputs,parameters),saved=await keep(out,'requests/'+name+'.json',selected);
  const before=await client.reconcileRequest(selected);assert.equal(before.state,'NOT_FOUND');
  const prepared=await client.prepare({request:selected});assert.equal(prepared.state,'PREPARED');
  const retained=await client.prepare({request:selected});assert.deepEqual(retained,prepared);
  await keep(out,'requests/'+name+'-prepared.json',prepared);
  const receipt=await client.execute({preparationId:selected.requestId,expectedRequestSha256:canonicalHash(selected)});
  assert.deepEqual(await client.reconcileRequest(selected),receipt);
  assert.deepEqual(await client.execute({preparationId:selected.requestId,expectedRequestSha256:canonicalHash(selected)}),receipt);
  assert.deepEqual(await client.prepare({request:selected}),receipt);
  return capture(name,selected,receipt,{requestFile:saved});
 }
 async function command(name,args,exitCode=0){
  let r;try{const x=await execute(process.execPath,[cli,...args],{env:environment,encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000});
   r={exitCode:0,stdout:x.stdout,stderr:x.stderr};}catch(e){r={exitCode:e.code,stdout:e.stdout??'',stderr:e.stderr??'',signal:e.signal??null};}
  const saved=await keep(out,'commands/'+name+'.json',{args,...r});result.commands.push({name,args,...saved,exitCode:r.exitCode});
  assert.equal(r.exitCode,exitCode,r.stderr||name);return JSON.parse(r.stdout);
 }
 try{
  await client.open();result.initial=await client.status();assert.equal(result.initial.workspaceId,workspaceId);
  for(const [name,pin]of Object.entries(input.pins)){
   assert(result.initial.configuredSources.includes(name));
   const selected=await client.source({sourceAlias:name,name:pin.name});
   for(const key of ['bytes','sha256','name','sourceAlias'])assert.equal(selected[key],pin[key]);
   await keep(out,'resolved/'+name+'.json',selected);
  }
  const prepared=await operate('collection-prepare','collection_prepare',input.originals.map(x=>alias(input,x.alias,x.alias)),
   {collectionId:randomUUID(),name:input.collection.name,files:input.originals.map(x=>{const item=input.collection.items.find(i=>i.id===x.itemId);
    return{id:item.id,sourceKey:x.alias,mapping:item.mapping,included:item.included,note:item.note};})});
  const preparedCollection=await fileJson(prepared,'collection.json');originalItems(preparedCollection,input.collection);
  const edited=await operate('collection-edit','collection_edit',[reference(prepared,'collection.json','collection')],
   {expectedRevision:preparedCollection.revision,name:'Complete original Bundesbank EBICS and SWIFT delivery',items:[]});
  const editedCollection=await fileJson(edited,'collection.json');originalItems(editedCollection,input.collection);assert.equal(editedCollection.id,preparedCollection.id);
  const received=await operate('collection-receive','collection_receive',[reference(edited,'collection.json','collection')],{collectionId:randomUUID()});
  const receivedCollection=await fileJson(received,'collection.json');originalItems(receivedCollection,input.collection);
  const inspected=await operate('collection-inspect','collection_inspect',[reference(edited,'collection.json','collection')],{});
  await inspectOriginals(inspected,input);
  const originalProfile=input.library.profiles.find(x=>x.id===input.profileId),libraryId=randomUUID(),profileId=randomUUID();
  let savedProfile;
  for(const [index,version]of originalProfile.versions.entries()){
   savedProfile=await operate('profile-save-'+(index+1),'profile_save',savedProfile?[reference(savedProfile,'library.json','library')]:[],
    {libraryId,profileId,expectedRevision:index,expectedVersion:index,name:version.name,reason:version.reason,mapping:version.mapping});
   const current=await fileJson(savedProfile,'library.json');assert.equal(current.profiles[0].versions.length,index+1);
   assert.deepEqual(current.profiles[0].versions[index].mapping,version.mapping);
  }
  const receivedProfile=await operate('profile-receive','profile_receive',[alias(input,'source_profiles','incoming'),alias(input,'source_receiving','library')],
   {libraryId:input.receiving.id,expectedRevision:input.receiving.revision});
  const receivedLibrary=await fileJson(receivedProfile,'library.json');
  const copied=receivedLibrary.profiles.find(x=>x.origin?.profileId===input.profileId);assert(copied);assert.deepEqual(copied.versions,originalProfile.versions);
  assert.equal(receivedProfile.receipt.summary.received,1);
  const receivedAgain=await operate('profile-receive-again','profile_receive',[alias(input,'source_profiles','incoming'),reference(receivedProfile,'library.json','library')],
   {libraryId:receivedLibrary.id,expectedRevision:receivedLibrary.revision});
  assert.equal(receivedAgain.receipt.summary.received,0);assert.deepEqual(await fileJson(receivedAgain,'library.json'),receivedLibrary);
  const reviewed=await operate('profile-review','profile_review',[alias(input,'source_profiles','library'),reference(edited,'collection.json','collection')],
   {profileId:input.profileId,version:2,itemIds:input.collection.items.filter(x=>x.included).map(x=>x.id)});
  const applied=await operate('profile-apply','profile_apply',[alias(input,'source_profiles','library'),reference(edited,'collection.json','collection'),reference(reviewed,'review.json','review')],{});
  originalItems(await fileJson(applied,'collection.json'),input.collection,{sameMapping:false});
  const appliedInspection=await operate('applied-collection-inspect','collection_inspect',[reference(applied,'collection.json','collection')],{});
  await inspectOriginals(appliedInspection,input);
  const cliRequest=request('collection_inspect',[reference(applied,'collection.json','collection')],{});
  const requestFile=await keep(out,'requests/cli-complete-inspection.json',cliRequest),directory=join(out,'cli-operation');
  const local=await command('prepare',['prepare','--dir',directory,'--url',url,'--workspace',workspace,'--request',requestFile.path]);assert.equal(local.phase,'LOCAL_PREPARED');
  const retainedRequest=await readFile(join(directory,'request.json'));
  const before=await command('before',['reconcile','--dir',directory],3);assert.equal(before.state,'NOT_FOUND');
  const retained=await command('retain',['retain','--dir',directory],3);assert.equal(retained.state,'PREPARED');
  const completed=await command('execute',['execute','--dir',directory]);assert.equal(completed.state,'COMPLETE');
  const observed=await command('reconcile',['reconcile','--dir',directory]);assert.equal(observed.state,'COMPLETE');assert.deepEqual(observed.attempted,[]);
  const repeated=await command('repeat',['execute','--dir',directory]);assert.equal(repeated.state,'COMPLETE');assert.deepEqual(repeated.attempted,[]);
  assert.deepEqual(await readFile(join(directory,'request.json')),retainedRequest);
  const download=await command('download-all',['download-all','--dir',directory,'--out',join(out,'cli-downloads')]);
  result.cli={directory,request:cliRequest,requestSha256:hash(retainedRequest),download,receipt:completed.receipt};
  const cliReceived=await capture('cli-complete-inspection',cliRequest,completed.receipt,{cliDirectory:directory});
  await inspectOriginals(cliReceived,input);
  for(const pin of completed.receipt.files){const b=await readFile(join(out,'cli-downloads',pin.name));assert.equal(b.length,pin.bytes);assert.equal(hash(b),pin.sha256);}
  result.inventory=await client.listAll();
  for(const operation of result.operations)assert(result.inventory.page.items.some(x=>x.preparationId===operation.receipt.preparationId));
  result.kinds=[...new Set(result.operations.map(x=>x.request.kind))];assert.deepEqual([...result.kinds].sort(),[...BANK_SOURCE_KINDS].sort());
  result.final=await client.status();assert.equal(result.final.workspaceId,workspaceId);assert.equal(result.final.sourceSha256,result.initial.sourceSha256);
 }catch(error){failure=error;}
 finally{try{await client.disconnect();result.clientDisconnected=true;}catch(error){if(failure)failure.releaseError={code:error.code,message:error.message};else failure=error;}}
 if(failure){result.error={code:failure.code,message:failure.message,stack:failure.stack};await keep(out,'SOURCE_RECEIVING_ERROR.json',result);throw failure;}
 result.completed=true;result.completedAt=new Date().toISOString();result.resultFile=await keep(out,'SOURCE_RECEIVING_RESULT.json',result);return result;
}
export async function receiveBankSourceCold({url,workspace,environment,out,workspaceId,expected}){
 await mkdir(out,{mode:0o700});assert.equal(expected.completed,true);assert.equal(expected.workspaceId,workspaceId);
 const result={schema:'stellar-forge.bank-source-agent-cold.v1',completed:false,workspaceId,operations:[],startedAt:new Date().toISOString()};
 const client=await connectAccountingBankSourcesClient({url,workspace,environment});let failure;
 try{
  await client.open();result.status=await client.status();assert.equal(result.status.workspaceId,workspaceId);assert.equal(result.status.sourceSha256,expected.final.sourceSha256);
  result.inventory=await client.listAll();
  for(const original of expected.operations){
   const receipt=await client.reconcileRequest(original.request);assert.deepEqual(receipt,original.receipt);
   assert(result.inventory.page.items.some(x=>x.preparationId===receipt.preparationId));
   const root=join(out,original.name),files=await receiveFiles(client,receipt,join(root,'files'));
   for(const file of files){const prior=original.files.find(x=>x.name===file.name);assert(prior);assert.equal(file.bytes,prior.bytes);assert.equal(file.sha256,prior.sha256);
    assert.deepEqual(await readFile(file.path),await readFile(prior.path));}
   const views=await receiveViews(client,receipt,join(root,'views'));assert.equal(views.length,original.views.length);
   for(const view of views){const prior=original.views.find(x=>x.name===view.name);assert(prior);assert.deepEqual(view.value,prior.value);}
   result.operations.push({name:original.name,receipt,files,views});
  }
  const raw=await readFile(join(expected.cli.directory,'request.json'));assert.equal(hash(raw),expected.cli.requestSha256);
 }catch(error){failure=error;}
 finally{try{await client.disconnect();result.clientDisconnected=true;}catch(error){if(failure)failure.releaseError={code:error.code,message:error.message};else failure=error;}}
 if(failure){result.error={code:failure.code,message:failure.message,stack:failure.stack};await keep(out,'SOURCE_COLD_ERROR.json',result);throw failure;}
 result.completed=true;result.completedAt=new Date().toISOString();result.resultFile=await keep(out,'SOURCE_COLD_RESULT.json',result);return result;
}
