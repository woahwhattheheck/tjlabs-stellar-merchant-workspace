#!/usr/bin/env node
/** Original Event worksheet choices: complete file preparation and receiving. */
import { open, lstat, realpath, link, unlink, readFile } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initial, reopen, review, nativeColumns, reviewHTML, serializeChoices, serializeNativeJSON, replaceColumns, eventWorkbookReturns } from './workbook-columns.mjs';
import { renderEditableWorkbookColumns } from './workbook-editor.mjs';
const MAX=16*1024*1024, WORKING_MAX=128*1024*1024, NATIVE_COLUMNS_MAX=512*1024;
const need=(ok,text)=>{if(!ok)throw Error(text);};
async function readText(path,limit=MAX){
  const selected=resolve(path),before=await lstat(selected);
  need(before.isFile()&&!before.isSymbolicLink()&&before.size<=limit,'Select a complete regular UTF-8 file within '+limit+' bytes.');
  const fd=await open(selected,'r');
  try{
    const a=await fd.stat();need(a.dev===before.dev&&a.ino===before.ino&&a.size===before.size,'The selected file changed while opening.');
    const raw=await fd.readFile();const b=await fd.stat();
    need(raw.length===a.size&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs,'The complete selected source changed while reading.');
    return new TextDecoder('utf-8',{fatal:true}).decode(raw);
  }finally{await fd.close();}
}
async function publish(path,body){
  const destination=resolve(path),parent=dirname(destination),folder=await lstat(parent);
  need(folder.isDirectory()&&!folder.isSymbolicLink(),'Choose an existing private output directory.');
  const actual=await realpath(parent),target=join(actual,basename(destination));
  const temporary=join(actual,'.event-columns-'+randomUUID()+'.tmp'),raw=Buffer.from(body,'utf8');
  const fd=await open(temporary,'wx',0o600);let written=false;
  try{await fd.writeFile(raw);await fd.sync();written=true;}finally{await fd.close();if(!written)await unlink(temporary).catch(()=>{});}
  try{
    try{await link(temporary,target);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const old=await lstat(target);need(old.isFile()&&!old.isSymbolicLink()&&old.size===raw.length,'The output already contains different original work.');
      const original=await open(target,'r');try{const before=await original.stat();const received=await original.readFile();const after=await original.stat();need(before.dev===old.dev&&before.ino===old.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&received.equals(raw),'The output already contains different original work.');}finally{await original.close();}
    }
    const directory=await open(actual,'r');try{await directory.sync();}finally{await directory.close();}
  }finally{await unlink(temporary).catch(()=>{});}
  return {path:target,bytes:raw.length};
}

