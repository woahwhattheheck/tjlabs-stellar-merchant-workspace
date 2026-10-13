// MIT. Original Bloccpay in the maintained Applications lifecycle.
import { join } from 'node:path';
import { inspectMerchantRuntime } from '../sf46-release/runtime-package.mjs';
import { APPLICATION_PROVIDER_SCHEMA, observeApplicationStartup } from '../distribution/runtime-workspace/application-provider.mjs';
import { need, canonical } from './source/lib/files.mjs';
import { STARTUP_SCHEMA, OWN_SOURCE, inspectLaunch, launchOptions, readHostConnection, verifyHost, equal } from './host-connection.mjs';

const BASE='stellar/scf-starforge-20261009/bloccpay';
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:'bloccpay',order:540,
 catalog:({common,field})=>[{
  id:'bloccpay',command:'bloccpay',title:'Bloccpay operations',terminal:false,
  requiredSource:BASE+'/cli.mjs',
  description:'Open the original payment operations, payroll, signed event inbox and Bridge intake on one retained workspace.',
  fields:[
   field('workspaceDirectory','Private operations workspace','path',true),
   field('configurationFile','Private original configuration JSON','path',true),
   field('runtimeDirectory','Verified Bloccpay Node 24 runtime','path',true),
   field('runtimeSha256','Original runtime manifest SHA-256','text',false),
   field('sourceDirectory','Received original application source','path',false,'Omit for the complete source shipped with this product.'),
   field('sourceManifestSha256','Original application manifest SHA-256','text',false),
   field('expectedWorkspaceId','Original or received workspace ID','text',false),
   ...common,
  ],
 }],
 async prepare(type,settings,{inputPath,runtimeDirectory}){
  const maintained=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  const selected=await inspectLaunch({...settings,sourceDirectory:settings.sourceDirectory??join(maintained.sourceRoot,BASE,'source')});
  const inputs=[
   await inputPath(selected.workspaceDirectory,'directory',false,true),
   await inputPath(selected.configurationFile,'file'),
   await inputPath(selected.runtime.directory,'directory',false,true),
   await inputPath(join(selected.runtime.directory,'manifest.json'),'file'),
  ];
  for(const row of selected.source.files)inputs.push(await inputPath(join(selected.source.directory,row.path),'file'));
  const args=['serve','--directory',selected.workspaceDirectory,'--configuration',selected.configurationFile,
   '--runtime',selected.runtime.directory,'--runtime-sha256',selected.runtime.manifestSha256,
   '--source-directory',selected.source.directory,'--source-manifest-sha256',selected.source.sha256];
  if(settings.expectedWorkspaceId)args.push('--expected-workspace-id',settings.expectedWorkspaceId);
  return {args,inputs,createDirectories:[],resourceKey:canonical({family:'bloccpay',directory:selected.workspaceDirectory})};
 },
 matchRequest:request=>request.command==='bloccpay'&&request.args?.[0]==='serve',
 runArguments:({args,requestId})=>[...args,'--application-run-id',requestId],
 async verifyLaunch(request){await inspectLaunch(launchOptions(request.args));},
 async prepareChild(request,directory,originalArgs,environment){
  const selected=await inspectLaunch(launchOptions(request.args));
  // Execute the selected native runtime; its original launcher owns library setup.
  const wrapper=join(request.releaseDirectory,'source',BASE,'cli.mjs');
  return {executable:selected.runtime.nodeExecutable,args:[wrapper,...request.args],
   options:{cwd:request.homeDirectory,shell:false,env:environment,
    stdio:['ignore',request.applicationId?'pipe':'inherit',request.applicationId?'pipe':'inherit',3]}};
 },
 createObserver(request,directory){
  return observeApplicationStartup(request,directory,text=>{
   if(!text.startsWith('BLOCCPAY_APPLICATION_READY '))return null;
   const value=JSON.parse(text.slice('BLOCCPAY_APPLICATION_READY '.length));
   return async()=>{
    const selected=launchOptions(request.args);
    need(value.schema===STARTUP_SCHEMA&&value.status==='BLOCCPAY_APPLICATION_READY'&&value.runId===selected.runId&&
     value.directory===selected.workspaceDirectory&&value.sourceDirectory===selected.sourceDirectory&&value.sourceManifestSha256===selected.sourceManifestSha256&&
     value.runtimeDirectory===selected.runtimeDirectory&&value.runtimeSha256===selected.runtimeSha256&&
     (!selected.expectedWorkspaceId||value.workspaceId===selected.expectedWorkspaceId),'BLOCCPAY_ANNOUNCEMENT_CHANGED');
    const retained=await readHostConnection(value.connectionFile);
    need(retained.file.bytes===value.connection.bytes&&retained.file.sha256===value.connection.sha256&&
     retained.value.instanceId===value.instanceId&&retained.value.workspaceId===value.workspaceId&&
     retained.value.directory===value.directory&&retained.value.sourceDirectory===value.sourceDirectory&&
     retained.value.sourceManifestSha256===value.sourceManifestSha256&&retained.value.runtimeDirectory===value.runtimeDirectory&&
     retained.value.runtimeSha256===value.runtimeSha256&&retained.value.origin===value.origin,'BLOCCPAY_CONNECTION_CHANGED');
    const live=await verifyHost(retained.value,{signal:AbortSignal.timeout(15000)});
    need(equal(live.workspace.receivedFrom??null,value.receivedFrom??null),'BLOCCPAY_RECEIVED_IDENTITY_CHANGED');
    return {url:value.origin+'/',workspaceId:value.workspaceId,connectionFile:value.connectionFile,
     links:[{label:'SDP signed events',url:value.origin+'/sdp-events'},{label:'Bridge intake',url:value.origin+'/bridge'}],
     original:{schema:STARTUP_SCHEMA,runId:value.runId,instanceId:value.instanceId,directory:value.directory,
      sourceDirectory:value.sourceDirectory,sourceManifestSha256:value.sourceManifestSha256,
      runtimeDirectory:value.runtimeDirectory,runtimeSha256:value.runtimeSha256,receivedFrom:value.receivedFrom??null}};
   };
  },{lineLimit:32768});
 },
};
