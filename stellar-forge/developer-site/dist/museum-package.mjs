// MIT. Exact visitor packages; complete media remain separate from editorial JSON.
import { sha256 } from './source-table-workspace.mjs';
import { zipWorkspace } from './onboarding.mjs';
import { validateCollectionWorkspace, saveCollectionRevision } from './collection-review-workspace.mjs';
import { collectMuseumState, museumControl, museumVisibleItems, museumReleaseStatus, museumDigest, applyMuseumAction, validateMuseumState } from './museum-delivery.mjs';
import { renderMuseumVisitor, museumVisitorRuntimeSource } from './museum-visitor.mjs';
export const MUSEUM_BROWSER_PACKAGE_BYTES=256*1024*1024;
const json=v=>JSON.stringify(v,null,2)+'\n',clone=v=>JSON.parse(JSON.stringify(v));
const fail=message=>{throw Object.assign(Error(message),{code:'MUSEUM_PACKAGE'});};
function fileBytes(file){
 if(file instanceof Uint8Array)return Promise.resolve(file);
 if(file instanceof ArrayBuffer)return Promise.resolve(new Uint8Array(file));
 if(file&&typeof file.arrayBuffer==='function')return file.arrayBuffer().then(b=>new Uint8Array(b));
 fail('Select the actual original media file.');
}
export async function describeMuseumMedia(file,{role='encoded',label='',filename=file?.name,mime=file?.type||'application/octet-stream'}={}){
 if(typeof filename!=='string'||!filename||filename.length>240)fail('Keep the original media filename.');
 const size=file?.size??file?.byteLength;if(!Number.isSafeInteger(size)||size<0||size>MUSEUM_BROWSER_PACKAGE_BYTES)fail('Use the streaming directory command for media larger than the 256 MiB browser allowance.');
 const bytes=await fileBytes(file),digest=await sha256(bytes),match=/\.([a-z0-9]{1,12})$/i.exec(filename),extension=match?match[1].toLowerCase():'bin';
 return {id:'media-'+digest,sha256:digest,bytes:bytes.length,filename,path:'media/'+digest+'.'+extension,mime,role,label};
}
export async function prepareMuseumPackage(workspace,{state=null,releaseId,endpointId,id,actor,createdAt,expiresAt=null}){
 const w=await validateCollectionWorkspace(workspace),current=state||w.revisions.find(r=>r.id===w.headId).state,m=collectMuseumState(w,current);
 const release=m.releases.find(r=>r.id===releaseId),endpoint=m.endpoints.find(e=>e.id===endpointId);
 if(!release||!endpoint||!release.endpointIds.includes(endpointId))fail('Choose the original release and its exact selected endpoint profile.');
 if(museumReleaseStatus(m,releaseId)!=='approved')fail('Retain the actual final approval of this exact release before preparing deployment.');
 const time=Date.parse(createdAt),expiry=expiresAt||release.expiresAt;
 if(!Number.isFinite(time)||!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=time||Date.parse(expiry)>Date.parse(release.expiresAt))fail('Choose a deployment time before its explicit release expiry.');
 const control=museumControl(w,current),controlSha256=await museumDigest(control),visible=museumVisibleItems(release,control);
 const required=new Set(visible.flatMap(i=>[...i.mediaIds,...(i.captionsMediaId?[i.captionsMediaId]:[])]));
 const assets=m.assets.filter(a=>required.has(a.id)).sort((a,b)=>a.path.localeCompare(b.path));
 const runtimeSha256=await sha256(museumVisitorRuntimeSource());
 const manifest={schema:'stellar-forge.museum-endpoint.v1',workspaceId:w.id,deploymentId:id,createdAt,runtimeSha256,
  endpoint:{id:endpoint.id,key:endpoint.key,label:endpoint.label,family:endpoint.family},
  release:{id:release.id,title:release.title,introduction:release.introduction,expiresAt:release.expiresAt,
   items:visible.map(i=>({key:i.key,occurrenceId:i.occurrenceId,title:i.title,summary:i.summary,alt:i.alt,credit:i.credit,mediaIds:clone(i.mediaIds),transcript:i.transcript,captionsMediaId:i.captionsMediaId}))},
  assets:assets.map(a=>({id:a.id,sha256:a.sha256,bytes:a.bytes,path:a.path,mime:a.mime,role:a.role})),controlSha256,expiresAt:expiry};
 // release.id names the immutable full editorial release. Visitor items are the
 // explicitly permitted projection; withdrawn text/media are not copied here.
 const manifestSha256=await museumDigest(manifest),deployment={id,endpointId,releaseId,actor,createdAt,controlSha256,manifestSha256,expiresAt:expiry};
 const existing=w.revisions.find(r=>r.request.id===id);
 if(existing){
  const retained=existing.request.state.museum?.deployments.find(d=>d.id===id);
  if(!retained||await museumDigest(retained)!==await museumDigest(deployment))fail('This original deployment now differs from current controls or runtime. Retain it and prepare an explicit new deployment ID.');
 }
 const next=await applyMuseumAction(w,current,{type:'deployment',record:deployment});validateMuseumState(next.museum);
 // Validate the complete proposed state through the original save path before producing any visitor bytes.
 const request=existing?clone(existing.request):{id,expectedRevision:w.headId,actor,note:'Prepared museum deployment '+id,createdAt,state:next};
 await saveCollectionRevision(w,request);
 const files=[
  {path:'index.html',content:renderMuseumVisitor({manifest,control,manifestSha256})},
  {path:'manifest.json',content:json(manifest)},
  {path:'control.json',content:json(control)},
  {path:'README.txt',content:'Museum visitor display\n\nOpen index.html from the complete extracted directory using the approved endpoint browser/profile. Keep every relative media file. No network media is fetched. The release ID names the retained complete editorial release; this visitor package contains only its currently permitted items.\n\nThe operator panel imports the current withdrawal control and verifies the actual local media before recording application. Package creation is not endpoint application. An offline endpoint cannot receive later withdrawals until the control reaches it. The explicit display expiry prevents indefinite use of this package; correct device time is required. Use the same endpoint/browser storage and bring the current control when restoring any older release. A different browser/device needs explicit control receiving.\n\nKeep editable workspace/source/working media in the separate private handover. This visitor folder does not replace those original files, installation decisions, or contractual acceptance.\n'}
 ];
 return {state:next,request,deployment,manifest,manifestSha256,control,assets,files};
}
async function assembleMuseumPackage(prepared,mediaFiles){
 const total=prepared.assets.reduce((n,a)=>n+a.bytes,0),textBytes=prepared.files.reduce((n,f)=>n+new TextEncoder().encode(f.content).length,0);
 if(total+textBytes>MUSEUM_BROWSER_PACKAGE_BYTES)fail('This complete package exceeds the 256 MiB browser allowance. Use the streaming directory command with the same prepared input.');
 const files=[...prepared.files];
 for(const asset of prepared.assets){
  const original=mediaFiles instanceof Map?(mediaFiles.get(asset.sha256)||mediaFiles.get(asset.id)||mediaFiles.get(asset.path)):mediaFiles?.[asset.sha256];
  if(!original)fail('Select the actual retained media: '+asset.filename);
  const bytes=await fileBytes(original);if(bytes.length!==asset.bytes||await sha256(bytes)!==asset.sha256)fail('The selected original media changed: '+asset.filename);
  files.push({path:asset.path,content:bytes});
 }
 return {...prepared,bytes:zipWorkspace(files)};
}
export async function buildMuseumPackage(workspace,options,mediaFiles){
 return assembleMuseumPackage(await prepareMuseumPackage(workspace,options),mediaFiles);
}
export async function buildPreparedMuseumPackage(workspace,prepared,mediaFiles){
 if(!prepared?.deployment||!prepared.manifest||!prepared.control)fail('Reopen the exact prepared deployment and original saved request.');
 const d=prepared.deployment,rebuilt=await prepareMuseumPackage(workspace,{id:d.id,endpointId:d.endpointId,releaseId:d.releaseId,actor:d.actor,createdAt:d.createdAt,expiresAt:d.expiresAt});
 if(!workspace.revisions.some(r=>r.request.id===d.id))fail('Save the exact original deployment request before rebuilding its delivered package.');
 if(await museumDigest(prepared.manifest)!==rebuilt.manifestSha256||await museumDigest(prepared.control)!==rebuilt.deployment.controlSha256)fail('The retained package manifest/control differs from this original saved deployment.');
 return assembleMuseumPackage(rebuilt,mediaFiles);
}
export async function describeMuseumHandover(workspace,{createdAt,actor}){
 const w=await validateCollectionWorkspace(workspace),m=collectMuseumState(w);
 if(typeof actor!=='string'||!actor.trim()||!Number.isFinite(Date.parse(createdAt)))fail('Record the actual handover operator and time.');
 return {schema:'stellar-forge.museum-handover.v1',workspaceId:w.id,selectedRevisionId:w.headId,createdAt,actor,
  workspaceSha256:await museumDigest(w),control:museumControl(w),assets:clone(m.assets),
  requiredRoles:['encoded','uncompressed','working','original','transcript','source'],
  absentRoles:['encoded','uncompressed','working','original','transcript','source'].filter(role=>!m.assets.some(a=>a.role===role)),
  note:'The complete editorial workspace and all supplied media roles are retained. An absent role is an explicit handover gap; two verified directory copies and actual restore observations are separately recorded.'};
}
