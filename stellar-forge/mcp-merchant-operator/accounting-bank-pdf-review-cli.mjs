#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Local named PDF interpretation review. Financial receiving is a separate original operation.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,readdir,link,unlink} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {privateSupportDirectory,writePrivate} from './host-files.mjs';
import {acquireStateLease} from '../../stellar/scf-starforge-20261009/merchant-fleet-gateway/state-lease.mjs';
import {main as originalPdfCli} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/bank-pdf/cli.mjs';
import {
 PDF_REVIEW_SCHEMAS,PDF_REVIEW_LIMITS,PDF_LIMITS,canonical,digest,openWorkingCopy,
 issuePdfReview,openPdfReviewIssue,createPdfReviewRecord,openPdfReviewRecord,
 pdfReviewWorkingCopy,editPdfReviewDraft,receivePdfWorkingCopy,savePdfReviewEdition,
 exportPdfReviewReturn,openPdfReviewReturn,previewPdfReviewReturn,decidePdfReviewReturn,
 bankPdfReviewText,bankPdfReviewBytes,inspectBankPdfReviewBytes,verifyBankPdfReviewApplication,
 pdfSourceInput,prepareBankSource
} from './accounting-bank-pdf-review-client.mjs';
const BINDING='stellar-forge.bank-pdf-review-application.v1';
const CONTEXT_FILES=['issued.json','returned.json','current-working-copy.json','decision.json'];
const CONTEXT_LIMITS=[PDF_REVIEW_LIMITS.transferBytes,PDF_REVIEW_LIMITS.transferBytes,PDF_LIMITS.transferBytes,PDF_REVIEW_LIMITS.transferBytes];
const now=()=>new Date().toISOString(),sha=b=>createHash('sha256').update(b).digest('hex');
const pin=(name,bytes)=>({name,bytes:bytes.length,sha256:sha(bytes)});
const problem=e=>({code:e?.code??'ERROR',message:String(e?.message??e),...(e?.releaseError?{releaseError:e.releaseError}:{})});
const need=(yes,message,code='PDF_REVIEW_ARGUMENTS')=>{if(!yes)throw Object.assign(new Error(message),{code});};
const json=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
async function sync(path){const f=await open(path,constants.O_RDONLY);try{await f.sync();}finally{await f.close();}}
async function directory(path){
 path=resolve(path);await privateSupportDirectory(path);const st=await lstat(path);
 need(await realpath(path)===path&&(!process.getuid||st.uid===process.getuid()),'Use an owner-controlled private directory without symlink ancestors.');
 return path;
}
async function exists(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function read(path,limit=PDF_REVIEW_LIMITS.transferBytes,{allowLinks=false,allowEmpty=false}={}){
 path=resolve(path);await directory(dirname(path));
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{const st=await f.stat();
  need(st.isFile()&&(st.size>0||allowEmpty)&&st.size<=limit&&!(st.mode&0o077)&&(!process.getuid||st.uid===process.getuid())&&(allowLinks||st.nlink===1),'Use a complete private regular source file within its limit.');
  const bytes=await f.readFile(),after=await f.stat();
  need(bytes.length===st.size&&st.dev===after.dev&&st.ino===after.ino&&st.size===after.size&&st.mtimeMs===after.mtimeMs,'The selected source file changed while reading.');
  return {bytes,stat:after};
 }finally{await f.close();}
}
// A killed link publication may retain only this writer's exact same-inode temporary.
// Settle it only on a mutating command with the complete expected bytes in hand.
async function settle(path,bytes){
 const selected=await read(path,bytes.length,{allowLinks:true});
 need(selected.bytes.equals(Buffer.from(bytes)),'Preserve the existing different file; choose a distinct destination.','PDF_REVIEW_OUTPUT_EXISTS');
 if(selected.stat.nlink!==1){
  for(const name of await readdir(dirname(path))){
   if(!/^\.bank-pdf-review-writing-[a-f0-9-]{36}$/.test(name))continue;
   const candidate=join(dirname(path),name),st=await lstat(candidate);
   if(st.isFile()&&st.dev===selected.stat.dev&&st.ino===selected.stat.ino){
    need(!(st.mode&0o077)&&(!process.getuid||st.uid===process.getuid()),'An interrupted publication has an unknown owner.');
    await unlink(candidate);
   }
  }
  await sync(dirname(path));
  const after=await read(path,bytes.length);
  need(after.bytes.equals(Buffer.from(bytes)),'The settled original file changed.');
 }
 return pin(basename(path),bytes);
}
async function retain(path,bytes){
 bytes=Buffer.from(bytes);path=resolve(path);const parent=await directory(dirname(path));
 need(bytes.length>0&&bytes.length<=PDF_REVIEW_LIMITS.recordBytes,'Keep the complete output within 512 MiB; no file was shortened.');
 if(await exists(path))return settle(path,bytes);
 const tmp=join(parent,'.bank-pdf-review-writing-'+randomUUID());let failure;
 try{
  await writePrivate(tmp,bytes);
  try{await link(tmp,path);}catch(e){if(e.code!=='EEXIST')throw e;await settle(path,bytes);}
  await unlink(tmp);await sync(parent);return await settle(path,bytes);
 }catch(e){failure=e;throw e;}
 finally{try{await unlink(tmp);}catch(e){if(e.code!=='ENOENT'){if(failure)failure.releaseError=problem(e);else throw e;}}}
}
async function locked(path,work){
 const lease=await acquireStateLease(path);let failure;
 try{return await work(lease);}catch(e){failure=e;throw e;}
 finally{try{await lease.close();}catch(e){if(failure)failure.releaseError=problem(e);else throw e;}}
}

const equal=(a,b)=>canonical(a)===canonical(b);
const encode=value=>new TextEncoder().encode(canonical(value)+'\n');
function exact(value,keys,required=keys){
 need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(value,k)),'Retain only documented fields, including every required selection.');
 return value;
}
function checkBinding(value){
 exact(value,['schema','reviewId','decisionId','decisionSha256','workingCopyId','currentWorkingCopySha256','resultingWorkingCopySha256','files','sha256']);
 const {sha256,...body}=value;
 need(value.schema===BINDING&&sha(encode(body))===sha256,'The retained complete PDF application binding changed.');
 need(Array.isArray(value.files)&&value.files.length===4&&value.files.every((p,i)=>
  equal(Object.keys(p).sort(),['bytes','name','sha256'])&&p.name===CONTEXT_FILES[i]&&Number.isSafeInteger(p.bytes)&&p.bytes>0&&p.bytes<=CONTEXT_LIMITS[i]&&/^[a-f0-9]{64}$/.test(p.sha256)),
  'Keep all four original complete application input pins.');
 return value;
}
async function context(path,{settleLinks=false}={}){
 path=await directory(path);const raw=(await read(join(path,'binding.json'),1024*1024,{allowLinks:settleLinks})).bytes,binding=checkBinding(json(raw));
 if(settleLinks)await settle(join(path,'binding.json'),raw);
 const all=[];
 for(const p of binding.files){
  const b=(await read(join(path,p.name),p.bytes,{allowLinks:settleLinks})).bytes;
  need(b.length===p.bytes&&sha(b)===p.sha256,'An original issue, return, current working copy or decision changed.');
  if(settleLinks)await settle(join(path,p.name),b);all.push(b);
 }
 const verified=await verifyBankPdfReviewApplication({issueBytes:all[0],returnedBytes:all[1],currentWorkingCopyBytes:all[2],decisionBytes:all[3]});
 const d=verified.decision;
 need(binding.reviewId===verified.issue.reviewId&&binding.decisionId===d.decisionId&&binding.decisionSha256===d.sha256&&
  binding.workingCopyId===verified.currentWorkingCopy.id&&binding.currentWorkingCopySha256===d.currentWorkingCopySha256&&
  binding.resultingWorkingCopySha256===d.resultingWorkingCopySha256,'The retained author decision no longer matches its full source context.');
 return {directory:path,binding,verified};
}
function completed(c,workPin){
 return {schema:BINDING+'.result',state:'COMPLETE',bindingSha256:c.binding.sha256,
  reviewId:c.binding.reviewId,decisionId:c.binding.decisionId,decisionSha256:c.binding.decisionSha256,
  workingCopyId:c.verified.workingCopy.id,revision:c.verified.workingCopy.revision,
  resultingWorkingCopySha256:c.binding.resultingWorkingCopySha256,
  files:[workPin],financialReceiving:'SEPARATE_ORIGINAL_BANK_OPERATION'};
}
async function observeComplete(c,{settleLinks=false}={}){
 const resultPath=join(c.directory,'application.json');
 if(!(await exists(resultPath)))return null;
 const body=(await read(resultPath,1024*1024,{allowLinks:settleLinks})).bytes,receipt=json(body);
 const work=bankPdfReviewBytes(c.verified.workingCopy,{workingCopy:true}),expected=completed(c,pin('applied-working-copy.json',work));
 need(equal(receipt,expected),'Preserve the original different completed application receipt.');
 const actual=(await read(join(c.directory,'applied-working-copy.json'),PDF_LIMITS.transferBytes,{allowLinks:settleLinks})).bytes;
 need(actual.equals(Buffer.from(work)),'The exact completed original PDF working copy changed.');
 if(settleLinks){await settle(join(c.directory,'applied-working-copy.json'),work);await settle(resultPath,body);}
 return receipt;
}
/** Local retention only. The original current file is never overwritten. */
export async function retainBankPdfReviewApplication({directory:path,issueBytes,returnedBytes,currentWorkingCopyBytes,decisionBytes}={}){
 const verified=await verifyBankPdfReviewApplication({issueBytes,returnedBytes,currentWorkingCopyBytes,decisionBytes});
 const d=verified.decision,all=[issueBytes,returnedBytes,currentWorkingCopyBytes,decisionBytes];
 const body={schema:BINDING,reviewId:verified.issue.reviewId,decisionId:d.decisionId,decisionSha256:d.sha256,
  workingCopyId:verified.currentWorkingCopy.id,currentWorkingCopySha256:d.currentWorkingCopySha256,
  resultingWorkingCopySha256:d.resultingWorkingCopySha256,files:all.map((b,i)=>pin(CONTEXT_FILES[i],b))};
 const binding={...body,sha256:sha(encode(body))};
 path=resolve(path);await directory(dirname(path));try{await mkdir(path,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}await directory(path);
 return locked(path,async lease=>{
  lease.assertHeld();
  for(let i=0;i<all.length;i++)await retain(join(path,CONTEXT_FILES[i]),all[i]);
  await retain(join(path,'binding.json'),encode(binding));await sync(path);
  const c=await context(path);
  return {directory:path,state:'LOCAL_REVIEW_RETAINED',reviewId:verified.issue.reviewId,decisionId:d.decisionId,bindingSha256:c.binding.sha256,financialReceiving:'SEPARATE_ORIGINAL_BANK_OPERATION'};
 });
}
/** Inspect without repairing local files, applying another decision, or contacting a provider. */
export async function inspectBankPdfReviewApplication({directory:path}={}){
 const c=await context(path),receipt=await observeComplete(c);
 return {directory:c.directory,state:receipt?'COMPLETE':'LOCAL_REVIEW_RETAINED',binding:c.binding,receipt,
  originalRevision:c.verified.currentWorkingCopy.revision,resultingRevision:c.verified.workingCopy.revision,
  applied:c.verified.decision.applied,financialReceiving:'SEPARATE_ORIGINAL_BANK_OPERATION'};
}
/** Explicitly publish the exact already-decided original working copy; replay is byte-identical. */
export async function applyBankPdfReviewApplication({directory:path}={}){
 path=await directory(path);
 return locked(path,async lease=>{
  const c=await context(path,{settleLinks:true}),work=bankPdfReviewBytes(c.verified.workingCopy,{workingCopy:true});
  lease.assertHeld();const workPin=await retain(join(path,'applied-working-copy.json'),work),receipt=completed(c,workPin);
  await retain(join(path,'application.json'),encode(receipt));await sync(path);
  return await observeComplete(c);
 });
}
/** Prepare the exact original PDF_REVIEW source envelope; does not preview or receive Bank data. */
export async function prepareBankPdfReviewSource({directory:path,accountId,acknowledgeBalanceDifference=false,output}={}){
 path=await directory(path);
 return locked(path,async lease=>{
  const c=await context(path,{settleLinks:true});need(await observeComplete(c,{settleLinks:true}),'Apply this exact retained decision before preparing its original Bank source.');
  const source=await pdfSourceInput(c.verified.workingCopy,accountId,{acknowledgeBalanceDifference});
  const raw=Buffer.from(JSON.stringify({source})+'\n','utf8');
  need(raw.length<=24000000,'The complete wrapped original Bank preview exceeds 24,000,000 bytes. Preserve the full working copy; do not omit PDF, extraction or history.');
  lease.assertHeld();const file=await retain(resolve(output),raw);
  const prepared=await prepareBankSource(c.verified.workingCopy,accountId,{acknowledgeBalanceDifference});
  return {output:resolve(output),...file,format:'PDF_REVIEW',workingCopyId:c.verified.workingCopy.id,
   workingRevision:c.verified.workingCopy.revision,accountId,csvSha256:prepared.csvSha256,mappingSha256:prepared.mappingSha256,
   financialReceiving:'SEPARATE_ORIGINAL_BANK_OPERATION'};
 });
}
/** Invoke the maintained PDF CLI on the complete applied copy. It owns its PDF.js task. */
export async function exportBankPdfReviewApplication({directory:path,output,accountId,acknowledgeBalanceDifference=false,
 scale=1.5,textOnly=false,passwordEnv,pdfjsRoot}={}){
 path=await directory(path);
 return locked(path,async lease=>{
  const c=await context(path,{settleLinks:true});need(await observeComplete(c,{settleLinks:true}),'Apply this exact retained decision before exporting its original PDF package.');
  const args=['export','--working-copy',join(path,'applied-working-copy.json'),'--out',resolve(output),'--scale',String(scale)];
  if(accountId)args.push('--account',accountId);
  if(acknowledgeBalanceDifference)args.push('--acknowledge-balance-difference');
  if(textOnly)args.push('--text-only');
  if(passwordEnv)args.push('--password-env',passwordEnv);
  if(pdfjsRoot)args.push('--pdfjs-root',pdfjsRoot);
  lease.assertHeld();return await originalPdfCli(args);
 });
}
function options(args,allowed){
 const out={};for(let i=0;i<args.length;i+=2){need(allowed.includes(args[i])&&!Object.hasOwn(out,args[i])&&args[i+1]!==undefined,'Use documented option/value pairs without duplicates.');out[args[i]]=args[i+1];}return out;
}
function required(v,key){need(typeof v[key]==='string'&&v[key].length,'Supply '+key+'.');return v[key];}
function flag(value){need(value===undefined||value==='true'||value==='false','Boolean options require true or false.');return value==='true';}
const input=async(v,k,limit=PDF_REVIEW_LIMITS.transferBytes)=>(await read(resolve(required(v,k)),limit)).bytes;
const object=async(v,k,limit)=>json(await input(v,k,limit));
const issue=async(v,k='--issue')=>openPdfReviewIssue(bankPdfReviewText(await input(v,k)));
const record=async v=>openPdfReviewRecord(bankPdfReviewText(await input(v,'--record',PDF_REVIEW_LIMITS.recordBytes),PDF_REVIEW_LIMITS.recordBytes));
async function output(v,value,selection={}){
 const path=resolve(required(v,'--out')),bytes=bankPdfReviewBytes(value,selection),selected=await retain(path,bytes);
 return {output:path,...selected};
}
const HELP='Bank named PDF interpretation review through the original PDF engine\n\n'+
'issue --working-copy FILE --id UUID --author NAME --recipient NAME --purpose TEXT --at ISO --out PRIVATE_ISSUE\n'+
'open --issue FILE --id UUID --at ISO --out PRIVATE_RECORD\n'+
'inspect --file FILE\n'+
'edit --record FILE --edit ACTION_JSON --out PRIVATE_RECORD\n'+
'receive-working-copy --record FILE --working-copy FILE --reviewer NAME --comment TEXT --out PRIVATE_RECORD\n'+
'edition --record FILE --id UUID --status draft|submitted --reviewer NAME --comment TEXT --at ISO --expected none|SHA --out PRIVATE_RECORD\n'+
'return --record FILE --edition UUID --out PRIVATE_RETURN\n'+
'working-copy --record FILE --out PRIVATE_WORKING_COPY [--edition UUID]\n'+
'compare --issue FILE --returned FILE --current FILE --out PRIVATE_PREVIEW\n'+
'decide --issue FILE --returned FILE --current FILE --preview FILE --selection JSON --out PRIVATE_DECISION\n'+
'retain --issue FILE --returned FILE --current FILE --decision FILE --dir PRIVATE_APPLICATION\n'+
'inspect-retained --dir PRIVATE_APPLICATION\n'+
'apply --dir PRIVATE_APPLICATION\n'+
'source --dir PRIVATE_APPLICATION --account ID --out PRIVATE_PREVIEW_INPUT [--acknowledge-balance-difference true|false]\n'+
'export --dir PRIVATE_APPLICATION --out NEW_DIRECTORY [--account ID] [--scale NUMBER] [--text-only true|false] [--acknowledge-balance-difference true|false] [--password-env NAME] [--pdfjs-root PATH]\n\n'+
'Files must be private (0600) within existing private (0700) directories. Outputs are create-only.\n'+
'Original issue, full return, current PDF and exact decision are retained before explicit apply.\n'+
'No command posts, matches, closes or receives financial data. source prepares the original Bank input.\n'+
'export invokes the existing full PDF renderer/exporter; actual outputs must be viewed before readiness.\n'+
'Exit 0 successful local operation; 2 error. No hidden retry loop or second native programme.\n';
export async function main(args=process.argv.slice(2)){
 if(!args.length||args.length===1&&['help','--help'].includes(args[0])){process.stdout.write(HELP);return;}
 const [cmd,...rest]=args;let result;
 if(cmd==='issue'){
  const v=options(rest,['--working-copy','--id','--author','--recipient','--purpose','--at','--out']);
  result=await output(v,await issuePdfReview({workingCopy:bankPdfReviewText(await input(v,'--working-copy',PDF_LIMITS.transferBytes),PDF_LIMITS.transferBytes),
   reviewId:required(v,'--id'),author:required(v,'--author'),recipient:required(v,'--recipient'),purpose:required(v,'--purpose'),createdAt:required(v,'--at')}));
 }else if(cmd==='open'){
  const v=options(rest,['--issue','--id','--at','--out']);result=await output(v,await createPdfReviewRecord(await issue(v),{localId:required(v,'--id'),openedAt:required(v,'--at')}),{record:true});
 }else if(cmd==='inspect'){
  const v=options(rest,['--file']);result=await inspectBankPdfReviewBytes(await input(v,'--file',PDF_REVIEW_LIMITS.recordBytes));
 }else if(cmd==='edit'){
  const v=options(rest,['--record','--edit','--out']),edit=exact(await object(v,'--edit'),['action','value','actor','reason']);
  const values=edit.action==='ROWS'?edit.value:edit.action==='PAGE_REVIEW'?[]:[edit.value];
  need(Array.isArray(values)&&values.every(x=>x&&typeof x.id==='string'&&x.id),'Choose and retain every new or existing item ID before the original edit.');
  const original=await record(v),next=await editPdfReviewDraft(original,edit),destination=resolve(required(v,'--out'));
  if(await exists(destination)){
   const retained=(await read(destination,PDF_REVIEW_LIMITS.recordBytes,{allowLinks:true})).bytes,saved=await openPdfReviewRecord(bankPdfReviewText(retained,PDF_REVIEW_LIMITS.recordBytes));
   const at=original.draft.interpretation.history.length;
   need(saved.draft.interpretation.history.length===at+1&&next.draft.interpretation.history.length===at+1,'The original edited record must retain exactly its one original edit operation.');
   next.draft.interpretation.history[at].at=saved.draft.interpretation.history[at].at;
   need(equal(saved,next),'The existing recipient edit output belongs to another complete source or edit request.');
   result={output:destination,...await settle(destination,retained)};
  }else result=await output(v,next,{record:true});
 }else if(cmd==='receive-working-copy'){
  const v=options(rest,['--record','--working-copy','--reviewer','--comment','--out']);
  result=await output(v,await receivePdfWorkingCopy(await record(v),bankPdfReviewText(await input(v,'--working-copy',PDF_LIMITS.transferBytes),PDF_LIMITS.transferBytes),
   {reviewer:required(v,'--reviewer'),comment:required(v,'--comment')}),{record:true});
 }else if(cmd==='edition'){
  const v=options(rest,['--record','--id','--status','--reviewer','--comment','--at','--expected','--out']),expected=required(v,'--expected');
  result=await output(v,await savePdfReviewEdition(await record(v),{editionId:required(v,'--id'),status:required(v,'--status'),reviewer:required(v,'--reviewer'),
   comment:required(v,'--comment'),createdAt:required(v,'--at'),expectedEditionSha256:expected==='none'?null:expected}),{record:true});
 }else if(cmd==='return'||cmd==='working-copy'){
  const v=options(rest,['--record','--edition','--out']),r=await record(v);
  result=await output(v,cmd==='return'?await exportPdfReviewReturn(r,{editionId:required(v,'--edition')}):await pdfReviewWorkingCopy(r,{editionId:v['--edition']}),{workingCopy:cmd==='working-copy'});
 }else if(['compare','decide','retain'].includes(cmd)){
  const allowed=['--issue','--returned','--current',...(cmd==='compare'?['--out']:cmd==='decide'?['--preview','--selection','--out']:['--decision','--dir'])],v=options(rest,allowed);
  const issueBytes=await input(v,'--issue'),returnedBytes=await input(v,'--returned'),currentWorkingCopyBytes=await input(v,'--current',PDF_LIMITS.transferBytes);
  if(cmd==='retain')result=await retainBankPdfReviewApplication({directory:required(v,'--dir'),issueBytes,returnedBytes,currentWorkingCopyBytes,decisionBytes:await input(v,'--decision')});
  else{
   const original=await openPdfReviewIssue(bankPdfReviewText(issueBytes)),returned=await openPdfReviewReturn(bankPdfReviewText(returnedBytes),{issue:original});
   const currentWorkingCopy=bankPdfReviewText(currentWorkingCopyBytes,PDF_LIMITS.transferBytes);
   if(cmd==='compare')result=await output(v,await previewPdfReviewReturn({issue:original,returned,currentWorkingCopy}));
   else{
    const s=exact(await object(v,'--selection'),['choices','decisionId','author','reason','createdAt']);
    need(typeof s.reason==='string'&&s.reason.length<=4000,'The author decision reason must fit the original PDF engine\'s 4000-character limit.');
    const preview=await object(v,'--preview'),destination=resolve(required(v,'--out'));
    if(await exists(destination)){
     const retained=(await read(destination,PDF_REVIEW_LIMITS.transferBytes,{allowLinks:true})).bytes,decision=json(retained);
     need(decision.decisionId===s.decisionId&&decision.author===s.author&&decision.reason===s.reason&&decision.createdAt===s.createdAt&&
      equal(decision.choices,s.choices)&&decision.previewSha256===preview.sha256,'The existing author decision belongs to another selected review request.');
     const actual=await previewPdfReviewReturn({issue:original,returned,currentWorkingCopy});
     need(equal(actual,preview),'The selected comparison changed before decision recovery.');
     await verifyBankPdfReviewApplication({issueBytes,returnedBytes,currentWorkingCopyBytes,decisionBytes:retained});
     result={output:destination,...await settle(destination,retained)};
    }else{
     const decided=await decidePdfReviewReturn({...s,issue:original,returned,currentWorkingCopy,preview});
     result=await output(v,decided.decision);
    }
   }
  }
 }else if(cmd==='inspect-retained'||cmd==='apply'){
  const v=options(rest,['--dir']);result=await (cmd==='apply'?applyBankPdfReviewApplication:inspectBankPdfReviewApplication)({directory:required(v,'--dir')});
 }else if(cmd==='source'){
  const v=options(rest,['--dir','--account','--out','--acknowledge-balance-difference']);
  result=await prepareBankPdfReviewSource({directory:required(v,'--dir'),accountId:required(v,'--account'),output:required(v,'--out'),acknowledgeBalanceDifference:flag(v['--acknowledge-balance-difference'])});
 }else if(cmd==='export'){
  const v=options(rest,['--dir','--out','--account','--scale','--text-only','--acknowledge-balance-difference','--password-env','--pdfjs-root']);
  result=await exportBankPdfReviewApplication({directory:required(v,'--dir'),output:required(v,'--out'),accountId:v['--account'],scale:v['--scale']===undefined?1.5:Number(v['--scale']),
   textOnly:flag(v['--text-only']),acknowledgeBalanceDifference:flag(v['--acknowledge-balance-difference']),passwordEnv:v['--password-env'],pdfjsRoot:v['--pdfjs-root']});
  return result; // The maintained CLI already writes its complete result projection.
 }else need(false,'Choose a documented command; use --help.');
 process.stdout.write(JSON.stringify(result)+'\n');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(error=>{process.stderr.write(JSON.stringify({error:problem(error)})+'\n');process.exitCode=2;});
