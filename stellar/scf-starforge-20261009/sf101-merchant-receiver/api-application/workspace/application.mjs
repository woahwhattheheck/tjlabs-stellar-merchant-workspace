// MIT. Source-owned API merchant console in the installed Applications lifecycle.
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectMerchantRuntime} from '../../../sf46-release/runtime-package.mjs';
import {APPLICATION_PROVIDER_SCHEMA,observeApplicationStartup} from '../../../distribution/runtime-workspace/application-provider.mjs';
import {absolute,need,plain} from '../../../distribution/runtime-workspace/storage.mjs';
import {readMerchantWorkspaceLaunch,LAUNCH_SCHEMA,SELECTION_SCHEMA} from './cli.mjs';
import {readConfiguration,HASH,UUID} from './configuration.mjs';

const PRODUCT='stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/';
const COMMAND='api-merchant-workspace';
const FLAGS=['--config','--port','--expected-config-sha256','--expected-workspace-sha256',
 '--expected-source-sha256','--expected-code-sha256'];
const portLabel=port=>port===0?'Choose an available local port':String(port);
const scalar=value=>typeof value==='string'||typeof value==='number'||typeof value==='boolean'||value===null
 ?String(value):JSON.stringify(value);

function reviewContent(selected){
 const source=selected.source,checkout=source.checkout;
 const rows=[
  {label:'Service',value:source.serviceName},
  {label:'Merchant console',value:selected.directory},
  {label:'Workspace',value:selected.workspace.id??'Create the first workspace in this selected directory'},
  {label:'Browser port',value:portLabel(selected.port)},
  {label:'Operator name',value:selected.actor},
  {label:'Customer API origin',value:source.gatewayBaseUrl},
  {label:'Checkout',value:checkout.purchaseOrigin+checkout.path},
  {label:'Original merchant state',value:checkout.state},
  {label:'Original delivery outbox',value:checkout.outbox},
 ];
 const sections=[
  {title:'Selected merchant',rows},
  {title:'Payment terms',rows:Object.entries(checkout.payment).map(([label,value])=>({label,value:scalar(value)}))},
  {title:'Application functions',rows:source.functions.map(fn=>({
   label:fn.id,value:[
    fn.description,fn.path,
    fn.apiCompatible?'Available for priced API routes':'Uses the original paid-job file intake',
    String(fn.maxInputBytes)+' input bytes; '+String(fn.maxOutputBytes)+' output bytes; '+String(fn.timeoutMs)+' ms',
   ],
  }))},
 ];
 if(source.backup.configured)sections.push({title:'Complete application backup',rows:[
  {label:'Application source',value:source.backup.applicationRoot},
  {label:'Captured data',value:source.backup.dataRoots.length
   ?source.backup.dataRoots.map(root=>root.name+': '+root.path):'No additional data roots selected'},
  {label:'Passphrase environment name',value:source.backup.passEnv},
  {label:'Environment path bindings',value:source.backup.environmentBindings.length
   ?source.backup.environmentBindings.map(binding=>binding.environment+' → '+binding.dataRoot+'/'+binding.path)
   :'No additional environment path bindings selected'},
 ]});
 else sections.push({title:'Complete application backup',rows:[
  {label:'Backup selection',value:'Add the original application root, any data roots, path bindings and passphrase environment name to the private configuration before first launch.'},
 ]});
 sections.push({title:'Selected configuration and source',collapsed:true,rows:[
  {label:'Merchant jobs configuration',value:source.merchantPath},
  {label:'Application source',value:source.applicationPath},
  {label:'Console configuration',value:selected.config},
  {label:'Configuration SHA-256',value:selected.configSha256},
  {label:'Selected source SHA-256',value:selected.sourceSha256},
  {label:'Console code SHA-256',value:selected.codeSha256},
  {label:'Saved workspace SHA-256',value:selected.workspace.sha256},
  {label:'Native Python',value:selected.python},
 ]});
 return {schema:'stellar-forge.application-review-content.v1',title:'API merchant console',
  summary:'Operate saved offers, original checkout handoffs, the application service, purchased allowance, execution recovery and complete application receiving in one retained workspace.',
  sections};
}

