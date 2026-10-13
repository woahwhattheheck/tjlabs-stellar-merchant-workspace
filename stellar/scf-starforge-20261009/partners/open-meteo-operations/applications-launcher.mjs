#!/usr/bin/env node
// MIT. Managed launch over the original Open-Meteo customer workspace.
import {lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {runtimeRoot} from './runtime.mjs';
import {absolute,privateDirectory,readPrivate} from './files.mjs';
import {sha,need,encoded} from './contract.mjs';
import {readWeatherSettings,WeatherWorkspace,safeCode} from './workspace.mjs';
import {startWeatherServer} from './server.mjs';

export const WEATHER_APPLICATION_SELECTION_SCHEMA='stellar-forge.weather-application-selection.v1';
export const WEATHER_APPLICATION_RUNTIME_SCHEMA='stellar-forge.weather-application-runtime.v1';
const identity=(path,stat)=>({path,dev:String(stat.dev),ino:String(stat.ino)});

/** Inspect existing roots without opening the database or changing its lease. */
export async function inspectWeatherApplication(settingsFile){
 absolute(settingsFile);
 const bytes=await readPrivate(settingsFile,65536);
 const settings=await readWeatherSettings(settingsFile);
 need(isDeepStrictEqual(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),settings),'WEATHER_SETTINGS_CHANGED');
 need(settingsFile===join(settings.stateRoot,'settings.json'),'ORIGINAL_WEATHER_SETTINGS_REQUIRED');
 const directoryIdentities=[];
 for(const path of [...new Set([settings.stateRoot,settings.weatherDirectory,settings.buyerDirectory,settings.originalOperatorDirectory,settings.setupDirectory].filter(Boolean))]){
  await privateDirectory(path);
  directoryIdentities.push(identity(path,await lstat(path)));
 }
 const database=join(settings.weatherDirectory,'weather.sqlite'),stat=await lstat(database);
 need(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&await realpath(database)===database,'ORIGINAL_WEATHER_DATABASE_REQUIRED');
 if(settings.sellerClient){
  need(sha(await readPrivate(settings.sellerClient,2097152))===settings.sellerClientSha256,'ORIGINAL_CLIENT_CHANGED');
 }
 need(sha(await readPrivate(settingsFile,65536))===sha(bytes),'WEATHER_SETTINGS_CHANGED');
 const selection={
  schema:WEATHER_APPLICATION_SELECTION_SCHEMA,
  settingsFile,settingsSha256:sha(bytes),
  mode:settings.mode==='review'?'review':'operator',
  stateRoot:settings.stateRoot,weatherDirectory:settings.weatherDirectory,
  buyerDirectory:settings.buyerDirectory??null,
  originalOperatorDirectory:settings.originalOperatorDirectory??null,
  setupDirectory:settings.setupDirectory??null,
  sellerClient:settings.sellerClient??null,
  sellerClientSha256:settings.sellerClientSha256??null,
  providerMode:settings.provider.mode,
  apiKeyEnv:settings.provider.apiKeyEnv??null,
  proxyEnv:settings.provider.proxyEnv??null,
  directoryIdentities,databaseIdentity:identity(database,stat)
 };
 return {...selection,selectionSha256:sha(encoded(selection))};
}

/** The same parser is used by the managed command and its startup observer. */
export function weatherManagedOptions(args){
 need(Array.isArray(args),'CLI_ARGUMENTS_REQUIRED');
 const values={},allowed=new Set(['--settings','--settings-sha256','--selection-sha256','--runtime-root','--port']);
 for(let i=0;i<args.length;i++){
  const name=args[i];
  need(allowed.has(name)&&!Object.hasOwn(values,name),'CLI_OPTION_INVALID');
  need(i+1<args.length&&typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'CLI_OPTION_VALUE_REQUIRED');
  values[name]=args[++i];
 }
 need(typeof values['--settings']==='string','ORIGINAL_WEATHER_SETTINGS_REQUIRED');
 for(const name of ['--settings-sha256','--selection-sha256']){
  if(values[name]!==undefined)need(/^[a-f0-9]{64}$/.test(values[name]),'WEATHER_SETTINGS_HASH_REQUIRED');
 }
 if(values['--port']!==undefined)need(/^(0|[1-9]\d{0,4})$/.test(values['--port']),'PORT_INVALID');
 const port=Number(values['--port']??0);need(port<=65535,'PORT_INVALID');
 return {
  settingsFile:absolute(values['--settings']),
  ...(values['--settings-sha256']!==undefined?{expectedSettingsSha256:values['--settings-sha256']}:{ }),
  ...(values['--selection-sha256']!==undefined?{expectedSelectionSha256:values['--selection-sha256']}:{ }),
  ...(values['--runtime-root']!==undefined?{expectedRuntimeRoot:absolute(values['--runtime-root'])}:{ }),
  port
 };
}

