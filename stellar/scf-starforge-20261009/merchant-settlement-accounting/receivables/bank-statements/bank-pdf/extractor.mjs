// SPDX-License-Identifier: MIT
// Original PDF.js extraction in displayed page coordinates. No accounting writes.
export const PDFJS_VERSION = '6.4.299';
export const EXTRACTION_SCHEMA = 'stellar-forge.bank-pdf-extraction.v1';
export const EXTRACTION_LIMITS = Object.freeze({bytes:16000000,pages:500,items:500000,serializedBytes:192*1024*1024});
const fail=(code,message,details={})=>{throw Object.assign(new Error(message),{code,details});};
const need=(ok,code,message,details)=>{if(!ok)fail(code,message,details);};
const finite=Number.isFinite;
const copy=value=>JSON.parse(JSON.stringify(value));
const matrix=(value,label)=>{need(Array.isArray(value)&&value.length===6&&value.every(finite),'PDF_GEOMETRY','Invalid '+label);return [...value];};
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function equalBytes(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function checkBytes(bytes){
 need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=EXTRACTION_LIMITS.bytes,'PDF_SIZE','Select a complete original PDF up to 16,000,000 bytes.');
 const header=String.fromCharCode(...bytes.subarray(0,1024));
 need(header.includes('%PDF-'),'PDF_HEADER','The selected original is not a PDF.');
}
export function textGeometry(item,style,viewport){
 const original=matrix(item.transform,'original text transform'),page=matrix(viewport.transform,'page viewport transform'),t=multiply(page,original);
 need(finite(item.width)&&finite(item.height)&&item.width>=0&&item.height>=0,'PDF_GEOMETRY','Invalid original text dimensions.');
 const vertical=style?.vertical===true,angle=Math.atan2(t[1],t[0])+(vertical?Math.PI/2:0);
 const fontHeight=Math.hypot(t[2],t[3]);
 const ascent=finite(style?.ascent)?style.ascent:finite(style?.descent)?1+style.descent:0.8;
 const fontAscent=fontHeight*ascent;
 // The viewport transform already contains UserUnit. Apply that same scale to
 // the original text advance; preserve rotated quadrilaterals before the AABB.
 const unitScale=Math.hypot(page[0],page[1]),advance=(vertical?item.height:item.width)*unitScale;
 const x=t[4]+fontAscent*Math.sin(angle),y=t[5]-fontAscent*Math.cos(angle);
 const dx=Math.cos(angle),dy=Math.sin(angle),nx=-dy,ny=dx;
 const quad=[[x,y],[x+advance*dx,y+advance*dy],
  [x+advance*dx+fontHeight*nx,y+advance*dy+fontHeight*ny],[x+fontHeight*nx,y+fontHeight*ny]];
 need(quad.flat().every(finite),'PDF_GEOMETRY','The original text transform produces nonfinite coordinates.');
 return{box:[Math.min(...quad.map(p=>p[0])),Math.min(...quad.map(p=>p[1])),Math.max(...quad.map(p=>p[0])),Math.max(...quad.map(p=>p[1]))],
  quad,displayTransform:t,geometry:{kind:'PDFJS_TEXT_ADVANCE_AND_FONT_METRICS',fontHeight,ascent,ascentSource:finite(style?.ascent)?'PDFJS_STYLE_ASCENT':finite(style?.descent)?'PDFJS_STYLE_DESCENT':'FALLBACK_0_8',vertical}};
}
/**
 * Extract all original TextItems in original order, including empty items.
 * A caller-owned PDFDocumentProxy stays open. For self-owned loading, provide
 * local packaged font/CMap/WASM/ICC paths in loadingOptions as appropriate.
 * Bytes are copied before PDF.js can transfer their ArrayBuffer to its worker.
 */
