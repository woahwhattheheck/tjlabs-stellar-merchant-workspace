// MIT. Complete quotation programmes retain the original operating and customer files.
import {join,resolve,relative,dirname,basename} from 'node:path';
import {readdir} from 'node:fs/promises';
import {exists,digest} from '../../node/store.mjs';
import {readResearchHostFile} from '../workspace-files.mjs';
import {customerIdentifier,customerRevision} from '../customer-updates/contracts.mjs';
import {customerDirectory,withCustomerOperation,readCustomerJson,retainCustomerBytes,
 describeCustomerFile,copyCustomerFile,inspectCustomerHandover} from '../customer-updates/files.mjs';
import {createCustomerHandover} from '../customer-updates/operator.mjs';
import {publicPublication,checkPublicationArchive} from '../customer-commerce/contracts.mjs';
import {inspectResearchPaidArchive} from '../customer-commerce/archive.mjs';
import {QUOTE_REQUEST_LIMIT,QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT,fields,id,hash,need,same,fingerprint} from './contracts.mjs';
import {captureResearchQuoteInput} from './client.mjs';
import {inspectResearchCaseTransfer} from './case-transfer.mjs';
import {retainResearchQuoteOperation,retainResearchQuoteCaseFile,readResearchQuoteRun} from './operator.mjs';
import {RESEARCH_QUOTE_PROGRAMME_SCHEMA,RESEARCH_QUOTE_PROGRAMME_LIMIT,researchQuoteProgrammeStepId,
 readResearchQuoteProgrammeHeader,readResearchQuoteProgrammeStepIn,readResearchQuoteProgramme,
 assertResearchQuoteProgrammeOperation,readResearchQuoteProgrammeJson} from './programme.mjs';

