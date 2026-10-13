// SPDX-License-Identifier: MIT
// Host declarations only. Tool arguments never supply an endpoint, token or local path.
import {resolve,dirname} from 'node:path';
import {readWorkflowSeriesPrivateFile} from '../../stellar-forge/mcp-merchant-operator/workflow-series-connection.mjs';
import {CONNECTION_SCHEMA,ID,SHA,plain,need} from './agent-contracts.mjs';
const exact=(v,keys,required=keys)=>need(plain(v)&&Object.keys(v).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(v,k)),'Use the declared complete connection fields.');
const pathText=v=>{need(typeof v==='string'&&v.length>0&&v.length<=4000&&!/[\x00-\x1f]/.test(v),'Select an original host path.');return v;};
export async function readCommissioningCustomerConfiguration(path){
  path=resolve(path);const base=dirname(path),raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readWorkflowSeriesPrivateFile(path)));
  exact(raw,['schema','instances']);need(raw.schema===CONNECTION_SCHEMA&&plain(raw.instances)&&Object.keys(raw.instances).length>0&&Object.keys(raw.instances).length<=100,'Declare the original local commissioning connections.');
  const instances=Object.create(null);
  for(const [alias,value]of Object.entries(raw.instances)){
    need(ID.test(alias),'Use a stable configured instance alias.');
    exact(value,['label','jobId','launchFile','inputs','receivers'],['label','jobId','launchFile']);
    need(typeof value.label==='string'&&value.label.trim()&&value.label.length<=160&&typeof value.jobId==='string'&&ID.test(value.jobId),'Retain a readable label and the original selected job ID.');
    const selected={label:value.label,jobId:value.jobId,launchFile:resolve(base,pathText(value.launchFile)),inputs:Object.create(null),receivers:Object.create(null)};
    need(value.inputs===undefined||plain(value.inputs),'Declare complete original inputs by alias.');
    for(const [key,file]of Object.entries(value.inputs??{})){
      need(ID.test(key),'Choose a stable source alias.');exact(file,['path','bytes','sha256','name']);
      need(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=64*1024*1024&&SHA.test(file.sha256)&&typeof file.name==='string'&&file.name.length>0&&file.name.length<=240&&!/[\/\\\r\n]/.test(file.name),'Retain each original file name, byte count and SHA256.');
      selected.inputs[key]={...file,path:resolve(base,pathText(file.path))};
    }
    need(value.receivers===undefined||plain(value.receivers),'Declare receiving destinations by alias.');
    for(const [key,destination]of Object.entries(value.receivers??{})){need(ID.test(key),'Use a stable receiver alias.');selected.receivers[key]=resolve(base,pathText(destination));}
    instances[alias]=selected;
  }
  return{schema:CONNECTION_SCHEMA,instances};
}
export async function readCommissioningLaunch(path){
  const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readWorkflowSeriesPrivateFile(path,65536)));
  need(raw?.schema==='stellar-forge.facilitator-operator-listener.v1'&&typeof raw.url==='string','Select the current complete private output of the original serve command.','COMMISSIONING_LAUNCH');
  const url=new URL(raw.url);
  need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&/^#[A-Za-z0-9_-]{43}$/.test(url.hash),'Use the exact original local listener address and session token.','COMMISSIONING_LAUNCH');
  return{origin:url.origin,token:url.hash.slice(1)};
}
