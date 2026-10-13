#!/usr/bin/env node
// MIT. Native grant tracker intake using the original OperatingPlan writer and receiver.
import { lstat, mkdir, readdir, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createGrantTracker, importGrantSource, saveGrantRow, saveGrantPlanDetails,
  inspectGrantTracker, receiveGrantTracker, exportGrantTracker,
  createGrantReturn, compareGrantReturn, decideGrantReturn, applyGrantReturn } from './grant-tracker.mjs';
import { saveTextExport } from './write-json.mjs';
import { OPERATING_RETURN_MAX_BYTES, OPERATING_RETURN_PLAN_MAX_BYTES } from './operating-plan-return.mjs';

const usage = 'grant-tracker <create|import-source|review-row|details|show|export|receive|return-create|return-show|return-decide|return-apply> --input REQUEST.json --out NEW_OUTPUT\n' +
  'Read commands show/return-show use --file COMPLETE.json. Export uses --file COMPLETE_PLAN.json --out NEW_DIRECTORY.\n' +
  'Every mutation request retains its original plan, stable IDs, expectedRevision and savedAt. Existing exact outputs reopen; different bytes never overwrite.';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const need=(ok,message)=>{if(!ok)throw new Error(message);};
async function held(filename,max=32*1024*1024){
  const path=resolve(filename),before=await lstat(path);need(before.isFile()&&!before.isSymbolicLink()&&before.size<=max,'Choose a complete regular file within the declared byte limit.');
  const file=await open(path,'r');try{
    const stat=await file.stat();need(stat.dev===before.dev&&stat.ino===before.ino,'The original file changed before reading.');
    const bytes=await file.readFile(),after=await file.stat(),current=await lstat(path);
    need(bytes.length===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&current.dev===before.dev&&current.ino===before.ino,'The original file changed while reading.');
    return bytes;
  }finally{await file.close();}
}
async function readJSON(path,max=32*1024*1024){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await held(path,max)));}
async function publish(filename,value){
  const text=typeof value==='string'?value:json(value);
  try{await saveTextExport(filename,text);return {filename:resolve(filename),bytes:Buffer.byteLength(text),sha256:hash(text),reused:false};}
  catch(error){if(error.code!=='EEXIST')throw error;const current=await held(filename,Math.max(32*1024*1024,Buffer.byteLength(text)));need(current.equals(Buffer.from(text)),'The selected output already contains different bytes; preserve it and select a new destination.');return {filename:resolve(filename),bytes:current.length,sha256:hash(current),reused:true};}
}
async function exportDirectory(plan,out){
  const output=await exportGrantTracker(plan),target=resolve(out),members=output.files.map(f=>({name:f.name,mediaType:f.mediaType,bytes:Buffer.byteLength(f.content),sha256:hash(f.content)}));
  const selection={schema:'summitflow.grant-tracker-export-selection.v1',planId:plan.id,revision:plan.revisions.length,planSha256:hash(json(plan)),members};
  const selectionText=json(selection),manifest={schema:'summitflow.grant-tracker-directory.v1',planId:plan.id,revision:plan.revisions.length,members:[...members,{name:'selection.json',mediaType:'application/json',bytes:Buffer.byteLength(selectionText),sha256:hash(selectionText)}]};
  let existed=false;
  try{await mkdir(target,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;existed=true;const stat=await lstat(target);need(stat.isDirectory()&&!stat.isSymbolicLink(),'The receiving path must be a regular directory.');}
  const names=await readdir(target),expectedBodies=new Map(output.files.map(f=>[f.name,Buffer.from(f.content)]));
  expectedBodies.set('selection.json',Buffer.from(selectionText));expectedBodies.set('manifest.json',Buffer.from(json(manifest)));
  const interruptedTemporaries=[];
  for(const name of names){
    if(expectedBodies.has(name)){
      const expected=expectedBodies.get(name),actual=await held(join(target,name),expected.length);
      need(actual.equals(expected),'An existing complete export member differs: '+name);continue;
    }
    // Preserve an interrupted original writer temporary only after exact source-bound prefix verification.
    // A pre-link temporary can be partial. A post-link alias must be the complete expected file.
    const match=/^\.(.+)\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.tmp$/.exec(name);
    need(match&&expectedBodies.has(match[1]),'The destination contains unrelated files; preserve it and select a different export directory.');
    const expected=expectedBodies.get(match[1]),actual=await held(join(target,name),expected.length);
    need(actual.equals(expected.subarray(0,actual.length)),'An interrupted writer file does not match this exact selected export: '+name);
    const temporaryStat=await lstat(join(target,name));let alias=false;
    if(names.includes(match[1])){
      const finalStat=await lstat(join(target,match[1]));alias=temporaryStat.dev===finalStat.dev&&temporaryStat.ino===finalStat.ino;
      if(alias)need(actual.equals(expected),'A retained published alias is incomplete.');
    }
    interruptedTemporaries.push({name,member:match[1],bytes:actual.length,sha256:hash(actual),publishedAlias:alias,retained:true});
  }
  if(names.some(name=>expectedBodies.has(name)&&name!=='selection.json'))need(names.includes('selection.json'),'The existing directory has no complete original export selection; preserve it.');
  await publish(join(target,'selection.json'),selectionText);
  // The original selection is atomically retained before any output. Exact partial members resume in place.
  for(const file of output.files)await publish(join(target,file.name),file.content);
  await publish(join(target,'manifest.json'),manifest);
  const folder=await open(target,'r');try{await folder.sync();}finally{await folder.close();}
  for(const item of manifest.members){const bytes=await held(join(target,item.name),128*1024*1024);need(bytes.length===item.bytes&&hash(bytes)===item.sha256,'A completed original export differs: '+item.name);}
  return {directory:target,reused:existed,interruptedTemporaries,...manifest};
}
export async function runGrantTracker(argv=process.argv.slice(2)){
  const parsed=parseArgs({args:argv,allowPositionals:true,strict:true,options:{input:{type:'string'},file:{type:'string'},out:{type:'string'},help:{type:'boolean'}}});
  const command=parsed.positionals[0],a=parsed.values;
  if(a.help||!command){process.stdout.write(usage+'\n');return;}
  need(parsed.positionals.length===1,'Choose one command.');
  if(command==='show'){need(a.file,'--file is required.');const view=await inspectGrantTracker(await readJSON(a.file));process.stdout.write(json({planId:view.plan.id,revision:view.revision,counts:view.counts,ready:view.ready,sources:view.sources.map(s=>({id:s.id,name:s.name,bytes:s.bytes,sha256:s.sha256})),rows:view.rows.map(r=>({id:r.id,values:r.values,review:r.record,issues:r.issues}))}));return;}
  if(command==='return-show'){need(a.file,'--file is required.');process.stdout.write(json(await compareGrantReturn(await readJSON(a.file,OPERATING_RETURN_MAX_BYTES))));return;}
  if(command==='export'){need(a.file&&a.out,'--file and --out are required.');const plan=(await inspectGrantTracker(await readJSON(a.file))).plan;process.stdout.write(json(await exportDirectory(plan,a.out)));return;}
  need(a.input&&a.out,'A complete --input request and new --out file are required.');
  const allowance=1024*1024,requestLimit=command==='return-decide'?2*OPERATING_RETURN_MAX_BYTES+allowance:
    command==='return-apply'?OPERATING_RETURN_MAX_BYTES+OPERATING_RETURN_PLAN_MAX_BYTES+allowance:
    2*OPERATING_RETURN_PLAN_MAX_BYTES+allowance;
  const request=await readJSON(a.input,requestLimit);let result;
  const options=()=>{need(Number.isSafeInteger(request.expectedRevision)&&typeof request.savedAt==='string','Keep expectedRevision and an explicit savedAt in the original request.');return {expectedRevision:request.expectedRevision,savedAt:request.savedAt};};
  if(command==='create'){need(typeof request.savedAt==='string','Keep the original savedAt in this creation request.');result=await createGrantTracker(request);}
  else if(command==='import-source'){
    need(request.source&&typeof request.source.file==='string'&&typeof request.source.expectedSha256==='string','The source selects its complete original file and expectedSha256.');
    const {file,expectedSha256,...source}=request.source,bytes=await held(file,24*1024*1024);need(hash(bytes)===expectedSha256,'The source file differs from its selected SHA-256.');
    result=await importGrantSource(request.plan,{...source,bytes},options());
  }else if(command==='review-row')result=await saveGrantRow(request.plan,request.rowId,request.review,options());
  else if(command==='details')result=await saveGrantPlanDetails(request.plan,request.details,options());
  else if(command==='receive')result=(await receiveGrantTracker(request.incoming,request.existing??null)).plan;
  else if(command==='return-create'){need(typeof request.options?.createdAt==='string','Retain the original return creation time.');result=await createGrantReturn(request.current,request.incoming,request.options);}
  else if(command==='return-decide')result=await decideGrantReturn(request.review,request.key,request.decision);
  else if(command==='return-apply'){need(typeof request.savedAt==='string','Retain the original return save time.');result=await applyGrantReturn(request.review,{current:request.current,savedAt:request.savedAt});}
  else throw new Error('Unknown command: '+command+'\n'+usage);
  process.stdout.write(json(await publish(a.out,result)));
}
if(import.meta.url===new URL(process.argv[1],'file://').href)runGrantTracker().catch(error=>{process.stderr.write((error.code?error.code+': ':'')+error.message+'\n');process.exitCode=1;});
