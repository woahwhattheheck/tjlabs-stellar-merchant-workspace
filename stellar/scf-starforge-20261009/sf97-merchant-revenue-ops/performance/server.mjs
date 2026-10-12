// MIT. Local HTTP access to the original recorded-usage performance workspace.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {PERFORMANCE_FILES} from './workspace.mjs';
import {PERFORMANCE_MAX_BYTES,performanceError} from './source.mjs';

const POLICY="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const REPORT_POLICY="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const fault=performanceError;
const pageQuery=path=>['/sources','/reviews','/service-periods'].includes(path);
function query(url,path){
  const allowed=pageQuery(path)?['after','limit']:path==='/source'?['version']:
    ['/review','/capture'].includes(path)?['performanceId']:[];
  if(url.hash||[...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1))
    throw fault('PERFORMANCE_URL_INVALID','Use the selected performance operation and its documented parameters.',400);
  const page={};
  if(url.searchParams.has('after'))page.after=url.searchParams.get('after');
  if(url.searchParams.has('limit')){
    const raw=url.searchParams.get('limit');
    if(!/^[1-9]\d{0,2}$/.test(raw))throw fault('PERFORMANCE_PAGE_INVALID','Choose 1–100 items per page.');
    page.limit=Number(raw);
  }
  return page;
}

export async function handlePerformanceRequest({req,res,url,workspace,prefix='/api',authorize,json,reply,body}){
  if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return false;
  try{
    authorize();
    const path=url.pathname.slice(prefix.length),page=query(url,path);
    if(req.method==='GET'||req.method==='HEAD'){
      if(path==='/state')json(200,await workspace.state());
      else if(path==='/sources')json(200,await workspace.sources(page));
      else if(path==='/source')json(200,await workspace.source(url.searchParams.get('version')));
      else if(path==='/service-periods')json(200,await workspace.servicePeriods(page));
      else if(path==='/reviews')json(200,await workspace.list(page));
      else if(path==='/review')json(200,await workspace.load(url.searchParams.get('performanceId')));
      else if(path==='/capture')json(200,await workspace.capture(url.searchParams.get('performanceId')));
      else{
        const match=/^\/files\/([a-f0-9-]{36})\/([^/]+)$/.exec(path);
        if(!match)throw fault('PERFORMANCE_ROUTE_NOT_FOUND','Performance operation not found.',404);
        const name=decodeURIComponent(match[2]);
        if(!PERFORMANCE_FILES.includes(name))throw fault('PERFORMANCE_FILE_NOT_FOUND','Choose a complete saved performance export.',404);
        const bytes=await workspace.download(match[1],name);
        const type=name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.csv')?'text/csv; charset=utf-8':'application/json; charset=utf-8';
        reply(200,type,bytes,{'content-disposition':'attachment; filename="'+name+'"',
          ...(name.endsWith('.html')?{'content-security-policy':REPORT_POLICY}:{})});
      }
      return true;
    }
    if(req.method!=='POST'){reply(405,'text/plain; charset=utf-8','Use GET or POST.',{allow:'GET, HEAD, POST'});return true;}
    const actions={'/service-periods':'captureServicePeriod','/preview':'preview','/save':'save','/inspect':'inspect',
      '/receive':'receive','/proposal':'proposal','/proposal/save':'saveProposal','/proposal/commit':'commitProposal'};
    if(!Object.hasOwn(actions,path))throw fault('PERFORMANCE_ROUTE_NOT_FOUND','Performance operation not found.',404);
    // Complete original service pairs and received reports use the same original
    // material limit. Smaller selectors retain their normal finite body budget.
    const maximum=['/service-periods','/inspect','/receive'].includes(path)?PERFORMANCE_MAX_BYTES:16*1024*1024;
    json(200,await workspace[actions[path]](await body(maximum)));
  }catch(error){
    json(error.status??(error instanceof TypeError||error instanceof RangeError?422:500),
      {error:{code:error.code??'PERFORMANCE_OPERATION_FAILED',message:error.message??'Performance operation failed.'}});
  }
  return true;
}

