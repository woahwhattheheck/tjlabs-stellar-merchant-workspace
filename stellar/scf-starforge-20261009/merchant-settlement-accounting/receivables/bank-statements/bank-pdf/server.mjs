// SPDX-License-Identifier: MIT
// Local source and installed PDF.js assets inside the original Bank HTTP handler.
import {readFile,realpath,stat} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,sep} from 'node:path';
import {createRequire} from 'node:module';
import {readBrowserAssets} from '../../../../distribution/browser-assets.mjs';
const require=createRequire(import.meta.url),assets=await readBrowserAssets(new URL('./browser-assets.json',import.meta.url));
let runtimeRoot;
const mime=path=>/\.(?:mjs|js)$/.test(path)?'text/javascript; charset=utf-8':path.endsWith('.wasm')?'application/wasm':path.endsWith('.bcmap')?'application/octet-stream':path.endsWith('.ttf')?'font/ttf':path.endsWith('.pfb')?'application/octet-stream':path.endsWith('.icc')?'application/vnd.iccprofile':'application/octet-stream';
async function runtimeFile(name){
 if(!/^(?:build\/pdf(?:\.worker|\.renderer)?\.mjs|cmaps\/[A-Za-z0-9_.-]+\.bcmap|standard_fonts\/[A-Za-z0-9_.-]+\.(?:pfb|ttf)|wasm\/[A-Za-z0-9_.-]+\.(?:wasm|js|mjs)|iccs\/[A-Za-z0-9_.-]+\.icc)$/.test(name))return null;
 try{
  runtimeRoot??=realpath(dirname(require.resolve('pdfjs-dist/package.json')));const root=await runtimeRoot;
  const candidate=await realpath(resolve(root,name)),rel=relative(root,candidate);if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))return null;
  const info=await stat(candidate);if(!info.isFile()||info.size>32*1024*1024)return null;
  return{bytes:await readFile(candidate),type:mime(name)};
 }catch(error){if(error.code==='MODULE_NOT_FOUND'||error.code==='ENOENT')throw Object.assign(new Error('Install the declared bank-pdf runtime feature before opening a PDF.'),{code:'BANK_PDF_RUNTIME_REQUIRED',status:503});throw error;}
}
export async function bankPdfAsset(path,{apiPath='/api/receivables/bank-statements',uiPath='/bank-statements'}={}){
 const base=uiPath.replace(/\/+$/,'')+'/pdf';
 if(path!==base&&!path.startsWith(base+'/'))return null;
 const name=path===base?'index.html':path.slice(base.length+1)||'index.html';
 if(name==='config.json')return{bytes:Buffer.from(JSON.stringify({schema:'stellar-forge.bank-pdf-config.v1',apiBase:apiPath,bankUi:uiPath+'/',uiPath:base+'/',
  pdfEngineUrl:base+'/runtime/build/pdf.mjs',pdfWorkerUrl:base+'/runtime/build/pdf.worker.mjs',pdfRuntimeBase:base+'/runtime/',pdfVersion:'6.4.299',
  fileBytes:16_000_000,requestBytes:24_000_000})),type:'application/json; charset=utf-8'};
 if(name.startsWith('runtime/'))return runtimeFile(name.slice(8));
 const entry=assets.get('/bank-statements/pdf/'+name);if(!entry)return null;
 const bytes=await readFile(entry.url);return{bytes:name==='index.html'?Buffer.from(bytes.toString('utf8').replace('<head>','<head><base href="'+base+'/">')):bytes,type:entry.type};
}
