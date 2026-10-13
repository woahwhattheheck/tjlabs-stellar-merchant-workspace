// MIT. Original durable customer case, Xero sources and encrypted accounting relocation.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,rename,unlink,link} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {privateSupportDirectory} from '../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import {MerchantAccounting,normalizeAccountingConfig} from '../../stellar-forge/mcp-merchant-operator/accounting.mjs';
import {createAccountingReceivablesClient} from '../../stellar-forge/mcp-merchant-operator/accounting-receivables-client.mjs';
import {ReceivablesWorkspace} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/store.mjs';
import {XeroReceivablesWorkspace} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/xero/store.mjs';
import {CommissioningCollectionsWorkspace} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/commissioning-collections/workspace.mjs';
import {accountingWorkspaceBinding,inspectAccountingWorkspaceBinding} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/binding.mjs';
import {reviewAccountingWorkspace,snapshotAccountingWorkspace,verifyAccountingBackup,inspectAccountingBackup,restoreAccountingWorkspace} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/recovery.mjs';
import {createDurableCustomerCase,captureDurableCustomerCase} from './durable-customer-case.mjs';

const SCHEMA='stellar-forge.xero-customer-handover.v1',RECEIVED='stellar-forge.xero-independent-customer-receiving.v1';
const SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const json=value=>JSON.stringify(value,null,2)+'\n',sha=value=>createHash('sha256').update(value).digest('hex');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>structuredClone(value),now=()=>new Date().toISOString();
const economicKeys=['invoices','credits','receipts','allocations','refunds','creditDispositions','bankAccounts','bankImports'];
function need(ok,message,code='ARGUMENTS'){if(!ok)throw Object.assign(new Error(message),{code:'XERO_CUSTOMER_HANDOVER_'+code});}
function beneath(root,path){const part=relative(root,path);return part!==''&&!part.startsWith('..'+String.fromCharCode(47))&&part!=='..'&&!isAbsolute(part);}
function safePath(path){need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&path!=='/'&&!/[\x00-\x1f\x7f]/.test(path),'Use an exact absolute private path.');return path;}
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function privateDirectory(path){safePath(path);await privateSupportDirectory(path);const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&!(s.mode&0o077)&&(!process.getuid||s.uid===process.getuid())&&await realpath(path)===path,'Use an owner-private real directory.','PRIVATE_DIRECTORY');return path;}
async function readBytes(path,maximum=128*1024*1024){await finishRetainedLink(path);const fd=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));try{const s=await fd.stat();need(s.isFile()&&s.nlink===1&&s.size<=maximum&&!(s.mode&0o077)&&(!process.getuid||s.uid===process.getuid()),'Read a complete owner-private regular source.','PRIVATE_FILE');const body=await fd.readFile();need(body.length===s.size&&body.length<=maximum,'The original file changed during reading.','FILE_CHANGED');return body;}finally{await fd.close();}}
const read=async(path,maximum)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(path,maximum)));
async function sync(path){const fd=await open(path,constants.O_RDONLY|(constants.O_DIRECTORY??0));try{await fd.sync();}finally{await fd.close();}}
async function finishRetainedLink(path){
const temp=path+'.retain-next',target=await exists(path),pending=await exists(temp);
if(target&&pending&&target.isFile()&&pending.isFile()&&!target.isSymbolicLink()&&!pending.isSymbolicLink()&&target.dev===pending.dev&&target.ino===pending.ino&&target.nlink===2){
need(!(pending.mode&0o077)&&(!process.getuid||pending.uid===process.getuid()),'Recover the original private immutable publication.');
await unlink(temp);await sync(dirname(path));
}
}
async function retain(path,value){
const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:json(value));
await privateDirectory(dirname(path));await finishRetainedLink(path);
if(await exists(path)){need((await readBytes(path)).equals(bytes),'Keep the original complete retained input or result.','RETAINED_CHANGED');return;}
const temp=path+'.retain-next',pending=await exists(temp);
if(pending){need(pending.isFile()&&!pending.isSymbolicLink()&&pending.nlink===1&&!(pending.mode&0o077)&&(!process.getuid||pending.uid===process.getuid()),'Recover only the original private unpublished temporary file.');await unlink(temp);}
const handle=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
try{
try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
try{await link(temp,path);}catch(error){if(error.code!=='EEXIST')throw error;need((await readBytes(path)).equals(bytes),'Keep the original complete retained input or result.','RETAINED_CHANGED');}
}finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});await sync(dirname(path));}
}
async function replace(path,value){const temp=path+'.'+randomUUID()+'.next';await retain(temp,value);try{await rename(temp,path);await sync(dirname(path));}finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}}
function errorView(error){return{code:error?.code??'ERROR',message:String(error?.message??error),...(error?.details?{details:error.details}:{}),...(error?.outcomeUnknown===true?{outcomeUnknown:true}:{}),...(error?.reopenRequired===true?{reopenRequired:true}:{}),...(error?.commitUncertainty?{commitUncertainty:clone(error.commitUncertainty)}:{})};}
function dated(value){need(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value,'Use a real account date.');return value;}
function identifier(value,name){need(typeof value==='string'&&UUID.test(value),'Use the original '+name+' UUID.');return value;}
function fingerprint(data,keys){return sha(json(Object.fromEntries(keys.map(key=>[key,data[key]??[]]))));}
function normalizeSelection(value){
need(plain(value),'Use the complete original handover selection.');
const stateRoot=safePath(value.stateRoot),accountingDirectory=safePath(value.accountingDirectory);
need(beneath(stateRoot,accountingDirectory),'Keep the original accounting directory inside its private state root.');
need(typeof value.actor==='string'&&value.actor.trim()&&value.actor.length<=1000,'Name the responsible source operator.');
need(typeof value.title==='string'&&value.title.trim()&&value.title.length<=200,'Name this customer handover.');
const packageIds=value.packageIds?.map(id=>identifier(id,'Xero package'));
need(packageIds?.length>0&&packageIds.length<=50&&new Set(packageIds).size===packageIds.length,'Select original Xero packages once.');
const cashCycles=(value.cashCycles??[]).map(row=>({packageId:identifier(row.packageId,'cycle package'),cycleId:identifier(row.cycleId,'cash cycle')}));
need(cashCycles.length>0&&cashCycles.length<=200&&cashCycles.every(row=>packageIds.includes(row.packageId))&&new Set(cashCycles.map(row=>row.cycleId)).size===cashCycles.length,'Select the original saved cycles once.');
const commissioningCaptureIds=(value.commissioningCaptureIds??[]).map(id=>identifier(id,'commissioning capture'));
need(new Set(commissioningCaptureIds).size===commissioningCaptureIds.length,'Select each commissioning capture once.');
need(SHA.test(value.expectedWorkspaceId??'')&&SHA.test(value.expectedSourcesSha256??''),'Bind both original workspace identities.');
need(value.externalWritersStopped===true,'Stop the original source and accounting writers before this handover.');
const extraSources=(value.extraSources??[]).map(row=>{need(plain(row)&&/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(row.name??'')&&['file','directory'].includes(row.kind),'Retain named original additional source roots.');const path=safePath(row.path);need(beneath(stateRoot,path),'Keep each original additional source in the same private state root.');return{name:row.name,path,kind:row.kind};});
need(new Set(extraSources.map(row=>row.name)).size===extraSources.length,'Name every additional source root uniquely.');
return{schema:SCHEMA,operationId:identifier(value.operationId,'handover operation'),title:value.title.trim(),actor:value.actor.trim(),asOf:dated(value.asOf),
stateRoot,accountingDirectory,expectedWorkspaceId:value.expectedWorkspaceId,expectedSourcesSha256:value.expectedSourcesSha256,
customerId:identifier(value.customerId,'customer'),packageIds,cashCycles,commissioningCaptureIds,extraSources,
externalWritersStopped:true,originalOperation:value.originalOperation??'SCF-XERO-INDEPENDENT-RECEIVING-2A51-20261013'};
}
function hostProfile(selection,receiver=null){
const project=path=>receiver?join(receiver.stateRoot,relative(selection.stateRoot,path)):path;
const value={schema:'stellar-forge.accounting-host-source-profile.v1',kind:'original-xero-customer-handover',
binding:{operationId:selection.operationId,workspaceId:selection.expectedWorkspaceId,sourcesSha256:selection.expectedSourcesSha256},
roots:selection.extraSources.map(row=>({...row,path:project(row.path)})),requiredEnvironment:[]};
if(!value.roots.length)return undefined;
const resolver=async()=>clone(value);
resolver.relocateProfile=async(profile,{mapPath})=>({...profile,roots:profile.roots.map(row=>({...row,path:mapPath(row.path)}))});
return resolver;
}
async function withOwner(directory,work){
const binding=await inspectAccountingWorkspaceBinding(directory),state=await read(join(directory,'workspace.json'),32_000_000);
const fields=['outboxDir','proofDir','termsFile'];
const definition={directory,...Object.fromEntries(fields.filter(key=>state.sources[key]!==undefined).map(key=>[key,state.sources[key]])),...(state.sources.recoveredDir?{recoveredSources:{original:state.sources.recoveredDir}}:{})};
need(state.sources.sourceMode!=='buyer','Use the original merchant customer workspace.','WORKSPACE_MODE');
const configuration={workspaces:{handover:definition}};
const host=new MerchantAccounting({accounting:normalizeAccountingConfig(configuration,dirname(directory))});
const client=createAccountingReceivablesClient({workspace:'handover',call:(name,args)=>host.call(name,args)});
let failed,result;try{await client.open();result=await work({host,client,binding,configuration});}
catch(error){failed=error;}
try{await client.disconnect();}catch(error){if(failed)failed.releaseError=errorView(error);else failed=error;}
try{await host.close();}catch(error){if(failed)failed.closeError=errorView(error);else failed=error;}
if(failed)throw failed;return result;
}
async function originalControllers(host,work){return host.withServiceAgreementsWorkspace('handover',workspace=>work({workspace,receivables:new ReceivablesWorkspace(workspace)}));}
async function evidence(host,selection){
return originalControllers(host,async({workspace,receivables})=>{
const xero=new XeroReceivablesWorkspace(receivables),commissioning=new CommissioningCollectionsWorkspace(receivables,{xero});
const data=receivables.data(),binding=accountingWorkspaceBinding(workspace.directory,workspace.state),files=[],packages=[],cycles=[],captures=[];
need(binding.workspaceId===selection.expectedWorkspaceId&&binding.sourcesSha256===selection.expectedSourcesSha256,'Reopen the exact original customer workspace.','BINDING');
receivables._customer(selection.customerId);
const add=(selector,file)=>{need(Buffer.isBuffer(file.bytes),'Retain complete original native file bytes.');files.push({selector,name:file.name,type:file.type,bytes:file.bytes.length,sha256:sha(file.bytes)});};
for(const id of selection.packageIds){
const detail=await xero.detail(id);need(detail.package.documents.some(row=>row.customerId===selection.customerId),'Select a package containing the original customer.','CUSTOMER');
packages.push(clone(detail.package));
const names=new Set(detail.package.files.map(row=>row.name));
for(const input of detail.package.imports??[]){names.add(input.fileName);names.add(input.reportName);}
for(const name of names)add({kind:'xero-package',packageId:id,file:name},await xero.file(id,name));
}
for(const row of selection.cashCycles){
const detail=await xero.cashCycle(row.packageId,row.cycleId);
need(detail.cashCycle.customerIds.includes(selection.customerId),'Select an original customer cash cycle.','CUSTOMER');
cycles.push(clone(detail.cashCycle));for(const descriptor of detail.cashCycle.files)add({kind:'xero-cash',packageId:row.packageId,cycleId:row.cycleId,file:descriptor.name},await xero.cashFile(row.packageId,row.cycleId,descriptor.name));
}
for(const id of selection.commissioningCaptureIds){
const detail=await commissioning.detail(id);captures.push(clone(detail.capture));
for(const descriptor of detail.capture.files)add({kind:'commissioning-capture',captureId:id,file:descriptor.name},await commissioning.file(id,descriptor.name));
}
return{workspaceId:binding.workspaceId,sourcesSha256:binding.sourcesSha256,revision:workspace.state.revision,customerId:selection.customerId,
receivablesSha256:sha(json(data)),economicSha256:fingerprint(data,economicKeys),packages,cycles,captures,files,
requestIds:(data.requests??[]).map(row=>row.id),createdAt:now()};
});
}
async function retainedEvidence(path,current){
if(await exists(path)){
const original=await read(path);
need(typeof original.createdAt==='string'&&Number.isFinite(Date.parse(original.createdAt))&&json({...original,createdAt:null})===json({...current,createdAt:null}),'Reconcile the exact original saved evidence before continuing.','EVIDENCE_CHANGED');
return original;
}
await retain(path,current);return current;
}
async function caseCapture({directory,selection,host,client,caseId,editionId,configuration}){
const caseSelection={id:caseId,title:selection.title,originalOperation:selection.originalOperation,url:'http://127.0.0.1:8453/mcp',
workspace:'handover',tokenEnv:'MCP_ACCESS_TOKEN',workspaceId:selection.expectedWorkspaceId,customerId:selection.customerId,
asOf:selection.asOf,cashPlans:[],requestIds:[]};
await createDurableCustomerCase({directory,selection:caseSelection,client,resume:true});
const captured=await captureDurableCustomerCase({directory,editionId,client});
await retain(join(directory,'host-config.json'),configuration);
await retain(join(directory,'RETENTION.json'),{
schema:'stellar-forge.receivables-retained-customer-handover.v1',status:'COMPLETE',
originalOperation:selection.originalOperation,workspaceId:selection.expectedWorkspaceId,
hostConfig:join(directory,'host-config.json'),workspace:'handover',customerId:selection.customerId,
accountDate:selection.asOf,caseDirectory:directory,url:caseSelection.url,tokenEnv:caseSelection.tokenEnv,
editionId,caseId,createdAt:captured.edition.createdAt});
return captured;
}
async function operationRoot(directory,input){
await privateDirectory(resolve(directory));const lease=await acquireStateLease(resolve(directory));try{await retain(join(directory,'selection.json'),input);return lease;}catch(error){await lease.close();throw error;}
}
async function flowAt(directory,kind){
const path=join(directory,'flow.json');if(await exists(path))return read(path);
const flow={schema:kind,createdAt:now(),phase:'PREPARED',ids:{case:randomUUID(),edition:randomUUID(),request:randomUUID()},results:{}};
await retain(path,flow);return flow;
}

