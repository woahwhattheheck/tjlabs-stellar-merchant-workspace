// Exact-original pipeline delivery review. No network or supplier writes.
export function createDeliveryCore(codec) {
  "use strict";
  const fail=m=>{throw new Error(m)}, clone=x=>JSON.parse(JSON.stringify(x));
  const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
  const assert=(v,m)=>{if(!v)fail(m)}, text=(v,m)=>{assert(typeof v==="string",m);return v};
  const canonical=x=>{if(x===null||typeof x!=="object")return JSON.stringify(x);if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}"};
  const hash=x=>codec.sha256(codec.utf8Encode(typeof x==="string"?x:canonical(x)));
  const iso=(x)=>typeof x==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
  const safeId=x=>typeof x==="string"&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(x)&&x!=="."&&x!=="..";
  function pathSafe(p) {return typeof p==="string"&&p.length>0&&p.length<=4096&&!/[\u0000-\u001f\u007f\\:%]/.test(p)&&!p.startsWith("/")&&p.split("/").every(s=>s&&s!=="."&&s!==".."&&!/[. ]$/.test(s)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))}
  function original(name,data) {const b=typeof data==="string"?codec.utf8Encode(data):data;return{name,bytes:b.length,sha256:codec.sha256(b),base64:codec.base64Encode(b)}}
  function verifyOriginal(o) {assert(object(o),"Original must be an object");text(o.name,"Original name missing");const b=codec.base64Decode(text(o.base64,"Original bytes missing"));assert(Number.isSafeInteger(o.bytes)&&o.bytes===b.length&&o.sha256===codec.sha256(b),"Original byte/hash mismatch: "+o.name);return b}
  const parseOriginal=o=>JSON.parse(codec.utf8Decode(verifyOriginal(o)).replace(/^\uFEFF/,""));
  function validateRequest(req,mode) {
    assert(object(req)&&req.type==="pipeline_job","Only pipeline_job is supported");
    assert(object(req.source)&&req.source.type==="huggingface","Commissioned source must be Hugging Face");
    assert(Object.keys(req).every(k=>["type","name","source","robot","deadline","outputs","include_borderline","trim_static","smoothing","callback_url","deliver_to"].includes(k)),"Unsupported request property");
    assert(Object.keys(req.source).every(k=>["type","repo_id","revision","episodes","max_episodes"].includes(k)),"Unsupported source property");
    text(req.source.repo_id,"Source repo_id missing");assert(req.source.repo_id.trim(),"Source repo_id blank");
    assert(typeof req.source.revision==="string"&&req.source.revision.trim(),"Explicit dataset revision is required");
    assert(Array.isArray(req.source.episodes)&&req.source.episodes.length>0&&req.source.episodes.every(n=>Number.isSafeInteger(n)&&n>=0)&&new Set(req.source.episodes).size===req.source.episodes.length,"Explicit unique episode indexes are required");
    assert(["test","live"].includes(mode),"Mode required");
    if(mode==="test")assert(req.source.episodes.length<=10&&(!("max_episodes" in req.source)||req.source.max_episodes===null||(Number.isSafeInteger(req.source.max_episodes)&&req.source.max_episodes>=1&&req.source.max_episodes<=10)),"Test mode permits at most ten episodes");
    assert(req.callback_url==null&&req.deliver_to==null,"Callback and remote delivery configuration are outside this receiver");
    assert(!("connections" in req)&&!("api_key" in req),"Credentials/configuration are not request source");
    if(req.name!==undefined)assert(typeof req.name==="string"&&req.name.length<=200,"Invalid request name");
    if(req.outputs!==undefined)assert(Array.isArray(req.outputs)&&req.outputs.every(x=>["lerobot_v2","manifest","quality_report"].includes(x)),"Unknown requested output");
    return clone(req);
  }
  function create({id,title="Pipeline delivery",mode="test",at,spec}) {
    assert(safeId(id)&&iso(at),"Workspace identity/time invalid");verifyOriginal(spec);
    return{schema:"tjlabs.pipeline-delivery.v1",id,title:text(title,"Title missing"),mode,created_at:at,spec:clone(spec),commands:[],collections:[],reviews:[],history:[]};
  }
  function validate(w) {
    assert(object(w)&&w.schema==="tjlabs.pipeline-delivery.v1"&&safeId(w.id)&&iso(w.created_at)&&["test","live"].includes(w.mode),"Invalid delivery workspace");
    text(w.title,"Invalid title");verifyOriginal(w.spec);
    for(const k of ["commands","collections","reviews","history"])assert(Array.isArray(w[k]),"Missing "+k);
    const ids=new Set();
    for(const q of w.commands) {assert(safeId(q.id)&&!ids.has(q.id)&&iso(q.at),"Invalid/repeated command");ids.add(q.id);validateRequest(q.request,w.mode);assert(q.request_sha256===hash(q.request),"Command request changed");}
    const cs=new Set();
    for(const c of w.collections){assert(safeId(c.id)&&!cs.has(c.id),"Invalid/repeated collection");cs.add(c.id);validateCollection(c,w.mode);}
    for(const r of w.reviews){assert(object(r)&&safeId(r.id)&&cs.has(r.collection_id)&&["noted","accepted","needs-follow-up"].includes(r.status)&&iso(r.at),"Invalid review");for(const k of ["target","basis","reviewer","note"])text(r[k],"Invalid review "+k);const s=inspect(w.collections.find(c=>c.id===r.collection_id));assert(s.targets.some(t=>t.id===r.target&&t.basis===r.basis),"Review evidence does not match retained collection");}
    for(let i=0;i<w.history.length;i++){const h=w.history[i];assert(h.index===i&&h.previous===(i?hash(w.history[i-1]):null)&&typeof h.action==="string"&&iso(h.at),"Invalid operation history");}
    return w;
  }
  function finish(w,action,at,detail) {assert(iso(at),"Operation time invalid");w.history.push({index:w.history.length,previous:w.history.length?hash(w.history[w.history.length-1]):null,action,at,detail:clone(detail)});validate(w);return w}
  function prepare(w,{id,request,at}) {validate(w);assert(!w.commands.some(q=>q.id===id),"Command identity already exists");assert(safeId(id),"Command ID invalid");const n=clone(w);n.commands.push({id,at,request:validateRequest(request,w.mode),request_sha256:hash(request)});return finish(n,"prepare",at,{command_id:id,request_sha256:hash(request)})}
  function validateCollection(c,mode) {
    assert(object(c)&&safeId(c.id)&&iso(c.started_at)&&iso(c.finished_at)&&Date.parse(c.finished_at)>=Date.parse(c.started_at),"Collection identity/time invalid");
    assert(c.mode===mode&&typeof c.job_id==="string"&&c.job_id.length>0&&["api","authored-example","published-source-example"].includes(c.evidence),"Collection mode/job/evidence invalid");
    assert(Array.isArray(c.responses)&&Array.isArray(c.artifacts)&&Array.isArray(c.errors),"Incomplete collection envelope");
    const rids=new Set();for(const r of c.responses){assert(safeId(r.id)&&!rids.has(r.id)&&iso(r.at)&&Number.isInteger(r.status)&&r.status>=100&&r.status<=599,"Response envelope invalid");rids.add(r.id);text(r.kind,"Response kind missing");text(r.url,"Response URL missing");verifyOriginal(r.body);assert(!r.headers||Object.keys(r.headers).every(k=>!/(authorization|api.key|cookie|secret)/i.test(k)),"Sensitive headers cannot be retained");}
    for(const a of c.artifacts){text(a.path,"Artifact path missing");if(a.storage==="external"){assert(object(a.body)&&pathSafe(a.body.name)&&Number.isSafeInteger(a.body.bytes)&&a.body.bytes>=0&&/^[a-f0-9]{64}$/.test(a.body.sha256)&&!("base64" in a.body),"Invalid external artifact identity");assert(a.verification==="stream-sha256"&&typeof a.capture_id==="string","Missing external native verification")}else verifyOriginal(a.body);assert(iso(a.at),"Artifact time invalid");}
    for(const e of c.errors)assert(object(e)&&typeof e.stage==="string"&&typeof e.message==="string","Invalid collection error");
    return c;
  }
  function addCollection(w,c,at) {validate(w);validateCollection(c,w.mode);const old=w.collections.find(x=>x.id===c.id);if(old){assert(hash(old)===hash(c),"Collection identity collision");return clone(w)}const n=clone(w);n.collections.push(clone(c));return finish(n,"capture",at,{collection_id:c.id,sha256:hash(c)})}
  function inspect(c) {
    validateCollection(c,c.mode);
    const findings=[],targets=[],episodes=[],files=[],byKind=Object.create(null),seen=new Set();
    const finding=(kind,key,message,detail)=>{const data={kind,key,message,detail},id="finding:"+hash([kind,key,detail]).slice(0,24);if(!seen.has(id)){seen.add(id);findings.push({...data,id,basis:hash(data)})}};
    for(const e of c.errors)finding("capture-error",e.stage,e.message,e);
    for(const r of c.responses) {
      let data=null;try{data=parseOriginal(r.body)}catch(e){finding("response-format",r.id,"Response is not valid strict UTF-8 JSON",{error:e.message,sha256:r.body.sha256})}
      if(r.complete===false)finding("partial-response",r.id,"Response body is an explicitly incomplete retained prefix",{sha256:r.body.sha256});
      if(r.status<200||r.status>=300)finding("http-status",r.id,"Non-success HTTP response retained",{status:r.status,sha256:r.body.sha256});
      (byKind[r.kind]||(byKind[r.kind]=[])).push({r,data,ok:r.complete!==false&&r.status>=200&&r.status<300&&data!==null});
    }
    const one=(kind)=>{const rows=byKind[kind]||[];if(rows.length!==1)finding("response-count",kind,"Expected one "+kind+" response",{count:rows.length});return rows.length===1&&rows[0].ok?rows[0].data:null};
    const before=one("job_before"),after=one("job_after"),result=one("results");
    for(const [label,j] of [["before",before],["after",after]])if(j){
      if(!["id","type","name","status","stage","failure_reason","source","outputs","counts","progress","eta_seconds","deadline","created_at","updated_at"].every(k=>Object.prototype.hasOwnProperty.call(j,k)))finding("job-format",label,"Required job fields are missing from the retained response",{keys:Object.keys(j)});
      if(j.id!==c.job_id||j.type!=="pipeline_job")finding("job-identity",label,"Job identity/type differs from requested pipeline",{id:j.id,type:j.type});
      if(j.mode!==c.mode||j.test!==(c.mode==="test"))finding("mode",label,"Explicit response mode/test does not match capture",{mode:j.mode??null,test:j.test??null,expected:c.mode});
      if(j.status==="failed")finding("job-failed",label,"Supplier reports failed job",{stage:j.stage,reason:j.failure_reason});
    }
    const stableJob=!!before&&!!after&&hash(before)===hash(after);
    if(before&&after&&!stableJob)finding("changed-job","job","Job changed during sequential capture; this is not an atomic snapshot",{before:hash(before),after:hash(after)});
    let total=null,expected=0,coherent=true;const ids=new Set(),indexes=new Set(),pageOffsets=new Set(),pages=byKind.episode_page||[];
    if(!pages.length){coherent=false;finding("missing-pages","episodes","No episode pages retained",{})}
    for(const {r,data:p,ok} of pages) {
      if(!ok||!object(p)||!Number.isSafeInteger(p.total)||p.total<0||!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>1000||!Number.isSafeInteger(p.offset)||p.offset<0||!Array.isArray(p.episodes)){coherent=false;finding("page-format",r.id,"Episode page has invalid or failed envelope",{sha256:r.body.sha256});continue}
      if(pageOffsets.has(p.offset)){coherent=false;finding("duplicate-page",r.id,"Repeated episode page offset",{offset:p.offset})}pageOffsets.add(p.offset);
      if(total===null)total=p.total;else if(total!==p.total){coherent=false;finding("changed-total",r.id,"Episode total changed while collecting",{first:total,current:p.total})}
      if(p.offset!==expected||p.episodes.length>p.limit||p.offset+p.episodes.length>p.total){coherent=false;finding("page-coverage",r.id,"Page offset, length or extent is inconsistent",{expected,offset:p.offset,length:p.episodes.length,limit:p.limit,total:p.total})}
      expected=p.offset+p.episodes.length;
      for(const e of p.episodes) {
        if(!object(e)||typeof e.id!=="string"||!e.id||!Number.isSafeInteger(e.index)||e.index<0){coherent=false;finding("episode-format",r.id,"Malformed episode retained in original",e);continue}
        if(typeof e.status!=="string"||typeof e.task!=="string"||!("length" in e)||(e.length!==null&&(!Number.isSafeInteger(e.length)||e.length<0))||!("error" in e)||(e.error!==null&&typeof e.error!=="string")){coherent=false;finding("episode-fields",e.id,"Required episode fields are invalid or missing",e)}
        if(ids.has(e.id)||indexes.has(e.index)){coherent=false;finding("duplicate-episode",e.id,"Repeated episode ID or source index",{id:e.id,index:e.index});}
        ids.add(e.id);indexes.add(e.index);episodes.push(clone(e));
        const t={id:"episode:"+e.id,basis:hash(e),kind:"episode",label:"Episode "+e.index,data:clone(e)};targets.push(t);
      }
    }
    if(total!==null&&expected!==total){coherent=false;finding("incomplete-episodes","coverage","Collected extent differs from declared total",{extent:expected,total})}
    if(before&&object(before.counts)&&Number.isSafeInteger(before.counts.total)&&total!==null&&before.counts.total!==total){coherent=false;finding("count-mismatch","job","Job count and episode total differ",{job:before.counts.total,pages:total})}
    if(result) {
      if(result.job_id!==c.job_id||typeof result.ready!=="boolean"||!Array.isArray(result.files)){finding("result-identity","results","Result job/ready/files is malformed or mismatched",{job_id:result.job_id});}
      else {
        if(!result.ready)finding("not-ready","results","Supplier delivery is not ready",{message:result.message,status:result.status});
        const paths=new Map();
        for(const f of result.files){if(!object(f)){finding("file-format","results","Result entry is not an object",f);continue}const valid=pathSafe(f.path)&&Number.isSafeInteger(f.size)&&f.size>=0&&/^[a-f0-9]{64}$/i.test(f.sha256||"")&&typeof f.url==="string"&&/^https:\/\//i.test(f.url)&&iso(f.expires_at);
          if(!valid)finding("file-format",String(f.path),"Result file path/size/hash/HTTPS/expiry is invalid",f);
          const folded=String(f.path).toLowerCase();if(paths.has(folded))finding("duplicate-path",folded,"Duplicate or case-alias delivery path",{first:paths.get(folded),second:f.path});paths.set(folded,f.path);
          const found=c.artifacts.filter(a=>a.path===f.path),matches=found.filter(a=>a.body.bytes===f.size&&a.body.sha256===String(f.sha256).toLowerCase());
          const verified=valid&&matches.some(a=>a.storage!=="external"&&a.complete!==false&&(a.status===undefined||a.status===200)),native_verified=valid&&matches.some(a=>a.storage==="external"&&a.complete!==false&&a.status===200);files.push({...clone(f),verified,native_verified,acquired:found.length,identity:hash([f.path,f.size,f.sha256])});
          if(!verified&&!native_verified)finding("file-unverified",String(f.path),"Declared file has no matching retained bytes",{declared:{size:f.size,sha256:f.sha256},retained:found.map(a=>({bytes:a.body.bytes,sha256:a.body.sha256}))});
          if(native_verified&&!verified)finding("external-original",String(f.path),"Original bytes are retained in the native capture directory, outside this browser file",{native_files:matches.filter(a=>a.storage==="external").map(a=>({capture_id:a.capture_id,relative_path:a.body.name,bytes:a.body.bytes,sha256:a.body.sha256})),instruction:"Run native verify on the complete capture directory before handover; HTML alone does not contain these files."});
          targets.push({id:"file:"+String(f.path),basis:hash([f.path,f.size,f.sha256]),kind:"file",label:String(f.path),data:clone(f)});
        }
      }
    }
    for(const a of c.artifacts)if(!files.some(f=>f.path===a.path))finding("unlisted-artifact",a.path,"Retained bytes are not declared in this result manifest",{sha256:a.body.sha256,bytes:a.body.bytes});
    const duplicates=new Set();for(const t of targets){if(duplicates.has(t.id))finding("ambiguous-target",t.id,"Duplicate review target requires source correction",{id:t.id});duplicates.add(t.id)}
    const unique=targets.filter(t=>targets.filter(x=>x.id===t.id).length===1);
    unique.push(...findings.map(f=>({id:f.id,basis:f.basis,kind:"finding",label:f.message,data:f})));
    return{collection_id:c.id,evidence:c.evidence,mode:c.mode,job_id:c.job_id,before,after,result,episodes,files,findings,targets:unique,coverage:{observed_total:total,collected:episodes.length,coherent,stable_job:stableJob,atomic_snapshot:false},delivery_verified:!!result?.ready&&files.length>0&&files.every(f=>f.verified)&&!findings.some(f=>["duplicate-path","file-format","result-identity"].includes(f.kind))};
  }
  function review(w,{id,collection_id,target,basis,status,reviewer,note,at}) {
    validate(w);assert(!w.reviews.some(r=>r.id===id),"Review identity already exists");const c=w.collections.find(c=>c.id===collection_id);assert(c,"Unknown collection");assert(inspect(c).targets.some(t=>t.id===target&&t.basis===basis),"Review target/basis changed");assert(typeof reviewer==="string"&&reviewer.trim(),"Reviewer required");const n=clone(w);n.reviews.push({id,collection_id,target,basis,status,reviewer,note:text(note,"Note required"),at});return finish(n,"review",at,{id,collection_id,target,basis});
  }
  function compare(a,b) {
    const x=inspect(a),y=inspect(b),out=[];
    const diff=(kind,left,right,key,identity)=>{const lm=new Map(),rm=new Map();for(const z of left){const k=key(z);lm.set(k,lm.has(k)?null:z)}for(const z of right){const k=key(z);rm.set(k,rm.has(k)?null:z)}for(const k of new Set([...lm.keys(),...rm.keys()])){const l=lm.get(k),r=rm.get(k);if(l===null||r===null)out.push({kind,key:k,change:"ambiguous duplicate",before:l,after:r});else if(!l||!r||identity(l)!==identity(r))out.push({kind,key:k,change:!l?"newly observed":!r?"not observed in successor":"changed",before:l??null,after:r??null});}};
    diff("episode",x.episodes,y.episodes,e=>e.id,hash);diff("file",x.files,y.files,f=>f.path,f=>f.identity);
    return{before:a.id,after:b.id,same_job:a.job_id===b.job_id&&a.mode===b.mode,coverage_before:x.coverage,coverage_after:y.coverage,changes:out,interpretation:"Missing observations are not deletions. Sequential pages are not atomic; compare retained coverage and job observations before deciding."};
  }
  const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const csv=rows=>rows.map(r=>r.map(x=>{const v=String(x??""),safe=typeof x==="string"&&/^[\s\u0000-\u0020]*[=+@-]/.test(v)?"'"+v:v;return '"'+safe.replace(/"/g,'""')+'"';}).join(",")).join("\r\n")+"\r\n";
  function report(w,collection_id) {validate(w);const c=w.collections.find(x=>x.id===collection_id);assert(c,"Choose a collection");const s=inspect(c),rs=w.reviews.filter(r=>r.collection_id===c.id);return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Pipeline delivery review</title><style>body{font:16px system-ui;max-width:1100px;margin:2rem auto;padding:1rem;color:#222}table{border-collapse:collapse;width:100%;margin:1rem 0}td,th{padding:.5rem;border:1px solid #bcc8d4;text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1,h2{color:#333}@media screen and (max-width:650px){table{display:block;overflow:auto}tbody{display:table;min-width:680px;width:100%}th{white-space:nowrap}}@media print{body{margin:0;max-width:none}}</style><h1>'+esc(w.title)+'</h1><p>'+esc(c.evidence)+' · '+esc(c.mode)+' · '+esc(c.job_id)+' · '+esc(c.id)+'</p><p>Collection '+esc(c.started_at)+' to '+esc(c.finished_at)+'. No atomic server snapshot is asserted. Local review does not rewrite supplier decisions.</p><h2>Coverage</h2><pre>'+esc(JSON.stringify(s.coverage,null,2))+'</pre><p>All declared delivery files retained and verified: '+s.delivery_verified+'</p><h2>Episodes</h2><table tabindex="0" aria-label="Episodes"><tr><th>ID/index</th><th>Status/decision</th><th>Score</th><th>Task/error</th></tr>'+s.episodes.map(e=>'<tr><td>'+esc(e.id)+' / '+esc(e.index)+'</td><td>'+esc(e.status)+' / '+esc(e.decision??"unanswered")+'</td><td>'+esc(e.score??"unanswered")+'</td><td>'+esc(e.task)+'<br>'+esc(e.error)+'</td></tr>').join("")+'</table><h2>Files</h2><table tabindex="0" aria-label="Files"><tr><th>Path</th><th>Bytes/SHA256</th><th>Retained</th></tr>'+s.files.map(f=>'<tr><td>'+esc(f.path)+'</td><td>'+esc(f.size)+'<br>'+esc(f.sha256)+'</td><td>'+f.verified+'</td></tr>').join("")+'</table><h2>Attention</h2>'+s.findings.map(f=>'<section><h3>'+esc(f.message)+'</h3><pre>'+esc(JSON.stringify(f.detail,null,2))+'</pre></section>').join("")+'<h2>Local review history</h2><pre>'+esc(JSON.stringify(rs,null,2))+'</pre><h2>Original response inventory</h2><pre>'+esc(JSON.stringify(c.responses.map(r=>({id:r.id,kind:r.kind,status:r.status,at:r.at,body:r.body.name,bytes:r.body.bytes,sha256:r.body.sha256})),null,2))+'</pre></html>'}
  function episodeCSV(w,id){validate(w);const s=inspect(w.collections.find(c=>c.id===id));return csv([["collection_id","job_id","episode_id","source_index","status","supplier_decision","score","task","error"],...s.episodes.map(e=>[id,s.job_id,e.id,e.index,e.status,e.decision,e.score,e.task,e.error])])}
  return{canonical,hash,clone,original,verifyOriginal,parseOriginal,safeId,pathSafe,validateRequest,create,validate,prepare,validateCollection,addCollection,inspect,review,compare,report,episodeCSV,esc,csv};
}
