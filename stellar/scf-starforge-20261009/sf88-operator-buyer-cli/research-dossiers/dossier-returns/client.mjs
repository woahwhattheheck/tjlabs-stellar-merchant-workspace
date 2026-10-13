// MIT. Dossier returns through the original identity-checked Research connection.
import {basename,resolve} from 'node:path';
import {need,object} from '../../node/store.mjs';
import {openResearchSource} from '../workspace-files.mjs';
import {PORTABLE_LIMIT} from '../portable.mjs';

const id=(value,prefix,code)=>{
  need(typeof value==='string'&&new RegExp('^'+prefix+'[a-f0-9]{64}$').test(value),code);return value;
};
const digest=value=>{need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'RETURN_COMPARISON_MISMATCH');return value;};
const integer=value=>{need(Number.isSafeInteger(value)&&value>=0,'EXPECTED_REVISION_REQUIRED');return value;};
const parameters=input=>{
  const query=new URLSearchParams();
  for(const[key,value]of Object.entries(input??{}))if(value!==undefined&&value!==null)query.set(key,String(value));
  return query.size?'?'+query.toString():'';
};
const selection=(input,{revision=false}={})=>{
  need(object(input),'RETURN_REVIEW_REQUIRED');
  id(input.reviewId,'drv_','RETURN_REVIEW_NOT_FOUND');
  if(revision){integer(input.expectedRevision);digest(input.comparisonSha256);}
  return input;
};
function exportInput(input,value=false){
  need(object(input)&&typeof input.file==='string'&&input.file.length>0,'RETURN_EXPORT_FILE_REQUIRED');
  selection(input);
  if(value){id(input.itemId,'dri_','RETURN_ITEM_NOT_FOUND');need(['base','current','returned'].includes(input.side),'RETURN_SIDE_INVALID');}
  else{need(['json','md','html','source'].includes(input.format??'json'),'RETURN_EXPORT_FORMAT_INVALID');if(input.returnId!==undefined&&input.returnId!==null)id(input.returnId,'drr_','RETURN_ID_INVALID');}
  return input;
}
export function createDossierReturnsClient({dossierId,request,download,upload,readValue,ensureSelected}={}){
  need(typeof dossierId==='string'&&/^d_[a-f0-9-]{36}$/.test(dossierId),'RETURN_DOSSIER_ID_INVALID');
  need([request,download,upload,readValue,ensureSelected].every(value=>typeof value==='function'),'RETURN_RESEARCH_CLIENT_REQUIRED');
  const base='/api/dossiers/'+encodeURIComponent(dossierId)+'/returns';
  const call=async(suffix,input,options={},readOnly=input===undefined)=>{
    await ensureSelected();
    try{return await request(base+suffix,input,{...options,readOnly});}
    catch(error){
      if(!readOnly&&(!Number.isInteger(error.status)||error.status>=500||error.outcomeUnknown===true)){
        Object.assign(error,{outcomeUnknown:true,
          ...(input?.requestId?{requestId:input.requestId}:{}),
          recovery:input?.requestId?'Read returns by this requestId or retry the exact retained review request.':
            'Reconcile the original source or saved draft before another write.'});
      }
      throw error;
    }
  };
  const client={
    dossierId,
    async receiveSource({file,filename,contentType='application/octet-stream',expectedSha256}={},options={}){
      need(typeof file==='string'&&file.length>0,'RETURN_SOURCE_FILE_REQUIRED');
      if(expectedSha256!==undefined)need(/^[a-f0-9]{64}$/.test(expectedSha256),'RETURN_SOURCE_INVALID');
      filename=filename??basename(file);
      need(typeof filename==='string'&&filename.length>0&&filename.length<=512&&!/[\u0000-\u001f\u007f/\\]/.test(filename),'RETURN_SOURCE_FILENAME_INVALID');
      need(['application/json','application/gzip','application/x-gzip','application/octet-stream'].includes(contentType),'RETURN_SOURCE_CONTENT_TYPE_INVALID');
      await ensureSelected();
      const source=await openResearchSource(resolve(file),PORTABLE_LIMIT,{sha256:expectedSha256});
      try{
        const result=await upload(base+'/sources'+parameters({filename,sha256:source.sha256,bytes:source.bytes}),
          source,{...options,contentType});
        need(result?.source?.id==='drs_'+source.sha256&&result.source.sha256===source.sha256&&
          result.source.bytes===source.bytes,'RETURN_SOURCE_CHANGED');
        return result;
      }catch(error){
        if(!Number.isInteger(error.status)||error.status>=500)Object.assign(error,{outcomeUnknown:true,
          sourceSha256:source.sha256,recovery:'Retry these same original source bytes and filename; do not substitute a different archive.'});
        throw error;
      }finally{await source.close();}
    },
    preview(input,options={}){
      need(object(input),'RETURN_SOURCE_REQUIRED');id(input.sourceId,'drs_','RETURN_SOURCE_NOT_FOUND');integer(input.expectedRevision);
      return call('/preview',input,options,true);
    },
    list(input={},options={}){
      need(object(input),'RETURN_QUERY_INVALID');
      if(input.reviewId!==undefined)id(input.reviewId,'drv_','RETURN_REVIEW_NOT_FOUND');
      if(input.requestId!==undefined)need(typeof input.requestId==='string'&&input.requestId.length>0&&input.requestId.length<=200,'RETURN_REQUEST_INVALID');
      return call(parameters(input),undefined,options,true);
    },
    async value(input,options={}){
      selection(input);id(input.itemId,'dri_','RETURN_ITEM_NOT_FOUND');
      need(['base','current','returned'].includes(input.side),'RETURN_SIDE_INVALID');
      await ensureSelected();
      const value=await readValue(base+'/value'+parameters({reviewId:input.reviewId,itemId:input.itemId,side:input.side}),options);
      need(value?.reviewId===input.reviewId&&value.itemId===input.itemId&&value.side===input.side&&
        typeof value.present==='boolean'&&(!value.present||Object.hasOwn(value,'value')),'RETURN_VALUE_CHANGED');
      return value;
    },
    async downloadValue(input,options={}){
      exportInput(input,true);await ensureSelected();
      const {file,expectedSha256,reviewId,itemId,side}=input;
      const result=await download(base+'/value'+parameters({reviewId,itemId,side}),resolve(file),
        {...options,expectedSha256,verifySha256Header:true});
      try{need(result.selection?.reviewId===reviewId&&result.selection.itemId===itemId&&result.selection.side===side,'RETURN_VALUE_CHANGED');}
      catch(error){Object.assign(error,{file:result,destinationPublished:true});throw error;}
      return result;
    },
    previewChoices(input,options={}){selection(input,{revision:true});return call('/choices',input,options,true);},
    review(input,options={}){
      selection(input,{revision:true});
      need(typeof input.requestId==='string'&&input.requestId.length>0&&input.requestId.length<=200,'RETURN_REQUEST_INVALID');
      return call('/reviews',input,options,false);
    },
    saveDraft(input,options={}){
      selection(input);integer(input.expectedDraftVersion);need(object(input.draft),'RETURN_DRAFT_REQUIRED');
      return call('/draft',input,options,false);
    },
    draft(input,options={}){selection(input);return call('/draft'+parameters({reviewId:input.reviewId}),undefined,options,true);},
    async export(input,options={}){
      exportInput(input);await ensureSelected();
      const {file,expectedSha256,reviewId,returnId,format='json'}=input;
      const result=await download(base+'/export'+parameters({reviewId,returnId,format}),resolve(file),
        {...options,expectedSha256,verifySha256Header:true});
      try{need(result.selection?.reviewId===reviewId&&result.selection.returnId===(returnId??null),
        'RETURN_EXPORT_SELECTION_CHANGED');}
      catch(error){Object.assign(error,{file:result,destinationPublished:true});throw error;}
      return result;
    },
  };
  return Object.freeze(client);
}
