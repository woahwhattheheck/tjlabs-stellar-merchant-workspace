// MIT. Host placement for an unchanged original SeaTable authoring history.
import {join,relative,isAbsolute,resolve} from 'node:path';
import {readJson,absolute,identity,fault} from '../../postgres/publisher/files.mjs';
const SCHEMA='stellar-forge.seatable-workspace-placement.v1';
export async function readSeaTablePlacement(directory){
  absolute(directory);
  let value;try{value=await readJson(join(directory,'workspace-placement.json'),1048576);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  const {sha256,...body}=value;
  if(body.schema!==SCHEMA||sha256!==identity(body)||body.directory!==directory||
    !Array.isArray(body.bindings)||!body.bindings.length||body.bindings.length>256)throw fault('SEATABLE_PLACEMENT_CHANGED');
  for(const item of body.bindings){absolute(item.original);absolute(item.current);
    const tail=relative(directory,item.current);
    if(tail==='..'||tail.startsWith('../')||isAbsolute(tail))throw fault('SEATABLE_PLACEMENT_CHANGED');}
  return value;
}
export function seaTablePlacedPath(placement,path){
  absolute(path);
  const matches=(placement?.bindings??[]).filter(b=>path===b.original||path.startsWith(b.original+'/'))
    .sort((a,b)=>b.original.length-a.original.length);
  if(!matches.length){if(placement&&path!==placement.directory&&!path.startsWith(placement.directory+'/'))throw fault('SEATABLE_PLACEMENT_OUTSIDE_WORKSPACE');return path;}
  const selected=matches[0],tail=relative(selected.original,path);
  return resolve(selected.current,tail);
}
export function makeSeaTablePlacement({directory,originalDirectory,originalTargetDirectory,prior,manifestSha256,requestId}){
  const bindings=new Map();
  for(const item of prior?.bindings??[])bindings.set(item.original,{original:item.original,current:seaTablePlacedPath(
    {bindings:[{original:originalDirectory,current:directory},{original:originalTargetDirectory,current:join(directory,'dataset')}]},item.current)});
  bindings.set(originalDirectory,{original:originalDirectory,current:directory});
  bindings.set(originalTargetDirectory,{original:originalTargetDirectory,current:join(directory,'dataset')});
  const body={schema:SCHEMA,directory,requestId,manifestSha256,bindings:[...bindings.values()]};
  return {...body,sha256:identity(body)};
}
