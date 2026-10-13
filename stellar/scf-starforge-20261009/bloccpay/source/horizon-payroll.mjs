#!/usr/bin/env node
// MIT. Original company chain review and explicit native correction, with offline custody.
import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {openBloccpayWorkspace} from './lib/workspace.mjs';
import {writeExact,jsonBytes,need,publicError,hash} from './lib/files.mjs';
import {parseSourceJSON} from './lib/source-json.mjs';
import {reviewHorizonPayroll,inspectHorizonPayrollReview,prepareHorizonPayrollChoice,applyHorizonPayrollChoice} from './lib/horizon-payroll-review.mjs';

const HELP=[
 'Bloccpay retained Horizon/payroll review. No provider requests or payments.',
 'node horizon-payroll.mjs review --directory /private/workspace --configuration /private/config.json --workspace-id UUID --selection /private/selection.json --out /private/review.json',
 'node horizon-payroll.mjs report --review /private/review.json --out /private/review.html',
 'node horizon-payroll.mjs choose --review /private/review.json --movement SHA256 --row ROW_ID --actor NAME --reason REASON --request-id ORIGINAL_UUID --out /private/choice.json',
 'node horizon-payroll.mjs apply --directory /private/workspace --configuration /private/config.json --choice /private/choice.json --out /private/result.json',
 'node horizon-payroll.mjs verify --review /private/review.json',
 '',
 'Use actual original programme version, payroll and source IDs. Output files are create-only.',
 'Apply delegates only correction.save to the same original company workspace and retains the complete reviewed source context.',
 'A current review is required for each new choice. Exact completed request replay works after later workspace changes.',
].join('\n')+'\n';
async function privateJSON(filename,max=64*1024*1024){
 const selected=path.resolve(filename),handle=await fs.open(selected,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await handle.stat({bigint:true});
  need(before.isFile()&&before.size<=BigInt(max)&&(before.mode&0o077n)===0n,'PRIVATE_BOUNDED_JSON_REQUIRED');
  const bytes=await handle.readFile(),after=await handle.stat({bigint:true});
  need(bytes.length===Number(before.size)&&before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs,'SOURCE_CHANGED');
  return parseSourceJSON(bytes,{maxBytes:max}).value;
 }finally{await handle.close();}
}
function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
export function horizonPayrollHTML(review){
 inspectHorizonPayrollReview(review);
 const body=review.rows.map(row=>'<tr><td>'+esc(row.status)+'</td><td><code>'+esc(row.operationId)+'</code><br><code>'+esc(row.transactionHash)+'</code></td><td><code>'+esc(row.from)+'</code><br>to <code>'+esc(row.to)+'</code></td><td>'+esc(row.amount)+' '+esc(row.asset?.code)+'<br><code>'+esc(row.asset?.issuer)+'</code></td><td>'+row.candidates.map(c=>esc(c.rowId)+' · '+esc(c.amountRelation)+(c.alreadyLinked?' · original link':'')).join('<br>')+'</td><td>'+esc(JSON.stringify({issues:row.issues,near:row.near}))+'</td></tr>').join('');
 return Buffer.from('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>Original payroll chain review</title><style>body{font:16px/1.55 system-ui;background:#f4f6f7;color:#18232b;margin:0}main{max-width:1440px;margin:auto;padding:28px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:12px;border:1px solid #ccd3d8;text-align:left;vertical-align:top}code{overflow-wrap:anywhere}section{overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px}h1{line-height:1.2}@media(max-width:700px){main{padding:16px}}</style></head><body><main><h1>Original payroll chain review</h1><p>This saved report compares exact retained Horizon operations with the original payroll and its selected memo mapping. It makes no provider request, payment or ledger credit. A candidate needs a separate explicit human choice.</p><p>Workspace <code>'+esc(review.workspaceId)+'</code> · revision '+esc(review.workspaceRevision)+' · review <code>'+esc(review.reviewSha256)+'</code></p><h2>Selected context</h2><pre>'+esc(JSON.stringify({selection:review.selection,connection:review.connection,programme:review.programme.id,payroll:review.payroll.id,summary:review.summary,globalIssues:review.globalIssues},null,2))+'</pre><h2>Retained movements</h2><section><table><thead><tr><th>Review</th><th>Original operation / transaction</th><th>Sender / destination</th><th>Observed amount and exact asset</th><th>Original payroll candidates</th><th>Issues</th></tr></thead><tbody>'+body+'</tbody></table></section><h2>Original payroll mapping issues</h2><pre>'+esc(JSON.stringify(review.mappings.filter(row=>row.issues.length),null,2))+'</pre><h2>Existing native reconciliation</h2><pre>'+esc(JSON.stringify(review.nativeReconciliation,null,2))+'</pre><p>Keep the complete review JSON, original choice and returned native result with this report. Partial and overpaid movements remain visible; this workflow only prepares an exact-amount, unlinked correction. The original native reconciliation retains its own SDP/Bridge and financial semantics.</p></main></body></html>\n');
}
export async function runHorizonPayroll(argv=process.argv.slice(2)){
 const [command='help',...rest]=argv,flags={};
 for(let i=0;i<rest.length;i+=2){
  need(rest[i]?.startsWith('--')&&rest[i+1]!==undefined&&!Object.hasOwn(flags,rest[i].slice(2)),'ARGUMENT_REQUIRED');
  flags[rest[i].slice(2)]=rest[i+1];
 }
 const allowed={review:['directory','configuration','workspace-id','selection','out'],report:['review','out'],
  choose:['review','movement','row','actor','reason','request-id','out'],apply:['directory','configuration','choice','out'],verify:['review']};
 if(command==='help'){process.stdout.write(HELP);return;}
 need(allowed[command]&&Object.keys(flags).every(k=>allowed[command].includes(k))&&allowed[command].every(k=>typeof flags[k]==='string'&&flags[k]),'COMPLETE_COMMAND_ARGUMENTS_REQUIRED');
 let result,body;
 if(['verify','report','choose'].includes(command)){
  const review=inspectHorizonPayrollReview(await privateJSON(flags.review));
  if(command==='verify')result={state:'VERIFIED_OFFLINE',workspaceId:review.workspaceId,reviewSha256:review.reviewSha256,summary:review.summary,providerRequests:0};
  if(command==='report'){body=horizonPayrollHTML(review);result={state:'REPORT_CREATED',reviewSha256:review.reviewSha256,providerRequests:0};}
  if(command==='choose'){result=prepareHorizonPayrollChoice(review,{requestId:flags['request-id'],movementId:flags.movement,rowId:flags.row,actor:flags.actor,reason:flags.reason});body=jsonBytes(result);}
 }else{
  const directory=path.resolve(flags.directory),database=await fs.lstat(path.join(directory,'workspace.sqlite'));
  need(database.isFile()&&!database.isSymbolicLink()&&await fs.realpath(directory)===directory,'ORIGINAL_COMPANY_WORKSPACE_REQUIRED');
  const config=await privateJSON(flags.configuration,2*1024*1024);
  const choice=command==='apply'?await privateJSON(flags.choice):null;
  const selected=command==='review'?await privateJSON(flags.selection,2*1024*1024):null;
  const workspace=await openBloccpayWorkspace({directory,connections:config.connections??{},name:config.name,
   sourceDirectory:path.dirname(fileURLToPath(import.meta.url)),runtimeDirectory:config.runtimeDirectory,expectedManifestSha256:config.expectedManifestSha256});
  try{
   need(workspace.describe().workspace.id===(choice?.workspaceId??flags['workspace-id']),'ORIGINAL_COMPANY_WORKSPACE_ID_MISMATCH');
   result=command==='review'?await reviewHorizonPayroll(workspace,selected):await applyHorizonPayrollChoice(workspace,choice);
   body=jsonBytes(result);
  }finally{await workspace.close();}
 }
 if(body){const descriptor=await writeExact(path.resolve(flags.out),body);process.stdout.write(JSON.stringify({state:command==='apply'?'ORIGINAL_CORRECTION_RETAINED':'CREATED',file:{path:path.resolve(flags.out),...descriptor},bytes:body.length,sha256:hash(body),providerRequests:0})+'\n');}
 else process.stdout.write(JSON.stringify(result,null,2)+'\n');
 return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)runHorizonPayroll().catch(error=>{
 process.stderr.write(JSON.stringify({error:publicError(error)})+'\n');process.exitCode=1;
});
