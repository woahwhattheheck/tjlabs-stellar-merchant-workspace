// MIT. Source-owned typed tools for complete Tourism operations and retained originals.
export const PREFIX='merchant_tourism_series_';
export const text=(maximum=4000,minimum=1)=>({type:'string',minLength:minimum,maxLength:maximum});
export const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const list=items=>({type:'array',items}),choice=values=>({type:'string',enum:values});
const id=text(128),hash={type:'string',pattern:'^[a-f0-9]{64}$'},alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},integer={type:'integer',minimum:0};
const strings={type:'object',additionalProperties:text(1000000,0)},indexes={type:'object',additionalProperties:integer};
const common={operationId:id,expectedRevision:integer,at:text(64)};
const observed={expectedRevision:integer,expectedHead:hash},page={offset:integer,limit:{type:'integer',minimum:1,maximum:200}};
const selection={registryId:id,sourceIds:list(id)},analysis={...selection,kind:choice(['sum','difference','percentage_change','ratio','reconcile']),rowIds:list(id),dimension:text(100),partitionId:id,ratioPairId:id,reconciliationId:id,tolerance:text(120)};
const titled={id,title:text(300),actor:text(300),note:text(20000,0)};
export const mutationSchemas={
 import_file:object({...common,id,filename:text(240),mime_type:text(200),source_url:text(4000,0),publisher:text(1000,0),published_at:text(64,0),retrieved_at:text(64),representation:choice(['original','authored_transcription','extracted_text']),note:text(20000,0)},[...Object.keys(common),'id','filename','mime_type','retrieved_at','representation']),
 import_csv:object({...common,id,role:choice(['source','target']),filename:text(240)},[...Object.keys(common),'id','role','filename']),
 save_registry:object({...common,registry:{type:'object',additionalProperties:true}},[...Object.keys(common),'registry']),
 save_mapping:object({...common,sourceId:id,registryId:id,columns:indexes,constants:strings},[...Object.keys(common),'sourceId','registryId','columns','constants']),
 save_correction:object({...common,sourceId:id,rowId:id,column:integer,value:text(1000000,0),actor:text(300),reason:text(20000)},[...Object.keys(common),'sourceId','rowId','column','value','actor','reason']),
 save_analysis:object({...common,...titled,analysis:object(analysis,['registryId','sourceIds','kind','rowIds'])},[...Object.keys(common),...Object.keys(titled),'analysis']),
 save_report:object({...common,...titled,analysisIds:list(id)},[...Object.keys(common),...Object.keys(titled),'analysisIds']),
 prepare_target:object({...common,id,...selection,rowIds:list(id),templateFileId:id,columns:list(object({column:integer,field:text(128),constant:text(1000000,0)},['column'])),keyColumns:list(integer),actor:text(300),note:text(20000,0)},[...Object.keys(common),'id','registryId','sourceIds','rowIds','templateFileId','columns','keyColumns','actor','note']),
 record_target_return:object({...common,id,planId:id,sourceId:id,columns:list(object({preparedColumn:integer,returnedColumn:integer},['preparedColumn','returnedColumn'])),actor:text(300),note:text(20000,0)},[...Object.keys(common),'id','planId','sourceId','columns','actor','note'])
};
export const actionNames={import_file:'importFile',import_csv:'importCsv',save_registry:'saveRegistry',save_mapping:'saveMapping',save_correction:'saveCorrection',save_analysis:'saveAnalysis',save_report:'saveReport',prepare_target:'prepareTarget',record_target_return:'recordTargetReturn'};
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
export function tourismTools(tool){
 const make=(name,description,props,required=[],write=false)=>tool(PREFIX+name,description,props,required,{readOnly:!write,idempotent:true});
 const ws={workspace:alias},pin={...ws,...observed};
 return[
  make('workspaces','List configured original Tourism workspaces and pinned original inputs.',{},[]),
  make('status','Read current revision/head, original logical identity, browser copy and unfinished forms.',ws,['workspace']),
  make('section','Page a whole original collection at a fixed observed revision and content head. Complete files remain downloadable.',{...pin,section:choice(['files','sources','registries','mappings','mappingHistory','corrections','analyses','reports','targetPlans','targetReturns','operations','drafts','selection']),...page},['workspace','expectedRevision','expectedHead','section']),
  make('rows','Page exact original CSV records and headers at one observed edition. Corrections remain separate history.',{...pin,sourceId:id,...page},['workspace','expectedRevision','expectedHead','sourceId']),
  make('project','Inspect source-qualified projected observations with full dimensions, findings and coverage.',{...pin,...selection,...page},['workspace','expectedRevision','expectedHead','registryId','sourceIds']),
  make('calculate','Calculate a qualified sum, difference, ratio or reconciliation against exact original selected observations.',{...pin,...analysis},['workspace','expectedRevision','expectedHead','registryId','sourceIds','kind','rowIds']),
  ...Object.entries(mutationSchemas).map(([name,schema])=>make(name,{
   import_file:'Retain a complete configured original binary/source/template file through the original engine and request journal.',
   import_csv:'Retain all original configured source or target CSV bytes/records without stripping BOM, blank cells or findings.',
   save_registry:'Save a complete immutable source-qualified metric/geography/method registry edition.',
   save_mapping:'Save explicit canonical column/constant mapping; preserve every previous mapping and source.',
   save_correction:'Record an attributed source-cell overlay without changing original CSV bytes.',
   save_analysis:'Save the complete selected qualified calculation and its exact original operands.',
   save_report:'Freeze complete selected analyses and their source identities in a readable report edition.',
   prepare_target:'Prepare all explicitly selected rows against the actual retained target template and key columns.',
   record_target_return:'Compare complete observed native target CSV rows against the original prepared export.'
  }[name],{...ws,...schema.properties,expectedHead:hash,...(['import_file','import_csv'].includes(name)?{input:alias,expectedSha256:hash}:{})},['workspace',...schema.required,...(['import_file','import_csv'].includes(name)?['input','expectedSha256']:[])],true)),
  make('apply_input','Apply a complete pinned host operation JSON when the original request is too large for tool arguments. Preserve its exact operationId and source bytes.',{...ws,operationId:id,input:alias,expectedSha256:hash,expectedHead:hash},['workspace','operationId','input','expectedSha256'],true),
  make('operation','Inspect the original prepared request and committed receipt at the current descendant.',{...ws,operationId:id},['workspace','operationId']),
  make('replay_operation','Resume the exact retained original request after interruption, including missing staging input and later workspace changes.',{...ws,operationId:id},['workspace','operationId'],true),
  make('file_read','Download every byte of a complete recovery, original file/CSV, report, target, observed return, working HTML, full ZIP or original operation through a retained snapshot.',{...ws,kind:choice(['workspace','source','original','report','target','returned','working-html','handover','operation']),id,operationId:id,...observed,readId:text(128),expectedSha256:hash,offset:integer,limit:{type:'integer',minimum:1,maximum:65536}},['workspace','kind']),
  make('file_release','Release one retained original file read when complete or cancelled.',{...ws,readId:text(128)},['workspace','readId'],true)
 ];
}
