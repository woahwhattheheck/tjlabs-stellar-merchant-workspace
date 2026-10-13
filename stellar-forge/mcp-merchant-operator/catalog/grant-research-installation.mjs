// SPDX-License-Identifier: MIT
// Lightweight schemas; actual source bytes remain in host aliases or retained files.
const str=(n=300)=>({type:'string',maxLength:n});
const requiredText=(n=300)=>({...str(n),minLength:1});
const sha={type:'string',pattern:'^[a-f0-9]{64}$'};
const id=prefix=>({type:'string',pattern:'^'+prefix+'-[a-f0-9]{32}$'});
const exactId=prefix=>({type:'string',pattern:'^'+prefix+'-[a-f0-9]{64}$'});
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const ws={workspace:{type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},caseId:id('operation'),draftId:id('source-desk')};
const base=Object.keys(ws);
const input={type:'object',additionalProperties:false,properties:{hostInput:str(64),snapshotId:str(100),transferId:str(100),sourceWorkspace:str(64)},
  oneOf:[{required:['hostInput']},{required:['snapshotId']},{required:['transferId']}]};
function tool(name,description,properties,required,readOnly=true){return {
  name:'merchant_grant_research_installation_'+name,description,
  inputSchema:{type:'object',additionalProperties:false,properties:{...ws,...properties},required:[...base,...required]},
  annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:true,openWorldHint:false}};}
const request={requestId:uuid,actor:requiredText(300)};
const file={fileId:exactId('research'),expectedSha256:sha};
const archive={preparationId:exactId('preparation'),installationId:id('installation'),revision:{type:'integer',minimum:1,maximum:500},expectedSha256:sha};
export const grantResearchInstallationTools=[
 tool('import','Receive one complete original Research project (480 MiB), issued package (256 MiB) or customer return (256 MiB). Use a declared research-project/research-issued-package/research-customer-return host alias, completed exact input transfer or retained snapshot. The original request UUID, actor, observed time and full SHA remain authoritative. No draft revision or Installation save occurs.',{
  ...request,kind:{enum:['project','issued-package','customer-return']},name:requiredText(200),
  input,expectedInputSha256:sha,sourceUrl:str(4000),observedAt:{type:'string',format:'date-time'}},
  [...Object.keys(request),'kind','name','input','expectedInputSha256','sourceUrl','observedAt'],false),
 tool('request','Recover this exact original upload receipt and distinguish NOT_RECORDED, INPUT_RETAINED and COMPLETE. Keep the same original operator and UUID.',request,Object.keys(request)),
 tool('resume','Resume the original INPUT_RETAINED upload without sending its source body again. COMPLETE returns its retained original result.',request,Object.keys(request),false),
 tool('original_request','Read an immutable original Source Desk request from a received archive. This historical record is never replayed against the new receiving case.',
  {requestId:requiredText(100)},['requestId']),
 tool('inspect','Inspect a complete original source by its opaque research-ID and separately bound source SHA. All source graph validation is native; original bodies remain downloadable.',file,Object.keys(file)),
 tool('template','Derive a whole editable Installation document from the actual selected Workshare and current native case/Installation. This prepares no implicit source attachment or save.',{
  body:{type:'object',additionalProperties:false,properties:{
    expectedVersion:{type:'integer',minimum:1,maximum:10000000},sourceId:id('source'),expectedSourceSha256:sha,
    packetSourceId:{anyOf:[id('source'),{type:'null'}]},expectedPacketSha256:{anyOf:[sha,{type:'null'}]},
    workshareCaseId:requiredText(500),installationId:{anyOf:[id('installation'),{type:'null'}]},
    expectedRevision:{type:'integer',minimum:0,maximum:500},document:{type:'object',additionalProperties:true}},
    required:['expectedVersion','sourceId','expectedSourceSha256','workshareCaseId','installationId','expectedRevision']}},
  ['body']),
 tool('file_describe','Describe the exact original full source, retaining its opaque file ID, actual size and complete SHA256.',file,Object.keys(file)),
 tool('file','Stream the complete source into original retained-file custody and return its snapshot/chunk-reader reference. No full source is emitted in agent JSON.',file,Object.keys(file)),
 tool('archive_describe','Freeze and describe one full native receiving archive for the selected actual saved Installation. Keep the returned SHA for subsequent download; up to 2 GiB of complete original files and histories remains intact.',
  archive,['preparationId','installationId','revision'],false),
 tool('archive','Stream the exact previously described complete receiving archive to the existing private retained-file store. The returned file_read reference supports bounded chunks, release and restart with the same full SHA; no large JSON body.',
  archive,Object.keys(archive))
];
