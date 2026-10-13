// MIT. Mount the release desk inside the existing authenticated Central operator.
import {fault} from '../../odata/state.mjs';

export function createCentralFormReleaseExtension({review}={}){
  if(!review?.state)throw fault('FORM_REVIEW_EXTENSION','Open the original release-review workspace.');
  const assets=new Map([
    ['/form-releases/',{url:new URL('./index.html',import.meta.url),type:'text/html; charset=utf-8'}],
    ['/form-releases/ui.css',{url:new URL('./ui.css',import.meta.url),type:'text/css; charset=utf-8'}],
    ['/form-releases/ui.mjs',{url:new URL('./ui.mjs',import.meta.url),type:'text/javascript; charset=utf-8'}],
  ]);
  const actions=new Set(['retainCapture','retainDraft','retainAuthoring','createReview','mapReports','decide','publicationPlan']);
  return {name:'form-releases',assets,async handle({request,response,address,json,body}){
    if(request.method==='GET'&&address.pathname==='/api/form-releases/state'){
      json(response,200,await review.state());return true;
    }
    const selected=/^\/api\/form-releases\/reviews\/([^/]+)$/.exec(address.pathname);
    if(request.method==='GET'&&selected){
      json(response,200,review.getReview({id:decodeURIComponent(selected[1])}));return true;
    }
    const source=/^\/api\/form-releases\/sources\/([^/]+)$/.exec(address.pathname);
    if(request.method==='GET'&&source){
      json(response,200,review.getSource({id:decodeURIComponent(source[1])}));return true;
    }
    const action=/^\/api\/form-releases\/actions\/([A-Za-z]+)$/.exec(address.pathname);
    if(request.method==='POST'&&action&&actions.has(action[1])){
      const input=await body(request);
      if(!input||typeof input!=='object'||Array.isArray(input))throw fault('FORM_REVIEW_REQUEST','Send a release-review action object.');
      json(response,200,{ok:true,result:await review[action[1]](input)});return true;
    }
    return false;
  }};
}
