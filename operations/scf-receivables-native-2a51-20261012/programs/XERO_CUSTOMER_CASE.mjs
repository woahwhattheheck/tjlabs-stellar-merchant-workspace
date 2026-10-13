#!/usr/bin/env node
// MIT. Retain the original two-cycle customer and independently receive its full installed workspace.
import {constants} from 'node:fs';
import {open,mkdir,readFile,lstat,realpath,readdir,rename,unlink} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {acquireStateLease} from '../../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {privateSupportDirectory} from '../../../stellar-forge/mcp-merchant-operator/host-files.mjs';
import {inspectAccountingWorkspaceBinding} from '../../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/binding.mjs';
import {prepareXeroCustomerHandover,receiveXeroCustomerHandover} from '../xero-customer-handover.mjs';

const json=value=>JSON.stringify(value,null,2)+'\n',sha=value=>createHash('sha256').update(value).digest('hex');
const SCHEMA='stellar-forge.xero-independent-customer-programme.v1';
function need(ok,message){if(!ok)throw Object.assign(new Error(message),{code:'XERO_CUSTOMER_RECEIVING'});}
async function exists(path){try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function dir(path){await privateSupportDirectory(path);const stat=await lstat(path);need(stat.isDirectory()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&await realpath(path)===path,'Use original owner-private real directories.');return path;}
async function retain(path,value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:json(value));await dir(dirname(path));if(await exists(path)){need((await readFile(path)).equals(bytes),'Keep the original complete programme input or result.');return;}const handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}
async function replace(path,value){const temp=path+'.'+randomUUID()+'.next';await retain(temp,value);try{await rename(temp,path);}finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}}
async function read(path,maximum=128*1024*1024){const stat=await lstat(path);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size<=maximum,'Select one complete original regular file.');const bytes=await readFile(path);need(bytes.length===stat.size&&bytes.length<=maximum,'The original file changed during reading.');return{bytes,value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};}
const inside=(root,path)=>{const part=relative(root,path);return part!==''&&!part.startsWith('../')&&part!=='..'&&!isAbsolute(part);};
function errorView(error){return{code:error?.code??'ERROR',message:String(error?.message??error),stack:String(error?.stack??''),...(error?.details?{details:error.details}:{}),...(error?.outcomeUnknown===true?{outcomeUnknown:true}:{}),...(error?.reopenRequired===true?{reopenRequired:true}:{}),...(error?.commitUncertainty?{commitUncertainty:error.commitUncertainty}:{})};}
async function child(entry,args,{cwd,environment,stdout,stderr}){
const out=await open(stdout,'wx',0o600),err=await open(stderr,'wx',0o600);let launched=false;
try{return await new Promise((done,reject)=>{const process=spawn(globalThis.process.execPath,[entry,...args],{cwd,env:environment,stdio:['ignore',out.fd,err.fd]});process.once('spawn',()=>{launched=true;});process.once('error',reject);process.once('close',(code,signal)=>done({code,signal,launched}));});}
finally{await out.sync();await err.sync();await out.close();await err.close();}
}
export async function main(args=process.argv.slice(2)){
if(args.includes('--help')){process.stdout.write('XERO_CUSTOMER_CASE.mjs --release ORIGINAL_INSTALLED_RELEASE_JSON --out PRIVATE_OPERATION [--continuation PRIVATE_ORIGINAL_CASH_SELECTION_JSON]\nRequires STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE through the original secret environment.\n');return;}
const options={};need(args.length%2===0,'Use complete named programme arguments.');
for(let i=0;i<args.length;i+=2){need(['--release','--out','--continuation'].includes(args[i])&&!Object.hasOwn(options,args[i]),'Use each original programme argument once.');options[args[i]]=args[i+1];}
need(options['--release']&&options['--out'],'Select the original admitted release and private receiving operation.');
const out=resolve(options['--out']),releasePath=resolve(options['--release']),sourceRoot=fileURLToPath(new URL('../../../',import.meta.url));
const release=await read(releasePath,4*1024*1024);
need(release.value.schema==='stellar-forge.retained-customer-installed-release.v1'&&release.value.admission?.complete===true,'Use the completed original installed admission receipt.');
need(resolve(release.value.sourceRoot)===resolve(sourceRoot),'Run this programme from the exact admitted installed source.');
need(!inside(sourceRoot,out)&&!inside(out,sourceRoot)&&out!==resolve(sourceRoot),'Keep private customer state outside installed source.');
const manifest=await readFile(release.value.manifestFile);need(sha(manifest)===release.value.manifestSha256,'The installed release manifest changed.');
need(typeof process.env.STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE==='string'&&Buffer.byteLength(process.env.STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE)>=16&&Buffer.byteLength(process.env.STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE)<=65536,'Provide the original backup secret before starting the complete customer lifecycle.');
await dir(out);const lease=await acquireStateLease(out);let result,failed;
try{
await retain(join(out,'installed-release.json'),release.bytes);
const flowPath=join(out,'programme.json'),flow=await exists(flowPath)?(await read(flowPath)).value:{
schema:SCHEMA,operationId:randomUUID(),createdAt:new Date().toISOString(),phase:'PREPARED',releaseSha256:sha(release.bytes),sourceRoot,results:{}};
need(flow.releaseSha256===sha(release.bytes)&&flow.sourceRoot===sourceRoot,'Continue this operation with the same installed release.');
if(!await exists(flowPath))await retain(flowPath,flow);
const finalPath=join(out,'XERO_CUSTOMER_CASE_RESULT.json');
if(await exists(finalPath)){result=(await read(finalPath)).value;need(result.status==='PASS','Retain the failed original receiving result and review its saved operation.');process.stdout.write(json(result));return result;}
const predecessorResult=join(out,'XERO_CASH_CHECK_RESULT.json'),sourceParent=await dir(join(out,'original-customer'));
await replace(join(out,'RETENTION.json'),{schema:SCHEMA,operationId:flow.operationId,status:'STARTED',sourceRoot,
release:join(out,'installed-release.json'),predecessorResult,sourceParent,handover:join(out,'handover'),
receiver:join(out,'independent-operator'),receiverStateRoot:join(out,'received-customer'),
originalProgramme:'XERO_CASH_CHECK.mjs',createdAt:flow.createdAt});
if(!await exists(predecessorResult)){
need(flow.phase!=='ORIGINAL_PROGRAMME_STARTED','The original predecessor has no complete result. Inspect its retained logs and process receipt before any further execution.');
flow.phase='ORIGINAL_PROGRAMME_STARTED';await replace(flowPath,flow);
const environment={...process.env,SCF_CASH_KEEP:'1',SCF_CASH_RESULT:predecessorResult,SCF_CASH_TMPDIR:sourceParent};
const run=await child(join(sourceRoot,'XERO_CASH_CHECK.mjs'),['--commissioning-mcp'],{
cwd:sourceRoot,environment,stdout:join(out,'original-customer.stdout.log'),stderr:join(out,'original-customer.stderr.log')});
flow.results.predecessorProcess=run;await replace(flowPath,flow);
need(run.code===0&&!run.signal,'The complete original customer programme did not finish. Keep its retained workspace and logs.');
}
const predecessor=await read(predecessorResult),original=predecessor.value;
need(original.schema==='stellar-forge.xero-cash-native-check.v1'&&original.status==='PASS','Receive the complete original two-cycle customer result.');
const accountingDirectory=resolve(original.workspaceDirectory),stateRoot=dirname(accountingDirectory);
need(inside(sourceParent,stateRoot)&&inside(stateRoot,accountingDirectory),'The retained original workspace escaped its selected private working volume.');
const binding=await inspectAccountingWorkspaceBinding(accountingDirectory),state=(await read(join(accountingDirectory,'workspace.json'),32_000_000)).value;
const originalRoots=new Set([accountingDirectory,...['outboxDir','proofDir','termsFile','recoveredDir'].map(key=>state.sources[key]).filter(Boolean)]);
const extraSources=[];let index=0;
for(const item of (await readdir(stateRoot,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
const path=join(stateRoot,item.name);if(originalRoots.has(path))continue;
need(item.isFile()||item.isDirectory(),'The original customer working volume contains an unsupported source type.');
need(![...originalRoots].some(root=>inside(path,root)||inside(root,path)),'Use exact original source roots for a nested operating volume.');
extraSources.push({name:'OriginalSource'+String(++index).padStart(4,'0'),path,kind:item.isDirectory()?'directory':'file'});
}
extraSources.sort((a,b)=>a.path.localeCompare(b.path));
const selection={operationId:flow.operationId,title:'Original customer: two-cycle Xero and independent operator',
actor:'Original customer handover operator',originalOperation:'SCF-XERO-INDEPENDENT-RECEIVING-2A51-20261013',
asOf:original.asOf,stateRoot,accountingDirectory,expectedWorkspaceId:binding.workspaceId,expectedSourcesSha256:binding.sourcesSha256,
customerId:original.identities.customerId,packageIds:[original.firstPackageId,original.secondPackageId],
cashCycles:[{packageId:original.firstPackageId,cycleId:original.baselineCycleId},{packageId:original.secondPackageId,cycleId:original.secondCycleId}],
commissioningCaptureIds:[original.commissioning.baselineCaptureId,original.commissioning.captureId,original.identities.commissioningMCPCaptureId].filter(Boolean),
extraSources,externalWritersStopped:true};
await retain(join(out,'handover-selection.json'),selection);
flow.phase='ORIGINAL_CUSTOMER_RETAINED';flow.results.original={file:predecessorResult,sha256:sha(predecessor.bytes),accountingDirectory,
workspaceId:binding.workspaceId,sourcesSha256:binding.sourcesSha256};await replace(flowPath,flow);
const handover=await prepareXeroCustomerHandover({directory:join(out,'handover'),selection,releaseReceipt:releasePath});
let continuation;
if(options['--continuation'])continuation=(await read(resolve(options['--continuation']),32*1024*1024)).value;
else{
const cycle=state.receivables.xero.cashCycles.find(row=>row.id===original.secondCycleId);
need(cycle&&Array.isArray(cycle.selection.importIds)&&cycle.selection.importIds.length,'Retain the original second-cycle source selection.');
continuation={packageId:original.secondPackageId,selection:{...structuredClone(cycle.selection),
label:'Independent operator receiving of the original customer cash history',baselineCycleId:original.secondCycleId}};
}
await retain(join(out,'original-continuation.json'),continuation);
const receiver={actor:'Independent receiving operator',title:'Independently received original Xero customer',
stateRoot:join(out,'received-customer'),accountingDirectory:join(out,'received-customer','accounting'),continuation};
await retain(join(out,'receiver-selection.json'),receiver);
flow.phase='ORIGINAL_HANDOVER_VERIFIED';flow.results.handover={file:join(out,'handover','handover.json'),manifestSha256:handover.backup.manifestSha256};await replace(flowPath,flow);
const received=await receiveXeroCustomerHandover({handoverDirectory:join(out,'handover'),directory:join(out,'independent-operator'),receiver});
need(received.status==='COMPLETE'&&received.workspaceId===binding.workspaceId,'Complete the independent original receiving.');
result={schema:SCHEMA,status:'PASS',operationId:flow.operationId,completedAt:new Date().toISOString(),node:process.version,
release:{receipt:join(out,'installed-release.json'),sha256:sha(release.bytes),sourceCommit:release.value.sourceCommit,manifestSha256:release.value.manifestSha256},
original:{result:predecessorResult,sha256:sha(predecessor.bytes),accountingDirectory,workspaceId:binding.workspaceId,
firstPackageId:original.firstPackageId,secondPackageId:original.secondPackageId,baselineCycleId:original.baselineCycleId,secondCycleId:original.secondCycleId},
handover:{directory:join(out,'handover'),manifestSha256:handover.backup.manifestSha256},receiving:received,
outcomes:['The unchanged complete original customer programme is retained with its source inputs and durable native requests.',
'The selected installed release and existing durable customer case remain bound to the original complete account.',
'The original encrypted accounting recovery engine verifies and relocates that account into a separate private state root.',
'Every selected original Xero package, returned response, cash cycle and commissioning file retains its exact bytes and identities.',
'A responsible second operator saves the explicit reviewed original cash continuation and reopens that same retained result.',
'Both workspaces, the encrypted backup, complete customer cases, original requests and full logs remain available.']};
await retain(finalPath,result);flow.phase='COMPLETE';flow.results.receiving=received;await replace(flowPath,flow);
await replace(join(out,'RETENTION.json'),{schema:SCHEMA,operationId:flow.operationId,status:'COMPLETE',sourceRoot,
result:finalPath,originalDirectory:accountingDirectory,receivedDirectory:received.accountingDirectory,
handover:join(out,'handover'),receiver:join(out,'independent-operator'),release:join(out,'installed-release.json')});
process.stdout.write(json(result));return result;
}catch(error){failed=error;process.exitCode=1;result={schema:SCHEMA,status:'FAIL',at:new Date().toISOString(),...errorView(error),
operationDirectory:out,retained:true};await replace(join(out,'LAST_ERROR.json'),result).catch(()=>{});process.stderr.write(json(result));throw error;}
finally{try{await lease.close();}catch(error){if(failed)failed.releaseError=errorView(error);else throw error;}}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))main().catch(()=>{process.exitCode=1;});
