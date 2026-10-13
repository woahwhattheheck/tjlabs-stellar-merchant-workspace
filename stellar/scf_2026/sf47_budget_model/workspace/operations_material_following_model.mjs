// MIT. Retained following-source drafts; no native mutation.
import {Sha256} from './operations_installation_source_hash.mjs';
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b)=>canonical(a)===canonical(b);
const need=(v,m)=>{if(!v)throw Error(m);};
const hash=x=>new Sha256().update(new TextEncoder().encode(canonical(x))).hex();
export function validateMaterialFollowing(copy,sources){
 if(copy.following===undefined||copy.following===null)return;
 const f=copy.following,c=f.comparison;
 need(f.schema==='stellar-forge.material-installation-following.v1.working'&&f.request&&c?.schema==='stellar-forge.material-installation-following.v1.comparison','Retain the complete following Installation draft.');
 const raw={...c};delete raw.sha256;need(hash(raw)===c.sha256,'The complete retained following comparison changed.');
 need(c.basis.installation.id===f.request.installationId&&c.basis.installation.revision===f.request.expectedRevision&&c.basis.installation.sha256===f.request.expectedInstallationSha256,'Keep the original saved Installation target.');
 need(c.basis.source.id===copy.sourceId&&c.basis.source.sha256===copy.sourceSha256&&sources.some(s=>s.metadata.id===c.basis.previousSource.id&&s.metadata.sha256===c.basis.previousSource.sha256),'Retain both original source files with this draft.');
 need(same(copy.document,c.currentDocument)&&typeof f.reviewText==='string'&&new TextEncoder().encode(f.reviewText).length<=16*1024*1024,'Keep the complete current document and unfinished attributed review.');
}
export function materialFollowingInput(copy){
 if(!copy.following)return {};
 need(!copy.followingSelectionChanged,'The selected target changed. Compare the exact new selection before preparing.');
 return {...structuredClone(copy.following.request),followingReview:JSON.parse(copy.following.reviewText)};
}
