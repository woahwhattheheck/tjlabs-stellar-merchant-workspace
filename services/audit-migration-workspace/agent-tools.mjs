// MIT. Source-owned typed tools for the original Audit engine and complete file transport.
export const PREFIX='merchant_audit_migration_';
export const text=(maximum=4000,minimum=1)=>({type:'string',minLength:minimum,maxLength:maximum});
export const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const list=items=>({type:'array',items}),choice=values=>({type:'string',enum:values});
const id=text(1000),operationId=text(128),hash={type:'string',pattern:'^[a-f0-9]{64}$'},alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},integer={type:'integer',minimum:0};
const roles=['universe','plans','engagements','controls','tests','findings','actions','documents','principals','access_rules','history','relations'];
const sections=['files','sources','mappings','corrections','selections','reviews','contracts','preparations','returns','operations','drafts','selection'];
const common={operationId,expectedRevision:integer,at:text(64),actor:text(300)};
const observed={expectedRevision:integer,expectedHead:hash},paging={offset:integer,limit:{type:'integer',minimum:1,maximum:200}};
const selector=object({column:integer,constant:text(1000000,0)});
const reference=object({id,relation:text(1000),purpose:choice(['principal','protected','subject','from','to','attachment','other']),targetRole:choice(roles),targetNamespace:text(1000),key:list(selector),required:{type:'boolean'}},['id','relation','purpose','targetRole','targetNamespace','key','required']);
const basis=object({status:choice(['unconfirmed','source-declared']),sourceFileIds:list(id),note:text(16000,0)},['status','sourceFileIds','note']);
const evidenceBasis=object({...basis.properties,externalReferences:list(object({namespace:text(1000),parts:list(text(1000000,0)),reason:text(16000),locator:text(4000)},['namespace','parts','reason','locator']))},basis.required);
const targetSelector=object({field:text(1000),column:integer,keyIndex:integer,constant:text(1000000,0),referenceId:id,crosswalkId:id,index:integer});
const targetTable=object({id,mappingId:id,templateFileId:id,keyColumns:list(integer),columns:{type:'object',additionalProperties:targetSelector},referenceBindings:list(object({referenceId:id,columns:list(integer),targetTableId:id},['referenceId','columns','targetTableId']))},['id','mappingId','templateFileId','keyColumns','columns','referenceBindings']);
export const mutationSchemas={
 import_file:object({...common,fileId:id,filename:text(500),mimeType:text(200),purpose:text(4000),sourceUrl:text(4000,0),representation:choice(['original','authored-transcription','authored-example'])},[...Object.keys(common),'filename','mimeType','purpose']),
 import_csv:object({...common,fileId:id,filename:text(500),purpose:text(4000),sourceUrl:text(4000,0),representation:choice(['original','authored-transcription','authored-example']),side:choice(['source','target','reference']),role:choice(roles)},[...Object.keys(common),'filename','side','role']),
 save_mapping:object({...common,sourceId:id,namespace:text(1000),keyColumns:list(integer),fields:{type:'object',additionalProperties:selector},references:list(reference),note:text(16000,0)},[...Object.keys(common),'sourceId','namespace','keyColumns','fields','references','note']),
 save_correction:object({...common,sourceId:id,rowId:id,column:integer,expectedValue:{type:['string','null'],maxLength:1000000},value:text(1000000,0),reason:text(8000)},[...Object.keys(common),'sourceId','rowId','column','expectedValue','value','reason']),
 save_selection:object({...common,mappingIds:list(id),fileIds:list(id),roles:object(Object.fromEntries(roles.map(role=>[role,object({status:choice(['included','not-supplied','not-applicable']),reason:text(16000)},['status','reason'])])),roles),declaredAcyclicRelations:list(text(1000)),permissionBasis:basis,historyBasis:basis,evidenceBasis,note:text(16000,0)},[...Object.keys(common),'mappingIds','fileIds','roles','declaredAcyclicRelations','permissionBasis','historyBasis','evidenceBasis','note']),
 save_review:object({...common,selectionId:id,decision:choice(['accepted','needs-work']),note:text(16000)},[...Object.keys(common),'selectionId','decision','note']),
 save_contract:object({...common,selectionId:id,title:text(1000),authority:choice(['supplier-provided','authored-example']),sourceFileIds:list(id),crosswalks:list(object({id,fileId:id,sourceRole:choice(roles),sourceNamespace:text(1000),sourceKeyColumns:list(integer),targetColumns:list(integer)},['id','fileId','sourceRole','sourceNamespace','sourceKeyColumns','targetColumns'])),tables:list(targetTable),note:text(16000,0)},[...Object.keys(common),'selectionId','title','authority','sourceFileIds','crosswalks','tables','note']),
 prepare_target:object({...common,contractId:id,reviewId:id,note:text(16000)},[...Object.keys(common),'contractId','reviewId','note']),
 record_return:object({...common,preparationId:id,tables:list(object({tableId:id,fileId:id,columns:{type:'object',additionalProperties:{type:['integer','null'],minimum:0}}},['tableId','fileId','columns'])),submissionReference:text(4000,0),note:text(16000)},[...Object.keys(common),'preparationId','tables','submissionReference','note'])
};
export const actionNames={import_file:'importFile',import_csv:'importCsv',save_mapping:'saveMapping',save_correction:'saveCorrection',save_selection:'saveSelection',save_review:'saveReview',save_contract:'saveContract',prepare_target:'prepareTarget',record_return:'recordReturn'};
export function validate(value,schema,at='arguments'){
 const type=value===null?'null':Array.isArray(value)?'array':typeof value;
 const expected=Array.isArray(schema.type)?schema.type:[schema.type];
 if(!expected.includes(type)&&!(Number.isInteger(value)&&expected.includes('integer')))throw Error(at+' has the wrong type.');
 if(schema.enum&&!schema.enum.includes(value))throw Error(at+' must use one declared value.');
 if(typeof value==='number'&&(!Number.isFinite(value)||(expected.includes('integer')&&!Number.isSafeInteger(value))||(schema.minimum!==undefined&&value<schema.minimum)||(schema.maximum!==undefined&&value>schema.maximum)))throw Error(at+' is outside the supported number range.');
 if(type==='string'&&((schema.minLength!==undefined&&value.length<schema.minLength)||(schema.maxLength!==undefined&&value.length>schema.maxLength)||(schema.pattern&&!new RegExp(schema.pattern).test(value))))throw Error(at+' has an invalid complete string.');
 if(type==='array'){for(let i=0;i<value.length;i++)validate(value[i],schema.items,at+'['+i+']');}
 if(type==='object'&&value!==null){for(const key of schema.required??[])if(!Object.hasOwn(value,key))throw Error(at+'.'+key+' is required.');for(const [key,item]of Object.entries(value)){const field=schema.properties?.[key];if(field)validate(item,field,at+'.'+key);else if(schema.additionalProperties===false)throw Error(at+'.'+key+' is not an original field.');else if(schema.additionalProperties&&typeof schema.additionalProperties==='object')validate(item,schema.additionalProperties,at+'.'+key);}}
}

