// SPDX-License-Identifier: MIT
/** Actual native Operations custody for a following Econdb source edition. */
import {resolve,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {regular} from '../../../scf-starforge-20261009/distribution/runtime-workspace/storage.mjs';
import {reopenEcondbAnyPreparation} from './econdb-installation/following-service.mjs';
import {econdbReceivingNativeCommand,retainEcondbInstallationFile,ownEcondbReceivingDirectory} from './econdb-installation-receiving.mjs';
const HASH=/^[a-f0-9]{64}$/;
const helper=fileURLToPath(new URL('./econdb-installation-operations.py',import.meta.url));
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'ECONDB_FOLLOWING_NATIVE'});};
function paths(options){
 for(const key of ['operationsWorkspace','outputDirectory','python'])
  need(typeof options[key]==='string'&&isAbsolute(options[key])&&resolve(options[key])===options[key],
   'Select canonical absolute original native paths.');
 need(/^operation-[a-f0-9]{32}$/.test(options.caseId??''),'Select the original Operations case.');
}
async function invoke(options,name,args){
 paths(options);
 return econdbReceivingNativeCommand({python:options.python,args:[helper,'--workspace',options.operationsWorkspace,
  '--case',options.caseId,...args],outputDirectory:options.outputDirectory,name,signal:options.signal,
  leaseFds:options.leaseFds??[]});
}
export async function captureEcondbFollowingNative(options={}){
 paths(options);
 need(typeof options.priorPreparationDirectory==='string'&&isAbsolute(options.priorPreparationDirectory)&&
  HASH.test(options.expectedPriorPreparationSha256??''),'Select the complete retained prior preparation.');
 const prior=await reopenEcondbAnyPreparation({directory:options.priorPreparationDirectory,
  signal:options.signal,leaseFds:options.leaseFds??[]});
 need(prior.preparationSha256===options.expectedPriorPreparationSha256,'The complete prior preparation changed.');
 const out=await ownEcondbReceivingDirectory(options.outputDirectory),
  inputPath=join(out,'Following_Native_Capture_Input.json');
 await retainEcondbInstallationFile(inputPath,encode({selection:options.selection,priorPreparation:prior}));
 const observed=await invoke(options,'following-native-capture',['--following-context',inputPath]);
 need(observed.snapshot?.schema==='stellar-forge.econdb-following-native-snapshot.v1'&&
  observed.snapshot.nativeCaseId===options.caseId,'Retain the complete actual native snapshot.');
 const raw=encode(observed.snapshot),snapshotPath=join(out,'Following_Native_Snapshot.json');
 await retainEcondbInstallationFile(snapshotPath,raw);
 return {...observed,nativeSnapshotPath:snapshotPath,nativeSnapshotSha256:hash(raw),priorPreparation:prior};
}
export async function verifyEcondbFollowingNative(options={}){
 paths(options);
 for(const key of ['proofPath','nativeSnapshotPath'])
  need(typeof options[key]==='string'&&isAbsolute(options[key])&&resolve(options[key])===options[key],
   'Select the complete private original following proof and snapshot.');
 const proofRaw=await regular(options.proofPath,64*1024*1024),snapshotRaw=await regular(options.nativeSnapshotPath,8*1024*1024);
 if(options.expectedProofSha256!==undefined)need(hash(proofRaw)===options.expectedProofSha256,'The original following proof bytes changed.');
 if(options.expectedSnapshotSha256!==undefined)need(hash(snapshotRaw)===options.expectedSnapshotSha256,'The actual native snapshot bytes changed.');
 const result=await invoke(options,'following-native-proof',['--following-proof',options.proofPath,'--native-snapshot',options.nativeSnapshotPath]);
 need(HASH.test(result.followingSha256??'')&&result.caseSource?.caseId===options.caseId,'Keep the verified original native proof result.');
 return {...result,proof:{bytes:proofRaw.length,sha256:hash(proofRaw)},snapshot:{bytes:snapshotRaw.length,sha256:hash(snapshotRaw)}};
}
