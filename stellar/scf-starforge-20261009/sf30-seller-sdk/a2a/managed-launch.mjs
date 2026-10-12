// SPDX-License-Identifier: MIT
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { sha, fail, canonical, readVerifiedFile, normalizeConnections, connectionView } from './foundation.mjs';
export const CONNECTIONS_SCHEMA='stellar-forge.a2a-connections.v1';
export const IDENTITY_SCHEMA='stellar-forge.a2a-workspace-identity.v1';
export const IDENTITY_FILE='workspace-identity.json';
export function readA2AConnections(filename,{expectedSha256=null}={}){
  if(!filename)return{filename:null,sha256:null,connections:[]};
  const path=realpathSync(resolve(filename)),bytes=readVerifiedFile(path,2*1024*1024);
  if(expectedSha256&&sha(bytes)!==expectedSha256)fail('CONNECTION_FILE_CHANGED','The selected host connection file changed after preparation.',409);
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('CONNECTION_JSON');}
  if(value?.schema!==CONNECTIONS_SCHEMA||!Array.isArray(value.connections)||Object.keys(value).some(k=>!['schema','connections'].includes(k)))fail('CONNECTION_SCHEMA');
  return{filename:path,sha256:sha(bytes),connections:normalizeConnections(value.connections)};
}
export function reviewA2AInputs({directory,connectionFile=null,optional=false}={}){
  const path=resolve(directory);
  if(existsSync(path)){if(!lstatSync(path).isDirectory()||lstatSync(path).isSymbolicLink()||realpathSync(path)!==path)fail('WORKSPACE_DIRECTORY');}
  else if(!optional||realpathSync(dirname(path))!==dirname(path))fail('WORKSPACE_DIRECTORY','Select an existing private parent directory.');
  const connection=readA2AConnections(connectionFile),identityPath=join(path,IDENTITY_FILE);
  let identity=null;
  if(existsSync(identityPath)){const bytes=readVerifiedFile(identityPath,16384),value=JSON.parse(bytes);if(value.schema!==IDENTITY_SCHEMA||typeof value.workspaceId!=='string')fail('WORKSPACE_IDENTITY');identity={path:identityPath,sha256:sha(bytes),workspaceId:value.workspaceId};}
  else if(!optional)fail('WORKSPACE_IDENTITY','Open this workspace once with its original A2A CLI.');
  return{directory:path,connectionFile:connection.filename,connectionSha256:connection.sha256,identity,connections:connection.connections.map(connectionView),files:[...(connection.filename?[connection.filename]:[]),...(identity?[identityPath]:[])]};
}
export function requireA2ASelection(review,{expectedWorkspaceIdentity=null,expectedConnectionsSha256=null}={}){
  if(expectedConnectionsSha256!==null&&review.connectionSha256!==expectedConnectionsSha256)fail('CONNECTION_FILE_CHANGED',undefined,409);
  if(expectedWorkspaceIdentity!==null&&expectedWorkspaceIdentity!=='new'&&review.identity?.sha256!==expectedWorkspaceIdentity)fail('WORKSPACE_IDENTITY_CHANGED',undefined,409);
  if(expectedWorkspaceIdentity==='new'&&review.identity)fail('WORKSPACE_ALREADY_CREATED','Prepare a new managed launch against the retained workspace identity.',409);
  return review;
}
