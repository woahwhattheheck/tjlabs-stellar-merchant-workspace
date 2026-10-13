// MIT. Customer-agent tools for the original saved Superset report workspace.
export {SUPERSET_AGENT_ACTIONS} from './agent-operations.mjs';
import {SUPERSET_AGENT_ACTIONS,SUPERSET_RECORD_KINDS} from './agent-operations.mjs';
export const SUPERSET_VIEWS=Object.freeze({
 state:{keys:[],required:[]},page:{keys:['kind','offset','limit'],required:['kind']},
 record:{keys:['kind','id'],required:['kind','id']},
 capture:{keys:['id','queryOrdinal','offset','limit'],required:['id']},
 inventory:{keys:['sourceId','kind','page','pageSize','dashboardId'],required:['sourceId']},
 query:{keys:['editionId','query'],required:['editionId']},
 'merchant-status':{keys:['merchantId'],required:['merchantId']},
 'buyer-review':{keys:['merchantId','query'],required:['merchantId']},
 'buyer-status':{keys:['buyerId'],required:['buyerId']},
 delivery:{keys:['deliveryId'],required:['deliveryId']}
});
export function supersetTools(tool){
 const workspace={type:'string',description:'Configured original Superset operator alias.'},id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$'},object={type:'object',additionalProperties:true},scope={workspace};
 return[
  tool('merchant_superset_workspaces','List configured original Superset projects and current managed/owned attachments.',{},[]),
  tool('merchant_superset_open','Open the same private Applications listener or own the original server in this Node host.',scope,['workspace']),
  tool('merchant_superset_view','Read complete paged source/edition/history collections, native capture values, records, original inventory/query, merchant and buyer state.',{...scope,view:{type:'string',enum:Object.keys(SUPERSET_VIEWS)},query:object},['workspace','view']),
  tool('merchant_superset_save','Retain and apply one complete original source/capture/edition/review/comparison/publication/buyer/receiving action with its stable operationId and expectedRevision. Native buyer execution preserves original approval and budgets.',
   {...scope,request:{type:'object',properties:{action:{type:'string',enum:SUPERSET_AGENT_ACTIONS},input:object},required:['action','input'],additionalProperties:false},sourceFile:{type:'string'},destination:{type:'string'}},['workspace','request']),
  tool('merchant_superset_operation','Read the retained complete customer input, accepted original operation and native result.',{...scope,operationId:id},['workspace','operationId']),
  tool('merchant_superset_resume','Continue the exact original saved operation after an uncertain response. Completed native work is reused; original request identities remain fixed.',{...scope,operationId:id},['workspace','operationId']),
  tool('merchant_superset_cancel','Cancel the selected original queued operation or request interruption of its active original capture/buyer session; retain saved history.',{...scope,operationId:id},['workspace','operationId']),
  tool('merchant_superset_merchant','Start or stop the selected original dataset merchant service owned by this Superset application.',{...scope,action:{type:'string',enum:['start','stop']},merchantId:id},['workspace','action','merchantId']),
  tool('merchant_superset_export','Retain one complete original project, record, source response, CSV/lineage/comparison or customer delivery member. Whole project export selects its current expectedRevision.',
   {...scope,exportId:id,selection:{type:'object',properties:{kind:{type:'string',enum:['workspace','capture','comparison','csv','lineage','record','response','delivery']},id,recordKind:{type:'string',enum:SUPERSET_RECORD_KINDS},name:{type:'string'},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},expectedRevision:{type:'integer',minimum:0}},required:['kind'],additionalProperties:false}},['workspace','exportId','selection']),
  tool('merchant_superset_file_read','Read all original file bytes in checked chunks. After restart use the same export ID, SHA and offset without the earlier process read ID.',
   {...scope,exportId:id,readId:{type:'string'},expectedSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:196608}},['workspace','exportId']),
  tool('merchant_superset_file_release','Close one owned original retained reader.',{...scope,readId:{type:'string'}},['workspace','readId']),
  tool('merchant_superset_close','Close the exact current attachment. Managed mode detaches; owned mode drains only its original server, native sessions and files.',{...scope,instanceId:{type:'string'}},['workspace','instanceId'])
 ];
}
