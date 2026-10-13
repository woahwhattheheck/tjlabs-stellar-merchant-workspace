// MIT. Dossier return tools on the original authenticated Research attachment.
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const nativeId={type:'string',minLength:1,maxLength:240};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const sourceId={type:'string',pattern:'^drs_[a-f0-9]{64}$'};
const reviewId={type:'string',pattern:'^drv_[a-f0-9]{64}$'};
const itemId={type:'string',pattern:'^dri_[a-f0-9]{64}$'};
const returnId={type:'string',pattern:'^drr_[a-f0-9]{64}$'};
const revision={type:'integer',minimum:1,maximum:99999999};
const offset={type:'integer',minimum:0,maximum:99999999};
const limit={type:'integer',minimum:1,maximum:100};
const side={type:'string',enum:['base','current','returned']};
const input={type:'object',additionalProperties:true};
const dossier={workspace:alias,dossierId:nativeId};
const read={readOnly:true,idempotent:true};
export const RESEARCH_DOSSIER_RETURN_EXPORTS=Object.freeze({
  'dossier-return-json':{extension:'json',returnFormat:'json',representation:'complete-reviewed-return'},
  'dossier-return-markdown':{extension:'md',returnFormat:'md',representation:'complete-return-report'},
  'dossier-return-html':{extension:'html',returnFormat:'html',representation:'complete-return-report'},
  'dossier-return-source':{extension:'bin',returnFormat:'source',representation:'original-returned-portable'},
  'dossier-return-value':{extension:'json',returnValue:true,representation:'complete-branch-value-json'},
});
export const RESEARCH_DOSSIER_RETURN_EXPORT_FIELDS={
  returnReviewId:reviewId,dossierReturnId:returnId,returnItemId:itemId,returnSide:side
};
export function researchDossierReturnTools(tool){
  return [
    tool('merchant_research_dossier_return_source','Retain one complete host-declared portable return under this original dossier. The original receiver verifies its declared SHA256, full history and incoming head. Preserves the returned branch without replacing the current dossier. Use the returned source.id and exact current revision for preview.',{
      ...dossier,source:alias,filename:{type:'string',minLength:1,maxLength:512},
      contentType:{type:'string',enum:['application/json','application/gzip','application/x-gzip','application/octet-stream']}
    },['workspace','dossierId','source'],{idempotent:true}),
    tool('merchant_research_dossier_return_preview','Freeze the original current/returned/common-base comparison for this exact retained source and expected revision. Page every item and retain reviewId plus comparisonSha256. No dossier return is applied by preview.',{
      ...dossier,sourceId,expectedRevision:revision
    },['workspace','dossierId','sourceId','expectedRevision'],{idempotent:true}),
    tool('merchant_research_dossier_return_list','Page the original saved dossier-return history. Continue with the returned pagination information; preserve original return, request, review and source identities.',{
      ...dossier,offset,limit
    },['workspace','dossierId'],read),
    tool('merchant_research_dossier_return_inspect','Read a page of the same frozen review, all three original branch descriptors, exact item choices and OPEN/APPLIED status. An APPLIED review retains its original return receipt. Full branch values are available separately.',{
      ...dossier,reviewId,offset,limit
    },['workspace','dossierId','reviewId'],read),
    tool('merchant_research_dossier_return_request','Recover the original saved return by requestId after an interrupted reply. Compare its review/source/comparison, reviewer, full decisions and original revision against the unchanged pending input before considering that request complete.',{
      ...dossier,requestId:{type:'string',minLength:1,maxLength:200}
    },['workspace','dossierId','requestId'],read),
    tool('merchant_research_dossier_return_value','Read one complete base/current/returned item value through the bounded JSON control path. For a value larger than that path permits, use merchant_research_export kind dossier-return-value with the same review/item/side and read all retained chunks.',{
      ...dossier,reviewId,itemId,side
    },['workspace','dossierId','reviewId','itemId','side'],read),
    tool('merchant_research_dossier_return_preview_choices','Validate the complete native choice input against the frozen comparison and current revision. input preserves reviewId, expectedRevision, comparisonSha256 and every explicit decision. The original typed engine reports missing, invalid or incompatible choices before save.',{
      ...dossier,input
    },['workspace','dossierId','input'],read),
    tool('merchant_research_dossier_return_review','Apply the complete reviewed native request through one original dossier revision. input includes requestId, reviewId, expectedRevision, comparisonSha256, reviewedBy, reviewNote and explicit CURRENT/RETURNED/EDIT decisions. Retry that exact request after uncertainty; the original saved-request check precedes revision CAS. Use the native treatment, choiceLabels and effect for each item. RETURNED for a retained typed proposal preserves it for the original workflow; the current typed history remains authoritative.',{
      ...dossier,input
    },['workspace','dossierId','input'],{idempotent:true}),
    tool('merchant_research_dossier_return_save_draft','Save the full native reviewer draft for this review with its expectedDraftVersion. input contains reviewId, expectedDraftVersion and draft. A conflict preserves the existing draft; read it and retain both full versions before selecting a successor.',{
      ...dossier,input
    },['workspace','dossierId','input'],{}),
    tool('merchant_research_dossier_return_draft','Read the complete saved native draft and its original version. An absent draft returns draftVersion 0 and draft null. Keep review and comparison identity when continuing it.',{
      ...dossier,reviewId
    },['workspace','dossierId','reviewId'],read),
  ];
}
