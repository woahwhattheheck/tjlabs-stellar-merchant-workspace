#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Operate and independently reopen the maintained bank page-assembly workflow.
import {constants} from 'node:fs';
import {open,mkdir,lstat} from 'node:fs/promises';
import {resolve,isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openAccountingWorkspace} from '../../workspace/store.mjs';
import {ReceivablesWorkspace} from '../store.mjs';
import {BankStatementsWorkspace} from './store.mjs';
import {need,json,sha,plain,field} from '../core.mjs';

async function bytes(path) {
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try {
    const stat=await handle.stat();
    need(stat.isFile()&&stat.size>0&&stat.size<=4_000_000,'PAGE_COURSE_INPUT','Choose a complete input file up to 4 MB.');
    const data=await handle.readFile();need(data.length===stat.size,'PAGE_COURSE_INPUT_CHANGED','The input changed while reading.',409);return data;
  } finally{await handle.close();}
}
function absolute(path,label) {
  need(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&path!=='/','PAGE_COURSE_PATH','Use an absolute normalized '+label+' path.');
  return path;
}
async function privateOutput(path) {
  try{await mkdir(path,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const stat=await lstat(path);
  need(stat.isDirectory()&&!stat.isSymbolicLink()&&!(stat.mode&0o077)&&(!process.getuid||stat.uid===process.getuid()),
    'PAGE_COURSE_OUTPUT','Use a private, owned output directory without a symlink.',409);
}
async function save(path,data) {
  const body=Buffer.isBuffer(data)?data:Buffer.from(typeof data==='string'?data:json(data));
  let handle;
  try{handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const old=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    try {
      const stat=await old.stat();
      need(stat.isFile()&&stat.nlink===1&&stat.size===body.length&&!(stat.mode&0o077),'PAGE_COURSE_OUTPUT_CHANGED','An existing course output differs from this operation.',409);
      need(sha(await old.readFile())===sha(body),'PAGE_COURSE_OUTPUT_CHANGED','An existing course output differs from this operation.',409);
    }finally{await old.close();}
    return {name:path.split('/').at(-1),bytes:body.length,sha256:sha(body)};
  }
  try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}
  return {name:path.split('/').at(-1),bytes:body.length,sha256:sha(body)};
}
export async function receivePageAssemblyCourse(input,out) {
  need(plain(input)&&plain(input.workspace)&&plain(input.selection),'PAGE_COURSE_INPUT','Provide workspace options and the complete retained-page selection.');
  absolute(input.workspace.directory,'original workspace');absolute(out,'artifact directory');
  need(typeof input.workspace.expectedWorkspaceId==='string'&&input.workspace.expectedWorkspaceId.length>0,
    'PAGE_COURSE_WORKSPACE','Bind this course to its original expectedWorkspaceId.');
  const actor=field(input.actor,'operator',160),requestId=field(input.requestId,'original request ID',200),
    name=field(input.name,'reconciliation name',160),mode=input.mode??'close';
  need(['close','exercise'].includes(mode),'PAGE_COURSE_MODE','Choose close or exercise mode.');
  if(mode==='exercise')field(input.exerciseReason,'demonstration reopening reason',4000);
  await privateOutput(out);
  const files=[],record=async(name,value)=>{const saved=await save(join(out,name),value);files.push(saved);return saved;};
  await record('input.json',input);
  const savedJson=async name=>{
    let handle;try{handle=await open(join(out,name),constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));}
    catch(error){if(error.code==='ENOENT')return null;throw error;}
    try {
      const stat=await handle.stat();
      need(stat.isFile()&&stat.nlink===1&&stat.size>0&&stat.size<=128_000_000&&!(stat.mode&0o077)&&
        (!process.getuid||stat.uid===process.getuid()),'PAGE_COURSE_OUTPUT_CHANGED','Use the original private operation artifacts.',409);
      const body=await handle.readFile();need(body.length===stat.size,'PAGE_COURSE_OUTPUT_CHANGED','The saved operation artifact changed during reading.',409);
      return {value:JSON.parse(body.toString('utf8')),descriptor:{name,bytes:body.length,sha256:sha(body)}};
    }finally{await handle.close();}
  };
  const sameSelection=selection=>selection?.kind==='CAMT_PAGE_ASSEMBLY'&&
    json([...selection.importIds].sort())===json([...input.selection.importIds].sort())&&
    selection.summaryScope===(input.selection.summaryScope??'STATEMENT')&&selection.groupingNote===(input.selection.groupingNote??'').trim();
  let workspace,bank;
  const openWorkspace=async()=>{workspace=await openAccountingWorkspace(input.workspace);bank=await new BankStatementsWorkspace(new ReceivablesWorkspace(workspace)).init();};
  const lookup=async id=>{try{return await bank.getOperation(id);}catch(error){if(error.code==='BANK_OPERATION_NOT_FOUND')return null;throw error;}};
  const createClose=async(id,label)=>{
    const artifactNames=[label+'-assembly.json',label+'-reconciliation-review.json',label+'-request.json'],
      saved=await Promise.all(artifactNames.map(savedJson)),prior=await lookup(id),
      expectedName=label==='original'?name:name+' — successor';
    if(prior) {
      need(saved.every(Boolean),'PAGE_COURSE_ORIGINAL_ARTIFACTS','Resume this existing operation from its original complete artifact directory.',409);
      const [assembly,review,request]=saved.map(item=>item.value);
      need(request.requestId===id&&request.actor===actor&&request.name===expectedName&&
        request.accountId===input.selection.accountId&&request.note===(input.note??'')&&request.balanceNote===(input.balanceNote??'')&&
        (request.periodCloseId??null)===(input.periodCloseId??null)&&sameSelection(request.sourceClosing)&&
        assembly.id===request.sourceClosing.id&&review.reviewSha256===request.reviewSha256&&
        review.sourceClosing?.assembly?.id===assembly.id&&request.workspaceId===input.workspace.expectedWorkspaceId,
        'PAGE_COURSE_REQUEST_CHANGED','The saved original request or review differs from this complete operation.',409);
      const replay=await bank.retainClose(request);
      need(prior.operation.action==='bank_period_closed'&&replay.close?.id===prior.close?.id&&sameSelection(replay.close.sourceClosing),
        'PAGE_COURSE_REQUEST_CHANGED','The original complete close intent did not recover its same record.',409);
      for(const item of saved)files.push(item.descriptor);
      return replay.close;
    }
    const assembly=await bank.previewAssembly(input.selection);
    need(assembly.eligible,'PAGE_COURSE_SOURCE_REVIEW','Resolve the retained original page review before closing.',409);
    const value={accountId:assembly.accountId,from:assembly.closing.from,until:assembly.closing.until,
      openingBalance:assembly.closing.opening.amount,closingBalance:assembly.closing.closing.amount,
      sourceClosing:assembly.sourceClosing,balanceNote:input.balanceNote??'',...(input.periodCloseId?{periodCloseId:input.periodCloseId}:{})};
    const preview=await bank.previewClose(value);
    need(preview.ready,'PAGE_COURSE_RECONCILIATION_REVIEW','Resolve the complete original transactions and posting parts before retaining this close.',409);
    for(const [index,current,key] of [[0,assembly,'id'],[1,preview,'reviewSha256']]) {
      if(saved[index]) {
        need(saved[index].value[key]===current[key]&&saved[index].value.workspaceId===current.workspaceId,
          'PAGE_COURSE_REVIEW_CHANGED','The original complete review changed. Preserve these artifacts and start a newly reviewed operation.',409);
        files.push(saved[index].descriptor);
      } else await record(artifactNames[index],current);
    }
    let request=saved[2]?.value;
    if(request) {
      need(request.requestId===id&&request.actor===actor&&request.name===expectedName&&
        request.accountId===input.selection.accountId&&request.note===(input.note??'')&&request.balanceNote===(input.balanceNote??'')&&
        (request.periodCloseId??null)===(input.periodCloseId??null)&&sameSelection(request.sourceClosing)&&
        request.sourceClosing.id===assembly.id&&request.reviewSha256===preview.reviewSha256&&
        request.workspaceId===input.workspace.expectedWorkspaceId,
        'PAGE_COURSE_REQUEST_CHANGED','The retained complete intent differs from this original source review.',409);
      files.push(saved[2].descriptor);
    } else {
      request={...value,workspaceId:preview.workspaceId,revision:preview.revision,requestId:id,actor,name:expectedName,
        note:input.note??'',reviewSha256:preview.reviewSha256};
      await record(artifactNames[2],request);
    }
    // The native journal excludes revision from the intent; a resumed pre-commit
    // request may renew only revision after its original complete review agrees.
    return (await bank.retainClose({...request,revision:preview.revision})).close;
  };
  const exportClose=async(close,label)=>{
    const detail=await bank.closeDetail(close.id);
    const actual=await bank.closeFile(close.id,'account.tar');
    await record(label+'-account.tar',actual.bytes);
    const reportFile=await bank.closeFile(close.id,'reconciliation.json');
    await record(label+'-reconciliation.json',reportFile.bytes);
    const editable=await bank.closeFile(close.id,'editable-reconciliation.json');
    await record(label+'-editable-reconciliation.json',editable.bytes);
    const originalIds=detail.report.sourceClosing?.importIds;
    need(detail.report.sourceClosing?.kind==='CAMT_PAGE_ASSEMBLY'&&Array.isArray(originalIds),
      'PAGE_COURSE_ASSEMBLY_MISSING','The saved close must retain the reviewed original page assembly.',409);
    for(const id of originalIds) {
      need(detail.report.imports.some(row=>row.id===id),'PAGE_COURSE_SOURCE_MISSING','The complete close must retain every selected original page.',409);
      const original=await bank.closeFile(close.id,'source-'+id+'.xml');
      const imported=detail.report.imports.find(row=>row.id===id);
      need(original.bytes.length===imported.file.bytes&&sha(original.bytes)===imported.file.sha256,
        'PAGE_COURSE_SOURCE_CHANGED','An exported original page differs from its imported bytes.',409);
      await record(label+'-source-'+id+'.xml',original.bytes);
    }
    return {closeId:close.id,reviewSha256:detail.report.reviewSha256,assemblyId:detail.report.sourceClosing.assembly.id,
      sourceImports:originalIds,archiveSha256:sha(actual.bytes),archiveBytes:actual.bytes.length};
  };
  try {
    await openWorkspace();
    const original=await createClose(requestId,'original');
    const first=await exportClose(original,'original');
    await workspace.close();workspace=null;await openWorkspace();
    const reopened=await exportClose(original,'original');
    need(reopened.archiveSha256===first.archiveSha256,'PAGE_COURSE_COLD_RECEIVE_CHANGED','The reopened original close archive changed.',409);
    const replay=await lookup(requestId);
    need(replay?.close?.id===original.id,'PAGE_COURSE_OPERATION_CHANGED','The original close operation did not recover its same saved record.',409);
    let successor=null,reopeningId=null;
    if(mode==='exercise') {
      const reopenRequestId=requestId+':reopen',saved=await savedJson('reopen-request.json'),prior=await lookup(reopenRequestId);
      let request=saved?.value;
      need(!prior||request,'PAGE_COURSE_ORIGINAL_ARTIFACTS','Resume this reopening from its original saved request.',409);
      if(request) {
        need(request.workspaceId===input.workspace.expectedWorkspaceId&&request.requestId===reopenRequestId&&request.actor===actor&&
          request.reason===input.exerciseReason&&request.bankCloseId===original.id,
          'PAGE_COURSE_REOPEN_CHANGED','The complete retained reopening intent differs from this operation.',409);
        files.push(saved.descriptor);
      } else {
        const state=await bank.state();
        request={workspaceId:state.workspaceId,revision:state.revision,requestId:reopenRequestId,
          bankCloseId:original.id,actor,reason:input.exerciseReason};
        await record('reopen-request.json',request);
      }
      const current=await bank.state(),result=await bank.reopenClose(original.id,{...request,revision:current.revision});
      need(result.reopening?.closeId===original.id&&(!prior||result.reopening.id===prior.reopening?.id),
        'PAGE_COURSE_REOPEN_CHANGED','The original complete reopening intent did not recover the same event.',409);
      reopeningId=result.reopening.id;
      const next=await createClose(requestId+':successor','successor');
      need(next.previousCloseId===original.id,'PAGE_COURSE_SUCCESSOR_CHANGED','The retained successor must link to the original close.',409);
      successor=await exportClose(next,'successor');
      await workspace.close();workspace=null;await openWorkspace();
      const received=await exportClose(next,'successor');
      need(received.archiveSha256===successor.archiveSha256,'PAGE_COURSE_SUCCESSOR_RECEIVE_CHANGED','The reopened successor archive changed.',409);
      const historical=await bank.closeDetail(original.id);
      need(historical.reopening?.id===reopeningId,'PAGE_COURSE_REOPENING_LOST','The original reopening must remain available after cold receiving.',409);
    }
    const result={schema:'stellar-forge.camt-page-assembly-receiving.v1',mode,workspaceId:(await bank.state()).workspaceId,
      original:first,coldReceived:true,operationRecovered:true,reopeningId,successor,files:[...new Map(files.map(file=>[file.name,file])).values()]};
    await record('result.json',result);return result;
  } finally{if(workspace)await workspace.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--input'||args[2]!=='--out'){
    process.stderr.write('Usage: node PAGE_ASSEMBLY_RECEIVE.mjs --input /private/course.json --out /private/page-artifacts\n');process.exitCode=2;
  } else receivePageAssemblyCourse(JSON.parse((await bytes(absolute(args[1],'input'))).toString('utf8')),absolute(args[3],'output'))
    .then(result=>process.stdout.write(json(result))).catch(error=>{process.stderr.write(json({error:error.code??error.name,message:error.message}));process.exitCode=1;});
}
