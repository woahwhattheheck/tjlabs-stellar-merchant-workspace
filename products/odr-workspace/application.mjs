// Apache-2.0. Direct selected native host under the maintained Applications owner.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {OdrInstallation,canonicalDirectory,plain,readPrivateJSON,odrError} from './client.mjs';
export const ODR_PROCESS_SCHEMA='stellar-forge.odr-process.v1';
const bridgeFiles=['files.py','source.py','manage.py','operations.py','launch.py','engine.mjs','host.mjs'];
const launches=new WeakMap(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(value,code,message='The selected original ODR service changed.')=>{if(!value)throw odrError(code,message);};
function port(value){const n=value===undefined||value===''?0:Number(value);need(Number.isInteger(n)&&n>=0&&n<=65535,'ODR_PORT');return n;}
export function odrApplications(field,common){return [{
 id:'odr-review',command:'odr-workspace',title:'ODR source and Alpha review',terminal:false,requiredSource:'products/odr-workspace/native/operations.py',
 description:'Operate the original source, notification review, Alpha evidence and exact Dataverse request/response workspace with explicit durable saves.',
 fields:[field('directory','Prepared ODR installation','path',true,'Select the complete original prepared or received private installation.'),field('python','Adapter Python','path',false,'Python used to inspect the installation; original selected Python and Node run the service.'),field('port','Loopback port','port',false,'Use 0 for an available local port.'),...common.filter(x=>x.name==='environmentFile')]
}];}
export function validateOdrSettings(type,settings){need(type.id==='odr-review','ODR_APPLICATION');port(settings.port);}
export async function prepareOdrApplication(type,settings,{sourceDirectory,inputPath,selectedExecutable}){
 validateOdrSettings(type,settings);sourceDirectory=await canonicalDirectory(sourceDirectory);
 const directory=await inputPath(settings.directory,'directory',false,true),adapter=await selectedExecutable(settings.python||'/usr/bin/python3'),inputs=[directory,...adapter.inputs];
 for(const name of bridgeFiles)inputs.push(await inputPath(join(sourceDirectory,'native',name),'file'));
 const client=new OdrInstallation({directory:directory.path,sourceDirectory,python:adapter.executable});let installed;
 try{installed=(await client.inspect()).installation;}finally{await client.close();}
 need(installed.paths.directory===directory.path,'ODR_DIRECTORY_CHANGED');
 const nativePython=await selectedExecutable(installed.python.path),nativeNode=await selectedExecutable(installed.node.path);
 inputs.push(...nativePython.inputs,...nativeNode.inputs,await inputPath(join(directory.path,'installation.json'),'file'));
 const edition=join(directory.path,'editions',installed.source_identity);
 for(const name of ['APPLICATION.json','BRIDGE.json','BUILD.json'])inputs.push(await inputPath(join(edition,name),'file'));
 const app=(await readPrivateJSON(join(edition,'APPLICATION.json'),128*1024*1024)).value;
 need(app.schema==='commons.odr-alpha-application.v1'&&plain(app.files)&&plain(app.manifest),'ODR_SOURCE_CHANGED');
 for(const name of Object.keys(app.files))inputs.push(await inputPath(join(installed.paths.source,name),'file'));
 for(const name of bridgeFiles)inputs.push(await inputPath(join(installed.paths.bridge,name),'file'));
 inputs.push(await inputPath(installed.paths.html,'file'));
 return {args:['service','--directory',directory.path,'--native-source',sourceDirectory,'--python',adapter.executable,'--service-python',nativePython.executable,'--service-node',nativeNode.executable,'--installation-id',installed.installation_id,'--source-identity',installed.source_identity,'--workspace-id',installed.workspace_id,'--installation-device',installed.binding.device,'--installation-inode',installed.binding.inode,'--port',String(port(settings.port))],inputs,createDirectories:[]};
}
export function odrServiceSelection(args){
 need(Array.isArray(args)&&args[0]==='service','ODR_SERVICE_REQUEST');
 const fields=['directory','native-source','python','service-python','service-node','installation-id','source-identity','workspace-id','installation-device','installation-inode','port','managed-operation'],selected={};
 for(let n=1;n<args.length;n+=2){const key=args[n]?.startsWith('--')?args[n].slice(2):'';need(fields.includes(key)&&!Object.hasOwn(selected,key)&&typeof args[n+1]==='string'&&args[n+1],'ODR_SERVICE_REQUEST');selected[key]=args[n+1];}
 for(const key of fields.filter(x=>x!=='managed-operation'))need(Object.hasOwn(selected,key),'ODR_SERVICE_REQUEST');
 need(/^[a-f0-9-]{36}$/.test(selected['installation-id'])&&/^[a-f0-9]{64}$/.test(selected['source-identity'])&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(selected['workspace-id']),'ODR_SERVICE_REQUEST');
 for(const key of ['installation-device','installation-inode'])need(/^[0-9]+$/.test(selected[key]),'ODR_SERVICE_REQUEST');port(selected.port);return selected;
}
async function currentSelection(request,environment=process.env){
 need(request.command==='odr-workspace'&&!request.pythonCommand,'ODR_SERVICE_REQUEST');
 const selected=odrServiceSelection(request.args),client=new OdrInstallation({directory:selected.directory,sourceDirectory:selected['native-source'],python:selected.python,binding:{installation_id:selected['installation-id'],source_identity:selected['source-identity']},environment});
 try{const installed=(await client.inspect()).installation;need(installed.workspace_id===selected['workspace-id']&&installed.binding.device===selected['installation-device']&&installed.binding.inode===selected['installation-inode']&&installed.python.path===selected['service-python']&&installed.node.path===selected['service-node'],'ODR_REVIEW_CHANGED');return{selected,client,installed};}
 catch(error){await client.close();throw error;}
}
export async function verifyOdrLaunch(request,operationDirectory){
 const x=await currentSelection(request);try{need(x.selected['managed-operation']===basename(operationDirectory),'ODR_MANAGED_OPERATION');await canonicalDirectory(operationDirectory,{privateOnly:true});}finally{await x.client.close();}
}
export async function prepareOdrChild(request,operationDirectory,originalArgs,environment){
 const{selected,client,installed}=await currentSelection(request,environment);
 try{
  need(selected['managed-operation']===basename(operationDirectory),'ODR_MANAGED_OPERATION');await canonicalDirectory(operationDirectory,{privateOnly:true});
  const ready=join(operationDirectory,'odr-'+randomUUID()+'.json'),reply=await client.call('commands.describe',{ready_file:ready,port:port(selected.port)}),command=reply.result.commands?.[0];
  need(reply.result.commands?.length===1&&command.role==='operator'&&command.workspace_id===installed.workspace_id&&command.executable===installed.python.path&&command.argv[0]===command.executable&&command.cwd===installed.paths.application,'ODR_ORIGINAL_COMMAND');
  need(sha(await readFile(command.script))===command.script_sha256,'ODR_ORIGINAL_SOURCE');await access(command.executable,constants.X_OK);
  launches.set(request,{selected,installed,command});
  return{executable:command.executable,args:command.argv.slice(1),options:{cwd:command.cwd,env:environment,shell:false,stdio:['ignore','pipe','pipe',3]}};
 }finally{await client.close();}
}
export async function odrStartup(request,text,context={}){
 if(typeof text!=='string'||text.length>16384)return null;let announced;try{announced=JSON.parse(text);}catch{return null;}
 if(!plain(announced)||announced.schema!==ODR_PROCESS_SCHEMA)return null;
 const launch=launches.get(request);need(launch,'ODR_ORIGINAL_LAUNCH');const{selected,installed,command}=launch;
 const retained=(await readPrivateJSON(command.ready_file,16384)).value,{url,...identity}=retained;
 need(Object.keys(identity).sort().join('\0')===Object.keys(announced).sort().join('\0')&&Object.keys(identity).every(k=>identity[k]===announced[k])&&Number.isSafeInteger(context.pid)&&context.pid>0&&identity.pid===context.pid&&identity.role==='operator'&&identity.workspace_id===installed.workspace_id&&identity.installation_id===installed.installation_id&&identity.source_identity===installed.source_identity&&identity.directory===installed.paths.directory&&identity.ready_file===command.ready_file&&identity.device===installed.binding.device&&identity.inode===installed.binding.inode,'ODR_ORIGINAL_LAUNCH_CHANGED');
 need(sha(await readFile(join(installed.paths.bridge,'host.mjs')))===identity.entry_sha256&&sha(await readFile(join(installed.paths.bridge,'engine.mjs')))===identity.engine_sha256,'ODR_ENTRY_CHANGED');
 const app=(await readPrivateJSON(join(installed.paths.directory,'editions',installed.source_identity,'APPLICATION.json'),128*1024*1024)).value;
 const core=await import(pathToFileURL(join(installed.paths.source,'src/core.mjs')).href);need(sha(core.canonical(app))===identity.application_sha256,'ODR_APPLICATION_CHANGED');
 let parsed;try{parsed=new URL(url);}catch{throw odrError('ODR_ORIGINAL_URL','The original private ready file has an invalid URL.');}
 need(parsed.protocol==='http:'&&parsed.hostname==='127.0.0.1'&&parsed.origin===identity.origin&&!parsed.username&&!parsed.password&&!parsed.hash&&parsed.pathname==='/'&&[...parsed.searchParams.keys()].join(',')==='key'&&/^[a-f0-9]{64}$/.test(parsed.searchParams.get('key'))&&(!port(selected.port)||Number(parsed.port)===port(selected.port)),'ODR_ORIGINAL_URL');
 return{url:parsed.href,original:{...identity,script_sha256:command.script_sha256}};
}
