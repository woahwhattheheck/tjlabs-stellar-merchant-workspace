// MIT. QCEW joins the original complete FRED project bundle and receiving transaction.
import { need, canonical, clone } from './model.mjs';
import { QCEW_PUBLICATION_EXTENSION, QCEW_PUBLICATION_MAX_BYTES, validateQcewMerchantPlan } from './publication-model.mjs';
import { decodeQcewReportDelivery } from './delivery.mjs';
import { QCEW_EXTENSION, validateQcewState, qcewStatePresent } from './state.mjs';
import { createQcewCaptureContext, readQcewCapture, readQcewCaptureWithContext, inspectQcewCapture, storeQcewCapture, sha256 } from './source.mjs';
import { readQcewFiles, validateQcewFilePackage, receiveQcewFiles } from './files.mjs';
import { validateQcewReport, qcewReportRowSelection } from './calculate.mjs';
function operationContexts(value) {
  const contexts=value??new Map();
  need(contexts instanceof Map,'Use this operation’s QCEW source contexts keyed by original capture SHA.');
  return contexts;
}
function selectionsFor(inventory,captureSha256) {
  return inventory.editions.filter(entry=>entry.captureSha256===captureSha256).map(entry=>{
    const profile=inventory.profiles.find(item=>item.id===entry.profileId);
    need(profile,'The saved report lost its complete original production profile.');
    return qcewReportRowSelection(profile,entry.period);
  });
}
export async function exportQcewExtension(directory,state,fredCaptures,{sourceContexts=null}={}) {
  if(!qcewStatePresent(state))return null;
  sourceContexts=operationContexts(sourceContexts);
  const inventory=validateQcewState(state),captures=[],editions=[];
  for(const entry of inventory.captures) {
    let context=sourceContexts.get(entry.id),source;
    if(context) source=await readQcewCapture(directory,entry.id,{context});
    else {
      source=await readQcewCaptureWithContext(directory,entry.id,{selections:selectionsFor(inventory,entry.id)});
      context=source.sourceContext;sourceContexts.set(entry.id,context);
    }
    captures.push(source.capture);
  }
  for(const entry of inventory.editions)editions.push(await readQcewFiles(directory,entry.id));
  const publications=[];
  if(inventory.publications?.length) {
    const {readQcewMerchant,qcewPublicationDirectory}=await import('./merchant.mjs');
    for(const record of inventory.publications) {
      const merchant=await readQcewMerchant(qcewPublicationDirectory(directory,record.id));
      validateQcewMerchantPlan(merchant.plan,{record,edition:inventory.editions.find(item=>item.id===record.editionId)});
      publications.push({plan:clone(merchant.plan),delivery:{encoding:'base64',bytes:merchant.deliveryBytes.length,
        sha256:sha256(merchant.deliveryBytes),body:merchant.deliveryBytes.toString('base64')}});
    }
  }
  const extension={schema:publications.length?QCEW_PUBLICATION_EXTENSION:QCEW_EXTENSION,captures,editions,
    ...(publications.length?{publications}:{})};
  validateQcewExtension(extension,state,fredCaptures,{sourceContexts});
  return extension;
}
export function validateQcewExtension(extension,state,fredCaptures,{sourceContexts=null}={}) {
  const inventory=validateQcewState(state),present=qcewStatePresent(state);
  if(!present) {need(extension===null||extension===undefined,'An unbound QCEW extension is not part of this project.');return null;}
  sourceContexts=operationContexts(sourceContexts);
  const publicationRecords=inventory.publications??[];
  need(extension?.schema===(publicationRecords.length?QCEW_PUBLICATION_EXTENSION:QCEW_EXTENSION)&&
    (publicationRecords.length?Array.isArray(extension.publications)&&extension.publications.length===publicationRecords.length:
      extension.publications===undefined)&&Array.isArray(extension.captures)&&Array.isArray(extension.editions)&&
    extension.captures.length===inventory.captures.length&&extension.editions.length===inventory.editions.length,
    'The complete QCEW original-source/report extension is missing.');
  const captures=new Map(),editions=new Map(),cpiCaptures=new Map(fredCaptures.map(item=>[item.captureSha256,item]));
  for(const capture of extension.captures) {
    const entry=inventory.captures.find(item=>item.id===capture.captureSha256);
    need(entry&&!captures.has(capture.captureSha256),'The original QCEW source inventory differs from the retained project.');
    let context=sourceContexts.get(capture.captureSha256);
    if(!context) {
      context=createQcewCaptureContext(capture,{selections:selectionsFor(inventory,capture.captureSha256)});
      sourceContexts.set(capture.captureSha256,context);
    }
    const model=inspectQcewCapture(capture,{context});
    need(canonical(entry.summary)===canonical(model.sourceSummary),
      'The original QCEW source inventory differs from the retained project.');
    captures.set(capture.captureSha256,capture);
  }
  const packets=new Map();
  for(const packet of extension.editions) {
    const id=packet?.manifest?.editionId;
    need(typeof id==='string'&&!packets.has(id),'The complete QCEW report inventory repeats a saved edition.');
    packets.set(id,packet);
  }
  for(const entry of inventory.editions) {
    const packet=packets.get(entry.id),capture=captures.get(entry.captureSha256),cpiCapture=cpiCaptures.get(entry.cpiCaptureSha256);
    need(packet&&capture&&cpiCapture,'The original report lost its complete source or files.');
    const previousReport=entry.previousEditionId?editions.get(entry.previousEditionId)?.report:null;
    need(!entry.previousEditionId||previousReport,'The complete predecessor report is missing.');
    const checked=validateQcewFilePackage(packet,{previousReport,expectedEdition:entry});
    const profile=inventory.profiles.find(item=>item.id===entry.profileId);
    need(profile&&canonical(checked.report.profile)===canonical(profile)&&
      checked.report.source.captureSha256===entry.captureSha256&&checked.report.cpi.captureSha256===entry.cpiCaptureSha256&&
      canonical(checked.report.period)===canonical(entry.period),'The saved county edition differs from its original source/profile selection.');
    validateQcewReport(checked.report,{capture,cpiCapture,sourceContext:sourceContexts.get(entry.captureSha256)});
    editions.set(entry.id,checked);
  }
  const publications=new Map();
  for(const transfer of extension.publications??[]) {
    const plan=transfer?.plan,record=publicationRecords.find(item=>item.id===plan?.publicationId);
    need(record&&!publications.has(record.id),'The original county publication inventory changed.');
    validateQcewMerchantPlan(plan,{record,edition:inventory.editions.find(item=>item.id===record.editionId)});
    const file=transfer.delivery;
    need(file?.encoding==='base64'&&typeof file.body==='string'&&Number.isSafeInteger(file.bytes)&&
      file.bytes>0&&file.bytes<=QCEW_PUBLICATION_MAX_BYTES,'Retain the complete original paid report package.');
    const bytes=Buffer.from(file.body,'base64');
    need(bytes.length===file.bytes&&bytes.toString('base64')===file.body&&sha256(bytes)===file.sha256&&
      plan.downloads.some(item=>item.path==='report-package.json.gz'&&item.bytes===file.bytes&&item.sha256===file.sha256),
      'The original paid report package bytes changed.');
    const delivery=decodeQcewReportDelivery(bytes);
    need(delivery.delivery.editionId===record.editionId&&delivery.delivery.deliverySha256===record.deliverySha256&&
      delivery.editions.every(item=>{
        const original=editions.get(item.manifest.editionId);
        return original&&canonical({manifest:original.manifest,files:original.files})===
          canonical({manifest:item.manifest,files:item.files});
      }),'The paid report package differs from the original project editions.');
    publications.set(record.id,{plan,bytes,editions:delivery.editions});
  }
  return {captures,editions,sourceContexts,publications};
}
export async function receiveQcewExtension(directory,extension,state,fredCaptures,{sourceContexts=null}={}) {
  const verified=validateQcewExtension(extension,state,fredCaptures,{sourceContexts});
  if(!verified)return null;
  const inventory=validateQcewState(state);
  for(const capture of verified.captures.values())
    await storeQcewCapture(directory,capture,{context:verified.sourceContexts.get(capture.captureSha256)});
  for(const entry of inventory.editions) {
    const complete=verified.editions.get(entry.id);
    await receiveQcewFiles(directory,complete,{
      report:complete.report,previousReport:entry.previousEditionId?verified.editions.get(entry.previousEditionId).report:null,expectedEdition:entry
    });
  }
  if(verified.publications.size) {
    const {prepareQcewMerchant,qcewPublicationDirectory}=await import('./merchant.mjs');
    for(const record of inventory.publications) {
      const transfer=verified.publications.get(record.id),plan=transfer.plan;
      const merchant=await prepareQcewMerchant({directory:qcewPublicationDirectory(directory,record.id),
        editions:transfer.editions,origin:plan.origin,path:plan.path,payment:plan.payment,originalDeliveryBytes:transfer.bytes});
      need(canonical(merchant.plan)===canonical(plan),'The original county merchant changed during complete project receiving.');
    }
  }
  return {captures:inventory.captures.length,profiles:inventory.profiles.length,editions:inventory.editions.length,
    publications:verified.publications.size};
}
