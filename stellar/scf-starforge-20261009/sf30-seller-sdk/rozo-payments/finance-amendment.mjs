// Following financial editions use the original report, source and closed-period engines.
import { assert, fields, text, sha, canonical, jsonDigest, clone } from './model.mjs';
import { inspectRozoFinanceSource } from './finance-source.mjs';
import { rozoFinanceMovements, validateRozoBuyerSelection } from './finance-projection.mjs';

export const AMENDMENT_SCHEMA='stellar-forge.rozo-finance-amendment.v1';
const need=(ok,code,message)=>assert(ok,code,message,409);
export function compareRozoFinancialSources(beforeInput,afterInput){
  const before=inspectRozoFinanceSource(beforeInput),after=inspectRozoFinanceSource(afterInput);
  need(before.originId===after.originId&&before.profileId===after.profileId&&before.sourceId===after.sourceId,
    'FINANCE_AMENDMENT_SOURCE','Compare editions of the same original ROZO source and profile.');
  const a=rozoFinanceMovements(before.source),b=rozoFinanceMovements(after.source);
  const old=new Map(a.movements.map(x=>[x.id,x])),next=new Map(b.movements.map(x=>[x.id,x]));
  const rows=[...new Set([...old.keys(),...next.keys()])].sort().map(id=>{
    const previous=old.get(id)??null,current=next.get(id)??null;
    const status=!previous?'added':!current?'removed':previous.basisSha256===current.basisSha256?'unchanged':'changed';
    const sameAsset=previous?.amount&&current?.amount&&canonical(previous.amount.asset)===canonical(current.amount.asset);
    return {movementId:id,status,previous,current,amountDelta:sameAsset&&previous.amountObserved&&current.amountObserved?
      (BigInt(current.amount.units)-BigInt(previous.amount.units)).toString():null,
      deltaAsset:sameAsset?clone(current.amount.asset):null,
      changedFields:previous&&current?Object.keys({...previous,...current}).filter(key=>canonical(previous[key]??null)!==canonical(current[key]??null)).sort():[]};
  });
  return {schema:'stellar-forge.rozo-finance-source-comparison.v1',sourceId:a.sourceId,originId:a.originId,profileId:a.profileId,
    before:{reportId:before.reportId,reportSha256:before.reportSha256,sourceSha256:before.sha256,reportVersion:before.reportVersion},
    after:{reportId:after.reportId,reportSha256:after.reportSha256,sourceSha256:after.sha256,reportVersion:after.reportVersion},
    counts:Object.fromEntries(['added','changed','removed','unchanged'].map(kind=>[kind,rows.filter(r=>r.status===kind).length])),rows};
}
async function buyerSourceItems(finance,binding,sourceId){
  if(!sourceId)return [];
  const rows=[];let offset=0,total=null;
  for(;;){
    const page=await finance.read({target:'buyer',binding,path:'/api/expenses?source='+encodeURIComponent(sourceId)+'&offset='+offset+'&limit=200'});
    need(Array.isArray(page.items)&&Number.isSafeInteger(page.total)&&page.total>=0,'FINANCE_AMENDMENT_ITEMS','Read the complete original Buyer source items.');
    if(total===null)total=page.total;
    need(page.total===total,'FINANCE_AMENDMENT_CHANGED','The original Buyer source changed during its full item read.');
    rows.push(...page.items);
    if(page.next===null||page.next===undefined&&rows.length>=total){
      need(rows.length===total&&new Set(rows.map(row=>row.id)).size===rows.length,'FINANCE_AMENDMENT_ITEMS','Retain every unique original Buyer item and coding head.');
      return rows;
    }
    need(Number.isSafeInteger(page.next)&&page.next>offset,'FINANCE_AMENDMENT_ITEMS','The original Buyer item cursor did not advance.');
    offset=page.next;
  }
}
export async function previewRozoFinanceAmendment(finance,value){
  fields(value,['binding','buyerBinding','report','source','purchaseSelection','actor'],'financial correction preview');
  fields(value.source,['name','provenance','dataContext'],'financial source metadata');
  text(value.actor,'operator',240);
  const current=await finance.read({target:'accounting',binding:value.binding});
  need(!current.pending&&!current.reopenRequired,'FINANCE_AMENDMENT_PENDING','Finish the original prepared Accounting request before reviewing its next edition.');
  const selected=finance.capture(value.report),source=current.sources.find(x=>x.id===selected.source.sourceId);
  need(source?.acceptedCaptureId,'FINANCE_AMENDMENT_INITIAL','Retain and review an initial source before preparing its correction.');
  const capture=current.captures.find(x=>x.id===source.acceptedCaptureId);
  need(capture?.status==='ACCEPTED','FINANCE_AMENDMENT_INITIAL','The current accepted source edition is absent.');
  const file=await finance.file({target:'accounting-capture',binding:value.binding,id:capture.id});
  const comparison=compareRozoFinancialSources(file.bytes,selected.raw);
  need(comparison.before.sourceSha256!==comparison.after.sourceSha256,'FINANCE_AMENDMENT_UNCHANGED','Select a different frozen source edition; use the original plan to resume unchanged work.');
  const changed=new Set(comparison.rows.filter(r=>r.status!=='unchanged').map(r=>r.movementId));
  const closes=[];
  for(const c of current.closes.filter(row=>row.status==='CLOSED')){
    const originalClose=await finance.file({target:'accounting-close',binding:value.binding,id:c.id});
    const issued=JSON.parse(originalClose.bytes);
    const sourceIncluded=issued.close.sourceCaptures.some(s=>s.sourceId===source.id);
    if(!sourceIncluded)continue;
    closes.push({id:c.id,sha256:c.sha256,bytes:c.bytes,period:clone(c.period),sequence:c.sequence,
      affectedMovementIds:c.movementIds.filter(id=>changed.has(id)),sourceIncluded});
  }
  const preview=await finance.preview({kind:'accounting',binding:value.binding,report:value.report,input:value.source,actor:value.actor});
  let buyer=null;
  if(value.buyerBinding){
    need(value.purchaseSelection,'FINANCE_AMENDMENT_SELECTION','Review an explicit following purchase selection; ownership is never copied automatically.');
    const normalized=validateRozoBuyerSelection(selected.source,value.purchaseSelection).selection;
    const state=await finance.buyerRead(value.buyerBinding,'/api/state');
    const intake=await finance.preview({kind:'buyer',binding:value.buyerBinding,report:value.report,
      input:{...value.source,selection:normalized},actor:value.actor});
    const sourceId=intake.preview.existing_source_id,currentCapture=intake.preview.current_capture;
    let original=null,closed=[];
    if(currentCapture){
      const originalFile=await finance.file({target:'buyer',binding:value.buyerBinding,path:'/api/captures/'+currentCapture+'/rozo-original',name:'original-rozo-source.json'});
      original=compareRozoFinancialSources(originalFile.bytes,selected.raw);
      for(const period of state.periods.filter(p=>p.state==='CLOSED')){
        const issued=await finance.buyerRead(value.buyerBinding,'/api/closes/'+period.latest_close);
        if([...(issued.allocations??[]),...(issued.credit_allocations??[]),...(issued.issues??[])].some(row=>row.source_id===sourceId)||
          issued.native_captures?.some(c=>c.source_id===sourceId)){
          closed.push({periodId:period.id,closeId:period.latest_close,sequence:issued.sequence,
            contextSha256:issued.context_sha256,issuedSha256:jsonDigest(issued),period:clone(period)});
        }
      }
    }
    const items=await buyerSourceItems(finance,value.buyerBinding,sourceId);
    buyer={binding:clone(value.buyerBinding),revision:state.revision,sourceId,currentCapture,selection:normalized,items,
      intake:clone(intake.preview),comparison:original,closedPeriods:closed};
  }
  const stable=await finance.read({target:'accounting',binding:value.binding});
  need(stable.revision===current.revision&&preview.preview.revision===current.revision&&preview.preview.parentId===capture.id,
    'FINANCE_AMENDMENT_CHANGED','The original Accounting state changed while reading the full correction impact.');
  if(buyer){const stableBuyer=await finance.buyerRead(value.buyerBinding,'/api/state');
    need(stableBuyer.revision===buyer.revision,'FINANCE_AMENDMENT_CHANGED','The original Buyer state changed while reading its issued periods.');}
  const body={schema:AMENDMENT_SCHEMA,workspaceId:finance.workspace.meta().workspaceId,originId:finance.workspace.meta().originId,
    report:clone(value.report),source:clone(value.source),actor:value.actor,
    accounting:{binding:clone(value.binding),revision:current.revision,parentCapture:clone(capture),
      source:clone(source),intake:clone(preview.preview),closes,comparison},buyer};
  return {...body,previewSha256:jsonDigest(body)};
}
export function validateAmendmentReview(value,preview){
  fields(value,['previewSha256','reason','merchant','buyer'],'financial amendment review');
  sha(value.previewSha256);text(value.reason,'correction reason',6000);
  need(value.previewSha256===preview.previewSha256,'FINANCE_AMENDMENT_STALE','Review the current complete source impact before saving this following plan.');
  fields(value.merchant,['closeId','expectedSha256','reason'],'merchant period correction');
  sha(value.merchant.expectedSha256);text(value.merchant.reason,'merchant reopening reason',6000);
  const merchant=preview.accounting.closes.find(c=>c.id===value.merchant.closeId&&c.sha256===value.merchant.expectedSha256);
  need(merchant,'FINANCE_AMENDMENT_CLOSE','Select the original issued merchant period and its exact immutable source.');
  let buyer=null;
  if(value.buyer){
    fields(value.buyer,['periodId','closeId','issuedSha256','reason'],'buyer period correction');
    sha(value.buyer.issuedSha256);text(value.buyer.reason,'Buyer reopening reason',4000);
    buyer=preview.buyer?.closedPeriods.find(c=>c.periodId===value.buyer.periodId&&c.closeId===value.buyer.closeId&&c.issuedSha256===value.buyer.issuedSha256);
    need(buyer,'FINANCE_AMENDMENT_BUYER_CLOSE','Select the original closed Buyer period and complete issued edition.');
  }else need(!preview.buyer,'FINANCE_AMENDMENT_BUYER_CLOSE','Choose the explicitly selected Buyer period for this same following programme.');
  return {merchant,buyer,otherMerchantCloses:preview.accounting.closes.filter(c=>c.id!==merchant.id),
    otherBuyerCloses:preview.buyer?.closedPeriods.filter(c=>c.closeId!==buyer?.closeId)??[]};
}
