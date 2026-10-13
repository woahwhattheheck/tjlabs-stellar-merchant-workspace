// MIT. Original FRED transaction journal, QCEW source editions and recurring county reports.
import { resolve, join } from 'node:path';
import { readPrivateJson } from '../../routescan/quota.mjs';
import { need, clone, canonical, period, periodOrdinal } from './model.mjs';
import { createQcewProfile, validateQcewProfile } from './profile.mjs';
import { createQcewCaptureContext, sealQcewIntakeWithContext, inspectQcewCapture, storeQcewCapture,
  readQcewCapture, readQcewCaptureWithContext } from './source.mjs';
import { buildQcewReport, validateQcewReport, qcewReportRowSelection } from './calculate.mjs';
import { prepareQcewFiles, readQcewFiles, validateQcewFilePackage, qcewMemberBytes, qcewEditionDirectory } from './files.mjs';
import { mutableQcewState, validateQcewState, qcewProjectSummary } from './state.mjs';
import { readFredProject, getFredCapture, transactFredProject } from '../project.mjs';
import { normalizeQcewMerchantTerms, qcewPublicationId, qcewPublicationRecord,
  validateQcewMerchantPlan } from './publication-model.mjs';
const hash=/^[a-f0-9]{64}$/;
export async function importQcewSource({directory,id,expectedRevision,capture,inputDirectory,sourceContext=null,selections=[]}={}) {
  if(inputDirectory) {
    need(!capture&&sourceContext===null,'Choose a complete original intake or its sealed source edition.');
    const sealed=await sealQcewIntakeWithContext(inputDirectory,{selections});
    capture=sealed.capture;sourceContext=sealed.sourceContext;
  } else sourceContext=sourceContext??createQcewCaptureContext(capture,{selections});
  const model=inspectQcewCapture(capture,{context:sourceContext});
  return transactFredProject(directory,{id,expectedRevision,kind:'qcew.import',payload:{captureSha256:capture.captureSha256}},
    async(state,root)=>{
      const qcew=mutableQcewState(state);
      await storeQcewCapture(root,capture,{context:sourceContext});
      if(!qcew.captures.some(item=>item.id===capture.captureSha256))qcew.captures.push({
        id:capture.captureSha256,captureSha256:capture.captureSha256,summary:clone(model.sourceSummary),importedAt:state.pending.startedAt
      });
      qcew.selectedCapture=capture.captureSha256;
      validateQcewState(state);
      return {captureSha256:capture.captureSha256,source:clone(model.sourceSummary)};
    });
}
export async function saveQcewProfile({directory,id,expectedRevision,profile}={}) {
  profile=profile?.schema?validateQcewProfile(profile):createQcewProfile(profile);
  return transactFredProject(directory,{id,expectedRevision,kind:'qcew.profile',payload:{profileId:profile.id}},
    async state=>{
      const qcew=mutableQcewState(state);
      if(!qcew.profiles.some(item=>item.id===profile.id))qcew.profiles.push(clone(profile));
      qcew.selectedProfile=profile.id;
      validateQcewState(state);
      return {profile:clone(profile)};
    });
}
export async function getQcewEdition(directory,editionId,{validateSources=false,sourceContext=null}={}) {
  directory=resolve(directory);
  const state=await readFredProject(directory),qcew=validateQcewState(state);
  editionId=editionId??qcew?.selectedEdition;
  need(hash.test(editionId),'Choose a saved county report edition.');
  const entry=qcew?.editions.find(item=>item.id===editionId);
  need(entry,'The county report edition is not in this project.','QCEW_EDITION_NOT_FOUND',404);
  const packet=await readQcewFiles(directory,entry.id);
  let previousReport=null;
  if(entry.previousEditionId) {
    const previous=await readQcewFiles(directory,entry.previousEditionId);
    previousReport=validateQcewFilePackage(previous,{rebuildText:false}).report;
  }
  const result=validateQcewFilePackage(packet,{previousReport,expectedEdition:entry});
  need(result.report.profile.id===entry.profileId&&result.report.source.captureSha256===entry.captureSha256&&
    result.report.cpi.captureSha256===entry.cpiCaptureSha256&&canonical(result.report.period)===canonical(entry.period),
    'The saved report model differs from the project’s original source selection.');
  if(validateSources) {
    const selection=qcewReportRowSelection(result.report.profile,entry.period);
    const [source,cpiCapture]=await Promise.all([
      sourceContext?readQcewCapture(directory,entry.captureSha256,{context:sourceContext}):
        readQcewCaptureWithContext(directory,entry.captureSha256,{selections:[selection]}),
      getFredCapture(directory,entry.cpiCaptureSha256)
    ]);
    sourceContext=sourceContext??source.sourceContext;
    validateQcewReport(result.report,{capture:source.capture,cpiCapture,sourceContext});
  }
  return {...result,entry:clone(entry),directory:qcewEditionDirectory(directory,entry.id)};
}
export async function produceQcewEdition({directory,id,expectedRevision,captureSha256,cpiCaptureSha256,profileId,
  period:reportPeriod,previousEditionId=null,browserPath=null,sourceContext=null}={}) {
  reportPeriod=period(reportPeriod);
  need([captureSha256,cpiCaptureSha256,profileId].every(value=>hash.test(value))&&
    (previousEditionId===null||hash.test(previousEditionId)),'Choose original sources and a saved production profile.');
  const payload={captureSha256,cpiCaptureSha256,profileId,period:reportPeriod,previousEditionId,pdf:Boolean(browserPath)};
  return transactFredProject(directory,{id,expectedRevision,kind:'qcew.produce',payload},async(state,root)=>{
    const qcew=mutableQcewState(state),profile=qcew.profiles.find(item=>item.id===profileId);
    need(profile&&qcew.captures.some(item=>item.id===captureSha256)&&state.captures.some(item=>item.id===cpiCaptureSha256),
      'Produce this edition from the original sources and profile already retained in this FRED project.');
    const selection=qcewReportRowSelection(profile,reportPeriod);
    const [source,cpiCapture]=await Promise.all([
      sourceContext?readQcewCapture(root,captureSha256,{context:sourceContext}):
        readQcewCaptureWithContext(root,captureSha256,{selections:[selection]}),
      getFredCapture(root,cpiCaptureSha256)
    ]);
    sourceContext=sourceContext??source.sourceContext;
    let previousEdition=null;
    if(previousEditionId) {
      const previousEntry=qcew.editions.find(item=>item.id===previousEditionId);
      need(previousEntry&&previousEntry.profileId===profileId&&periodOrdinal(previousEntry.period)<=periodOrdinal(reportPeriod),
        'Choose an earlier edition from the same saved production profile.');
      const packet=await readQcewFiles(root,previousEditionId);
      previousEdition=validateQcewFilePackage(packet,{expectedEdition:previousEntry,rebuildText:false});
    }
    const report=buildQcewReport({capture:source.capture,cpiCapture,profile,period:reportPeriod,sourceContext});
    const files=await prepareQcewFiles(root,{report,previousEdition,browserPath});
    const record={id:files.manifest.editionId,reportId:report.id,manifestSha256:files.manifest.manifestSha256,
      captureSha256,cpiCaptureSha256,profileId,period:reportPeriod,previousEditionId,formats:clone(files.manifest.formats),
      createdAt:state.pending.startedAt};
    const existing=qcew.editions.find(item=>item.id===record.id);
    if(existing) {
      need(existing.reportId===record.reportId&&existing.manifestSha256===record.manifestSha256&&existing.previousEditionId===previousEditionId,
        'This report identity retains another complete edition.','QCEW_REPORT_CONFLICT',409);
    } else qcew.editions.push(record);
    qcew.selectedCapture=captureSha256;qcew.selectedProfile=profileId;qcew.selectedEdition=record.id;
    validateQcewState(state);
    return {edition:clone(existing??record),directory:qcewEditionDirectory(root,record.id),
      availability:clone(report.availability),files:clone(files.manifest.files)};
  });
}
export async function downloadQcewMember({directory,editionId,name}={}) {
  const edition=await getQcewEdition(directory,editionId);
  const file=edition.files.find(item=>item.name===name);
  need(file,'The selected report member is not retained.','QCEW_MEMBER_NOT_FOUND',404);
  return {name,contentType:file.contentType,bytes:qcewMemberBytes(file),sha256:file.sha256};
}
export async function viewQcewProject({directory}={}) {
  const state=await readFredProject(resolve(directory));
  return {projectId:state.id,title:state.title,revision:state.revision,pending:state.pending?clone(state.pending):null,
    qcew:qcewProjectSummary(state)};
}

