// MIT. Managed Applications for the original Open-Meteo settings and native workspace.
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {APPLICATION_PROVIDER_SCHEMA,applicationPreparation,observeApplicationStartup}
 from '../../distribution/runtime-workspace/application-provider.mjs';
import {inspectMerchantRuntime} from '../../sf46-release/runtime-package.mjs';
import {SCHEMA,need,plain,sha,encoded} from './contract.mjs';
import {WEATHER_APPLICATION_RUNTIME_SCHEMA,inspectWeatherApplication,weatherManagedOptions}
 from './applications-launcher.mjs';

export const WEATHER_APPLICATION_ID='open-meteo-weather';
const sourcePrefix='stellar/scf-starforge-20261009';
function requireBinding(options,selection){
 need(options.expectedSettingsSha256===selection.settingsSha256,'WEATHER_SETTINGS_CHANGED');
 need(options.expectedSelectionSha256===selection.selectionSha256,'WEATHER_ORIGINAL_SELECTION_CHANGED');
 need(typeof options.expectedRuntimeRoot==='string','WEATHER_RUNTIME_SELECTION_REQUIRED');
}
async function liveJSON(origin,path,cookie){
 const response=await fetch(new URL(path,origin),{
  redirect:'error',headers:{cookie,accept:'application/json'},signal:AbortSignal.timeout(10000)
 });
 need(response.status===200&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),'WEATHER_APPLICATION_LISTENER_CHANGED');
 const chunks=[];let length=0;
 try{
  for await(const chunk of response.body){
   length+=chunk.byteLength;need(length<=16*1024*1024,'WEATHER_APPLICATION_STATUS_TOO_LARGE');chunks.push(chunk);
  }
 }catch(error){await response.body?.cancel().catch(()=>{});throw error;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
export default {
 schema:APPLICATION_PROVIDER_SCHEMA,id:WEATHER_APPLICATION_ID,order:1030,
 catalog({common,field}){
  return [{
   id:WEATHER_APPLICATION_ID,command:'weather-managed',title:'Open-Meteo Weather',terminal:true,
   requiredSource:sourcePrefix+'/partners/open-meteo-operations/applications-launcher.mjs',
   description:'Open original forecast, history and ensemble sources, edit decisions, receive and renew complete reports, and continue the original operator request.',
   fields:[
    field('settingsFile','Original Weather settings','path',true,'Existing private settings.json in the original Weather customer state root.'),
    field('terminalPython','Terminal Python 3','path',false,'Python 3 executable for the original managed approval terminal; defaults to /usr/bin/python3.'),
    ...common
   ]
  }];
 },
 validateSettings(_type,settings){weatherManagedOptions(['--settings',settings.settingsFile]);},
 async prepare(_type,settings,{inputPath,runtimeDirectory}){
  const selection=await inspectWeatherApplication(settings.settingsFile);
  const runtime=await inspectMerchantRuntime(runtimeDirectory,{load:false});
  const selectedRuntimeRoot=join(runtime.sourceRoot,sourcePrefix);
  const prepared=applicationPreparation({...settings,...selection},inputPath);
  const {args,inputs,createDirectories,path,option}=prepared;
  await path('settingsFile','file',false,true);
  for(const name of ['stateRoot','weatherDirectory','buyerDirectory','originalOperatorDirectory','setupDirectory'])
   if(selection[name])await path(name,'directory',false,true);
  if(selection.sellerClient)await path('sellerClient','file',false,true);
  option('--settings',selection.settingsFile);
  option('--settings-sha256',selection.settingsSha256);
  option('--selection-sha256',selection.selectionSha256);
  option('--runtime-root',selectedRuntimeRoot);
  return {args,inputs,createDirectories,
   resourceKey:sha(encoded({family:WEATHER_APPLICATION_ID,directory:selection.stateRoot})),
   weatherSelection:{...selection,runtimeRoot:selectedRuntimeRoot},
   applicationReview:{
    schema:'stellar-forge.application-review-content.v1',title:'Original Weather customer workspace',
    summary:'Open these saved settings in the selected installed runtime. Existing Weather records remain editable in their original workspace.',
    sections:[
     {title:'Customer selection',rows:[
      {label:'Operating mode',value:selection.mode==='review'?'Review and receiving':'Operator and receiving'},
      {label:'Original settings',value:selection.settingsFile},
      {label:'Settings SHA-256',value:selection.settingsSha256},
      {label:'State root',value:selection.stateRoot},
      {label:'Weather directory',value:selection.weatherDirectory},
      {label:'Selected runtime source',value:selectedRuntimeRoot}
     ]},
     {title:'Native operator and provider',rows:[
      {label:'Original buyer state',value:selection.buyerDirectory??'Review workspace'},
      {label:'Original operator',value:selection.originalOperatorDirectory??'Review workspace'},
      {label:'Original setup',value:selection.setupDirectory??'Not configured'},
      {label:'Saved seller client',value:selection.sellerClient??'Not configured'},
      {label:'Provider mode',value:selection.providerMode},
      {label:'Credential environment name',value:selection.apiKeyEnv??'Not configured'},
      {label:'Proxy environment name',value:selection.proxyEnv??'Not configured'},
      {label:'Approval terminal',value:'Original controlling terminal with explicit operator responses'}
     ]},
     {title:'Original selection identity',collapsed:true,rows:[
      {label:'Selection SHA-256',value:selection.selectionSha256},
      {label:'Database',value:selection.databaseIdentity.path},
      {label:'Database device / inode',value:selection.databaseIdentity.dev+' / '+selection.databaseIdentity.ino},
      {label:'Directory identities',value:selection.directoryIdentities.map(item=>item.path+' — '+item.dev+' / '+item.ino)},
      {label:'Saved client SHA-256',value:selection.sellerClientSha256??'Not configured'}
     ]}
    ]
   }};
 },
 matchRequest(request){return !request.pythonCommand&&request.command==='weather-managed';},
 async verifyLaunch(request){
  const options=weatherManagedOptions(request.args);
  requireBinding(options,await inspectWeatherApplication(options.settingsFile));
 },
 createObserver(request,directory){
  return observeApplicationStartup(request,directory,text=>{
   if(!text.startsWith('{"schema":"'+WEATHER_APPLICATION_RUNTIME_SCHEMA+'",'))return null;
   return ()=>weatherApplicationStartup(request,text);
  },{lineLimit:65536});
 }
};

/** Read the announced original private session; no Weather mutation is dispatched. */
export async function weatherApplicationStartup(request,text){
 if(request.command!=='weather-managed')return null;
 let announced;try{announced=JSON.parse(text);}catch{return null;}
 if(!plain(announced)||announced.schema!==WEATHER_APPLICATION_RUNTIME_SCHEMA||announced.provider!==WEATHER_APPLICATION_ID)return null;
 const options=weatherManagedOptions(request.args),selection=await inspectWeatherApplication(options.settingsFile);
 requireBinding(options,selection);
 for(const [key,value]of Object.entries(selection)){
  if(key!=='schema')need(isDeepStrictEqual(announced[key],value),'WEATHER_APPLICATION_STARTUP_CHANGED');
 }
 need(announced.runtimeRoot===options.expectedRuntimeRoot&&typeof announced.originId==='string'&&announced.originId.length>0,'WEATHER_APPLICATION_STARTUP_CHANGED');
 const url=new URL(announced.url);
 need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&!url.hash&&
  Number(url.port)>=1&&Number(url.port)<=65535&&url.pathname==='/'&&url.searchParams.size===1&&
  /^[a-f0-9]{64}$/.test(url.searchParams.get('access')??'')&&
  (!options.port||Number(url.port)===options.port),'WEATHER_APPLICATION_URL_CHANGED');
 const bootstrap=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});
 const cookie=bootstrap.headers.get('set-cookie')?.match(/^(weather_session=[a-f0-9]{64});/);
 try{
  need(bootstrap.status===303&&bootstrap.headers.get('location')==='/'&&cookie,'WEATHER_APPLICATION_SESSION_CHANGED');
 }finally{await bootstrap.body?.cancel().catch(()=>{});}
 const meta=await liveJSON(url.origin,'/api/meta',cookie[1]);
 need(meta.providerMode===selection.providerMode&&meta.reviewMode===(selection.mode==='review'),'WEATHER_APPLICATION_LISTENER_CHANGED');
 const state=await liveJSON(url.origin,'/api/state',cookie[1]);
 need(state.schema===SCHEMA&&state.directory===selection.weatherDirectory&&state.mode===selection.mode,'WEATHER_APPLICATION_LISTENER_CHANGED');
 return {url:url.href,workspaceId:announced.originId,original:{
  ...selection,schema:WEATHER_APPLICATION_RUNTIME_SCHEMA,runtimeRoot:announced.runtimeRoot,
  provider:WEATHER_APPLICATION_ID,originId:announced.originId
 }};
}
