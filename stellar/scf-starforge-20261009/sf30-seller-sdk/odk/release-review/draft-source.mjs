// MIT. Receive one existing native Central draft into the original workspace Store.
// Provider contract: https://docs.getodk.org/central-api-form-management/#draft-form
import {createHash} from 'node:crypto';
import {createCentralSource, formPath, segment, CENTRAL_SOURCE} from '../source.mjs';
import {digest, fault, stable} from '../../odata/state.mjs';

const clone=value=>structuredClone(value);
const need=(value,code,message,status=502)=>{if(!value)throw fault(code,message,status);};
const clean=({raw,value,...receipt})=>receipt;
const same=(a,b)=>stable(a)===stable(b);
const md5=bytes=>createHash('md5').update(bytes).digest('hex');
const safeMetadata=value=>Object.fromEntries([
  'projectId','xmlFormId','name','version','hash','keyId','state','publishedAt','createdAt','updatedAt','webformsEnabled',
].filter(key=>Object.hasOwn(value,key)).map(key=>[key,clone(value[key])]));
function definitionIdentity(value){
  return {...safeMetadata(value),draftTokenSha256:typeof value.draftToken==='string'?digest(value.draftToken):null};
}
function metadata(value,form){
  need(value&&typeof value==='object'&&!Array.isArray(value),'FORM_REVIEW_DRAFT_METADATA','Central returned incomplete draft metadata.');
  need(String(value.projectId)===String(form.projectId)&&value.xmlFormId===form.formId,
    'FORM_REVIEW_DRAFT_TARGET','The returned draft belongs to a different original project or form.');
  need(typeof value.version==='string','FORM_REVIEW_DRAFT_VERSION','Central must return the original draft version, including an empty string.');
  need(typeof value.hash==='string'&&/^[a-f0-9]{32}$/i.test(value.hash),
    'FORM_REVIEW_DRAFT_HASH','Central must return the original XForm MD5 identity.');
  return value;
}
function inventory(value){
  need(Array.isArray(value),'FORM_REVIEW_DRAFT_ATTACHMENTS','Central returned an incomplete draft attachment inventory.');
  const names=new Set();
  for(const item of value){
    need(item&&typeof item==='object'&&!Array.isArray(item),'FORM_REVIEW_DRAFT_ATTACHMENT','Central returned an invalid attachment slot.');
    segment(item.name,'original attachment filename');
    need(!names.has(item.name),'FORM_REVIEW_DRAFT_ATTACHMENT','Central repeated an original attachment name.');
    names.add(item.name);
    need(typeof item.exists==='boolean','FORM_REVIEW_DRAFT_ATTACHMENT','Central must report each original attachment slot’s availability.');
  }
  return value;
}
const inventoryIdentity=values=>[...values].map(clone).sort((a,b)=>a.name.localeCompare(b.name));
async function retainJSON(store,result){
  const receipt={...clean(result),...await store.retain(result.raw)};
  return {value:result.value,receipt};
}
async function readMetadata(source,store,path,form,signal,{initial=false}={}){
  const result=await source.json(path,{signal,optional:true});
  if(result.outcome==='missing')throw fault(initial?'FORM_REVIEW_DRAFT_ABSENT':'FORM_REVIEW_DRAFT_CHANGED',
    initial?'This form has no current Central draft.':'The Central draft changed while its originals were being received.',initial?404:409);
  metadata(result.value,form);
  return retainJSON(store,result);
}
async function retainAttachment(source,store,path,item,signal){
  if(!item.exists)return {...clone(item),outcome:'not-uploaded',sha256:null,bytes:null};
  const contentMd5=createHash('md5');
  const result=await source.request(path+'/'+segment(item.name,'original attachment filename'),{
    signal,accept:'*/*',optional:true,consume:async body=>{
      async function* chunks(){for await(const chunk of body??[]){contentMd5.update(chunk);yield chunk;}}
      return {...await store.retainStream(chunks()),md5:contentMd5.digest('hex')};
    },
  });
  need(result.outcome==='retained','FORM_REVIEW_DRAFT_CHANGED',
    'The attachment '+item.name+' became unavailable while its original bytes were being received.',409);
  if(item.blobExists===true){
    if(Number.isSafeInteger(item.size)&&item.size>=0)need(result.bytes===item.size,'FORM_REVIEW_DRAFT_CHANGED',
      'The attachment '+item.name+' changed while its original bytes were being received.',409);
    if(typeof item.hash==='string'&&/^[a-f0-9]{32}$/i.test(item.hash))need(result.md5===item.hash.toLowerCase(),
      'FORM_REVIEW_DRAFT_CHANGED','The attachment '+item.name+' differs from the selected native inventory.',409);
  }
  return {...clone(item),...clean(result)};
}

