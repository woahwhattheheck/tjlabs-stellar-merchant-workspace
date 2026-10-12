// MIT. Complete original WordPress workflow; metadata imports no native runtime.
import {TOOL_PREFIX,UUID,SHA,ALIAS,MAX_RETAINED_CHUNK_BYTES,plain,need} from './contracts.mjs';
const str=(description,extra={})=>({type:'string',description,...extra});
const uuid=str('Exact original saved UUID.',{pattern:UUID}),sha=str('Exact original SHA-256.',{pattern:SHA});
const alias=str('Host-declared alias.',{pattern:ALIAS});
const uint=(description,maximum=Number.MAX_SAFE_INTEGER,minimum=0)=>({type:'integer',description,minimum,maximum});
const ws={workspace:alias},exp={...ws,exportId:sha};
export const wordpressActionNames=Object.freeze([
  'source.save','source.select','source.discover','capture.start','capture.resume','capture.pause',
  'mapping.save','edition.build','merchant.save','edition.export','product.select','source.packet','source.files',
  'refresh.plan.save','refresh.run.start','refresh.run.advance','refresh.run.review','refresh.run.export',
  'publisher.status','publisher.prepare','publisher.preview','publisher.reviewDraft','publisher.publish',
  'publisher.activateSnapshot','publisher.collect','publisher.release.stage','publisher.release.inspect',
  'publisher.release.activate','publisher.release.rollback','publisher.release.start','publisher.release.stop',
  'publisher.buyer.review','publisher.buyer.prepare','publisher.buyer.session','publisher.buyer.run',
  'publisher.buyer.recover','publisher.buyer.account','publisher.buyer.export'
]);
export const wordpressActionContract=Object.freeze({
  'source.save':['source'],'source.select':['sourceId'],'source.discover':['sourceId'],
  'capture.start':['sourceId','discoveryId','selection'],'capture.resume':['sourceId','captureId'],
  'capture.pause':['sourceId','captureId'],'mapping.save':['sourceId','captureId','expectedCaptureSha256','projection'],
  'edition.build':['mappingId','dataset','review'],'merchant.save':['editionId','origin','path','payment','reviewer','note'],
  'edition.export':['editionId','merchantId','productId','productLabel','reviewer','note'],
  'product.select':['productId'],'source.packet':[],
  'refresh.plan.save':['editionId','expectedSnapshot','label','note','merchantId','productId','limits','previousPlanId'],
  'refresh.run.start':['planId','label','baselineEditionId'],'refresh.run.advance':['runId'],
  'refresh.run.review':['runId','expectedReviewSha256','expectedCaptureSha256','decision','reviewer','note'],
  'refresh.run.export':['runId','reviewer','note','merchantId','productId'],
  'source.files':['packetId','merchantId','productId','productLabel','name','reviewer','note'],
  'publisher.status':['productId'],'publisher.prepare':['productId','exportId'],
  'publisher.preview':['productId','target','query'],
  'publisher.reviewDraft':['productId','draftId','expectedSnapshot','expectedRevision'],
  'publisher.publish':['productId','draftId','expectedSnapshot','expectedRevision'],
  'publisher.activateSnapshot':['productId','snapshot','expectedSnapshot','expectedRevision'],
  'publisher.collect':['productId'],'publisher.release.stage':['productId','draftId','id','label','runtime'],
  'publisher.release.inspect':['productId','id'],'publisher.release.activate':['productId','id','expectedGeneration'],
  'publisher.release.rollback':['productId','expectedGeneration'],'publisher.release.start':['productId','expectedGeneration'],
  'publisher.release.stop':['productId'],'publisher.buyer.review':['productId','snapshot','query'],
  'publisher.buyer.prepare':['productId','review','intentId','acceptIndex','offerSha256'],
  'publisher.buyer.session':['productId','buyerId','buyerWorkspace','maxPages','maxTotalAtomic','maxRows','maxPageBytes'],
  'publisher.buyer.run':['productId','id','retryUnpaid','expectedAttemptSha256'],
  'publisher.buyer.recover':['productId','id'],'publisher.buyer.account':['productId','id'],
  'publisher.buyer.export':['productId','id']
});
const list=[];
function tool(name,description,properties,required,mutates=false,external=false){
  list.push(Object.freeze({name:TOOL_PREFIX+name,description,
    inputSchema:{type:'object',properties,required,additionalProperties:false},
    annotations:{readOnlyHint:!mutates,destructiveHint:false,idempotentHint:true,openWorldHint:external}}));
}
tool('workspaces','List configured WordPress, native Buyer and receiving aliases. Does not launch a workspace.',{},[]);
tool('schema','Read all original action inputs, retained-file limits, revision and recovery contracts.',{},[]);
tool('open','Borrow the selected live Applications controller, or explicitly start the original server when host allowStart permits. Returns identity without its private token.',ws,['workspace'],true);
tool('release','Drain and close only this provider’s original server. A borrowed Applications controller remains under its existing owner.',ws,['workspace'],true);
tool('state','Retain the complete original source, jobs, editions, publisher and operation snapshot as an immutable downloadable JSON file.',ws,['workspace']);
tool('operation','Read a saved original operation UUID, including actual completion or attention after an uncertain reply.',
  {...ws,operationId:uuid},['workspace','operationId']);
