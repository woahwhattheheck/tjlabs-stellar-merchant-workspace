#!/usr/bin/env node
// MIT. Review and continue one original application import batch at a time.
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {connectGrantPortfolio,saveGrantPortfolioFile} from './client.mjs';
import {prepareAwardCsvImportSession,reviewAwardCsvSessionBatch,submitAwardCsvSessionBatch,
  inspectAwardCsvImportSession} from './awards-import-session.mjs';

const need=(ok,message)=>{if(!ok)throw new Error(message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sameStat=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
export async function ordinary(path,maximum){
  need(typeof path==='string'&&path===resolve(path),'Use an absolute selected source or review file path.');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await handle.stat();
    need(before.isFile()&&before.size>0&&before.size<=maximum,'Use a bounded complete original regular file.');
    const bytes=await handle.readFile(),after=await handle.stat(),attached=await lstat(path);
    need(bytes.length===before.size&&sameStat(before,after)&&attached.dev===before.dev&&attached.ino===before.ino,
      'The selected original file changed while reading.');
    return bytes;
  }finally{await handle.close();}
}
export async function readJson(path){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await ordinary(path,64*1024*1024)));}
export async function retainedJson(path,value){
  need(typeof path==='string'&&path===resolve(path),'Use an absolute output path in a private operator directory.');
  const parent=dirname(path),info=await lstat(parent);
  need(info.isDirectory()&&!info.isSymbolicLink()&&await realpath(parent)===parent&&!(info.mode&0o077)&&
    (process.getuid===undefined||info.uid===process.getuid()),'Keep the saved import in a real private operator-owned directory.');
  const bytes=jsonBytes(value);
  need(bytes.length<=64*1024*1024,'The complete original return exceeds this retained JSON limit.');
  const result=await saveGrantPortfolioFile({descriptor:{bytes:bytes.length,sha256:sha(bytes)},
    response:new Response(bytes)},path);
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{await handle.sync();}finally{await handle.close();}
  const directory=await open(parent,constants.O_RDONLY|constants.O_DIRECTORY);
  try{await directory.sync();}finally{await directory.close();}
  return {...result,sha256:sha(bytes),bytes:bytes.length};
}
function argumentsOf(argv){
  const [command,...pairs]=argv;
  const allowed={
    prepare:['connection','portfolio','input','csv','out'],
    review:['connection','session','csv','index','out'],
    submit:['connection','session','csv','batch','out','resume-failed'],
    inspect:['connection','session','csv','out'],
  };
  need(Object.hasOwn(allowed,command),'Choose prepare, review, submit or inspect.');
  need(pairs.length%2===0,'Pass each named option once with its value.');
  const values={};
  for(let i=0;i<pairs.length;i+=2){
    const key=pairs[i].startsWith('--')?pairs[i].slice(2):'';
    need(allowed[command].includes(key)&&!Object.hasOwn(values,key)&&pairs[i+1],
      'Use each declared command option exactly once.');
    values[key]=pairs[i+1];
  }
  for(const key of allowed[command].filter(key=>key!=='resume-failed'))
    need(Object.hasOwn(values,key),'Missing --'+key+'.');
  need(values['resume-failed']===undefined||values['resume-failed']==='true',
    'Use --resume-failed true only for the original retryable failed request.');
  return {command,values};
}
export async function main(argv=process.argv.slice(2)){
  const {command,values}=argumentsOf(argv),controller=new AbortController();
  const stopped=()=>controller.abort(new Error('Operator requested stop; reconcile the same original request before continuing.'));
  process.on('SIGINT',stopped);process.on('SIGTERM',stopped);
  let client;
  try{
    const csv=await ordinary(values.csv,8*1024*1024);
    client=await connectGrantPortfolio({consoleUrlFile:values.connection});
    const options={signal:controller.signal};
    let result;
    if(command==='prepare'){
      const input=await readJson(values.input);
      need(!Object.hasOwn(input,'csv')&&!Object.hasOwn(input,'workspaceId'),
        'The original source file and actual connected workspace are supplied separately.');
      const state=await client.state(options),portfolio=await client.portfolio(values.portfolio,options);
      result=prepareAwardCsvImportSession(portfolio,{...input,csv,workspaceId:state.workspaceId});
    }else{
      const session=await readJson(values.session);
      if(command==='review'){
        need(/^(0|[1-9]\d*)$/.test(values.index),'Select a zero-based original batch index.');
        const reviewed=await reviewAwardCsvSessionBatch(client,session,csv,Number(values.index),options);
        result=reviewed.batch;
      }else if(command==='submit'){
        const batch=await readJson(values.batch);
        // The reviewed immutable batch file already exists before any write.
        result=await submitAwardCsvSessionBatch(client,session,batch,csv,
          {...options,resumeFailed:values['resume-failed']==='true'});
      }else result=await inspectAwardCsvImportSession(client,session,csv,options);
    }
    // The original request remains recoverable from the workspace if saving
    // this exact return fails. Never repeat a provider action to save a file.
    const saved=await retainedJson(values.out,result);
    process.stdout.write(JSON.stringify({command,state:result.state??'REVIEW_SAVED',file:saved,
      operationId:result.id??result.plan?.action?.operationId??null,
      sessionId:result.sessionId??null})+'\n');
    if(result.state==='FAILED')process.exitCode=1;
    return result;
  }finally{
    if(client)await client.dispose();
    process.off('SIGINT',stopped);process.off('SIGTERM',stopped);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{
    process.stderr.write(JSON.stringify({state:'INCOMPLETE',code:error.code??'GRANT_AWARDS_IMPORT_SESSION',
      error:error.message,operationId:error.operationId??null,
      recovery:'Reopen the same session and batch. Inspect the original request before any resume; retain existing files.'})+'\n');
    process.exitCode=1;
  });