/** GET-only source receiving. The original form compiler and native publisher retain their own operations. */
export async function receiveCentralDraft({store,baseline,fetchImpl=globalThis.fetch,signal}={}){
  need(store?.get&&store?.retain&&store?.retainStream,'FORM_REVIEW_DRAFT_STORE','Use the existing Central workspace Store.',400);
  need(baseline?.form?.connectionId,'FORM_REVIEW_DRAFT_CONNECTION','Choose a retained source from an existing Central connection.',400);
  const form=baseline.form,connection=store.get('connection',form.connectionId);
  const source=createCentralSource({...connection,fetchImpl});
  const path=formPath(form.projectId,form.formId)+'/draft',attachmentsPath=path+'/attachments';
  const first=await readMetadata(source,store,path,form,signal,{initial:true});
  const expectedResult=await source.json(attachmentsPath,{signal});
  const expected=inventory(expectedResult.value),beforeInventory=await retainJSON(store,expectedResult);
  const xmlResult=await source.request(path+'.xml',{signal,accept:'application/xml'});
  need(md5(xmlResult.raw)===first.value.hash.toLowerCase(),'FORM_REVIEW_DRAFT_CHANGED',
    'The original XForm differs from the selected draft metadata. Receive the current draft again.',409);
  const xml={...clean(xmlResult),...await store.retain(xmlResult.raw)};
  const fieldsResult=await source.json(path+'/fields',{signal});
  need(Array.isArray(fieldsResult.value),'FORM_REVIEW_DRAFT_FIELDS','Central returned an incomplete native draft field schema.');
  const fields={...clean(fieldsResult),...await store.retain(fieldsResult.raw),values:fieldsResult.value};
  const items=[];
  for(const item of expected)items.push(await retainAttachment(source,store,attachmentsPath,item,signal));
  const fieldsAfterResult=await source.json(path+'/fields',{signal});
  need(Array.isArray(fieldsAfterResult.value)&&same(fieldsResult.value,fieldsAfterResult.value),'FORM_REVIEW_DRAFT_CHANGED',
    'The native draft field schema changed while its originals were being received.',409);
  const fieldsAfter=await retainJSON(store,fieldsAfterResult);
  const afterInventoryResult=await source.json(attachmentsPath,{signal});
  const afterInventory=await retainJSON(store,afterInventoryResult);
  inventory(afterInventory.value);
  const last=await readMetadata(source,store,path,form,signal);
  need(same(definitionIdentity(first.value),definitionIdentity(last.value))&&
    same(inventoryIdentity(expected),inventoryIdentity(afterInventory.value)),'FORM_REVIEW_DRAFT_CHANGED',
    'The draft definition or attachment inventory changed during receiving. Receive the current draft again.',409);
  const present=items.filter(value=>value.outcome==='retained').length;
  return {
    form:{connectionId:form.connectionId,projectId:String(form.projectId),formId:form.formId,
      version:first.value.version,title:first.value.name??form.title,providerHash:first.value.hash},
    origin:{kind:'central-draft',baselineId:baseline.id,baselineContentHash:baseline.contentHash,
      provider:CENTRAL_SOURCE,metadata:safeMetadata(first.value),
      definitionIdentity:definitionIdentity(first.value),receivedAt:last.receipt.receivedAt,
      originals:{metadataBefore:first.receipt,metadataAfter:last.receipt,
        attachmentInventoryBefore:beforeInventory.receipt,attachmentInventoryAfter:afterInventory.receipt,
        fieldsAfter:fieldsAfter.receipt}},
    xml,fields,model:null,
    media:{expected:expected.length,present,complete:present===expected.length,
      missing:items.filter(value=>value.outcome!=='retained').map(value=>value.name),items},
    reporting:null,history:[],coverage:{nativeDraft:true,definitionAndInventoryMatched:true,authoringModel:'absent'},
  };
}