export async function startPerformanceServer({workspace,host='127.0.0.1',port=0}={}){
  if(!workspace?.capture||!['127.0.0.1','localhost'].includes(host)||!Number.isInteger(port)||port<0||port>65535)
    throw fault('PERFORMANCE_SERVER_INPUT_REQUIRED','Supply the performance workspace, a local host and a port from 0 to 65535.');
  const token=randomBytes(32).toString('hex'),expected=Buffer.from(token);
  const assets=new Map(await Promise.all([
    ['/','index.html','text/html; charset=utf-8'],
    ['/browser.mjs','browser.mjs','text/javascript; charset=utf-8'],
    ['/style.css','style.css','text/css; charset=utf-8']
  ].map(async([path,name,type])=>[path,{type,bytes:await readFile(new URL('./public/'+name,import.meta.url))}])));
  let hosts=new Set(),origins=new Set(),closing;
  const running=new Set();
  const server=createServer((req,res)=>{
    const reply=(status,type,data,extra={})=>{
      if(res.destroyed)return;
      const bytes=Buffer.isBuffer(data)?data:Buffer.from(typeof data==='string'?data:JSON.stringify(data));
      res.writeHead(status,{'content-type':type,'content-length':String(bytes.length),'cache-control':'no-store',
        'x-content-type-options':'nosniff','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin',
        'content-security-policy':POLICY,...extra});
      res.end(req.method==='HEAD'?undefined:bytes);
    };
    const json=(status,value)=>reply(status,'application/json; charset=utf-8',value);
    const authorize=()=>{
      const supplied=Buffer.from(String(req.headers.authorization??'').replace(/^Bearer /,''));
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))
        throw fault('PERFORMANCE_SESSION_REQUIRED','Open the private performance launch URL.',403);
    };
    const body=async maximum=>{
      if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
        throw fault('PERFORMANCE_JSON_REQUIRED','Use application/json.',415);
      let size=0;const chunks=[];
      for await(const chunk of req){
        size+=chunk.length;if(size>maximum)throw fault('PERFORMANCE_SOURCE_LIMIT','The complete input exceeds its documented limit.',413);
        chunks.push(chunk);
      }
      let value;
      try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fault('PERFORMANCE_JSON_INVALID','Use a complete JSON object.');}
      if(!value||typeof value!=='object'||Array.isArray(value))throw fault('PERFORMANCE_JSON_INVALID','Use a JSON object.');
      return value;
    };
    const task=(async()=>{
      if(!hosts.has(req.headers.host)||(req.headers.origin&&!origins.has(req.headers.origin))||
          ['cross-site','same-site'].includes(req.headers['sec-fetch-site']))
        throw fault('PERFORMANCE_ORIGIN_REQUIRED','Open the local performance workspace directly.',403);
      const url=new URL(req.url,'http://'+req.headers.host);
      if(await handlePerformanceRequest({req,res,url,workspace,authorize,json,reply,body}))return;
      if(url.search||url.hash)throw fault('PERFORMANCE_URL_INVALID','Use the performance workspace page URL.',400);
      const asset=assets.get(url.pathname);
      if(asset&&(req.method==='GET'||req.method==='HEAD'))return reply(200,asset.type,asset.bytes);
      throw fault('PERFORMANCE_PAGE_NOT_FOUND','Performance page not found.',404);
    })().catch(error=>json(error.status??500,{error:{code:error.code??'PERFORMANCE_OPERATION_FAILED',message:error.message}}));
    running.add(task);task.finally(()=>running.delete(task));
  });
  server.headersTimeout=10000;server.requestTimeout=30*60*1000;server.keepAliveTimeout=2000;
  await new Promise((done,fail)=>{
    const onError=error=>{server.removeListener('listening',onListen);fail(error);};
    const onListen=()=>{server.removeListener('error',onError);done();};
    server.once('error',onError);server.once('listening',onListen);server.listen(port,'127.0.0.1');
  });
  const assigned=server.address().port;
  hosts=new Set(['127.0.0.1:'+assigned,'localhost:'+assigned]);origins=new Set([...hosts].map(value=>'http://'+value));
  return {url:'http://'+host+':'+assigned+'/#token='+token,host,port:assigned,server,
    close(){return closing??=(async()=>{
      await new Promise((done,fail)=>{server.close(error=>error?fail(error):done());server.closeIdleConnections?.();});
      await Promise.allSettled([...running]);
    })();}};
}
