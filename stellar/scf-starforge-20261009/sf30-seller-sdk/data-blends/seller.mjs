// MIT. Continue a completed blend in the original SQLite merchant workbench.
// The public database contains only selected output columns; provenance stays private.
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {BlendClient,ensure,digestFile} from './client.mjs';
import {startWorkbench} from '../sqlite/workbench/server.mjs';
import {openWorkbench} from '../sqlite/workbench/model.mjs';
export function blendSellerExportId(edition){const bytes=createHash('sha256').update('stellar-forge/data-blend-sqlite/v1/'+edition).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const h=bytes.toString('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
async function prepared({directory,edition,request=blendSellerExportId(edition)}){
  const client=new BlendClient({directory});
  try{const exported=await client.export(edition,{kind:'sqlite',...(request?{request}:{})});const result=await client.invoke('export.path',{request:exported.id});const actual=await digestFile(result.path);ensure(actual.sha256===exported.sha256,'Blend SQLite export changed.');return {database:result.path,exported};}
  finally{await client.close();}
}
export async function startBlendSellerWorkbench({directory,edition,workspace,port=0,request}={}){
  ensure(typeof workspace==='string'&&workspace.length>0,'Choose a separate private SQLite query workspace.');
  const data=await prepared({directory,edition,request});
  return {...await startWorkbench({database:data.database,workspace:resolve(workspace),port}),blendExport:data.exported};
}
/** Compile reviewed query/payment terms with the original SF30 compilers. */
export async function createBlendSellerRelease({directory,edition,workspace,draft,name,request}={}){
  const data=await prepared({directory,edition,request});const model=await openWorkbench({database:data.database,workspace:resolve(workspace)});
  try{const current=await model.state();const saved=await model.save(draft,current.revision);const release=await model.exportPack(name,saved.revision);return {blendExport:data.exported,release};}
  finally{await model.close();}
}
