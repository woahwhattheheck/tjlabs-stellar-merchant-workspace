// MIT. Customer-agent tools for the original saved Directus report workspace.
export {DIRECTUS_AGENT_ACTIONS} from './agent-operations.mjs';
import {DIRECTUS_AGENT_ACTIONS,DIRECTUS_AGENT_KINDS} from './agent-operations.mjs';
export const DIRECTUS_VIEWS=Object.freeze({
 state:{keys:[],required:[]},page:{keys:['kind','offset','limit'],required:['kind']},
 record:{keys:['kind','id','offset','limit'],required:['kind','id']},
 query:{keys:['editionId','query'],required:['editionId']},
 'native-history':{keys:['id'],required:['id']},
 'buyer-offer':{keys:['merchantId','query'],required:['merchantId']},
 'buyer-status':{keys:['buyerId'],required:['buyerId']},
 delivery:{keys:['id'],required:['id']}
});
export function directusTools(tool){
 const workspace={type:'string',description:'Configured original Directus operator alias.'},id={type:'string',pattern:'^[A-Za-z0-9_.:-]{8,128}$'},object={type:'object',additionalProperties:true},scope={workspace};
 return[
  tool('merchant_directus_workspaces','List configured original Directus projects and current managed/owned attachments.',{},[]),
  tool('merchant_directus_open','Open the same private Applications listener or own the original server in this Node host.',scope,['workspace']),
  tool('merchant_directus_view','Read complete paged source/edition/history collections, native capture values, records, original inventory/query, merchant and buyer state.',{...scope,view:{type:'string',enum:Object.keys(DIRECTUS_VIEWS)},query:object},['workspace','view']),
  tool('merchant_directus_save','Retain and apply one complete original source/capture/draft/edition/review/comparison/publication/buyer action with its stable operationId and expectedRevision. Native buyer execution preserves original approval and budgets.',
   {...scope,request:{type:'object',properties:{action:{type:'string',enum:DIRECTUS_AGENT_ACTIONS},input:object},required:['action','input'],additionalProperties:false},sourceFile:{type:'string'}},['workspace','request']),
  tool('merchant_directus_project','Select an existing original project in this operator registry and bind its exact resulting scope.',{...scope,projectKey:{type:'string'}},['workspace','projectKey']),
  tool('merchant_directus_connection','Select a configured original Directus API alias; use its private host token environment without placing credentials in the project.',{...scope,connection:{type:'string'}},['workspace','connection']),
  tool('merchant_directus_receive','Receive a complete original SQLite project through the original operator registry, retaining an immutable receiving ID and source alias.',{...scope,operationId:id,sourceFile:{type:'string'}},['workspace','operationId','sourceFile']),
  tool('merchant_directus_operation','Read the retained complete customer input, accepted original operation and native result.',{...scope,operationId:id},['workspace','operationId']),
  tool('merchant_directus_resume','Continue the exact original saved operation after an uncertain response. Completed native work is reused; original request identities remain fixed.',{...scope,operationId:id},['workspace','operationId']),
  tool('merchant_directus_cancel','Request interruption of the exact original capture, draft transport or buyer session. Already-invoked writes retain their native reconciliation history.',{...scope,operationId:id},['workspace','operationId']),
  tool('merchant_directus_merchant','Start or stop the selected original dataset merchant service owned by this Directus application.',{...scope,action:{type:'string',enum:['start','stop']},merchantId:id,runtime:{type:'string',description:'Configured private original SF82 runtime alias for start.'}},['workspace','action','merchantId']),
  tool('merchant_directus_export','Retain one complete original project, record, source response, CSV/lineage/comparison or customer delivery member. Whole project export selects its current expectedRevision.',
   {...scope,exportId:id,selection:{type:'object',properties:{kind:{type:'string',enum:['project','source','dataset','config','comparison','buyer-config','record','native-response','delivery']},id,recordKind:{type:'string',enum:DIRECTUS_AGENT_KINDS},name:{type:'string'},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},expectedRevision:{type:'integer',minimum:0}},required:['kind'],additionalProperties:false}},['workspace','exportId','selection']),
  tool('merchant_directus_file_read','Read all original file bytes in checked chunks. After restart use the same export ID, SHA and offset without the earlier process read ID.',
   {...scope,exportId:id,readId:{type:'string'},expectedSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:196608}},['workspace','exportId']),
  tool('merchant_directus_file_release','Close one owned original retained reader.',{...scope,readId:{type:'string'}},['workspace','readId']),
  tool('merchant_directus_close','Close the exact current attachment. Managed mode detaches; owned mode drains only its original server, native sessions and files.',{...scope,instanceId:{type:'string'}},['workspace','instanceId'])
 ];
}
