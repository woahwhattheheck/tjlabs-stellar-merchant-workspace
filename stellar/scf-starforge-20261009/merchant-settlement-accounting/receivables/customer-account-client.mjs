// MIT. Customer account operations use the original receivables HTTP transport.
import {ReceivablesClient} from './client.mjs';
export function createCustomerAccountResponseClient({baseUrl='/api/receivables',fetchImpl=globalThis.fetch,expectedWorkspaceId,expectedSourcesSha256}={}){
  const client=new ReceivablesClient({baseUrl,fetch:fetchImpl,expectedWorkspaceId,expectedSourcesSha256});
  const part=value=>{if(typeof value!=='string'||!value||/[\\/\u0000-\u001f]/.test(value))throw new TypeError('Use an original record identifier.');return encodeURIComponent(value);};
  const query=value=>{const result=new URLSearchParams();for(const [key,item]of Object.entries(value||{}))if(item!==undefined&&item!==null&&item!=='')result.set(key,String(item));return result.size?'?'+result.toString():'';};
  const request=(path,{value,raw=false,signal}={})=>client.request(path,{method:value===undefined?'GET':'POST',body:value,binary:raw,signal});
  return Object.freeze({
    customerAccountResponses:value=>request('/customer-accounts'+query(value)),
    previewCustomerAccount:value=>request('/customer-accounts/preview',{value}),
    publishCustomerAccount:value=>request('/customer-accounts',{value}),
    previewCustomerResponse:value=>request('/customer-accounts/responses/preview',{value}),
    receiveCustomerResponse:value=>request('/customer-accounts/responses',{value}),
    customerResponse:id=>request('/customer-accounts/responses/'+part(id)),
    previewCustomerResponseReview:(id,value)=>request('/customer-accounts/responses/'+part(id)+'/preview',{value}),
    reviewCustomerResponse:(id,value)=>request('/customer-accounts/responses/'+part(id)+'/review',{value}),
    customerAccountFile:(id,name)=>request('/customer-accounts/'+part(id)+'/files'+query({name}),{raw:true}),
    customerResponseFile:(id,name)=>request('/customer-accounts/responses/'+part(id)+'/files'+query({name}),{raw:true}),
    customerAccountOperation:requestId=>request('/customer-accounts/operations/'+part(requestId)),
  });
}