export const RESEARCH_QUOTE_HANDOVER_SCHEMA='sf88-research-quotation-handover/v1';
export const RESEARCH_QUOTE_HANDOVER_REQUEST='sf88-research-quotation-handover-request/v1';
const PLAN='sf88-research-quotation-handover-plan/v1',FILE_COUNT=40000;
// The complete portable container includes the native case and its retained original input.
// Each original inspector still enforces its own ordinary record and file limits.
const HANDOVER_FILE_LIMIT=Math.max(QUOTE_FILE_LIMIT,QUOTE_CASE_TRANSFER_LIMIT+65536);
const clone=value=>JSON.parse(JSON.stringify(value));
const bytes=value=>Buffer.from(JSON.stringify(value));
const pin=file=>({name:file.name,bytes:file.bytes,sha256:file.sha256});
const stateId=value=>need(/^research_[a-f0-9]{64}$/.test(value??''),'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_REQUIRED');
export function researchQuoteHandoverPath(name){
 need(typeof name==='string'&&name.length<=1200&&name.split('/').length<=10&&
  name.split('/').every(part=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(part)&&part!=='.'&&part!=='..'),
  'RESEARCH_QUOTE_HANDOVER_FILE_INVALID');return name;
}
async function memberParent(root,name){
 const parts=researchQuoteHandoverPath(name).split('/');parts.pop();let path=root;
 for(const part of parts)path=await customerDirectory(join(path,part));
 return path;
}
async function selectedMember(root,name){
 const parts=researchQuoteHandoverPath(name).split('/');parts.pop();let path=root;
 for(const part of parts)path=await customerDirectory(join(path,part),{create:false});
 return join(path,basename(name));
}
export function researchQuoteHandoverInput(value){
 const input=captureResearchQuoteInput(value);
 fields(input,['schema','requestId','programmeDirectory','caseRevision','deliveryId','revision','sourceWorkspace','stepIds']);
 need(input.schema===RESEARCH_QUOTE_HANDOVER_REQUEST,'RESEARCH_QUOTE_HANDOVER_INPUT_REQUIRED');
 id(input.requestId);hash(input.caseRevision);customerIdentifier(input.deliveryId);customerRevision(input.revision);
 need(typeof input.programmeDirectory==='string'&&resolve(input.programmeDirectory)===input.programmeDirectory&&
  input.programmeDirectory!=='/','RESEARCH_QUOTE_PROGRAMME_DIRECTORY_REQUIRED');
 if(input.sourceWorkspace!==null){
  fields(input.sourceWorkspace,['library','actor','requestId']);
  need(/^(?:original|received-[a-f0-9]{64})$/.test(input.sourceWorkspace.library??'')&&
   typeof input.sourceWorkspace.actor==='string'&&input.sourceWorkspace.actor.trim()&&input.sourceWorkspace.actor.length<=200&&
   /^[A-Za-z0-9._:-]{8,160}$/.test(input.sourceWorkspace.requestId??''),'RESEARCH_QUOTE_HANDOVER_SOURCE_WORKSPACE_REQUIRED');
 }
 if(input.stepIds!==null){
  need(Array.isArray(input.stepIds)&&input.stepIds.length>0&&input.stepIds.length<=RESEARCH_QUOTE_PROGRAMME_LIMIT&&
   new Set(input.stepIds).size===input.stepIds.length,'RESEARCH_QUOTE_HANDOVER_STEPS_REQUIRED');
  input.stepIds.forEach(researchQuoteProgrammeStepId);
 }
 return input;
}
export function researchQuoteDistinctDirectories(a,b){
 const first=resolve(a),second=resolve(b);
 need(first!==second&&!second.startsWith(first+'/')&&!first.startsWith(second+'/'),
  'RESEARCH_QUOTE_DISTINCT_DIRECTORY_REQUIRED');
}
async function retain(root,name,value){return retainCustomerBytes(root,name,bytes(value));}
async function copyMember(root,name,file){
 const directory=await memberParent(root,name),copied=await copyCustomerFile(file.path,join(directory,basename(name)),
  {sha256:file.sha256,bytes:file.bytes,maximum:HANDOVER_FILE_LIMIT});
 return {name,bytes:copied.bytes,sha256:copied.sha256};
}
async function jsonMember(root,name,value){
 const directory=await memberParent(root,name),saved=await retain(directory,basename(name),value);
 return {name,bytes:saved.bytes,sha256:saved.sha256};
}
async function describe(path,name){
 const file=await describeCustomerFile(path,{maximum:HANDOVER_FILE_LIMIT});return {name,path:file.path,bytes:file.bytes,sha256:file.sha256};
}
function descriptor(file){
 fields(file,['name','bytes','sha256']);researchQuoteHandoverPath(file.name);hash(file.sha256);
 need(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=HANDOVER_FILE_LIMIT,'RESEARCH_QUOTE_HANDOVER_FILE_SIZE_INVALID');
 return file;
}
async function connect(source,expected,signal){
 const client=typeof source==='function'?await source():source;
 need(client&&typeof client.status==='function'&&typeof client.customerQuotes==='function'&&
  typeof client.customerUpdates==='function','RESEARCH_QUOTE_PROGRAMME_ORIGINAL_CLIENT_REQUIRED');
 const status=await client.status({signal});stateId(status.workspaceId);
 need(expected===undefined||status.workspaceId===expected,'RESEARCH_QUOTE_PROGRAMME_WORKSPACE_CHANGED');
 return client;
}
function lazyOriginal(factory,expected,signal){
 let promise;
 const original=()=>promise??=(async()=>connect(factory,expected,signal))();
 const scope=method=>new Proxy({}, {get:(_,key)=>(...args)=>original().then(client=>client[method]()[key](...args))});
 return {status:(...args)=>original().then(client=>client.status(...args)),
  customerUpdates:()=>scope('customerUpdates'),europePmc:()=>scope('europePmc')};
}
function rememberOperation(operations,operation,programme){
 if(operation?.schema!=='sf88-research-customer-quote-operation/v1')return;
 assertResearchQuoteProgrammeOperation(operation,programme);
 const previous=operations.get(operation.id);
 need(!previous||previous.requestSha256===operation.requestSha256,'RESEARCH_QUOTE_HANDOVER_OPERATION_CHANGED');
 if(!previous||operation.status==='COMPLETE'){
  const {id,kind,status,requestSha256}=operation;
  operations.set(id,{id,kind,status,requestSha256,operationSha256:fingerprint(operation),
   publicationId:kind==='PUBLICATION'&&status==='COMPLETE'?operation.result.publicationId:null});
 }
}
async function snapshot(root,input){
 return withCustomerOperation(input.programmeDirectory,async original=>{
  const programme=await readResearchQuoteProgrammeHeader(original),rows=await readdir(join(original,'steps')),
   stepIds=input.stepIds??rows.filter(name=>/^[a-z0-9][a-z0-9._-]{0,79}$/.test(name)).sort(),steps=[],sourceFiles=[],operations=new Map();
  need(stepIds.length>0&&stepIds.length<=RESEARCH_QUOTE_PROGRAMME_LIMIT,'RESEARCH_QUOTE_HANDOVER_STEPS_REQUIRED');
  const add=async(source,name)=>sourceFiles.push(await describe(source,name));
  await add(join(original,'programme.json'),'programme/programme.json');
  await add(join(original,'programme-input.json'),'programme/programme-input.json');
  for(const stepId of stepIds){
   const step=await readResearchQuoteProgrammeStepIn(original,programme,stepId);
   need(step.native?.result,'RESEARCH_QUOTE_HANDOVER_COMPLETED_STEP_REQUIRED');
   steps.push(step.summary);
   const prefix='programme/steps/'+stepId+'/';
   await add(join(step.directory,'step.json'),prefix+'step.json');
   await add(join(step.directory,'step-input.json'),prefix+'step-input.json');
   await add(join(step.directory,'step-input.json'),'requests/'+stepId+'.json');
   const names=['input.json','request.json','result.json',...(step.native.original?['original.json']:[]),
    ...step.native.attempts.map(row=>row.name)];
   for(const name of names)await add(join(step.directory,'operation',name),prefix+'operation/'+name);
   rememberOperation(operations,step.native.result.result,programme);
  }
  need(sourceFiles.length<=FILE_COUNT&&operations.size>0,'RESEARCH_QUOTE_HANDOVER_FILES_REQUIRED');
  const plan={schema:PLAN,request:input,requestSha256:fingerprint(input),programme,
   programmeSha256:fingerprint(programme),steps,stepIds,sourceFiles,
   operations:[...operations.values()].sort((a,b)=>a.id.localeCompare(b.id)),createdAt:new Date().toISOString()};
  await retain(root,'package-plan.json',plan);return plan;
 });
}
function planRecord(plan){
 need(plan?.schema===PLAN&&plan.requestSha256===fingerprint(researchQuoteHandoverInput(plan.request))&&
  plan.programmeSha256===fingerprint(plan.programme)&&plan.programme.input?.id&&
  Array.isArray(plan.sourceFiles)&&plan.sourceFiles.length<=FILE_COUNT&&
  Array.isArray(plan.operations)&&plan.operations.length<=RESEARCH_QUOTE_PROGRAMME_LIMIT&&
  Array.isArray(plan.steps)&&same(plan.steps.map(row=>row.stepId),plan.stepIds),'RESEARCH_QUOTE_HANDOVER_PLAN_CHANGED');
 plan.sourceFiles.forEach(file=>{descriptor(pin(file));need(typeof file.path==='string'&&resolve(file.path)===file.path,
  'RESEARCH_QUOTE_HANDOVER_SOURCE_FILE_CHANGED');});
 need(new Set(plan.sourceFiles.map(file=>file.name)).size===plan.sourceFiles.length,'RESEARCH_QUOTE_HANDOVER_PLAN_CHANGED');
 return plan;
}
async function exportedFiles(payload,prefix,result){
 const files=[];
 for(const name of ['export.json','result.json',...(result.selection.original?['input.json']:[])]){
  const original=await describe(join(result.directory,name),prefix+'/'+name);
  files.push(await copyMember(payload,original.name,original));
 }
 for(const file of result.files)files.push(await copyMember(payload,prefix+'/files/'+file.name,file));
 return files;
}
async function publicationFiles(root,payload,id,plan,source,signal){
 const retained=await customerDirectory(join(root,'sources','publication-'+id));let selection=await readResearchQuoteProgrammeJson(retained,'selection.json');
 if(!selection){
  const client=await connect(source,plan.programme.workspaceId,signal),commerce=client.customerCommerce(),
   record=await commerce.publication(id,{signal});
  need(record.status==='ENROLLED'&&record.result?.publicationId===id&&
   record.review?.dossierId===plan.programme.input.dossierId,'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
  const files=[];
  for(const part of ['publication','handoff','archive']){
   const metadata=await commerce.file('publications',id,part,{signal});
   need(metadata.workspaceId===plan.programme.workspaceId,'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
   files.push({part,metadata});
  }
  selection={id,workspaceId:plan.programme.workspaceId,record,files};
  await retain(retained,'selection.json',selection);
 }
 need(selection.id===id&&selection.workspaceId===plan.programme.workspaceId&&selection.record.status==='ENROLLED'&&
  same(selection.files.map(row=>row.part),['publication','handoff','archive']),'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
 const files=[],prefix='publications/'+id;
 files.push(await copyMember(payload,prefix+'/selection.json',await describe(join(retained,'selection.json'),'selection.json')));
 for(const selected of selection.files){
  const metadata=selected.metadata,dir=await customerDirectory(join(retained,selected.part)),path=join(dir,metadata.descriptor.name);
  if(!await exists(path)){
   const client=await connect(source,selection.workspaceId,signal);
   await client.customerCommerce().download('publications',id,selected.part,{file:path,
    expectedSha256:metadata.descriptor.sha256,expectedBytes:metadata.descriptor.bytes,signal});
  }
  const file=await describeCustomerFile(path,{sha256:metadata.descriptor.sha256,bytes:metadata.descriptor.bytes,maximum:QUOTE_FILE_LIMIT});
  files.push(await copyMember(payload,prefix+'/'+selected.part+'/'+metadata.descriptor.name,file));
 }
 const publicFile=selection.files.find(row=>row.part==='publication').metadata.descriptor,
  body=await readResearchHostFile(join(retained,'publication',publicFile.name),QUOTE_FILE_LIMIT,{sha256:publicFile.sha256}),
  published=publicPublication(JSON.parse(body));
 need(published.publicationId===id&&published.delivery.dossierId===plan.programme.input.dossierId,
  'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
 return {selection:{id,name:prefix+'/selection.json',files:selection.files.map(row=>({
  ...pin(row.metadata.descriptor),part:row.part,name:prefix+'/'+row.part+'/'+row.metadata.descriptor.name
 }))},files};
}
function guide(plan){
 const rows=plan.steps.map(row=>'| '+row.stepId+' | '+row.command+(row.action?' / '+row.action:'')+' | '+row.status+
  ' | '+(row.kind??'native')+' | [Original input](requests/'+row.stepId+'.json) |').join('\n');
 return '# '+plan.programme.input.name+'\n\n'+
 'This complete operating handover preserves the selected quotation programme and the native customer files.\n\n'+
 '| Selection | Original value |\n| --- | --- |\n'+
 '| Programme | '+plan.programme.input.id+' |\n| Research workspace | '+plan.programme.workspaceId+' |\n'+
 '| Case | '+plan.programme.input.caseId+' |\n| Case revision | '+plan.request.caseRevision+' |\n'+
 '| Dossier | '+plan.programme.input.dossierId+' |\n| Customer project | '+plan.programme.input.projectId+' |\n'+
 '| Frozen delivery | '+plan.request.deliveryId+' |\n| Delivery revision | '+plan.request.revision+' |\n\n'+
 '## Complete phase requests\n\n| Step | Native command | Saved state | Native kind | Input |\n| --- | --- | --- | --- | --- |\n'+rows+'\n\n'+
 'The programme directory retains the complete original operating requests, source selections, attempts and first replies. '+
 'The native directory contains each selected quote operation and every retained source, pricing, supplier-cost, customer-response and realized-report file. '+
 'The case directory carries the original case transfer and the selected saved revision. The customer directory includes all four report formats, '+
 'the reviewed work snapshot and the complete portable dossier history. Publications contain the exact original public order handoff and paid archive.\n\n'+
 '## Reopen and receive\n\n'+
 'Use quotes-programme-inspect --package-directory THIS_DIRECTORY to read and verify the whole package. '+
 'Use quotes-programme-receive-prepare with the destination Research connection and a separate retained receiving directory. '+
 'Review its complete case transfer and customer selection, then use quotes-programme-receive with that exact review SHA. '+
 'The existing native case and dossier writers perform receiving. Later customer work stays in their original histories. '+
 'Keep the receiving directory to reopen the original result after the source package or connection moves.\n\n'+
 'Use quotes-programme-step on programme/ to reopen an exact retained original request. '+
 'A source programme continues against its original Research workspace. A receiving result identifies the actual destination case and dossier for a new destination programme.\n\n'+
 'This bundle contains private operating selections and complete native inputs. The four files in customer/ named in handover.json are the customer report editions.\n';
}
async function supplied(root,input,inputFile){
 let request=await readResearchQuoteProgrammeJson(root,'package-request.json'),body;
 if(inputFile&&await exists(inputFile))body=await readResearchHostFile(inputFile,QUOTE_REQUEST_LIMIT);
 else if(input!==undefined)body=bytes(input);
 if(request){
  need(request.schema==='sf88-research-quotation-handover-retained/v1'&&
   request.requestSha256===fingerprint(researchQuoteHandoverInput(request.input)),
   'RESEARCH_QUOTE_HANDOVER_REQUEST_CHANGED');
  const original=await readResearchHostFile(join(root,'package-input.json'),QUOTE_REQUEST_LIMIT,{sha256:request.inputFile.sha256});
  need(original.length===request.inputFile.bytes&&same(researchQuoteHandoverInput(JSON.parse(original)),request.input),
   'RESEARCH_QUOTE_HANDOVER_REQUEST_CHANGED');
  if(body)need(inputFile?digest(body)===request.inputFile.sha256&&body.length===request.inputFile.bytes:
   same(researchQuoteHandoverInput(JSON.parse(body)),request.input),'RESEARCH_QUOTE_HANDOVER_REQUEST_CHANGED');
  return request.input;
 }
 if(!body&&await exists(join(root,'package-input.json')))body=await readResearchHostFile(join(root,'package-input.json'),QUOTE_REQUEST_LIMIT);
 need(body?.length,'RESEARCH_QUOTE_HANDOVER_INPUT_REQUIRED');
 const value=researchQuoteHandoverInput(JSON.parse(body));
 researchQuoteDistinctDirectories(root,value.programmeDirectory);
 request={schema:'sf88-research-quotation-handover-retained/v1',input:value,requestSha256:fingerprint(value),
  inputFile:{name:'package-input.json',bytes:body.length,sha256:digest(body)}};
 await retainCustomerBytes(root,'package-input.json',body);await retain(root,'package-request.json',request);return value;
}
/** Publish every complete selected original file; saved packages reopen before donor or host access. */
export function createResearchQuoteHandover({client,directory,input,inputFile,signal}={}){
 need(!(input!==undefined&&inputFile),'RESEARCH_QUOTE_SELECT_ONE_INPUT');
 const selected=input===undefined?undefined:captureResearchQuoteInput(input),file=inputFile?resolve(inputFile):null;
 return withCustomerOperation(directory,async root=>{
  need(!await exists(join(root,'programme-input.json'))&&!await exists(join(root,'programme.json'))&&
   !await exists(join(root,'input.json'))&&!await exists(join(root,'request.json'))&&!await exists(join(root,'export.json'))&&
   !await exists(join(root,'quotation-programme.json'))&&!await exists(join(root,'handover-copy.json'))&&
   !await exists(join(root,'receiving-input.json'))&&!await exists(join(root,'receiving-request.json'))&&
   !await exists(join(root,'input','handover-copy.json'))&&!await exists(join(root,'input','quotation-programme.json')),
   'RESEARCH_QUOTE_DISTINCT_DIRECTORY_REQUIRED');
  const request=await supplied(root,selected,file),payload=await customerDirectory(join(root,'package'));
  if(await exists(join(payload,'quotation-programme.json'))){
   const saved=await inspectResearchQuoteHandover(payload);
   need(same(saved.manifest.request,request),'RESEARCH_QUOTE_HANDOVER_REQUEST_CHANGED');
   return {...saved,operationDirectory:root,reused:true};
  }
  let plan=await readResearchQuoteProgrammeJson(root,'package-plan.json');
  if(plan)planRecord(plan);else plan=await snapshot(root,request);
  need(same(plan.request,request),'RESEARCH_QUOTE_HANDOVER_REQUEST_CHANGED');
  const files=[];
  for(const item of plan.sourceFiles){signal?.throwIfAborted();files.push(await copyMember(payload,item.name,item));}
  await customerDirectory(join(root,'sources'));
  const operations=[];
  for(const operation of plan.operations){
   signal?.throwIfAborted();const exported=await retainResearchQuoteOperation({client,directory:join(root,'sources','operation-'+operation.id),
    id:operation.id,expectedOperationSha256:operation.operationSha256,signal});
   need(exported.workspaceId===plan.programme.workspaceId,'RESEARCH_QUOTE_HANDOVER_OPERATION_CHANGED');
   assertResearchQuoteProgrammeOperation(exported.selection.operation,plan.programme);
   files.push(...await exportedFiles(payload,'native/'+operation.id,exported));
   operations.push({...operation,name:'native/'+operation.id+'/export.json'});
  }
  const caseFile=await retainResearchQuoteCaseFile({client,directory:join(root,'sources','case'),
   caseId:plan.programme.input.caseId,input:{kind:'CASE_RECORD',revision:request.caseRevision,
    scope:{workspaceId:plan.programme.casesWorkspaceId,caseId:plan.programme.input.caseId}},signal});
  need(caseFile.workspaceId===plan.programme.workspaceId&&caseFile.selection.metadata.case.revision===request.caseRevision,
   'RESEARCH_QUOTE_HANDOVER_CASE_CHANGED');
  files.push(...await exportedFiles(payload,'case',caseFile));
  const customer=await createCustomerHandover({client:lazyOriginal(client,plan.programme.workspaceId,signal),
   directory:join(root,'sources','customer'),dossierId:plan.programme.input.dossierId,deliveryId:request.deliveryId,
   revision:request.revision,sourceWorkspace:request.sourceWorkspace});
  need(customer.selection.projectId===plan.programme.input.projectId&&customer.selection.revision===request.revision&&
   customer.selection.workspaceId===plan.programme.workspaceId,'RESEARCH_QUOTE_HANDOVER_DELIVERY_CHANGED');
  files.push(await copyMember(payload,'customer/handover.json',await describe(join(customer.directory,'handover.json'),'handover.json')));
  for(const item of customer.files)files.push(await copyMember(payload,'customer/'+item.name,item));
  const publications=[];
  for(const operation of plan.operations.filter(row=>row.publicationId!==null)){
   signal?.throwIfAborted();const result=await publicationFiles(root,payload,operation.publicationId,plan,client,signal);
   publications.push(result.selection);files.push(...result.files);
  }
  const selection={programmeId:plan.programme.input.id,programmeSha256:plan.programmeSha256,
   workspaceId:plan.programme.workspaceId,casesWorkspaceId:plan.programme.casesWorkspaceId,
   caseId:plan.programme.input.caseId,caseRevision:request.caseRevision,dossierId:plan.programme.input.dossierId,
   projectId:plan.programme.input.projectId,deliveryId:request.deliveryId,revision:request.revision,stepIds:plan.stepIds,
   operations,publications,caseRecord:{...pin(caseFile.files[0]),name:'case/files/'+caseFile.files[0].name},
   customer:{name:'customer/handover.json',manifestSha256:customer.manifestSha256,manifestBytes:customer.manifestBytes,
    selection:customer.selection}};
  let manifest={schema:RESEARCH_QUOTE_HANDOVER_SCHEMA,request,requestSha256:fingerprint(request),selection,
   createdAt:plan.createdAt,files};
  files.push(await jsonMember(payload,'programme-summary.json',{schema:RESEARCH_QUOTE_PROGRAMME_SCHEMA,
   programme:plan.programme,steps:plan.steps,selection}));
  files.push(await copyMember(payload,'package-input.json',await describe(join(root,'package-input.json'),'package-input.json')));
  const readme=Buffer.from(guide(plan));
  const saved=await retainCustomerBytes(payload,'OPERATING.md',readme);
  files.push(pin(saved));files.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  need(files.length<=FILE_COUNT&&new Set(files.map(row=>row.name)).size===files.length,'RESEARCH_QUOTE_HANDOVER_FILES_CHANGED');
  await retain(payload,'quotation-programme.json',manifest);
  return {...await inspectResearchQuoteHandover(payload),operationDirectory:root,reused:false};
 });
}
/** Complete bytes and original native readers remain the receiving authority. */
export async function inspectResearchQuoteHandover(directory,{manifestSha256}={}){
 const root=await customerDirectory(directory,{create:false}),retained=await readCustomerJson(join(root,'quotation-programme.json'),QUOTE_FILE_LIMIT),
  manifest=retained.value;
 if(manifestSha256!==undefined)need(hash(manifestSha256)===retained.sha256,'RESEARCH_QUOTE_HANDOVER_CHANGED');
 fields(manifest,['schema','request','requestSha256','selection','createdAt','files']);
 need(manifest.schema===RESEARCH_QUOTE_HANDOVER_SCHEMA&&
  manifest.requestSha256===fingerprint(researchQuoteHandoverInput(manifest.request))&&Array.isArray(manifest.files)&&
  manifest.files.length>0&&manifest.files.length<=FILE_COUNT&&new Set(manifest.files.map(file=>file.name)).size===manifest.files.length,
  'RESEARCH_QUOTE_HANDOVER_MANIFEST_CHANGED');
 const roster=new Map(),files=[],required=new Set();
 for(const file of manifest.files){
  descriptor(file);need(file.name!=='quotation-programme.json','RESEARCH_QUOTE_HANDOVER_RESERVED_FILE');
  const path=await selectedMember(root,file.name),saved=await describeCustomerFile(path,{
   sha256:file.sha256,bytes:file.bytes,maximum:HANDOVER_FILE_LIMIT});
  roster.set(file.name,file);files.push({...file,path:saved.path});
 }
 const demand=(name,expected)=>{
  const file=roster.get(name);need(file&&(!expected||file.bytes===expected.bytes&&file.sha256===expected.sha256),
   'RESEARCH_QUOTE_HANDOVER_FILE_MISSING');required.add(name);return file;
 };
 for(const name of ['programme/programme.json','programme/programme-input.json','programme-summary.json','package-input.json','OPERATING.md'])
  demand(name);
 const selected=manifest.selection;
 fields(selected,['programmeId','programmeSha256','workspaceId','casesWorkspaceId','caseId','caseRevision','dossierId',
  'projectId','deliveryId','revision','stepIds','operations','publications','caseRecord','customer']);
 need(Array.isArray(selected.stepIds)&&selected.stepIds.length>0&&
  selected.stepIds.length<=RESEARCH_QUOTE_PROGRAMME_LIMIT&&new Set(selected.stepIds).size===selected.stepIds.length&&
  Array.isArray(selected.publications),'RESEARCH_QUOTE_HANDOVER_PROGRAMME_CHANGED');
 const programme=await readResearchQuoteProgramme(join(root,'programme'));
 need(selected.programmeId===programme.programme.input.id&&selected.programmeSha256===fingerprint(programme.programme)&&
  selected.workspaceId===programme.programme.workspaceId&&selected.casesWorkspaceId===programme.programme.casesWorkspaceId&&
  selected.caseId===programme.programme.input.caseId&&selected.dossierId===programme.programme.input.dossierId&&
  selected.projectId===programme.programme.input.projectId&&selected.caseRevision===manifest.request.caseRevision&&
  selected.deliveryId===manifest.request.deliveryId&&selected.revision===manifest.request.revision&&
  (manifest.request.stepIds===null||same(selected.stepIds,manifest.request.stepIds))&&
  same([...selected.stepIds].sort(),programme.steps.map(row=>row.stepId).sort()),'RESEARCH_QUOTE_HANDOVER_PROGRAMME_CHANGED');
 const summary=(await readCustomerJson(await selectedMember(root,'programme-summary.json'),QUOTE_FILE_LIMIT)).value;
 need(same(summary.programme,programme.programme)&&same(summary.selection,selected)&&
  same([...summary.steps].sort((a,b)=>a.stepId.localeCompare(b.stepId)),[...programme.steps].sort((a,b)=>a.stepId.localeCompare(b.stepId))),
  'RESEARCH_QUOTE_HANDOVER_PROGRAMME_CHANGED');
 const requiredOperations=new Map(),stepsById=new Map(programme.steps.map(step=>[step.stepId,step]));
 // Reuse the original selected order and COMPLETE precedence from source capture.
 for(const stepId of selected.stepIds){
  const step=stepsById.get(stepId);
  need(step?.status==='COMPLETE','RESEARCH_QUOTE_HANDOVER_COMPLETED_STEP_REQUIRED');
  const prefix='programme/steps/'+stepId+'/';
  for(const name of ['step.json','operation/input.json','operation/request.json','operation/result.json'])demand(prefix+name);
  demand(prefix+'step-input.json',step.inputFile);demand('requests/'+step.stepId+'.json',step.inputFile);
  const folder=await customerDirectory(join(root,prefix,'operation'),{create:false});
  for(const name of await readdir(folder))if(/^(?:attempt|error)-[a-f0-9-]{36}\.json$/.test(name)||name==='original.json')
   demand(prefix+'operation/'+name);
  const reply=(await readCustomerJson(join(folder,'result.json'),QUOTE_FILE_LIMIT)).value;
  need(reply?.resultSha256===step.resultSha256&&reply.resultSha256===fingerprint(reply.result),
   'RESEARCH_QUOTE_HANDOVER_OPERATION_CHANGED');
  rememberOperation(requiredOperations,reply.result,programme.programme);
 }
 const originalInput=await readResearchHostFile(await selectedMember(root,'package-input.json'),QUOTE_REQUEST_LIMIT);
 need(same(researchQuoteHandoverInput(JSON.parse(originalInput)),manifest.request),'RESEARCH_QUOTE_HANDOVER_REQUEST_CHANGED');
 const caseRun=await readResearchQuoteRun(join(root,'case'));
 need(caseRun.selection?.request.kind==='case'&&caseRun.selection.request.caseId===selected.caseId&&
  caseRun.selection.selection.input.kind==='CASE_RECORD'&&caseRun.selection.selection.input.revision===selected.caseRevision&&
  caseRun.result?.workspaceId===selected.workspaceId&&caseRun.result.files.length===1&&
  selected.caseRecord.name==='case/files/'+caseRun.result.files[0].name&&
  same(pin(selected.caseRecord),roster.get(selected.caseRecord.name)),'RESEARCH_QUOTE_HANDOVER_CASE_CHANGED');
 for(const name of ['case/export.json','case/input.json','case/result.json'])demand(name);
 demand(selected.caseRecord.name,selected.caseRecord);
 const caseBody=await readResearchHostFile(await selectedMember(root,selected.caseRecord.name),QUOTE_CASE_TRANSFER_LIMIT,
  {sha256:selected.caseRecord.sha256}),caseRecord=JSON.parse(caseBody),caseInspection=await inspectResearchCaseTransfer(caseRecord);
 need(caseInspection.source.workspaceId===selected.workspaceId&&caseInspection.source.casesWorkspaceId===selected.casesWorkspaceId&&
  caseInspection.source.caseId===selected.caseId&&caseInspection.source.revision===selected.caseRevision,
  'RESEARCH_QUOTE_HANDOVER_CASE_CHANGED');
 const customer=await inspectCustomerHandover(join(root,'customer'),{manifestSha256:selected.customer.manifestSha256});
 need(selected.customer.name==='customer/handover.json'&&customer.manifestBytes===selected.customer.manifestBytes&&
  same(customer.selection,selected.customer.selection)&&customer.selection.workspaceId===selected.workspaceId&&
  customer.selection.dossierId===selected.dossierId&&customer.selection.projectId===selected.projectId&&
  customer.selection.delivery.id===selected.deliveryId&&customer.selection.revision===selected.revision,
  'RESEARCH_QUOTE_HANDOVER_CUSTOMER_CHANGED');
 demand('customer/handover.json',{bytes:customer.manifestBytes,sha256:customer.manifestSha256});
 for(const file of customer.files)demand('customer/'+file.name,file);
 const expectedOperations=[...requiredOperations.values()].sort((a,b)=>a.id.localeCompare(b.id));
 need(Array.isArray(selected.operations)&&selected.operations.length>0&&
  new Set(selected.operations.map(row=>row.id)).size===selected.operations.length&&
  same([...selected.operations].sort((a,b)=>a.id.localeCompare(b.id)),
   expectedOperations.map(row=>({...row,name:'native/'+row.id+'/export.json'}))),
  'RESEARCH_QUOTE_HANDOVER_OPERATIONS_CHANGED');
 const expectedPublications=expectedOperations.filter(row=>row.publicationId!==null).map(row=>row.publicationId).sort();
 need(new Set(expectedPublications).size===expectedPublications.length&&
  new Set(selected.publications.map(row=>row.id)).size===selected.publications.length&&
  same(selected.publications.map(row=>row.id).sort(),expectedPublications),
  'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
 const operations=[];
 for(const item of selected.operations){
  id(item.id);need(item.name==='native/'+item.id+'/export.json','RESEARCH_QUOTE_HANDOVER_OPERATION_CHANGED');
  const exported=await readResearchQuoteRun(join(root,'native',item.id)),operation=exported.selection?.selection.operation;
  assertResearchQuoteProgrammeOperation(operation,programme.programme);
  need(exported.selection.request.id===item.id&&fingerprint(operation)===item.operationSha256&&operation.kind===item.kind&&
   operation.status===item.status&&operation.requestSha256===item.requestSha256&&exported.result,
   'RESEARCH_QUOTE_HANDOVER_OPERATION_CHANGED');
  demand(item.name);demand('native/'+item.id+'/result.json');
  for(const file of exported.result.files)demand('native/'+item.id+'/files/'+file.name,file);
  operations.push({id:item.id,operation,directory:join(root,'native',item.id),files:exported.result.files});
 }
 for(const item of selected.publications){
  id(item.id);need(item.name==='publications/'+item.id+'/selection.json'&&operations.some(row=>row.id===item.id&&
   row.operation.kind==='PUBLICATION'&&row.operation.status==='COMPLETE'),'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
  demand(item.name);
  const original=(await readCustomerJson(await selectedMember(root,item.name),QUOTE_FILE_LIMIT)).value;
  need(original.id===item.id&&original.workspaceId===selected.workspaceId&&original.record?.status==='ENROLLED'&&
   original.record.result?.publicationId===item.id&&
   same(original.files.map(row=>row.part),['publication','handoff','archive'])&&
   same(item.files,original.files.map(row=>({...pin(row.metadata.descriptor),part:row.part,
    name:'publications/'+item.id+'/'+row.part+'/'+row.metadata.descriptor.name}))),
   'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
  for(const file of original.files){
   const name='publications/'+item.id+'/'+file.part+'/'+file.metadata.descriptor.name;
   demand(name,file.metadata.descriptor);
   need(same({...pin(file.metadata.descriptor),name},roster.get(name)),'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
  }
  const pub=original.files[0].metadata.descriptor,body=await readResearchHostFile(
   await selectedMember(root,'publications/'+item.id+'/publication/'+pub.name),QUOTE_FILE_LIMIT,{sha256:pub.sha256});
  const published=publicPublication(JSON.parse(body)),native=operations.find(row=>row.id===item.id).operation;
  need(published.publicationId===item.id&&published.delivery.dossierId===selected.dossierId&&
   published.delivery.deliveryId===native.request.deliveryId&&published.delivery.revision===native.request.revision,
   'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
  const handoff=original.files.find(row=>row.part==='handoff').metadata.descriptor,
   handed=(await readCustomerJson(await selectedMember(root,'publications/'+item.id+'/handoff/'+handoff.name),QUOTE_FILE_LIMIT)).value;
  need(same(handed,published.handoff),'RESEARCH_QUOTE_HANDOVER_PUBLICATION_CHANGED');
  const archive=original.files.find(row=>row.part==='archive').metadata.descriptor,
   inspected=await inspectResearchPaidArchive({path:await selectedMember(root,'publications/'+item.id+'/archive/'+archive.name),
    expectedSha256:archive.sha256,expectedBytes:archive.bytes});
  checkPublicationArchive(published,inspected);
 }
 need(required.size===roster.size,'RESEARCH_QUOTE_HANDOVER_UNRELATED_FILE');
 return {schema:'sf88-research-quotation-handover-inspected/v1',directory:root,manifestSha256:retained.sha256,
  manifestBytes:retained.bytes,manifest,selection:selected,files,programme,caseRecord,
  caseInspection:{schema:caseInspection.schema,source:caseInspection.source,sha256:caseInspection.sha256},customer,operations};
}
/** Copy the entire retained bundle before selecting any receiving writer. */
export function copyResearchQuoteHandover({sourceDirectory,directory,manifestSha256}={}){
 if(manifestSha256!==undefined)hash(manifestSha256);
 const source=sourceDirectory?resolve(sourceDirectory):null,target=resolve(directory);
 if(source)researchQuoteDistinctDirectories(source,target);
 return withCustomerOperation(target,async root=>{
  need(!await exists(join(root,'programme-input.json'))&&!await exists(join(root,'programme.json'))&&
   !await exists(join(root,'input.json'))&&!await exists(join(root,'request.json'))&&!await exists(join(root,'export.json'))&&
   !await exists(join(root,'package-request.json'))&&!await exists(join(root,'receiving-input.json'))&&
   !await exists(join(root,'receiving-request.json'))&&!await exists(join(root,'input','handover-copy.json'))&&
   !await exists(join(root,'input','quotation-programme.json'))&&
   (!await exists(join(root,'package-input.json'))||await exists(join(root,'quotation-programme.json'))||
    await exists(join(root,'handover-copy.json'))),'RESEARCH_QUOTE_DISTINCT_DIRECTORY_REQUIRED');
  if(await exists(join(root,'quotation-programme.json'))){
   const saved=await inspectResearchQuoteHandover(root,{manifestSha256});
   if(source&&await exists(join(source,'quotation-programme.json'))){
    const current=await readCustomerJson(join(source,'quotation-programme.json'),QUOTE_FILE_LIMIT);
    need(current.sha256===saved.manifestSha256,'RESEARCH_QUOTE_HANDOVER_SOURCE_CHANGED');
   }
   return {...saved,reused:true};
  }
  need(source,'RESEARCH_QUOTE_HANDOVER_SOURCE_REQUIRED');
  const inspected=await inspectResearchQuoteHandover(source,{manifestSha256}),binding={
   schema:'sf88-research-quotation-handover-copy/v1',manifestSha256:inspected.manifestSha256,manifestBytes:inspected.manifestBytes,
   selection:inspected.selection,files:inspected.manifest.files};
  await retain(root,'handover-copy.json',binding);
  for(const file of inspected.files)await copyMember(root,file.name,file);
  await copyCustomerFile(join(source,'quotation-programme.json'),join(root,'quotation-programme.json'),
   {sha256:inspected.manifestSha256,bytes:inspected.manifestBytes,maximum:QUOTE_FILE_LIMIT});
  return {...await inspectResearchQuoteHandover(root,{manifestSha256:inspected.manifestSha256}),reused:false};
 });
}
