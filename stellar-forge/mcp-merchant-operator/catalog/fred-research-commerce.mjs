// MIT. Paid Research tools belong to the original FRED workspace provider.
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const operation={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$'};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const revision={type:'integer',minimum:1};
const workspace={workspace:alias},publication={...workspace,publicationId:digest};
const mutation={...workspace,id:operation,expectedRevision:revision};
const viewPage={offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100},expectedViewSha256:digest};
const read={readOnly:true,idempotent:true},change={idempotent:true};
const directory={type:'string',minLength:1,maxLength:4096};
export function fredResearchCommerceTools(tool) {
 return [
  tool('merchant_fred_research_commerce','Page the complete Research publications or received-edition inventory. Follow nextOffset with the same expectedRevision and section.',
   {...workspace,section:{type:'string',enum:['publications','receivings']},offset:{type:'integer',minimum:0},
    limit:{type:'integer',minimum:1,maximum:100},expectedRevision:revision},['workspace'],read),
  tool('merchant_fred_research_publication','Page one issued Research edition publication by files, sources or prepared requests with its original terms. Follow nextOffset with the same expectedViewSha256. Download the exact package or files with research-publication file reads.',
   {...publication,...viewPage,section:{type:'string',enum:['files','sources','requests']}},['workspace','publicationId'],read),
  tool('merchant_fred_research_publish','Publish one original issued Research product edition with a configured merchant payment profile. The native seller retains its selected source graph, readable files and exact customer package. Reuse the original operation ID after interruption.',
   {...mutation,productId:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$'},editionId:digest,
    note:{type:'string',maxLength:12000},profile:alias},
   ['workspace','id','expectedRevision','productId','editionId','profile'],change),
  tool('merchant_fred_research_receive','Receive a complete configured research-package into a separate editable customer project. Bind the full original file SHA256 and retain the same operation and receiving directory on continuation.',
   {...mutation,input:alias,expectedSha256:digest,receivingDirectory:directory},
   ['workspace','id','expectedRevision','input','expectedSha256','receivingDirectory'],change),
  tool('merchant_fred_research_commerce_resume','Resume the exact original Research publish/receive operation from its retained payload. Inspect the same operation before retrying.',
   {...mutation,action:{type:'string',enum:['research-publish','research-receive']}},
   ['workspace','id','expectedRevision','action'],change),
  tool('merchant_fred_research_purchase_receive','Receive the exact delivered original Research purchase as an editable customer project, binding its original prepared purchase digest and intent. Native receiving preserves complete source/review/edition identity.',
   {...publication,intentId:operation,expectedPurchaseSha256:digest,receivingDirectory:directory},
   ['workspace','publicationId','intentId','expectedPurchaseSha256'],change),
  tool('merchant_fred_research_received','Page the complete received Research edition by files or sources for a retained customer intent. Follow nextOffset with the same expectedViewSha256. Use research-received file reads for exact package and readable/source files.',
   {...publication,intentId:operation,...viewPage,section:{type:'string',enum:['files','sources']}},['workspace','publicationId','intentId'],read)
 ];
}
