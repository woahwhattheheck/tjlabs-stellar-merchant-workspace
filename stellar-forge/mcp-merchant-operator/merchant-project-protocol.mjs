// MIT. Metadata and arguments for the original managed Merchant project consumer.
import {MAX_RETAINED_CHUNK_BYTES} from './retained-file-contracts.mjs';
export const MERCHANT_PROJECT_PREFIX='merchant_project_';
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const sha={type:'string',pattern:'^[a-f0-9]{64}$'};
const id={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'};
const page={type:'integer',minimum:1,maximum:100};
const selection={type:'object',properties:Object.fromEntries(['q','state','from','to','assetId','network'].map(key=>[key,{type:'string'}])),additionalProperties:false};
const definitions={
 projects:[{},[]],
 status:[{project:alias},['project']],
 inventory:[{project:alias,offset:{type:'integer',minimum:0,maximum:999999999},limit:page,
   filter:{type:'string',maxLength:512}},['project']],
 receive:[{project:alias,expectedSelectionSha256:sha},['project','expectedSelectionSha256']],
 manifest:[{project:alias},['project']],
 receipt:[{project:alias},['project']],
 register:[{project:alias,selection,limit:{type:'integer',minimum:1,maximum:200},
   cursor:{type:'string'},revision:{type:'string'}},['project']],
 invoice:[{project:alias,invoiceId:id},['project','invoiceId']],
 envelope:[{project:alias,invoiceId:id},['project','invoiceId']],
 result:[{project:alias,invoiceId:id},['project','invoiceId']],
 register_export:[{project:alias,selection,revision:{type:'string',minLength:1},format:{type:'string',enum:['json','csv']}},
   ['project','revision','format']],
 artifacts:[{project:alias,after:sha,limit:{type:'integer',minimum:1,maximum:50}},['project']],
 file:[{project:alias,artifactId:sha,expectedSha256:sha,readId:{type:'string',maxLength:128},
   offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},['project','artifactId']],
 file_release:[{project:alias,readId:{type:'string',minLength:1,maxLength:128}},['project','readId']],
};
const descriptions={
 projects:'List host-declared original Merchant project connections. Returns aliases, labels and their selected archive identities without credentials or a native receiver.',
 status:'Read the existing managed archive-intake state, exact original selection and same receive operation. Read this after a lost receive response.',
 inventory:'Page every original archive member using the retained manifest identity. Continue nextOffset until null; a filter selects original member paths.',
 receive:'Send the managed desk’s one original receive request once, using its reviewed selection SHA. On an uncertain response read status, then explicitly resume this same operation. Native extraction and review remain owned by the original Application.',
 manifest:'Retain the complete native original project manifest as a byte-identifiable artifact. Use file for all original bytes.',
 receipt:'Retain the complete accepted original receiving receipt as an artifact. Requires the native receipt; does not create one.',
 register:'Read a revision-pinned page from the received readonly merchant invoice register using the maintained operator client. Continue with its page cursor and exact source revision.',
 invoice:'Retain the complete original invoice and history as an artifact, with a concise original-state summary.',
 envelope:'Retain the original invoice payment-request envelope as a complete private artifact. Makes no payment authorization or submission.',
 result:'Stream the complete verified original paid result into the configured private artifact directory through the maintained invoice client, retaining invoice and store identities.',
 register_export:'Export the exact reviewed invoice selection/revision as complete native JSON or CSV and retain its verified bytes. Use file to receive the whole original export.',
 artifacts:'Page complete retained agent document/result artifacts, including after the serving Application stops or this MCP process reopens.',
 file:'Receive exact SHA-pinned artifact bytes through the shared immutable native descriptor reader. Continue readId, expectedSha256 and nextOffset; after expiry reopen the same artifact/hash/offset.',
 file_release:'Release this process’s original temporary read descriptor. The complete retained customer artifact remains available.',
};
export function merchantProjectTools(tool) {
 return Object.entries(definitions).map(([kind,[properties,required]])=>tool(MERCHANT_PROJECT_PREFIX+kind,
   descriptions[kind],properties,required,{readOnly:kind!=='receive',idempotent:true,openWorld:false}));
}
function valid(value,schema) {
 if(schema.type==='string')return typeof value==='string'&&
   (!schema.pattern||new RegExp(schema.pattern).test(value))&&
   (schema.minLength===undefined||value.length>=schema.minLength)&&
   (schema.maxLength===undefined||value.length<=schema.maxLength)&&
   (!schema.enum||schema.enum.includes(value));
 if(schema.type==='integer')return Number.isSafeInteger(value)&&value>=schema.minimum&&
   (schema.maximum===undefined||value<=schema.maximum);
 if(schema.type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
   Object.keys(value).every(key=>Object.hasOwn(schema.properties,key)&&valid(value[key],schema.properties[key]));
 return false;
}
export function merchantProjectArguments(kind,value) {
 const definition=definitions[kind];
 if(!definition||value===null||typeof value!=='object'||Array.isArray(value)||
   !definition[1].every(key=>Object.hasOwn(value,key))||
   !Object.keys(value).every(key=>Object.hasOwn(definition[0],key)&&valid(value[key],definition[0][key])))
   throw Object.assign(new TypeError('Use the declared original Merchant project arguments.'),{code:'MERCHANT_PROJECT_AGENT_ARGUMENTS'});
 return structuredClone(value);
}