async function read(path,limit=MAX){return JSON.parse(await readText(path,limit));}
const FLAGS={
  assign:['choices','out','envelope-out','actor','reviewer','note','note-file','at'],
  open:['source','out'],
  'prepare-return':['choices','assignment-id','out','actor','note','note-file','at'],
  preview:['choices','return','return-id','out'],
  stage:['choices','return','out'],
  resolve:['choices','return-id','resolutions','out'],
  apply:['choices','return','return-id','preview','resolutions','out','actor','note','note-file','at'],
  recover:['choices','kind','id','out'],
  'update-columns':['choices','input','out'],
  pending:['choices','key','text','text-file','out'],
  inspect:['choices','out'],
  editor:['choices','out'],
  html:['choices','out'],
  native:['choices','out']
};
const BINDING=['proposal','workspace','programme'];
const HELP='Use template, inspect, columns, html or editor; or review '+Object.keys(FLAGS).join(', ')+'.';
function args(values){
  const input=values.slice(),command=input.shift(),out={command};
  if(command==='review'){
    out.action=input.shift();
    need(Object.hasOwn(FLAGS,out.action),HELP);
    const allowed=[...FLAGS[out.action],...BINDING];
    while(input.length){
      const flag=input.shift();need(typeof flag==='string'&&flag.startsWith('--')&&allowed.includes(flag.slice(2))&&input.length,'Unknown or incomplete argument '+flag);
      const key=flag.slice(2);need(!Object.hasOwn(out,key),'Do not repeat '+flag);out[key]=input.shift();
    }
    return out;
  }
  need(['template','inspect','columns','html','editor'].includes(command),HELP);
  while(input.length){
    const flag=input.shift();need(['--proposal','--workspace','--programme','--choices','--out'].includes(flag)&&input.length,'Unknown or incomplete argument '+flag);
    const key=flag.slice(2);need(!Object.hasOwn(out,key),'Do not repeat '+flag);out[key]=input.shift();
  }
  return out;
}
function proposal(value){
  const candidate=value?.state==='WORKBOOK_COLUMN_CHOICES_REQUIRED'?value:value?.result;
  need(candidate?.state==='WORKBOOK_COLUMN_CHOICES_REQUIRED','Select the complete native worksheet proposal or its original completed action.');
  return candidate;
}
function wholeJSON(value,maximum=WORKING_MAX){
  const pretty=JSON.stringify(value,null,2)+'\n';
  if(Buffer.byteLength(pretty,'utf8')<=maximum)return pretty;
  const compact=JSON.stringify(value)+'\n';
  need(Buffer.byteLength(compact,'utf8')<=maximum,'The complete source exceeds '+maximum+' bytes. Keep every original file; no source, history or unfinished choice has been removed.');
  return compact;
}
function nativeJSON(value){
  const columns=nativeColumns(value);
  need(Buffer.byteLength(JSON.stringify(columns),'utf8')<=NATIVE_COLUMNS_MAX,'The complete canonical native column arrays exceed 512 KiB. Preserve the whole working review and deliberately prepare a fitting native selection.');
  return serializeNativeJSON(columns);
}
async function bound(value,a){
  if(BINDING.some(key=>Object.hasOwn(a,key))){
    need(BINDING.every(key=>a[key]),'Together select --proposal, --workspace and --programme for original source matching.');
    return reopen(value,{workspace_id:a.workspace,programme:a.programme,proposal:proposal(await read(a.proposal))});
  }
  return reopen(value);
}
async function attributed(a,reviewer=false){
  need(a.actor&&a.at&&(!reviewer||a.reviewer),'Retain explicit --actor, --at and, for assignment, --reviewer. Reuse them unchanged after an interrupted publication.');
  need(Object.hasOwn(a,'note')!==Object.hasOwn(a,'note-file'),'Use exactly one complete --note or --note-file.');
  const note=Object.hasOwn(a,'note')?a.note:await readText(a['note-file']);
  return {actor:a.actor,at:a.at,note,...(reviewer?{reviewer:a.reviewer}:{})};
}
async function returned(value,a){
  need(Boolean(a.return)!==Boolean(a['return-id']),'Select exactly one complete --return file or retained --return-id.');
  return a.return?await read(a.return,WORKING_MAX):eventWorkbookReturns.returnEnvelope(value,a['return-id']);
}
async function editor(value){
  const [coreSource,controllerSource,returnSource]=await Promise.all([
    readFile(new URL('./workbook-columns.mjs',import.meta.url),'utf8'),
    readFile(new URL('./workbook-editor.js',import.meta.url),'utf8'),
    readFile(new URL('./workbook-returns.mjs',import.meta.url),'utf8')]);
  return renderEditableWorkbookColumns(value,{coreSource,controllerSource,returnSource});
}
async function output(path,raw){
  need(path,'Choose a new --out path for the complete selected file.');
  return publish(path,raw);
}
async function destinations(items){
  const paths=new Set();
  for(const item of items){
    need(item.path,'Choose both --out and --envelope-out for the assigning working copy and complete assignment.');
    const destination=resolve(item.path),parent=dirname(destination),folder=await lstat(parent);
    need(folder.isDirectory()&&!folder.isSymbolicLink(),'Choose an existing private output directory.');
    const target=join(await realpath(parent),basename(destination));
    need(!paths.has(target),'Use distinct output paths for the complete working copy and assignment.');
    paths.add(target);
    let previous;
    try{previous=await lstat(target);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(previous){
      need(previous.isFile()&&!previous.isSymbolicLink(),'Preserve the existing output; select a new regular-file destination.');
      const raw=await readText(target,WORKING_MAX);
      need(raw===item.body,'A selected output already contains different original work; preserve it and choose a new path.');
    }
  }
}
function receiptSource(value,id){
  const receipt=value.review_receiving?.receipts.find(row=>row.id===id);
  need(receipt,'Select an actual retained complete receipt.');
  return {schema:'stellar-forge.event-workbook-receipt-source.v1',receipt_id:id,working:value};
}
function openSource(source){
  if(source?.schema==='stellar-forge.event-workbook-receipt-source.v1'){
    need(Object.keys(source).length===3&&Object.hasOwn(source,'working')&&Object.hasOwn(source,'receipt_id'),'Keep the complete receipt source.');
    const value=reopen(source.working);receiptSource(value,source.receipt_id);return value;
  }
  return eventWorkbookReturns.openAssignment(source);
}
async function runReview(a){
  const api=eventWorkbookReturns;
  if(a.action==='open'){
    need(a.source,'Select the complete --source assignment or recovered receipt-source file.');
    const value=await bound(openSource(await read(a.source,WORKING_MAX)),a);
    return {command:'review open',working:await output(a.out,wholeJSON(value)),active_assignment_id:value.review_receiving?.active_assignment_id??null};
  }
  need(a.choices,'Select the complete --choices working handover.');
  let value=await bound(await read(a.choices,WORKING_MAX),a);
  if(a.action==='assign'){
    const result=api.createAssignment(value,await attributed(a,true));
    const outputs=[{path:a.out,body:wholeJSON(result.value)},{path:a['envelope-out'],body:wholeJSON(result.envelope)}];
    await destinations(outputs);
    // The assigning copy is durable before its handoff. Explicit metadata makes either completed output reusable after interruption.
    const working=await publish(outputs[0].path,outputs[0].body);
    const assignment=await publish(outputs[1].path,outputs[1].body);
    return {command:'review assign',assignment_id:result.envelope.assignment.id,working,assignment};
  }
  if(a.action==='prepare-return'){
    need(a['assignment-id'],'Select the exact original --assignment-id.');
    const envelope=api.prepareReturn(value,a['assignment-id'],await attributed(a));
    return {command:'review prepare-return',return_id:envelope.return.id,assignment_id:envelope.return.assignment_id,envelope:await output(a.out,wholeJSON(envelope))};
  }
  if(a.action==='preview'){
    const preview=api.previewReturn(value,await returned(value,a));
    if(a.out)return {command:'review preview',comparison:await output(a.out,wholeJSON(preview)),return_id:preview.return_id,current_digest:preview.current_digest};
    return preview;
  }
  if(a.action==='stage'){
    need(a.return,'Select the complete original --return file.');
    value=api.stageReturn(value,await read(a.return,WORKING_MAX));
  }else if(a.action==='resolve'){
    need(a['return-id']&&a.resolutions,'Select --return-id and the complete --resolutions JSON object.');
    const resolutions=await read(a.resolutions,WORKING_MAX);
    need(resolutions&&typeof resolutions==='object'&&!Array.isArray(resolutions),'Supply a complete object of original worksheet indexes to keep-current, use-returned or null.');
    for(const [key,choice]of Object.entries(resolutions))value=api.setResolutionDraft(value,a['return-id'],key,choice);
  }else if(a.action==='apply'){
    need(a.preview,'Select the saved --preview actually reviewed against this current complete working copy.');
    const envelope=await returned(value,a),preview=await read(a.preview,WORKING_MAX);
    need(preview&&preview.return_id===envelope.return.id&&preview.assignment_id===envelope.return.assignment_id&&/^[a-f0-9]{64}$/.test(preview.current_digest),'Keep the exact saved comparison for this original returned assignment.');
    const resolutions=a.resolutions?await read(a.resolutions,WORKING_MAX):(value.review_receiving?.resolution_drafts[envelope.return.id]??{});
    value=api.applyReturn(value,envelope,{...await attributed(a),resolutions,expected_current_digest:preview.current_digest});
  }else if(a.action==='recover'){
    need(['working','assignment','return','receipt'].includes(a.kind),'Choose --kind working, assignment, return or receipt.');
    need(a.kind==='working'||a.id,'Select the original --id for the complete retained source.');
    const selected=a.kind==='working'?value:a.kind==='assignment'?api.assignmentEnvelope(value,a.id):a.kind==='return'?api.returnEnvelope(value,a.id):receiptSource(value,a.id);
    return {command:'review recover',kind:a.kind,id:a.id??null,source:await output(a.out,wholeJSON(selected))};
  }else if(a.action==='update-columns'){
    need(a.input,'Select the complete original worksheet-array object in --input.');
    value=replaceColumns(value,await read(a.input,WORKING_MAX));
  }else if(a.action==='pending'){
    need(a.key&&Object.hasOwn(a,'text')!==Object.hasOwn(a,'text-file'),'Select --key and exactly one full --text or --text-file.');
    value=api.setPending(value,a.key,Object.hasOwn(a,'text')?a.text:await readText(a['text-file']));
  }else if(a.action==='inspect'){
    const e=value.review_receiving;
    const result={review:review(value),review_receiving:e?{
      active_assignment_id:e.active_assignment_id,selected_return_id:e.selected_return_id,
      assignments:e.assignments.map(row=>({...row,issued_here:e.local_assignment_ids.includes(row.id)})),
      returns:e.incoming_returns.map(row=>({id:row.id,assignment_id:row.assignment_id,actor:row.actor,note:row.note,at:row.at,assignment_issued_here:e.local_assignment_ids.includes(row.assignment_id),applied_here:e.receipts.some(receipt=>receipt.return_id===row.id&&e.local_receipt_ids.includes(receipt.id))})),
      receipts:e.receipts.map(row=>({...row,received_here:e.local_receipt_ids.includes(row.id)})),
      resolution_drafts:e.resolution_drafts,pending:e.pending,source_counts:{snapshots:e.snapshots.length,assignments:e.assignments.length,returns:e.incoming_returns.length,receipts:e.receipts.length}
    }:null};
    if(a.out)return {command:'review inspect',inspection:await output(a.out,wholeJSON(result))};
    return result;
  }else if(a.action==='editor'||a.action==='html'||a.action==='native'){
    const raw=a.action==='editor'?await editor(value):a.action==='html'?reviewHTML(value):nativeJSON(value);
    return {command:'review '+a.action,file:await output(a.out,raw)};
  }else if(!['stage','resolve','apply','update-columns','pending'].includes(a.action))throw Error(HELP);
  return {command:'review '+a.action,working:await output(a.out,wholeJSON(value)),
    selected_return_id:value.review_receiving?.selected_return_id??null,
    local_receipt_ids:value.review_receiving?.local_receipt_ids??[]};
}
async function main(values=process.argv.slice(2)){
  const a=args(values);
  if(a.command==='review')return runReview(a);
  let value;
  if(a.command==='template'){
    need(a.proposal&&a.workspace&&a.programme&&a.out,'Template needs --proposal, --workspace, --programme and --out.');
    value=initial({workspace_id:a.workspace,programme:a.programme,proposal:proposal(await read(a.proposal))});
    return publish(a.out,serializeChoices(value));
  }
  need(a.choices,'Select the complete --choices handover.');
  value=await bound(await read(a.choices),a);
  if(a.command==='inspect'){
    const result=review(value);
    return a.out?publish(a.out,JSON.stringify(result,null,2)+'\n'):result;
  }
  const raw=a.command==='editor'?await editor(value):a.command==='columns'?nativeJSON(value):reviewHTML(value);
  return output(a.out,raw);
}
main().then(result=>{process.stdout.write(JSON.stringify(result,null,2)+'\n');}).catch(error=>{process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1;});
