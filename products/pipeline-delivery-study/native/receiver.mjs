#!/usr/bin/env node
// Node 20+. Receiver never dispatches a service request merely by opening a working file.
import * as fs from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";
import {createHash,randomUUID} from "node:crypto";
import {pathToFileURL,fileURLToPath} from "node:url";
import {createArchiveCodec} from "../vendor/archive-codec.mjs";
import {createDeliveryCore} from "../src/delivery-core.mjs";
const codec=createArchiveCodec(), core=createDeliveryCore(codec), API="https://api.annoroid.com";
const sha=b=>createHash("sha256").update(b).digest("hex"), now=()=>new Date().toISOString();
const die=m=>{throw new Error(m)}, clone=x=>JSON.parse(JSON.stringify(x));
const json=b=>JSON.parse(codec.utf8Decode(b).replace(/^\uFEFF/,""));
async function syncDir(dir){if(process.platform==="win32")return;const h=await fs.open(dir,"r");try{await h.sync()}finally{await h.close()}}
async function exclusive(file,bytes) {
  const b=typeof bytes==="string"?Buffer.from(bytes,"utf8"):bytes, parent=path.dirname(file);
  await fs.mkdir(parent,{recursive:true});const temp=path.join(parent,"."+path.basename(file)+"."+randomUUID()+".tmp");
  const h=await fs.open(temp,"wx",0o600);try{await h.writeFile(b);await h.sync()}finally{await h.close()}
  try{await fs.link(temp,file);await syncDir(parent)}
  catch(e){if(e.code!=="EEXIST")throw e;const old=await fs.readFile(file);if(!old.equals(b))die("Existing immutable file differs: "+file)}
  finally{await fs.unlink(temp).catch(()=>{})}
  return{path:file,bytes:b.length,sha256:sha(b)};
}
async function writeJSON(file,value){return exclusive(file,JSON.stringify(value,null,2)+"\n")}
async function readJSON(file){return json(await fs.readFile(file))}
async function realRoot(dir){const p=await fs.realpath(dir),s=await fs.lstat(p);if(!s.isDirectory())die("Operation path must be a directory");return p}
async function makeRoot(dir){await fs.mkdir(dir,{recursive:false,mode:0o700});return realRoot(dir)}
function keyMode(key){if(/^ann_test_/.test(key))return"test";if(/^(ann_live_|ak_)/.test(key))return"live";die("Unrecognized key prefix")}
function auth(mode){const k=process.env.ANNOROID_API_KEY;if(!k)die("Set ANNOROID_API_KEY in this process environment");if(keyMode(k)!==mode)die("API-key mode does not match selected workspace");return k}
function positive(value,name,fallback){if(value===undefined)return fallback;const n=Number(value);if(!Number.isSafeInteger(n)||n<1)die("Invalid "+name);return n}
function publicAddress(a) {
  if(net.isIP(a)===4){const p=a.split(".").map(Number);return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===198&&(p[1]===18||p[1]===19))}
  if(net.isIP(a)===6){const x=a.toLowerCase();return !(x==="::"||x==="::1"||x.startsWith("::ffff:")||/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x))}
  return false;
}
async function pinnedPublic(url) {
  const u=new URL(url);if(u.protocol!=="https:"||u.username||u.password)die("Delivery requires credential-free HTTPS URL");
  const host=u.hostname.replace(/^\[|\]$/g,"");const addresses=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await dns.lookup(host,{all:true});
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))die("Delivery hostname resolves to a non-public address");
  return{u,address:addresses[0]};
}
async function download(url,target,{maxBytes,timeoutMs}) {
  let current=url;
  for(let hop=0;hop<6;hop++) {
    const {u,address}=await pinnedPublic(current);
    const res=await new Promise((resolve,reject)=>{const req=https.get(u,{headers:{"Accept":"*/*"},family:address.family,autoSelectFamily:false,lookup:(_h,opts,cb)=>opts?.all?cb(null,[address]):cb(null,address.address,address.family),timeout:timeoutMs},resolve);req.on("error",reject);req.on("timeout",()=>req.destroy(new Error("Delivery request timed out")))});
    if([301,302,303,307,308].includes(res.statusCode)){const location=res.headers.location;res.resume();if(!location)die("Redirect has no location");current=new URL(location,u).href;continue}
    const h=await fs.open(target,"wx",0o600),digest=createHash("sha256");let bytes=0,complete=false,error=null;
    try{for await(const chunk of res){bytes+=chunk.length;digest.update(chunk);await h.writeFile(chunk);if(bytes>maxBytes){res.destroy();throw new Error("Delivery exceeds selected max-file-bytes; partial file retained")}}complete=true}
    catch(e){error=e.message}finally{await h.sync();await h.close()}
    return{status:res.statusCode,bytes,sha256:digest.digest("hex"),complete,error,final_url:current,headers:{"content-type":String(res.headers["content-type"]||"")}};
  }
  die("Too many delivery redirects");
}
export async function openOperation(dir) {
  const root=await realRoot(dir),o=await readJSON(path.join(root,"operation.json"));core.validate(o.workspace);
  if(o.schema!=="tjlabs.pipeline-native.v1")die("Unrecognized native operation");return{...o,root};
}
function modeResponse(data,mode){if(data.mode!==mode||data.test!==(mode==="test"))die("Response lacks matching explicit mode/test flag")}
function matchJob(data,request,mode) {
  modeResponse(data,mode);if(data.type!=="pipeline_job"||typeof data.id!=="string"||!data.id)die("Not a pipeline-job response");
  const actual=data.source,wanted=request.source;
  if(!actual||actual.type!=="huggingface"||actual.repo_id!==wanted.repo_id||actual.revision!==wanted.revision)die("Remote source/revision differs from prepared request");
  if(!Array.isArray(actual.episodes)||core.hash([...actual.episodes].sort((a,b)=>a-b))!==core.hash([...wanted.episodes].sort((a,b)=>a-b)))die("Remote explicit episode selection differs");
  return data.id;
}
function client(mode,settings={}) {
  const key=auth(mode),maxBytes=positive(settings.maxResponseBytes,"max-response-bytes",64*1024*1024),timeoutMs=positive(settings.timeoutMs,"timeout-ms",30000);
  let last=0;
  return async function request(route,method="GET",body) {
    if(!route.startsWith("/v1/jobs")||route.includes("..")||route.includes("#"))die("Unsupported API route");
    const delay=(mode==="test"?2100:550)-(Date.now()-last);if(delay>0)await new Promise(r=>setTimeout(r,delay));
    last=Date.now();const at=now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const res=await fetch(API+route,{method,headers:{Authorization:"Bearer "+key,Accept:"application/json",...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:body,redirect:"manual",signal:controller.signal});
      const chunks=[];let length=0,error=null;try{for await(const chunk of res.body){length+=chunk.length;chunks.push(Buffer.from(chunk));if(length>maxBytes){controller.abort();throw new Error("API response exceeds selected max-response-bytes; retained prefix is incomplete")}}}catch(e){error=e.message}
      const raw=Buffer.concat(chunks);return{at,status:res.status,complete:error===null,error,url:API+route,headers:{"content-type":res.headers.get("content-type")||"","retry-after":res.headers.get("retry-after")||""},raw};
    }finally{clearTimeout(timer)}
  };
}
export async function initialize(dir,requestFile,{mode="test",title="Pipeline delivery",specFile=new URL("../source/openapi.json",import.meta.url)}={}) {
  if(!["test","live"].includes(mode))die("Select test or live mode");
  const raw=await fs.readFile(requestFile),request=json(raw);core.validateRequest(request,mode);
  const root=await makeRoot(dir),at=now(),command_id="command-"+randomUUID();
  let workspace=core.create({id:"operation-"+randomUUID(),title,mode,at,spec:core.original("openapi.json",await fs.readFile(specFile))});
  workspace=core.prepare(workspace,{id:command_id,request,at});
  const o={schema:"tjlabs.pipeline-native.v1",workspace,session:{},request_original:core.original(path.basename(requestFile),raw),command_id};
  await writeJSON(path.join(root,"operation.json"),o);await exclusive(path.join(root,"request.original.json"),raw);
  return{root,operation_id:workspace.id,command_id,request_sha256:core.hash(request),mode,dispatched:false};
}
async function command(o,id){if(!core.safeId(id))die("Invalid command ID");const q=o.workspace.commands.find(q=>q.id===id);if(!q)die("Unknown original command");const d=path.join(o.root,"commands",id);await fs.mkdir(d,{recursive:true});await writeJSON(path.join(d,"intent.json"),q);return{q,d}}
export async function createJob(dir,id,{executeTest=false,executeLive=false,...settings}={}) {
  const o=await openOperation(dir);if(o.workspace.mode==="test"?!executeTest:!executeLive)die("Explicit --execute-test or --execute-live is required");
  const {q,d}=await command(o,id);
  try{return{reconciled:true,binding:await readJSON(path.join(d,"binding.json"))}}catch(e){if(e.code!=="ENOENT")throw e}
  // Admission marker is durable before POST. A surviving marker is never interpreted as permission to retry.
  try{await fs.stat(path.join(d,"attempt.json"));die("Original attempt exists without binding. Inspect retained response or use explicit bind; POST will not be repeated.")}
  catch(e){if(e.code!=="ENOENT")throw e}
  const request=client(o.workspace.mode,settings);await writeJSON(path.join(d,"attempt.json"),{at:now(),command_id:id,method:"POST",url:API+"/v1/jobs",request_sha256:q.request_sha256,admission_nonce:randomUUID(),body:core.canonical(q.request)});
  let res;try{res=await request("/v1/jobs","POST",core.canonical(q.request))}
  catch(e){await writeJSON(path.join(d,"uncertain.json"),{at:now(),message:e.message,request_sha256:q.request_sha256});throw new Error("Create outcome uncertain. Original command retained; do not repeat. "+e.message)}
  await exclusive(path.join(d,"response.body"),res.raw);await writeJSON(path.join(d,"response.json"),{...res,raw:undefined,body:core.original("response.body",res.raw)});
  if(!res.complete)die("Create response incomplete; retained original attempt must be reconciled without replay. "+res.error);
  if(res.status!==201)die("Create returned HTTP "+res.status+". Response retained; no automatic retry.");
  const data=json(res.raw),job_id=matchJob(data,q.request,o.workspace.mode),binding={command_id:id,job_id,mode:o.workspace.mode,at:now(),reason:"Exact successful create response",response_sha256:sha(res.raw),request_sha256:q.request_sha256};
  await writeJSON(path.join(d,"binding.json"),binding);return binding;
}
export async function bindJob(dir,id,job_id,reason,settings={}) {
  const o=await openOperation(dir),{q,d}=await command(o,id);if(!reason?.trim())die("Reconciliation reason required");
  if(!core.safeId(job_id))die("Invalid job ID");const get=client(o.workspace.mode,settings),res=await get("/v1/jobs/"+encodeURIComponent(job_id));
  const evidence=path.join(d,"reconciliation-"+randomUUID());await fs.mkdir(evidence);await exclusive(path.join(evidence,"job.body"),res.raw);await writeJSON(path.join(evidence,"observation.json"),{at:res.at,status:res.status,url:res.url,headers:res.headers,body:core.original("job.body",res.raw),reason});
  if(!res.complete||res.status!==200)die("Reconciliation lookup incomplete/failed; original response retained");
  if(matchJob(json(res.raw),q.request,o.workspace.mode)!==job_id)die("Reconciliation returned a different job identity");
  const binding={command_id:id,job_id,mode:o.workspace.mode,at:now(),reason,response_sha256:sha(res.raw),request_sha256:q.request_sha256};
  // Existing different binding remains intact; changing a binding is not a recovery action.
  await writeJSON(path.join(d,"binding.json"),binding);return binding;
}
export async function listJobs(dir,settings={}) {
  const o=await openOperation(dir),get=client(o.workspace.mode,settings),res=await get("/v1/jobs?limit=200"),id="listing-"+randomUUID();
  const saved=path.join(o.root,"listings",id);await fs.mkdir(saved,{recursive:true});await exclusive(path.join(saved,"response.body"),res.raw);
  const info={id,at:res.at,status:res.status,url:res.url,body:core.original("response.body",res.raw),exhaustive:false,note:"The public endpoint has no cursor. Absence is not proof that a prior create failed."};await writeJSON(path.join(saved,"listing.json"),info);return info;
}
export async function captureJob(dir,id,{downloadFiles=false,maxFileBytes=1024*1024*1024,embedBytes=8*1024*1024,pageLimit=100,...settings}={}) {
  const o=await openOperation(dir),{q,d}=await command(o,id),binding=await readJSON(path.join(d,"binding.json"));
  if(binding.command_id!==id||binding.request_sha256!==q.request_sha256||binding.mode!==o.workspace.mode||!core.safeId(binding.job_id))die("Binding does not match original command");
  const get=client(o.workspace.mode,settings),limit=positive(pageLimit,"page-limit",100);if(limit>1000)die("page-limit must be at most1000");
  const maxBytes=positive(maxFileBytes,"max-file-bytes",1024*1024*1024),embedBudget=positive(embedBytes,"embed-bytes",8*1024*1024);if(embedBudget>64*1024*1024)die("Embedded files budget is at most64MiB; larger originals stay in the native directory");let embedded=0;
  const root=path.join(o.root,"captures","capture-"+randomUUID());await fs.mkdir(root,{recursive:true});
  const c={id:path.basename(root),mode:o.workspace.mode,job_id:binding.job_id,evidence:"api",started_at:now(),finished_at:now(),responses:[],artifacts:[],errors:[],command_id:id,request_sha256:q.request_sha256};
  let sequence=0;
  async function checkpoint(){c.finished_at=now();await writeJSON(path.join(root,"snapshots",String(sequence++).padStart(6,"0")+".json"),c)}
  async function observe(kind,route) {
    try{const res=await get(route),rid=kind+"-"+String(c.responses.length).padStart(5,"0"),name="responses/"+rid+".body";await exclusive(path.join(root,name),res.raw);const r={id:rid,kind,at:res.at,status:res.status,complete:res.complete,url:res.url,headers:res.headers,body:core.original(name,res.raw)};c.responses.push(r);await checkpoint();if(!res.complete)throw new Error("Incomplete response: "+res.error);if(res.status!==200)throw new Error("HTTP "+res.status);return json(res.raw)}
    catch(e){c.errors.push({stage:kind,message:e.message,at:now()});await checkpoint();return null}
  }
  const base="/v1/jobs/"+encodeURIComponent(binding.job_id);await checkpoint();
  const before=await observe("job_before",base);
  if(before){try{if(matchJob(before,q.request,o.workspace.mode)!==binding.job_id)die("Capture returned a different job identity")}catch(e){c.errors.push({stage:"job-identity",message:e.message,at:now()});await checkpoint()}}
  let offset=0;const pageOffsets=new Set();
  while(true) {
    if(pageOffsets.has(offset)){c.errors.push({stage:"episodes",message:"Repeated offset; stopped",at:now()});break}pageOffsets.add(offset);
    const p=await observe("episode_page",base+"/episodes?limit="+limit+"&offset="+offset);
    if(!p||!Number.isSafeInteger(p.total)||p.total<0||!Number.isSafeInteger(p.offset)||p.offset!==offset||!Array.isArray(p.episodes)||!Number.isSafeInteger(p.limit)||p.limit!==limit){c.errors.push({stage:"episodes",message:"Malformed page; originals retained and coverage incomplete",at:now()});break}
    if(p.episodes.length>limit||offset+p.episodes.length>p.total){c.errors.push({stage:"episodes",message:"Page length exceeds declared extent",at:now()});break}
    offset+=p.episodes.length;if(offset>=p.total)break;if(!p.episodes.length){c.errors.push({stage:"episodes",message:"Empty page before total; stopped",at:now()});break}
  }
  const results=await observe("results",base+"/results");
  if(downloadFiles&&results&&results.job_id===binding.job_id&&Array.isArray(results.files)) {
    const names=new Set();
    for(const f of results.files) {
      try{
        if(!core.pathSafe(f.path)||!Number.isSafeInteger(f.size)||f.size<0||!/^[a-f0-9]{64}$/i.test(f.sha256||""))throw new Error("Invalid file descriptor");
        const folded=f.path.toLowerCase();if(names.has(folded))throw new Error("Duplicate/case-alias delivery path");names.add(folded);
        if(f.size>maxBytes)throw new Error("Declared file exceeds selected max-file-bytes");
        const physical="artifacts/"+core.hash([f.path,f.size,f.sha256])+".body",target=path.join(root,physical);await fs.mkdir(path.dirname(target),{recursive:true});
        const got=await download(f.url,target,{maxBytes,timeoutMs:positive(settings.timeoutMs,"timeout-ms",30000)});
        let body,storage;if(got.bytes+embedded<=embedBudget){body=core.original(physical,await fs.readFile(target));embedded+=got.bytes;storage="embedded"}else{body={name:physical,bytes:got.bytes,sha256:got.sha256};storage="external"}
        c.artifacts.push({path:f.path,at:now(),status:got.status,complete:got.complete,error:got.error,final_url:got.final_url,body,storage,verification:"stream-sha256",capture_id:c.id});
        if(!got.complete||got.status!==200||got.bytes!==f.size||got.sha256!==f.sha256.toLowerCase())throw new Error("Downloaded HTTP status/size/SHA256 differs from declaration");
      }catch(e){c.errors.push({stage:"download:"+String(f.path),message:e.message,at:now()})}
      await checkpoint();
    }
  }
  await observe("job_after",base);c.finished_at=now();await checkpoint();
  const workspace=core.addCollection(o.workspace,c,now()),working={schema:"tjlabs.pipeline-desk.v1",workspace,session:clone(o.session||{})};
  working.session.collection_id=c.id;
  await writeJSON(path.join(root,"collection.json"),c);await writeJSON(path.join(root,"working.json"),working);
  await exclusive(path.join(root,"report.html"),core.report(workspace,c.id));await exclusive(path.join(root,"episodes.csv"),core.episodeCSV(workspace,c.id));
  const assessment=core.inspect(c);return{directory:root,collection_id:c.id,coverage:assessment.coverage,delivery_verified:assessment.delivery_verified,findings:assessment.findings.length,working_file:path.join(root,"working.json")};
}
export async function verifyCapture(dir,{writeReceipt=true,collection:selectedCollection}={}) {
  const root=await realRoot(dir),collection=selectedCollection||await readJSON(path.join(root,"collection.json"));core.validateCollection(collection,collection.mode);const verified=[];
  for(const a of collection.artifacts) {
    if(!core.pathSafe(a.body.name))die("Unsafe native original locator");
    const p=path.join(root,...a.body.name.split("/")),real=await fs.realpath(p);if(real!==root&&!real.startsWith(root+path.sep))die("Original resolves outside capture");
    const stat=await fs.lstat(p);if(!stat.isFile()||stat.isSymbolicLink())die("Original must be a regular retained file");
    const h=await fs.open(p,"r"),digest=createHash("sha256");let bytes=0;
    try{for await(const chunk of h.createReadStream({autoClose:false})){bytes+=chunk.length;digest.update(chunk)}}finally{await h.close()}
    const actual=digest.digest("hex");if(bytes!==a.body.bytes||actual!==a.body.sha256)die("Retained original differs: "+a.body.name);
    verified.push({path:a.path,relative_path:a.body.name,bytes,sha256:actual});
  }
  for(const r of collection.responses){const p=path.join(root,...r.body.name.split("/"));if(!core.pathSafe(r.body.name))die("Unsafe response locator");const real=await fs.realpath(p);if(!real.startsWith(root+path.sep))die("Response outside capture");const raw=await fs.readFile(p);if(raw.length!==r.body.bytes||sha(raw)!==r.body.sha256)die("Retained response differs: "+r.id)}
  const result={schema:"tjlabs.pipeline-native-verification.v1",capture_id:collection.id,at:now(),verified,collection_sha256:core.hash(collection),assessment:core.inspect(collection).coverage};
  if(writeReceipt)await writeJSON(path.join(root,"verification-"+randomUUID()+".json"),result);return result;
}
export async function reopenSnapshot(snapshotFile,workingFile,outdir) {
  const c=await readJSON(snapshotFile),raw=await fs.readFile(workingFile),loaded=json(raw),workspace=loaded.workspace||loaded;
  core.validate(workspace);core.validateCollection(c,workspace.mode);if(c.artifacts.some(a=>a.storage==="external")){const captureRoot=path.basename(path.dirname(snapshotFile))==="snapshots"?path.dirname(path.dirname(snapshotFile)):path.dirname(snapshotFile);await verifyCapture(captureRoot,{collection:c})}const root=await makeRoot(outdir);
  const w=core.addCollection(workspace,c,now()),out=loaded.schema==="tjlabs.pipeline-desk.v1"?{...clone(loaded),workspace:w}:{schema:"tjlabs.pipeline-desk.v1",workspace:w,session:{}};
  out.session={...(out.session||{}),collection_id:c.id};await exclusive(path.join(root,"incoming-working.original.json"),raw);await exclusive(path.join(root,"snapshot.original.json"),await fs.readFile(snapshotFile));
  await writeJSON(path.join(root,"working.json"),out);await exclusive(path.join(root,"report.html"),core.report(w,c.id));return{directory:root,collection_id:c.id,assessment:core.inspect(c).coverage};
}
export async function continueWorking(workingFile,collectionFile,outdir) {
  // An operator's returned full working wrapper is never replaced with a native-only workspace.
  return reopenSnapshot(collectionFile,workingFile,outdir);
}
export async function handover(dir,workingFile,outdir) {
  const o=await openOperation(dir),raw=await fs.readFile(workingFile),working=json(raw);core.validate(working.workspace);
  if(working.schema!=="tjlabs.pipeline-desk.v1"||working.workspace.id!==o.workspace.id)die("Working file belongs to a different native operation");
  for(const q of o.workspace.commands){const kept=working.workspace.commands.find(x=>x.id===q.id);if(!kept||core.hash(kept)!==core.hash(q))die("Working file lost or changed an original command")}
  for(const c of working.workspace.collections){const source=path.join(o.root,"captures",c.id);const stored=await readJSON(path.join(source,"collection.json"));if(core.hash(stored)!==core.hash(c))die("Working collection differs from native source");await verifyCapture(source)}
  const parent=await fs.realpath(path.dirname(path.resolve(outdir))),resolved=path.join(parent,path.basename(outdir));if(resolved===o.root||resolved.startsWith(o.root+path.sep))die("Handover must be outside the original operation directory");
  const root=await makeRoot(resolved),members=[];
  async function copyTree(source,target,rel="") {
    await fs.mkdir(target,{recursive:true});for(const entry of (await fs.readdir(source,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const r=rel?rel+"/"+entry.name:entry.name;if(!core.pathSafe(r))die("Unsafe retained path: "+r);const from=path.join(source,entry.name),to=path.join(target,entry.name);
      if(entry.isSymbolicLink())die("Native handover refuses symlink: "+r);
      if(entry.isDirectory())await copyTree(from,to,r);
      else if(entry.isFile()) {await fs.copyFile(from,to,fs.constants.COPYFILE_EXCL);const h=await fs.open(to,"r+"),digest=createHash("sha256");let bytes=0;try{for await(const chunk of h.createReadStream({autoClose:false})){bytes+=chunk.length;digest.update(chunk)}await h.sync()}finally{await h.close()}members.push({path:"native/"+r,bytes,sha256:digest.digest("hex")})}
      else die("Unsupported retained filesystem object: "+r);
    }
  }
  await copyTree(o.root,path.join(root,"native"));
  const sourceRoot=fileURLToPath(new URL("../",import.meta.url)),sourceManifestRaw=await fs.readFile(path.join(sourceRoot,"MANIFEST.json")),sourceManifest=json(sourceManifestRaw);
  if(!Array.isArray(sourceManifest.files))die("Installed product source manifest missing");
  for(const m of sourceManifest.files){if(!core.pathSafe(m.path))die("Unsafe product source path");const source=await fs.readFile(path.join(sourceRoot,...m.path.split("/")));if(source.length!==m.bytes||sha(source)!==m.sha256)die("Installed source differs from source manifest: "+m.path);await exclusive(path.join(root,"tool",...m.path.split("/")),source);members.push({path:"tool/"+m.path,bytes:m.bytes,sha256:m.sha256})}
  await exclusive(path.join(root,"tool","MANIFEST.json"),sourceManifestRaw);members.push({path:"tool/MANIFEST.json",bytes:sourceManifestRaw.length,sha256:sha(sourceManifestRaw)});
  for(const c of working.workspace.collections)await verifyCapture(path.join(root,"native","captures",c.id),{writeReceipt:false});
  await exclusive(path.join(root,"working.json"),raw);
  const report=working.session?.collection_id||working.workspace.collections.at(-1)?.id;
  if(report)await exclusive(path.join(root,"report.html"),core.report(working.workspace,report));
  members.push({path:"working.json",bytes:raw.length,sha256:sha(raw)});
  await writeJSON(path.join(root,"HANDOVER_MANIFEST.json"),{schema:"tjlabs.pipeline-handover.v1",operation_id:o.workspace.id,at:now(),members,external_originals:"native/captures/{capture_id}/{relative_path}; verify each complete capture with receiver verify"});
  await exclusive(path.join(root,"OPEN.md"),"# Complete pipeline delivery handover\n\nOpen working.json in the offline desk. Keep the entire native directory: large delivery bytes are there, not inside HTML. Run node tool/native/receiver.mjs verify /absolute/path/to/handover/native/captures/CAPTURE_ID from this handover directory for each referenced capture. All original operation commands, response bodies and successive snapshots remain under native. The working file retains the returned operator notes and unfinished forms exactly.\n");
  await syncDir(root);return{directory:root,operation_id:o.workspace.id,members:members.length};
}
async function main(args) {
  const [action,dir,id,arg,...tail]=args,flags=[arg,...tail].filter(x=>typeof x==="string"&&x.startsWith("--"));
  const option=(key)=>flags.find(x=>x.startsWith("--"+key+"="))?.split("=").slice(1).join("=");
  const settings={timeoutMs:option("timeout-ms"),maxResponseBytes:option("max-response-bytes")};
  let result;
  if(action==="init")result=await initialize(dir,id,{mode:arg||"test"});
  else if(action==="create")result=await createJob(dir,id,{...settings,executeTest:flags.includes("--execute-test"),executeLive:flags.includes("--execute-live")});
  else if(action==="bind")result=await bindJob(dir,id,arg,tail.filter(x=>!x.startsWith("--")).join(" "),settings);
  else if(action==="verify")result=await verifyCapture(dir);
  else if(action==="list")result=await listJobs(dir,settings);
  else if(action==="capture")result=await captureJob(dir,id,{...settings,downloadFiles:flags.includes("--download"),maxFileBytes:option("max-file-bytes"),embedBytes:option("embed-bytes"),pageLimit:option("page-limit")});
  else if(action==="handover")result=await handover(dir,id,arg);
  else if(action==="continue")result=await continueWorking(dir,id,arg);
  else if(action==="recover")result=await reopenSnapshot(dir,id,arg);
  else die("Usage: init DIR REQUEST.json test | create DIR COMMAND --execute-test | list DIR | bind DIR COMMAND JOB REASON | capture DIR COMMAND --download | continue WORKING COLLECTION NEWDIR | recover SNAPSHOT WORKING NEWDIR | verify CAPTUREDIR | handover OPERATIONDIR WORKING NEWDIR");
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{process.stderr.write(e.message+"\n");process.exitCode=1});
