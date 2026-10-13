#!/usr/bin/env node
// MIT. One original SF74 development receiver, same stores through browser restart.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {initializeIncidentStore,openIncidentStore} from '../../sf93-seller-support-bundle/incident-store.mjs';
import {start} from '../server.mjs';
const root=resolve(process.argv[2]||'');if(!process.argv[2]||root==='/'||root===process.cwd())throw Error('Use the same private receiving case directory.');
await mkdir(root,{recursive:true,mode:0o700});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const exact=async(path,text)=>{try{const old=await readFile(path,'utf8');if(old!==text)throw Error('Original receiving input changed: '+path);}
  catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path,text,{flag:'wx',mode:0o600});}};
const config={schema:'stellar-forge.seller-watch-config.v1',
  merchants:[{id:'writing-course-merchant',label:'Original configuration receiving merchant',
    seller:'http://127.0.0.1:4021',ops:'http://127.0.0.1:4022'}],notification:null};
const marker={operation:'493D-SF74-INCIDENT-CONFIGURATION-WRITING-20261013',config,
  sourceIds:['writing-original','writing-secondary']};
await exact(join(root,'original-receiving.json'),JSON.stringify(marker,null,2)+'\n');
for(const [id,directory]of [['writing-original','original-incidents'],['writing-secondary','secondary-incidents']]){
  const path=join(root,directory);
  try{await access(join(path,'state.json'));const state=await(await openIncidentStore(path)).read();
    if(state.config.merchants[0]?.id!==config.merchants[0].id)throw Error('Keep the original receiving merchant.');}
  catch(error){if(error.code!=='ENOENT')throw error;await initializeIncidentStore({directory:path,config});}
}
const sources=join(root,'incident-sources.json');
await exact(sources,JSON.stringify({schema:'stellar-forge.support-incident-sources.v1',sources:[
  {id:'writing-original',label:'Original configuration receiving',directory:'original-incidents'},
  {id:'writing-secondary',label:'Second source for retained-writing navigation',directory:'secondary-incidents'}]},null,2)+'\n');
const state=await(await openIncidentStore(join(root,'original-incidents'))).read();
const entry=fileURLToPath(new URL('.',import.meta.url));
const sourceFiles=[];
for(const name of ['incident-writing.mjs','incident-desk.mjs','incident-desk.css']){
 const body=await readFile(new URL('../'+name,import.meta.url));sourceFiles.push({name,bytes:body.length,sha256:sha(body)});
}
let host,child,timedOut=false,exitCode=null,signal=null,primaryError=null,cleanupError=null;
try{
 host=await start({port:0,incidentSources:sources,casesDir:null});
 const input={base_url:host.url,case_root:root,source_id:'writing-original',expected_config_hash:state.configHash,
   expected_config_revision:state.configRevision,source_files:sourceFiles,
   ...(process.env.SF74_PLAYWRIGHT_MODULE?{playwright_module:process.env.SF74_PLAYWRIGHT_MODULE}:{}),
   ...(process.env.SF74_CHROMIUM_PATH?{chromium_path:process.env.SF74_CHROMIUM_PATH}:{})};
 const inputPath=join(root,'browser-input.json');await writeFile(inputPath,JSON.stringify(input,null,2)+'\n',{mode:0o600});
 const result=await new Promise((done,reject)=>{
  child=spawn(process.execPath,[join(entry,'incident-writing-browser.mjs'),inputPath],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],detached:true});
  let out='',err='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',part=>{out+=part;});child.stderr.on('data',part=>{err+=part;});
  let kill;
  const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')err+=error.message;}
    kill=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},8000);},240000);
  child.once('error',error=>{clearTimeout(timer);clearTimeout(kill);reject(error);});
  child.once('close',(code,receivedSignal)=>{clearTimeout(timer);clearTimeout(kill);done({code,signal:receivedSignal,out,err});});
 });
 exitCode=result.code;signal=result.signal;
 await writeFile(join(root,'browser-stdout.json'),result.out,{mode:0o600});
 await writeFile(join(root,'browser-stderr.txt'),result.err,{mode:0o600});
 if(timedOut||exitCode!==0)process.exitCode=1;
}catch(error){primaryError=error.stack||String(error);process.exitCode=1;}
finally{if(host)try{await host.close();}catch(error){cleanupError=error.stack||String(error);process.exitCode=1;}}
let after=null;try{after=await(await openIncidentStore(join(root,'original-incidents'))).read();}catch(error){primaryError??=error.stack||String(error);process.exitCode=1;}
const receipt={operation:marker.operation,root,status:!primaryError&&!cleanupError&&!timedOut&&exitCode===0?'passed':'failed',
 exitCode,signal,timedOut,primaryError,cleanupError,sourceFiles,casePaths:{original:join(root,'original-incidents'),secondary:join(root,'secondary-incidents'),profiles:sources,progress:join(root,'incident-writing-course','progress.json')},original:{configRevision:state.configRevision,configHash:state.configHash},
 final:after?{configRevision:after.configRevision,configHash:after.configHash}:null,unchangedConfiguration:after?.configHash===state.configHash};
if(!receipt.unchangedConfiguration){receipt.status='failed';process.exitCode=1;}
await writeFile(join(root,'receiving-result.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(receipt));
