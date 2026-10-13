// MIT — Complete customer catalogue review retained with its original request.
import path from 'node:path';
import {need,object} from './core.mjs';
import {readReviewSource,compareReviewSources} from './comparison.mjs';
import {reportHtml} from './report.mjs';
import {read,sha,privateDir,writeNew} from './io.mjs';

const SCHEMA='stellar-forge.rialto-request-review.v1';
const REVIEW_SCHEMA='stellar-forge.rialto-catalogue-review.v1';
const ROOT='catalogue-review';
const FILES=['received.json','before.catalogue.json','after.catalogue.json','report.html'];
const LIMIT=192*1024*1024;
const descriptor=(name,raw)=>({path:ROOT+'/'+name,bytes:raw.length,sha256:sha(raw)});
function originalText(raw){
 need(raw.length<=LIMIT,'Complete catalogue review exceeds 192 MiB');
 return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);
}
function inspectView(value){
 need(value===undefined||object(value),'Complete review view must be an object');
 if(value===undefined)return;
 need(value.note===undefined||typeof value.note==='string','Complete review note must be text');
 need(value.notes===undefined||object(value.notes),'Complete identity notes must be an object');
 for(const note of Object.values(value.notes??{}))need(typeof note==='string','Complete identity notes must retain their text');
 need(value.selectedKey===undefined||value.selectedKey===null||typeof value.selectedKey==='string','Original selected review identity must be text');
 need(value.search===undefined||typeof value.search==='string','Original review search must be text');
 need(value.status===undefined||['','added','removed','changed','unchanged'].includes(value.status),'Original review change filter is invalid');
 need(value.type===undefined||['','http','mcp'].includes(value.type),'Original review resource filter is invalid');
 need(value.duplicates===undefined||typeof value.duplicates==='boolean','Original duplicate filter must be boolean');
 need(value.page===undefined||Number.isSafeInteger(value.page)&&value.page>=0,'Original review page must be nonnegative');
}
function inspectDrafts(items){
 need(Array.isArray(items),'Complete carried request drafts required');
 for(const item of items){
  need(object(item)&&/^[a-f0-9]{64}$/.test(item.catalogueSha256)&&Number.isSafeInteger(item.rowIndex)&&item.rowIndex>=0&&typeof item.resourceKey==='string'&&object(item.values),'A carried request draft has an invalid original identity');
 }
}
async function originalSource(value){
 need(object(value)&&typeof value.utf8==='string'&&Number.isSafeInteger(value.bytes)&&/^[a-f0-9]{64}$/.test(value.sha256),'Every complete catalogue source and exact identity is required');
 const source=await readReviewSource(value.filename,value.utf8,bytes=>sha(bytes));
 need(source.bytes===value.bytes&&source.sha256===value.sha256,'Complete catalogue source bytes or digest changed: '+value.filename);
 return source;
}

/** Validate the full received review before any original request stage is created. */
async function parseRequestReview(raw,original,selected){
 const value=JSON.parse(originalText(raw));
 need(object(value)&&value.schema===REVIEW_SCHEMA,'Select the complete downloaded catalogue review JSON');
 inspectView(value.view);inspectDrafts(value.requestDrafts??[]);
 const before=await originalSource(value.before),after=await originalSource(value.after);
 const comparison=compareReviewSources(before,after);
 need(after.sha256===original.sha256&&after.utf8===original.raw.toString('utf8'),'Review after source must be this exact complete original catalogue');
 const entry=after.catalogue.rows[selected.rowIndex];
 need(entry&&entry.key===selected.resourceKey&&selected.catalogueSha256===after.sha256,'Review must retain the exact selected original row');
 need(comparison.rows.some(row=>row.key===selected.resourceKey&&row.after.length),'Selected original resource is absent from the reviewed after edition');
 return{raw,value,before,after,comparison};
}
export async function readRequestReview(filename,original,selected){return parseRequestReview(await read(filename),original,selected);}
function receivingReport(original,review){
 const source=JSON.stringify(review.value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 const html=reportHtml(original.value,original.sha256),marker='<main>';
 need(html.indexOf(marker)>=0&&html.indexOf(marker)===html.lastIndexOf(marker),'Original report receiving location changed');
 return Buffer.from(html.replace(marker,'<script id="comparison-receiving" type="application/json">'+source+'</script>'+marker),'utf8');
}

/** Retain original review, both original source files and its complete offline report. */
export async function retainRequestReview(stage,review,original,selected){
 await privateDir(path.join(stage,ROOT),{create:true});
 const bodies=[review.raw,Buffer.from(review.before.utf8,'utf8'),Buffer.from(review.after.utf8,'utf8'),receivingReport(original,review)];
 const files=FILES.map((name,i)=>descriptor(name,bodies[i]));
 for(let i=0;i<FILES.length;i++)await writeNew(path.join(stage,ROOT,FILES[i]),bodies[i]);
 return{schema:SCHEMA,catalogueSha256:original.sha256,rowIndex:selected.rowIndex,resourceKey:selected.resourceKey,beforeSha256:review.before.sha256,afterSha256:review.after.sha256,reviewSha256:sha(review.raw),files};
}

/** Reopen the same retained decision with the existing original request verifier. */
export async function verifyRequestReview(root,selected,original){
 const binding=selected.catalogueReview;
 if(binding===undefined)return null;
 need(object(binding)&&binding.schema===SCHEMA,'Original customer review binding changed');
 need(binding.catalogueSha256===original.sha256&&binding.afterSha256===original.sha256&&binding.rowIndex===selected.rowIndex&&binding.resourceKey===selected.resourceKey,'Original review no longer matches the selected catalogue and row');
 need(Array.isArray(binding.files)&&binding.files.length===FILES.length,'Retain every complete original review file');
 await privateDir(path.join(root,ROOT));
 const records=[];
 for(let i=0;i<FILES.length;i++){
  const file=binding.files[i],expected=ROOT+'/'+FILES[i];
  need(object(file)&&file.path===expected&&Number.isSafeInteger(file.bytes)&&file.bytes>=0&&/^[a-f0-9]{64}$/.test(file.sha256),'Original review file descriptor changed');
  const raw=await read(path.join(root,ROOT,FILES[i]));
  need(raw.length===file.bytes&&sha(raw)===file.sha256,'Retained original review file changed: '+expected);
  records.push(raw);
 }
 const review=await parseRequestReview(records[0],original,selected);
 need(sha(records[0])===binding.reviewSha256&&review.before.sha256===binding.beforeSha256&&review.after.sha256===binding.afterSha256,'Original received comparison identity changed');
 need(records[1].equals(Buffer.from(review.before.utf8,'utf8'))&&records[2].equals(Buffer.from(review.after.utf8,'utf8')),'Retained complete source differs from the original received review');
 return{schema:SCHEMA,reviewSha256:binding.reviewSha256,catalogueSha256:binding.catalogueSha256,rowIndex:binding.rowIndex,resourceKey:binding.resourceKey,beforeSha256:binding.beforeSha256,afterSha256:binding.afterSha256,counts:review.comparison.counts,sameScope:review.comparison.sameScope,beforeComplete:review.comparison.beforeComplete,afterComplete:review.comparison.afterComplete,report:path.join(root,ROOT,'report.html'),file:path.join(root,ROOT,'received.json')};
}