/** Prepare a complete private handover from the original paused customer workspace. */
export async function prepareXeroCustomerHandover({directory,selection,releaseReceipt,passEnv='STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE',passphrase,signal}={}){
directory=resolve(directory);selection=normalizeSelection(selection);
need(!beneath(selection.stateRoot,directory)&&!beneath(directory,selection.stateRoot)&&directory!==selection.stateRoot,'Keep handover output separate from its captured original state.');
const lease=await operationRoot(directory,selection);let failed;
try{
const flow=await flowAt(directory,'stellar-forge.xero-customer-handover-progress.v1');
if(await exists(join(directory,'handover.json')))return read(join(directory,'handover.json'));
if(releaseReceipt){const bytes=await readBytes(resolve(releaseReceipt));const release=JSON.parse(bytes);need(release.schema==='stellar-forge.retained-customer-installed-release.v1'&&release.admission?.complete===true&&SHA.test(release.manifestSha256??''),'Retain the complete admitted selected release.','RELEASE');
const manifest=await open(safePath(release.manifestFile),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
try{const stat=await manifest.stat();need(stat.isFile()&&stat.nlink===1&&stat.size<=32*1024*1024,'Keep the original installed manifest.','RELEASE');need(sha(await manifest.readFile())===release.manifestSha256,'The admitted installed manifest changed.','RELEASE');}finally{await manifest.close();}
await retain(join(directory,'installed-release.json'),bytes);}
const caseDirectory=join(selection.accountingDirectory,'customer-handover',selection.operationId);
if(!flow.results.evidence){
const prepared=await withOwner(selection.accountingDirectory,async({host,client,configuration})=>{
const captured=await caseCapture({directory:caseDirectory,selection,host,client,configuration,caseId:flow.ids.case,editionId:flow.ids.edition});
return{case:captured,evidence:await evidence(host,selection)};
});
prepared.evidence=await retainedEvidence(join(directory,'source-evidence.json'),prepared.evidence);flow.results.case=prepared.case;
flow.results.evidence={sha256:sha(json(prepared.evidence)),revision:prepared.evidence.revision};flow.phase='ORIGINAL_CASE_CAPTURED';
await replace(join(directory,'flow.json'),flow);
}
const original=await read(join(directory,'source-evidence.json'));need(original.workspaceId===selection.expectedWorkspaceId,'Retain the original source evidence.','BINDING');
const sourceOptions={directory:selection.accountingDirectory,stateRoot:selection.stateRoot,quiesced:true,hostSources:hostProfile(selection),signal};
if(!flow.results.backup){
const output=join(directory,'accounting-backup');
if(await exists(output)){
const inspected=await inspectAccountingBackup({bundle:output});
const verified=await verifyAccountingBackup({bundle:output,expectedSha256:inspected.manifestSha256,passEnv,passphrase,signal});
need(await exists(join(directory,'source-review.json')),'Keep the review which selected this original encrypted backup.','REVIEW');
flow.results.backup={...inspected,output};flow.results.verified=verified;
}else{
const review=await reviewAccountingWorkspace(sourceOptions);need(review.revision===original.revision,'The original account changed after its complete case capture.','REVISION');
await retain(join(directory,'source-review.json'),review);
flow.results.backup=await snapshotAccountingWorkspace({...sourceOptions,output,expectedReviewId:review.reviewId,passEnv,passphrase});
flow.results.verified=await verifyAccountingBackup({bundle:output,expectedSha256:flow.results.backup.manifestSha256,passEnv,passphrase,signal});
}
flow.phase='ENCRYPTED_ORIGINAL_VERIFIED';await replace(join(directory,'flow.json'),flow);
}
const handover={schema:SCHEMA,operationId:selection.operationId,selection,preparedAt:now(),case:flow.results.case,
evidence:{file:'source-evidence.json',sha256:sha(json(original)),revision:original.revision},
backup:{directory:'accounting-backup',manifestSha256:flow.results.backup.manifestSha256,verified:flow.results.verified},
release:await exists(join(directory,'installed-release.json'))?{file:'installed-release.json',sha256:sha(await readBytes(join(directory,'installed-release.json')))}:null,
receiving:{module:'xero-customer-handover.mjs',mode:'receive',required:['receiver state root','responsible operator','original cash continuation selection','backup passphrase through its secret channel']},
scope:'PRIVATE_COMPLETE_ACCOUNT_AND_ORIGINAL_SOURCES'};
await retain(join(directory,'handover.json'),handover);flow.phase='COMPLETE';await replace(join(directory,'flow.json'),flow);return handover;
}catch(error){failed=error;await replace(join(directory,'last-error.json'),{at:now(),...errorView(error)}).catch(()=>{});throw error;}
finally{try{await lease.close();}catch(error){if(failed)failed.releaseError=errorView(error);else throw error;}}
}

/** Independently restore and continue the same original customer under a second native owner. */
export async function receiveXeroCustomerHandover({handoverDirectory,directory,receiver,passEnv='STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE',passphrase,signal}={}){
handoverDirectory=resolve(handoverDirectory);directory=resolve(directory);need(plain(receiver),'Supply the responsible receiver and exact original continuation.');
const handover=await read(join(handoverDirectory,'handover.json')),selection=normalizeSelection(handover.selection);
need(handover.schema===SCHEMA&&plain(receiver.continuation)&&selection.packageIds.includes(receiver.continuation.packageId),'Select an original package and explicit native cash continuation.','SELECTION');
const stateRoot=safePath(receiver.stateRoot),accountingDirectory=safePath(receiver.accountingDirectory);
need(beneath(stateRoot,accountingDirectory)&&!beneath(selection.stateRoot,stateRoot)&&!beneath(stateRoot,selection.stateRoot)&&stateRoot!==selection.stateRoot,'Restore into a separate private state root.');
need(!beneath(stateRoot,directory)&&!beneath(directory,stateRoot)&&directory!==stateRoot,'Keep the receiver operation separate from restored state.');
need(typeof receiver.actor==='string'&&receiver.actor.trim()&&receiver.actor.length<=1000,'Name the responsible second operator.');
const input={schema:RECEIVED,handoverSha256:sha(await readBytes(join(handoverDirectory,'handover.json'))),receiver:clone(receiver)};
const lease=await operationRoot(directory,input);let failed;
try{
const flow=await flowAt(directory,'stellar-forge.xero-customer-receiving-progress.v1');
if(await exists(join(directory,'receiving.json')))return read(join(directory,'receiving.json'));
const original=await read(join(handoverDirectory,handover.evidence.file));
need(sha(json(original))===handover.evidence.sha256,'The original complete evidence differs from its handover.','EVIDENCE');
await privateDirectory(stateRoot);await privateDirectory(accountingDirectory);
if(!flow.results.restored){
flow.results.restored=await restoreAccountingWorkspace({bundle:join(handoverDirectory,handover.backup.directory),
expectedSha256:handover.backup.manifestSha256,directory:accountingDirectory,stateRoot,quiesced:true,relocate:true,
expectedWorkspaceId:selection.expectedWorkspaceId,expectedSourcesSha256:selection.expectedSourcesSha256,
hostSources:hostProfile(selection,{stateRoot}),passEnv,passphrase,signal});
flow.phase='ORIGINAL_WORKSPACE_RESTORED';await replace(join(directory,'flow.json'),flow);
}
const continuation=await withOwner(accountingDirectory,async({host,client,configuration})=>{
if(!flow.results.before){
let before=await evidence(host,selection);
need(before.receivablesSha256===original.receivablesSha256&&before.economicSha256===original.economicSha256,'The independently restored original ledger differs from the handed-over ledger.','LEDGER');
need(json(before.files)===json(original.files),'One or more complete original source, template or report files changed during receiving.','ORIGINAL_FILES');
before=await retainedEvidence(join(directory,'receiver-before.json'),before);flow.results.before={revision:before.revision,files:before.files.length,economicSha256:before.economicSha256};
await replace(join(directory,'flow.json'),flow);
}
const preparedPath=join(directory,'continuation-request.json');
let prepared=await exists(preparedPath)?await read(preparedPath):null;
if(!prepared){
prepared=await originalControllers(host,async({workspace,receivables})=>{
const xero=new XeroReceivablesWorkspace(receivables),value=clone(receiver.continuation.selection),
preview=await xero.cashPreview(receiver.continuation.packageId,value);
need(SHA.test(preview.previewSha256??''),'Retain the full current native continuation review.','REVIEW');
return{packageId:receiver.continuation.packageId,preview,
request:{...value,revision:preview.revision,actor:receiver.actor.trim(),requestId:flow.ids.request,previewSha256:preview.previewSha256}};
});
await retain(preparedPath,prepared);
}
need(prepared.packageId===receiver.continuation.packageId&&prepared.request.requestId===flow.ids.request&&
prepared.request.actor===receiver.actor.trim()&&prepared.request.previewSha256===prepared.preview.previewSha256,
'Retain the exact original continuation request and responsible operator.','REQUEST');
const saved=await originalControllers(host,async({receivables})=>{
const xero=new XeroReceivablesWorkspace(receivables),value=clone(prepared.request);
const returned=await xero.cashCapture(prepared.packageId,value);
need(returned.operation?.requestId===flow.ids.request||returned.operation?.id===flow.ids.request,'Retain the original cash capture operation identity.','REQUEST');
return returned;
});
const receiptPath=join(directory,'continuation-receipt.json');
if(await exists(receiptPath)){const originalReceipt=await read(receiptPath);need(originalReceipt.operation.id===saved.operation.id&&originalReceipt.operation.intentSha256===saved.operation.intentSha256&&originalReceipt.cashCycle.id===saved.cashCycle.id,'Recover the same original captured continuation.','REQUEST');}
else await retain(receiptPath,saved);
const after=await evidence(host,selection);need(after.economicSha256===original.economicSha256,'A source-review continuation must preserve original financial entries.','ECONOMIC_CHANGE');
const receivedCase=await caseCapture({directory:join(accountingDirectory,'received-customer-handover',selection.operationId),
selection:{...selection,actor:receiver.actor,title:receiver.title??selection.title},host,client,configuration,caseId:flow.ids.case,editionId:flow.ids.edition});
return{saved,case:receivedCase,after};
});
flow.results.continuation={cashCycleId:continuation.saved.cashCycle.id,requestId:flow.ids.request,revision:continuation.saved.revision};
flow.results.case=continuation.case;flow.phase='ORIGINAL_CONTINUATION_RETAINED';await replace(join(directory,'flow.json'),flow);
// The responsible second operator closes and independently reopens the same restored account.
const reopened=await withOwner(accountingDirectory,async({host})=>originalControllers(host,async({workspace,receivables})=>{
const xero=new XeroReceivablesWorkspace(receivables);
const detail=await xero.cashCycle(receiver.continuation.packageId,continuation.saved.cashCycle.id);
need(detail.cashCycle.reviewSha256===continuation.saved.cashCycle.reviewSha256,'Retain the same reviewed continuation after reopening.','REOPEN');
return{workspaceId:accountingWorkspaceBinding(workspace.directory,workspace.state).workspaceId,revision:workspace.state.revision,cashCycle:detail.cashCycle};
}));
const result={schema:RECEIVED,status:'COMPLETE',operationId:selection.operationId,receivedAt:now(),actor:receiver.actor,
workspaceId:selection.expectedWorkspaceId,sourcesSha256:selection.expectedSourcesSha256,accountingDirectory,stateRoot,
originalRevision:original.revision,originalFileCount:original.files.length,economicSha256:original.economicSha256,
backupManifestSha256:handover.backup.manifestSha256,restored:flow.results.restored,case:flow.results.case,
continuation:flow.results.continuation,reopened,scope:'PRIVATE_COMPLETE_ACCOUNT_AND_ORIGINAL_SOURCES'};
await retain(join(directory,'receiving.json'),result);flow.phase='COMPLETE';await replace(join(directory,'flow.json'),flow);return result;
}catch(error){failed=error;await replace(join(directory,'last-error.json'),{at:now(),...errorView(error)}).catch(()=>{});throw error;}
finally{try{await lease.close();}catch(error){if(failed)failed.releaseError=errorView(error);else throw error;}}
}

export async function main(args=process.argv.slice(2)){
if(args.includes('--help')){process.stdout.write('xero-customer-handover prepare --out PRIVATE_OPERATION --selection PRIVATE_SELECTION_JSON [--release INSTALLED_RELEASE_JSON]\nxero-customer-handover receive --handover PRIVATE_HANDOVER --out PRIVATE_RECEIVING_OPERATION --receiver PRIVATE_RECEIVER_JSON\n');return;}
const [mode,...rest]=args,options={};need(rest.length%2===0,'Use complete named arguments.');
for(let i=0;i<rest.length;i+=2){need(['--out','--selection','--release','--handover','--receiver'].includes(rest[i])&&!Object.hasOwn(options,rest[i]),'Use each declared argument once.');options[rest[i]]=rest[i+1];}
need(options['--out'],'Select the private operation directory.');
let result;if(mode==='prepare')result=await prepareXeroCustomerHandover({directory:resolve(options['--out']),selection:await read(resolve(options['--selection'])),releaseReceipt:options['--release']});
else if(mode==='receive')result=await receiveXeroCustomerHandover({directory:resolve(options['--out']),handoverDirectory:resolve(options['--handover']),receiver:await read(resolve(options['--receiver']))});
else need(false,'Choose prepare or receive.');
process.stdout.write(json(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stderr.write(json(errorView(error)));process.exitCode=2;});
