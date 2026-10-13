// Complete original-request receiving helpers. No provider or payment is created here.
import { mkdirSync, readFileSync, existsSync, lstatSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync, readdirSync, copyFileSync, constants, linkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { assert, canonical, digest, jsonDigest, clone } from './model.mjs';
import { putOriginal, hashOriginalFile } from './delivery.mjs';

export const FINANCE_OPERATION='ROZO-MERCHANT-SETTLEMENT-FINANCE-20261013';
export const PRODUCT='stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments';
export const jsonBytes=value=>Buffer.from(canonical(value)+'\n');
export function originalJSON(path){
  const st=lstatSync(path);assert(st.isFile()&&!st.isSymbolicLink()&&st.size<=192*1024*1024,'FINANCE_ORIGINAL','Read a bounded original ordinary JSON file.');
  return JSON.parse(readFileSync(path,'utf8'));
}
export function saveFinance(path,value){
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const tmp=path+'.writing-'+randomUUID(),fd=openSync(tmp,'wx',0o600);
  try{try{writeFileSync(fd,jsonBytes(value));fsyncSync(fd);}finally{closeSync(fd);}renameSync(tmp,path);
    const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}
  }finally{if(existsSync(tmp))unlinkSync(tmp);}
}
export function retainFinance(path,value){const raw=Buffer.isBuffer(value)?value:jsonBytes(value);putOriginal(path,raw);return {path,bytes:raw.length,sha256:digest(raw)};}
export function financeFiles(root,prefix=''){
  const rows=[];
  for(const entry of readdirSync(join(root,prefix),{withFileTypes:true})){
    const path=prefix?prefix+'/'+entry.name:entry.name,full=join(root,path),stat=lstatSync(full);
    assert(!stat.isSymbolicLink(),'FINANCE_LINK','Preserve ordinary original finance members.');
    if(stat.isDirectory())rows.push(...financeFiles(root,path));
    else {assert(stat.isFile(),'FINANCE_FILE','Preserve ordinary original finance members.');rows.push({path,...hashOriginalFile(full)});}
  }
  return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
export function copyFinanceTree(source,destination){
  const rows=financeFiles(source);mkdirSync(destination,{recursive:true,mode:0o700});
  for(const row of rows){
    const from=join(source,row.path),to=join(destination,row.path);mkdirSync(dirname(to),{recursive:true,mode:0o700});
    const check=path=>{const st=lstatSync(path),got=hashOriginalFile(path);assert(st.isFile()&&!st.isSymbolicLink()&&got.bytes===row.bytes&&got.sha256===row.sha256,'FINANCE_SOURCE_CHANGED','The original complete file differs: '+row.path);};
    check(from);if(existsSync(to)){check(to);continue;}
    const temp=to+'.copy-'+randomUUID();
    try{copyFileSync(from,temp,constants.COPYFILE_EXCL);check(temp);check(from);const fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
      try{linkSync(temp,to);}catch(error){if(error.code!=='EEXIST')throw error;check(to);}
    }finally{if(existsSync(temp))unlinkSync(temp);}
  }
  assert(canonical(financeFiles(destination))===canonical(rows),'FINANCE_COPY','The complete original source copy differs.');return rows;
}
export function recordFinanceProcess(directory,name,result){
  retainFinance(join(directory,'process-attempts',name+'-'+jsonDigest(result)+'.json'),result);
  saveFinance(join(directory,name+'.json'),result);return result;
}
export async function financeChild(command,args,{environment=process.env,onOutput}={}){
  const child=spawn(command,args,{env:environment,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>16*1024*1024){child.kill('SIGTERM');}onOutput?.(String(b));});
  child.stderr.on('data',b=>{stderr+=b;if(stderr.length>4*1024*1024)child.kill('SIGTERM');});
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal,pid:child.pid}));});
  return {...result,stdout,stderr};
}
export function financeUUID(operation,label){const h=jsonDigest({operation,label});return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
export function openFinanceJournal(service,directory,plan){
  directory=resolve(directory);mkdirSync(directory,{recursive:true,mode:0o700});
  const w=service.workspace,planRaw=jsonBytes(plan),planHash=digest(planRaw);
  putOriginal(join(directory,'FINANCE_PLAN.json'),planRaw);
  const path=join(directory,'FINANCE_PROGRESS.json');
  const progress=existsSync(path)?originalJSON(path):{schema:'stellar-forge.rozo-finance-native-progress.v1',
    operationId:plan.operationId,workspaceId:w.meta().workspaceId,originId:w.meta().originId,planSha256:planHash,steps:{},requests:{},maintenance:{},state:'prepared'};
  assert(progress.schema==='stellar-forge.rozo-finance-native-progress.v1'&&progress.operationId===plan.operationId&&
    progress.workspaceId===w.meta().workspaceId&&progress.originId===w.meta().originId&&progress.planSha256===planHash,
    'FINANCE_OPERATION','Continue the exact original finance plan and workspace.',409);
  const save=()=>saveFinance(path,progress);
  const step=async(name,fn)=>{
    if(Object.hasOwn(progress.steps,name))return clone(progress.steps[name]);
    progress.phase=name;progress.state='running';save();
    const result=JSON.parse(JSON.stringify(await fn()));progress.steps[name]=result;save();return result;
  };
  const invoke=async(label,command,payload)=>{
    let envelope=progress.requests[label];
    if(!envelope){
      const selected=typeof payload==='function'?await payload():payload;
      envelope={workspaceId:w.meta().workspaceId,requestId:'rozo-finance-native-'+jsonDigest({operationId:plan.operationId,label}),
        expectedRevision:w.meta().revision,actor:plan.actor,command,payload:clone(selected)};
      progress.requests[label]=envelope;save();
    }
    assert(envelope.command===command,'FINANCE_REQUEST','Keep the saved original command for this step.',409);
    const response=await service.execute(envelope),accepted=w.request(envelope.requestId);
    assert(accepted?.state==='accepted'&&canonical(accepted.envelope)===canonical(envelope)&&accepted.fingerprint===jsonDigest(envelope),
      'FINANCE_ACCEPTANCE','The original request has not been durably accepted.',409);
    const result=accepted.result;
    if(result?.result?.originalResult){
      const descriptor=result.result.originalResult,raw=w.wholeObject(descriptor.sha256);
      assert(raw.length===descriptor.bytes&&digest(raw)===descriptor.sha256,'FINANCE_RESULT','The original native result differs.');
      const value=JSON.parse(raw);putOriginal(join(directory,'native-results',jsonDigest({label})+'.json'),raw);
      return {requestId:envelope.requestId,result:value,outcome:result.result};
    }
    return {requestId:envelope.requestId,result:clone(result.result??result),delivery:response.delivery??null};
  };
  save();return {directory,progress,save,step,invoke,planHash};
}

export async function originalFinanceHostSources({merchantConfig,accountingAlias,expectedSha256,retainedDefinition}={}){
  let oauth=null,identity=retainedDefinition??null;
  if(merchantConfig){
    const path=resolve(merchantConfig),before=hashOriginalFile(path);
    if(expectedSha256)assert(before.sha256===expectedSha256,'FINANCE_HOST_CONFIGURATION','The selected original private merchant configuration differs.');
    const {readMerchantConfig}=await import('../../../../stellar-forge/mcp-merchant-operator/config.mjs');
    const config=await readMerchantConfig(path),definition=config.accounting?.workspaces?.[accountingAlias];
    assert(definition,'FINANCE_HOST_CONFIGURATION','Select the actual original configured Accounting alias.');
    const original=definition.platforms?.qbo?.oauth,after=hashOriginalFile(path);
    assert(before.bytes===after.bytes&&before.sha256===after.sha256,'FINANCE_HOST_CONFIGURATION','The original merchant configuration changed while it was read.');
    if(original){
      oauth={connectionsFile:original.connectionsFile,selectionDirectory:original.selectionDirectory,
        expectedSelectionSha256:original.expectedSelectionSha256??null};
      const selected={alias:accountingAlias,configSha256:before.sha256,configBytes:before.bytes,oauth};
      if(identity)assert(canonical(selected)===canonical(identity),'FINANCE_HOST_CONFIGURATION','The configured original host definition differs from the captured selection.');
      identity=selected;
    }else assert(!identity&&!expectedSha256,'FINANCE_HOST_CONFIGURATION','The captured configured QuickBooks host profile is absent.');
  }else if(identity){
    assert(identity.alias===accountingAlias&&identity.configSha256===expectedSha256&&identity.oauth,
      'FINANCE_HOST_CONFIGURATION','Use the exact original captured host definition.');
    oauth=identity.oauth;
  }else{assert(!expectedSha256,'FINANCE_HOST_CONFIGURATION','Retain the captured original host definition.');return {hostSources:undefined,identity:null};}
  if(!oauth)return {hostSources:undefined,identity:null};
  const {merchantQuickBooksRecoverySources,relocateMerchantQuickBooksRecoveryProfile}=
    await import('../../../../stellar-forge/mcp-merchant-operator/accounting-quickbooks-oauth.mjs');
  let resolver=merchantQuickBooksRecoverySources(oauth,{environment:process.env});
  const hostSources=input=>resolver(input);
  hostSources.relocateProfile=(original,{mapPath})=>{
    assert(original.binding?.connectionsFile===oauth.connectionsFile&&original.binding?.selectionDirectory===oauth.selectionDirectory&&
      (original.binding?.expectedSelectionSha256??null)===(oauth.expectedSelectionSha256??null),
      'FINANCE_HOST_CONFIGURATION','The authenticated backup host differs from the selected original definition.');
    const mapped=relocateMerchantQuickBooksRecoveryProfile(original,{mapPath}),environment={...process.env};
    for(const connection of mapped.binding.connections)environment[connection.directoryEnv]=connection.directory;
    resolver=merchantQuickBooksRecoverySources({...oauth,connectionsFile:mapped.binding.connectionsFile,
      selectionDirectory:mapped.binding.selectionDirectory},{environment});
    return mapped;
  };
  return {hostSources,identity};
}
