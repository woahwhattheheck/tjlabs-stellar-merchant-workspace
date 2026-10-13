#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Complete local PDF preparation and receiving. Accounting commits use the existing Bank application.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {extractPdf,PDFJS_VERSION,EXTRACTION_LIMITS} from './extractor.mjs';
import {createWorkingCopy,openWorkingCopy,encodeBase64,decodeBase64,canonical,checkTransferSize,accountReview,pdfSourceInput,prepareBankSource} from './model.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const href=value=>String(value).split('/').map(encodeURIComponent).join('/');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usage='Bank PDF: extract --input original.pdf --out NEW_DIRECTORY [--name NAME] [--scale 1.5] [--text-only] [--password-env ENV_NAME]\n'
 +'Bank PDF: export --working-copy complete.json --out NEW_DIRECTORY [--account ACCOUNT_ID] [--acknowledge-balance-difference] [--scale 1.5] [--text-only]\n'
 +'Bank PDF: inspect --working-copy complete.json\n'
 +'Optional --pdfjs-root points to the original installed pdfjs-dist package. PDF.js 6.4.299 and @napi-rs/canvas 1.0.10 are required for extraction/rendering.\n';
function options(argv){
 const command=argv.shift();if(!command||command==='--help'||command==='help')return{command:'help'};
 need(['extract','export','inspect'].includes(command),'Choose extract, export or inspect.\n'+usage);
 const values={command},flags=new Set(['text-only','acknowledge-balance-difference']),allowed=new Set(['input','out','name','scale','password-env','working-copy','account','pdfjs-root',...flags]);
 for(let i=0;i<argv.length;i++){const key=argv[i].startsWith('--')?argv[i].slice(2):'';need(allowed.has(key)&&!Object.hasOwn(values,key),'Unknown or repeated option: '+argv[i]);
  if(flags.has(key))values[key]=true;else {need(i+1<argv.length&&!argv[i+1].startsWith('--'),'Missing value for '+argv[i]);values[key]=argv[++i];}}
 if(command==='extract')need(values.input&&!values['working-copy']&&!values.account,'extract requires --input and receives one complete original PDF.');
 else need(values['working-copy']&&!values.input,'export/inspect requires --working-copy.');
 if(command!=='inspect')need(values.out,'Choose a new --out directory.');
 const scale=values.scale===undefined?1.5:Number(values.scale);need(Number.isFinite(scale)&&scale>=0.1&&scale<=4,'Choose a render scale from 0.1 to 4.');
 values.scale=scale;
 if(values['password-env'])need(/^[A-Za-z_][A-Za-z0-9_]*$/.test(values['password-env']),'Choose an environment variable name for the PDF password.');
 return values;
}
async function ordinaryFile(name,max){
 const absolute=path.resolve(name),stat=await fs.lstat(absolute);
 need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max,'Choose an ordinary complete input file within the supported size: '+absolute);
 return await fs.readFile(absolute);
}
async function library(selectedRoot){
 const require=createRequire(import.meta.url),packagePath=selectedRoot?path.join(path.resolve(selectedRoot),'package.json'):require.resolve('pdfjs-dist/package.json');
 const metadata=JSON.parse(await fs.readFile(packagePath,'utf8'));
 need(metadata.name==='pdfjs-dist'&&metadata.version===PDFJS_VERSION,'Install exactly pdfjs-dist@'+PDFJS_VERSION+' in the selected application runtime.');
 const [major,minor]=process.versions.node.split('.').map(Number);need(major>22||major===22&&minor>=13,'PDF preparation requires Node.js 22.13 or newer.');
 const root=path.dirname(packagePath),pdfjs=await import(pathToFileURL(path.join(root,'legacy/build/pdf.mjs')).href);
 need(pdfjs.version===PDFJS_VERSION,'The installed PDF.js module and package versions differ.');
 const runtimeRequire=createRequire(packagePath);
 let canvas;try{canvas=JSON.parse(await fs.readFile(runtimeRequire.resolve('@napi-rs/canvas/package.json'),'utf8'));}catch{throw new Error('Install the original @napi-rs/canvas@1.0.10 dependency in the selected runtime.');}
 need(canvas.version==='1.0.10','Use the selected @napi-rs/canvas@1.0.10 native renderer.');
 const trailing=name=>path.join(root,name)+path.sep;
 const loadingOptions={cMapUrl:trailing('cmaps'),cMapPacked:true,standardFontDataUrl:trailing('standard_fonts'),wasmUrl:trailing('wasm'),iccUrl:trailing('iccs'),
  useWorkerFetch:false,stopAtErrors:true,isEvalSupported:false,useWasm:false,enableXfa:false,disableWorkerRendering:true};
 return{pdfjs,loadingOptions,runtime:{node:process.versions.node,pdfjs:metadata.version,canvas:canvas.version,platform:process.platform,architecture:process.arch}};
}
function password(options){if(!options['password-env'])return undefined;const value=process.env[options['password-env']];need(typeof value==='string'&&value.length>0,'The selected PDF password environment variable is empty.');return value;}
async function newOutput(directory){
 const absolute=path.resolve(directory),parent=await fs.stat(path.dirname(absolute));need(parent.isDirectory(),'The output parent must already be a directory.');
 await fs.mkdir(absolute);const files=[];
 async function write(relative,value){
  need(typeof relative==='string'&&relative&&!relative.startsWith('/')&&!relative.split('/').some(x=>x==='..'||x==='.'||!x),'Invalid output member.');
  const bytes=typeof value==='string'?Buffer.from(value,'utf8'):Buffer.from(value),target=path.join(absolute,...relative.split('/'));
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});
  files.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});return files.at(-1);
 }
 return{absolute,files,write};
}
function report(work,{images=[],originalPath,selected=[]}={}){
 const head='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(work.name)+' — PDF statement review</title>'
 +'<style>body{margin:0;background:#f3f3f3;color:#222;font:15px/1.5 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:24px}section,article{background:#fff;border:1px solid #aaa;padding:18px;margin:18px 0}h1{font-size:1.7rem}h2{font-size:1.3rem}h3{font-size:1.1rem}a{color:inherit}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}img{display:block;width:100%;height:auto;border:1px solid #aaa}.scroll{overflow:auto}.small{font-size:.85rem;overflow-wrap:anywhere}.money{font-variant-numeric:tabular-nums}@media print{body{background:white}main{padding:0}section{break-before:page}.scroll{overflow:visible}}</style><main>';
 const parts=[head,'<h1>'+escape(work.name)+'</h1><p>Complete original PDF, extracted page text, reviewed interpretation and retained working history.</p>',
  '<p><a href="'+escape(href(originalPath))+'">Open original PDF</a> · <a href="working-copy.json">Download complete editable working copy</a> · <a href="extraction.json">Download complete page extraction</a></p>',
  '<p class="small">Original '+escape(work.file.name)+' · '+work.file.bytes+' bytes · SHA-256 '+escape(work.file.sha256)+'<br>Working copy '+escape(work.id)+' · revision '+work.revision+' · PDF.js '+escape(work.extraction.engine.version)+'</p>',
  '<p>Text rectangles use the original PDF.js text advance, font metrics and rotated page transform. Inspect the actual rendered page before choosing columns or accepting a value. Empty or scanned pages remain in this report. Accounting import is an explicit operation in the existing Bank application.</p>'];
 if(!images.length)parts.push('<p>Page rendering was explicitly omitted for this preparation. Open the retained original PDF for visual inspection.</p>');
 if(work.extraction.warnings?.length)parts.push('<h2>Extraction observations</h2><pre>'+escape(json(work.extraction.warnings))+'</pre>');
 parts.push('<h2>Accounts and reconciliation</h2>');
 if(!work.accounts.length)parts.push('<p>No account interpretation has been created. Open this working copy in the Bank PDF desk to map and review the original pages.</p>');
 for(const account of work.accounts){const review=accountReview(work,account.id);parts.push('<article><h3>'+escape(account.name)+'</h3><pre>'+escape(json(review))+'</pre></article>');}
 for(const selection of selected)parts.push('<p><a href="'+escape(selection.path)+'">Prepared original Bank source: '+escape(selection.accountId)+'</a> · generated CSV <a href="'+escape(selection.csvPath)+'">'+escape(selection.csvPath)+'</a></p>');
 const pages=new Map(work.pageReviews.map(p=>[p.page,p]));
 for(const page of work.extraction.pages){
  const image=images.find(row=>row.page===page.number),review=pages.get(page.number);
  parts.push('<section id="page-'+page.number+'"><h2>Original page '+page.number+'</h2><p>'+escape(review?review.disposition+' — '+review.note:'Page review is not yet recorded.')+'</p>');
  if(image)parts.push('<a href="'+escape(image.path)+'"><img loading="lazy" src="'+escape(image.path)+'" alt="Original PDF page '+page.number+'"></a>');
  parts.push('<p class="small">Displayed page '+escape(page.width)+' × '+escape(page.height)+' · rotation '+escape(page.rotation)+' · '+page.items.length+' original text items</p><div class="scroll"><table><thead><tr><th>Original item</th><th>Text</th><th>Displayed rectangle</th></tr></thead><tbody>');
  for(const item of page.items)parts.push('<tr><td>'+escape(item.id)+'</td><td><pre>'+escape(item.text)+'</pre></td><td>'+escape(json(item.box).trim())+'</td></tr>');
  parts.push('</tbody></table></div>');
  for(const title of['rows','balances','regions']){const values=work[title].filter(row=>row.source?.page===page.number||row.page===page.number);if(values.length)parts.push('<h3>'+escape(title)+'</h3><pre>'+escape(json(values))+'</pre>');}
  parts.push('</section>');
 }
 parts.push('<section><h2>Complete interpretation history</h2><pre>'+escape(json(work.history))+'</pre><h2>Retained Bank imports</h2><pre>'+escape(json(work.bankImports))+'</pre></section></main></html>');
 return parts.join('\n');
}
async function renderAll(document,out,scale){
 const results=[],factory=document.canvasFactory;need(factory&&typeof factory.create==='function','The original PDF.js native CanvasFactory is unavailable.');
 for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
  const page=await document.getPage(pageNumber),viewport=page.getViewport({scale}),width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
  need(width>0&&height>0&&width*height<=25000000,'Page '+pageNumber+' exceeds 25 million render pixels. Choose a smaller explicit --scale.');
  const canvas=factory.create(width,height);
  try{
   await page.render({canvasContext:canvas.context,viewport,background:'rgb(255,255,255)'}).promise;
   const png=await canvas.canvas.toBuffer('image/png'),relative='pages/page-'+String(pageNumber).padStart(4,'0')+'.png';
   const saved=await out.write(relative,png);results.push({page:pageNumber,width,height,scale,...saved});
   process.stderr.write('Rendered original page '+pageNumber+'/'+document.numPages+'\n');
  }finally{factory.destroy(canvas);}
 }
 return results;
}
async function complete(out,work,original,images,runtime,selected,command){
 const originalPath='original/'+work.file.name;
 await out.write('review.html',report(work,{images,originalPath,selected}));
 const manifest={schema:'stellar-forge.bank-pdf-receiving.v1',completed:true,command,
  workspaceId:work.id,revision:work.revision,original:{name:work.file.name,bytes:original.length,sha256:sha(original)},
  extraction:{sha256:work.extractionSha256,pages:work.extraction.pages.length,textItems:work.extraction.pages.reduce((n,p)=>n+p.items.length,0)},
  runtime,renderedPages:images,preparedAccounts:selected,files:[...out.files],
  open:'review.html',editable:'working-copy.json',accounting:'Use selected source-input JSON with the existing Bank source preview and reviewed receive operation.'};
 await out.write('MANIFEST.json',json(manifest));
 process.stdout.write(json({completed:true,directory:out.absolute,manifest:path.join(out.absolute,'MANIFEST.json'),
  originalSha256:manifest.original.sha256,pages:manifest.extraction.pages,renderedPages:images.length,accountsPrepared:selected.length}));
 return manifest;
}
export async function main(argv=process.argv.slice(2)){
 const opts=options([...argv]);if(opts.command==='help'){process.stdout.write(usage);return;}
 let work,original;
 if(opts.command==='extract')original=await ordinaryFile(opts.input,EXTRACTION_LIMITS.bytes);
 else {const body=await ordinaryFile(opts['working-copy'],192*1024*1024);work=await openWorkingCopy(body.toString('utf8'));original=Buffer.from(decodeBase64(work.file.dataBase64));}
 if(opts.command==='inspect'){process.stdout.write(json({schema:work.schema,id:work.id,revision:work.revision,
  original:{name:work.file.name,bytes:original.length,sha256:sha(original)},pages:work.extraction.pages.length,
  accounts:work.accounts.map(account=>accountReview(work,account.id)),pageReviews:work.pageReviews,historyEditions:work.history.length,bankImports:work.bankImports}));return;}
 const needsPdf=opts.command==='extract'||!opts['text-only'];
 let installed=null,task=null,document=null,out=null;
 try{
  if(needsPdf){installed=await library(opts['pdfjs-root']);const secret=password(opts);
   task=installed.pdfjs.getDocument({...installed.loadingOptions,...(secret?{password:secret}:{}),data:new Uint8Array(original)});
   document=await task.promise;
   const actual=Buffer.from(await document.getData());need(actual.equals(original),'PDF.js reopened bytes differ from the retained original.');
   need(document.numPages>0&&document.numPages<=EXTRACTION_LIMITS.pages,'Receive at most 500 complete original pages.');
  }
  if(opts.command==='extract'){
   const extraction=await extractPdf({bytes:new Uint8Array(original),pdfjs:installed.pdfjs,document,loadingOptions:installed.loadingOptions,
    onProgress:p=>process.stderr.write('Extracted original page '+p.page+'/'+p.pages+'\n')});
   work=await createWorkingCopy({name:opts.name||path.basename(opts.input),file:{name:path.basename(opts.input),dataBase64:encodeBase64(original)},extraction});
  }
  checkTransferSize(work);
  const selected=[];
  if(opts.account){const input=await pdfSourceInput(work,opts.account,{acknowledgeBalanceDifference:opts['acknowledge-balance-difference']===true});
   const previewText=JSON.stringify({source:input})+'\n';
   need(Buffer.byteLength(previewText,'utf8')<=24000000,'The complete Bank preview request exceeds 24,000,000 bytes. Export the full working copy without --account; keep every original page and interpretation.');
   selected.push({accountId:opts.account,input,previewText});}
  // All input, extraction and selected-account validation precedes output creation.
  // A complete MANIFEST is written only after every original, page and working file.
  out=await newOutput(opts.out);
  await out.write('original/'+work.file.name,original);
  await out.write('extraction.json',json(work.extraction));
  await out.write('working-copy.json',canonical(work));
  await out.write('interpretation-history.json',json({workspaceId:work.id,revision:work.revision,history:work.history,bankImports:work.bankImports}));
  const images=opts['text-only']?[]:await renderAll(document,out,opts.scale);
  const delivered=[];
  for(let i=0;i<selected.length;i++){
   const {accountId,previewText}=selected[i],base='accounts/account-'+String(i+1).padStart(3,'0');
   const draft=await prepareBankSource(work,accountId,{acknowledgeBalanceDifference:opts['acknowledge-balance-difference']===true});
   await out.write(base+'/source-input.json',previewText);await out.write(base+'/reviewed-rows.csv',draft.source.file.content);
   await out.write(base+'/mapping.json',json(draft.mapping));await out.write(base+'/row-map.json',json(draft.rowMap));await out.write(base+'/reconciliation.json',json(draft.review));
   delivered.push({accountId,path:base+'/source-input.json',csvPath:base+'/reviewed-rows.csv',csvSha256:draft.csvSha256,mappingSha256:draft.mappingSha256});
  }
  return await complete(out,work,original,images,installed?.runtime??{node:process.versions.node,rendering:'EXPLICIT_TEXT_ONLY'},delivered,opts.command);
 }catch(error){
  if(out)process.stderr.write('Preparation interrupted. Preserve the partial output at '+out.absolute+'. The complete MANIFEST was not issued.\n');
  throw error;
 }finally{if(task)await task.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 main().catch(error=>{process.stderr.write((error.code?error.code+': ':'')+error.message+'\n');process.exitCode=1;});
}