export async function extractPdf({bytes,pdfjs,document:provided,onProgress,loadingOptions={},signal}={}){
 checkBytes(bytes);
 need(pdfjs&&typeof pdfjs.getDocument==='function'&&pdfjs.version===PDFJS_VERSION,'PDFJS_VERSION','Use the installed PDF.js '+PDFJS_VERSION+' source and matching worker.');
 need(!provided||typeof provided.getPage==='function'&&typeof provided.getData==='function','PDF_DOCUMENT','Provide the original PDF.js document.');
 const sourceBytes=new Uint8Array(bytes);
 const textOptions={includeMarkedContent:true,disableNormalization:true};
 const defaultOptions={stopAtErrors:true,isEvalSupported:false,useWasm:false,enableXfa:false,disableWorkerRendering:true};
 const selectedOptions={...loadingOptions,...defaultOptions};
 delete selectedOptions.url;delete selectedOptions.data;
 const recordedOptions=options=>Object.fromEntries(['cMapUrl','cMapPacked','standardFontDataUrl','iccUrl','wasmUrl','stopAtErrors','isEvalSupported','useWasm','enableXfa','disableWorkerRendering','useSystemFonts','disableFontFace','useWorkerFetch'].filter(k=>options[k]!==undefined&&['string','number','boolean'].includes(typeof options[k])).map(k=>[k,options[k]]));
 let task=null,document=provided;
 const cancelled=()=>{if(signal?.aborted)fail('PDF_CANCELLED','The extraction was cancelled; no partial working copy was returned.');};
 try{
  cancelled();
  if(!document){task=pdfjs.getDocument({...selectedOptions,data:sourceBytes.slice()});document=await task.promise;}
  need(Number.isInteger(document.numPages)&&document.numPages>0&&document.numPages<=EXTRACTION_LIMITS.pages,'PDF_PAGE_LIMIT','Receive one to 500 complete original PDF pages.');
  const actual=new Uint8Array(await document.getData());
  need(equalBytes(actual,sourceBytes),'PDF_DOCUMENT_BINDING','The supplied document differs from the original PDF bytes.');
  const extraction={schema:EXTRACTION_SCHEMA,engine:{name:'PDF.js',version:pdfjs.version,
   options:{textContent:textOptions,viewport:{scale:1},loading:provided?{ownership:'CALLER',...recordedOptions(loadingOptions)}:{ownership:'EXTRACTOR',...recordedOptions(selectedOptions)}}},
   pageCount:document.numPages,fingerprints:copy(document.fingerprints??[]),pages:[],warnings:[]};
  let itemCount=0,serialized=0;
  for(let number=1;number<=document.numPages;number++){
   cancelled();const page=await document.getPage(number),viewport=page.getViewport({scale:1});
   need(finite(viewport.width)&&finite(viewport.height)&&viewport.width>0&&viewport.height>0,'PDF_GEOMETRY','Invalid original page dimensions.');
   const content=await page.getTextContent(textOptions),styles=copy(content.styles??{}),items=[],markedContent=[];
   for(let index=0;index<content.items.length;index++){
    const item=content.items[index];
    if(typeof item.str!=='string'){markedContent.push({index,value:copy(item)});continue;}
    need(++itemCount<=EXTRACTION_LIMITS.items,'PDF_TEXT_LIMIT','The complete PDF exceeds 500,000 text items.');
    need(item.str.length<=200000,'PDF_TEXT_LIMIT','One original text item exceeds 200,000 characters.');
    const geometry=textGeometry(item,styles[item.fontName],viewport);
    items.push({id:'p'+number+'-i'+index,index,text:item.str,transform:[...item.transform],
     width:item.width,height:item.height,fontName:item.fontName,dir:item.dir,hasEOL:item.hasEOL===true,...geometry});
   }
   const saved={number,width:viewport.width,height:viewport.height,view:[...page.view],rotation:page.rotate,
    userUnit:page.userUnit,viewportTransform:matrix(viewport.transform,'page viewport'),items,markedContent,styles,lang:content.lang??null};
   serialized+=new TextEncoder().encode(JSON.stringify(saved)).length;
   need(serialized<=EXTRACTION_LIMITS.serializedBytes,'PDF_EXTRACTION_SIZE','The complete extraction exceeds 192 MiB.');
   extraction.pages.push(saved);
   if(!items.some(item=>item.text.trim()))extraction.warnings.push({code:'PAGE_WITHOUT_EXTRACTED_TEXT',page:number,
    message:'Inspect this original page visually and use explicit page/row mapping. The extraction does not perform OCR.'});
   const fallback=items.filter(item=>item.geometry.ascentSource==='FALLBACK_0_8').length;
   if(fallback)extraction.warnings.push({code:'FONT_ASCENT_ESTIMATE',page:number,items:fallback,
    message:'These selection rectangles use the documented fallback font ascent. Original transforms and PDF rendering remain available.'});
   await onProgress?.({page:number,pages:document.numPages,textItems:items.length,totalTextItems:itemCount});
  }
  extraction.textItemCount=itemCount;
  need(new TextEncoder().encode(JSON.stringify(extraction)).length<=EXTRACTION_LIMITS.serializedBytes,'PDF_EXTRACTION_SIZE','The complete extraction exceeds 192 MiB.');
  return extraction;
 }finally{
  if(!provided&&task)await task.destroy();
 }
}
