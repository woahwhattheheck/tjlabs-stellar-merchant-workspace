// MIT. Authenticated, project-scoped agent routes on the original Directus operator.
import {open,link,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {readJson,hashPrivate,saveExact,privateDirectory} from '../dspace/merchant-files.mjs';
import {fault,MAX_SOURCE_BYTES} from './source.mjs';
import {agentId,agentView,merchantLocation,DirectusAgentOperations,prepareDirectusAgentExport,readDirectusAgentExport,DIRECTUS_AGENT_MAX_FILE} from './agent-operations.mjs';
export function createDirectusAgentRoutes({workspace,readBody,reply,checkSource,closing,connection,merchant,environment}){
 const jobs=new DirectusAgentOperations({environment}),uploads=new Set();
 const owner=()=>workspace();
 async function uploadReceipt(id){
  const root=join(owner().directory,'agent-uploads'),value=await readJson(join(root,agentId(id)+'.json'),16384),file=join(root,id+'.bin'),pin=await hashPrivate(file,DIRECTUS_AGENT_MAX_FILE);
  if(value.id!==id||value.sha256!==pin.hash||value.bytes!==pin.bytes)throw fault('DIRECTUS_AGENT_UPLOAD_CHANGED','The retained source file differs from its original receipt.',409);
  return{...value,file};
 }
 const routes=async(req,res,path,url)=>{
  if(!path.startsWith('/api/agent/'))return false;
  const w=owner();
  if(req.method==='POST'&&path==='/api/agent/view'){const input=await readBody(req);reply(res,200,await agentView(w,input.view,input.input??{},{merchant}));return true;}
  const request=path.match(/^\/api\/agent\/requests\/([A-Za-z0-9_.:-]+)$/);
  if(request){
   const id=agentId(request[1]);
   if(req.method==='GET'){reply(res,200,jobs.describe(w,id));return true;}
   if(req.method==='POST'){
    const value=await readBody(req);if(value.input?.operationId!==id)throw fault('DIRECTUS_AGENT_REQUEST_CHANGED','The original route and operation ID differ.',409);
    await checkSource();if(closing())throw fault('DIRECTUS_AGENT_CLOSING','The operator is closing.',409);
    reply(res,202,jobs.start({workspace:w,request:value,connection:connection(),merchant,upload:uploadReceipt}));return true;
   }
  }
  const cancel=path.match(/^\/api\/agent\/cancel\/([A-Za-z0-9_.:-]+)$/);
  if(req.method==='POST'&&cancel){await readBody(req);reply(res,200,jobs.cancel(w,agentId(cancel[1])));return true;}
  if(req.method==='POST'&&path==='/api/agent/merchant'){
   if(jobs.active)throw fault('DIRECTUS_AGENT_RUNNING','Continue the current original customer operation before changing its merchant.',409);
   const input=await readBody(req);await checkSource();
   if(!['start','stop'].includes(input.action))throw fault('DIRECTUS_AGENT_MERCHANT','Choose original start or stop.');
   reply(res,200,await merchant(input.action,agentId(input.merchantId),input.runtime));return true;
  }
  const upload=path.match(/^\/api\/agent\/upload\/([A-Za-z0-9_.:-]+)$/);
  if(upload){
   const id=agentId(upload[1]);
   if(req.method==='GET'){reply(res,200,await uploadReceipt(id));return true;}
   if(req.method==='PUT'){
    await checkSource();
    const length=req.headers['content-length'],sha=req.headers['x-content-sha256'];
    if(req.headers['transfer-encoding']||!/^[1-9][0-9]*$/.test(length??'')||!Number.isSafeInteger(Number(length))||Number(length)>MAX_SOURCE_BYTES||!/^[a-f0-9]{64}$/.test(sha??''))throw fault('DIRECTUS_AGENT_UPLOAD','Supply a complete original capture, exact SHA-256 and length up to 256 MiB.',413);
    const locked=w.meta('workspace_id')+'\n'+id;if(uploads.has(locked))throw fault('DIRECTUS_AGENT_UPLOAD_RUNNING','The original capture is already receiving.',409);uploads.add(locked);
    const root=join(w.directory,'agent-uploads'),temporary=join(root,id+'.partial-'+randomUUID());let handle;
    try{
     await privateDirectory(root,true);handle=await open(temporary,'wx',0o600);const digest=createHash('sha256');let size=0;req.setTimeout(60000);
     for await(const chunk of req){if(closing())throw fault('DIRECTUS_AGENT_CLOSING','The original operator is closing.',409);size+=chunk.length;if(size>Number(length))throw fault('DIRECTUS_AGENT_UPLOAD','The capture exceeds its original declared length.',413);digest.update(chunk);await handle.writeFile(chunk);}
     if(size!==Number(length)||digest.digest('hex')!==sha)throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','The complete capture differs from its original bytes.',409);
     await handle.sync();await handle.close();handle=null;await checkSource();if(closing())throw fault('DIRECTUS_AGENT_CLOSING','The original operator is closing.',409);
     const file=join(root,id+'.bin');try{await link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;const pin=await hashPrivate(file,MAX_SOURCE_BYTES);if(pin.hash!==sha||pin.bytes!==size)throw fault('DIRECTUS_AGENT_SOURCE_CHANGED','This upload ID retains different original bytes.',409);}
     const value={schema:'stellar-forge.directus-agent-upload.v1',id,bytes:size,sha256:sha};await saveExact(join(root,id+'.json'),value);reply(res,201,{...value,file});return true;
    }finally{await handle?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});uploads.delete(locked);}
   }
  }
  const file=path.match(/^\/api\/agent\/exports\/([A-Za-z0-9_.:-]+)(\/file)?$/);
  if(file){
   const id=agentId(file[1]);
   if(req.method==='POST'&&!file[2]){
    if(jobs.active)throw fault('DIRECTUS_AGENT_RUNNING','Finish or cancel the saved original operation before freezing its complete project.',409);
    reply(res,200,await prepareDirectusAgentExport(w,id,await readBody(req)));return true;
   }
   if(req.method==='GET'){
    const value=await readDirectusAgentExport(w,id);
    if(!file[2]){reply(res,200,value);return true;}
    const handle=await open(value.file.path,'r');
    try{const stat=await handle.stat();if(stat.size!==value.file.bytes)throw fault('DIRECTUS_AGENT_EXPORT_CHANGED','The retained complete export changed.',409);
     res.writeHead(200,{'content-type':value.file.contentType,'content-length':String(value.file.bytes),'content-disposition':'attachment; filename="'+value.file.name.replace(/["\r\n\\]/g,'_')+'"','x-content-sha256':value.file.sha256,'cache-control':'no-store'});
     await pipeline(handle.createReadStream({autoClose:false}),res);
    }finally{await handle.close();}return true;
   }
  }
  throw fault('DIRECTUS_AGENT_ROUTE','Choose an original customer-agent route.',404);
 };
 return{routes,get active(){return jobs.active;},requestClose:()=>jobs.requestClose(),close:()=>jobs.close()};
}
