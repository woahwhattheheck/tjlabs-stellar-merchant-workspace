#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process'),R=require('./resume-core.cjs');
const digest=bytes=>({bytes:Buffer.byteLength(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
const load=source=>{const m={exports:{}};Function('module','exports',source)(m,m.exports);return m.exports;};
async function run(){
 if(process.argv.length<4||process.argv.length>5||process.argv[4]&&process.argv[4]!=='--under-file-lock')throw Error('node resume-complete-course.cjs INPUT.json OUTPUT_DIRECTORY');
 const inputPath=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),created=await fs.mkdir(out,{recursive:true});
 if(created){const existingParent=path.dirname(created);for(let dir=out;;dir=path.dirname(dir)){const handle=await fs.open(dir,'r');try{await handle.sync();}finally{await handle.close();}if(dir===existingParent)break;}}
 // flock owns the kernel lease across the child lifetime and releases it on exit or interruption.
 if(process.argv[4]!=='--under-file-lock'){
  if(process.platform!=='linux')throw Error('This continuation uses the Linux flock utility for its single-writer lease');
  const child=spawnSync('flock',['--nonblock','--conflict-exit-code','75',path.join(out,'.course.lock'),process.execPath,__filename,inputPath,out,'--under-file-lock'],{stdio:'inherit'});
  if(child.error)throw child.error;if(child.signal)throw Error('Course process ended with '+child.signal);process.exitCode=child.status;return;
 }
 const input=JSON.parse(await fs.readFile(inputPath,'utf8')),bytes=zlib.gunzipSync(Buffer.from(input.content_base64,'base64')),actual=digest(bytes);
 if(actual.bytes!==input.bytes||actual.sha256!==input.sha256)throw Error('Original resume envelope bytes differ');
 const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),source=R.binding(input,payload),course=load(payload.files['receiving/host-course.cjs']);
 let resume=R.hydrate(payload.checkpoint),latest=null;
 if(resume.phase!=='imports-24'||resume.records.length!==24||resume.editions.length!==25)throw Error('Original complete prefix differs');
 const directory=await fs.open(out,'r');
 async function syncDirectory(){await directory.sync();}
 async function exact(name,body){
  if(path.basename(name)!==name)throw Error('Unsafe output name');
  const file=path.join(out,name),temporary=file+'.pending-'+crypto.randomUUID(),handle=await fs.open(temporary,'wx');
  try{try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}
   try{await fs.link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;const previous=await fs.readFile(file);const expected=digest(body),observed=digest(previous);if(expected.bytes!==observed.bytes||expected.sha256!==observed.sha256)throw Error('Existing immutable output differs: '+name);}
   await syncDirectory();
  }finally{await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  return file;
 }
 async function pointer(name,body){
  const temporary=path.join(out,name+'.pending-'+crypto.randomUUID()),handle=await fs.open(temporary,'wx');
  try{try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}await fs.rename(temporary,path.join(out,name));await syncDirectory();}
  finally{await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }
 try{
  let saved=null;try{saved=JSON.parse(await fs.readFile(path.join(out,'LATEST.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(saved){
   if(!saved.checkpoint||path.basename(saved.checkpoint.path)!==saved.checkpoint.path)throw Error('Invalid saved checkpoint path');
   const body=await fs.readFile(path.join(out,saved.checkpoint.path)),identity=digest(body);resume=R.restore(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)),saved,source,identity);latest=saved;
   process.stdout.write(JSON.stringify({resumed:latest})+'\n');
  }
  async function save(value){
   if(latest&&R.rank(value.phase)<R.rank(latest.phase))throw Error('A completed phase cannot be replaced by an earlier phase');
   const graph=R.compact(value),body=JSON.stringify(graph),receipt=R.describe(value,digest(body),source);
   await exact(receipt.checkpoint.path,body);await exact(receipt.checkpoint.path.replace('.checkpoint.json','.receipt.json'),JSON.stringify(receipt,null,2)+'\n');
   await pointer('LATEST.json',JSON.stringify(receipt,null,2)+'\n');latest=receipt;process.stdout.write(JSON.stringify({checkpoint:receipt})+'\n');
  }
  if(!latest)await save(resume);
  const result=await course(payload.files,{resume,startAt:resume.phase,progress:row=>process.stdout.write(JSON.stringify({progress:row})+'\n'),checkpoint:save});
  if(latest.phase!=='complete-course')throw Error('Course did not retain its complete final checkpoint');
  const summary={schema:'distribution.native-course-result/v2',execution:'Original complete Merchant dispatch course in Node; original model with injected filesystem/listener',...source,checks:result.checks,timings:result.timings,requests:result.records.length,editions:result.editions.length,sequence:result.state.sequence,stateSha256:result.state.sha256,latestCheckpoint:latest};
  const body=JSON.stringify(summary,null,2)+'\n',identity=digest(body),name='COMPLETE_RESULT.'+identity.sha256+'.json';await exact(name,body);await pointer('COMPLETE_RESULT.json',body);process.stdout.write(JSON.stringify({complete:name,...identity,latestCheckpoint:latest})+'\n');
 }finally{await directory.close();}
}
if(require.main===module)run().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
module.exports={run};
