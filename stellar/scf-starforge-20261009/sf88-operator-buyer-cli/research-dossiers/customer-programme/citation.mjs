// MIT. Customer-selected Citation receiving on the original dossier and review operations.
import {join} from 'node:path';
import {normalizeDoi} from '../../../sf30-seller-sdk/crossref/metadata.mjs';
import {citationReviewInput} from '../citation-updates.mjs';
import {inspectSourceBundle} from '../source-bundles.mjs';
import {key,need,object,same,step,dossierList,requireRevision,section,noticePages,
  retain,exists,value,directory,digest} from './retention.mjs';

async function originalDossier(client,selection,root){
  return step(root,'dossier',async()=>{
    const inventory=await dossierList(client);
    if(selection.mode==='existing'){
      const metadata=await requireRevision(client,selection.id,selection.expected_revision);
      return {selection,inventory,metadata};
    }
    return {selection,inventory};
  },async request=>{
    if(request.selection.mode==='existing'){
      const metadata=await client.metadata(request.selection.id,{revision:request.selection.expected_revision});
      need(same(metadata,request.metadata),'CUSTOMER_ORIGINAL_DOSSIER_CHANGED');
      return {id:metadata.id,revision:metadata.revision,original:metadata,created:false};
    }
    const dispatched=join(root,'dossier','dispatched.json'),current=await dossierList(client);
    if(await exists(dispatched)){
      const intent=await value(dispatched);
      need(same(intent.selection,request.selection),'CUSTOMER_CREATE_DOSSIER_SELECTION_CHANGED');
      const old=new Set(intent.inventory.items.map(row=>row.id)),candidates=[];
      for(const row of current.items.filter(row=>!old.has(row.id))){
        const initial=await client.metadata(row.id,{revision:1});
        if(initial.title===request.selection.title&&initial.description===request.selection.description)candidates.push(initial);
      }
      need(candidates.length===1,'CUSTOMER_CREATE_DOSSIER_RECONCILIATION_REQUIRED');
      return {id:candidates[0].id,revision:1,original:candidates[0],created:true,recovered:true};
    }
    // Only an already dispatched operation can reconcile a lost create reply.
    // Capture the inventory immediately before this original native request.
    const old=new Set(current.items.map(row=>row.id));
    await retain(dispatched,{selection:request.selection,inventory:current});
    const result=await client.createDossier({title:request.selection.title,description:request.selection.description});
    const initial=await client.metadata(result.id,{revision:1});
    need(initial.title===request.selection.title&&initial.description===request.selection.description&&
      !old.has(initial.id),'CUSTOMER_CREATE_DOSSIER_RESULT_CHANGED');
    return {id:initial.id,revision:1,original:initial,created:true,recovered:false};
  });
}
async function question(client,dossierId,choice,revision,root){
  return step(root,'question-'+key(choice.key),async()=>{
    const before=await requireRevision(client,dossierId,revision);
    if(choice.id!==undefined){
      need(before.questions.some(row=>row.id===choice.id),'CUSTOMER_EXISTING_QUESTION_MISSING');
      return {choice,before};
    }
    return {choice,before};
  },async request=>{
    if(request.choice.id!==undefined){
      const original=await client.metadata(dossierId,{revision:request.before.revision});
      const selected=original.questions.find(row=>row.id===request.choice.id);
      need(selected&&same(original,request.before),'CUSTOMER_EXISTING_QUESTION_CHANGED');
      return {key:request.choice.key,id:selected.id,revision:original.revision,created:false};
    }
    const current=await client.metadata(dossierId);
    if(current.revision===request.before.revision)
      await client.addQuestion(dossierId,{text:request.choice.text,expectedRevision:request.before.revision});
    else need(current.revision>request.before.revision,'CUSTOMER_QUESTION_REVISION_REGRESSED');
    const original=await client.metadata(dossierId,{revision:request.before.revision+1});
    const old=new Set(request.before.questions.map(row=>row.id)),added=original.questions.filter(row=>!old.has(row.id));
    need(added.length===1&&added[0].text===request.choice.text&&
      original.questions.length===old.size+1&&request.before.questions.every(row=>
        original.questions.some(saved=>saved.id===row.id&&same(saved,row))),'CUSTOMER_QUESTION_RECONCILIATION_REQUIRED');
    return {key:request.choice.key,id:added[0].id,revision:original.revision,created:true};
  });
}
function matchesEdition(row,request){
  return row.questionId===request.questionId&&row.provider===request.provider&&
    row.raw?.sha256===request.sha256&&row.raw?.bytes===request.bytes&&
    (request.provider==='source-bundle'?row.origin?.mode==='LOCAL_SOURCE_BUNDLE':row.origin===null);
}
async function sourceImport(client,dossierId,choice,document,questionId,revision,root){
  return step(root,'import-'+key(choice.key),async()=>{
    const before=await requireRevision(client,dossierId,revision);
    return {key:choice.key,questionId,provider:choice.provider,label:choice.label,sourceReference:choice.source_reference,
      documentKey:choice.document_key,bytes:document.bytes,sha256:document.sha256,before};
  },async request=>{
    need(document.bytes===request.bytes&&document.sha256===request.sha256&&digest(document.original)===request.sha256,
      'CUSTOMER_IMPORT_SOURCE_CHANGED');
    const beforeMatch=request.before.editions.filter(row=>matchesEdition(row,request));
    need(beforeMatch.length<=1,'CUSTOMER_IMPORT_AMBIGUOUS');
    if(beforeMatch.length===1)return {key:request.key,edition:beforeMatch[0],revision:request.before.revision,reused:true};
    let metadata=await client.metadata(dossierId),matched=metadata.editions.filter(row=>matchesEdition(row,request));
    need(matched.length<=1,'CUSTOMER_IMPORT_AMBIGUOUS');
    if(!matched.length){
      need(metadata.revision===request.before.revision,'CUSTOMER_IMPORT_REVISION_CHANGED');
      if(request.provider==='source-bundle'){
        const inspected=inspectSourceBundle(document.original);
        await client.receiveSourceBundleBytes(dossierId,{questionId:request.questionId,bytes:document.original,
          expectedBundleSha256:inspected.preview.bundleSha256,expectedRevision:request.before.revision});
      }else{
        await client.receiveResearchBytes(dossierId,{questionId:request.questionId,label:request.label,provider:request.provider,
          bytes:document.original,sourceReference:request.sourceReference,expectedRevision:request.before.revision});
      }
      metadata=await client.metadata(dossierId);matched=metadata.editions.filter(row=>matchesEdition(row,request));
    }
    need(matched.length===1,'CUSTOMER_IMPORT_RECONCILIATION_REQUIRED');
    const original=await client.metadata(dossierId,{revision:request.before.revision+1});
    need(original.editions.some(row=>same(row,matched[0])),'CUSTOMER_IMPORT_REVISION_CHANGED');
    return {key:request.key,edition:matched[0],revision:original.revision,reused:false};
  });
}
export async function receiveCustomerSources({client,selection,documents,directory:root}){
  await directory(root);
  const dossier=await originalDossier(client,selection.dossier,root),dossierId=dossier.id;
  let revision=dossier.revision;const questionIds={},questions=[],imports=[];
  for(const choice of selection.questions){
    const result=await question(client,dossierId,choice,revision,root);
    questionIds[choice.key]=result.id;questions.push(result);revision=result.revision;
  }
  for(const choice of selection.imports){
    const result=await sourceImport(client,dossierId,choice,documents.get(choice.document_key),
      questionIds[choice.question_key],revision,root);
    imports.push(result);revision=result.revision;
  }
  const metadata=await client.metadata(dossierId,{revision}),sources=await section(client,dossierId,'sources',revision);
  const bindings={dossier:{dossierId}},occurrences={},findings={};
  for(const row of questions)bindings['question.'+row.key]={dossierId,questionId:row.id};
  for(const row of imports)bindings['import.'+row.key]={dossierId,questionId:row.edition.questionId,editionId:row.edition.id};
  for(const selected of selection.occurrences){
    const imported=imports.find(row=>row.key===selected.import_key),edition=imported.edition;
    let sourceKey=selected.source_key;
    if(edition.provider==='source-bundle'){
      const index=edition.origin.sourceKeys.indexOf(sourceKey);
      need(index>=0,'CUSTOMER_SOURCE_BUNDLE_CONTEXT_MISSING');sourceKey=String(index);
    }
    need(/^(0|[1-9][0-9]{0,8})$/.test(sourceKey),'CUSTOMER_ORIGINAL_SOURCE_ROW_REQUIRED');
    const matches=[];
    for(const source of sources)for(const citation of source.citations)
      if(citation.editionId===edition.id&&citation.key===sourceKey)matches.push({source,citation});
    need(matches.length===1,'CUSTOMER_OCCURRENCE_RECONCILIATION_REQUIRED');
    const {source,citation}=matches[0];
    const bound={dossierId,questionId:citation.questionId,editionId:citation.editionId,occurrenceId:citation.occurrenceId,
      sourceId:source.id,key:citation.key,doi:source.doi??null,citationLocator:selected.citation_locator};
    occurrences[selected.key]=bound;bindings['occurrence.'+selected.key]={dossierId,questionId:bound.questionId,
      editionId:bound.editionId,occurrenceId:bound.occurrenceId};
  }
  for(const selected of selection.findings){
    const id=selected.native_id??imports.find(row=>row.key===selected.import_key)?.edition.origin?.findingIds
      ?.find(row=>row.key===selected.source_key)?.id;
    const finding=metadata.findings.find(row=>row.id===id);
    need(finding,'CUSTOMER_FINDING_RECONCILIATION_REQUIRED');
    const bound={dossierId,questionId:finding.questionId,findingId:finding.id,occurrenceIds:finding.occurrenceIds};
    findings[selected.key]=bound;bindings['finding.'+selected.key]={dossierId,questionId:bound.questionId,findingId:bound.findingId};
  }
  const result={schema:'sf88.research-customer-source-receiving.v1',dossierId,revision,dossier,questionIds,questions,imports,
    occurrences,findings,bindings,metadata};
  await retain(join(root,'source-receiving.json'),result);return result;
}
function occurrence(choice,mapping){
  const value=choice.occurrence_key!==undefined?mapping.occurrences[choice.occurrence_key]?.occurrenceId:choice.occurrence_id;
  need(/^o_[a-f0-9]{64}$/.test(value??''),'CUSTOMER_REVIEW_OCCURRENCE_REQUIRED');return value;
}
function finding(choice,mapping){
  const value=choice.finding_key!==undefined?mapping.findings[choice.finding_key]?.findingId:choice.finding_id;
  need(/^f_[a-f0-9-]{36}$/.test(value??''),'CUSTOMER_REVIEW_FINDING_REQUIRED');return value;
}
function selectNotice(choice,rows){
  const matches=rows.filter(row=>choice.id?row.noticeId===choice.id:
    row.noticeDoi===normalizeDoi(choice.notice_doi)&&row.targetDoi===normalizeDoi(choice.target_doi)&&row.type===choice.type);
  need(matches.length===1,'CUSTOMER_REGISTERED_NOTICE_SELECTION_INVALID');return matches[0];
}
export async function receiveCustomerCitationReviews({client,selection,mapping,expectedRevision,directory:root}){
  await directory(root);let revision=expectedRevision;const reviews=[];
  const selectedQuestions=new Set(Object.values(mapping.questionIds));
  for(const choice of selection.reviews){
    const saved=await step(root,'review-'+key(choice.key),async()=>{
      const metadata=await requireRevision(client,mapping.dossierId,revision);
      const page=await noticePages(client,mapping.dossierId,revision),chosen=selectNotice(choice.notice,page.items);
      const {detail}=await client.citationUpdates(mapping.dossierId,{noticeId:chosen.noticeId,revision});
      if(choice.expected_fingerprint!==undefined)need(choice.expected_fingerprint===detail.fingerprint,'CUSTOMER_NOTICE_REVIEW_CHANGED');
      const evidenceChanges=choice.evidence_changes.map(row=>({occurrenceId:occurrence(row,mapping),
        selected:row.selected,classification:row.classification,note:row.note??''}));
      const findingChanges=choice.finding_changes.map(row=>({id:finding(row,mapping),title:row.title,text:row.text,
        occurrenceIds:row.occurrence_keys?row.occurrence_keys.map(occurrence_key=>occurrence({occurrence_key},mapping)):row.occurrence_ids}));
      const findingDispositions=choice.finding_dispositions.map(row=>({findingId:finding(row,mapping),
        disposition:row.disposition,reason:row.reason}));
      for(const edit of evidenceChanges)need(detail.evidence.some(row=>row.occurrenceId===edit.occurrenceId&&
        selectedQuestions.has(row.questionId)),'CUSTOMER_EVIDENCE_OUTSIDE_SELECTED_QUESTIONS');
      for(const edit of findingChanges)need(detail.findings.some(row=>row.id===edit.id&&
        selectedQuestions.has(row.questionId)),'CUSTOMER_FINDING_OUTSIDE_SELECTED_QUESTIONS');
      for(const row of detail.findings.filter(row=>!selectedQuestions.has(row.questionId))){
        const disposition=findingDispositions.find(item=>item.findingId===row.id);
        need(disposition&&['unchanged','follow-up'].includes(disposition.disposition),'CUSTOMER_UNSELECTED_FINDING_DISPOSITION_REQUIRED');
      }
      const request=citationReviewInput({requestId:choice.request_id,noticeId:detail.noticeId,
        expectedFingerprint:detail.fingerprint,expectedRevision:revision,actor:choice.actor,decision:choice.decision,reason:choice.reason,
        evidenceChanges,findingChanges,findingDispositions});
      return {key:choice.key,request,metadata,notice:detail};
    },async prepared=>{
      // Native requestId recovery precedes its CAS; an already saved request is
      // recovered unchanged even after the dossier has advanced.
      const reply=await client.reviewCitationUpdate(mapping.dossierId,prepared.request);
      need(same(reply.review.request,prepared.request),'CUSTOMER_SAVED_REVIEW_CHANGED');
      const original=await client.metadata(mapping.dossierId,{revision:reply.review.revision});
      const after=await client.citationUpdates(mapping.dossierId,{noticeId:prepared.request.noticeId,revision:reply.review.revision});
      need(after.detail.reviews.some(row=>same(row,reply.review)),'CUSTOMER_SAVED_REVIEW_RECONCILIATION_REQUIRED');
      return {key:prepared.key,request:prepared.request,review:reply.review,original:prepared.metadata,
        reviewed:original,noticeBefore:prepared.notice,noticeAfter:after.detail,revision:reply.review.revision};
    });
    reviews.push(saved);revision=saved.revision;
  }
  const result={schema:'sf88.research-customer-citation-receiving.v1',dossierId:mapping.dossierId,
    originalRevision:expectedRevision,revision,reviews};
  await retain(join(root,'citation-receiving.json'),result);return result;
}
export async function receiveChronologyBundle({client,mapping,questionKey,document,label,expectedRevision,directory:root}){
  return sourceImport(client,mapping.dossierId,{key:'customer-chronology',provider:'source-bundle',
    label,source_reference:'Customer-selected chronology and its original source locators',document_key:'customer-chronology'},
    document,mapping.questionIds[questionKey],expectedRevision,root);
}
export function preserveUnselected(before,after,questionIds){
  const selected=new Set(Object.values(questionIds));
  for(const name of ['questions','editions','selections','findings']){
    const original=before[name].filter(row=>!selected.has(name==='questions'?row.id:row.questionId));
    for(const row of original)need(after[name].some(current=>
      (name==='selections'?current.occurrenceId===row.occurrenceId:current.id===row.id)&&same(current,row)),
      'CUSTOMER_UNSELECTED_CONTENT_CHANGED');
  }
  for(const name of ['citationReviews','eligibilityEvents','riskOfBiasEvents','extractionEvents','extractionPublicationEvents','customerUpdateEvents','templateExchangeEvents'])
    if(Array.isArray(before[name]))need(before[name].every((row,index)=>same(after[name]?.[index],row)),
      'CUSTOMER_PREVIOUS_REVIEW_HISTORY_CHANGED');
  return {originalDossierRevision:before.revision,reviewedDossierRevision:after.revision,
    unselectedQuestions:before.questions.filter(row=>!selected.has(row.id)).length};
}
