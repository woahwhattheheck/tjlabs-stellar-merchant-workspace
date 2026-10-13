// MIT. Existing authenticated listener extension; no independent host.
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {fault} from '../../odata/state.mjs';
export function createCentralReleaseOperationsExtension({operations}={}){
 if(!operations?.state)throw fault('RELEASE_EXTENSION','Compose the original release operations workspace.');
 const assets=new Map([
  ['/release-operations/',{url:new URL('./index.html',import.meta.url),type:'text/html; charset=utf-8'}],
  ['/release-operations/ui.css',{url:new URL('./ui.css',import.meta.url),type:'text/css; charset=utf-8'}],
  ['/release-operations/ui.mjs',{url:new URL('./ui.mjs',import.meta.url),type:'text/javascript; charset=utf-8'}]
 ]);
 const actions=new Set(['receiveGitLab','resumeSource','createOperation','reviseOperation','successorOperation','decide','freeze','receiveStep','recordCheck','beginRecovery','acceptOperation']);
 const prefix='/api/release-operations';
 return {name:'release-operations',assets,async handle({request,response,address,json,body}){
  if(request.method==='GET'&&address.pathname===prefix+'/state'){json(response,200,operations.state());return true;}
  let match=new RegExp('^'+prefix+'/(operations|sources|plans|requests)/([^/]+)$').exec(address.pathname);
  if(request.method==='GET'&&match){
   const id=decodeURIComponent(match[2]),value=match[1]==='operations'?operations.getOperation({id}):match[1]==='sources'?operations.getSource({id}):
    match[1]==='plans'?operations.getPlan({id}):operations.getRequest({requestId:id});
   json(response,200,value);return true;
  }
  match=new RegExp('^'+prefix+'/operations/([^/]+)/handover$').exec(address.pathname);
  if(request.method==='GET'&&match){
   response.setHeader('Content-Disposition','attachment; filename="release-operation-handover.json"');
   json(response,200,operations.exportHandover({id:decodeURIComponent(match[1])}));return true;
  }
  match=new RegExp('^'+prefix+'/files/([^/]+)/([^/]+)$').exec(address.pathname);
  if(request.method==='GET'&&match){
   const source=await operations.file({sourceId:decodeURIComponent(match[1]),resourceKey:decodeURIComponent(match[2])});
   response.statusCode=200;response.setHeader('Content-Type','application/octet-stream');response.setHeader('Content-Length',source.bytes);
   response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Cache-Control','no-store');
   response.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(source.name));
   await pipeline(createReadStream(source.path),response);return true;
  }
  match=new RegExp('^'+prefix+'/originals/([^/]+)$').exec(address.pathname);
  if(request.method==='POST'&&match){
   const input={id:decodeURIComponent(match[1]),kind:address.searchParams.get('kind'),name:address.searchParams.get('name')};
   if(input.kind==='gitlab-artifact'){input.gitlabSourceId=address.searchParams.get('gitlabSourceId');input.jobId=address.searchParams.get('jobId');}
   json(response,200,{ok:true,result:await operations.receiveOriginal(input,request)});return true;
  }
  match=new RegExp('^'+prefix+'/actions/([A-Za-z]+)$').exec(address.pathname);
  if(request.method==='POST'&&match&&actions.has(match[1])){
   const input=await body(request);if(!input||typeof input!=='object'||Array.isArray(input))throw fault('RELEASE_REQUEST','Send the complete original action object.');
   json(response,200,{ok:true,result:await operations[match[1]](input)});return true;
  }
  return false;
 }};
}