export function auditTools(tool){
 const make=(name,description,props,required=[],write=false)=>tool(PREFIX+name,description,props,required,{readOnly:!write,idempotent:true});
 const ws={workspace:alias},pin={...ws,...observed};
 return[
  make('workspaces','List configured original audit workspaces and exact original inputs.',{},[]),
  make('status','Read logical identity, current revision/head, independent browser copy and unfinished forms.',ws,['workspace']),
  make('section','Page a full source/history collection at one observed revision. Use file_read for complete large rows.',{...pin,section:choice(sections),...paging},['workspace','expectedRevision','expectedHead','section']),
  make('rows','Read exact effective source cells with original headers and correction identities; original bytes remain separately retained.',{...pin,sourceId:id,...paging},['workspace','expectedRevision','expectedHead','sourceId']),
  make('analyse','Page complete source-qualified records, findings, relationships, document/permission/history witnesses from a saved scope. Readiness is structural, not an audit opinion.',{...pin,selectionId:id,part:choice(['records','issues','edges','cycles','documents','permissions','history']),...paging},['workspace','expectedRevision','expectedHead','selectionId']),
  make('target','Inspect the actual supplied target contract, prepared rows and reference/key findings before freezing it.',{...pin,contractId:id,part:choice(['tables','rows','issues','crosswalks']),tableId:id,...paging},['workspace','expectedRevision','expectedHead','contractId']),
  ...Object.entries(mutationSchemas).map(([name,schema])=>make(name,{
   import_file:'Retain every byte of an original configured evidence, policy, template or returned file.',
   import_csv:'Retain complete original CSV headers, duplicate columns, raw rows and explicit neutral role/side.',
   save_mapping:'Save exact source columns, compound keys and declared relationships as an immutable mapping.',
   save_correction:'Apply an attributed exact expected-cell correction; preserve missing versus empty and every original byte.',
   save_selection:'Freeze explicit coverage for every neutral role, source mapping, evidence and source-declared permission/history basis.',
   save_review:'Record an attributed complete source review; accepted requires the same structurally ready current scope.',
   save_contract:'Retain actual supplier template/key/crosswalk/reference mapping for every included source mapping.',
   prepare_target:'Freeze complete prepared CSV files and source row bindings under the accepted current review; never dispatch a vendor write.',
   record_return:'Compare complete original returned files against the exact frozen preparation, retaining all missing/changed/extra/unconfirmed data.'
  }[name],{...ws,...schema.properties,expectedHead:hash,...(['import_file','import_csv'].includes(name)?{input:alias,expectedSha256:hash}:{})},['workspace',...schema.required,...(['import_file','import_csv'].includes(name)?['input','expectedSha256']:[])],true)),
  make('apply_input','Apply a complete pinned operation JSON through the original writer when its complete request is too large for a tool argument.',{...ws,operationId,input:alias,expectedSha256:hash,expectedHead:hash},['workspace','operationId','input','expectedSha256'],true),
  make('operation','Read the original prepared request/committed receipt at a later descendant.',{...ws,operationId},['workspace','operationId']),
  make('replay_operation','Continue the exact retained original request after interruption or missing staging; preserve later history.',{...ws,operationId},['workspace','operationId'],true),
  make('file_read','Read every byte of complete recovery, section, analysis, supplied target preview, original CSV/binary, report, prepared table, actual return, working HTML/ZIP or original request.',{...ws,kind:choice(['workspace','source','original','section','analysis','target-preview','report','target','returned','working-html','handover','operation']),id,section:choice(sections),tableId:id,selectionId:id,preparationId:id,returnId:id,operationId,...observed,readId:text(128),expectedSha256:hash,offset:integer,limit:{type:'integer',minimum:1,maximum:65536}},['workspace','kind']),
  make('file_release','Release one complete retained file read after download or cancellation.',{...ws,readId:text(128)},['workspace','readId'],true)
 ];
}
