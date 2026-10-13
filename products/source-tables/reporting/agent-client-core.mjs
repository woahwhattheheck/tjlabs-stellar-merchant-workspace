// MIT. Complete request and identity handling for the existing reporting provider.
// Filesystem custody and the unchanged merchant transport are in agent-client.mjs.
export const REPORTING_CLIENT_SCHEMA = 'stellar-forge.reporting-agent-client.v1';
const PREFIX = 'merchant_reporting_';
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MUTATIONS = new Set(['apply','receive_desk','receive_project','export']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code,message,details) => { throw Object.assign(new Error(message),{code:'REPORTING_CLIENT_'+code,...(details===undefined?{}:{details})}); };
const need = (condition,code,message,details) => { if(!condition)fail(code,message,details); };
export function canonicalReportingClientValue(value) {
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){need(Number.isFinite(value),'JSON','Retain finite complete JSON values.');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(canonicalReportingClientValue).join(',')+']';
  need(plain(value),'JSON','Retain complete ordinary JSON values.');
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalReportingClientValue(value[key])).join(',')+'}';
}
const clone = value => JSON.parse(canonicalReportingClientValue(value));
function freeze(value) { if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value; }
function schemaValue(value,schema,label) {
  const types=Array.isArray(schema.type)?schema.type:[schema.type];
  const matches=type=>type==='null'?value===null:type==='integer'?Number.isSafeInteger(value):type==='number'?typeof value==='number'&&Number.isFinite(value):type==='array'?Array.isArray(value):type==='object'?plain(value):typeof value===type;
  need(types.some(matches),'ARGUMENT',label+' has a different type from the installed tool catalogue.');
  if(value===null)return;
  if(schema.enum)need(schema.enum.includes(value),'ARGUMENT',label+' is not a declared choice.');
  if(typeof value==='string'){
    need((schema.minLength===undefined||value.length>=schema.minLength)&&(schema.maxLength===undefined||value.length<=schema.maxLength),'ARGUMENT',label+' is outside its declared text size.');
    if(schema.pattern)need(new RegExp(schema.pattern).test(value),'ARGUMENT',label+' does not match the declared tool format.');
    need(!value.isWellFormed||value.isWellFormed(),'ARGUMENT',label+' must contain complete Unicode characters.');
  }
  if(typeof value==='number')need((schema.minimum===undefined||value>=schema.minimum)&&(schema.maximum===undefined||value<=schema.maximum),'ARGUMENT',label+' is outside its declared numeric range.');
  if(Array.isArray(value)){
    need((schema.minItems===undefined||value.length>=schema.minItems)&&(schema.maxItems===undefined||value.length<=schema.maxItems),'ARGUMENT',label+' is outside its declared item count.');
    if(schema.items)value.forEach((item,index)=>schemaValue(item,schema.items,label+'['+index+']'));
  }
  if(plain(value)){
    const properties=schema.properties||{},required=schema.required||[];
    need(required.every(key=>Object.hasOwn(value,key)),'ARGUMENT',label+' is missing a required field.');
    for(const key of Object.keys(value)){
      if(Object.hasOwn(properties,key))schemaValue(value[key],properties[key],label+'.'+key);
      else need(schema.additionalProperties!==false,'ARGUMENT',label+' contains an undeclared field: '+key+'.');
    }
  }
}
function endpoint(value){need(typeof value==='string'&&value.trim()&&value.length<=4096&&!/[\u0000\r\n]/.test(value),'ENDPOINT','Select the original stable merchant endpoint identity.');return value;}
export function reportingPublication(value) {
  need(plain(value)&&HASH.test(value.publicationId||'')&&typeof value.operationId==='string'&&value.operationId&&['project','native','request','input'].includes(value.format),'PUBLICATION','Select the complete original publication.');
  need(value.projectSha256===null||HASH.test(value.projectSha256||''),'PUBLICATION','The publication must retain its selected project identity.');
  const file=value.file;
  need(plain(file)&&typeof file.name==='string'&&file.name&&file.name.length<=500&&!/[\\/\u0000-\u001f\u007f]/.test(file.name)&&file.name!=='.'&&file.name!=='..','PUBLICATION','The original publication filename must be a basename.');
  need(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&HASH.test(file.sha256||'')&&typeof file.type==='string'&&file.type,'PUBLICATION','Retain the complete original file size, digest and media type.');
  return clone(value);
}
/**
 * The caller supplies the original transport and installed catalogue, plus a
 * SHA-256 function over complete UTF-8 text. No file/HTTP substitute is created.
 */