export async function publishQcewEdition({directory,id,expectedRevision,editionId,origin,path='/county-reports',payment}={}) {
  need(hash.test(editionId??''),'Choose the complete saved county edition to publish.');
  const terms=normalizeQcewMerchantTerms({origin,path,payment}),publicationId=qcewPublicationId({editionId,...terms});
  const {compileHttpSellerOffer}=await import('../../seller.mjs');
  compileHttpSellerOffer({method:'GET',url:terms.origin+terms.path+'/'+publicationId+'/files/report-package.json.gz',
    serviceName:'County economic reports',description:'Complete saved county report',payment:terms.payment});
  return transactFredProject(directory,{id,expectedRevision,kind:'qcew.publish',payload:{editionId,...terms}},async(state,root)=>{
    const qcew=mutableQcewState(state),entry=qcew.editions.find(item=>item.id===editionId);
    need(entry,'The selected county edition is not retained in this project.','QCEW_EDITION_NOT_FOUND',404);
    const editions=[],seen=new Set();
    let next=entry;
    while(next) {
      need(!seen.has(next.id),'The retained county predecessor chain repeats an edition.');seen.add(next.id);
      editions.unshift(await readQcewFiles(root,next.id));
      if(next.previousEditionId===null)break;
      next=qcew.editions.find(item=>item.id===next.previousEditionId);
      need(next,'The publication lost a complete original predecessor.');
    }
    const {prepareQcewMerchant,qcewPublicationDirectory}=await import('./merchant.mjs');
    const publication=await prepareQcewMerchant({directory:qcewPublicationDirectory(root,publicationId),editions,...terms});
    qcew.publications??=[];
    const retained=qcew.publications.find(item=>item.id===publicationId);
    const record=retained??qcewPublicationRecord(publication.plan,state.pending.startedAt);
    validateQcewMerchantPlan(publication.plan,{record,edition:entry});
    if(!retained)qcew.publications.push(record);
    qcew.selectedPublication=publicationId;
    validateQcewState(state);
    return {publicationId,editionId,reportId:entry.reportId,manifestSha256:entry.manifestSha256,
      planSha256:publication.plan.planSha256,deliverySha256:publication.plan.deliverySha256,
      resource:publication.plan.resource,downloads:clone(publication.plan.downloads)};
  });
}
export async function selectQcewPublication(directory,publicationId) {
  need(hash.test(publicationId??''),'Choose a retained county publication.');
  const state=await readFredProject(directory),qcew=validateQcewState(state);
  const record=qcew?.publications?.find(item=>item.id===publicationId);
  need(record,'This county publication does not belong to the selected project.','QCEW_PUBLICATION_NOT_FOUND',404);
  const root=join(resolve(directory),'qcew','publications',publicationId);
  const plan=await readPrivateJson(join(root,'merchant-plan.json'),256*1024);
  validateQcewMerchantPlan(plan,{record,edition:qcew.editions.find(item=>item.id===record.editionId)});
  return root;
}
