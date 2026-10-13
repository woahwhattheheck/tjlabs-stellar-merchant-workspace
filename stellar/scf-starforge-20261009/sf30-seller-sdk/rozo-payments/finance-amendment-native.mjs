// Complete predecessor custody and explicit following-period decisions.
import { readFileSync, mkdirSync, existsSync, copyFileSync, constants, openSync, fsyncSync, closeSync, linkSync, unlinkSync, lstatSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assert, fields, text, sha, clone, canonical, digest, jsonDigest } from './model.mjs';
import { hashOriginalFile, putOriginal } from './delivery.mjs';
import { originalJSON, retainFinance } from './finance-native-support.mjs';
import { inspectRozoFinanceSource } from './finance-source.mjs';
import { previewRozoFinanceAmendment, validateAmendmentReview } from './finance-amendment.mjs';

export const AMENDMENT_OPERATION='ROZO-MERCHANT-SETTLEMENT-FINANCE-AMENDMENT-20261013';
const SCHEMA='stellar-forge.rozo-finance-predecessor.v1';
const MEMBERS=['FINANCE_PLAN.json','FINANCE_RESULT.json','FINANCE_RECEIVING.json','FINANCE_PACKAGE_RECEIPT.json',
  'FINAL_FINANCE_STATE.json','files/original-rozo-finance-source.json','cold-finance/FINANCE_RECEIVED.json','Rozo_Finance_Complete.zip'];
