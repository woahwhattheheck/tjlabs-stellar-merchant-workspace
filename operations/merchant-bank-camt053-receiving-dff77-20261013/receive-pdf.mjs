#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Continue the original installed Bank case with the original PDF and full reviewed source.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(value,message)=>{if(!value)throw new Error(message);};
const json=value=>JSON.stringify(value,null,2)+'\n';
const keys=new Set(['installed-source','accounting','workspace-id','sources-sha256','out','pdf','working-copy','browser-module','browser-executable','scale','password-env']);
const flags=new Set(['receive','prepare-only','acknowledge-balance-difference']);
const opts={};
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i],key=arg.startsWith('--')?arg.slice(2):'';
 need((keys.has(key)||flags.has(key))&&!Object.hasOwn(opts,key),'Unknown or repeated argument: '+arg);
 if(flags.has(key))opts[key]=true;
 else{need(process.argv[i+1]&&!process.argv[i+1].startsWith('--'),'Missing value for '+arg);opts[key]=process.argv[++i];}
}
for(const key of ['installed-source','accounting','workspace-id','sources-sha256','out','pdf'])need(opts[key],'Pass --'+key+' for the original retained case.');
need(!opts.receive||opts['working-copy'],'Receiving requires the complete source-bound reviewed working copy.');
need(!opts.receive||!opts['prepare-only'],'Choose browser receiving or preparation only.');
need(opts['prepare-only']||opts['browser-module'],'Pass the existing local Playwright module via --browser-module, or explicitly choose --prepare-only.');
const scale=opts.scale===undefined?1.5:Number(opts.scale);
need(Number.isFinite(scale)&&scale>=0.1&&scale<=4,'Choose --scale from0.1 to4.');
const sourceRoot=path.resolve(opts['installed-source']),directory=path.resolve(opts.accounting),out=path.resolve(opts.out);
const bank=path.join(sourceRoot,'stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements');
async function ordinary(file,max){
 const absolute=path.resolve(file),stat=await fs.lstat(absolute);
 need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max,'Choose a complete ordinary file within the product size limit: '+absolute);
 return{path:absolute,bytes:await fs.readFile(absolute)};
}
let originalPassword;
if(opts['password-env']){
 need(/^[A-Za-z_][A-Za-z0-9_]*$/.test(opts['password-env']),'Choose an environment variable name for the original PDF password.');
 originalPassword=process.env[opts['password-env']];need(typeof originalPassword==='string'&&originalPassword,'The selected PDF password environment variable is empty.');
}
const original=await ordinary(opts.pdf,16000000);
const reviewed=opts['working-copy']?await ordinary(opts['working-copy'],192*1024*1024):null;
const [{main:pdfMain},model,{createReceivablesServer},{receiveBankPdfBrowser}]=await Promise.all([
 import(pathToFileURL(path.join(bank,'bank-pdf/cli.mjs')).href),
 import(pathToFileURL(path.join(bank,'bank-pdf/model.mjs')).href),
 import(pathToFileURL(path.join(bank,'../server.mjs')).href),
 import(pathToFileURL(path.join(bank,'bank-pdf/receive-browser.mjs')).href)
]);
let incoming=null;
if(reviewed){
 incoming=await model.openWorkingCopy(reviewed.bytes.toString('utf8'));
 need(incoming.file.sha256===sha(original.bytes),'The reviewed working copy belongs to a different original PDF.');
 if(!opts['prepare-only'])need(opts['acknowledge-balance-difference']||!incoming.accounts.some(account=>{const review=model.accountReview(incoming,account.id);return review.receivable&&review.problems.length;}),'Inspect the original balance discrepancy and explicitly pass --acknowledge-balance-difference to retain it in Bank review.');
}
let playwright=null;
if(!opts['prepare-only']){
 const entry=await ordinary(opts['browser-module'],16*1024*1024);
 playwright=await import(pathToFileURL(entry.path).href);
 playwright=playwright.chromium?playwright:playwright.default;
 need(typeof playwright?.chromium?.launch==='function','The existing browser module must expose the original Playwright chromium.launch.');
}
await fs.mkdir(out,{mode:0o700});
const result={schema:'stellar-forge.bank-pdf-case-receiving.v1',operation:'SCF-BANK-CAMT053-SOURCE-DFF77-20261013',
 startedAt:new Date().toISOString(),completed:false,prepared:false,sourceRoot,directory,
 workspaceId:opts['workspace-id'],sourcesSha256:opts['sources-sha256'],
 original:{name:path.basename(original.path),bytes:original.bytes.length,sha256:sha(original.bytes)},
 phases:[],retainedImports:[],browserMode:opts['prepare-only']?'PREPARATION_ONLY':'ORIGINAL_INSTALLED_PRODUCT',
 receivingRequested:opts.receive===true,renderedInspection:'PENDING_OPERATOR_VIEW'};
