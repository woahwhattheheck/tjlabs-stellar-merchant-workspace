// MIT. Explicit physical relocation for one authenticated native accounting account.
import {isAbsolute,resolve,sep} from 'node:path';

export const ACCOUNTING_RELOCATION_SCHEMA='stellar-forge.accounting-workspace-relocation.v1';
const FIELDS=['outboxDir','proofDir','termsFile','recoveredDir','buyerSourceFile'];
const SHA=/^[a-f0-9]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const inside=(root,path)=>root===path||path.startsWith(root+sep);
const fail=message=>{throw Object.assign(new Error(message),{code:'ACCOUNTING_RELOCATION_CHANGED',status:409});};
const need=(ok,message)=>{if(!ok)fail(message);};
const keys=(value,allowed)=>plain(value)&&Object.keys(value).every(key=>allowed.includes(key));
const absolute=value=>{
  need(typeof value==='string'&&isAbsolute(value)&&resolve(value)===value&&value!=='/'&&!/[\u0000-\u001f\u007f]/.test(value),
    'Retain normalized absolute paths in the native accounting relocation.');
  return value;
};
const covers=(mapping,path)=>mapping.from===path||mapping.kind==='directory'&&inside(mapping.from,path);
function mapped(paths,path){
  const entry=paths.filter(item=>covers(item,path)).sort((a,b)=>b.from.length-a.from.length)[0];
  return entry?entry.to+path.slice(entry.from.length):null;
}

/** Validate persisted provenance before it participates in a binding or a file read. */
export function accountingRelocation(directory,state){
  const value=state.relocation;
  if(value===undefined)return null;
  absolute(directory);
  need(keys(value,['schema','originDirectory','installedDirectory','installedStateRoot','identityPaths','aliases','backup'])&&
    value.schema===ACCOUNTING_RELOCATION_SCHEMA&&value.installedDirectory===directory&&
    inside(absolute(value.installedStateRoot),directory)&&value.installedStateRoot!==directory,
    'This relocated account belongs to its recorded physical workspace.');
  absolute(value.originDirectory);
  need(keys(value.backup,['manifestSha256','workspaceSha256','directory','stateRoot'])&&
    SHA.test(value.backup.manifestSha256??'')&&SHA.test(value.backup.workspaceSha256??'')&&
    inside(absolute(value.backup.stateRoot),absolute(value.backup.directory))&&value.backup.stateRoot!==value.backup.directory,
    'Retain the authenticated backup identity behind this accounting relocation.');
  need(Array.isArray(value.identityPaths)&&value.identityPaths.length>0&&value.identityPaths.length<=FIELDS.length,
    'Retain the original fieldwise accounting source identities.');
  const fields=new Set();
  for(const entry of value.identityPaths){
    need(keys(entry,['field','origin','installed'])&&FIELDS.includes(entry.field)&&!fields.has(entry.field),
      'A relocated source identity needs one original field.');
    fields.add(entry.field);absolute(entry.origin);absolute(entry.installed);
    need(inside(value.installedStateRoot,entry.installed),'A relocated accounting source escaped its installed private state root.');
  }
  need(Array.isArray(value.aliases)&&value.aliases.length>0&&value.aliases.length<=9990,
    'Retain the authenticated source path mapping.');
  const originals=new Set();
  for(const entry of value.aliases){
    need(keys(entry,['from','to','kind'])&&['file','directory'].includes(entry.kind),
      'A relocated source mapping needs its original file or directory kind.');
    absolute(entry.from);absolute(entry.to);
    need(!originals.has(entry.from)&&inside(value.installedStateRoot,entry.to)&&entry.to!==value.installedStateRoot,
      'A relocated source mapping is duplicate or outside its installed state root.');
    originals.add(entry.from);
  }
  need(Buffer.byteLength(JSON.stringify(value))<=2*1024*1024,'The native accounting relocation exceeds its retained size limit.');
  return value;
}

/** Hash only exact field selections through their logical origins; expose physical paths separately. */
export function accountingIdentityBasis(directory,state,sources){
  const relocation=accountingRelocation(directory,state);
  const logical={...sources};
  if(relocation)for(const entry of relocation.identityPaths)
    if(logical[entry.field]===entry.installed)logical[entry.field]=entry.origin;
  return {directory:relocation?.originDirectory??directory,sources:logical};
}

/** Historical requests keep their original bytes; resolve their known captured files at read time. */
export function resolveAccountingSourcePath(directory,state,path){
  absolute(path);
  const relocation=accountingRelocation(directory,state);
  if(!relocation||inside(relocation.installedStateRoot,path))return path;
  return mapped(relocation.aliases,path)??path;
}

/** Called only after the native recovery engine authenticates the full original mapping and files. */
export function relocateAccountingState({directory,state,stateRoot,installedDirectory,installedStateRoot,paths,
  manifestSha256,workspaceSha256}){
  absolute(directory);absolute(stateRoot);absolute(installedDirectory);absolute(installedStateRoot);
  need(inside(stateRoot,directory)&&directory!==stateRoot&&inside(installedStateRoot,installedDirectory)&&
    installedDirectory!==installedStateRoot&&!inside(stateRoot,installedStateRoot)&&!inside(installedStateRoot,stateRoot),
    'Restore the portable account into a separate private state root.');
  need(SHA.test(manifestSha256??'')&&SHA.test(workspaceSha256??'')&&Array.isArray(paths)&&paths.length>0,
    'Authenticate the original accounting backup before relocating it.');
  const previous=accountingRelocation(directory,state);
  const basis=accountingIdentityBasis(directory,state,state.sources);
  const translate=path=>{
    absolute(path);const value=mapped(paths,path);
    need(value!==null&&inside(installedStateRoot,value),'Every relocated source must belong to the authenticated captured closure.');
    return value;
  };
  const sources={...state.sources},identityPaths=[];
  for(const field of FIELDS)if(sources[field]!==undefined){
    const installed=translate(sources[field]);
    identityPaths.push({field,origin:basis.sources[field],installed});sources[field]=installed;
  }
  const aliases=new Map();
  for(const entry of previous?.aliases??[]){
    const destination=mapped(paths,entry.to);
    if(destination!==null)aliases.set(entry.from,{from:entry.from,to:destination,kind:entry.kind});
  }
  for(const entry of paths){
    const prior=aliases.get(entry.from);
    need(!prior||prior.to===entry.to&&prior.kind===entry.kind,'The authenticated relocation has conflicting historical source paths.');
    aliases.set(entry.from,{...entry});
  }
  const relocation={schema:ACCOUNTING_RELOCATION_SCHEMA,originDirectory:basis.directory,
    installedDirectory,installedStateRoot,identityPaths:identityPaths.sort((a,b)=>a.field.localeCompare(b.field)),
    aliases:[...aliases.values()].sort((a,b)=>a.from.localeCompare(b.from)),
    backup:{manifestSha256,workspaceSha256,directory,stateRoot}};
  const result={...structuredClone(state),sources,relocation};
  accountingRelocation(installedDirectory,result);
  return result;
}
