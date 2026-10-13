// MIT. Complete original customer-account response inputs.
export function customerAccountDefinitions({read,mutate,uuid,hash,date,revision,text,object}){
  const account={publicationId:uuid,customerId:uuid,asOf:date};
  const response={publicationId:uuid,responseText:text(1500000,1)};
  const decision={customerResponseId:uuid,entryId:uuid,expectedVersion:revision,
    disposition:{type:'string',enum:['RECORD','ACKNOWLEDGE','DECLINE','DEFER']},
    effectiveDate:date,reason:text(6000,1),title:text(300,1),owner:text(160,1),
    priority:{type:'string',enum:['NORMAL','HIGH','URGENT']},nextActionDate:date,
    acknowledgeChanges:{type:'boolean'},reopenCase:{type:'boolean'},replaceOpenPromise:{type:'boolean'},resolveOpenDispute:{type:'boolean'}};
  const decisionRequired=['customerResponseId','entryId','expectedVersion','disposition','effectiveDate','reason'];
  return[
    read('customer_account_list','Read complete original dated customer publications and received-response review progress in the configured account.',
      {customerId:uuid,search:text(6000)}),
    read('customer_account_preview','Review the complete customer-only dated account and original document identities before publication.',
      account,['publicationId','customerId']),
    mutate('customer_account_publish','Retain the exact reviewed original account, full files and offline customer response desk. This publishes a local account package.',
      {...account,workspaceId:hash,reviewSha256:hash},['publicationId','customerId','workspaceId','reviewSha256']),
    read('customer_response_preview','Bind the exact original response to its customer publication. Choose inline responseText or one configured receivablesInputs responseSource. Returns full retained source text for exact receiving and replay.',
      {...response,responseSource:{type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'}},['publicationId']),
    mutate('customer_response_receive','Receive the original reviewed responseText bytes once into the published account. Keep the complete preview and stable request.',
      {...response,workspaceId:hash,reviewSha256:hash},['publicationId','responseText','workspaceId','reviewSha256']),
    read('customer_response_detail','Open the complete original response, staff decisions, customer account and current case references.',
      {customerResponseId:uuid},['customerResponseId']),
    read('customer_response_review_preview','Review one original customer entry beside its published invoice and the current dated account/case. Explicitly acknowledge changes and choose any reopening, promise replacement or dispute resolution.',
      decision,decisionRequired),
    mutate('customer_response_review','Save the exact reviewed response outcome and original collection activities in one accounting commit. Reported payments remain inbound contact for original cash matching.',
      {...decision,workspaceId:hash,reviewSha256:hash},[...decisionRequired,'workspaceId','reviewSha256'])
  ];
}