async function save(name,value){
 const target=path.join(out,name);await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
 await fs.writeFile(target,Buffer.isBuffer(value)?value:typeof value==='string'?value:json(value),{mode:0o600});
}
const checkpoint=()=>save('PDF_RECEIVING_RESULT.json',result);
async function phase(name,fn){const value=await fn();result.phases.push({name,at:new Date().toISOString(),...value});await checkpoint();return value;}
let service=null,browser=null;
try{
 await phase('extract-and-render-complete-original',async()=>{
  const args=['extract','--input',original.path,'--out',path.join(out,'original-extraction'),'--scale',String(scale)];
  if(opts['password-env'])args.push('--password-env',opts['password-env']);
  const manifest=await pdfMain(args);
  need(manifest.original.sha256===result.original.sha256,'The native extraction changed original source bytes.');
  need(manifest.renderedPages.length===manifest.extraction.pages,'Render every original page before continuing.');
  result.extraction=manifest;return{pages:manifest.extraction.pages,textItems:manifest.extraction.textItems,renderedPages:manifest.renderedPages.length};
 });
 if(incoming)await phase('preserve-complete-reviewed-source-and-account-exports',async()=>{
  await pdfMain(['export','--working-copy',reviewed.path,'--out',path.join(out,'reviewed-working-copy'),'--text-only']);
  const accounts=[];
  for(let i=0;i<incoming.accounts.length;i++){
   const account=incoming.accounts[i],review=model.accountReview(incoming,account.id);
   const item={id:account.id,accountId:account.accountId,review};accounts.push(item);
   if(review.receivable&&(!review.problems.length||opts['acknowledge-balance-difference'])){
    // The caller explicitly chooses whether to carry the original printed discrepancy.
    const selected=path.join(out,'reviewed-account-'+String(i+1).padStart(3,'0'));
    const args=['export','--working-copy',reviewed.path,'--out',selected,'--account',account.id,'--text-only'];
    if(opts['acknowledge-balance-difference'])args.push('--acknowledge-balance-difference');
    item.export=await pdfMain(args);
   }
  }
  result.accountReviews=accounts;return{accounts:accounts.length,rows:incoming.rows.length,history:incoming.history.length};
 });
 result.prepared=true;await checkpoint();
 if(!opts['prepare-only']){
  await phase('open-the-original-account-and-product',async()=>{
   service=await createReceivablesServer({directory,expectedWorkspaceId:opts['workspace-id'],expectedSourcesSha256:opts['sources-sha256'],port:0});
   const before=await service.bankStatements.state();
   need(before.workspaceId===opts['workspace-id']&&before.sourcesSha256===opts['sources-sha256'],'The retained case binding changed.');
   await save('ACCOUNT_BEFORE_PDF.json',before);result.revisionBefore=before.revision;
   browser=await playwright.chromium.launch({headless:true,...(opts['browser-executable']?{executablePath:path.resolve(opts['browser-executable'])}:{})});
   return{workspaceId:before.workspaceId,revision:before.revision,url:service.url};
  });
  await phase('operate-all-pages-review-download-and-cold-browser',async()=>{
   const report=await receiveBankPdfBrowser({browser,baseUrl:service.url,originalPdfPath:original.path,
    reviewedWorkingCopyPath:reviewed?.path??null,outDirectory:path.join(out,'browser'),
    actor:'Original Bank PDF receiving operator',reviewNote:'Continue the same original accounting case with every issuer PDF page and explicit source-bound interpretation.',receive:opts.receive===true,acknowledgeBalanceDifference:opts['acknowledge-balance-difference']===true,password:originalPassword});
   need(report.completed,'Complete the original browser course before closing this receiving edition.');
   result.browser=report;return{pages:report.originalPages,textItems:report.originalTextItems,screenshots:report.screenshots.length,downloads:report.downloads.length};
  });
  await phase('retain-original-financial-source-and-complete-rows',async()=>{
   const state=await service.bankStatements.state();await save('ACCOUNT_AFTER_PDF.json',state);
   const workingFile=path.join(out,'browser','final-complete-working-copy.json');
   const work=await model.openWorkingCopy(await fs.readFile(workingFile,'utf8'));
   need(work.file.sha256===result.original.sha256,'Browser continuation changed the original source.');
   const allImports=service.bankStatements.data().imports.filter(item=>item.file.sha256===result.original.sha256);
   for(const imported of allImports){
    const detail=await service.bankStatements.importDetail(imported.id),base='retained-imports/'+imported.id;
    await save(base+'/detail.json',detail);
    for(const name of Object.keys(detail.import.files)){
     const file=await service.bankStatements.importFile(imported.id,name);
     await save(base+'/'+(name==='original'?'original.pdf':name),file.bytes);
     if(name==='original')need(sha(file.bytes)===result.original.sha256,'Retained financial source changed its original PDF.');
    }
    const rows=[];
    for(let offset=0;;){
     const page=await service.bankStatements.transactions({accountId:imported.accountId,offset,limit:100});
     rows.push(...page.items);offset+=page.items.length;
     if(offset>=page.total)break;
     need(page.items.length>0,'Continue every original account row.');
    }
    await save(base+'/complete-account-transactions.json',rows);
    result.retainedImports.push({id:imported.id,accountId:imported.accountId,originalSha256:imported.file.sha256,rows:rows.length,reviewSha256:imported.reviewSha256});
   }
   result.revisionAfter=state.revision;
   if(!opts.receive)need(state.revision===result.revisionBefore,'Preview-only receiving must preserve the financial revision.');
   if(opts.receive&&result.accountReviews?.some(item=>item.review.receivable))need(result.retainedImports.length>0,'Retain the reviewed PDF through the original financial writer.');
   return{imports:result.retainedImports.length,revision:state.revision};
  });
  await browser.close();browser=null;await service.close();service=null;
  await phase('cold-reopen-the-same-financial-case',async()=>{
   service=await createReceivablesServer({directory,expectedWorkspaceId:opts['workspace-id'],expectedSourcesSha256:opts['sources-sha256'],port:0});
   const cold=await service.bankStatements.state();await save('ACCOUNT_COLD_AFTER_PDF.json',cold);
   need(cold.revision===result.revisionAfter,'Cold reopening changed the financial revision.');
   for(const item of result.retainedImports){
    const originalFile=await service.bankStatements.importFile(item.id,'original');
    need(sha(originalFile.bytes)===result.original.sha256,'Cold reopening lost original PDF bytes.');
    await save('retained-imports/'+item.id+'/cold-detail.json',await service.bankStatements.importDetail(item.id));
   }
   return{workspaceId:cold.workspaceId,revision:cold.revision,imports:result.retainedImports.length};
  });
  result.completed=true;
 }
 result.finishedAt=new Date().toISOString();await checkpoint();
}catch(error){result.error={name:error.name,code:error.code,message:error.message,stack:error.stack};await checkpoint();process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(service)await service.close();
 const files=[];
 async function walk(dir){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const target=path.join(dir,entry.name);
   if(entry.isDirectory())await walk(target);
   else if(entry.isFile()){const bytes=await fs.readFile(target);files.push({path:path.relative(out,target).split(path.sep).join('/'),bytes:bytes.length,sha256:sha(bytes)});}
  }
 }
 await walk(out);await save('FILES.json',{schema:'stellar-forge.bank-pdf-case-files.v1',files});
 process.stdout.write(json({operation:result.operation,completed:result.completed,prepared:result.prepared,result:path.join(out,'PDF_RECEIVING_RESULT.json'),files:path.join(out,'FILES.json'),error:result.error??null}));
}
