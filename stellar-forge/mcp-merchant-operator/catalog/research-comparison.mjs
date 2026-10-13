// MIT. Original comparison and reviewed return adoption on an attached Research workspace.
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const nativeId={type:'string',minLength:1,maxLength:240};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const revision={type:'integer',minimum:1,maximum:99999999};
const offset={type:'integer',minimum:0},limit={type:'integer',minimum:1,maximum:200};
const input={type:'object',additionalProperties:true};
const dossier={workspace:alias,dossierId:nativeId};
const read={readOnly:true,idempotent:true};
export const RESEARCH_COMPARISON_EXPORTS=Object.freeze({
 'comparison-case-json':{extension:'json',comparisonFormat:'json'},
 'comparison-case-html':{extension:'html',comparisonFormat:'html'},
 'comparison-case-csv':{extension:'csv',comparisonFormat:'csv'},
 'comparison-run':{extension:'json',comparisonFile:true},
 'comparison-artifact':{extension:'bin',comparisonFile:true,artifact:true},
 'comparison-adoption-json':{extension:'json',adoptionFormat:'json'},
 'comparison-adoption-html':{extension:'html',adoptionFormat:'html'},
 'comparison-adoption-source':{extension:'bin',adoptionFormat:'source'},
 'comparison-adoption-run':{extension:'json',adoptionFile:true},
 'comparison-adoption-artifact':{extension:'bin',adoptionFile:true,artifact:true},
});
export const RESEARCH_COMPARISON_EXPORT_FIELDS={
 caseId:nativeId,caseVersionId:nativeId,runId:nativeId,artifactId:nativeId,adoptionPlanId:nativeId,
 adoptionSourceId:{type:'string',pattern:'^drs_[a-f0-9]{64}$'}
};
export function researchComparisonTools(tool){
 return[
  tool('merchant_research_comparison_read','Page exact case/protocol, candidate, run, judgment, decision or original operation records. Pin the returned revision while paging. Select the exact protocol to retain its original population and source definitions.',{
   ...dossier,revision,caseId:nativeId,caseVersionId:nativeId,
   section:{type:'string',enum:['overview','cases','case-editions','candidates','candidate-editions','runs','judgments','decisions','operations']},offset,limit
  },['workspace','dossierId'],read),
  tool('merchant_research_comparison_report','Read the complete selected comparison report, measured rows, separate named judgments/decisions, all source editions and operation history. Use merchant_research_export comparison-case-json/html/csv for complete retained files.',{
   ...dossier,revision,caseId:nativeId,caseVersionId:nativeId
  },['workspace','dossierId','caseId'],read),
  tool('merchant_research_comparison_review','Apply the exact original native case.save, candidate.save, run.import, judgment.save or decision.save request. input retains requestId, expectedRevision, actor, action and complete payload. Same-request replay precedes revision checks; use original request/operation readback after an interrupted response.',{
   ...dossier,input
  },['workspace','dossierId','input'],{idempotent:true}),
  tool('merchant_research_comparison_adoption_list','Page original returned-comparison adoption plans and accepted progress, plus retained returned sources. A continuation names the original plan and preserves accepted native operations. Pin revision for subsequent pages.',{
   ...dossier,revision,offset,limit
  },['workspace','dossierId'],read),
  tool('merchant_research_comparison_adoption_source','Inspect the complete validated returned source by protocol and record family. Returns original source/ancestor, target protocols/candidates and EXACT/MISSING/DIFFERENT source bindings. Receive the full portable branch first through merchant_research_dossier_return_source.',{
   ...dossier,revision,sourceId:{type:'string',pattern:'^drs_[a-f0-9]{64}$'},caseVersionId:nativeId,
   section:{type:'string',enum:['cases','candidates','runs','judgments','decisions','sources']},offset,limit
  },['workspace','dossierId','sourceId'],read),
  tool('merchant_research_comparison_adoption_preview','Preview the complete reviewed dependency graph without committing author operations. input is the original requestId/expectedRevision/actor/reviewedAt/reviewNote plus sourceId, caseVersionId, explicit selection, caseTarget and candidateTargets; a continuation supplies continuationOf instead of source/selection fields. Review every issue and retain the exact previewSha256.',{
   ...dossier,input
  },['workspace','dossierId','input'],read),
  tool('merchant_research_comparison_adoption_review','Accept the exact reviewed request with its previewSha256, persist its complete source-bound plan, then receive its ordinary native commands one revision at a time. After interruption, replay this exact request or inspect its original requestId. NEEDS_REVIEW retains the accepted prefix; preview an explicitly named continuation at the current revision. COMPLETE and SUPERSEDED retain their original mappings.',{
   ...dossier,input
  },['workspace','dossierId','input'],{idempotent:true}),
  tool('merchant_research_comparison_adoption_inspect','Read the complete original adoption, accepted native receipts, exact source/target mappings and remaining progress by exactly one planId or requestId. Supports a pinned historical revision and returns adoption:null when the original request has no retained plan.',{
   ...dossier,revision,planId:nativeId,requestId:nativeId
  },['workspace','dossierId'],read),
 ];
}
