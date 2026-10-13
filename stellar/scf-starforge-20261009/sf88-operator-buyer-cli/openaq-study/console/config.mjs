// SPDX-License-Identifier: MIT
// Host selection around the original OpenAQ Buyer; no financial or acquisition store.
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {directory,path,hash,uuid,need,object,bytes,digest,json,exists,retainJson,withOwner,emptyIntake,disjoint} from '../files.mjs';
import {readOpenAQHandoff} from '../handoff.mjs';
import {inspectOpenAQBuyerDelivery} from '../delivery.mjs';

export const CONSOLE_SCHEMA='stellar-forge.openaq-customer-console.v1';
export const STARTUP_SCHEMA=CONSOLE_SCHEMA+'.startup';
export const CONNECTION_SCHEMA=CONSOLE_SCHEMA+'.connection';
export const SOURCE_ROOT='stellar/scf-starforge-20261009/sf88-operator-buyer-cli/openaq-study/console';
export const SOURCE_FILES=Object.freeze(['config.mjs','controller.mjs','server.mjs','client.mjs','client.d.mts',
 'managed.mjs','application-provider.mjs','cli.mjs','public/index.html','public/app.mjs','public/style.css']);
const allowed=['schema','directory','label','mode','handoffDirectory','handoffSha256','operatorDirectory',
 'deliveryDirectory','deliverySha256','python'];
export function selectedConfiguration(value){
 need(object(value)&&Object.keys(value).every(k=>allowed.includes(k)),'OPENAQ_CUSTOMER_CONFIGURATION_INVALID');
 need(value.schema===CONSOLE_SCHEMA&&['acquire','receive','inspect'].includes(value.mode),'OPENAQ_CUSTOMER_CONFIGURATION_INVALID');
 const selected={schema:CONSOLE_SCHEMA,directory:path(value.directory),label:value.label,mode:value.mode,
  python:value.python??'python3'};
 need(typeof selected.label==='string'&&selected.label.trim().length>0&&selected.label.length<=160&&
  typeof selected.python==='string'&&selected.python.length>0&&selected.python.length<=4096&&!selected.python.includes('\0'),
 'OPENAQ_CUSTOMER_CONFIGURATION_INVALID');
 if(value.mode!=='receive'){
  need(value.deliveryDirectory===undefined&&value.deliverySha256===undefined,'OPENAQ_CUSTOMER_CONFIGURATION_INVALID');
  selected.handoffDirectory=path(value.handoffDirectory);selected.handoffSha256=hash(value.handoffSha256);
  disjoint(selected.directory,selected.handoffDirectory);
  if(value.mode==='acquire'){selected.operatorDirectory=path(value.operatorDirectory);disjoint(selected.directory,selected.operatorDirectory);}
  else need(value.operatorDirectory===undefined,'OPENAQ_CUSTOMER_CONFIGURATION_INVALID');
 }else{
  need(value.handoffDirectory===undefined&&value.handoffSha256===undefined&&value.operatorDirectory===undefined,
   'OPENAQ_CUSTOMER_CONFIGURATION_INVALID');
  selected.deliveryDirectory=path(value.deliveryDirectory);selected.deliverySha256=hash(value.deliverySha256);
  disjoint(selected.directory,selected.deliveryDirectory);
 }
 return selected;
}
export async function readConsoleConfiguration(root,expected){
 root=await directory(path(root));
 const value=await json(join(root,'console.json'),262144);
 const {id,configurationSha256,...input}=value,selected=selectedConfiguration(input);
 uuid(id);hash(configurationSha256);
 need(selected.directory===root&&digest(bytes(selected))===configurationSha256,'OPENAQ_CUSTOMER_CONFIGURATION_CHANGED');
 if(expected!==undefined)need(hash(expected)===configurationSha256,'OPENAQ_CUSTOMER_CONFIGURATION_CHANGED');
 return {...selected,id,configurationSha256};
}
export async function initializeConsole(input){
 const selected=selectedConfiguration({...input,schema:CONSOLE_SCHEMA});
 return withOwner(selected.directory,async()=>{
  const target=join(selected.directory,'console.json');
  if(await exists(target)){
   const previous=await readConsoleConfiguration(selected.directory);
   need(previous.configurationSha256===digest(bytes(selected)),'OPENAQ_CUSTOMER_CONFIGURATION_CHANGED');
   return previous;
  }
  await emptyIntake(selected.directory,['lease.lock']);
  if(selected.mode!=='receive'){
   if(selected.mode==='acquire')await directory(selected.operatorDirectory);
   await readOpenAQHandoff({directory:selected.handoffDirectory,sha256:selected.handoffSha256});
  }else{
   await inspectOpenAQBuyerDelivery({directory:selected.deliveryDirectory,manifestSha256:selected.deliverySha256});
  }
  const result={...selected,id:randomUUID(),configurationSha256:digest(bytes(selected))};
  await retainJson(target,result);
  return result;
 },{create:true});
}
export function consolePaths(settings){
 return {customer:join(settings.directory,'customer'),outputs:join(settings.directory,'outputs'),
  dataset:join(settings.directory,'outputs','dataset'),delivery:join(settings.directory,'outputs','delivery'),
  received:join(settings.directory,'received'),connection:join(settings.directory,'connection.json')};
}
