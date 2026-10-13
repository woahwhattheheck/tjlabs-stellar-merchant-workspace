// MIT. Authenticated route leaf mounted by the original Collections listener.
import { CUSTOMER_USE_LIMITS, requireCustomerUse as need, hash } from './customer-use-definition.mjs';
const root='/api/customer-use';
const id='([A-Za-z0-9][A-Za-z0-9._-]{0,79})', sha='([a-f0-9]{64})';
const uuid='([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})';
function fields(value,allowed) {
  need(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key)),
    'CUSTOMER_USE_REQUEST_INVALID','Use the supported complete request fields.');
  return value;
}
async function bytes(request,maximum) {
  const chunks=[];let length=0;
  for await(const chunk of request) {
    length+=chunk.length;
    need(length<=maximum,'CUSTOMER_USE_REQUEST_SIZE','This source exceeds the supported byte limit.',413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks,length);
}
async function json(request,allowed,maximum=CUSTOMER_USE_LIMITS.documentBytes+65536) {
  need((request.headers['content-type']??'').split(';')[0].trim().toLowerCase()==='application/json',
    'CUSTOMER_USE_JSON_REQUIRED','Send the complete JSON action.',415);
  let value;
  try {value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(request,maximum)));}
  catch(error){if(error.code)throw error;need(false,'CUSTOMER_USE_JSON_INVALID','Send complete UTF-8 JSON.');}
  return fields(value,allowed);
}
function method(request,expected) {
  need(request.method===expected,'CUSTOMER_USE_METHOD_NOT_ALLOWED','Use the supported request method.',405);
}
function download(response,file) {
  if(response.destroyed)return;
  const headers={'Content-Type':file.type,'Content-Length':file.bytes.length,
    'Content-Disposition':'attachment; filename="'+file.name.replace(/[^A-Za-z0-9._-]/g,'_')+'"',
    'X-Content-SHA256':file.sha256,'X-Customer-Use-Revision':file.revisionSha256};
  response.writeHead(200,headers);response.end(file.bytes);
}
/** Parent applies its private session, host/origin checks and tracks this awaited request. */
export async function routeCustomerUse({request,response,url,controller,mutate,send}) {
  if(!url.pathname.startsWith(root+'/'))return false;
  const api=controller();
  if(url.pathname===root+'/sources') {
    method(request,'GET');send(await api.listSources());return true;
  }
  let matched=new RegExp('^'+root+'/sources/'+sha+'$').exec(url.pathname);
  if(matched) {
    if(request.method==='GET'){send(await api.source(matched[1]));return true;}
    method(request,'POST');
    need((request.headers['content-type']??'').split(';')[0].trim().toLowerCase()==='application/octet-stream',
      'CUSTOMER_USE_SOURCE_CONTENT_TYPE','Send the unchanged original file bytes.',415);
    let name;
    try{name=decodeURIComponent(request.headers['x-customer-use-name']??'customer-use-calendar.json');}
    catch{need(false,'CUSTOMER_USE_SOURCE_NAME_INVALID','Retain the original filename.');}
    const source=await bytes(request,CUSTOMER_USE_LIMITS.sourceBytes);
    send(await mutate(()=>api.importSource({bytes:source,name,expectedSha256:hash(matched[1])})),201);return true;
  }
  if(url.pathname===root+'/commissions') {
    if(request.method==='GET'){send(await api.list());return true;}
    method(request,'POST');
    const input=await json(request,['document','expectedHeadSha256','actor','requestId']);
    send(await mutate(()=>api.save(input)),201);return true;
  }
  if(url.pathname===root+'/receiving') {
    method(request,'GET');send(await api.verifyReceiving());return true;
  }
  matched=new RegExp('^'+root+'/commissions/'+id+'(?:/revisions/'+sha+')?$').exec(url.pathname);
  if(matched){method(request,'GET');send(await api.inspect({id:matched[1],...(matched[2]?{sha256:matched[2]}:{})}));return true;}
  matched=new RegExp('^'+root+'/commissions/'+id+'/actions/'+uuid+'$').exec(url.pathname);
  if(matched){method(request,'GET');send(await api.action({id:matched[1],requestId:matched[2]}));return true;}
  matched=new RegExp('^'+root+'/commissions/'+id+'/revisions/'+sha+'/export/(json|csv)$').exec(url.pathname);
  if(matched){
    method(request,'GET');download(response,await api.export({id:matched[1],sha256:matched[2],format:matched[3]}));return true;
  }
  matched=new RegExp('^'+root+'/commissions/'+id+'/returns/'+uuid+'$').exec(url.pathname);
  if(matched){method(request,'GET');download(response,await api.returnedFile({id:matched[1],requestId:matched[2]}));return true;}
  matched=new RegExp('^'+root+'/commissions/'+id+'/capture$').exec(url.pathname);
  if(matched){
    method(request,'POST');const input=await json(request,['sha256','bindingIds','maxVerifyBytes','actor','requestId']);
    send(await mutate(()=>api.capture({...input,id:matched[1]})),201);return true;
  }
  matched=new RegExp('^'+root+'/commissions/'+id+'/(prepare|create)$').exec(url.pathname);
  if(matched) {
    method(request,'POST');const operation=matched[2];
    const allowed=['sha256','collectionId','actor','requestId',
      ...(operation==='create'?['expectedEditionSha256','expectedPreviewSha256']:[])];
    const input=await json(request,allowed);
    send(await mutate(()=>api[operation]({...input,id:matched[1]})),201);return true;
  }
  need(false,'CUSTOMER_USE_ROUTE_NOT_FOUND','This customer-use route does not exist.',404);
}
