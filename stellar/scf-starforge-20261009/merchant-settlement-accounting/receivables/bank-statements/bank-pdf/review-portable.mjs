// SPDX-License-Identifier: MIT
import {digest} from './model.mjs';
import {PDF_DESK_MAX_BYTES,checkPdfDesk} from './review-state.mjs';
const schema='stellar-forge.bank-pdf-review-source.v1';
const required=['review.html','review.css','review-app.mjs','review-state.mjs','review-portable.mjs','review-model.mjs','model.mjs'];
const esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const data=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
function need(value,message){if(!value)throw new Error(message);}
export async function verifyPdfReviewSources(manifest){
 need(manifest?.schema===schema&&Array.isArray(manifest.files),'Open the complete original review source manifest');
 const files=new Map();
 for(const file of manifest.files){need(typeof file.path==='string'&&/^[A-Za-z0-9_.-]+$/.test(file.path)&&!files.has(file.path)&&typeof file.content==='string','Retain unique complete review source filenames');const bytes=new TextEncoder().encode(file.content);need(file.bytes===bytes.length&&await digest(bytes)===file.sha256,'A complete review source file changed: '+file.path);files.set(file.path,file);}
 for(const name of required)need(files.has(name),'The complete offline review needs '+name);
 return files;
}
export async function buildPdfReviewProject(desk,manifest){
 checkPdfDesk(desk);await verifyPdfReviewSources(manifest);
 const result=JSON.stringify({schema:'stellar-forge.bank-pdf-review-project.v1',desk,source:manifest})+'\n';
 need(new TextEncoder().encode(result).length<=PDF_DESK_MAX_BYTES,'The complete source project exceeds 768 MiB; download the whole working record and source manifest separately.');
 return {name:'pdf-review-'+desk.caseId+'.project.json',type:'application/json',content:result,sha256:await digest(result)};
}
export async function buildPdfReviewHtml(desk,manifest){
 checkPdfDesk(desk);const files=await verifyPdfReviewSources(manifest),html=files.get('review.html').content,css=files.get('review.css').content;
 const loader=String.raw`
const packageValue=JSON.parse(document.getElementById('pdf-review-package').textContent);
globalThis.__PDF_REVIEW_DESK=packageValue.desk;
globalThis.__PDF_REVIEW_SOURCES=packageValue.source;
globalThis.__PDF_REVIEW_OFFLINE=true;
const sourceMap=new Map(packageValue.source.files.map(f=>[f.path,f.content])),urls=new Map(),visiting=new Set();
function moduleUrl(name){
 if(urls.has(name))return urls.get(name);
 if(visiting.has(name))throw new Error('Circular original source import: '+name);
 if(!sourceMap.has(name))throw new Error('Missing complete source: '+name);
 visiting.add(name);
 const source=sourceMap.get(name).replace(/(from\s*|import\s*)(['"])\.\/([A-Za-z0-9_.-]+)\2/g,(match,lead,quote,dependency)=>lead+quote+moduleUrl(dependency)+quote);
 const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.set(name,url);visiting.delete(name);return url;
}
try{await import(moduleUrl('review-app.mjs'));}catch(error){const p=document.getElementById('message');p.textContent='The complete review could not open: '+error.message;p.classList.add('error');}
`;
 let result=html.replace('<link rel="stylesheet" href="./review.css">','<style>'+css.replace(/<\/style/gi,'<\\/style')+'</style>');
 need(result!==html,'The selected HTML stylesheet join changed');
 const script='<script type="application/json" id="pdf-review-package">'+data({desk,source:manifest})+'</script><script type="module">'+loader.replace(/<\/script/gi,'<\\/script')+'</script>';
 const before=result;result=result.replace('<script type="module" src="./review-app.mjs"></script>',script);need(result!==before,'The selected HTML module join changed');
 need(new TextEncoder().encode(result).length<=PDF_DESK_MAX_BYTES,'The complete offline HTML exceeds 768 MiB; use the full working record with the installed original review source.');
 return {name:'pdf-review-'+desk.caseId+'.html',type:'text/html',content:result,sha256:await digest(result)};
}
