#!/usr/bin/env node
// MIT. Whole original-source preparation, native CLI delivery and cold return receiving.
import { readFile, lstat, mkdir, open } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { prepareGrantCustomers, receiveGrantPreparation } from './grant-tracker-preparation.mjs';
import { runGrantTracker } from './grant-tracker-cli.mjs';
import { inspectGrantTracker } from './grant-tracker.mjs';
import { saveTextExport } from './write-json.mjs';
const json=x=>JSON.stringify(x,null,2)+'\n',sha=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,message)=>{if(!ok)throw new Error(message);};
async function held(path,max=32*1024*1024){
  const before=await lstat(path);need(before.isFile()&&!before.isSymbolicLink()&&before.size<=max,'Keep complete selected regular input: '+path);
  const fd=await open(path,'r');try{const first=await fd.stat();need(first.dev===before.dev&&first.ino===before.ino,'Input identity changed.');
    const bytes=await fd.readFile(),after=await fd.stat(),now=await lstat(path);
    need(bytes.length===before.size&&after.size===before.size&&after.mtimeMs===before.mtimeMs&&now.dev===before.dev&&now.ino===before.ino,'Input changed during complete read.');return bytes;
  }finally{await fd.close();}
}
async function directory(path){try{await mkdir(path,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;const stat=await lstat(path);need(stat.isDirectory()&&!stat.isSymbolicLink(),'Use the original regular output directory.');}}
async function publish(path,value){
  const text=typeof value==='string'?value:json(value);
  try{await saveTextExport(path,text);}catch(error){if(error.code!=='EEXIST')throw error;need((await held(path,Math.max(Buffer.byteLength(text),32*1024*1024))).equals(Buffer.from(text)),'Retained output differs: '+path);}
  return {name:path,bytes:Buffer.byteLength(text),sha256:sha(text)};
}
async function sourceClosure(entry){
  const files=new Map();
  async function visit(path){
    path=resolve(path);if(files.has(path))return;
    const bytes=await held(path),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    files.set(path,{path,bytes:bytes.length,sha256:sha(bytes)});
    for(const match of text.matchAll(/^import\s+[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/gm)){
      const target=match[1];if(target.startsWith('.'))await visit(resolve(dirname(path),target));
      else need(target.startsWith('node:'),'Unselected source dependency: '+target);
    }
  }
  await visit(entry);return [...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
export async function receiveGrantTrackerSource(argv=process.argv.slice(2)){
  const {values:a}=parseArgs({args:argv,strict:true,options:{input:{type:'string'},'expected-sha256':{type:'string'},out:{type:'string'}}});
  need(a.input&&/^[a-f0-9]{64}$/.test(a['expected-sha256']||'')&&a.out,'Use --input COMPLETE_SOURCE.json --expected-sha256 ORIGINAL_SHA --out OWNED_DIRECTORY.');
  const input=await held(resolve(a.input));need(sha(input)===a['expected-sha256'],'The complete original preparation source differs.');
  const root=resolve(a.out);await directory(root);
  const source=await sourceClosure(fileURLToPath(import.meta.url));
  await publish(join(root,'selection.json'),{schema:'summitflow.complete-source-receiving-selection.v1',input:{bytes:input.length,sha256:sha(input)},source});
  const prepared=await prepareGrantCustomers(new TextDecoder('utf-8',{fatal:true}).decode(input),{expectedSha256:sha(input)});
  const receiving=await receiveGrantPreparation(prepared),customers=[];
  for(const customer of prepared.customers){
    const folder=join(root,customer.leadId);await directory(folder);
    const planPath=join(folder,'complete-plan.json');await publish(planPath,customer.plan);
    const request=join(folder,'receive-request.json'),coldPath=join(folder,'cold-plan.json');
    await publish(request,{incoming:customer.plan,existing:null});
    await runGrantTracker(['receive','--input',request,'--out',coldPath]);
    await runGrantTracker(['receive','--input',request,'--out',coldPath]);
    need((await held(coldPath)).equals(Buffer.from(json(customer.plan))),'Native receiving changed a complete customer plan.');
    const exportPath=join(folder,'exports');await runGrantTracker(['export','--file',coldPath,'--out',exportPath]);
    await runGrantTracker(['export','--file',coldPath,'--out',exportPath]);
    const files=[];
    for(const file of customer.files){
      const actual=await held(join(exportPath,file.name),128*1024*1024);
      need(actual.equals(Buffer.from(file.content)),'Native full export differs: '+customer.leadId+'/'+file.name);
      files.push({name:file.name,bytes:actual.length,sha256:sha(actual)});
    }
    const coldView=await inspectGrantTracker(JSON.parse(await held(coldPath)));
    need(coldView.rows.length===customer.counts.physicalRows&&coldView.sources.length===customer.sourceMembers.length,'Cold native coverage differs.');
    customers.push({leadId:customer.leadId,selectionId:customer.selectionId,counts:customer.counts,sourceMembers:customer.sourceMembers,files});
  }
  const exercise=join(root,'labelled-software-return');await directory(exercise);
  const reviewPath=join(exercise,'completed-return.json'),planPath=join(exercise,'received-plan.json');
  await publish(reviewPath,receiving.exercise.review);await publish(planPath,receiving.exercise.plan);
  const request=join(exercise,'replay-request.json');
  await publish(request,{review:receiving.exercise.review,current:receiving.exercise.plan,savedAt:'2026-10-13T07:00:05.000Z'});
  const replayPath=join(exercise,'replay-result.json');
  await runGrantTracker(['return-apply','--input',request,'--out',replayPath]);
  await runGrantTracker(['return-apply','--input',request,'--out',replayPath]);
  const replay=JSON.parse(await held(replayPath,161*1024*1024));
  need(replay.alreadyPresent&&json(replay.plan)===json(receiving.exercise.plan),'Actual native completed return replay differs.');
  await runGrantTracker(['export','--file',planPath,'--out',join(exercise,'exports')]);
  const receipt={schema:'summitflow.complete-source-receiving.v1',inputSha256:sha(input),source,customers,
    editions:prepared.editions,internalFilesExcluded:prepared.internalFilesExcluded,
    labelledReturn:{customer:receiving.exercise.leadId,revision:receiving.exercise.plan.revisions.length,sameReturnReplayed:true,staleDestinationRejected:receiving.exercise.staleDestinationRejected},
    nativeCLI:true,browserExecuted:false};
  await publish(join(root,'RECEIVING.json'),receipt);const fd=await open(root,'r');try{await fd.sync();}finally{await fd.close();}
  process.stdout.write(json(receipt));return receipt;
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file://').href)receiveGrantTrackerSource().catch(error=>{process.stderr.write((error.code?error.code+': ':'')+error.message+'\n');process.exitCode=1;});
