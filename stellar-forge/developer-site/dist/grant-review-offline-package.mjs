// MIT. Portable offline delivery of the unchanged recorded-review application.
export const OFFLINE_SOURCE_SCHEMA='stellar-forge.review-offline-source/1';
export const OFFLINE_SCHEMA='stellar-forge.review-offline/1';
const PREFIX='stellar-forge/developer-site/dist/';
const BANK=PREFIX+'grant-review-offline-source.mjs';
const WORKSPACE=PREFIX+'grant-review-round-workspace.mjs';
const VIRTUAL='scf-review-offline:';
const MAX_SOURCE_BYTES=32*1024*1024,MAX_REVIEW_BYTES=64*1024*1024+65536;
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
function unicode(value,label){
  need(typeof value==='string',label+' must be text.');
  for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);
    if(n>=0xd800&&n<=0xdbff){const m=value.charCodeAt(++i);need(m>=0xdc00&&m<=0xdfff,label+' contains an unpaired Unicode surrogate.');}
    else need(n<0xdc00||n>0xdfff,label+' contains an unpaired Unicode surrogate.');
  }return value;
}
function path(value){
  need(typeof value==='string'&&/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value)&&!value.split('/').some(x=>x==='.'||x==='..'),'Invalid selected source path.');
  return value;
}
function resolve(from,specifier){
  need(typeof specifier==='string'&&(specifier.startsWith('./')||specifier.startsWith('../'))&&!/[?#\\\0]/.test(specifier),'Only literal relative selected modules are supported.');
  const parts=from.split('/');parts.pop();
  for(const part of specifier.split('/')){if(part==='.')continue;if(part==='..'){need(parts.length>0,'Module escapes source root.');parts.pop();}else parts.push(part);}
  return path(parts.join('/'));
}
async function identity(text){
  const bytes=new TextEncoder().encode(unicode(text,'Source'));
  need(globalThis.crypto?.subtle,'This browser must provide Web Crypto to verify the complete offline sources.');
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return {bytes:bytes.length,sha256:Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')};
}
function literal(text){
  need((text[0]==='"'||text[0]==="'")&&text.at(-1)===text[0],'Module source span is not a string literal.');
  const raw=text.slice(1,-1);need(!/[\\\r\n]/.test(raw),'Escaped module specifiers require an explicit builder update.');return raw;
}
function safeJSON(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function htmlText(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dataURL(type,text){
  const bytes=new TextEncoder().encode(text);let binary='';
  for(let offset=0;offset<bytes.length;offset+=16384)binary+=String.fromCharCode(...bytes.subarray(offset,offset+16384));
  return 'data:'+type+';base64,'+btoa(binary);
}
function sourceSummary(source){
  return {schema:source.schema,sourceRevision:source.sourceRevision,sourceMode:source.sourceMode,
    entryHtml:source.entryHtml,entryModule:source.entryModule,
    files:source.files.map(({path,kind,bytes,sha256,imports})=>({path,kind,bytes,sha256,...(imports?{imports}: {})}))};
}
/** Verify all exact source bytes and the complete reachable module graph. No code is executed. */
export async function validateOfflineSource(source){
  need(plain(source)&&source.schema===OFFLINE_SOURCE_SCHEMA,'Unsupported offline application source.');
  need(source.sourceMode==='selected-file-bodies','Source identity must describe the selected complete bodies.');
  need(typeof source.sourceRevision==='string'&&/^[a-f0-9]{40}$/.test(source.sourceRevision),'The selected base source commit is missing.');
  need(source.entryHtml===PREFIX+'grant-review-round.html'&&source.entryModule===WORKSPACE,'Unexpected offline review entry.');
  need(Array.isArray(source.files)&&source.files.length>0&&source.files.length<=256,'Offline source inventory is invalid.');
  const files=new Map();let total=0;
  for(const file of source.files){
    need(plain(file),'Invalid source member.');path(file.path);need(!files.has(file.path)&&file.path!==BANK,'Duplicate or recursive generated source member.');
    need(['module','html','style','asset'].includes(file.kind),'Unknown source kind.');
    unicode(file.content,file.path);need(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&/^[a-f0-9]{64}$/.test(file.sha256),'Invalid source identity.');
    total+=file.bytes;need(total<=MAX_SOURCE_BYTES,'The complete source exceeds the offline source allowance.');
    const actual=await identity(file.content);need(actual.bytes===file.bytes&&actual.sha256===file.sha256,'Selected source bytes changed: '+file.path);
    need(file.kind==='module'?Array.isArray(file.imports):file.imports===undefined,'Unexpected module import inventory.');
    files.set(file.path,file);
  }
  need(files.get(source.entryHtml)?.kind==='html'&&files.get(source.entryModule)?.kind==='module','Missing complete original application entry.');
  for(const file of files.values())if(file.kind==='module'){
    let end=0;
    for(const item of file.imports){
      need(plain(item)&&Number.isSafeInteger(item.start)&&Number.isSafeInteger(item.end)&&item.start>=end&&item.end>item.start&&item.end<=file.content.length,'Invalid or overlapping module source span.');
      need(literal(file.content.slice(item.start,item.end))===item.specifier,'Module literal differs from its selected original bytes.');
      const target=resolve(file.path,item.specifier);need(target===item.path,'Incorrect module relationship.');
      if(target===BANK)need(file.path===WORKSPACE&&item.dynamic===true,'Only the original workspace may select its generated bank lazily.');
      else need(item.dynamic!==true&&files.get(target)?.kind==='module','Incomplete static module dependency: '+target);
      end=item.end;
    }
  }
  const reached=new Set();
  function visit(p){if(reached.has(p))return;reached.add(p);for(const item of files.get(p).imports)if(item.path!==BANK)visit(item.path);}
  visit(source.entryModule);
  for(const file of files.values())if(file.kind==='module')need(reached.has(file.path),'Unreachable executable source in offline bank: '+file.path);
  // Current product styles have no imported resources. A later resource needs
  // deliberate full-source composition rather than an unobserved network load.
  for(const file of files.values())if(file.kind==='style')need(!/@import\b|url\s*\(/i.test(file.content),'CSS resource imports need a complete supported source binding.');
  return {files:source.files.length,bytes:total,...await identity(JSON.stringify(source)),manifest:sourceSummary(source)};
}
function moduleText(file){
  let value='',offset=0;
  for(const item of file.imports){value+=file.content.slice(offset,item.start)+JSON.stringify(VIRTUAL+item.path);offset=item.end;}
  return value+file.content.slice(offset);
}
function attributes(tag){
  const result={};const body=tag.replace(/^<\/?[a-z][\w:-]*/i,'').replace(/\/?>$/,'');
  let used=0;
  const pattern=/\s+([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g;let match;
  while((match=pattern.exec(body))){need(body.slice(used,match.index).trim()==='','Unsupported HTML asset attributes.');const key=match[1].toLowerCase();need(!own(result,key),'Duplicate HTML asset attribute.');result[key]=match[2]??match[3]??match[4]??'';used=pattern.lastIndex;}
  need(body.slice(used).trim()==='','Unsupported HTML asset tag.');return result;
}
/** Build the complete offline recipient file; normal review semantics stay in the original UI/model. */
export async function buildOfflineReviewer({reviewText,recipientId,title,source}){
  unicode(reviewText,'Complete recorded review');need(typeof recipientId==='string'&&recipientId.length>0&&recipientId.length<=1000,'Select the original named recipient.');
  unicode(title,'Review title');need(title.length>0&&title.length<=10000,'Invalid review title.');
  const verified=await validateOfflineSource(source),review=await identity(reviewText);
  need(review.bytes<=MAX_REVIEW_BYTES,'The complete recorded review exceeds its original complete-review receiving allowance.');
  // Validate only the packaging envelope here. The original importReviewRound
  // remains the authoritative whole-history and participant verifier at opening.
  const selected=JSON.parse(reviewText);need(plain(selected)&&selected.schema==='stellar-forge.grant-review-round-export.v1','Select a complete recorded review export.');
  const files=new Map(source.files.map(x=>[x.path,x])),imports={},modules=[];
  for(const file of source.files)if(file.kind==='module'){
    const transformed=moduleText(file);imports[VIRTUAL+file.path]=dataURL('text/javascript;charset=utf-8',transformed);
    modules.push({path:file.path,...await identity(transformed)});
  }
  imports[VIRTUAL+BANK]=dataURL('text/javascript;charset=utf-8',"export default JSON.parse(document.getElementById('review-offline-input').textContent).source;\n");
  let html=files.get(source.entryHtml).content,entryCount=0,assetPaths=new Set();
  need(!/<base\b|http-equiv\s*=\s*["']?content-security-policy/i.test(html),'Original template already contains a base or content policy.');
  need(!/id\s*=\s*["']review-offline-(?:input|manifest)["']/i.test(html),'Original template already embeds an offline payload.');
  html=html.replace(/<link\b[^>]*>/gi,tag=>{
    const attrs=attributes(tag);need(typeof attrs.href==='string','Unbound HTML link resource.');
    const target=resolve(source.entryHtml,attrs.href),file=files.get(target);
    need(file,'Missing complete HTML asset: '+target);assetPaths.add(target);
    if(attrs.rel==='stylesheet'){need(file.kind==='style','Stylesheet source kind mismatch.');return '<link rel="stylesheet" href="'+dataURL('text/css;charset=utf-8',file.content)+'">';}
    if(attrs.rel==='icon'){need(file.kind==='asset'&&attrs.type==='image/svg+xml','Unsupported icon source.');return '<link rel="icon" type="image/svg+xml" href="'+dataURL('image/svg+xml',file.content)+'">';}
    throw new Error('Unsupported automatic HTML resource: '+attrs.rel);
  });
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,tag=>{
    const open=tag.slice(0,tag.indexOf('>')+1),attrs=attributes(open);
    need(attrs.type==='module'&&attrs.src&&tag.slice(open.length).replace(/<\/script\s*>$/i,'').trim()==='','Unexpected executable code in the original HTML template.');
    need(resolve(source.entryHtml,attrs.src)===source.entryModule,'Unexpected HTML module entry.');entryCount++;return '';
  });
  need(entryCount===1,'Expected one original review module entry.');
  need(!/<(?:iframe|object|embed|audio|video|source|img)\b/i.test(html),'A new active HTML resource requires complete offline source handling.');
  for(const file of files.values())if(file.kind!=='module'&&file.kind!=='html')need(assetPaths.has(file.path),'Unused source resource: '+file.path);
  const manifest={schema:'stellar-forge.review-offline-manifest/1',review,recipientId,title,
    source:{bytes:verified.bytes,sha256:verified.sha256,...sourceSummary(source)},transformedModules:modules,
    format:'single-html/import-map/data-modules',automaticNetwork:false};
  const policy="default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const header='<meta http-equiv="Content-Security-Policy" content="'+policy+'">\n'+
    '<script type="application/json" id="review-offline-input">'+safeJSON({schema:OFFLINE_SCHEMA,reviewText,recipientId,source})+'</script>\n'+
    '<script type="application/json" id="review-offline-manifest">'+safeJSON(manifest)+'</script>\n'+
    '<script type="importmap">'+safeJSON({imports})+'</script>\n';
  need(/<head(?:\s[^>]*)?>/i.test(html)&&/<\/body\s*>/i.test(html),'Incomplete original HTML template.');
  const charset=/<meta\s+charset=["']utf-8["']\s*\/?>/gi;
  need([...html.matchAll(charset)].length===1,'Expected the original explicit UTF-8 declaration.');
  // Keep charset inside the first 1,024 bytes, before the complete embedded bank.
  html=html.replace(charset,match=>match+'\n'+header)
    .replace(/<title>[\s\S]*?<\/title>/i,'<title>'+htmlText(title)+' — Offline review</title>')
    .replace(/<\/body\s*>/i,'<script type="module">import '+safeJSON(VIRTUAL+source.entryModule)+';</script>\n</body>');
  return {html,manifest};
}
