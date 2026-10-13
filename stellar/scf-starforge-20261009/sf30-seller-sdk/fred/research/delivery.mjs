// MIT. One issued Research product carries its selected original source graph.
import { resolve, join } from 'node:path';
import { lstat } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { privateDirectory, atomicJson, readPrivateJson, withPrivateLock } from '../../routescan/quota.mjs';
import { readBytes, writeBytes } from '../../../sf88-operator-buyer-cli/node/store.mjs';
import { initializeFredProject, readFredProject, transactFredProject } from '../project.mjs';
import { need, plain, clone, canonical, digest, sha, key, text, instant, catalogue,
  SCHEMA, MAX_TOTAL_BYTES, normalizeCapture, sourceSummary, validateResearchState } from './model.mjs';
import { validateResearchExtension, receiveResearchExtension } from './bundle.mjs';
import { readResearchSource } from './project.mjs';
import { RESEARCH_PACKAGE, researchReceivingRecord, retainResearchReceivingRecord } from './commerce-model.mjs';

export const RESEARCH_EDITION_DELIVERY = 'stellar-forge.research-edition-delivery.v1';
export const RESEARCH_EDITION_RECEIVING = 'stellar-forge.research-edition-receiving.v1';
export const MAX_RESEARCH_DELIVERY_JSON_BYTES = 512 * 1024 * 1024;
export const MAX_RESEARCH_DELIVERY_BYTES = 256 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9-]{36}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;
const RECEIPT = 'research-received.json';
const SELECTION = 'research-receiving-selection.json';
const jsonBytes = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = values => [...values].sort(order);
const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function exactKeys(value,keys) {
  need(plain(value) && Object.keys(value).length === keys.length && keys.every(k=>Object.hasOwn(value,k)),
    'Retain the complete selected Research delivery document.');
}
function safeCsv(rows,columns) {
  const cell = value => {
    let s = String(value ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(s)) s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  };
  return [columns.map(cell).join(','),...rows.map(row=>columns.map(k=>cell(row[k])).join(','))].join('\r\n')+'\r\n';
}
function sourceFilename(capture) {
  const original=capture.filename.replace(/[^A-Za-z0-9._-]/g,'_').replace(/^[._-]+/,'').slice(-107)||'source.bin';
  return 'source-'+capture.id+'-'+original;
}
function selectedGraph({state,sources,productId,editionId}) {
  need(UUID.test(state?.id ?? ''),'Retain the original economic project identity.');
  key(productId);need(HASH.test(editionId ?? ''),'Select the original issued Research edition.');
  validateResearchState(state);
  const cat=catalogue(state),product=cat.products.find(x=>x.id===productId);
  const edition=product?.editions.find(x=>x.id===editionId);
  need(edition,'Select an issued edition in the original Research product.','RESEARCH_EDITION_NOT_FOUND',404);
  const version=product.versions.find(x=>x.id===edition.definitionId);
  instant(version.savedAt);
  const snapshotIds=sorted(new Set(edition.sources.map(x=>x.snapshotId)));
  const reviewIds=sorted(new Set(edition.sources.map(x=>x.reviewId)));
  const entryIds=sorted(new Set(edition.sources.map(x=>x.entryId)));
  need(Array.isArray(sources) && sources.length<=10000,'Supply the complete retained source capture selection.');
  const map=new Map();
  for(const value of sources) {
    need(plain(value)&&typeof value.id==='string'&&!map.has(value.id),'Each original capture must occur once.');
    map.set(value.id,value);
  }
  const captures=snapshotIds.map(id=>{
    need(map.has(id),'An issued Research source is absent from the complete selection.');
    const source=normalizeCapture(map.get(id)),summary=cat.sources.find(x=>x.id===id);
    need(summary&&canonical(summary)===canonical(sourceSummary(source)),'The original source capture summary changed.');
    return source;
  });
  need(captures.reduce((n,c)=>n+c.bytes,0)<=MAX_TOTAL_BYTES,'The selected original sources exceed128MiB.');
  const entries=entryIds.map(id=>{
    const original=cat.entries.find(x=>x.id===id);
    const ids=sorted(new Set(edition.sources.filter(x=>x.entryId===id).map(x=>x.definitionId)));
    const versions=ids.map(id=>{
      const v=original.versions.find(x=>x.id===id);instant(v.savedAt);
      return clone(v);
    });
    // A received catalogue continues the frozen edition, independently of later seller edits.
    return {id,currentId:ids.at(-1),versions};
  });
  const research={schema:SCHEMA,entries,sources:captures.map(sourceSummary),
    reviews:reviewIds.map(id=>clone(cat.reviews.find(x=>x.id===id))),
    products:[{id:product.id,currentId:version.id,
      versions:[clone(version)],
      editions:[clone(edition)]}]};
  const sourceBundle={schema:'stellar-forge.research-source-bundle.v1',sources:captures};
  validateResearchExtension(sourceBundle,{research});
  return {research,sourceBundle,version:research.products[0].versions[0],edition:research.products[0].editions[0]};
}
function catalogueRows(research,sourceBundle) {
  return sourceBundle.sources.map(source=>{
    const version=research.entries.find(x=>x.id===source.entryId).versions.find(x=>x.id===source.definitionId);
    const d=version.definition,review=research.reviews.find(x=>x.snapshotId===source.id);
    return {entryId:source.entryId,definitionId:source.definitionId,title:d.title,publisher:d.publisher,
      url:d.url,kind:d.kind,topics:JSON.stringify(d.topics),geographies:JSON.stringify(d.geographies),
      definitionSavedAt:version.savedAt,snapshotId:source.id,requestedUrl:source.requestedUrl,
      finalUrl:source.finalUrl,retrievedAt:source.retrievedAt,httpStatus:source.status,
      contentType:source.contentType,originalFilename:source.filename,file:sourceFilename(source),
      bytes:source.bytes,sha256:source.sha256,licence:d.licence,sourceNotes:d.notes,
      reviewIds:research.reviews.filter(x=>x.snapshotId===source.id).map(x=>x.id).join(';'),
      reviewDecision:review.decision};
  });
}
function renderReport(identity,selected,rows,note) {
  const product=selected.version.definition,edition=selected.edition;
  const paragraphs=value=>'<div class="prose">'+escape(value)+'</div>';
  const requirements=product.requirements.map(r=>{
    const bindings=edition.sources.filter(x=>x.requirementId===r.id).map(b=>{
      const row=rows.find(x=>x.snapshotId===b.snapshotId),review=selected.research.reviews.find(x=>x.id===b.reviewId);
      return '<tr><td><a href="'+escape(row.file)+'" download>'+escape(row.title)+'</a><small>'+escape(row.publisher)+'</small></td>'+
        '<td>'+escape(row.retrievedAt)+'<small>'+escape(row.originalFilename)+' · '+row.bytes+' bytes</small></td>'+
        '<td>'+escape(review.decision)+'<small>'+escape(review.reviewer)+' · '+escape(review.reviewedAt)+'</small>'+
        paragraphs(review.note)+'</td></tr>';
    }).join('');
    return '<section><h3>'+escape(r.title)+'</h3>'+paragraphs(r.note)+
      '<p class="meta">Topics: '+escape(r.topics.join(', ')||'No additional filter')+
      ' · Geographies: '+escape(r.geographies.join(', ')||'No additional filter')+'</p>'+
      '<div class="table"><table><thead><tr><th>Original source</th><th>Retained capture</th><th>Accepted review</th></tr></thead><tbody>'+
      bindings+'</tbody></table></div></section>';
  }).join('');
  const originals=rows.map(row=>'<tr><td><a href="'+escape(row.file)+'" download>'+escape(row.title)+'</a>'+
    '<small>'+escape(row.originalFilename)+'</small></td><td><a href="'+escape(row.finalUrl)+'" rel="noreferrer">'+
    escape(row.publisher)+'</a><small>'+escape(row.finalUrl)+'</small></td><td>'+paragraphs(row.licence||'No licence statement recorded in the selected source definition.')+
    '<small>'+escape(row.sha256)+'</small></td></tr>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'">'+
    '<title>'+escape(product.title)+'</title><style>'+
    '*{box-sizing:border-box}body{margin:0;background:#fff;color:#171717;font:16px/1.5 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:40px 28px}'+
    'h1{font-size:2rem;line-height:1.2;margin:.4em 0}h2{font-size:1.35rem;margin-top:2rem;border-top:2px solid #333;padding-top:1rem}h3{font-size:1.05rem}'+
    'a{color:#222;text-decoration:underline;text-underline-offset:3px}nav{display:flex;flex-wrap:wrap;gap:12px 24px;border-block:1px solid #aaa;padding:14px 0;margin:24px 0}'+
    '.meta,small{color:#555;font-size:.85rem}.prose{white-space:pre-wrap;overflow-wrap:anywhere}small{display:block;overflow-wrap:anywhere}'+
    '.table{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:12px;border-bottom:1px solid #ccc;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}'+
    'details{margin:24px 0}dl{display:grid;grid-template-columns:160px 1fr;gap:8px}dd{margin:0;overflow-wrap:anywhere}'+
    '@media(max-width:600px){main{padding:24px 16px}h1{font-size:1.6rem}th,td{padding:8px;min-width:160px}dl{display:block}dt{font-weight:600}dd{margin-bottom:12px}}'+
    '@media print{main{max-width:none;padding:0}nav{display:none}.table{overflow:visible}a{color:inherit}section{break-inside:auto}tr{break-inside:avoid}}'+
    '</style></head><body><main><p class="meta">Issued Research product · '+escape(edition.issuedAt)+'</p><h1>'+escape(product.title)+'</h1>'+
    paragraphs(product.purpose)+'<p><strong>Audience:</strong> '+escape(product.audience||'As specified by the product owner')+
    '<br><strong>Format:</strong> '+escape(product.format||'Complete retained Research edition')+'</p>'+
    '<nav aria-label="Delivered files"><a href="research-product.json" download>Product and selected records</a>'+
    '<a href="source-catalogue.csv" download>Source catalogue CSV</a><a href="source-rights.csv" download>Source rights CSV</a></nav>'+
    '<h2>Issued requirements and accepted sources</h2>'+requirements+
    '<h2>Product notes</h2>'+paragraphs(product.notes||'No additional product notes.')+
    '<h3>Issue note</h3>'+paragraphs(edition.note||'No additional issue note.')+
    '<h3>Delivery note</h3>'+paragraphs(note||'No additional delivery note.')+
    '<h2>Original source files and recorded rights</h2><p>Each file retains its complete original bytes. The recorded source licence and publisher terms remain attached to its source definition.</p>'+
    '<div class="table"><table><thead><tr><th>Delivered original</th><th>Publisher and source URL</th><th>Recorded licence and SHA256</th></tr></thead><tbody>'+
    originals+'</tbody></table></div>'+
    '<details><summary>Original edition identities</summary><dl><dt>Product</dt><dd>'+escape(identity.productId)+'</dd><dt>Edition</dt><dd>'+
    escape(identity.editionId)+'</dd><dt>Definition</dt><dd>'+escape(edition.definitionId)+'</dd><dt>Source project</dt><dd>'+
    escape(identity.sourceProjectId)+'</dd><dt>Issued by</dt><dd>'+escape(edition.issuedBy)+'</dd></dl></details>'+
    '<p class="meta">This document describes the retained issued edition. The separately received economic project can continue that edition while preserving these original records and source files.</p>'+
    '</main></body></html>\n';
}
function file(path,bytes,contentType) {
  need(FILE.test(path),'Use one complete Research member filename.');
  return {path,bytes:bytes.length,sha256:sha(bytes),contentType,bodyBase64:bytes.toString('base64')};
}
function buildDelivery({state,sources,productId,editionId,note=''}) {
  const selected=selectedGraph({state,sources,productId,editionId});
  note=text(note,12000);const identity={sourceProjectId:state.id,productId,editionId};
  const rows=catalogueRows(selected.research,selected.sourceBundle);
  const productDocument={schema:'stellar-forge.research-product-document.v1',...identity,note,research:selected.research,
    sourceFiles:rows.map(row=>({snapshotId:row.snapshotId,path:row.file,originalFilename:row.originalFilename,
      contentType:row.contentType,bytes:row.bytes,sha256:row.sha256}))};
  const columns=['entryId','definitionId','title','publisher','url','kind','topics','geographies','definitionSavedAt',
    'snapshotId','requestedUrl','finalUrl','retrievedAt','httpStatus','contentType','originalFilename','file','bytes','sha256','reviewIds','reviewDecision'];
  const files=[
    file('research-report.html',Buffer.from(renderReport(identity,selected,rows,note)),'text/html'),
    file('research-product.json',jsonBytes(productDocument),'application/json'),
    file('source-catalogue.csv',Buffer.from(safeCsv(rows,columns)),'text/csv'),
    file('source-rights.csv',Buffer.from(safeCsv(rows,['entryId','definitionId','snapshotId','title','publisher','url','finalUrl','licence','sourceNotes','originalFilename','file','sha256'])),'text/csv'),
    ...selected.sourceBundle.sources.map(c=>file(sourceFilename(c),Buffer.from(c.bodyBase64,'base64'),c.contentType))
  ];
  need(new Set(files.map(f=>f.path)).size===files.length,'Original Research member paths repeat.');
  const manifest={schema:'stellar-forge.research-edition-manifest.v1',...identity,
    definitionId:selected.edition.definitionId,title:selected.version.definition.title,issuedAt:selected.edition.issuedAt,
    issuedBy:selected.edition.issuedBy,note,sourceCount:selected.sourceBundle.sources.length,
    files:files.map(({bodyBase64,...row})=>row)};
  const value={schema:RESEARCH_EDITION_DELIVERY,...identity,note,research:selected.research,
    sourceBundle:selected.sourceBundle,manifest,manifestSha256:sha(jsonBytes(manifest)),files};
  return {...value,deliverySha256:digest(value)};
}
function editionSummary(value) {
  const p=value.research.products[0],e=p.editions[0];
  return {productId:p.id,editionId:e.id,definitionId:e.definitionId,
    title:p.versions[0].definition.title,sourceProjectId:value.sourceProjectId,
    sources:value.sourceBundle.sources.length,files:value.files.length,
    deliverySha256:value.deliverySha256,manifestSha256:value.manifestSha256};
}
export function createResearchEditionDelivery(options) {
  return buildDelivery(options);
}
export function validateResearchEditionDelivery(value) {
  exactKeys(value,['schema','sourceProjectId','productId','editionId','note','research','sourceBundle','manifest','manifestSha256','files','deliverySha256']);
  need(value.schema===RESEARCH_EDITION_DELIVERY&&HASH.test(value.deliverySha256??'')&&HASH.test(value.manifestSha256??''),
    'Open the complete original Research edition package.');
  validateResearchExtension(value.sourceBundle,{research:value.research});
  const expected=buildDelivery({state:{id:value.sourceProjectId,research:value.research},
    sources:value.sourceBundle.sources,productId:value.productId,editionId:value.editionId,note:value.note});
  need(canonical(expected)===canonical(value),'The selected Research graph, readable files or delivery identity changed.',
    'RESEARCH_DELIVERY_CHANGED');
  return {delivery:value,edition:editionSummary(value),files:value.files};
}
export function encodeResearchEditionDelivery(delivery) {
  validateResearchEditionDelivery(delivery);
  const original=jsonBytes(delivery);
  need(original.length<=MAX_RESEARCH_DELIVERY_JSON_BYTES,'The complete Research package exceeds its reader capacity.',
    'RESEARCH_DELIVERY_CAPACITY',413);
  const bytes=gzipSync(original,{level:6});
  need(bytes.length<=MAX_RESEARCH_DELIVERY_BYTES,'The compressed Research package exceeds its retained capacity.',
    'RESEARCH_DELIVERY_CAPACITY',413);
  return bytes;
}
export function decodeResearchEditionDelivery(bytes) {
  need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=MAX_RESEARCH_DELIVERY_BYTES,
    'Receive one complete original compressed Research package.','RESEARCH_DELIVERY_CAPACITY',413);
  let value;
  try {
    const original=gunzipSync(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),
      {maxOutputLength:MAX_RESEARCH_DELIVERY_JSON_BYTES});
    value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(original));
  } catch {need(false,'The original Research package is not complete readable gzip JSON.','RESEARCH_DELIVERY_INVALID');}
  return validateResearchEditionDelivery(value);
}
async function exactBytes(directory,name,bytes) {
  try {await writeBytes(join(directory,name),bytes,{exclusive:true});}
  catch(error) {if(error.code!=='EEXIST')throw error;
    need((await readBytes(join(directory,name),Math.max(1,bytes.length))).equals(bytes),
      'This receiving directory retains different original bytes.','RESEARCH_RECEIVING_CONFLICT',409);}
}
export async function retainResearchDeliveryBytes(directory,bytes) {
  need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=MAX_RESEARCH_DELIVERY_BYTES,
    'Retain the complete original Research package bytes.');
  directory=await privateDirectory(resolve(directory));bytes=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  await exactBytes(directory,RESEARCH_PACKAGE,bytes);
  return {path:join(directory,RESEARCH_PACKAGE),bytes:bytes.length,sha256:sha(bytes)};
}
async function optionalJson(path,limit=131072) {
  try{return await readPrivateJson(path,limit);}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function present(path) {
  try {await lstat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}
}
function nativeSelection(checked) {
  // The catalogue receiver performs no FRED acquisition. This dormant default
  // initializes the existing host without disclosing unrelated seller selection.
  const asOf=checked.delivery.research.products[0].editions[0].issuedAt.slice(0,10);
  return {series:['GDP'],asOf,start:asOf,end:asOf,pageSize:1000,maxRows:1000000};
}
function selectionIdentity(checked,packageSha256,packageBytes) {
  return {schema:'stellar-forge.research-customer-selection.v1',packageSha256,packageBytes,
    ...editionSummary(checked.delivery)};
}
function checkOriginalGraph(state,delivery) {
  validateResearchState(state);
  const current=catalogue(state),original=delivery.research;
  for(const entry of original.entries) {
    const actual=current.entries.find(x=>x.id===entry.id);
    need(actual&&entry.versions.every(v=>actual.versions.some(x=>x.id===v.id&&canonical(x)===canonical(v))),
      'The customer project lost an original source definition.');
  }
  for(const name of ['sources','reviews'])for(const row of original[name])
    need(current[name].some(x=>x.id===row.id&&canonical(x)===canonical(row)),
      'The customer project lost an original Research '+name+' record.');
  for(const p of original.products) {
    const actual=current.products.find(x=>x.id===p.id);
    need(actual&&p.versions.every(v=>actual.versions.some(x=>x.id===v.id&&canonical(x)===canonical(v)))&&
      p.editions.every(e=>actual.editions.some(x=>x.id===e.id&&canonical(x)===canonical(e))),
      'The customer project lost its original issued Research product.');
  }
}
async function inspectReceiving(directory,checked,bytes,receipt) {
  exactKeys(receipt,['schema','state','directory','projectDirectory','projectId','operationId','packageSha256',
    'packageBytes','receivedAt','productId','editionId','definitionId','title','sourceProjectId','sources','files',
    'deliverySha256','manifestSha256']);
  need(receipt.schema===RESEARCH_EDITION_RECEIVING&&receipt.state==='RECEIVED'&&receipt.packageSha256===sha(bytes)&&
    receipt.packageBytes===bytes.length&&receipt.directory===directory&&receipt.projectDirectory===join(directory,'project')&&
    receipt.operationId==='research-delivery-'+receipt.packageSha256&&UUID.test(receipt.projectId??''),
    'The original Research receiving receipt changed.');
  instant(receipt.receivedAt);
  need(canonical(Object.fromEntries(Object.keys(checked.edition).map(k=>[k,receipt[k]])))===canonical(checked.edition),
    'The original Research receiving edition changed.');
  const state=await readFredProject(receipt.projectDirectory);need(state.id===receipt.projectId,'The receiving project identity changed.');
  checkOriginalGraph(state,checked.delivery);
  const record=state.researchCommerce?.receivings.find(x=>x.id===receipt.packageSha256);
  need(record&&canonical(record)===canonical(researchReceivingRecord(checked.delivery,receipt.packageSha256,receipt.receivedAt)),
    'The native customer project lost its original receiving record.');
  const stored=await readBytes(join(receipt.projectDirectory,'research','receivings',receipt.packageSha256,RESEARCH_PACKAGE),bytes.length);
  need(stored.equals(bytes),'The native project retained a different original Research package.');
  for(const source of checked.delivery.sourceBundle.sources)
    need(canonical(await readResearchSource(receipt.projectDirectory,source.id))===canonical(source),
      'A received original source capture changed.');
  for(const file of checked.files) {
    const retained=await readBytes(join(directory,'files',file.path),Math.max(1,file.bytes));
    need(retained.length===file.bytes&&sha(retained)===file.sha256,'A received Research readable/source file changed.');
  }
  need((await readBytes(join(directory,'files','manifest.json'),jsonBytes(checked.delivery.manifest).length))
    .equals(jsonBytes(checked.delivery.manifest)),'The received source manifest changed.');
  return state;
}
export async function receiveResearchEditionDelivery({directory,bytes}={}) {
  const checked=decodeResearchEditionDelivery(bytes);bytes=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const packageSha256=sha(bytes);directory=await privateDirectory(resolve(directory));
  return withPrivateLock(directory,'research-customer.lock',async()=>{
    const identity=selectionIdentity(checked,packageSha256,bytes.length),projectDirectory=join(directory,'project');
    let selected=await optionalJson(join(directory,SELECTION));
    if(selected)need(canonical(selected.identity)===canonical(identity),
      'Continue this customer directory with its original complete Research package.','RESEARCH_RECEIVING_CONFLICT',409);
    else {
      need(!await present(join(directory,RECEIPT))&&!await present(projectDirectory),
        'Choose an unused customer receiving directory.','RESEARCH_RECEIVING_CONFLICT',409);
      await atomicJson(directory,SELECTION,{identity,projectId:null},{exclusive:true});
      selected={identity,projectId:null};
    }
    await retainResearchDeliveryBytes(directory,bytes);
    const retained=await optionalJson(join(directory,RECEIPT));
    if(retained) {
      await inspectReceiving(directory,checked,bytes,retained);
      return {...retained,reused:true};
    }
    const filesDirectory=await privateDirectory(join(directory,'files'));
    for(const f of checked.files)await exactBytes(filesDirectory,f.path,Buffer.from(f.bodyBase64,'base64'));
    await exactBytes(filesDirectory,'manifest.json',jsonBytes(checked.delivery.manifest));
    let state=await present(join(projectDirectory,'project.json'))?await readFredProject(projectDirectory):
      await initializeFredProject({directory:projectDirectory,title:checked.edition.title.slice(0,160),selection:nativeSelection(checked)});
    if(selected.projectId===null) {
      need(state.revision===1&&state.operations.length===0&&state.pending===null&&state.research===undefined,
        'The reserved customer project has been used before receiving its original edition.');
      selected={identity,projectId:state.id};await atomicJson(directory,SELECTION,selected);
    }
    need(state.id===selected.projectId,'The original customer project identity changed.');
    const operationId='research-delivery-'+packageSha256;
    const result=await transactFredProject(projectDirectory,{id:operationId,expectedRevision:1,
      kind:'research-delivery-receive',payload:identity},async(current,root)=>{
      need(current.research===undefined||canonical(current.research)===canonical(checked.delivery.research),
        'The original receiving operation contains another Research catalogue.','RESEARCH_RECEIVING_CONFLICT',409);
      await receiveResearchExtension(root,checked.delivery.sourceBundle,{research:checked.delivery.research});
      const packageRoot=await privateDirectory(join(root,'research','receivings',packageSha256));
      await retainResearchDeliveryBytes(packageRoot,bytes);
      current.research=clone(checked.delivery.research);
      const record=researchReceivingRecord(checked.delivery,packageSha256,current.pending.startedAt);
      retainResearchReceivingRecord(current,record);
      return {projectId:current.id,packageSha256,receivedAt:record.receivedAt};
    });
    const receipt={schema:RESEARCH_EDITION_RECEIVING,state:'RECEIVED',directory,projectDirectory,
      projectId:result.projectId,operationId,packageSha256,packageBytes:bytes.length,
      receivedAt:result.receivedAt,...checked.edition};
    await inspectReceiving(directory,checked,bytes,receipt);
    await atomicJson(directory,RECEIPT,receipt,{exclusive:true});
    return {...receipt,reused:false};
  });
}
export async function readResearchEditionReceiving(directory) {
  directory=resolve(directory);
  const receipt=await readPrivateJson(join(directory,RECEIPT),131072);
  need(Number.isSafeInteger(receipt.packageBytes)&&receipt.packageBytes>0&&
    receipt.packageBytes<=MAX_RESEARCH_DELIVERY_BYTES,'Open the complete original Research receiving.');
  const bytes=await readBytes(join(directory,RESEARCH_PACKAGE),receipt.packageBytes);
  need(bytes.length===receipt.packageBytes&&sha(bytes)===receipt.packageSha256,'The received original Research package changed.');
  const checked=decodeResearchEditionDelivery(bytes);
  await inspectReceiving(directory,checked,bytes,receipt);
  return {receipt,...checked,bytes,directory,projectDirectory:receipt.projectDirectory};
}
