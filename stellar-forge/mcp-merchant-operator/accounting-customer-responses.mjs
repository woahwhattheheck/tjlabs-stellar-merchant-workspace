// MIT. TokenJunkieLabs. Customer response methods share the original Receivables owner.
export const CUSTOMER_ACCOUNT_METHODS = Object.freeze({
  customerAccountResponses:'customer_account_list',
  previewCustomerAccount:'customer_account_preview',
  publishCustomerAccount:'customer_account_publish',
  previewCustomerResponse:'customer_response_preview',
  receiveCustomerResponse:'customer_response_receive',
  customerResponse:'customer_response_detail',
  previewCustomerResponseReview:'customer_response_review_preview',
  reviewCustomerResponse:'customer_response_review'
});
export const CUSTOMER_ACCOUNT_SELECTORS = Object.freeze({
  customer_response_detail:'customerResponseId',
  customer_response_review_preview:'customerResponseId',
  customer_response_review:'customerResponseId'
});
export const CUSTOMER_ACCOUNT_ACTIONS = Object.freeze({
  customer_account_publish:'customer_account_published',
  customer_response_receive:'customer_account_response_received',
  customer_response_review:'customer_account_response_reviewed'
});
export const CUSTOMER_ACCOUNT_FILE_KINDS = Object.freeze(['receivables-customer-account','receivables-customer-response']);
export const CUSTOMER_ACCOUNT_FILE_NAMES = Object.freeze([
  'account.tar','account.json','account.html','account-binding.json','customer-account.html','delivery-manifest.json',
  'received-response.json','merchant-review.json','merchant-review.html','response-manifest.json','response.tar'
]);
const methods=Object.freeze(Object.fromEntries(Object.entries(CUSTOMER_ACCOUNT_METHODS).map(([method,operation])=>[operation,method])));
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=message=>Object.assign(new Error(message),{code:'ACCOUNTING_CUSTOMER_ACCOUNT_ARGUMENTS',status:400});
export function customerAccountInvocation(operation,input={}){
  if(!methods[operation]||!plain(input))throw fail('Select a complete original customer account operation.');
  const value={...input};delete value.workspace;
  const selector=CUSTOMER_ACCOUNT_SELECTORS[operation];
  if(!selector)return{method:methods[operation],arguments:[value]};
  const id=value[selector];if(typeof id!=='string'||!UUID.test(id))throw fail('Choose the original customer response UUID.');
  delete value[selector];
  return{method:methods[operation],arguments:operation==='customer_response_detail'?[id]:[id,value]};
}
export async function callCustomerAccount(receivables,operation,input={},readSource){
  let value={...input};
  if(operation==='customer_response_preview'){
    if(value.responseSource!==undefined){
      if(value.responseText!==undefined||typeof readSource!=='function')throw fail('Choose one original configured source or complete inline response text.');
      const bytes=await readSource(value.responseSource,1500000);
      if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>1500000)throw fail('Retain the complete original response within1.5 MB.');
      try{value.responseText=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
      catch{throw fail('Use the original UTF-8 customer response.');}
      delete value.responseSource;
    }
  }else if(value.responseSource!==undefined)throw fail('Resolve the original source during preview; retain its complete responseText for receiving.');
  const invocation=customerAccountInvocation(operation,value);
  if(typeof receivables?.[invocation.method]!=='function')throw Object.assign(new Error('The selected original Receivables edition needs customer account response support.'),{code:'ACCOUNTING_CUSTOMER_ACCOUNT_UNAVAILABLE',status:409});
  const result=await receivables[invocation.method](...invocation.arguments);
  return operation==='customer_response_preview'?{...result,source:{publicationId:value.publicationId,responseText:value.responseText}}:result;
}
export async function customerAccountFile(receivables,input){
  if(!plain(input)||!CUSTOMER_ACCOUNT_FILE_KINDS.includes(input.kind)||typeof input.file!=='string'||
    !/^(?:documents\/)?[A-Za-z0-9._-]+$/.test(input.file)||input.file.split('/').some(part=>part==='.'||part==='..'))
    throw fail('Choose an original retained customer account or response file.');
  const selector=input.kind==='receivables-customer-account'?'publicationId':'customerResponseId';
  if(typeof input[selector]!=='string'||!UUID.test(input[selector]))throw fail('Choose the original '+selector+' UUID.');
  return input.kind==='receivables-customer-account'?
    receivables.customerAccountFile(input[selector],input.file):receivables.customerResponseFile(input[selector],input.file);
}
