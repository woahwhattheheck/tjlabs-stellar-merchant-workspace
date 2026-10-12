import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createProject,reopenProject,serializeProject,applyAction,report,previewImport,portableMembers,prepareFormFill,keyOf,canonicalJSON,digest,WorkbenchError} from './workbench.mjs';
import {need,safePath,sha256Utf8,sha256Bytes,bytesFromBase64,utf8Text} from './lib/data.mjs';
export const APPLICATION_ROOT=path.dirname(fileURLToPath(import.meta.url));
const readUTF8=async filename=>utf8Text(new Uint8Array(await fs.readFile(filename)));
const jsonFile=async filename=>JSON.parse(await readUTF8(filename));
const exists=async filename=>{try{await fs.stat(filename);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
export function safeResolve(root,relative) {
  safePath(relative);const result=path.resolve(root,relative),base=path.resolve(root)+path.sep;
  need(result.startsWith(base),'PATH','The file must stay within the chosen workspace.');return result;
}
async function noSymlinkParents(root,filename) {
  const relative=path.relative(root,filename);let current=root;
  for(const part of relative.split(path.sep)){current=path.join(current,part);try{const stat=await fs.lstat(current);need(!stat.isSymbolicLink(),'PATH','A saved application path is a symbolic link.');}catch(e){if(e.code!=='ENOENT')throw e;}}
}
export async function atomicWrite(filename,content) {
  await fs.mkdir(path.dirname(filename),{recursive:true});
  const temporary=filename+'.'+randomBytes(12).toString('hex')+'.tmp';let handle;
  try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(content);await handle.sync();await handle.close();handle=null;await fs.rename(temporary,filename);}
  finally{if(handle)await handle.close();await fs.rm(temporary,{force:true});}
}
export async function acquireWorkspace(workspace) {
  await fs.mkdir(workspace,{recursive:true});const root=await fs.realpath(workspace),filename=path.join(root,'.workbench-owner.json'),token=randomBytes(24).toString('hex');
  for(let attempt=0;attempt<2;attempt++){
    try{const handle=await fs.open(filename,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,hostname:os.hostname(),token,started_at:new Date().toISOString()}));await handle.close();return {root,release:async()=>{try{const current=await jsonFile(filename);if(current.token===token)await fs.rm(filename);}catch(e){if(e.code!=='ENOENT')throw e;}}};}
    catch(error){if(error.code!=='EEXIST')throw error;const owner=await jsonFile(filename);let live=true;
      if(owner.hostname===os.hostname()&&Number.isSafeInteger(owner.pid)){try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')live=false;}}
      need(!live,'WORKSPACE_BUSY','This workspace is already open in another application process.',{owner});
      const check=await jsonFile(filename);need(check.token===owner.token,'WORKSPACE_BUSY','The workspace owner changed while opening it.');await fs.rm(filename);
    }
  }
  throw new WorkbenchError('WORKSPACE_BUSY','Could not acquire the original workspace.');
}
export async function initializeWorkspace(workspace,{source,projectId,title}={}) {
  const root=path.resolve(workspace);await fs.mkdir(root,{recursive:true});const destination=path.join(root,'project.json');
  if(await exists(destination))return reopenProject(await fs.readFile(destination,'utf8'));
  const packet=source?await jsonFile(path.resolve(source)):await jsonFile(path.join(APPLICATION_ROOT,'examples/original-cohort.json'));
  const project=createProject(packet,{projectId,title});await atomicWrite(destination,serializeProject(project));return project;
}
export async function loadProject(workspace){return reopenProject(await fs.readFile(path.join(workspace,'project.json'),'utf8'));}
export async function saveAction(workspace,action) {
  const current=await loadProject(workspace),result=applyAction(current,action);await atomicWrite(path.join(workspace,'project.json'),serializeProject(result.project));return result;
}
export async function native(python,args,{input,maxOutputBytes=1024*1024*512}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(python,[path.join(APPLICATION_ROOT,'receiver.py'),...args],{cwd:APPLICATION_ROOT,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1'}});
    const chunks=[],errors=[];let count=0,stderrCount=0,failed=false;
    child.on('error',reject);
    child.stdout.on('data',b=>{count+=b.length;if(count>maxOutputBytes){failed=true;child.kill('SIGTERM');}else chunks.push(b);});
    child.stderr.on('data',b=>{stderrCount+=b.length;if(stderrCount<=1024*1024)errors.push(b);});
    child.on('close',code=>{
      if(failed){reject(new WorkbenchError('NATIVE_OUTPUT','The complete receiver result exceeds the configured output size.'));return;}
      const body=Buffer.concat(chunks).toString('utf8'),stderr=Buffer.concat(errors).toString('utf8');let result;
      try{result=JSON.parse(body);}catch{reject(new WorkbenchError('NATIVE_RESPONSE','The receiving process did not return complete JSON.',{exit_code:code,stdout:body,stderr}));return;}
      if(code!==0||result.error||result.ok===false){const e=result.error;reject(new WorkbenchError(typeof e==='object'?e.code:result.code||'NATIVE',typeof e==='object'?e.message:result.message||String(e||'Native operation failed'),{...result,stderr,exit_code:code}));return;}
      resolve(result);
    });
    child.stdin.end(input||'');
  });
}

