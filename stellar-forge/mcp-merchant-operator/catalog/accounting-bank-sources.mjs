// MIT. Authenticated, configured original source preparations; financial receiving stays explicit.
const P='merchant_accounting_bank_sources_';
const text=(max,min=0)=>({type:'string',minLength:min,maxLength:max}),hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'},alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const obj=(properties={},required=[],additionalProperties=false)=>({type:'object',properties,required,additionalProperties});
const array=(items,maxItems,minItems=0)=>({type:'array',items,maxItems,minItems}),number=(minimum=0,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const base={workspace:alias},paging={offset:number(),limit:number(1,100)},original=obj({},[],true);
const mapping=obj({format:{type:'string',enum:['OFX','QFX','CSV','CAMT053']},columns:original},['format','columns'],true);
const inputCommon={key:alias,name:text(240,1),bytes:number(1,192000000),sha256:hash};
const reference={anyOf:[obj({...inputCommon,sourceAlias:alias},['key','name','bytes','sha256','sourceAlias']),obj({...inputCommon,preparationId:uuid,file:text(240,1)},['key','name','bytes','sha256','preparationId','file'])]};
const sourceRequest=obj({workspaceId:hash,requestId:uuid,actor:text(1000,1),kind:{type:'string',enum:['collection_prepare','collection_edit','collection_receive','collection_inspect','profile_save','profile_receive','profile_review','profile_apply']},
 inputs:array(reference,1000),parameters:obj({collectionId:uuid,libraryId:uuid,profileId:uuid,name:text(160,1),reason:text(4000,1),expectedRevision:number(),expectedVersion:number(),version:number(1),itemIds:array(uuid,1000,1),mapping,
 files:array(obj({id:uuid,sourceKey:alias,mapping,included:{type:'boolean'},note:text(4000)},['id','sourceKey','mapping','included','note']),1000,1),
 items:array(obj({id:uuid,mapping,included:{type:'boolean'},note:text(4000)},['id']),1000)})},['workspaceId','requestId','actor','kind','inputs','parameters']);
const read=(name,description,fields={},required=[])=>[P+name,description,{...base,...fields},['workspace',...required],{readOnly:true,idempotent:true}];
const change=(name,description,fields,required)=>[P+name,description,{...base,...fields},['workspace',...required],{idempotent:true}];
export const bankSourcesFileSelectors=Object.freeze(['bankSourcePreparationId']);
export const bankSourcesDefinitions=[
 read('status','Read configured receivablesInputs aliases and complete source-preparation byte/file limits in the existing accounting workspace.'),
 read('source','Read one configured original source to obtain its exact byte length/SHA. This read does not reserve the file. prepare accepts it only if the exact reviewed bytes still match.',{sourceAlias:alias,name:text(240,1)},['sourceAlias','name']),
 read('list','Page original source-preparation receipts. Bind inventorySha256 across pages; request verifies complete custody. No bank posting is created.',paging),
 change('prepare','Retain the exact reviewed source request and every original configured or previously retained input before executing. Same requestId resumes only its own matching original input pins; RETAINING means copies are still incomplete.',{request:sourceRequest},['request']),
 change('execute','Execute one exact prepared request through unchanged profile, collection and parser engines. Preserve expectedRequestSha256. Existing output files and complete results are byte-verified and reused after a lost response.',{preparationId:uuid,expectedRequestSha256:hash},['preparationId','expectedRequestSha256']),
 read('request','Recover the same original preparation. Returns NOT_FOUND, RETAINING, PREPARED or COMPLETE with exact full-file pins; changed input/output custody is an explicit error.',{preparationId:uuid},['preparationId']),
 read('view','Read complete bounded pages of original collections, library versions, profile changes or all parsed statements/rows/pending/excluded/issues. A large single row directs download of its exact full report. No original row is clipped.',{preparationId:uuid,section:{type:'string',enum:['items','statements','rows','pending','excluded','issues']},itemId:uuid,profileId:uuid,statementId:text(240,1),...paging},['preparationId'])
];
