// MIT — Expose both original review engines through the Python-owned process.
import {requireValue} from '../resource-library/files.mjs';

export const journalActions=Object.freeze([
  'reviewReturns.stage','reviewReturns.receive','reviewReturns.list','reviewReturns.inspect',
  'reviewReturns.restage','reviewReturns.apply','reviewReturns.sourceHistory','reviewReturns.verify'
]);

export function createJournalBinding(library,{readPacket}){
  const comparison=library.comparisons,returned=comparison?.reviewReturns;
  async function receive(parameters){
    requireValue(comparison,'REVIEW_COMPARISON_RUNTIME_REQUIRED',409);
    const packet=await readPacket(parameters);
    let format=parameters.returnFormat??'auto';
    requireValue(['auto','incoming','returned'].includes(format),'RETURN_FORMAT_REQUIRED');
    if(format==='auto'){
      // A bare handover keeps the established C12 default. Only the native
      // full-lineage upload contract selects the returned-journal workflow.
      if(returned){
        const {identifyReturnInput}=await import('../resource-library/comparison-return-compat.mjs');
        format=identifyReturnInput(packet).kind==='lineage-return'?'returned':'incoming';
      }else format='incoming';
    }
    requireValue(parameters.label===undefined||(format==='returned'&&parameters.stageReturn===true),'RETURN_LABEL_REQUIRES_STAGE');
    const options={operationId:parameters.operationId};
    if(parameters.label!==undefined)options.label=parameters.label;
    let result;
    if(format==='returned'){
      requireValue(returned,'REVIEW_JOURNAL_RUNTIME_REQUIRED',409);
      result=parameters.stageReturn?returned.stage(packet,options):returned.receive(packet,options);
    }else{
      requireValue(!parameters.stageReturn||comparison.returns,'REVIEW_RETURN_RUNTIME_REQUIRED',409);
      result=parameters.stageReturn?comparison.returns.stage(packet,options):comparison.importHandover(packet,options);
    }
    return {format,result};
  }
  async function dispatch(action,p){
    if(action==='review.receive')return receive(p);
    requireValue(returned&&journalActions.includes(action),'REVIEW_JOURNAL_RUNTIME_REQUIRED',409);
    const {id,options={},input={}}=p;
    switch(action){
      case 'reviewReturns.stage':{
        const options={operationId:p.operationId};if(p.label!==undefined)options.label=p.label;
        return returned.stage(await readPacket(p),options);
      }
      case 'reviewReturns.receive':return returned.receive(await readPacket(p),{operationId:p.operationId});
      case 'reviewReturns.list':return returned.list(p);
      case 'reviewReturns.inspect':return returned.inspect(id,options);
      case 'reviewReturns.restage':return returned.restage(id,input);
      case 'reviewReturns.apply':return returned.apply(id,input);
      case 'reviewReturns.sourceHistory':return returned.sourceHistory(id,options);
      case 'reviewReturns.verify':{
        const verified=returned.verify(await readPacket(p));
        return {schema:verified.packet.schema,comparisonId:verified.packet.comparison.id,
          handoverSha256:verified.packet.handoverSha256,bundleSha256:verified.bundleSha256,
          lineageSha256:verified.lineageSha256,currentJournalId:verified.current.id,
          changes:verified.packet.changes.length,decisions:verified.packet.decisions.length,
          sources:verified.graph.sources.length,plans:verified.graph.plans.length,receipts:verified.graph.receipts.length};
      }
      default:requireValue(false,'REVIEW_ACTION_INVALID');
    }
  }
  function report(id,format){
    requireValue(returned,'REVIEW_JOURNAL_RUNTIME_REQUIRED',409);
    return returned.export(id,{format});
  }
  return Object.freeze({available:Boolean(returned),dispatch,report});
}