/** Inspect the selected installed edition without opening the native workspace. */
export async function prepareMerchantWorkspaceApplication(settings,context){
 const {inputPath,runtimeDirectory,selectedExecutable}=context;
 need(typeof inputPath==='function','APPLICATION_API_MERCHANT_CONTEXT_REQUIRED');
 const configurationFile=absolute(settings.configurationFile);
 const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
 const entry=await inputPath(join(runtime.sourceRoot,PRODUCT,'cli.mjs'),'file');
 need(HASH.test(entry.sha256??''),'APPLICATION_API_MERCHANT_SOURCE_REQUIRED');
 const moduleUrl=pathToFileURL(entry.path);moduleUrl.searchParams.set('merchantSource',entry.sha256);
 const original=await import(moduleUrl.href);
 need(typeof original.inspectMerchantWorkspaceLaunch==='function','APPLICATION_API_MERCHANT_SOURCE_REQUIRED');
 const selected=await original.inspectMerchantWorkspaceLaunch({configFile:configurationFile,port:settings.port??0});
 need(plain(selected)&&selected.schema===SELECTION_SCHEMA&&selected.config===configurationFile&&
  HASH.test(selected.configSha256??'')&&HASH.test(selected.sourceSha256??'')&&HASH.test(selected.codeSha256??'')&&
  HASH.test(selected.resourceKey??'')&&selected.directory===absolute(selected.directory)&&
  selected.workspace?.path===join(selected.directory,'workspace.json')&&
  (selected.workspace.sha256==='new'||HASH.test(selected.workspace.sha256))&&
  (selected.workspace.id===null||UUID.test(selected.workspace.id))&&Array.isArray(selected.files)&&
  selected.source&&Array.isArray(selected.source.functions),
  'APPLICATION_API_MERCHANT_SELECTION_CHANGED');
 const inputs=[],createDirectories=[],paths=new Set();
 for(const file of selected.files){
  need(plain(file)&&HASH.test(file.sha256??'')&&Number.isSafeInteger(file.bytes)&&file.bytes>=0,
   'APPLICATION_API_MERCHANT_INPUT_CHANGED');
  const input=await inputPath(file.path,'file',false,['configuration','workspace'].includes(file.role));
  need(input.bytes===file.bytes&&(!input.sha256||input.sha256===file.sha256),'APPLICATION_API_MERCHANT_INPUT_CHANGED');
  need(!paths.has(input.path),'APPLICATION_API_MERCHANT_INPUT_REPEATED');paths.add(input.path);
  inputs.push({...input,sha256:file.sha256,role:file.role});
 }
 const entryAgain=inputs.find(input=>input.path===entry.path);
 need(entryAgain?.sha256===entry.sha256,'APPLICATION_API_MERCHANT_SOURCE_CHANGED');
 const directory=await inputPath(selected.directory,'directory',true,true);
 inputs.push(directory);if(!directory.exists)createDirectories.push(directory.path);
 // Keep original native state mutable; the Applications selection binds directories,
 // while the checkout and execution owners retain their own journal revisions.
 for(const path of new Set([selected.source.checkout.state,selected.source.checkout.outbox])){
  if(paths.has(path))continue;
  const input=await inputPath(path,'directory',true,true);inputs.push(input);paths.add(path);
  if(!input.exists)createDirectories.push(input.path);
 }
 if(typeof selected.python==='string'&&selected.python.startsWith('/')){
  need(typeof selectedExecutable==='function','APPLICATION_API_MERCHANT_EXECUTABLE_REQUIRED');
  const executable=await selectedExecutable(selected.python);inputs.push(...executable.inputs);
 }
 const args=['serve','--config',configurationFile,'--port',String(selected.port),
  '--expected-config-sha256',selected.configSha256,'--expected-workspace-sha256',selected.workspace.sha256,
  '--expected-source-sha256',selected.sourceSha256,'--expected-code-sha256',selected.codeSha256];
 return {args,inputs,createDirectories,resourceKey:selected.resourceKey,applicationReview:reviewContent(selected)};
}
function requestSelection(request){
 need(!request.pythonCommand&&!request.terminal&&request.command===COMMAND&&Array.isArray(request.args)&&
  request.args[0]==='serve','APPLICATION_API_MERCHANT_STARTUP_CHANGED');
 const values=new Map();
 for(let i=1;i<request.args.length;i+=2){
  const flag=request.args[i],value=request.args[i+1];
  need(FLAGS.includes(flag)&&!values.has(flag)&&typeof value==='string'&&value.length>0,
   'APPLICATION_API_MERCHANT_STARTUP_CHANGED');
  values.set(flag,value);
 }
 need(values.size===FLAGS.length,'APPLICATION_API_MERCHANT_STARTUP_CHANGED');
 const port=values.get('--port'),workspace=values.get('--expected-workspace-sha256');
 need(/^(0|[1-9][0-9]*)$/.test(port)&&Number(port)<=65535&&
  (workspace==='new'||HASH.test(workspace))&&
  ['--expected-config-sha256','--expected-source-sha256','--expected-code-sha256'].every(flag=>HASH.test(values.get(flag))),
  'APPLICATION_API_MERCHANT_STARTUP_CHANGED');
 return {config:absolute(values.get('--config')),port:Number(port),workspace,
  configSha256:values.get('--expected-config-sha256'),sourceSha256:values.get('--expected-source-sha256'),
  codeSha256:values.get('--expected-code-sha256')};
}
/** Resolve only the first original startup announcement accepted by the shared writer. */
export function merchantWorkspaceStartup(request,text){
 if(typeof text!=='string'||text.length>16384||!text.startsWith('{'))return null;
 let value;try{value=JSON.parse(text);}catch{return null;}
 if(!plain(value)||value.schema!==LAUNCH_SCHEMA||value.state!=='LISTENING')return null;
 const selected=requestSelection(request);
 need(value.config===selected.config&&value.configSha256===selected.configSha256&&
  value.sourceSha256===selected.sourceSha256&&value.codeSha256===selected.codeSha256&&
  value.expectedWorkspaceSha256===selected.workspace&&value.requestedPort===selected.port&&
  Number.isSafeInteger(value.port)&&value.port>0&&value.port<=65535&&
  (selected.port===0||selected.port===value.port)&&UUID.test(value.instanceId)&&UUID.test(value.workspaceId),
  'APPLICATION_API_MERCHANT_STARTUP_CHANGED');
 return async()=>{
  const configuration=await readConfiguration(selected.config,{expectedSha256:selected.configSha256});
  need(value.directory===configuration.directory&&value.launchFile===join(configuration.directory,'api-merchant-launch.json'),
   'APPLICATION_API_MERCHANT_STARTUP_CHANGED');
  const record=await readMerchantWorkspaceLaunch(value.launchFile);
  for(const name of ['instanceId','workspaceId','directory','config','configSha256','sourceSha256','codeSha256',
   'pid','url','port','requestedPort','expectedWorkspaceSha256','startedAt'])
   need(record[name]===value[name],'APPLICATION_API_MERCHANT_STARTUP_CHANGED');
  return {url:record.url,workspaceId:record.workspaceId,connectionFile:record.file,original:{
   schema:LAUNCH_SCHEMA,instanceId:record.instanceId,workspaceId:record.workspaceId,pid:record.pid,
   directory:record.directory,config:record.config,configSha256:record.configSha256,
   sourceSha256:record.sourceSha256,codeSha256:record.codeSha256,launchFile:record.file,
  }};
 };
}
export default{
 schema:APPLICATION_PROVIDER_SCHEMA,id:COMMAND,order:415,appendPort:false,
 catalog({common,field}){
  return [{
   id:COMMAND,command:COMMAND,title:'API merchant console',terminal:false,requiredSource:PRODUCT+'cli.mjs',
   description:'Publish or adopt original API offers; operate checkout handoffs, service, allowance, retained results, usage and complete encrypted application receiving.',
   fields:[
    field('configurationFile','Merchant console configuration','path',true,
     'Select the private file created by api-merchant-workspace configure. It selects the original jobs application, checkout terms and private workspace.'),
    ...common,
   ],
  }];
 },
 validateSettings(_type,settings){
  need(typeof settings.configurationFile==='string'&&settings.configurationFile.length>0,
   'APPLICATION_API_MERCHANT_CONFIGURATION_REQUIRED');
 },
 prepare(_type,settings,context){return prepareMerchantWorkspaceApplication(settings,context);},
 matchRequest(request){
  return !request.pythonCommand&&request.command===COMMAND&&Array.isArray(request.args)&&
   request.args[0]==='serve'&&request.args.includes('--expected-code-sha256');
 },
 createObserver(request,directory){
  return observeApplicationStartup(request,directory,text=>
   text.startsWith('{"schema":"'+LAUNCH_SCHEMA+'",')?merchantWorkspaceStartup(request,text):null);
 },
};