tool('source','Read the selected original source declaration and credential references.',{...ws,id:uuid},['workspace','id']);
tool('job','Inspect the original discovery or capture and its retained page cursor.',{...ws,sourceId:uuid,id:uuid},['workspace','sourceId','id']);
tool('records','Read the selected page of actual retained native records.',
  {...ws,sourceId:uuid,id:uuid,offset:uint('Record offset.'),limit:uint('Records in this page.',100,1),
    collection:str('Original discovered collection key.',{maxLength:200})},['workspace','sourceId','id']);
tool('response','Read original response metadata and the original bounded preview. Use artifact kind=response for every complete native response byte.',
  {...ws,sourceId:uuid,id:uuid,sequence:uint('Original one-based response sequence.',100000,1)},['workspace','sourceId','id','sequence']);
tool('mapping','Read the original saved native projection.',{...ws,id:uuid},['workspace','id']);
tool('edition','Read the exact retained edition and native dataset snapshot.',{...ws,id:uuid},['workspace','id']);
tool('projection','Suggest a projection from the exact completed original capture.',{...ws,sourceId:uuid,id:uuid},['workspace','sourceId','id']);
tool('compare','Compare two retained editions by their original native record IDs.',
  {...ws,before:uuid,after:uuid,offset:uint('Change offset.'),limit:uint('Changes in this page.',200,1)},['workspace','before','after']);
tool('refresh_plan','Read the complete saved refresh plan, original edition, source selection and retained merchant choices.',{...ws,id:uuid},['workspace','id']);
tool('refresh_run','Read the same refresh run, original discovery/capture, complete comparison identity, explicit decision and retained exports.',{...ws,id:uuid},['workspace','id']);
tool('refresh_changes','Page the complete retained added/changed/removed comparison. Follow the exact returned global nextOffset, including under a kind filter.',
  {...ws,id:uuid,offset:uint('Original global change ordinal.'),limit:uint('Changes returned on this page.',200,1),
    kind:{type:'string',enum:['all','added','removed','changed']}},['workspace','id']);
tool('refresh_record','Read both retained native and projected versions of one exact comparison key. Complete original response files remain available when previews are clipped.',
  {...ws,id:uuid,key:str('Original comparison record key.',{minLength:1,maxLength:500})},['workspace','id','key']);
tool('preview','Review a proposed projection against actual retained source records.',
  {...ws,sourceId:uuid,captureId:uuid,projection:{type:'object',additionalProperties:true},
    offset:uint('Record offset.'),limit:uint('Rows in this preview.',100,1)},['workspace','sourceId','captureId','projection']);
tool('dataset_preview','Run the original private dataset admission and query against the selected immutable edition.',
  {...ws,editionId:uuid,query:str('Original URL query without a leading question mark.',{maxLength:8192})},['workspace','editionId']);
tool('act','Perform one original source, publication or buyer action with the current workspace revision and a retained operation UUID. publisher.prepare selects exportId; publisher.buyer.session selects a host buyerWorkspace alias. Original seller terms, offer checks and buyer approval remain authoritative.',
  {...ws,action:{type:'string',enum:wordpressActionNames},operationId:uuid,
    expectedRevision:uint('Reviewed current workspace revision.'),input:{type:'object',additionalProperties:true}},
  ['workspace','action','operationId','expectedRevision','input'],true,true);
