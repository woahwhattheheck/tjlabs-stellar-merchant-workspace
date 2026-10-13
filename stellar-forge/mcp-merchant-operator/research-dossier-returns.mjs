// MIT. Original dossier-return receiving, review and retained complete exports.
import {basename} from 'node:path';
import {exact,failure} from './host-files.mjs';
import {RESEARCH_DOSSIER_RETURN_EXPORTS} from './catalog/research-dossier-returns.mjs';

export const RESEARCH_DOSSIER_RETURN_PREFIX='merchant_research_dossier_return_';
const without=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
const selected=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
const need=(condition,message)=>{if(!condition)throw failure('RESEARCH_DOSSIER_RETURN_SELECTION_CHANGED',message);};

export async function callResearchDossierReturns(client,name,args,{source}={}){
  const returns=client.dossierReturns(args.dossierId),prefix=RESEARCH_DOSSIER_RETURN_PREFIX;
  if(name===prefix+'source'){
    exact(args,['workspace','dossierId','source','filename','contentType'],['workspace','dossierId','source']);
    const original=source(args.source,['portable']);
    const result=await returns.receiveSource({
      file:original.file,expectedSha256:original.sha256,
      filename:args.filename??basename(original.file),
      ...(args.contentType===undefined?{}:{contentType:args.contentType})
    });
    need(result?.source?.sha256===original.sha256&&/^drs_[a-f0-9]{64}$/.test(result.source.id),
      'The retained return must name the exact host-selected portable bytes.');
    return result;
  }
  if(name===prefix+'preview'){
    exact(args,['workspace','dossierId','sourceId','expectedRevision'],
      ['workspace','dossierId','sourceId','expectedRevision']);
    return returns.preview(without(args,['workspace','dossierId']));
  }
  if(name===prefix+'list'){
    exact(args,['workspace','dossierId','offset','limit'],['workspace','dossierId']);
    return returns.list(without(args,['workspace','dossierId']));
  }
  if(name===prefix+'inspect'){
    exact(args,['workspace','dossierId','reviewId','offset','limit'],['workspace','dossierId','reviewId']);
    return returns.list(without(args,['workspace','dossierId']));
  }
  if(name===prefix+'request'){
    exact(args,['workspace','dossierId','requestId'],['workspace','dossierId','requestId']);
    return returns.list({requestId:args.requestId});
  }
  if(name===prefix+'value'){
    exact(args,['workspace','dossierId','reviewId','itemId','side'],
      ['workspace','dossierId','reviewId','itemId','side']);
    return returns.value(without(args,['workspace','dossierId']));
  }
  if(name===prefix+'preview_choices'||name===prefix+'review'||name===prefix+'save_draft'){
    exact(args,['workspace','dossierId','input'],['workspace','dossierId','input']);
    if(name===prefix+'preview_choices')return returns.previewChoices(args.input);
    if(name===prefix+'review')return returns.review(args.input);
    return returns.saveDraft(args.input);
  }
  if(name===prefix+'draft'){
    exact(args,['workspace','dossierId','reviewId'],['workspace','dossierId','reviewId']);
    return returns.draft({reviewId:args.reviewId});
  }
  throw failure('TOOL_NOT_FOUND','Unknown original dossier-return operation.');
}

export async function exportResearchDossierReturn(client,args,{file,download}){
  const spec=RESEARCH_DOSSIER_RETURN_EXPORTS[args.kind];
  if(!spec)throw failure('INVALID_PARAMS','Select an original dossier-return export kind.');
  const fields=['workspace','dossierId','kind','returnReviewId','expectedSha256'];
  const required=['workspace','dossierId','kind','returnReviewId'];
  if(spec.returnValue){
    fields.push('returnItemId','returnSide');required.push('returnItemId','returnSide');
  }else fields.push('dossierReturnId');
  exact(args,fields,required);
  const returns=client.dossierReturns(args.dossierId),reviewId=args.returnReviewId;
  const view=await returns.list({reviewId,offset:0,limit:1});
  need(view?.reviewId===reviewId&&/^[a-f0-9]{64}$/.test(view.comparisonSha256)&&
    /^drs_[a-f0-9]{64}$/.test(view.source?.id),
    'Select the original frozen return review in this attached dossier.');
  if(args.dossierReturnId!==undefined)
    need(view.return?.id===args.dossierReturnId&&view.return.reviewId===reviewId,
      'The selected applied return must belong to this exact original review.');
  const selection={
    dossierId:args.dossierId,reviewId,comparisonSha256:view.comparisonSha256,
    source:selected(view.source,['id','sha256','bytes','filename','contentType','incomingHead']),
    current:selected(view.current,['revision','sha256']),
    base:selected(view.base,['revision','sha256']),
    returned:selected(view.returned,['revision','sha256']),
    inspectionStatus:view.status??null,
    ...(view.return?{inspectedReturn:selected(view.return,[
      'id','requestId','reviewId','sourceId','comparisonSha256','revision','revisionSha256'
    ])}:{}),
    representation:spec.representation
  };
  if(spec.returnValue){
    const result=await download(()=>returns.downloadValue({
      reviewId,itemId:args.returnItemId,side:args.returnSide,file,
      ...(args.expectedSha256===undefined?{}:{expectedSha256:args.expectedSha256})
    }));
    need(result.selection?.reviewId===reviewId&&result.selection.itemId===args.returnItemId&&
      result.selection.side===args.returnSide&&result.selection.sourceId===view.source.id&&
      result.selection.comparisonSha256===view.comparisonSha256&&result.selection.returnId===null&&
      result.selection.revisionSha256===null,
      'The full value download must retain its original review, source, comparison, item and side.');
    return {result,selection:{...selection,itemId:args.returnItemId,side:args.returnSide,
      nativeSelection:result.selection}};
  }
  let expectedSha256=args.expectedSha256;
  if(spec.returnFormat==='source'){
    need(typeof view.source.sha256==='string'&&/^[a-f0-9]{64}$/.test(view.source.sha256)&&
      Number.isSafeInteger(view.source.bytes)&&view.source.bytes>=0,
      'The original returned portable source must retain its complete byte descriptor.');
    need(expectedSha256===undefined||expectedSha256===view.source.sha256,
      'The requested source digest differs from this frozen review.');
    expectedSha256=view.source.sha256;
  }
  const result=await download(()=>returns.export({
    reviewId,...(args.dossierReturnId===undefined?{}:{returnId:args.dossierReturnId}),
    format:spec.returnFormat,file,...(expectedSha256===undefined?{}:{expectedSha256})
  }));
  need(result.selection?.reviewId===reviewId&&result.selection.returnId===(args.dossierReturnId??null)&&
    result.selection.sourceId===view.source.id&&result.selection.comparisonSha256===view.comparisonSha256&&
    result.selection.revisionSha256===(args.dossierReturnId===undefined?null:view.return.revisionSha256),
    'The complete return export must retain its selected source, comparison and accepted revision.');
  if(spec.returnFormat==='source')
    need(result.sha256===view.source.sha256&&result.bytes===view.source.bytes,
      'The complete returned source export must preserve its original bytes and digest.');
  // A review-only report is immutable. An explicit accepted return is bound
  // independently by the native selection header and the exact file digest.
  return {result,selection:{...selection,format:spec.returnFormat,nativeSelection:result.selection,
    ...(args.dossierReturnId===undefined?{}:{returnId:args.dossierReturnId})}};
}
