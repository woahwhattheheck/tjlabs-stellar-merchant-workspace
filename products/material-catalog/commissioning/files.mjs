// MIT. Original complete source preparation with immutable output and independent reopen.
import {readFile,open,mkdir,mkdtemp,rename,lstat,readdir,rm,realpath} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SCHEMA,need,identity,parseJson,same,inspectMaterialSource,materialInstallationTemplate,prepareMaterialInstallation} from './core.mjs';
import {renderMaterialHandover} from './handover.mjs';
import {assembleRecipient} from '../recipient/assemble.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SELF='products/material-catalog/commissioning/';
const ORIGINAL='stellar/scf_2026/sf49_data_commissioning/installation-workorders/';
export const APPLICATION=[
 SELF+'core.mjs',SELF+'following.mjs',SELF+'files.mjs',SELF+'cli.mjs',SELF+'handover.mjs',SELF+'receive.mjs',SELF+'README.md',SELF+'RECEIVING.md',SELF+'FOLLOWING_INSTALLATION.md',
 'products/material-catalog/recipient/core.mjs','products/material-catalog/recipient/sha256.mjs',
 'products/material-catalog/recipient/assemble.mjs','products/material-catalog/recipient/review.mjs',
 'products/material-catalog/recipient/renewal.mjs','products/material-catalog/recipient/renewal-panel.mjs',
 'products/material-catalog/recipient/review-panel.mjs','products/material-catalog/recipient/workspace.mjs','products/material-catalog/recipient/reader.html',
 ORIGINAL+'prepare-core.mjs',ORIGINAL+'commercial-workshare-core.mjs',ORIGINAL+'supplier-catalogues.json'
];
const MAX_JSON=8*1024*1024,MAX_BUNDLE=256*1024*1024,MAX_TOTAL=512*1024*1024;
const json=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const equalBytes=(a,b)=>a.length===b.length&&a.equals(b);
const safe=p=>typeof p==='string'&&p.length<=500&&!p.includes('\\')&&!p.includes('\0')&&!isAbsolute(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const filename=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(x)&&x!=='.'&&x!=='..';
async function disk(path,limit=MAX_JSON){
 const full=resolve(path);need(await realpath(full)===full,'Use a complete regular input without symbolic-link path: '+full);
 const h=await open(full,'r');try{
  const s=await h.stat();need(s.isFile()&&s.size<=limit,'The complete regular source exceeds its input bound: '+full);
  const b=await h.readFile(),after=await h.stat();
  need(b.length===s.size&&s.dev===after.dev&&s.ino===after.ino&&s.size===after.size&&s.mtimeMs===after.mtimeMs,'The source changed while reading: '+full);
  return b;
 }finally{await h.close();}
}
async function sync(path){const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function write(root,name,bytes){
 need(safe(name),'Use a confined complete member path.');
 const path=join(root,name);await mkdir(dirname(path),{recursive:true,mode:0o700});
 const h=await open(path,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
}
async function inventory(root,prefix=''){
 const rows=[];for(const e of await readdir(join(root,prefix),{withFileTypes:true})){
  const name=prefix+e.name;need(safe(name)&&!e.isSymbolicLink(),'The received directory contains a link or invalid path.');
  if(e.isDirectory())rows.push(...await inventory(root,name+'/'));else{need(e.isFile(),'The received directory contains a nonregular entry.');rows.push(name);}
 }return rows.sort();
}
async function syncTree(root){for(const e of await readdir(root,{withFileTypes:true}))if(e.isDirectory())await syncTree(join(root,e.name));await sync(root);}
const ref=(path,bytes)=>({path,...identity(bytes)});
function add(map,name,bytes){need(safe(name)&&!map.has(name),'Repeated or invalid complete output: '+name);map.set(name,Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes));}
async function application(){
 const map=new Map();for(const path of APPLICATION)add(map,'application/'+path,await disk(join(ROOT,path),4*1024*1024));return map;
}
function checkAttachmentList(list){
 need(list&&list.schema===SCHEMA+'.attachments'&&Array.isArray(list.files)&&list.files.length<=128,'Use the declared complete additional-source manifest.');
 const names=new Set();
 for(const f of list.files){
  need(f&&filename(f.filename)&&!names.has(f.filename)&&typeof f.path==='string'&&f.path&&
   typeof f.purpose==='string'&&f.purpose.trim()&&f.purpose.length<=4000&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=64*1024*1024&&
   typeof f.sha256==='string'&&/^[a-f0-9]{64}$/.test(f.sha256),'Keep unique complete attachment filenames, purpose, bytes and SHA-256.');names.add(f.filename);
 }
 return list;
}
function inputsFrom(map){
 const raw=name=>{const b=map.get('source/'+name);need(b,'Retain complete source/'+name);return b;};
 const list=checkAttachmentList(parseJson(raw('attachments.json')));
 const input={bundleBytes:raw('customer-catalog.jsonl'),expectedBundleSha256:parseJson(raw('selection.json')).bundleSha256,
  seed:parseJson(raw('seed.json')),caseSnapshot:parseJson(raw('case.json')),commissioningBytes:raw('commissioning.json'),
  commissioning:parseJson(raw('commissioning.json')),packetBytes:map.get('source/receiving-packet.json')??null,
  profile:parseJson(raw('profile.json')),bindings:parseJson(raw('bindings.json')),selection:parseJson(raw('selection.json')),
  attachments:list.files.map(f=>{const bytes=map.get('attachments/'+f.filename);need(bytes&&same(identity(bytes),{bytes:f.bytes,sha256:f.sha256}),'Retain complete original additional source '+f.filename);return {path:'attachments/'+f.filename,purpose:f.purpose,bytes};})};
 if(map.has('source/following.json')){input.following=parseJson(raw('following.json'));input.previousBundleBytes=raw('previous-catalog.jsonl');}
 return input;
}
async function capture(options,{template=false}={}){
 for(const key of ['bundle','sha256','seed','case','commissioning'])need(options[key],'Select --'+key+'.');
 const source=new Map();
 for(const [arg,name,max]of [['bundle','customer-catalog.jsonl',MAX_BUNDLE],['seed','seed.json',MAX_JSON],['case','case.json',MAX_JSON],['commissioning','commissioning.json',MAX_JSON]]){
  add(source,'source/'+name,await disk(options[arg],max));
 }
 need(!options.previousBundle||options.following,'Select the complete --following request with --previousBundle.');
 if(options.following){need(options.previousBundle,'Select the original --previousBundle.');add(source,'source/following.json',await disk(options.following,16*1024*1024));add(source,'source/previous-catalog.jsonl',await disk(options.previousBundle,MAX_BUNDLE));}
 if(options.packet)add(source,'source/receiving-packet.json',await disk(options.packet));
 const app=await application();add(source,'source/profile.json',app.get('application/'+ORIGINAL+'supplier-catalogues.json'));
 const attachments=options.attachments?await disk(options.attachments):json({schema:SCHEMA+'.attachments',files:[]});
 add(source,'source/attachments.json',attachments);
 const selectedAttachments=checkAttachmentList(parseJson(attachments));
 const declaredBytes=[...source.values(),...app.values()].reduce((n,body)=>n+body.length,0)+
  selectedAttachments.files.reduce((n,file)=>n+file.bytes,0);
 need(declaredBytes<=MAX_TOTAL,'The selected complete inputs and application exceed 512 MiB. Choose a resource-appropriate complete source selection before reading attachments.');
 for(const f of selectedAttachments.files){
  const path=resolve(options.attachments?dirname(resolve(options.attachments)):'.',f.path),body=await disk(path,f.bytes);
  need(same(identity(body),{bytes:f.bytes,sha256:f.sha256}),'Original attachment differs: '+f.filename);add(source,'attachments/'+f.filename,body);
 }
 inspectMaterialSource(source.get('source/customer-catalog.jsonl'),options.sha256);
 if(template){
  const input={bundleBytes:source.get('source/customer-catalog.jsonl'),expectedBundleSha256:options.sha256,
   seed:parseJson(source.get('source/seed.json')),caseSnapshot:parseJson(source.get('source/case.json')),
   commissioningBytes:source.get('source/commissioning.json'),commissioning:parseJson(source.get('source/commissioning.json')),
   packetBytes:source.get('source/receiving-packet.json')??null,profile:parseJson(source.get('source/profile.json')),
   attachments:checkAttachmentList(parseJson(attachments)).files.map(f=>({path:'attachments/'+f.filename,purpose:f.purpose,bytes:source.get('attachments/'+f.filename)})),
   operationId:options.operation};
  if(options.following){input.following=parseJson(source.get('source/following.json'));input.previousBundleBytes=source.get('source/previous-catalog.jsonl');}
  const value=materialInstallationTemplate(input);
  add(source,'source/bindings.json',json(value.bindings));add(source,'source/selection.json',json(value.selection));
  return {source,app,template:value};
 }
 need(options.bindings&&options.selection,'Select the reviewed complete --bindings and --selection files.');
 add(source,'source/bindings.json',await disk(options.bindings));add(source,'source/selection.json',await disk(options.selection));
 need(parseJson(source.get('source/selection.json')).bundleSha256===options.sha256,'Retain the explicit selected bundle SHA-256.');
 return {source,app};
}
function request(source,app){
 return {schema:SCHEMA+'.request',operationId:parseJson(source.get('source/selection.json')).operationId,
  inputs:[...source].map(([path,b])=>ref(path,b)),application:[...app].map(([path,b])=>ref(path,b))};
}
function derive(source,app){
 const input=inputsFrom(source),value=prepareMaterialInstallation(input),bundle=inspectMaterialSource(input.bundleBytes,input.expectedBundleSha256),out=new Map([...source,...app]);
 const put=(name,value)=>add(out,name,Buffer.isBuffer(value)?value:json(value));
 if(value.source.following){put('FOLLOWING_REVIEW.json',value.source.following);put('FOLLOWING_COMPARISON.json',value.source.following.comparison);}
 put('derived-bindings.json',value.bindings);put('MATERIAL_CUSTOMER_SOURCE.json',value.source);put('COMMERCIAL_WORKSHARE.json',value.commercial);
 put('COMMERCIAL_WORKSHARE.md',Buffer.from(value.commercialMarkdown));put('COMMERCIAL_WORKSHARE.html',Buffer.from(value.commercialHtml));
 put('installation-input.json',value.prepared.document);put('installation-preview-input.json',value.prepared.preview);
 need(out.get('installation-input.json').length<=128*1024,'The complete input exceeds the native Installation 128 KiB document bound.');
 put('WORKORDER.md',Buffer.from(value.workorder));
 for(const {manifest,bytes}of bundle.sources.values())put('original-sources/'+manifest.id+'.bin',Buffer.from(bytes));
 const original=name=>app.get('application/products/material-catalog/recipient/'+name).toString('utf8');
 const modules=Object.fromEntries(['sha256.mjs','core.mjs','review.mjs','renewal.mjs','renewal-panel.mjs','review-panel.mjs','workspace.mjs','reader.html'].map(name=>[name,original(name)]));
 put('Material_Catalog_Reader.html',Buffer.from(assembleRecipient(modules,{name:'customer-catalog.jsonl',base64:Buffer.from(input.bundleBytes).toString('base64'),sha256:input.expectedBundleSha256})));
 const continued=value.source.following;
 const receiving=continued?
  'This is a following preparation for EXISTING Installation '+value.prepared.preview.installationId+' at revision '+value.prepared.preview.expectedRevision+'. It is not a new Installation.\n\nRetain source/previous-catalog.jsonl, source/customer-catalog.jsonl and source/following.json together. In the original Material Source Desk open the following catalogue, choose Update existing saved Installation with this exact ID and previous attached catalogue, then compare its actual current case/head. Receive the saved review only against that exact comparison; any changed source, case, target or terms requires a deliberate new review. Use Open same Installation draft and the original Review/Save. Original terms, assignments and completed checks remain retained.\n\ninstallation-preview-input.json is the complete original API preview request (expectedVersion, installationId, expectedRevision, document); it is NOT a document-only Load input file. Do not import this package document into a new Installation. If using the existing editor manually, first open Edit on this exact saved ID/current revision and only then load installation-input.json; inspect the complete preview and original target before Save. Historical package identity does not authorize replacing a newer target.\n':
  'In the original Operations Customer installations screen, Load input file accepts installation-input.json into the deliberately selected NEW Workshare draft and performs its current-case preview. Keep the original writer, request and full-case export/independent receiving. A moved current case needs a fresh original seed and deliberate new preparation; this historical package remains unchanged.\n';
 put('REOPEN.md',Buffer.from('# Complete material customer commissioning\n\nOpen START_HERE.html and Material_Catalog_Reader.html. Every original input is retained under source/ and attachments/, with extracted exact original feeds under original-sources/.\n\nRun the retained complete source with an existing Node installation:\n\n~~~sh\nnode application/products/material-catalog/commissioning/cli.mjs reopen --directory .\n~~~\n\nUse an absolute directory when calling from elsewhere. Reopening verifies every file, reconstructs the native input/preview and handover from both retained catalogue editions when selected, current-case snapshot, Workshare, explicit review/bindings and complete source closure, and compares exact bytes. Copy this complete directory to a distinct private receiving location and run that same command there.\n\n'+receiving+'\nThe whole public implementation and receiving guide are retained under application/products/material-catalog/commissioning/. Open all final attachments and downloaded/reopened outputs as the recipient; producing-seat desktop/narrow image viewing remains part of actual delivery.\n'));

 const rows=[...out].map(([path,b])=>ref(path,b));
 put('START_HERE.html',Buffer.from(renderMaterialHandover(value,rows)));
 const req=request(source,app);
 const receipt={schema:SCHEMA+'.receipt',operationId:req.operationId,request:req,
  status:'PREPARED_SOURCE',installationSource:value.prepared.source,workshareCaseId:value.prepared.workshareCaseId,
  bundle:value.source.bundle,selection:value.source.selection,selections:value.prepared.selections,
  files:[...out].map(([path,b])=>ref(path,b)),browserReceiving:'PENDING_EXACT_OUTPUT_OPEN_USE_AND_PRODUCER_VIEW'};
 put('PREPARATION.json',receipt);
 need([...out.values()].reduce((n,b)=>n+b.length,0)<=MAX_TOTAL,'The complete preparation exceeds 512 MiB. Retain originals and use a resource-appropriate source selection.');
 return {out,receipt};
}
async function target(path){
 const p=resolve(path),parent=dirname(p);need(p!==parent,'Select a dedicated owned output directory.');
 need(await realpath(parent)===parent,'Use an existing owned parent without symlinks.');
 const s=await lstat(parent);need(s.isDirectory(),'Use an existing output parent.');
 return p;
}
async function existing(path){try{const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink(),'Preserve the existing non-directory output.');return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function reopenMaterialInstallation(directory){
 const root=await target(directory);need(await realpath(root)===root,'Preserve the original real output directory.');
 const receipt=parseJson(await disk(join(root,'PREPARATION.json')));
 need(receipt.schema===SCHEMA+'.receipt'&&Array.isArray(receipt.files)&&receipt.request?.schema===SCHEMA+'.request','Use a complete original preparation.');
 const all=new Map(),seen=new Set();let total=0;
 for(const f of receipt.files){
  need(safe(f.path)&&f.path!=='PREPARATION.json'&&!seen.has(f.path)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=MAX_TOTAL,
   'Retain the unique complete preparation manifest.');seen.add(f.path);total+=f.bytes;
  need(total<=MAX_TOTAL,'The full preparation exceeds its bound.');
  const raw=await disk(join(root,f.path),f.bytes);need(same(identity(raw),{bytes:f.bytes,sha256:f.sha256}),'Complete output differs: '+f.path);all.set(f.path,raw);
 }
 need(same(await inventory(root),[...seen,'PREPARATION.json'].sort()),'The complete preparation roster differs.');
 const source=new Map([...all].filter(([p])=>p.startsWith('source/')||p.startsWith('attachments/')));
 const app=new Map([...all].filter(([p])=>p.startsWith('application/')));
 const installed=await application();
 need(same([...app.keys()].sort(),[...installed.keys()].sort()),'The complete retained application closure differs.');
 for(const [path,b]of installed)need(equalBytes(app.get(path),b),'Run the exact retained application source for this preparation: '+path);
 need(same(request(source,app),receipt.request),'The original retained request/input identity differs.');
 const rebuilt=derive(source,app);
 need(same(receipt,rebuilt.receipt),'The original preparation receipt differs from the retained complete source.');
 need(same([...all.keys()].sort(),[...rebuilt.out.keys()].filter(x=>x!=='PREPARATION.json').sort()),'The reconstructed complete output roster differs.');
 for(const [path,b]of rebuilt.out){const actual=path==='PREPARATION.json'?await disk(join(root,path)):all.get(path);need(actual&&equalBytes(actual,b),'The complete deterministic reopening differs: '+path);}
 await sync(dirname(root));return receipt;
}
export async function prepareMaterialInstallationFiles(options){
 const captured=await capture(options),made=derive(captured.source,captured.app),out=await target(options.out);
 for(const key of ['bundle','seed','case','commissioning','packet','bindings','selection','attachments','following','previousBundle'])if(options[key]){
  const p=resolve(options[key]);need(p!==out&&!p.startsWith(out+'/'),'Keep original inputs outside the owned output directory.');
 }
 if(await existing(out)){
  const prior=await reopenMaterialInstallation(out);need(same(prior.request,made.receipt.request),'The existing output belongs to another source or operation.');return prior;
 }
 const stage=await mkdtemp(join(dirname(out),'.material-commissioning-'));
 try{
  for(const [name,body]of made.out)await write(stage,name,body);
  await syncTree(stage);
  try{await rename(stage,out);}catch(e){
   if(!['EEXIST','ENOTEMPTY'].includes(e.code))throw e;
   const prior=await reopenMaterialInstallation(out);need(same(prior.request,made.receipt.request),'A concurrent output selected another original source.');return prior;
  }
  await sync(dirname(out));return await reopenMaterialInstallation(out);
 }finally{await rm(stage,{recursive:true,force:true});}
}
export async function templateMaterialInstallationFiles(options){
 const captured=await capture(options,{template:true}),out=await target(options.out);
 const files=new Map([['bindings.json',captured.source.get('source/bindings.json')],['selection.json',captured.source.get('source/selection.json')],['TEMPLATE.json',json(captured.template)]]);
 if(await existing(out)){
  need(same(await inventory(out),[...files.keys()].sort()),'Preserve the existing template directory.');
  for(const [name,b]of files)need(equalBytes(await disk(join(out,name)),b),'The original template selection differs.');
  await sync(dirname(out));return captured.template;
 }
 const stage=await mkdtemp(join(dirname(out),'.material-template-'));
 try{for(const [name,b]of files)await write(stage,name,b);await syncTree(stage);await rename(stage,out);await sync(dirname(out));return captured.template;}
 finally{await rm(stage,{recursive:true,force:true});}
}
export async function inspectMaterialInstallationFile(path,sha256){
 return inspectMaterialSource(await disk(path,MAX_BUNDLE),sha256).summary;
}
