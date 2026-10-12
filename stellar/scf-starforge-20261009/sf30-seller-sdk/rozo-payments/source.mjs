import { readFileSync, lstatSync, realpathSync, existsSync, mkdirSync, openSync, writeFileSync, closeSync, fsyncSync } from 'node:fs';
import { join, resolve, relative, sep, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { assert, sha, integer, text, digest, jsonDigest, canonical, id, PROFILE_TYPES } from './model.mjs';

export function sourcePath(root,path){
  assert(typeof path==='string'&&path.length>0&&!path.includes('\\')&&!path.startsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..'),'SOURCE_PATH','Use an exact repository-relative source member.');
  const base=realpathSync(root),target=resolve(base,path),rel=relative(base,target);
  assert(rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.startsWith(sep),'SOURCE_PATH','A source member escaped its original root.');
  let here=base;for(const part of path.split('/')){here=join(here,part);assert(!lstatSync(here).isSymbolicLink(),'SOURCE_SYMLINK','An original source path contains a symbolic link.');}
  assert(lstatSync(target).isFile(),'SOURCE_FILE','Retain the complete ordinary source file: '+path);
  return target;
}
export function inspectRozoSource(sourceRoot,sourceManifest,expectedSha256){
  const root=realpathSync(sourceRoot),manifestPath=realpathSync(sourceManifest);
  const raw=readFileSync(manifestPath);if(expectedSha256){sha(expectedSha256);assert(digest(raw)===expectedSha256,'SOURCE_MANIFEST','The original installed source manifest differs.',409);}
  const manifest=JSON.parse(raw);assert(manifest.schema==='stellar-forge.rozo-installed-source.v1'&&Array.isArray(manifest.files)&&manifest.files.length,'SOURCE_MANIFEST','Select the complete installed ROZO source declaration.',409);
  const names=new Set();let bytes=0;
  for(const row of manifest.files){assert(!names.has(row.path),'SOURCE_DUPLICATE','The installed source repeats a path.');names.add(row.path);sha(row.sha256);integer(row.bytes,'source bytes');const path=sourcePath(root,row.path);assert(path!==manifestPath,'SOURCE_MANIFEST','The installed manifest must exclude itself.');const body=readFileSync(path);assert(body.length===row.bytes&&digest(body)===row.sha256,'SOURCE_IDENTITY','The selected installed source differs: '+row.path,409);bytes+=body.length;}
  return {manifestSha256:digest(raw),selectionSha256:jsonDigest(manifest.files),files:manifest.files,fileCount:manifest.files.length,bytes};
}
export function inspectPublisher(root,selection){
  assert(Array.isArray(selection)&&selection.length,'PUBLISHER_SELECTION','Select the complete retained publisher source.');
  const names=new Set();let bytes=0;
  for(const row of selection){assert(!names.has(row.path),'PUBLISHER_DUPLICATE','The original publisher selection repeats a path.');names.add(row.path);const body=readFileSync(sourcePath(root,row.path));assert(body.length===row.bytes&&digest(body)===row.sha256,'PUBLISHER_SOURCE','The original publisher bytes differ: '+row.path,409);bytes+=body.length;}
  return {sourceRoot:realpathSync(root),files:selection.length,bytes,sourceSelectionSha256:jsonDigest(selection)};
}
export function materializePublisher(capsuleFile,directory,{expectedSha256}={}){
  const bytes=readFileSync(capsuleFile);if(expectedSha256)assert(digest(bytes)===expectedSha256,'PUBLISHER_CAPSULE','The selected publisher capsule bytes differ.',409);
  const wrapper=JSON.parse(bytes);assert(wrapper.schema==='stellar-forge.rozo-publisher-capsule.v1'&&wrapper.encoding==='gzip+base64','PUBLISHER_CAPSULE','Select the original complete publisher capsule.');
  const compressed=Buffer.from(wrapper.data,'base64');assert(compressed.toString('base64')===wrapper.data,'PUBLISHER_CAPSULE','The publisher capsule base64 is invalid.');
  const raw=gunzipSync(compressed,{maxOutputLength:64*1024*1024});assert(raw.length===wrapper.bytes&&digest(raw)===wrapper.sha256,'PUBLISHER_CAPSULE','The full decoded publisher source differs.');
  const packet=JSON.parse(raw);assert(packet.schema==='stellar-forge.rozo-publisher-source.v1'&&Array.isArray(packet.files),'PUBLISHER_CAPSULE','The source packet is incomplete.');
  const root=resolve(directory);mkdirSync(root,{recursive:true,mode:0o700});assert(!lstatSync(root).isSymbolicLink(),'PUBLISHER_PATH','Select an ordinary source directory.');
  const marker=join(root,'ROZO_PUBLISHER_SOURCE.json'),identity={schema:'stellar-forge.rozo-publisher-binding.v1',repository:packet.repository,commit:packet.commit,packetSha256:wrapper.sha256};
  if(existsSync(marker))assert(canonical(JSON.parse(readFileSync(marker)))===canonical(identity),'PUBLISHER_IDENTITY','This directory belongs to another original publisher edition.',409);
  else{const fd=openSync(marker,'wx',0o600);try{writeFileSync(fd,canonical(identity)+'\n');fsyncSync(fd);}finally{closeSync(fd);}}
  const selection=[];
  for(const row of packet.files){
    assert(row.encoding==='utf-8'||row.encoding==='base64','PUBLISHER_ENCODING','The original source encoding is not supported.');
    assert(typeof row.path==='string'&&!row.path.startsWith('/')&&!row.path.includes('\\')&&!row.path.split('/').some(x=>!x||x==='.'||x==='..'),'SOURCE_PATH','A publisher path escapes its original directory.');
    const body=Buffer.from(row.content,row.encoding==='utf-8'?'utf8':'base64');assert(body.length===row.bytes&&digest(body)===row.sha256,'PUBLISHER_SOURCE','The original packet member differs: '+row.path);
    const file=join(root,row.path);mkdirSync(dirname(file),{recursive:true,mode:0o700});let here=root;for(const part of row.path.split('/').slice(0,-1)){here=join(here,part);assert(!lstatSync(here).isSymbolicLink(),'SOURCE_SYMLINK','A publisher directory contains a symbolic link.');}
    if(existsSync(file)){assert(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink()&&readFileSync(file).equals(body),'PUBLISHER_SOURCE','An existing original source member differs: '+row.path,409);}
    else{const fd=openSync(file,'wx',0o600);try{writeFileSync(fd,body);fsyncSync(fd);}finally{closeSync(fd);}}
    selection.push({path:row.path,bytes:row.bytes,sha256:row.sha256});
  }
  return {...identity,...inspectPublisher(root,selection)};
}
export function loadRozoConfiguration(file){
  const stat=lstatSync(file);assert(stat.isFile()&&!stat.isSymbolicLink(),'CONFIGURATION_FILE','Use the actual host configuration file.');
  const raw=readFileSync(file),config=JSON.parse(raw);assert(config.schema==='stellar-forge.rozo-connections.v1'&&config.connections&&typeof config.connections==='object'&&!Array.isArray(config.connections),'CONFIGURATION_SCHEMA','Select the original ROZO host connections.');
  for(const [alias,c]of Object.entries(config.connections)){
    id(alias,'connection alias');assert(PROFILE_TYPES.includes(c.type)||c.type==='stellar-rpc','CONNECTION_TYPE','Select a supported original connection profile.');
    assert(!Object.hasOwn(c,'apiKey')&&!Object.hasOwn(c,'webhookSecret')&&!Object.hasOwn(c,'apiToken'),'CONFIGURATION_SECRET','Connection config retains environment variable names; keep key bytes in the original host environment.');
    for(const field of ['apiKeyEnv','webhookSecretEnv','apiTokenEnv'])if(c[field])assert(/^[A-Za-z_][A-Za-z0-9_]*$/.test(c[field]),'CONFIGURATION_ENV','Invalid environment name.');
  }
  const publisherFile=config.publisherSelectionsFile??fileURLToPath(new URL('./publishers.json',import.meta.url)),publishers=JSON.parse(readFileSync(publisherFile));
  assert(publishers.schema==='stellar-forge.rozo-publisher-selections.v1','PUBLISHER_SELECTION','The host publisher selection has another schema.');
  return {connections:config.connections,publisherSelections:Object.fromEntries(publishers.publishers.map(p=>[p.repository,p.files])),configurationIdentity:{sha256:digest(raw),bytes:raw.length,path:realpathSync(file)},config,raw};
}
