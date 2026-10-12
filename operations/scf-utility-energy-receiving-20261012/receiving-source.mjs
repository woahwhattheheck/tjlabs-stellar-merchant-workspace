// MIT. Complete installed-source selection for the original Utility callbacks.
import {readFile,open,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

export const ENERGY_PACKAGE_SCHEMA='stellar-forge.merchant-distribution-manifest.v1';
const SCHEMA='stellar-forge.utility-receiving-source.v1';
const REFERENCE='operations/scf-utility-energy-receiving-20261012/source-manifest-891b.json';
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function need(value,message){if(!value)throw new Error(message);}
function memberPath(value){
  need(typeof value==='string'&&value.length>0&&value.length<=1000&&!/[\\\x00-\x1f\x7f]/.test(value)&&
    value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Use canonical complete package source paths.');
  return value;
}
/** The caller verifies every returned source byte before opening its original owner. */
export async function readUtilityReceivingSource(sourceManifest,sourceRoot){
  const manifest=typeof sourceManifest==='string'?JSON.parse(await readFile(sourceManifest,'utf8')):sourceManifest;
  need(plain(manifest),'Use a complete source declaration.');
  if(manifest.schema===SCHEMA){
    need(Array.isArray(manifest.files)&&manifest.files.length>0,'Use the complete original Utility source declaration.');
    return manifest;
  }
  need(manifest.schema===ENERGY_PACKAGE_SCHEMA&&manifest.packageName==='@tokenjunkielabs/starforge-merchant'&&
    /^[0-9a-f]{40}$/.test(manifest.sourceCommit??'')&&Array.isArray(manifest.files)&&
    manifest.files.length>0&&manifest.files.length<=20000,
    'Use the complete maintained package manifest or the original frozen declaration.');
  const names=new Set();let total=0;
  for(const row of manifest.files){
    need(plain(row),'Invalid complete source member.');const path=memberPath(row.path);
    need(!names.has(path)&&row.packagePath==='source/'+path&&Number.isSafeInteger(row.bytes)&&
      row.bytes>=0&&row.bytes<=4*1024*1024&&/^[0-9a-f]{64}$/.test(row.sha256??'')&&
      /^[0-9a-f]{40}$/.test(row.gitBlob??'')&&['100644','100755'].includes(row.mode),
      'Keep each complete package member and its original byte identity.');
    names.add(path);total+=row.bytes;
  }
  need(Number.isSafeInteger(manifest.sourceBytes)&&manifest.sourceBytes===total&&total<=512*1024*1024,
    'The complete package source length differs.');
  need(names.has(REFERENCE),'The package omits its original receiving declaration.');
  const reference=JSON.parse(await readFile(join(sourceRoot,REFERENCE),'utf8'));
  need(reference.schema===SCHEMA&&Array.isArray(reference.files),'The package contains a different original Utility declaration.');
  const required=new Set(reference.files.map(row=>memberPath(row.path)));
  for(const path of [REFERENCE,'operations/scf-utility-energy-receiving-20261012/receiving_source.py',
    'operations/scf-utility-energy-receiving-20261012/receiving-source.mjs'])required.add(path);
  const missing=[...required].filter(path=>!names.has(path)).sort();
  need(missing.length===0,'The package omits original receiving source: '+missing.join(', '));
  return {schema:SCHEMA,sourceCommit:manifest.sourceCommit,repository:manifest.sourceRepository,
    files:manifest.files,frozenDeclaration:{path:REFERENCE,sourceCommit:reference.sourceCommit},
    installedPackage:Object.fromEntries(['schema','packageName','packageVersion','sourceCommit',
      'sourceRepository','sourceSelection','sourceBytes'].filter(key=>Object.hasOwn(manifest,key))
      .map(key=>[key,manifest[key]])),
    ...(reference.originalOperation?{originalOperation:reference.originalOperation}:{}),
    ...(reference.toolNames?{toolNames:reference.toolNames}:{})};
}


/** Read every member of the selected declaration before attaching the native owner. */
export async function verifyUtilityReceivingSource(declaration,sourceRoot){
  need(declaration?.schema===SCHEMA&&Array.isArray(declaration.files)&&declaration.files.length>0,
    'Use the complete original Utility source declaration.');
  const files=[],seen=new Set();
  const signature=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':');
  for(const row of declaration.files){
    const path=memberPath(row.path);
    need(!seen.has(path)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&
      /^[0-9a-f]{64}$/.test(row.sha256??'')&&/^[0-9a-f]{40}$/.test(row.gitBlob??''),
      'Keep each complete original Utility source member.');
    seen.add(path);
    const filePath=join(sourceRoot,path),before=await lstat(filePath);
    need(before.isFile()&&!before.isSymbolicLink()&&before.size===row.bytes,
      'The selected original Utility source differs: '+path);
    const handle=await open(filePath,'r');
    try{
      need(signature(await handle.stat())===signature(before),'The original source changed: '+path);
      const digest=createHash('sha256'),blob=createHash('sha1').update(Buffer.from('blob '+row.bytes+'\0'));
      let length=0;
      for await(const block of handle.createReadStream({autoClose:false})){
        length+=block.length;need(length<=row.bytes,'The original source changed: '+path);
        digest.update(block);blob.update(block);
      }
      const actual={path,bytes:length,sha256:digest.digest('hex'),gitBlob:blob.digest('hex')};
      need(actual.bytes===row.bytes&&actual.sha256===row.sha256&&actual.gitBlob===row.gitBlob&&
        signature(await handle.stat())===signature(before)&&signature(await lstat(filePath))===signature(before),
        'The selected original Utility source differs: '+path);
      files.push(actual);
    }finally{await handle.close();}
  }
  return files;
}
