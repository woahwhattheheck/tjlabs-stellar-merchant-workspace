// MIT. Local operator HTTP service; native publisher, exact files and complete archives.
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDataGouvWorkspace} from './workspace.mjs';
import {need} from './capture.mjs';
const here=dirname(fileURLToPath(import.meta.url));
export async function startDataGouvWorkspace({directory,create=false,title,port=8429,sourceRoot=resolve(here,'../../../..'),apiBase='https://www.data.gouv.fr/api/1/',tokenEnv='DATAGOUV_API_KEY'}={}){
  need(Number.isInteger(port)&&port>=0&&port<=65535,'Choose a local TCP port');const workspace=await openDataGouvWorkspace({directory,create,title});
  const token=randomBytes(32).toString('hex');let address,provider,closing=false;
  const json=(res,status,body,headers={})=>{const raw=Buffer.from(JSON.stringify(body));res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-length':raw.length,...headers});res.end(raw);};
  const file=(res,result)=>{res.writeHead(200,{'content-type':result.contentType,'cache-control':'no-store','x-content-type-options':'nosniff','content-length':result.bytes.length,'content-disposition':'attachment; filename="'+result.filename.replace(/[^A-Za-z0-9_.-]/g,'_')+'"'});res.end(result.bytes);};
  async function body(req){need(/^application\/json(?:;|$)/i.test(req.headers['content-type']??''),'Use a JSON operation body');let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;need(size<=1048576,'Operation input exceeds 1 MiB');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  const remote=async()=>{if(!provider){const module=await import('./datagouv-publication.mjs');provider=module.createDataGouvPublisher({apiBase,tokenEnv,loadOperation:workspace.loadOperation,saveOperation:workspace.saveOperation});}return provider;};
  const server=createServer(async(req,res)=>{
    try{
      need(req.headers.host===address?.host,'Use the displayed original loopback workspace URL');
      if(req.headers.origin)need(req.headers.origin===address.origin,'Use the same local workspace origin');
      if(req.headers['sec-fetch-site'])need(['same-origin','none'].includes(req.headers['sec-fetch-site']),'Use the local operator workspace directly');
      const url=new URL(req.url,address.origin),path=url.pathname;
      if(req.method==='POST'){
        const supplied=req.headers['x-workspace-token'];need(typeof supplied==='string'&&supplied.length===token.length&&timingSafeEqual(Buffer.from(supplied),Buffer.from(token)),'Use the original local operator session');
        const input=await body(req);let result;
        if(path==='/api/import')result=await workspace.importCapture(input);
        else if(path==='/api/prepare')result=await workspace.preparePublication(input);
        else if(path==='/api/extract')result=await workspace.extract(input.publicationId);
        else if(path==='/api/retry-extraction')result=await workspace.retryExtraction(input.publicationId,input);
        else if(path==='/api/review')result=await workspace.review(input.publicationId,input);
        else if(path==='/api/publish')result=await workspace.publish(input.publicationId,input);
        else if(path==='/api/recover')result=await workspace.recover(input.publicationId);
        else if(path==='/api/select')result=await workspace.select(input);
        else if(path==='/api/compare')result=await workspace.compare(input);
        else if(path==='/api/decide')result=await workspace.decide(input);
        else if(path==='/api/portal/prepare')result=await (await remote()).prepareDraft(input);
        else if(path==='/api/portal/draft')result=await (await remote()).saveDraft(input);
        else if(path==='/api/portal/review')result=await (await remote()).reviewDraft(input);
        else if(path==='/api/portal/publish')result=await (await remote()).publish(input);
        else if(path==='/api/portal/reconcile')result=await (await remote()).reconcile(input);
        else{json(res,404,{error:'Choose an available workspace operation'});return;}
        json(res,200,result);return;
      }
      if(req.method!=='GET'){json(res,405,{error:'Use GET or POST'});return;}
      if(path==='/api/status'){json(res,200,workspace.status());return;}
      if(path==='/api/session'){json(res,200,{token});return;}
      if(path==='/api/source'){json(res,200,await workspace.inspectCapture(url.searchParams.get('capture'),{offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??25)}));return;}
      if(path==='/api/publication'){json(res,200,await workspace.inspectPublication(url.searchParams.get('publication'),url.searchParams.get('query')??'limit=25'));return;}
      if(path==='/api/comparison'){json(res,200,await workspace.comparison(url.searchParams.get('comparison'),{offset:Number(url.searchParams.get('offset')??0),limit:100}));return;}
      if(path==='/api/history'){json(res,200,await workspace.history({offset:Number(url.searchParams.get('offset')??0),limit:100}));return;}
      if(path==='/api/query'){const p=url.searchParams.get('publication');url.searchParams.delete('publication');const result=await workspace.query({publicationId:p||undefined,query:url.searchParams.toString()});json(res,result.status,result.body,result.headers);return;}
      if(path==='/api/download'){file(res,await workspace.download(url.searchParams.get('kind'),url.searchParams.get('id')));return;}
      if(path==='/api/export'){file(res,await workspace.exportArchive({sourceRoot}));return;}
      if(path==='/api/portal/schema'){const module=await import('./datagouv-publication.mjs');json(res,200,module.publicationInputSchema());return;}
      if(path==='/api/portal/status'){json(res,200,await (await remote()).inspect({operationId:url.searchParams.get('operation')}));return;}
      const assets=new Map([['/','index.html'],['/app.mjs','app.mjs'],['/style.css','style.css']]);const asset=assets.get(path);
      if(!asset){json(res,404,{error:'This workspace page does not exist'});return;}
      const raw=await readFile(join(here,'public',asset));res.writeHead(200,{'content-type':asset.endsWith('.html')?'text/html; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'content-length':raw.length});res.end(raw);
    }catch(e){if(!res.headersSent)json(res,e.status??400,{error:e.code??'WORKSPACE_OPERATION',message:e.message});else res.destroy(e);}
  });
  server.requestTimeout=360000;server.headersTimeout=30000;
  try{await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});address={origin:'http://127.0.0.1:'+server.address().port,host:'127.0.0.1:'+server.address().port};}
  catch(e){await workspace.close();throw e;}
  async function close(){if(closing)return;closing=true;await new Promise(done=>server.close(done));await workspace.close();}
  return {workspace,server,url:address.origin,token,close};
}