tool('cancel','Ask the original workspace to cancel its currently active operation UUID. Inspect the original operation/job for actual completion.',
  {...ws,operationId:uuid},['workspace','operationId'],true);
tool('artifact','Retain the complete original source/response/edition/export/packet file, streamed with bounded memory. A source packet preserves its full ZIP and exact digest.',
  {...ws,kind:{type:'string',enum:['source','response','edition','export','packet','refresh']},id:uuid,
    name:str('Declared original member or response sequence.',{minLength:1,maxLength:4096}),sourceId:uuid},
  ['workspace','kind','id'],true);
tool('publisher_artifact','Retain a complete original publisher review, customer configuration, acquisition manifest or delivered file.',
  {...ws,productId:uuid,kind:{type:'string',enum:['draft-csv','draft-review','buyer-config','session-manifest','session-csv','session-jsonl','session-review']},id:uuid},
  ['workspace','productId','kind','id'],true);
tool('manifest','Inspect the complete retained export and its exact file identity.',exp,['workspace','exportId']);
tool('file','Read an original immutable file range through the maintained retained-file reader.',
  {...exp,file:str('Manifest filename.',{minLength:1,maxLength:240}),expectedManifestSha256:sha,expectedSha256:sha,
    offset:uint('Byte offset.'),limit:uint('Bytes in this range.',MAX_RETAINED_CHUNK_BYTES,1),readId:uuid},
  ['workspace','exportId','file','expectedManifestSha256','expectedSha256']);
tool('file_release','Release the selected retained read handle. Its source file and complete export remain available.',
  {...exp,readId:uuid},['workspace','exportId','readId']);
tool('json','Page a JSON value from an exact immutable response; the complete file remains available.',
  {...exp,file:str('Manifest JSON filename.',{minLength:1,maxLength:240}),expectedManifestSha256:sha,
    pointer:str('RFC6901 pointer.',{maxLength:4000}),offset:uint('Value offset.'),limit:uint('Values or characters.',200,1)},
  ['workspace','exportId','file','expectedManifestSha256']);
tool('receive','Restore the selected complete source packet into a host-declared receiving alias through the original packet receiver. The exact same packet and destination recover the same receiving operation.',
  {...exp,expectedManifestSha256:sha,receiver:alias},['workspace','exportId','expectedManifestSha256','receiver'],true);
export const wordpressMerchantTools=Object.freeze(list);
export const wordpressTools=Object.freeze(Object.fromEntries(list.map(item=>[item.name.slice(TOOL_PREFIX.length),item])));
function valid(value,rule){
  if(rule.type==='object')return plain(value)&&(!rule.properties||
    (rule.required??[]).every(k=>Object.hasOwn(value,k))&&
    Object.keys(value).every(k=>rule.additionalProperties!==false||Object.hasOwn(rule.properties,k))&&
    Object.entries(value).every(([k,v])=>!rule.properties[k]||valid(v,rule.properties[k])));
  if(rule.type==='integer')return Number.isSafeInteger(value)&&value>=(rule.minimum??-Infinity)&&value<=(rule.maximum??Infinity);
  if(rule.type==='string')return typeof value==='string'&&value.length>=(rule.minLength??0)&&value.length<=(rule.maxLength??Infinity)&&
    (!rule.pattern||new RegExp(rule.pattern).test(value))&&(!rule.enum||rule.enum.includes(value));
  return true;
}
export function validateWordPressArguments(name,args){
  const action=name.startsWith(TOOL_PREFIX)?name.slice(TOOL_PREFIX.length):name,definition=wordpressTools[action];
  need(definition&&valid(args,definition.inputSchema),'WORDPRESS_MERCHANT_INPUT',
    'Use the exact '+(definition?.name??'WordPress')+' input schema.');
  if(action==='act')need(Object.keys(args.input).every(key=>wordpressActionContract[args.action].includes(key)),
    'WORDPRESS_MERCHANT_INPUT','Use the declared original action fields; local paths are selected by host aliases.');
  return action;
}
