// MIT. Host placement for an unchanged original Grist authoring history.
import {join,relative,isAbsolute,resolve} from 'node:path';
import {readJson,absolute,identity,digest,object,fault} from '../../postgres/publisher/files.mjs';
const SCHEMA='stellar-forge.grist-workspace-placement.v1';
export async function readGristPlacement(directory){
  absolute(directory);
  let value;try{value=await readJson(join(directory,'workspace-placement.json'),1048576);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  return validateGristPlacement(value,directory);
}
export function validateGristPlacement(value,directory){
  const {sha256,...body}=value;
  if(body.schema!==SCHEMA||sha256!==identity(body)||body.directory!==directory||
    !/^[a-f0-9]{64}$/.test(body.logicalSettingsSha256??'')||!Array.isArray(body.bindings)||!body.bindings.length||body.bindings.length>256)throw fault('GRIST_PLACEMENT_CHANGED');
  for(const item of body.bindings){absolute(item.original);absolute(item.current);
    const tail=relative(directory,item.current);
    if(tail==='..'||tail.startsWith('../')||isAbsolute(tail))throw fault('GRIST_PLACEMENT_CHANGED');}
  return value;
}
export function gristPlacedPath(placement,path){
  absolute(path);
  const matches=(placement?.bindings??[]).filter(b=>path===b.original||path.startsWith(b.original+'/'))
    .sort((a,b)=>b.original.length-a.original.length);
  if(!matches.length){if(placement&&path!==placement.directory&&!path.startsWith(placement.directory+'/'))throw fault('GRIST_PLACEMENT_OUTSIDE_WORKSPACE');return path;}
  const selected=matches[0],tail=relative(selected.original,path);
  return resolve(selected.current,tail);
}
export function makeGristPlacement({directory,originalDirectory,originalTargetDirectory,prior,manifestSha256,requestId,logicalSettingsSha256}){
  const bindings=new Map();
  for(const item of prior?.bindings??[])bindings.set(item.original,{original:item.original,current:gristPlacedPath(
    {bindings:[{original:originalDirectory,current:directory},{original:originalTargetDirectory,current:join(directory,'dataset')}]},item.current)});
  bindings.set(originalDirectory,{original:originalDirectory,current:directory});
  bindings.set(originalTargetDirectory,{original:originalTargetDirectory,current:join(directory,'dataset')});
  const body={schema:SCHEMA,directory,requestId,manifestSha256,logicalSettingsSha256,bindings:[...bindings.values()]};
  return {...body,sha256:identity(body)};
}

/** Original settings bytes define operating-plan origin. Only runtime paths move. */
export function gristRuntimeSettings(raw,directory,placement=null){
  let logical;try{logical=JSON.parse(raw);}catch{throw fault('GRIST_AUTHORING_BINDING_CHANGED');}
  if(!object(logical)||logical.schema!=='stellar-forge.grist-authoring.v1'||typeof logical.createdAt!=='string')
    throw fault('GRIST_AUTHORING_BINDING_CHANGED');
  for(const key of ['sourceFile','publisherDirectory','targetDirectory'])absolute(logical[key]);
  if(placement){validateGristPlacement(placement,directory);if(placement.logicalSettingsSha256!==digest(raw))
    throw fault('GRIST_PLACEMENT_SETTINGS_CHANGED');}
  const runtime={...logical,sourceFile:gristPlacedPath(placement,logical.sourceFile),
    publisherDirectory:gristPlacedPath(placement,logical.publisherDirectory),targetDirectory:gristPlacedPath(placement,logical.targetDirectory)};
  if(runtime.sourceFile!==join(directory,'current-source.json')||runtime.publisherDirectory!==join(directory,'publisher')||
    placement&&runtime.targetDirectory!==join(directory,'dataset'))throw fault('GRIST_AUTHORING_BINDING_CHANGED');
  return runtime;
}
