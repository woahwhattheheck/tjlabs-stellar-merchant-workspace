// SPDX-License-Identifier: MIT
import { readFile, lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readJson, identity, absolute } from '../postgres/publisher/files.mjs';
import { configuration, need, UUID, HASH } from './contract.mjs';
export const OPENAQ_SOURCE='stellar/scf-starforge-20261009/sf30-seller-sdk/openaq';
export const STARTUP_SCHEMA='stellar-forge.openaq-workspace-startup.v1';
export const SOURCE_FILES=Object.freeze(['contract.mjs','projection.mjs','source.mjs','reports.mjs','package.mjs','publisher.mjs','workspace.mjs',
 'server.mjs','managed.mjs','cli.mjs','download.mjs','application-provider.mjs','operator.mjs','operator-tools.mjs','operator-provider.mjs',
 'public/index.html','public/app.mjs','public/style.css','examples/archive-context.json',
 'examples/completed-del-norte/manifest.json','examples/completed-del-norte/study.tgz',
 'examples/completed-del-norte/report.html','examples/completed-del-norte/report.json']);
export async function inspectOpenAQSource(directory=fileURLToPath(new URL('.',import.meta.url)),expected){
 directory=await realpath(resolve(directory));const files=[];
 for(const name of SOURCE_FILES){
  const path=join(directory,name),before=await lstat(path);need(before.isFile()&&!before.isSymbolicLink()&&before.size<=2*1024*1024&&await realpath(path)===path,'OPENAQ_SOURCE_FILE_INVALID');
  const raw=await readFile(path),after=await lstat(path);need(before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&raw.length===before.size,'OPENAQ_SOURCE_FILE_CHANGED');
  files.push({path:name,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')});
 }
 const sha256=identity(files);if(expected!==undefined)need(sha256===expected,'OPENAQ_SOURCE_IDENTITY_CHANGED',undefined,409);return {directory,sha256,files};
}
export async function inspectOpenAQWorkspace(directory,expected){
 directory=absolute(directory);const value=await readJson(join(directory,'workspace.json'),262144);
 need(value.schema==='stellar-forge.openaq-study.v1'&&UUID.test(value.id??'')&&identity(configuration(value.configuration))===value.configurationSha256,'OPENAQ_WORKSPACE_CHANGED');
 if(expected!==undefined)need(value.configurationSha256===expected,'OPENAQ_CONFIGURATION_CHANGED',undefined,409);
 return {directory,workspaceId:value.id,configurationSha256:value.configurationSha256};
}
export function privateOrigin(value){
 let url;try{url=new URL(value);}catch{}need(url&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&Number(url.port)>0&&Number(url.port)<=65535&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','OPENAQ_PRIVATE_ORIGIN_REQUIRED');
 return url.origin;
}
export async function readOpenAQConnection(path){
 const value=await readJson(absolute(path),262144);
 need(value.schema==='stellar-forge.openaq-connection.v1'&&UUID.test(value.workspaceId??'')&&UUID.test(value.instanceId??'')&&HASH.test(value.configurationSha256??'')&&HASH.test(value.sourceIdentity?.sha256??'')&&typeof value.token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value.token),'OPENAQ_CONNECTION_CHANGED');
 privateOrigin(value.origin);return value;
}
export async function operatorJSON(binding,path,{method='GET',body,signal}={}){
 const origin=privateOrigin(binding.origin);need(path.startsWith('/api/')&&!path.startsWith('//'),'OPENAQ_OPERATOR_PATH_INVALID');
 const response=await fetch(origin+path,{method,headers:{authorization:'Bearer '+binding.token,...(body===undefined?{}:{'content-type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal,redirect:'manual'});
 need(response.headers.get('x-openaq-instance')===binding.instanceId,'OPENAQ_INSTANCE_CHANGED',undefined,409);
 const pieces=[];let size=0;for await(const chunk of response.body){size+=chunk.length;need(size<=32*1024*1024,'OPENAQ_OPERATOR_RESPONSE_TOO_LARGE');pieces.push(Buffer.from(chunk));}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(pieces)));}catch{throw new Error('OPENAQ_OPERATOR_RESPONSE_INVALID');}
 if(!response.ok)throw Object.assign(new Error(value.message??value.error??'OpenAQ request failed.'),{code:value.error??'OPENAQ_OPERATOR_ERROR',status:response.status,retryAfter:value.retryAfter});
 return value;
}
export async function verifyOpenAQConnection(value){
 const actual=await operatorJSON(value,'/api/identity');
 need(actual.workspaceId===value.workspaceId&&actual.configurationSha256===value.configurationSha256&&actual.instanceId===value.instanceId&&actual.sourceIdentity?.sha256===value.sourceIdentity.sha256,'OPENAQ_CONNECTION_IDENTITY_CHANGED',undefined,409);
 return actual;
}