const need=(ok,code,message)=>assert(ok,code,message,409);
const identity=path=>({path,...hashOriginalFile(path)});
function checkedJSON(directory,name,rows){const raw=readFileSync(join(directory,name));const row=rows.find(r=>r.path===name);need(row&&row.bytes===raw.length&&row.sha256===digest(raw),'FINANCE_PREDECESSOR_CHANGED','The original predecessor metadata changed.');return JSON.parse(raw);}
export function inspectFinancePredecessor(directory){
  directory=resolve(directory);
  const rows=MEMBERS.map(path=>({path,...hashOriginalFile(join(directory,path))}));
  const plan=checkedJSON(directory,'FINANCE_PLAN.json',rows),result=checkedJSON(directory,'FINANCE_RESULT.json',rows),
    receiving=checkedJSON(directory,'FINANCE_RECEIVING.json',rows),receipt=checkedJSON(directory,'FINANCE_PACKAGE_RECEIPT.json',rows),
    final=checkedJSON(directory,'FINAL_FINANCE_STATE.json',rows),cold=checkedJSON(directory,'cold-finance/FINANCE_RECEIVED.json',rows);
  const planRow=rows.find(r=>r.path==='FINANCE_PLAN.json'),archive=rows.find(r=>r.path==='Rozo_Finance_Complete.zip');
  need(plan.schema==='stellar-forge.rozo-finance-plan.v1'&&result.schema==='stellar-forge.rozo-finance-native-result.v1'&&
    result.operationId===plan.operationId&&result.planSha256===planRow.sha256&&result.workspaceId===plan.workspaceId&&
    receiving.operationId===plan.operationId&&receiving.planSha256===planRow.sha256&&
    receipt.schema==='stellar-forge.rozo-finance-package.v1'&&receipt.operationId===plan.operationId&&
    receipt.sha256===archive.sha256&&receipt.bytes===archive.bytes&&
    cold.operationId===plan.operationId&&cold.planSha256===planRow.sha256&&
    canonical(result.receiving)===canonical(cold),
    'FINANCE_PREDECESSOR_INCOMPLETE','Retain the completed first programme, its independent receiver and exact complete archive.');
  const original=inspectRozoFinanceSource(readFileSync(join(directory,'files/original-rozo-finance-source.json')));
  need(original.reportId===plan.report.reportId&&original.reportSha256===plan.report.expectedReportSha256,
    'FINANCE_PREDECESSOR_REPORT','The predecessor source belongs to another saved report.');
  const merchant=result.accountant.merchant,closed=final.accounting.finance.closes.find(c=>c.id===merchant.source.id);
  need(closed?.status==='CLOSED'&&closed.sha256===merchant.source.sha256,'FINANCE_PREDECESSOR_CLOSE','Retain the original merchant close and typed accountant handoff.');
  let buyer=null;
  if(result.buyer){
    const accountant=result.accountant.buyer;
    const period=final.buyer.state.periods.find(p=>p.latest_close===accountant.source.id);
    need(period?.state==='CLOSED','FINANCE_PREDECESSOR_BUYER','Retain the original closed Buyer period.');
    const path='files/original-buyer-source.json',raw=readFileSync(join(directory,path));
    need(digest(raw)===accountant.source.sha256,'FINANCE_PREDECESSOR_BUYER','The original issued Buyer source bytes differ.');
    rows.push({path,bytes:raw.length,sha256:digest(raw)});
    const source=JSON.parse(raw);
    need(source.workspaceId===result.buyer.binding.workspaceId&&source.issued.id===accountant.source.id,
      'FINANCE_PREDECESSOR_BUYER','The issued Buyer source belongs to another original close.');
    buyer={binding:clone(result.buyer.binding),period:clone(period),closeId:source.issued.id,
      issuedSha256:jsonDigest(source.issued),sourceSha256:digest(raw),accountant:clone(accountant)};
  }
  const body={schema:SCHEMA,operationId:plan.operationId,workspaceId:plan.workspaceId,originId:plan.originId,
    planSha256:planRow.sha256,report:clone(plan.report),source:clone(plan.source),
    accounting:{binding:clone(receiving.accounting.binding),close:clone(closed),accountant:clone(merchant)},
    buyer,files:rows.sort((a,b)=>a.path.localeCompare(b.path))};
  return {directory,plan,result,final,identity:{...body,sha256:jsonDigest(body)}};
}
export async function prepareFinanceAmendmentPlan(service,{previousDirectory,report,actor,source,purchaseSelection=null,operationId=AMENDMENT_OPERATION}){
  const previous=inspectFinancePredecessor(previousDirectory),m=service.workspace.meta();
  need(previous.identity.workspaceId===m.workspaceId&&previous.identity.originId===m.originId&&operationId!==previous.identity.operationId,
    'FINANCE_AMENDMENT_WORKSPACE','Continue the same active received workspace with an explicit following operation ID.');
  const native=await service.finance.state(),binding=native.accounting?.binding;
  need(canonical(binding)===canonical(previous.identity.accounting.binding),'FINANCE_AMENDMENT_OWNER','Use the original configured Accounting owner.');
  if(previous.identity.buyer)need(canonical(native.buyer?.binding)===canonical(previous.identity.buyer.binding),
    'FINANCE_AMENDMENT_OWNER','Continue the original configured Buyer owner.');
  const preview=await previewRozoFinanceAmendment(service.finance,{binding,buyerBinding:previous.identity.buyer?.binding??null,
    report,source,purchaseSelection,actor});
  const priorSource=previous.identity.files.find(f=>f.path==='files/original-rozo-finance-source.json');
  need(preview.accounting.parentCapture.fileSha256===priorSource.sha256,
    'FINANCE_AMENDMENT_PARENT','The accepted source changed after the selected completed programme. Select its actual completed successor before amending again.');
  const original=previous.identity.accounting.close;
  need(preview.accounting.closes.some(c=>c.id===original.id&&c.sha256===original.sha256),
    'FINANCE_AMENDMENT_CLOSE','The selected original merchant period is no longer the current issued close.');
  const {prepareRozoFinancePlan}=await import('./native-finance.mjs');
  const prepared=prepareRozoFinancePlan(service,{report,actor,source,operationId}),plan=prepared.plan;
  plan.accounting.binding=binding;
  const period=original.period;
  const currentDefinition=native.accounting.finance.periods.definitions.find(d=>d.id===period.periodId);
  need(currentDefinition,'FINANCE_AMENDMENT_PERIOD','Retain the original current period definition.');
  plan.accounting.period={id:period.periodId,expectedVersion:currentDefinition.versions.at(-1).version,name:period.name,from:period.from,until:period.until,note:''};
  const rows=native.accounting.finance.rows;
  const originallyRecognised=new Set(original.movementIds);
  plan.accounting.codings=plan.accounting.codings.filter(coding=>{
    const old=rows.find(r=>r.movement.id===coding.movementId)?.coding,date=old?.recognitionDate??coding.recognitionDate;
    return originallyRecognised.has(coding.movementId)||(date&&Date.parse(date+'T00:00:00.000Z')>=Date.parse(period.from)&&Date.parse(date+'T00:00:00.000Z')<Date.parse(period.until));
  });
  for(const coding of plan.accounting.codings){
    const old=rows.find(r=>r.movement.id===coding.movementId)?.coding;
    coding.expectedVersion=old?.version??0;
    if(old){coding.recognitionDate=old.recognitionDate;coding.allocations=old.allocations.map(({line,...value})=>clone(value));}
    coding.reason=null;coding.providerEvidenceAcknowledged=false;
  }
  const priorBuyer=previous.identity.buyer;
  if(priorBuyer){
    const originalSource=previous.final.buyer.state.sources.find(row=>row.id===preview.buyer.sourceId);
    need(originalSource?.current_capture===preview.buyer.currentCapture&&
      preview.buyer.comparison?.before.sourceSha256===priorSource.sha256,
      'FINANCE_AMENDMENT_BUYER_PARENT','The accepted Buyer source changed after the selected completed programme. Select its actual completed successor.');
    need(preview.buyer.closedPeriods.some(row=>row.closeId===priorBuyer.closeId&&row.issuedSha256===priorBuyer.issuedSha256),
      'FINANCE_AMENDMENT_BUYER_CLOSE','The original Buyer close is no longer the current complete issued edition.');
    const period=priorBuyer.period;
    plan.buyer={binding:priorBuyer.binding,purchaseSelection:clone(preview.buyer.selection),
      period:{id:period.id,name:period.name,from_day:period.from_day,through_day:period.through_day},
      centers:[],codings:[],dispositions:[],reviewReason:null};
  }
  plan.amendment={schema:'stellar-forge.rozo-finance-amendment-plan.v1',predecessor:previous.identity,
    preview:clone(preview),review:{previewSha256:preview.previewSha256,reason:null,
      merchant:{closeId:original.id,expectedSha256:original.sha256,reason:null},
      buyer:priorBuyer?{periodId:priorBuyer.period.id,closeId:priorBuyer.closeId,issuedSha256:priorBuyer.issuedSha256,reason:null}:null}};
  return {...prepared,plan,context:{preview,previous:previous.identity,
    accounting:native.accounting,buyer:native.buyer,originalPlan:previous.plan}};
}
function copyOriginal(from,to,row){
  const check=path=>{const st=lstatSync(path),got=hashOriginalFile(path);need(st.isFile()&&!st.isSymbolicLink()&&got.bytes===row.bytes&&got.sha256===row.sha256,
    'FINANCE_PREDECESSOR_CHANGED','The exact original predecessor file differs: '+row.path);};
  check(from);mkdirSync(dirname(to),{recursive:true,mode:0o700});if(existsSync(to)){check(to);return;}
  const temp=to+'.original-'+randomUUID();
  try{
    copyFileSync(from,temp,constants.COPYFILE_EXCL);check(temp);check(from);
    const fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
    try{linkSync(temp,to);}catch(error){if(error.code!=='EEXIST')throw error;check(to);}
    const parent=openSync(dirname(to),'r');try{fsyncSync(parent);}finally{closeSync(parent);}
  }finally{if(existsSync(temp))unlinkSync(temp);}
}
export function retainFinancePredecessor(directory,plan,previousDirectory){
  const retained=plan.amendment.predecessor,{sha256,...body}=retained;
  need(retained.schema===SCHEMA&&jsonDigest(body)===sha256&&retained.operationId!==plan.operationId,
    'FINANCE_AMENDMENT_PREDECESSOR','Retain the complete exact original predecessor selection.');
  const target=join(resolve(directory),'previous-finance');
  const complete=retained.files.every(row=>existsSync(join(target,row.path)));
  if(!complete){
    need(previousDirectory,'FINANCE_AMENDMENT_PREDECESSOR','Supply the completed original --previous-finance-directory for its first custody copy.');
    const from=resolve(previousDirectory),to=resolve(directory),rel=relative(from,to),reverse=relative(to,from);
    need(from!==to&&(rel.startsWith('..')||isAbsolute(rel))&&(reverse.startsWith('..')||isAbsolute(reverse)),
      'FINANCE_AMENDMENT_DIRECTORY','Use separate sibling operation directories, preserving the complete predecessor.');
    const checked=inspectFinancePredecessor(from);
    need(canonical(checked.identity)===canonical(retained),'FINANCE_AMENDMENT_PREDECESSOR','The selected complete predecessor changed after plan preparation.');
    for(const row of retained.files)copyOriginal(join(from,row.path),join(target,row.path),row);
  }
  const checked=inspectFinancePredecessor(target);
  need(canonical(checked.identity)===canonical(retained),'FINANCE_AMENDMENT_PREDECESSOR','The full retained predecessor does not match the reviewed plan.');
  return checked;
}
export async function startFinanceAmendment(service,directory,plan,{previousDirectory,journal}){
  fields(plan.amendment,['schema','predecessor','preview','review'],'following financial plan');
  need(plan.amendment.schema==='stellar-forge.rozo-finance-amendment-plan.v1','FINANCE_AMENDMENT_PLAN','Use the full original following-edition plan.');
  const retained=retainFinancePredecessor(directory,plan,previousDirectory);
  const selected=validateAmendmentReview(plan.amendment.review,plan.amendment.preview);
  need(selected.merchant.id===retained.identity.accounting.close.id&&
    (selected.buyer?.closeId??null)===(retained.identity.buyer?.closeId??null),
    'FINANCE_AMENDMENT_SCOPE','This programme corrects its selected completed merchant and Buyer periods.');
  need(plan.accounting.period?.id===selected.merchant.period.periodId&&
    (!selected.buyer||plan.buyer?.period?.id===selected.buyer.periodId),
    'FINANCE_AMENDMENT_PERIOD','The following closes must belong to their original selected periods.');
  await journal.step('amendment.review',async()=>{
    const actual=await previewRozoFinanceAmendment(service.finance,{
      binding:plan.accounting.binding,buyerBinding:plan.buyer?.binding??null,report:plan.report,source:plan.source,
      purchaseSelection:plan.buyer?.purchaseSelection??null,actor:plan.actor});
    need(canonical(actual)===canonical(plan.amendment.preview),'FINANCE_AMENDMENT_STALE','The accepted source, closed periods or explicit selection changed after the reviewed impact.');
    retainFinance(join(directory,'AMENDMENT_SOURCE_IMPACT.json'),actual);
    retainFinance(join(directory,'AMENDMENT_PREDECESSOR.json'),retained.identity);
    return {previewSha256:actual.previewSha256,predecessorSha256:retained.identity.sha256,review:clone(plan.amendment.review),
      otherMerchantCloses:selected.otherMerchantCloses,otherBuyerCloses:selected.otherBuyerCloses};
  });
  return {previous:retained.identity,selected};
}
export function verifyAmendedAccounting(plan,accounting,descriptor){
  if(!plan.amendment)return null;
  const before=plan.amendment.predecessor,old=accounting.rozoFinance.closes.find(c=>c.id===before.accounting.close.id),
    next=accounting.rozoFinance.closes.find(c=>c.id===descriptor.accountant.merchant.source.id);
  need(old?.status==='REOPENED'&&old.sha256===before.accounting.close.sha256&&
    next?.status==='CLOSED'&&next.previousCloseId===old.id&&next.sequence===old.sequence+1&&
    next.period.periodId===old.period.periodId,'FINANCE_AMENDMENT_RECEIVE','The original close and following close chain must remain complete.');
  const originals=[before.accounting.accountant,...(before.buyer?[before.buyer.accountant]:[])];
  for(const original of originals){
    const handoff=accounting.accountantHandoffs.find(h=>h.id===original.handoffId);
    need(handoff&&handoff.revisions.some(r=>r.id===original.revisionId),
      'FINANCE_AMENDMENT_RECEIVE','Retain each first merchant/Buyer accountant handoff and its original reviewed return.');
  }
  const priorHandoff=accounting.accountantHandoffs.find(h=>h.id===before.accounting.accountant.handoffId);
  return {predecessorOperationId:before.operationId,predecessorSha256:before.sha256,
    originalMerchantClose:old.id,followingMerchantClose:next.id,originalAccountantHandoff:priorHandoff.id,
    scopedMerchantPeriod:old.period.periodId};
}
