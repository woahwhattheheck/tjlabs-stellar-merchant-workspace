// SPDX-License-Identifier: MIT
// Route and asset adapter inside the original receivables HTTP/auth/lifecycle boundary.
import {readFile} from 'node:fs/promises';
import {readBrowserAssets} from '../../../distribution/browser-assets.mjs';
import {BANK_REQUEST_BYTES} from './domain.mjs';
export {BANK_REQUEST_BYTES};
const STATIC=await readBrowserAssets(new URL('./browser-assets.json',import.meta.url));
function basePath(value,fallback) {
  const path=String(value||fallback).replace(/\/+$/,'');
  if(!path.startsWith('/')||/[?#\\\u0000-\u0020]/.test(path)||path.includes('//')||path.split('/').some(part=>part==='.'||part==='..'))
    throw new TypeError('Use a local absolute bank workspace route.');
  return path;
}
function part(value) {
  let decoded;try{decoded=decodeURIComponent(value);}catch{throw Object.assign(new Error('The bank record is malformed.'),{code:'INVALID_IDENTIFIER',status:400});}
  if(!decoded||decoded.length>240||decoded==='.'||decoded==='..'||/[\\/\u0000-\u001f]/.test(decoded))
    throw Object.assign(new Error('The bank record is malformed.'),{code:'INVALID_IDENTIFIER',status:400});
  return decoded;
}
const problem=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
export async function bankStatementAsset(path,{apiPath='/api/receivables/bank-statements',uiPath='/bank-statements',
  receivablesApiBase='/api/receivables',receivablesUi='/receivables/',sourcePreparations=null}={}) {
  apiPath=basePath(apiPath,'/api/receivables/bank-statements');uiPath=basePath(uiPath,'/bank-statements');
  if(path!==uiPath&&!path.startsWith(uiPath+'/'))return null;
  const name=path===uiPath?'index.html':path.slice(uiPath.length+1)||'index.html';
  if(name==='config.json')return {bytes:Buffer.from(JSON.stringify({apiBase:apiPath,apiPath,uiPath,
    receivablesApiBase,receivablesUi,requestBytes:BANK_REQUEST_BYTES,
    sourcePreparationsApiBase:sourcePreparations?apiPath+'/source-preparations':null,
    sourcePreparationsWorkspace:sourcePreparations?.workspace??null,
    sourcePreparationsWorkspaceId:sourcePreparations?.workspaceId??null,
    sourcePreparationsSourcesSha256:sourcePreparations?.sourcesSha256??null})),type:'application/json; charset=utf-8'};
  const entry=STATIC.get('/bank-statements/'+name);
  return entry?{bytes:await readFile(entry.url),type:entry.type}:null;
}
export async function handleBankStatementsRequest(workspace,{method,path,query={},value,apiPath='/api/receivables/bank-statements'}) {
  apiPath=basePath(apiPath,'/api/receivables/bank-statements');
  if(path!==apiPath&&!path.startsWith(apiPath+'/'))return null;
  const parts=path.slice(apiPath.length).split('/').filter(Boolean).map(part),route=parts.join('/');
  query=query instanceof URLSearchParams?Object.fromEntries(query):query;
  let result;
  if(method==='GET') {
    if(!route||route==='state')result=await workspace.state();
    else if(route==='transactions')result=await workspace.transactions(query);
    else if(parts[0]==='transactions'&&parts.length===2)result=await workspace.detail(parts[1]);
    else if(parts[0]==='imports'&&parts.length===2)result=await workspace.importDetail(parts[1]);
    else if(parts[0]==='imports'&&parts.length===4&&parts[2]==='files') {
      const file=await workspace.importFile(parts[1],parts[3]);return {file,type:file.type};
    } else if(parts[0]==='closes'&&parts.length===2)result=await workspace.closeDetail(parts[1]);
    else if(parts[0]==='closes'&&parts.length===4&&parts[2]==='files') {
      const file=await workspace.closeFile(parts[1],parts[3]);return {file,type:file.type};
    } else if(parts[0]==='operations'&&parts.length===2)result=await workspace.getOperation(parts[1]);
    else throw problem('NOT_FOUND','This bank reconciliation route does not exist.',404);
  } else if(method==='POST') {
    if(!value||Array.isArray(value)||typeof value!=='object')throw problem('INVALID_JSON','Send one complete JSON request.');
    if(route==='source-preview')result=await workspace.previewSource(value);
    else if(route==='accounts')result=await workspace.saveAccount(value);
    else if(route==='imports')result=await workspace.receiveSource(value);
    else if(route==='assembly-preview')result=await workspace.previewAssembly(value);
    else if(route==='close-preview')result=await workspace.previewClose(value);
    else if(route==='closes')result=await workspace.retainClose(value);
    else if(parts[0]==='closes'&&parts.length===3&&parts[2]==='reopen')result=await workspace.reopenClose(parts[1],value);
    else if(parts[0]==='transactions'&&parts.length===3) {
      if(parts[2]==='match')result=await workspace.match(parts[1],value);
      else if(parts[2]==='receipt')result=await workspace.receiveReceipt(parts[1],value);
      else if(parts[2]==='undo')result=await workspace.undo(parts[1],value);
      else if(parts[2]==='resolve')result=await workspace.resolve(parts[1],value);
      else throw problem('NOT_FOUND','This bank transaction operation does not exist.',404);
    } else throw problem('NOT_FOUND','This bank reconciliation operation does not exist.',404);
  } else throw problem('METHOD_NOT_ALLOWED','Use a supported bank reconciliation operation.',405);
  return {value:result};
}
