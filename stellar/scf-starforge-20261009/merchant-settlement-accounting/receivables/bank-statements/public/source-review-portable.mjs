// SPDX-License-Identifier: MIT
// Complete offline recipient, original files and the exact installed source project.
import {verifySourceReview,verifySourceReviewDesk,reviewBytes,reviewEqual,REVIEW_LIMITS} from './source-review-model.mjs';
import {bytesSha256} from './source-preparation-capsule.mjs';
export const REVIEW_SOURCE_SCHEMA='stellar-forge.bank-source-review-source.v1';
export const REVIEW_PORTABLE_SCHEMA='stellar-forge.bank-source-review-portable.v1';
const names=['source-review.html','source-review.css','source-review.mjs','source-review-portable.mjs','source-review-model.mjs','source-preparation-state.mjs','source-preparation-capsule.mjs','source-collection-model.mjs'];
const utf8=text=>new TextEncoder().encode(text);
const error=message=>{throw new Error(message);};
export async function verifyReviewSourceProject(value){
 if(!value||value.schema!==REVIEW_SOURCE_SCHEMA||!Array.isArray(value.files)||value.files.length!==names.length)error('Receive the complete eight-file source-review project.');
 const seen=new Set();
 for(const f of value.files){
  if(!f||!names.some(n=>f.path==='public/'+n)||seen.has(f.path)||typeof f.content!=='string'||f.content.length>2000000)error('The source project contains a missing, duplicate or unexpected file.');
  seen.add(f.path);const bytes=utf8(f.content);
  if(f.bytes!==bytes.length||f.sha256!==await bytesSha256(bytes))error('The complete source file changed: '+f.path);
 }
 return structuredClone(value);
}
export async function loadReviewSourceProject(){
 const embedded=globalThis.__SOURCE_REVIEW_PORTABLE__;
 if(embedded?.sourceProject)return verifyReviewSourceProject(embedded.sourceProject);
 const response=await fetch('./source-review-source.json',{cache:'no-store',credentials:'same-origin'});
 if(!response.ok)error('The complete installed review source is unavailable ('+response.status+'). Keep the working record and try the same installed source again.');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length>16000000)error('The installed source project exceeds its whole-file receiving limit.');
 return verifyReviewSourceProject(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
function bootstrap(){
 const payload=JSON.parse(document.getElementById('source-review-portable-data').textContent);
 globalThis.__SOURCE_REVIEW_PORTABLE__=payload;
 const sources=new Map(payload.sourceProject.files.map(f=>[f.path,f.content])),urls=new Map(),active=new Set();
 function resolve(parent,name){
  if(!name.startsWith('./')||name.slice(2).includes('/')||name.includes('\\'))throw new Error('Unexpected portable module dependency.');
  return 'public/'+name.slice(2);
 }
 function moduleUrl(path){
  if(urls.has(path))return urls.get(path);
  if(active.has(path)||!sources.has(path))throw new Error('Incomplete or cyclic portable source: '+path);
  active.add(path);
  const source=sources.get(path).replace(/(\bfrom\s*)(['"])(\.[^'"]+)\2/g,(_,prefix,quote,name)=>prefix+quote+moduleUrl(resolve(path,name))+quote);
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.set(path,url);active.delete(path);return url;
 }
 import(moduleUrl('public/source-review.mjs')).catch(e=>{
  const node=document.getElementById('notice');node.hidden=false;node.dataset.level='error';node.textContent='The complete offline application could not open: '+e.message;
 });
 window.addEventListener('pagehide',()=>{for(const url of urls.values())URL.revokeObjectURL(url);},{once:true});
}
export async function buildPortableSourceReview({reviewPackage,workingRecord=null,sourceProject}){
 const project=await verifyReviewSourceProject(sourceProject),verified=await verifySourceReview(reviewPackage);
 if(workingRecord){await verifySourceReviewDesk(workingRecord);if(!reviewEqual(workingRecord.package,verified.value))error('The full working record and selected review package differ.');}
 const payload={schema:REVIEW_PORTABLE_SCHEMA,reviewPackage:workingRecord?null:verified.value,workingRecord:workingRecord?structuredClone(workingRecord):null,sourceProject:project};
 // Preserve the full original file strings. Escape only the HTML script container delimiters.
 const json=JSON.stringify(payload).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const get=name=>project.files.find(f=>f.path==='public/'+name).content;
 let html=get('source-review.html'),style=get('source-review.css').replace(/<\/style/gi,'<\\/style');
 const cssTag='<link rel="stylesheet" href="./source-review.css">',scriptTag='<script type="module" src="./source-review.mjs"></script>';
 if(html.split(cssTag).length!==2||html.split(scriptTag).length!==2)error('The selected complete source template has changed. Receive its matching exporter.');
 html=html.replace(cssTag,()=>'<style>'+style+'</style>').replace(scriptTag,()=>'<script id="source-review-portable-data" type="application/json">'+json+'</script><script type="module">('+bootstrap.toString()+')();</script>');
 const bytes=utf8(html);if(bytes.length>REVIEW_LIMITS.workingBytes+16000000)error('The complete offline application exceeds the working-record allowance plus source. Keep the complete JSON record; no partial HTML was produced.');
 return {name:'bank-source-review-'+verified.issue.id+'.html',bytes,sha256:await bytesSha256(bytes),sourceProject:project};
}
