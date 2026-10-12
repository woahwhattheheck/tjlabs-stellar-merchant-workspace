// MIT. Complete report preparation, native merchant and original buyer receiving.
export const USASPENDING_REPORT_EXPORTS=Object.freeze({
  'funding-report-delivery':{ext:'funding-report.gz',type:'application/gzip',required:['reportId'],optional:['deliveryId']},
  'funding-report-json':{ext:'json',type:'application/json; charset=utf-8',required:['reportId'],optional:[]},
  'funding-report-html':{ext:'html',type:'text/html; charset=utf-8',required:['reportId'],optional:[]},
  'funding-report-csv':{ext:'csv',type:'text/csv; charset=utf-8',required:['reportId'],optional:[]},
  'funding-merchant-catalog':{ext:'json',type:'application/json; charset=utf-8',required:['merchantId'],optional:[]},
});
export function usaSpendingReportTools(tool,{selected,nativeId,expectedRevision,page,read,digest,alias}) {
  const content={type:'object',additionalProperties:false,required:['title','publisher','purpose','findings','useTerms'],properties:{
    title:{type:'string',minLength:1,maxLength:240},publisher:{type:'string',minLength:1,maxLength:240},
    purpose:{type:'string',minLength:1,maxLength:4000},findings:{type:'string',minLength:1,maxLength:20000},
    implications:{type:'string',maxLength:8000},useTerms:{type:'string',minLength:1,maxLength:8000},
  }};
  return [
    tool('merchant_usaspending_report_inventory','Page complete saved funding reports or their original merchant preparations. Reports retain complete original source observations, public narrative, exact amounts and buyer-file receiving.',{
      ...selected,kind:{type:'string',enum:['reports','merchants']},...page,
    },['workspace','kind'],read),
    tool('merchant_usaspending_report_draft','Read the saved report content, original source selection, publication state and receiving metadata. Complete HTML/JSON/CSV/source delivery is available through the existing export/file reader.',{
      ...selected,reportId:nativeId,
    },['workspace','reportId'],read),
    tool('merchant_usaspending_report_prepare','Prepare a complete public report from captureId plus the exact saved workshare assessment revision, optionally comparing beforeCaptureId; or revise a received/sourceReportId. Retain operationId when recovering the same input.',{
      ...selected,operationId:nativeId,captureId:nativeId,beforeCaptureId:nativeId,sourceReportId:nativeId,expectedReviewRevision,content,
    },['workspace','operationId','content'],{}),
    tool('merchant_usaspending_report_publish','Publish the exact reviewed report SHA256. Local source reports retain the saved assessment revision; a changed assessment requires preparing its new report edition.',{
      ...selected,reportId:nativeId,expectedSha256:digest,
    },['workspace','reportId','expectedSha256'],{}),
    tool('merchant_usaspending_report_merchant_prepare','Prepare or recover the original SF30 file-product bundle for the published report, using the host-selected merchant payment terms and HTTPS origin. Choose its fixed public path. Returns the existing award job; inspect with merchant_usaspending_job.',{
      ...selected,reportId:nativeId,path:{type:'string',pattern:'^/[A-Za-z0-9_.~/-]+$',maxLength:1024},
    },['workspace','reportId','path'],{}),
    tool('merchant_usaspending_report_buyer_adopt','Receive the exact original response file for one SF88 buyer intent from the host-declared inbox. The original file reader checks its completed delivery, selected receiving root, full bytes and SHA256.',{
      ...selected,inbox:alias,intentId:{type:'string',minLength:1,maxLength:128},
    },['workspace','inbox','intentId'],{}),
    tool('merchant_usaspending_report_extract','Receive the complete report HTML, CSV, original award editions, both transaction observations and original gzip file in a selected private workspace subdirectory. Retry the same name to complete missing files.',{
      ...selected,reportId:nativeId,name:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'},deliveryId:nativeId,
    },['workspace','reportId','name'],{}),
  ];
}
