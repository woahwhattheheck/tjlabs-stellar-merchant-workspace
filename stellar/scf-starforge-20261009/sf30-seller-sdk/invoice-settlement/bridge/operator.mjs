// MIT. Original Invoice operator plus additive Bridge intake methods.
import {openInvoiceSettlementOperator,loadInvoiceSettlementConfiguration} from '../operator.mjs';
import {openBridgeSource,openRetainedBridgeSource} from './native.mjs';
import {openBridgeWorkspace} from './workspace.mjs';
import {BridgeContractError} from './bridge-provider.mjs';
export {loadInvoiceSettlementConfiguration};
export const BRIDGE_METHODS=Object.freeze([
  ['bridge.overview',false,[]],['bridge.capture.create',true,['requestId','expectedRevision','read','name','actor','note']],
  ['bridge.capture.read',false,['captureId']],['bridge.capture.next',true,['requestId','expectedRevision','captureId']],
  ['bridge.webhook.receive',true,['requestId','expectedRevision','endpointId','receivedAtMs','rawBodyBase64','signatureHeader','publicKeyPem']],
  ['bridge.edition.preview',false,['sourceIds','name','asOfDate','note']],
  ['bridge.edition.save',true,['requestId','expectedRevision','sourceIds','name','asOfDate','note','expectedPreviewSha256']],
  ['bridge.edition.read',false,['editionId']],['bridge.report.save',true,['requestId','expectedRevision','editionId']],['bridge.incident.decide',true,['requestId','expectedRevision','editionId','incidentId','action','actor','at','note']]
].map(([method,mutates,required])=>Object.freeze({method,mutates,required:Object.freeze(required)})));
const PASS_THROUGH=new Set(['workspace.describe','workspace.history','request.status','programme.read','source.read','source.file','workspace.export','package.inspect','package.receive']);
export async function openBridgeOperator({bridgeConfiguration,retainedSelection,...originalConfiguration}) {
  if(Boolean(bridgeConfiguration)===Boolean(retainedSelection))throw new BridgeContractError('SOURCE_SELECTION_REQUIRED','Select either the original private connection or its retained public source identity.');
  const source=retainedSelection?openRetainedBridgeSource(retainedSelection):openBridgeSource(bridgeConfiguration);
  let original,bridge,first,closing=false,closeTask=null;
  const tasks=new Set(),closed={source:false,bridge:false,original:false};
  async function close(){
    if(Object.values(closed).every(Boolean))return {state:'CLOSED'};
    if(closeTask)return closeTask;closing=true;
    closeTask=(async()=>{
      let failure;
      // Stop facade reads now, but keep the borrowed original workspace open
      // until every accepted response/receipt has reached its original journal.
      if(bridge&&!closed.bridge)try{await bridge.close();closed.bridge=true;}catch(e){failure??=e;}
      else if(!bridge)closed.bridge=true;
      while(tasks.size)await Promise.allSettled([...tasks]);
      if(!closed.source)try{await source.close();closed.source=true;}catch(e){failure??=e;}
      if(original&&!closed.original)try{await original.close();closed.original=true;}catch(e){failure??=e;}
      else if(!original)closed.original=true;
      if(failure)throw failure;return {state:'CLOSED'};
    })();
    closeTask.catch(()=>{closeTask=null;});return closeTask;
  }
  try {
    // The facade owns cancellation. Keep the borrowed native writer available
    // to durably retain the original aborted HTTP result before its final drain.
    original=await openInvoiceSettlementOperator({...originalConfiguration,signal:undefined});
    bridge=openBridgeWorkspace({workspace:original.workspace,source,signal:originalConfiguration.signal});
  }catch(error){
    first=error;try{await close();}catch(cleanupError){first.cleanupError=cleanupError;first.bridgeOperator={close,inspect:()=>({closed:{...closed}})};first.closeFailedBridgeOperator=close;}throw first;
  }
  const dispatch={
    'bridge.overview':bridge.overview,'bridge.capture.create':bridge.captureCreate,
    'bridge.capture.read':bridge.captureDescribe,'bridge.capture.next':bridge.captureNext,
    'bridge.webhook.receive':bridge.receiveDelivery,'bridge.edition.preview':bridge.editionPreview,
    'bridge.edition.save':bridge.editionSave,'bridge.edition.read':bridge.editionRead,'bridge.incident.decide':bridge.incidentDecision,'bridge.report.save':bridge.reportSave
  };
  function invoke({method,args={}}={}) {
    if(closing||originalConfiguration.signal?.aborted)return Promise.reject(new BridgeContractError('BRIDGE_OPERATOR_CLOSING','The original operator is draining.'));
    if(!args||typeof args!=='object'||Array.isArray(args))return Promise.reject(new BridgeContractError('INVALID_ARGUMENT','Supply the complete original arguments.'));
    let task;
    if(Object.hasOwn(dispatch,method)) {
      const selected=BRIDGE_METHODS.find(row=>row.method===method);
      for(const name of selected.required)if(!Object.hasOwn(args,name))return Promise.reject(new BridgeContractError('MISSING_ARGUMENT','Supply '+name+'.'));
      task=dispatch[method](args);
    }else if(PASS_THROUGH.has(method))task=original.invoke({method,args});
    else return Promise.reject(new BridgeContractError('UNKNOWN_METHOD','Select a Bridge method or maintained read/export/receiving method.'));
    tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));return task;
  }
  return {invoke,methods:()=>[...BRIDGE_METHODS,...original.methods().filter(row=>PASS_THROUGH.has(row.method))],
    describe:()=>invoke({method:'bridge.overview'}),close,inspect:()=>({closing,closed:{...closed},active:tasks.size}),
    publicError:original.publicError};
}
