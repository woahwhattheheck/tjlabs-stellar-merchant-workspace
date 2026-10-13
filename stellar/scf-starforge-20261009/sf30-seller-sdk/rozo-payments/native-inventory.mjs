import { createHash } from 'node:crypto';
import { canonical, digest, assert } from './model.mjs';
const TABLES={
 records:['kind','id'],editions:['kind','id','version'],requests:['id'],attempts:['request_id','number'],
 captures:['id'],observations:['id'],callback_events:['profile_id','event_id'],audit:['sequence']
};
export function nativeInventory(workspace){
  const tables={};
  for(const [name,keys]of Object.entries(TABLES)){
    tables[name]=workspace.db.prepare('SELECT * FROM '+name+' ORDER BY '+keys.join(',')).all().map(row=>{
      const value=JSON.parse(JSON.stringify(row));
      return {key:keys.map(k=>value[k]),sha256:digest(canonical(value)),bytes:Buffer.byteLength(canonical(value))};
    });
  }
  tables.objects=workspace.db.prepare('SELECT sha256,bytes,type FROM objects ORDER BY sha256').all().map(row=>{
    const hash=createHash('sha256');let offset=0;
    while(offset<row.bytes){const part=workspace.bytes(row.sha256,{offset,length:1024*1024});assert(part.length>0,'NATIVE_OBJECT','The complete source object stopped early.');hash.update(part.data);offset+=part.length;}
    assert(hash.digest('hex')===row.sha256,'NATIVE_OBJECT','A retained full source body differs.',409);
    return {key:[row.sha256],sha256:row.sha256,bytes:row.bytes,type:row.type};
  });
  return {schema:'stellar-forge.rozo-native-inventory.v1',workspace:workspace.meta(),tables};
}
export function compareNativeInventory(before,after,{activation=false}={}){
  assert(before.workspace.workspaceId===after.workspace.workspaceId&&before.workspace.originId===after.workspace.originId,'NATIVE_RECEIVE_IDENTITY','The receiver changed the original workspace identity.');
  for(const [name,rows]of Object.entries(before.tables)){
    const next=new Map(after.tables[name].map(r=>[canonical(r.key),r]));
    for(const row of rows){
      if(activation&&name==='records'&&row.key[0]==='control'&&row.key[1]==='operator')continue;
      assert(canonical(next.get(canonical(row.key))??null)===canonical(row),'NATIVE_RECEIVE_SOURCE','The full original '+name+' row changed: '+canonical(row.key),409);
    }
    if(!activation||!['records','editions','requests','audit'].includes(name))assert(rows.length===after.tables[name].length,'NATIVE_RECEIVE_SOURCE','The receiver changed the original '+name+' member count.');
  }
  if(activation)assert(after.workspace.revision===before.workspace.revision+1,'NATIVE_RECEIVE_REVISION','Activation must append only its original custody operation.');
  else assert(after.workspace.revision===before.workspace.revision,'NATIVE_RECEIVE_REVISION','The original checkpoint revision differs.');
  return {workspaceId:after.workspace.workspaceId,originId:after.workspace.originId,originalRevision:before.workspace.revision,receivedRevision:after.workspace.revision,tables:Object.fromEntries(Object.entries(before.tables).map(([k,v])=>[k,v.length]))};
}
