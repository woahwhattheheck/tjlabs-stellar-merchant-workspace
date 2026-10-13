// SPDX-License-Identifier: MIT
// Source-only original transfer preparation. Native Installation preview/save stays with SF47.
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {inspectCommissioningTransfer} from './commissioning.mjs';
import {commissioningInstallationTemplate,prepareCommissioningInstallation,INSTALLATION_SCHEMA} from './installation-core.mjs';
import {readProfile} from '../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/profiles.mjs';
import {readWorkflowSeriesPrivateFile,workflowSeriesPrivateDirectory} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {writeConsoleWorkflowFile} from '../../stellar-forge/mcp-merchant-operator/console/client-files.mjs';
const maximum=64*1024*1024;
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'INSTALLATION_SOURCE_BINDING'});};
const parse=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
async function original(path,expected=null){
  const bytes=await readWorkflowSeriesPrivateFile(resolve(path),maximum);
  const identity={bytes:bytes.length,sha256:hash(bytes)};
  if(expected)need(identity.bytes===expected.bytes&&identity.sha256===expected.sha256,
    'The selected original manifest differs from the exact decision input: '+expected.path+'.');
  return{bytes,value:parse(bytes),identity};
}
async function retain(root,name,bytes,files){
  const path=join(root,name);let parent=root;
  for(const part of name.split('/').slice(0,-1)){parent=join(parent,part);await workflowSeriesPrivateDirectory(parent,true);}
  await writeConsoleWorkflowFile(path,bytes);
  files.push({path:name,bytes:bytes.length,sha256:hash(bytes)});
}
async function copySource(source,root,manifest,manifestRaw,files){
  const destination=await workflowSeriesPrivateDirectory(join(root,'commissioning-source'),true);
  for(const name of ['blobs','commands','results','reviews','runs','buyers'])
    await workflowSeriesPrivateDirectory(join(destination,name),true);
  for(const row of manifest.files){
    const bytes=await readWorkflowSeriesPrivateFile(join(source,row.path),maximum);
    need(bytes.length===row.bytes&&hash(bytes)===row.sha256,'The original source changed while preparing '+row.path+'.');
    await retain(root,'commissioning-source/'+row.path,bytes,files);
  }
  // Full original manifest is last; the unchanged native inspector receives it.
  await retain(root,'commissioning-source/TRANSFER.json',manifestRaw,files);
  await inspectCommissioningTransfer(destination);
}
async function verifyFiles(root,files){
  const seen=new Set();
  for(const file of files){
    need(typeof file.path==='string'&&!file.path.startsWith('/')&&!file.path.includes('\\')&&
      file.path.split('/').every(x=>x&&x!=='.'&&x!=='..')&&!seen.has(file.path),'The preparation inventory differs.');
    seen.add(file.path);const raw=await readWorkflowSeriesPrivateFile(join(root,file.path),maximum);
    need(raw.length===file.bytes&&hash(raw)===file.sha256,'A complete prepared file changed: '+file.path);
  }
}
export async function inspectCommissioningInstallation(directory){
  const root=await workflowSeriesPrivateDirectory(resolve(directory));
  const value=await original(join(root,'INSTALLATION_PREPARATION.json'));
  need(value.value.schema===INSTALLATION_SCHEMA&&Array.isArray(value.value.files),'Open the complete original preparation.');
  await verifyFiles(root,value.value.files);
  const native=await inspectCommissioningTransfer(join(root,'commissioning-source'));
  const raw=await readWorkflowSeriesPrivateFile(join(root,'commissioning-source','TRANSFER.json'),maximum);
  need(hash(raw)===value.value.transfer.sha256&&raw.length===value.value.transfer.bytes&&
    native.jobId===value.value.jobId&&native.selectionSha256===value.value.selectionSha256,
    'The complete preparation retains a different original commissioning selection.');
  const intent=(await original(join(root,'PREPARATION_INTENT.json'))).value;
  need(['inputs','template','prepare'].includes(intent.mode)&&
    Object.keys(intent).every(k=>JSON.stringify(intent[k])===JSON.stringify(value.value[k])),
    'The original preparation intent differs.');
  const expected=['PREPARATION_INTENT.json','inputs/profile.json','source-files.json',
    'commissioning-source/TRANSFER.json',...native.files.map(f=>'commissioning-source/'+f.path)];
  if(intent.mode!=='inputs')expected.push('inputs/original-seed.json','inputs/original-case.json','bindings.json');
  if(intent.mode==='template')expected.push('source-mapping.json');
  if(intent.mode==='prepare')expected.push('inputs/original-bindings.json','installation-input.json',
    'installation-preview-input.json','WORKORDER.md','installation-source-binding.json','preparation.json');
  need(expected.length===value.value.files.length&&expected.every(p=>value.value.files.some(f=>f.path===p)),
    'The whole preparation file inventory is incomplete.');
  for(const[key,path]of [['seed','inputs/original-seed.json'],['caseSnapshot','inputs/original-case.json'],['bindings','inputs/original-bindings.json']])
    if(intent[key]){const item=value.value.files.find(f=>f.path===path);need(item&&item.bytes===intent[key].bytes&&item.sha256===intent[key].sha256,'An original preparation input identity differs.');}
  const profile=value.value.files.find(f=>f.path==='inputs/profile.json');
  need(profile.bytes===intent.profile.bytes&&profile.sha256===intent.profile.sha256,'The original full profile identity differs.');
  return{...value.value,directory:root,receipt:value.identity};
}
export async function prepareCommissioningInstallationFiles(options){
  need(options&&['inputs','template','prepare'].includes(options.mode),'Choose inputs, template or prepare.');
  const source=await workflowSeriesPrivateDirectory(resolve(options.transfer)),out=resolve(options.out);
  need(out!==source&&!out.startsWith(source+'/')&&!source.startsWith(out+'/'),'Choose a separate private preparation directory.');
  need(typeof options.expectedTransferSha256==='string'&&/^[a-f0-9]{64}$/.test(options.expectedTransferSha256),
    'Bind the actual original TRANSFER.json SHA256 before preparing.');
  const transfer=await original(join(source,'TRANSFER.json'));
  need(transfer.identity.sha256===options.expectedTransferSha256,'The selected original transfer manifest bytes differ.');
  await inspectCommissioningTransfer(source);
  const jobDescriptor=transfer.value.files.find(file=>file.path==='job.json');
  const selectionDescriptor=transfer.value.files.find(file=>file.path==='selection.json');
  need(jobDescriptor&&selectionDescriptor,'The selected original manifest must include its job and full selection.');
  const job=await original(join(source,'job.json'),jobDescriptor);
  const selection=await original(join(source,'selection.json'),selectionDescriptor);
  // The inspector retains the original file inventory; this also verifies its full original selection hash.
  const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
  need(hash(Buffer.from(JSON.stringify(ordered(selection.value))))===job.value.selectionSha256,'The full original selection hash differs.');
  const profile=readProfile('facilitator-commissioning');
  const profileHandle=await open(profile.source.path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let profileRaw;
  try{
    const stat=await profileHandle.stat();
    need(stat.isFile()&&stat.size<=2*1024*1024,'Select the complete maintained installed profile.');
    profileRaw=await profileHandle.readFile();
    need(profileRaw.length===profile.source.bytes&&hash(profileRaw)===profile.source.sha256,'The installed profile changed during preparation.');
  }finally{await profileHandle.close();}
  let seed=null,caseSnapshot=null,bindings=null,result=null;
  if(options.mode!=='inputs'){
    need(options.seed&&options.caseSnapshot,'Select the original native seed and complete current case JSON.');
    seed=await original(options.seed);caseSnapshot=await original(options.caseSnapshot);
    const input={seed:seed.value,caseSnapshot:caseSnapshot.value,job:job.value,transfer:transfer.value,
      transferIdentity:transfer.identity,profile:profile.value};
    if(options.mode==='prepare'){
      need(options.bindings,'Select complete retained bindings.');bindings=await original(options.bindings);
      result=prepareCommissioningInstallation({...input,bindings:bindings.value});
      need(encode(result.prepared.document).length<=128*1024,'The full Installation exceeds its original 128 KiB native limit.');
    }else result=commissioningInstallationTemplate(input);
  }
  const intent={schema:INSTALLATION_SCHEMA,mode:options.mode,jobId:job.value.id,
    selectionSha256:job.value.selectionSha256,transfer:transfer.identity,
    profile:{id:profile.value.id,bytes:profile.source.bytes,sha256:profile.source.sha256},
    ...(seed?{seed:seed.identity,caseSnapshot:caseSnapshot.identity}:{}),...(bindings?{bindings:bindings.identity}:{})};
  await workflowSeriesPrivateDirectory(dirname(out));
  await workflowSeriesPrivateDirectory(out,true);
  await writeConsoleWorkflowFile(join(out,'PREPARATION_INTENT.json'),intent);
  const files=[];await retain(out,'PREPARATION_INTENT.json',encode(intent),files);
  await copySource(source,out,transfer.value,transfer.bytes,files);
  await retain(out,'inputs/profile.json',profileRaw,files);
  if(seed)await retain(out,'inputs/original-seed.json',seed.bytes,files);
  if(caseSnapshot)await retain(out,'inputs/original-case.json',caseSnapshot.bytes,files);
  if(bindings)await retain(out,'inputs/original-bindings.json',bindings.bytes,files);
  const sourceFiles=[{path:'TRANSFER.json',...transfer.identity},...transfer.value.files]
    .map(file=>({...file,preparedPath:'commissioning-source/'+file.path}));
  await retain(out,'source-files.json',encode({schema:'stellar-forge.facilitator-installation-sources.v1',
    jobId:job.value.id,selectionSha256:job.value.selectionSha256,files:sourceFiles}),files);
  if(options.mode==='template'){
    await retain(out,'bindings.json',encode(result.bindings),files);
    await retain(out,'source-mapping.json',encode({basis:result.basis,sourceBindings:result.sourceBindings,missingSources:result.missingSources}),files);
  }
  if(options.mode==='prepare'){
    await retain(out,'bindings.json',encode(result.bindings),files);
    await retain(out,'installation-input.json',encode(result.prepared.document),files);
    await retain(out,'installation-preview-input.json',encode(result.prepared.preview),files);
    await retain(out,'WORKORDER.md',Buffer.from(result.workorder),files);
    const {workorder,prepared,...binding}=result;
    const {document,preview,...preparation}=prepared;
    await retain(out,'installation-source-binding.json',encode(binding),files);
    await retain(out,'preparation.json',encode(preparation),files);
  }
  await verifyFiles(out,files);
  const completion={...intent,files,basis:result?.basis??null,selections:result?.prepared?.selections??[],
    missingSources:result?.missingSources??[],
    continuation:options.mode==='inputs'?'Attach these complete original files to the same Operations case, then read its current case and seed.':
      options.mode==='template'?'Retain actual customer choices in a separate complete binding file. After any source attachment, receive a current case/seed and new template.':
      'Open installation-input.json through the original Installation preview/save. Preserve the original native save UUID and every funded/Workshare check.'};
  await writeConsoleWorkflowFile(join(out,'INSTALLATION_PREPARATION.json'),completion);
  return inspectCommissioningInstallation(out);
}
