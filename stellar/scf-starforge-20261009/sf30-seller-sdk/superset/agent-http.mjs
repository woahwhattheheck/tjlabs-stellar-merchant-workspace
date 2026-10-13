// MIT. Original authenticated loopback routes for complete customer-agent receiving.
import {open,link,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {hashPrivate,readJson,saveExact,privateDirectory,fault} from './files.mjs';
import {agentId,readSupersetAgentRequest,retainSupersetAgentRequest,supersetAgentSummary,supersetAgentPage,
 prepareSupersetAgentExport,readSupersetAgentExport,SUPERSET_MAX_FILE} from './agent-operations.mjs';
export function createSupersetAgentRoutes({workspace,readBody,reply,checkSource,closing,running}){
 const uploads=new Set(),exports=new Map();
 async function uploadReceipt(id){
  const root=join(workspace.directory,'uploads'),value=await readJson(join(root,id+'.json'),16384);
  const file=join(root,id+'.sqlite3'),pin=await hashPrivate(file,SUPERSET_MAX_FILE);
  if(value.id!==id||value.file!==file||value.sha256!==pin.hash||value.bytes!==pin.bytes)
   throw fault('SUPERSET_AGENT_UPLOAD_CHANGED','The retained original project upload changed.',409);
  return value;
 }
 return async(req,res,path,url)=>{
  if(!path.startsWith('api/agent/'))return false;
  if(req.method==='GET'&&path==='api/agent/state'){reply(res,200,supersetAgentSummary(workspace));return true;}
  if(req.method==='GET'&&path==='api/agent/page'){
   reply(res,200,supersetAgentPage(workspace,{kind:url.searchParams.get('kind'),offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??50)}));return true;
  }
  const request=path.match(/^api\/agent\/requests\/([A-Za-z0-9_-]+)$/);
  if(request){
   const id=agentId(request[1]);
   if(req.method==='GET'){const value=readSupersetAgentRequest(workspace,id);if(!value)throw fault('SUPERSET_AGENT_REQUEST_MISSING','The original request has not been retained.',404);reply(res,200,value);return true;}
   if(req.method==='POST'){
    const logical=await readBody(req);
    if(logical.input?.operationId!==id)throw fault('SUPERSET_AGENT_REQUEST_CHANGED','The original request ID differs from its selected route.',409);
    const prior=readSupersetAgentRequest(workspace,id);let actual=prior?.request??structuredClone(logical);
    if(!prior&&logical.action==='prepare-buyer'){const selected=await running(logical.input.merchantId);actual.input.seller=selected.service.url;}
    const value=retainSupersetAgentRequest(workspace,logical,{actual});reply(res,200,value);return true;
   }
  }
  const upload=path.match(/^api\/agent\/upload\/([A-Za-z0-9_-]+)$/);
  if(upload){
   const id=agentId(upload[1]);
   if(req.method==='GET'){reply(res,200,await uploadReceipt(id));return true;}
   if(req.method==='PUT'){
    await checkSource();
    const length=req.headers['content-length'],sha=req.headers['x-content-sha256'];
    if(req.headers['transfer-encoding']||!Number.isSafeInteger(Number(length))||!/^[1-9][0-9]*$/.test(length??'')||Number(length)>SUPERSET_MAX_FILE||!/^[a-f0-9]{64}$/.test(sha??''))
     throw fault('SUPERSET_AGENT_UPLOAD','Provide a complete original project file, length and SHA-256 up to 2 GiB.',413);
    if(uploads.has(id))throw fault('SUPERSET_AGENT_UPLOAD_RUNNING','The same original upload is still receiving.',409);
    uploads.add(id);const root=join(workspace.directory,'uploads'),temporary=join(root,id+'.partial-'+randomUUID());let handle;
    try{
     await privateDirectory(root,true);handle=await open(temporary,'wx',0o600);req.setTimeout(60000);
     const hash=createHash('sha256');let size=0;
     for await(const chunk of req){if(closing())throw fault('SUPERSET_WORKSPACE_CLOSED','The original listener is closing.',409);size+=chunk.length;if(size>Number(length))throw fault('SUPERSET_AGENT_UPLOAD','The incoming file exceeds its original length.',413);hash.update(chunk);await handle.writeFile(chunk);}
     if(size!==Number(length)||hash.digest('hex')!==sha)throw fault('SUPERSET_AGENT_UPLOAD_CHANGED','The complete uploaded file differs from its original length or SHA-256.',409);
     await handle.sync();await handle.close();handle=null;await checkSource();
     if(closing())throw fault('SUPERSET_WORKSPACE_CLOSED','The original listener is closing.',409);
     const file=join(root,id+'.sqlite3');
     try{await link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;const prior=await hashPrivate(file,SUPERSET_MAX_FILE);if(prior.hash!==sha||prior.bytes!==size)throw fault('SUPERSET_AGENT_UPLOAD_CHANGED','This original upload ID retains different bytes.',409);}
     await unlink(temporary);
     const value={schema:'stellar-forge.superset-agent-upload.v1',id,file,bytes:size,sha256:sha};
     await saveExact(join(root,id+'.json'),value);reply(res,201,value);return true;
    }finally{await handle?.close();await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});uploads.delete(id);}
   }
  }
  const file=path.match(/^api\/agent\/exports\/([A-Za-z0-9_-]+)(\/file)?$/);
  if(file){
   const id=agentId(file[1]);
   if(req.method==='POST'&&!file[2]){
    const selection=await readBody(req);
    let task=exports.get(id);
    if(task){await task;}
    // The persisted selection is checked even after joining an existing task.
    task=prepareSupersetAgentExport(workspace,id,selection);exports.set(id,task);
    try{const value=await task;reply(res,200,value);return true;}finally{if(exports.get(id)===task)exports.delete(id);}
   }
   if(req.method==='GET'){
    const value=await readSupersetAgentExport(workspace,id);
    if(!file[2]){reply(res,200,value);return true;}
    const handle=await open(value.file.path,'r');
    try{
     const stat=await handle.stat();if(stat.size!==value.file.bytes)throw fault('SUPERSET_AGENT_EXPORT_CHANGED','The original exported file changed.',409);
     res.writeHead(200,{'content-type':value.file.contentType,'content-length':String(value.file.bytes),
      'content-disposition':'attachment; filename="'+value.file.name.replace(/["\r\n\\]/g,'_')+'"',
      'x-content-sha256':value.file.sha256,'cache-control':'no-store','x-content-type-options':'nosniff'});
     await pipeline(handle.createReadStream({autoClose:false}),res);
    }finally{await handle.close();}
    return true;
   }
  }
  throw fault('SUPERSET_AGENT_ROUTE','Choose an original customer-agent route.',404);
 };
}