export async function nativeFile(python,args,filename) {
  const destination=path.resolve(filename);await fs.mkdir(path.dirname(destination),{recursive:true});
  const descriptor=await native(python,[...args,'--output',destination],{maxOutputBytes:1024*1024});
  need(descriptor.path===destination,'NATIVE_OUTPUT','The native output descriptor points to another result file.');
  const bytes=new Uint8Array(await fs.readFile(destination)),identity=sha256Bytes(bytes);
  need(identity.sha256===descriptor.sha256&&identity.bytes===descriptor.bytes,'NATIVE_OUTPUT','The complete saved native result differs from its descriptor.');
  return JSON.parse(utf8Text(bytes));
}
export async function inspectDocument(workspace,documentKey,{python='python3'}={}) {
  const p=await loadProject(workspace),doc=p.records.document.find(d=>keyOf(p,'document',d)===documentKey);
  need(doc,'DOCUMENT','Select one original document edition.');const asset=p.assets.find(a=>a.path===doc.asset_path);
  need(asset,'DOCUMENT','The complete original document is absent.');
  const filename=safeResolve(workspace,asset.path),output=safeResolve(workspace,'document-operations/'+asset.sha256+'/form-map.json');
  await noSymlinkParents(workspace,filename);await noSymlinkParents(workspace,output);
  await atomicWrite(filename,Buffer.from(bytesFromBase64(asset.base64)));
  return nativeFile(python,['form-map','--input',filename],output);
}
export async function fillDocument(workspace,prepared,{python='python3'}={}) {
  const p=await loadProject(workspace),doc=p.records.document.find(d=>keyOf(p,'document',d)===prepared.document_key);
  need(doc&&doc.content_sha256===prepared.original_sha256,'DOCUMENT_IDENTITY','The retained original template differs from this saved fill operation.');
  const asset=p.assets.find(a=>a.path===doc.asset_path);need(asset,'DOCUMENT','The complete template is absent.');
  const dir='document-operations/'+prepared.id+'/',original=safeResolve(workspace,asset.path),mapping=safeResolve(workspace,dir+'mapping.json'),operation=safeResolve(workspace,dir+'prepared.json'),resultFile=safeResolve(workspace,dir+'filled-result.json');
  for(const file of [original,mapping,operation,resultFile])await noSymlinkParents(workspace,file);
  await atomicWrite(original,Buffer.from(bytesFromBase64(asset.base64)));
  if(await exists(mapping))need(await readUTF8(mapping)===prepared.mapping_text,'FORM_OPERATION','The saved original fill mapping changed.');
  else await atomicWrite(mapping,prepared.mapping_text);
  await atomicWrite(operation,canonicalJSON(prepared)+'\n');
  const result=await nativeFile(python,['form-fill','--input',original,'--mapping',mapping],resultFile);
  const bytes=bytesFromBase64(result.output?.base64),identity=sha256Bytes(bytes);
  need(identity.sha256===result.output.sha256&&identity.bytes===result.output.bytes,'DOCUMENT_IDENTITY','The actual filled output differs from its complete identity.');
  const successor=safeResolve(workspace,dir+safePath(result.output.filename)),mapFile=safeResolve(workspace,dir+'successor-form-map.json');
  await noSymlinkParents(workspace,successor);await noSymlinkParents(workspace,mapFile);
  await atomicWrite(successor,Buffer.from(bytes));
  const map=await nativeFile(python,['form-map','--input',successor],mapFile);
  return {result,map};
}