/** Start the same native workspace from the exact reviewed settings selection. */
export async function startWeatherApplication({
 settingsFile,expectedSettingsSha256,expectedSelectionSha256,expectedRuntimeRoot,port=0,environment=process.env
}){
 const selection=await inspectWeatherApplication(settingsFile);
 if(expectedSettingsSha256!==undefined){
  need(/^[a-f0-9]{64}$/.test(expectedSettingsSha256),'WEATHER_SETTINGS_HASH_REQUIRED');
  need(selection.settingsSha256===expectedSettingsSha256,'WEATHER_SETTINGS_CHANGED');
 }
 if(expectedSelectionSha256!==undefined){
  need(/^[a-f0-9]{64}$/.test(expectedSelectionSha256),'WEATHER_SELECTION_HASH_REQUIRED');
  need(selection.selectionSha256===expectedSelectionSha256,'WEATHER_ORIGINAL_SELECTION_CHANGED');
 }
 if(expectedRuntimeRoot!==undefined){
  absolute(expectedRuntimeRoot);need(runtimeRoot===expectedRuntimeRoot,'WEATHER_RUNTIME_SELECTION_CHANGED');
 }
 need(Number.isSafeInteger(port)&&port>=0&&port<=65535,'PORT_INVALID');
 const workspace=await WeatherWorkspace.open(await readWeatherSettings(settingsFile),{environment});
 let session;
 try{
  need((await inspectWeatherApplication(settingsFile)).selectionSha256===selection.selectionSha256,'WEATHER_ORIGINAL_SELECTION_CHANGED');
  session=await startWeatherServer({workspace,port});
  const announcement={
   ...selection,schema:WEATHER_APPLICATION_RUNTIME_SCHEMA,provider:'open-meteo-weather',
   runtimeRoot,url:session.url,originId:workspace.store.originId()
  };
  let closing;
  return {
   selection,announcement,origin:session.origin,url:session.url,workspace,
   close(){return closing??=session.close();}
  };
 }catch(error){
  if(session)await session.close();else await workspace.close();
  throw error;
 }
}

const HELP=[
 'Open-Meteo Weather managed application',
 '',
 'starforge weather-managed --settings ORIGINAL_PRIVATE_ROOT/settings.json',
 '  [--settings-sha256 REVIEWED_SETTINGS_SHA256] [--selection-sha256 REVIEWED_SELECTION_SHA256]',
 '  [--runtime-root SELECTED_SCF_SOURCE_ROOT] [--port 0]',
 '',
 'Applications supplies the reviewed settings, original directory identities and selected runtime.',
 'The saved settings choose an existing review or operator workspace.',
 'SIGINT and SIGTERM drain the original workspace and release its state lease.'
].join('\n');
export async function main(args=process.argv.slice(2)){
 if(!args.length||args.length===1&&['--help','help'].includes(args[0])){
  process.stdout.write(HELP+'\n');return;
 }
 const session=await startWeatherApplication(weatherManagedOptions(args));
 const stop=()=>session.close().catch(error=>{
  process.stderr.write(JSON.stringify({error:safeCode(error)})+'\n');process.exitCode=1;
 });
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{process.stdout.write(JSON.stringify(session.announcement)+'\n');}
 catch(error){
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  await session.close();throw error;
 }
 return session;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{process.stderr.write(JSON.stringify({error:safeCode(error)})+'\n');process.exitCode=1;});
}
