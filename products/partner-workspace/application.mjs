// Apache-2.0. Original mobility and education staff services under Applications.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename,join} from 'node:path';
import {PartnerInstallation,canonicalDirectory,plain,readPrivateJSON,partnerError} from './client.mjs';
export const PARTNER_PROCESS_SCHEMA='stellar-forge.partner-process.v1';
const bridgeFiles=['files.py','source.py','manage.py','operations.py','launch.py'];
const launches=new WeakMap(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(value,code,message='The selected original workbench service changed.')=>{if(!value)throw partnerError(code,message);};
const product=id=>{const p=id.replace(/^partner-/,'');need(['mobility','education'].includes(p),'PARTNER_PRODUCT');return p;};
function port(value){const n=value===undefined||value===''?0:Number(value);need(Number.isInteger(n)&&n>=0&&n<=65535,'PARTNER_PORT');return n;}
export function partnerApplications(field,common){
  const fields=[field('directory','Prepared workbench installation','path',true,'Select the complete prepared or independently received private installation.'),field('python','Adapter Python','path',false,'Python used to inspect the installation; its selected original interpreter runs the staff application.'),field('port','Local application port','port',false,'Use 0 to select an available loopback port.'),...common.filter(x=>x.name==='environmentFile')];
  return [
    {id:'partner-mobility',command:'partner-workspace',title:'Mobility source review',terminal:false,requiredSource:'products/partner-workspace/native/operations.py',description:'Review original monthly datasets, quality, comparable city metrics, station flows and editable source findings.',fields},
    {id:'partner-education',command:'partner-workspace',title:'Education quality review',terminal:false,requiredSource:'products/partner-workspace/native/operations.py',description:'Operate exact course, framework and pathway editions, evidence, reviews and linked corrective actions.',fields},
  ];
}
export function validatePartnerSettings(type,settings){product(type.id);port(settings.port);}
export async function preparePartnerApplication(type,settings,{sourceDirectory,inputPath,selectedExecutable}){
  validatePartnerSettings(type,settings);const selectedProduct=product(type.id);
  sourceDirectory=await canonicalDirectory(sourceDirectory);
  const directory=await inputPath(settings.directory,'directory',false,true),adapter=await selectedExecutable(settings.python||'/usr/bin/python3');
  const inputs=[directory,...adapter.inputs];
  for(const name of bridgeFiles)inputs.push(await inputPath(join(sourceDirectory,'native',name),'file'));
  const client=new PartnerInstallation({directory:directory.path,sourceDirectory,python:adapter.executable});
  let installed;try{installed=(await client.inspect()).installation;}finally{await client.close();}
  need(installed.paths.directory===directory.path&&installed.product===selectedProduct,'PARTNER_PRODUCT_CHANGED');
  const nativePython=await selectedExecutable(installed.python.path);inputs.push(...nativePython.inputs,await inputPath(join(directory.path,'installation.json'),'file'));
  const edition=join(directory.path,'editions',installed.source_identity);
  for(const name of ['SOURCE.json','BRIDGE.json'])inputs.push(await inputPath(join(edition,name),'file'));
  const manifest=(await readPrivateJSON(join(edition,'SOURCE.json'),8*1024*1024)).value;
  need(manifest.schema==='stellar-forge.partner-product-source.v1'&&manifest.product===selectedProduct&&Array.isArray(manifest.files),'PARTNER_SOURCE_CHANGED');
  for(const row of manifest.files)inputs.push(await inputPath(join(installed.paths.source,row.path),'file'));
  for(const name of bridgeFiles)inputs.push(await inputPath(join(installed.paths.bridge,name),'file'));
  return {args:['service','--product',selectedProduct,'--directory',directory.path,'--native-source',sourceDirectory,'--python',adapter.executable,'--service-python',nativePython.executable,'--installation-id',installed.installation_id,'--source-identity',installed.source_identity,'--workspace-id',installed.workspace_id,'--installation-device',installed.binding.device,'--installation-inode',installed.binding.inode,'--port',String(port(settings.port))],inputs,createDirectories:[]};
}
export function partnerServiceSelection(args){
  need(Array.isArray(args)&&args[0]==='service','PARTNER_SERVICE_REQUEST');
  const fields=['product','directory','native-source','python','service-python','installation-id','source-identity','workspace-id','installation-device','installation-inode','port','managed-operation'],selected={};
  for(let i=1;i<args.length;i+=2){const key=args[i]?.startsWith('--')?args[i].slice(2):'';need(fields.includes(key)&&!Object.hasOwn(selected,key)&&typeof args[i+1]==='string'&&args[i+1],'PARTNER_SERVICE_REQUEST');selected[key]=args[i+1];}
  for(const key of fields.filter(x=>x!=='managed-operation'))need(Object.hasOwn(selected,key),'PARTNER_SERVICE_REQUEST');
  need(['mobility','education'].includes(selected.product)&&/^[a-f0-9-]{36}$/.test(selected['installation-id'])&&/^[a-f0-9]{64}$/.test(selected['source-identity'])&&/^[a-f0-9]{32}$/.test(selected['workspace-id']),'PARTNER_SERVICE_REQUEST');
  for(const key of ['installation-device','installation-inode'])need(/^[0-9]+$/.test(selected[key]),'PARTNER_SERVICE_REQUEST');port(selected.port);return selected;
}
async function currentSelection(request,environment=process.env){
  need(request.command==='partner-workspace'&&!request.pythonCommand,'PARTNER_SERVICE_REQUEST');
  const selected=partnerServiceSelection(request.args),client=new PartnerInstallation({directory:selected.directory,sourceDirectory:selected['native-source'],python:selected.python,binding:{installation_id:selected['installation-id'],source_identity:selected['source-identity']},environment});
  try{const installed=(await client.inspect()).installation;need(installed.product===selected.product&&installed.workspace_id===selected['workspace-id']&&installed.binding.device===selected['installation-device']&&installed.binding.inode===selected['installation-inode']&&installed.python.path===selected['service-python'],'PARTNER_REVIEW_CHANGED');return{selected,client,installed};}
  catch(error){await client.close();throw error;}
}
export async function verifyPartnerLaunch(request,operationDirectory){
  const value=await currentSelection(request);try{need(value.selected['managed-operation']===basename(operationDirectory),'PARTNER_MANAGED_OPERATION');await canonicalDirectory(operationDirectory,{privateOnly:true});}finally{await value.client.close();}
}
export async function preparePartnerChild(request,operationDirectory,originalArgs,environment){
  const {selected,client,installed}=await currentSelection(request,environment);
  try{
    need(selected['managed-operation']===basename(operationDirectory),'PARTNER_MANAGED_OPERATION');await canonicalDirectory(operationDirectory,{privateOnly:true});
    const ready=join(operationDirectory,'partner-'+randomUUID()+'.json');
    const reply=await client.call('commands.describe',{ready_file:ready,port:port(selected.port)}),command=reply.result.commands?.[0];
    need(reply.result.commands?.length===1&&command.role==='operator'&&command.product===selected.product&&command.workspace_id===installed.workspace_id&&command.executable===installed.python.path&&command.argv[0]===command.executable&&command.cwd===installed.paths.application,'PARTNER_ORIGINAL_COMMAND');
    need(sha(await readFile(command.script))===command.script_sha256,'PARTNER_ORIGINAL_SOURCE');await access(command.executable,constants.X_OK);
    launches.set(request,{selected,installed,command});
    return{executable:command.executable,args:command.argv.slice(1),options:{cwd:command.cwd,env:environment,shell:false,stdio:['ignore','pipe','pipe',3]}};
  }finally{await client.close();}
}
export async function partnerStartup(request,text,context={}){
  if(typeof text!=='string'||text.length>16384)return null;let announced;try{announced=JSON.parse(text);}catch{return null;}
  if(!plain(announced)||announced.schema!==PARTNER_PROCESS_SCHEMA)return null;
  const launch=launches.get(request);need(launch,'PARTNER_ORIGINAL_LAUNCH');const{selected,installed,command}=launch;
  const retained=(await readPrivateJSON(command.ready_file,16384)).value,{url,...identity}=retained;
  need(Object.keys(identity).sort().join('\0')===Object.keys(announced).sort().join('\0')&&Object.keys(identity).every(k=>identity[k]===announced[k])&&Number.isSafeInteger(context.pid)&&context.pid>0&&identity.pid===context.pid&&identity.role==='operator'&&identity.product===selected.product&&identity.workspace_id===installed.workspace_id&&identity.installation_id===installed.installation_id&&identity.source_identity===installed.source_identity&&identity.directory===installed.paths.directory&&identity.application===installed.paths.application&&identity.workspace===installed.paths.workspace&&identity.ready_file===command.ready_file&&identity.device===installed.binding.device&&identity.inode===installed.binding.inode&&identity.launcher_sha256===command.script_sha256,'PARTNER_ORIGINAL_LAUNCH_CHANGED');
  need(sha(await readFile(join(installed.paths.source,'workbench','app.py')))===identity.entry_sha256,'PARTNER_ENTRY_CHANGED');
  let parsed;try{parsed=new URL(url);}catch{throw partnerError('PARTNER_ORIGINAL_URL','The original ready file has an invalid URL.');}
  need(parsed.protocol==='http:'&&parsed.hostname==='127.0.0.1'&&parsed.origin===identity.origin&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash&&parsed.pathname==='/'&&(!port(selected.port)||Number(parsed.port)===port(selected.port)),'PARTNER_ORIGINAL_URL');
  return{url:parsed.href,original:{...identity,script_sha256:command.script_sha256}};
}