function lookupMissing(error){return ['NOT_FOUND','REQUEST_NOT_FOUND','UNKNOWN_REQUEST'].includes(error.code)||/not found|unknown request/i.test(error.message);}
export async function runReceiving(workspace,{requestId,python='python3',database=path.join(workspace,'target.sqlite'),onPhase=()=>{}}={}) {
  const p=await loadProject(workspace),run=p.runs.find(r=>r.request_id===requestId);need(run,'REQUEST','Select an existing frozen request.');
  const requestFile=safeResolve(workspace,'requests/'+requestId.replace(/[^A-Za-z0-9_.-]/g,'_')+'/request.json');await noSymlinkParents(workspace,requestFile);
  if(await exists(requestFile)){const original=await fs.readFile(requestFile,'utf8');need(original===run.request_text,'REQUEST_IDENTITY','The saved original request file changed.');}
  else await atomicWrite(requestFile,run.request_text);
  onPhase('Recovering original native result');let result;
  try{result=await native(python,['lookup','--database',database,'--request-id',requestId]);}
  catch(error){if(!lookupMissing(error))throw error;onPhase('Receiving frozen source into the native target');result=await native(python,['apply','--database',database,'--request',requestFile]);}
  need(result.request_sha256===run.request_sha256,'REQUEST_IDENTITY','The native result refers to another request body.');
  await atomicWrite(path.join(path.dirname(requestFile),'returned.json'),canonicalJSON(result)+'\n');return result;
}
export async function handover(workspace) {
  const p=await loadProject(workspace),members=portableMembers(p),files=await jsonFile(path.join(APPLICATION_ROOT,'FILES.json'));
  for(const file of files.files){safePath(file);const content=await fs.readFile(path.join(APPLICATION_ROOT,file),'utf8');members.push({path:'application/'+file,encoding:'utf8',content,...sha256Utf8(content)});}
  const instructions='# Reopen this complete programme\n\nRun node application/cli.mjs serve --workspace . from this received directory. The application opens project.json with its complete source, mappings, returned records and review decisions. Node.js 20 or later and Python 3.11 or later run the included application and SQLite receiver. All application source files are included. Use Target mapping, then Initialize or inspect SQLite target, to bind a separate receiving database and prepare a new saved request.\n';
  members.push({path:'REOPEN.md',encoding:'utf8',content:instructions,...sha256Utf8(instructions)});
  const duplicates=new Set();for(const member of members){need(!duplicates.has(member.path),'HANDOVER_PATH','The complete handover repeats a file path.',{path:member.path});duplicates.add(member.path);}
  return {schema:'tjlabs.accreditation-handover.v1',project_id:p.project_id,revision:p.revision,created_at:new Date().toISOString(),members,manifest:members.map(({path,encoding,bytes,sha256})=>({path,encoding,bytes,sha256}))};
}
export async function receiveHandover(bundle,directory) {
  need(bundle.schema==='tjlabs.accreditation-handover.v1'&&Array.isArray(bundle.members),'HANDOVER','Select a complete application handover.');
  const root=path.resolve(directory);await fs.mkdir(root,{recursive:true});const used=new Set();
  for(const member of bundle.members) {
    const destination=safeResolve(root,member.path);need(!used.has(member.path),'HANDOVER_PATH','The handover repeats a path.');used.add(member.path);
    const bytes=member.encoding==='base64'?Buffer.from(bytesFromBase64(member.base64)):Buffer.from(member.content,'utf8'),h=sha256Bytes(new Uint8Array(bytes));
    need(h.bytes===member.bytes&&h.sha256===member.sha256,'HANDOVER_IDENTITY','A complete handover member changed.',{path:member.path});
    const listed=bundle.manifest.filter(m=>m.path===member.path);need(listed.length===1&&listed[0].sha256===h.sha256&&listed[0].bytes===h.bytes&&listed[0].encoding===member.encoding,'HANDOVER_MANIFEST','The whole manifest differs from the received member.',{path:member.path});
    await noSymlinkParents(root,destination);need(!await exists(destination),'HANDOVER_EXISTS','Choose a clean destination; a receiving file already exists.',{path:member.path});
  }
  need(bundle.manifest.length===bundle.members.length,'HANDOVER_MANIFEST','Every manifest member must have its complete body.');
  for(const member of bundle.members){const bytes=member.encoding==='base64'?Buffer.from(bytesFromBase64(member.base64)):Buffer.from(member.content,'utf8');await atomicWrite(safeResolve(root,member.path),bytes);}
  const project=await loadProject(root);need(project.project_id===bundle.project_id&&project.revision===bundle.revision,'HANDOVER_PROJECT','The saved project differs from its package identity.');return {directory:root,project:report(project),members:bundle.members.length};
}
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.py':'text/plain; charset=utf-8'};
export async function serve({workspace,port=8116,python='python3',database,maxBodyBytes=256*1024*1024}={}) {
  need(workspace,'WORKSPACE','Choose a workspace directory.');const lock=await acquireWorkspace(workspace),root=lock.root;
  await initializeWorkspace(root);database=database?path.resolve(database):path.join(root,'target.sqlite');
  const token=randomBytes(32).toString('hex'),jobs=new Map(),catalogue=await jsonFile(path.join(APPLICATION_ROOT,'FILES.json')),allowed=new Set(catalogue.files);
  let queue=Promise.resolve(),portNumber=port;
  const exclusive=fn=>{const task=queue.then(fn,fn);queue=task.catch(()=>{});return task;};
  const jsonResponse=(res,status,value)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(canonicalJSON(value)+'\n');};
  const body=async req=>{const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;need(length<=maxBodyBytes,'BODY_SIZE','The complete upload exceeds the configured maximum.');chunks.push(chunk);}return JSON.parse(utf8Text(new Uint8Array(Buffer.concat(chunks)))||'{}');};
  const server=http.createServer(async(req,res)=>{
    try{
      const host=req.headers.host||'',hosts=['127.0.0.1:'+portNumber,'localhost:'+portNumber];
      need(hosts.includes(host),'HOST','Open the application on its loopback address.');
      const url=new URL(req.url,'http://'+host),pathname=url.pathname;
      if(req.headers.origin)need(['http://127.0.0.1:'+portNumber,'http://localhost:'+portNumber].includes(req.headers.origin),'ORIGIN','Use the current application origin.');
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      if(pathname==='/api/session'&&req.method==='GET'){jsonResponse(res,200,{token,project_file:'project.json',runtime:{node:process.versions.node,python},workspace:path.basename(root)});return;}
      if(pathname.startsWith('/api/'))need(req.headers['x-workbench-token']===token,'SESSION','Refresh the application session.');
      if(pathname==='/api/state'&&req.method==='GET'){const p=await loadProject(root);jsonResponse(res,200,{project:p,report:report(p),jobs:[...jobs.values()]});return;}
      if(pathname==='/api/import/preview'&&req.method==='POST'){const input=await body(req),p=await loadProject(root);jsonResponse(res,200,previewImport(p,input));return;}
      if(pathname==='/api/action'&&req.method==='POST'){const input=await body(req),result=await exclusive(()=>saveAction(root,input));jsonResponse(res,200,{project:result.project,detail:result.detail});return;}
      if(pathname==='/api/target/describe'&&req.method==='POST'){
        const input=await body(req),schema=await native(python,['describe','--database',database,'--contract',path.join(APPLICATION_ROOT,'contracts/data-contract.json')]);
        const result=await exclusive(()=>saveAction(root,{type:'bind_target',expected_revision:input.expected_revision,schema}));jsonResponse(res,200,{project:result.project,schema});return;
      }
      if(pathname==='/api/target/extract'&&req.method==='POST'){
        const input=await body(req),p=await loadProject(root),result=await native(python,['extract','--database',database,'--project-id',p.project_id]);
        const run=p.runs.find(r=>r.request_id===input.request_id);need(run,'REQUEST','Select the original receiving request.');
        need(result.status==='EXTRACTED','TARGET_RETURN','The native read must return an actual complete target extract.');
        const saved=await exclusive(async()=>{const current=await loadProject(root);return saveAction(root,{type:'receive_result',expected_revision:current.revision,request_id:run.request_id,result});});
        jsonResponse(res,200,{project:saved.project,result});return;
      }
      if(pathname==='/api/receiving/run'&&req.method==='POST'){
        const input=await body(req);need(![...jobs.values()].some(j=>j.status==='running'),'NATIVE_BUSY','The original native request is still running.');
        const started=await exclusive(()=>saveAction(root,{type:'native_started',expected_revision:input.expected_revision,request_id:input.request_id}));
        const job={request_id:input.request_id,status:'running',phase:'Opening saved request',started_at:new Date().toISOString()};jobs.set(input.request_id,job);
        const operation=(async()=>{try{const result=await runReceiving(root,{requestId:input.request_id,python,database,onPhase:phase=>{job.phase=phase;}});
          await exclusive(async()=>{const p=await loadProject(root);return saveAction(root,{type:'receive_result',expected_revision:p.revision,request_id:input.request_id,result});});job.status='complete';job.phase='Complete returned-record comparison saved';}
          catch(error){job.status='error';job.error={code:error.code||'NATIVE',message:error.message,details:error.details||{}};
            await exclusive(async()=>{const p=await loadProject(root);return saveAction(root,{type:'native_failure',expected_revision:p.revision,request_id:input.request_id,error:job.error});});}
          finally{job.finished_at=new Date().toISOString();}
        })();
        operation.catch(error=>{job.status='error';job.error={code:'SAVE',message:error.message};});
        jsonResponse(res,202,{job,project:started.project});return;
      }
      if(pathname==='/api/document/controls'&&req.method==='POST'){
        const input=await body(req),map=await inspectDocument(root,input.document_key,{python});
        const saved=await exclusive(()=>saveAction(root,{type:'document_controls',expected_revision:input.expected_revision,document_key:input.document_key,map}));
        jsonResponse(res,200,{project:saved.project,map});return;
      }
      if(pathname==='/api/document/fill'&&req.method==='POST'){
        const input=await body(req),p=await loadProject(root);
        need(input.expected_revision===p.revision,'PROJECT_CONFLICT','Refresh the source project before filling this original form.');
        const prepared=prepareFormFill(p,input),filled=await fillDocument(root,prepared,{python});
        const saved=await exclusive(()=>saveAction(root,{type:'document_filled',expected_revision:input.expected_revision,prepared,...filled}));
        jsonResponse(res,200,{project:saved.project,detail:saved.detail});return;
      }
      if(pathname==='/api/project/reopen'&&req.method==='POST'){
        const input=await body(req),imported=reopenProject(input.project);
        const saved=await exclusive(async()=>{const current=await loadProject(root);need(input.expected_revision===current.revision,'PROJECT_CONFLICT','Refresh the current project before reopening the selected file.');
          await atomicWrite(path.join(root,'project-history','before-reopen-'+current.integrity.sha256+'.json'),serializeProject(current));await atomicWrite(path.join(root,'project.json'),serializeProject(imported));return imported;});
        jsonResponse(res,200,{project:saved});return;
      }
      if(pathname==='/api/export/project'&&req.method==='GET'){const p=await loadProject(root);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="accreditation-project.json"','Cache-Control':'no-store'});res.end(serializeProject(p));return;}
      if(pathname==='/api/export/handover'&&req.method==='GET'){const bundle=await handover(root);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="accreditation-handover.json"','Cache-Control':'no-store'});res.end(canonicalJSON(bundle)+'\n');return;}
      if(pathname==='/api/export/source'&&req.method==='GET'){const p=await loadProject(root),file=p.source_files.find(f=>f.id===url.searchParams.get('id'));need(file,'SOURCE','Select a retained complete source file.');res.writeHead(200,{'Content-Type':file.media_type||'application/octet-stream','Content-Disposition':'attachment; filename="'+path.basename(file.path).replace(/["\r\n]/g,'_')+'"'});res.end(Buffer.from(file.content,'utf8'));return;}
      if(pathname==='/api/export/asset'&&req.method==='GET'){const p=await loadProject(root),asset=p.assets.find(a=>a.path===url.searchParams.get('path'));need(asset,'ASSET','Select a retained original asset.');res.writeHead(200,{'Content-Type':asset.media_type||'application/octet-stream','Content-Disposition':'attachment; filename="'+path.basename(asset.path).replace(/["\r\n]/g,'_')+'"'});res.end(Buffer.from(bytesFromBase64(asset.base64)));return;}
      need(req.method==='GET','METHOD','Use a supported application action.');
      const file=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));need(allowed.has(file),'NOT_FOUND','This application file does not exist.');
      const contents=await fs.readFile(path.join(APPLICATION_ROOT,file));res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(contents);
    }catch(error){jsonResponse(res,error.code==='NOT_FOUND'?404:error.code==='PROJECT_CONFLICT'||error.code==='WORKSPACE_BUSY'||error.code==='NATIVE_BUSY'?409:error instanceof SyntaxError?400:422,{error:{code:error.code||'APPLICATION',message:error.message,details:error.details||{}}});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});portNumber=server.address().port;
  let stopping=false;
  const close=async()=>{if(stopping)return;stopping=true;await new Promise(resolve=>server.close(resolve));await queue;while([...jobs.values()].some(j=>j.status==='running'))await new Promise(resolve=>setTimeout(resolve,100));await lock.release();};
  return {server,workspace:root,url:'http://127.0.0.1:'+portNumber,close};
}
