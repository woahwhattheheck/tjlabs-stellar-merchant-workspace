// MIT. Trusted composition through the existing Central Store and listener.
import {openCentralWorkspace} from '../workspace.mjs';
import {createCentralFormReleaseReview} from './model.mjs';
import {createCentralFormReleaseExtension} from './server.mjs';

export async function openCentralFormReleaseReview({directory,fetchImpl,extend,authoring}={}){
  let review;
  const workspace=await openCentralWorkspace({directory,fetchImpl,extend:async context=>{
    if(extend)await extend(context);
    review=createCentralFormReleaseReview({...context,authoring});
  }});
  return {workspace,review,extensions:[createCentralFormReleaseExtension({review})],close:()=>workspace.close()};
}
export function composeCentralFormReleaseReview({workspace,store,authoring}={}){
  const review=createCentralFormReleaseReview({workspace,store,authoring});
  return {review,extension:createCentralFormReleaseExtension({review})};
}
