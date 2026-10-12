// MIT. Typed local operations over the retained CIIM desk model.
import {describeCiimDesk} from './model.mjs';
import {fault} from './portable.mjs';

const text=(description,maxLength=8192)=>({type:'string',minLength:1,maxLength,description});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const array=(items,maxItems=250000)=>({type:'array',items,minItems:1,maxItems,uniqueItems:true});
const id=text('Exact retained identity; no trimming, case folding or URL rewriting.',32768);
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const named=object({name:text('Recorded name.',512),reference:text('Original responsibility or source reference.',4096)});
const nullable=value=>({anyOf:[value,{type:'null'}]});
const revision={type:'integer',minimum:0};
const page={offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:250},
  status:{type:'string'},query:{type:'string',maxLength:2048}};
const review=(selection,{records=false}={})=>object({...selection,
  decision:{enum:records?['accept','exclude','needs_changes','reopen']:['accept','needs_changes','reopen']},
  authorityId:id,note:text('Named receiving decision and correction or exclusion reason.'),
  reference:text('Optional original decision reference.',4096)},
  [...Object.keys(selection),'decision','authorityId','note']);
const ACTION_SCHEMAS={
  'context.save':object({label:text('Receiving workspace label.',256),institution:nullable(named),
    receivingEnvironment:nullable(named),
    processingProfile:nullable(object({...named.properties,version:text('Selected institutional processing-profile version.',512)})),
    authorities:{type:'array',maxItems:200,items:object({id:text('Stable original authority ID.',128),...named.properties})},
    note:text('Reason for the context decision.')},['note']),
  'intake.import':object({candidateId:hash,label:text('Staff receiving label.',512),editionIds:array(id,1000)},['candidateId','label']),
  'workspace.restore':object({candidateId:hash,note:text('Reason for receiving the complete original workspace into this fresh desk.')}),
  'edition.review':review({editionId:id}),
  'profile.review':review({editionId:id,profileSha256:hash}),
  'records.review':{...review({editionId:id,recordIds:array(id),populationDigest:hash},{records:true}),
    required:['editionId','decision','authorityId','note'],
    oneOf:[{required:['recordIds'],not:{required:['populationDigest']}},{required:['populationDigest'],not:{required:['recordIds']}}]},
  'comparison.create':object({beforeEditionId:id,afterEditionId:id,label:text('Label for the two original editions.',512)}),
  'comparison.review':review({comparisonId:id}),
  'handback.create':object({label:text('Named receiving handback.',512),editionIds:array(id,1000),
    comparisonIds:{type:'array',items:id,maxItems:1000,uniqueItems:true},note:text('Handback scope and receiving instructions.'),authorityId:id},
    ['label','editionIds','note','authorityId']),
};
const actionEnvelope=(name,data)=>object({operationId:text('Stable original operation ID. Reuse unchanged after a lost response.',128),
  expectedRevision:revision,actor:text('Person recording this decision.',256),type:{const:name},data});
const reads=[
  {name:'desk.describe',description:'Read declared operations, exact original identity rules and limits.',inputSchema:object({})},
  {name:'desk.state',description:'Read the retained receiving context, editions, reviews and handbacks.',inputSchema:object({})},
  {name:'desk.view',description:'Page a complete original population without changing selection.',inputSchema:object({
    view:{enum:['imports','editions','records','profiles','comparison','history','handbacks']},editionId:id,comparisonId:id,...page},['view'])},
  {name:'desk.record',description:'Read one original mapped record, complete metadata and source pointers.',inputSchema:object({editionId:id,recordId:id})},
  {name:'desk.prepare_import',description:'Retain and inspect complete original native, workspace or handback ZIP bytes.',inputSchema:object({
    archiveFile:text('Absolute original ZIP path.',4096),filename:text('Original filename.',512),sha256:hash,
    bytes:{type:'integer',minimum:1,maximum:536870912}},['archiveFile','filename'])},
  {name:'desk.export_workspace',description:'Export the complete current source, decisions and receiving history.',inputSchema:object({})},
  {name:'desk.export_handback',description:'Export the exact historical named handback at its original frozen revision.',inputSchema:object({handbackId:id})},
  {name:'desk.attachment',description:'Read exact original XML, native conversion, mapped page, profile or manifest bytes.',inputSchema:object({
    editionId:id,kind:{enum:['xml','native','mapped','profile','manifest','operation','source']},id},['editionId','kind'])},
];
export const CIIM_DESK_OPERATIONS=Object.freeze([
  ...reads.map(value=>Object.freeze({...value,readOnly:!['desk.prepare_import','desk.export_workspace','desk.export_handback'].includes(value.name)})),
  ...Object.entries(ACTION_SCHEMAS).map(([name,data])=>Object.freeze({name,readOnly:false,
    description:name==='workspace.restore'?'Restore complete original identity/history into a fresh revision-zero desk; exact operation replay is retained.':
      name==='handback.create'?'Freeze the whole selected review population, named context and complete original input coverage.':
      'Record '+name+' in the same retained desk transaction and revision history.',
    inputSchema:actionEnvelope(name,data)})),
]);
export function describeDeskOperations() {
  return {schema:'tjl.ciim.desk-operations.v1',desk:describeCiimDesk(),
    operations:structuredClone(CIIM_DESK_OPERATIONS),
    errors:{fields:['code','message','status','details'],validation:400,missing:404,conflict:409,limit:413},
    replay:'Keep the complete original write request and operationId unchanged. A saved operation replays before revision checking.',
    exports:'Export results name private local files for the caller to stream; paths are not public download URLs.'};
}
function inputObject(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw fault('OPERATION_ARGUMENTS','Supply one declared operation argument object.');
}
function noExtra(value,keys){inputObject(value);if(Object.keys(value).some(key=>!keys.includes(key)))throw fault('OPERATION_ARGUMENTS','Use the declared operation arguments.');}
/** A typed adapter; every decision still executes in the original model transaction. */
export async function executeDeskOperation(desk,{name,arguments:args={}}={}) {
  inputObject(args);
  if(Object.hasOwn(ACTION_SCHEMAS,name)) {
    if(args.type!==name)throw fault('OPERATION_TYPE','The selected operation and original request type differ.');
    return desk.act(args);
  }
  if(name==='desk.describe'){noExtra(args,[]);return desk.describe();}
  if(name==='desk.state'){noExtra(args,[]);return desk.state();}
  if(name==='desk.view')return desk.view(args);
  if(name==='desk.record'){noExtra(args,['editionId','recordId']);return desk.record(args);}
  if(name==='desk.prepare_import'){noExtra(args,['archiveFile','filename','sha256','bytes']);return desk.prepareImport(args);}
  if(name==='desk.export_workspace'){noExtra(args,[]);return desk.exportWorkspace();}
  if(name==='desk.export_handback'){noExtra(args,['handbackId']);return desk.exportHandback(args);}
  if(name==='desk.attachment'){noExtra(args,['editionId','kind','id']);return desk.attachment(args);}
  throw fault('OPERATION_NOT_FOUND','Choose a declared receiving desk operation.',404);
}