export function createReportingProgrammeClientCore({transport,definitions,workspace,expectedNativeId,sha256}={}) {
  need(plain(transport)&&typeof transport.call==='function','TRANSPORT','Supply the original merchant call/endpoint transport.');
  const selectedEndpoint=endpoint(transport.endpoint);
  need(typeof workspace==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(workspace),'WORKSPACE','Select one configured reporting alias.');
  need(expectedNativeId===undefined||UUID.test(expectedNativeId),'WORKSPACE','Use the retained original native workspace UUID.');
  need(typeof sha256==='function','HASH','Supply the installed complete UTF-8 SHA-256 function.');
  need(Array.isArray(definitions)&&definitions.length,'CATALOGUE','Supply the original complete reporting catalogue.');
  const tools=new Map();
  for(const definition of definitions){
    need(Array.isArray(definition)&&definition.length>=4&&typeof definition[0]==='string'&&definition[0].startsWith(PREFIX)&&plain(definition[2])&&Array.isArray(definition[3]),'CATALOGUE','Use the original reporting definition tuples.');
    need(!tools.has(definition[0]),'CATALOGUE','Duplicate reporting tool definition.');
    tools.set(definition[0],{schema:{type:'object',properties:definition[2],required:definition[3],additionalProperties:false},annotations:definition[4]||{}});
  }
  let nativeId=expectedNativeId||null,instanceId=null;
  const selection=()=>freeze({endpoint:selectedEndpoint,workspace,nativeId,instanceId});
  function argsFor(action,input={}) {
    const tool=PREFIX+action,definition=tools.get(tool);
    need(definition,'TOOL','Select an operation in the installed reporting catalogue.');
    need(plain(input),'ARGUMENT','Supply complete tool arguments.');
    need(!Object.hasOwn(input,'workspace')||input.workspace===workspace,'WORKSPACE','A request cannot select another workspace.');
    const args=action==='workspaces'?clone(input):{...clone(input),workspace};
    schemaValue(args,definition.schema,tool);
    return {tool,args,definition};
  }
  function accept(action,value,args,{opening=false}={}) {
    need(plain(value),'REPLY','The original reporting tool must return a complete structured result.');
    if(action==='workspaces')return clone(value);
    need(value.workspace===workspace&&plain(value.native)&&UUID.test(value.native.id||'')&&Number.isSafeInteger(value.native.revision)&&value.native.revision>=0,'WORKSPACE_CHANGED','The reply must retain the selected workspace and native store.');
    if(nativeId)need(value.native.id===nativeId,'WORKSPACE_CHANGED','The original reporting store UUID changed.');
    else need(opening,'OPEN_REQUIRED','Open the selected original reporting workspace first.');
    need(UUID.test(value.instanceId||''),'INSTANCE','The original workspace lifetime is missing.');
    need(plain(value.project)&&(value.project.projectSha256===null||HASH.test(value.project.projectSha256||'')),'PROJECT','The original complete-project identity is missing.');
    if(!opening&&instanceId)need(value.instanceId===instanceId,'INSTANCE_CHANGED','The reporting lifetime changed. Open the same native store explicitly before continuing.');
    if(opening){nativeId=value.native.id;instanceId=value.instanceId;}
    if(value.operation){
      need(plain(value.operation)&&typeof value.operation.operationId==='string'&&HASH.test(value.operation.requestSha256||'')&&['prepared','complete','failed'].includes(value.operation.state),'OPERATION','The complete original operation identity is missing.');
      if(args.operationId)need(value.operation.operationId===args.operationId,'OPERATION_CHANGED','The reply belongs to another original operation.');
      need(MUTATIONS.has(value.operation.kind)&&[value.operation.beforeProjectSha256,value.operation.afterProjectSha256].every(pin=>pin===null||HASH.test(pin||''))&&Array.isArray(value.operation.inputFiles)&&Array.isArray(value.operation.publications),'OPERATION','Retain the complete original operation fields.');
      if(MUTATIONS.has(action))need(value.operation.kind===action,'OPERATION_CHANGED','The reply belongs to another operation kind.');
      if(action==='recover')need(value.operation.requestSha256===args.expectedRequestSha256,'OPERATION_CHANGED','Recovery returned another original request fingerprint.');
      value.operation.publications.forEach(reportingPublication);
    }
    if(value.publication)reportingPublication(value.publication);
    return clone(value);
  }
  async function raw(action,input,options={},opening=false) {
    need(transport.endpoint===selectedEndpoint,'ENDPOINT_CHANGED','The configured merchant endpoint changed.');
    const {tool,args}=argsFor(action,input);
    if(action!=='workspaces'&&action!=='open')need(nativeId&&instanceId,'OPEN_REQUIRED','Open the selected original reporting workspace first.');
    const value=await transport.call(tool,args,options);
    need(transport.endpoint===selectedEndpoint,'ENDPOINT_CHANGED','The configured merchant endpoint changed during the request.');
    return accept(action,value,args,{opening});
  }
  async function read(action,input={},options={}) {
    const {definition}=argsFor(action,input);
    need(definition.annotations.readOnly===true||action==='inspect_input','PREPARE_REQUIRED','Save the complete original request before a reporting mutation.');
    return raw(action,input,options);
  }
  async function prepare(action,input) {
    need(MUTATIONS.has(action),'PREPARE_KIND','Prepare apply, receive_desk, receive_project or export.');
    need(nativeId&&instanceId,'OPEN_REQUIRED','Open the selected original reporting workspace first.');
    const {tool,args}=argsFor(action,input);
    const value={schema:REPORTING_CLIENT_SCHEMA,endpoint:selectedEndpoint,workspace,nativeId,tool,args};
    const clientRequestSha256=await sha256(canonicalReportingClientValue(value));
    need(HASH.test(clientRequestSha256||''),'HASH','The selected SHA-256 function returned an invalid identity.');
    return freeze({...value,clientRequestSha256});
  }
  async function validatePrepared(value) {
    need(plain(value)&&value.schema===REPORTING_CLIENT_SCHEMA,'REQUEST','Open the complete prepared reporting client request.');
    const keys=['schema','endpoint','workspace','nativeId','tool','args','clientRequestSha256'];
    need(Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)),'REQUEST','Keep the complete original request fields.');
    need(value.endpoint===selectedEndpoint&&value.workspace===workspace&&UUID.test(value.nativeId||''),'REQUEST_SELECTION','The saved request belongs to another endpoint or workspace.');
    need(nativeId===value.nativeId&&instanceId,'WORKSPACE_CHANGED','Open the exact retained native store before dispatch.');
    need(typeof value.tool==='string'&&value.tool.startsWith(PREFIX),'TOOL','The saved tool name differs.');
    const action=value.tool.slice(PREFIX.length);
    need(MUTATIONS.has(action),'PREPARE_KIND','The saved request is not a declared reporting mutation.');
    const built=argsFor(action,value.args);
    need(canonicalReportingClientValue(built.args)===canonicalReportingClientValue(value.args),'REQUEST','The saved arguments changed.');
    const {clientRequestSha256,...original}=value;
    need(HASH.test(clientRequestSha256||'')&&await sha256(canonicalReportingClientValue(original))===clientRequestSha256,'REQUEST_CHANGED','The complete saved client request differs from its retained SHA-256.');
    return freeze(clone(value));
  }
  async function invoke(value,options={}) {
    const prepared=await validatePrepared(value);
    return raw(prepared.tool.slice(PREFIX.length),prepared.args,options);
  }
  async function recover(value,operation,options={}) {
    const prepared=await validatePrepared(value);
    need(plain(operation)&&operation.operationId===prepared.args.operationId&&HASH.test(operation.requestSha256||''),'RECOVERY','Select the exact original host operation and its returned request fingerprint.');
    return raw('recover',{operationId:operation.operationId,expectedRequestSha256:operation.requestSha256},options);
  }
  async function readAll(action,{limit=100,...input}={},options={}) {
    need(['inputs','history','publications'].includes(action),'COLLECTION','Select a declared reporting collection.');
    const items=[];let offset=0,total=null,revision=null,last;
    for(;;){
      last=await read(action,{...input,offset,limit},options);
      need(Array.isArray(last.items)&&plain(last.page)&&last.page.offset===offset&&last.page.limit===limit&&Number.isSafeInteger(last.page.total)&&last.page.total>=0,'PAGE','The provider returned an incomplete collection page.');
      if(total===null){total=last.page.total;revision=last.native.revision;}
      need(last.page.total===total&&last.native.revision===revision,'COLLECTION_CHANGED','The reporting collection changed while reading. Select its current complete edition again.');
      need(last.items.length<=limit&&offset+last.items.length<=total,'PAGE','The collection page count differs.');
      items.push(...last.items);
      if(last.page.nextOffset===null){need(items.length===total,'PAGE','The complete reporting collection is missing items.');break;}
      need(Number.isSafeInteger(last.page.nextOffset)&&last.page.nextOffset===offset+last.items.length&&last.page.nextOffset>offset,'PAGE','The collection cursor did not advance through every item.');
      offset=last.page.nextOffset;
    }
    return {...last,items,page:{offset:0,limit:items.length,total,nextOffset:null}};
  }
  return Object.freeze({
    selection,
    workspaces:(options={})=>read('workspaces',{},options),
    open:(options={})=>raw('open',{},options,true),
    status:(options={})=>read('status',{},options),
    inspectInput:(input,expectedSha256,options={})=>read('inspect_input',{input,expectedSha256},options),
    release:(readId,options={})=>raw('file_release',{readId},options),
    read,readAll,prepare,validatePrepared,invoke,recover,
    operation:(operationId,options={})=>read('operation',{operationId},options),
    publication:async(publicationId,options={})=>{const value=await read('publication',{publicationId},options);need(value.publication?.publicationId===publicationId,'PUBLICATION_CHANGED','The returned publication identity differs.');return value;},
    close:async(options={})=>{need(instanceId,'OPEN_REQUIRED','Select the originally opened lifetime.');const value=await raw('close',{instanceId},options);instanceId=null;return value;}
  });
}
