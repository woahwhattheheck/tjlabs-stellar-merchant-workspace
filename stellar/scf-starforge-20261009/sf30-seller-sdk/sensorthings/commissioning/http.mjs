// MIT. Authenticated commissioning facade on the existing SensorThings listener.
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {readBrowserAssets} from '../../../distribution/browser-assets.mjs';
import {openPrivateFile,hashHeldFile} from '../portable.mjs';
import {fault} from '../contract.mjs';
import {exactJSON} from '../analysis/sta.mjs';
import {createCommissioningSTAFacade} from './stam.mjs';
const prefix='/api/commissioning',maximumFileBytes=2*1024*1024*1024;
const csp="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const common={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':csp};
function segment(text){let value;try{value=decodeURIComponent(text);}catch{throw fault('COMMISSIONING_ROUTE','Use a complete encoded record ID.');}if(!/^[A-Za-z0-9._:-]{1,200}$/.test(value)||value==='.'||value==='..')throw fault('COMMISSIONING_ROUTE','Use a selected original record ID.');return value;}
function integer(url,key,fallback,{maximum=Number.MAX_SAFE_INTEGER,minimum=0}={}){const value=url.searchParams.get(key);if(value===null)return fallback;if(!/^\d+$/.test(value))throw fault('COMMISSIONING_PAGE','Use a whole-number '+key+'.');const n=Number(value);if(!Number.isSafeInteger(n)||n<minimum||n>maximum)throw fault('COMMISSIONING_PAGE','The selected '+key+' is outside the source contract.');return n;}
function json(res,status,body,head=false,extra={}){const bytes=Buffer.from(exactJSON(body)+'\n');res.writeHead(status,{...common,'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,...extra});res.end(head?undefined:bytes);}
function publicFile(file){if(!file||typeof file.id!=='string'||typeof file.path!=='string'||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>maximumFileBytes||!/^[a-f0-9]{64}$/.test(file.sha256??''))throw fault('COMMISSIONING_FILE','The original manager did not return a complete immutable file.',409);return{id:file.id,name:file.name??basename(file.path),type:file.type??'application/octet-stream',bytes:file.bytes,sha256:file.sha256};}
function selectedRange(header,bytes){if(!header)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||!match[1]&&!match[2])throw fault('COMMISSIONING_RANGE','Use one complete byte range.',416);let start,end;if(!match[1]){const count=Number(match[2]);if(!Number.isSafeInteger(count)||count<1)throw fault('COMMISSIONING_RANGE','Invalid suffix range.',416);start=Math.max(0,bytes-count);end=bytes-1;}else{start=Number(match[1]);end=match[2]?Number(match[2]):bytes-1;}if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=bytes||end<start)throw fault('COMMISSIONING_RANGE','The requested range is outside the selected file.',416);return{start,end:Math.min(end,bytes-1)};}
/** Mount handleApi only after the original Bearer/Host/Origin/workspace checks. */
export async function createCommissioningHttp({workspace,origin}){
  if(!workspace?.commissioning)throw fault('COMMISSIONING_MANAGER','Mount the original workspace commissioning manager.',503);
  const manager=workspace.commissioning,assetSource=new URL('./browser-assets.json',import.meta.url),manifest=JSON.parse(await readFile(assetSource,'utf8'));
  const styleHashes=manifest.cspStyleHashes??[];
  if(!Array.isArray(styleHashes)||styleHashes.some(value=>typeof value!=='string'||!/^'sha256-[A-Za-z0-9+/]{43}='$/.test(value)))throw fault('COMMISSIONING_ASSET_POLICY','Use exact retained style hashes for the original built map.');
  const staticHeaders={...common,'Content-Security-Policy':csp.replace("style-src 'self'","style-src 'self'"+(styleHashes.length?' '+[...new Set(styleHashes)].join(' '):''))};
  const map=await readBrowserAssets(assetSource),assets=new Map();
  for(const[path,item]of map)assets.set(path,{type:item.type,bytes:await readFile(item.url)});
  const facade=createCommissioningSTAFacade({manager,basePath:prefix+'/map'});
  const originUrl=new URL(origin),active=new Set();let closing=false;
  if(originUrl.origin!==origin||!['http:','https:'].includes(originUrl.protocol))throw fault('COMMISSIONING_ORIGIN','Use the original listener origin.');
  async function staticHandler(req,res,{url}){
    const asset=assets.get(url.pathname);if(!asset)return false;
    if(req.method!=='GET'&&req.method!=='HEAD')return false;
    res.writeHead(200,{...staticHeaders,'Content-Type':asset.type,'Content-Length':asset.bytes.length});res.end(req.method==='HEAD'?undefined:asset.bytes);return true;
  }
  async function download(req,res,url,id){
    const original=await manager.fileRecord(id),file=publicFile(original);
    if(file.id!==id)throw fault('COMMISSIONING_FILE','The selected file ID changed.',409);
    const expected=url.searchParams.get('expectedSha256');if(expected&&expected!==file.sha256)throw fault('COMMISSIONING_FILE_CHANGED','The selected file edition changed.',409);
    if(url.searchParams.get('metadata')==='1'){json(res,200,file,req.method==='HEAD');return;}
    const held=await openPrivateFile(original.path,{expectedBytes:file.bytes,maximum:maximumFileBytes});
    try{
      await hashHeldFile(held.handle,{expectedBytes:file.bytes,expectedSha256:file.sha256,maximum:maximumFileBytes});
      const etag='"sha256-'+file.sha256+'"';if(req.headers['if-match']&&req.headers['if-match']!==etag)throw fault('COMMISSIONING_FILE_CHANGED','The selected complete file identity changed.',412);
      if(req.headers['if-range']&&req.headers['if-range']!==etag)throw fault('COMMISSIONING_FILE_CHANGED','Resume against the same complete file SHA256.',412);
      const range=selectedRange(req.headers.range,file.bytes),start=range?.start??0,end=range?.end??file.bytes-1,size=range?end-start+1:file.bytes;
      const clean=basename(file.name).replace(/[\r\n"\\]/g,'_'),ascii=clean.replace(/[^\x20-\x7e]/g,'_');
      const type=/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:; charset=utf-8)?$/.test(file.type)?file.type:'application/octet-stream';
      res.writeHead(range?206:200,{...common,'Content-Type':type,'Content-Length':size,'Content-Disposition':'attachment; filename="'+ascii+'"; filename*=UTF-8\'\''+encodeURIComponent(clean),'X-Content-SHA256':file.sha256,'X-Content-Bytes':String(file.bytes),'Accept-Ranges':'bytes',ETag:etag,...(range?{'Content-Range':'bytes '+start+'-'+end+'/'+file.bytes}:{})});
      if(req.method==='HEAD'||size===0){res.end();return;}
      await pipeline(held.handle.createReadStream({start,end,autoClose:false}),res);
    }finally{await held.handle.close();}
  }
  async function handleApi(req,res,{url,workspaceId}){
    if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return false;
    if(closing)throw fault('COMMISSIONING_CLOSING','The original commissioning interface is closing.',503);
    if(url.origin!==origin)throw fault('COMMISSIONING_ORIGIN','Use the original listener origin.',403);
    if(req.method!=='GET'&&req.method!=='HEAD')throw fault('COMMISSIONING_METHOD','Use the existing /api/action envelope for commissioning changes.',405);
    const mapResult=await facade.handle({url,method:req.method});
    if(mapResult){const bytes=Buffer.from(mapResult.body,'utf8');res.writeHead(mapResult.status,{...common,...mapResult.headers,'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);return true;}
    const tail=url.pathname.slice(prefix.length+1),parts=tail.split('/'),head=req.method==='HEAD';
    if(tail==='schema'){
      const schema=await workspace.schema(),source=schema.commissioning??{};
      const selectedAssets=source.map?.assets??source.stam?.assets??manifest.stamAssets??null;
      json(res,200,{...source,workspaceId,actions:Object.fromEntries(Object.entries(schema.actions??{}).filter(([name])=>name.startsWith('commissioning.'))),map:{...(source.map??{}),...(selectedAssets?{assets:selectedAssets}:{})},reads:{schema:prefix+'/schema',view:prefix+'/view',map:prefix+'/map',fileMetadata:prefix+'/files/:id?metadata=1',fileBytes:prefix+'/files/:id'}},head);return true;
    }
    if(tail==='view'){json(res,200,await manager.overview(),head);return true;}
    if(parts[0]==='projects'&&parts.length===2){json(res,200,await manager.project(segment(parts[1])),head);return true;}
    if(parts[0]==='projects'&&parts.length===3&&parts[2]==='history'){json(res,200,await manager.history(segment(parts[1]),{offset:integer(url,'offset',0),limit:integer(url,'limit',100,{minimum:1,maximum:500})}),head);return true;}
    if(parts[0]==='sources'&&(parts.length===2||parts.length===3&&parts[2]==='rows')){
      const id=segment(parts[1]);const result=parts.length===2?await manager.source(id):await manager.rows(id,{offset:integer(url,'offset',0),limit:integer(url,'limit',100,{minimum:1,maximum:500}),mappingId:url.searchParams.has('mappingId')?segment(url.searchParams.get('mappingId')):null});json(res,200,result,head);return true;
    }
    if((parts[0]==='plans'||parts[0]==='jobs')&&parts.length===2){const result=await manager[parts[0]==='plans'?'plan':'job'](segment(parts[1]),{offset:integer(url,'offset',0),limit:integer(url,'limit',100,{minimum:1,maximum:500})});json(res,200,result,head);return true;}
    if(parts[0]==='files'&&parts.length===2){const operation=download(req,res,url,segment(parts[1]));active.add(operation);try{await operation;}finally{active.delete(operation);}return true;}
    throw fault('COMMISSIONING_NOT_FOUND','Select an original commissioning route or retained record.',404);
  }
  async function close(){closing=true;await Promise.allSettled([...active]);await facade.close();}
  return{staticHandler,handleApi,close};
}
