'use strict';
module.exports=async function browserCourse(bundle,options={}){
const files=Object.fromEntries(bundle.map(x=>[x.path,x.content])),cache={};
function req(p){if(cache[p])return cache[p];const m={exports:{}};const dir=p.split("/").slice(0,-1);Function("module","exports","require",files[p])(m,m.exports,n=>{const a=[];for(const v of [...dir,...n.split("/")])if(v==="..")a.pop();else if(v&&v!==".")a.push(v);return req(a.join("/"));});return cache[p]=m.exports;}
const Core=req("core.cjs"),M=req("session.cjs"),SHA=req("sha256.cjs"),ZIP=req("zip.cjs"),course=options.study||JSON.parse(files["examples/complete.study.json"]),CSV=req("csv.cjs");
const records=new Map(),shared={tail:Promise.resolve()},checks=[];
function check(v,l){if(!v)throw Error(l);checks.push(l);if(options.onProgress)options.onProgress(l,checks.length);}
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function database(){return{objectStoreNames:{contains:()=>true},transaction(){let aborted=false;const tx={error:null,oncomplete:null,onerror:null,onabort:null,abort(){aborted=true;if(tx.onabort)tx.onabort();},objectStore(){return{get(key){const q={};shared.tail=shared.tail.then(async()=>{if(aborted)return;q.result=clone(records.get(key));if(q.onsuccess)q.onsuccess();await Promise.resolve();if(!aborted&&tx.oncomplete)tx.oncomplete();});return q;},put(v){records.set(v.key,clone(v));}};}};return tx;}};}
const idb={open(){const q={};Promise.resolve().then(()=>{q.result=database();q.onsuccess?.();});return q;}};
async function boot(){
 const handlers={},wins={},nodes={},downloads=[],timers=new Map();let tid=0;
 const element=id=>nodes[id]||(nodes[id]={id,innerHTML:"",textContent:"",disabled:false,value:"",setAttribute(){},querySelectorAll(){return[];}});
 const document={getElementById:element,querySelectorAll:()=>[],addEventListener:(k,fn)=>handlers[k]=fn,body:{appendChild(){}},createElement(){return{click(){downloads.push({name:this.download,url:this.href});},remove(){}};}};
 const window={ProcurementCore:Core,ProcurementSession:M,StudySHA:SHA,ProcurementZIP:ZIP,ProcurementCSV:CSV,PROCUREMENT_COURSES:{complete:course},PROCUREMENT_SOURCE_FILES:bundle,addEventListener:(k,fn)=>wins[k]=fn};
 const timersApi=(fn)=>{const n=++tid;timers.set(n,fn);return n;},clear=n=>timers.delete(n);
 class File{constructor(parts,name,options={}){this.bytes=ZIP.utf(parts.join(""));this.name=name;this.type=options.type||"";this.size=this.bytes.length;}async arrayBuffer(){return this.bytes.buffer;}}
 class Decoder{decode(buffer){const bytes=new Uint8Array(buffer);let out="";for(let i=0;i<bytes.length;){let p=bytes[i++];if(p<128){out+=String.fromCodePoint(p);continue;}let n=p<224?1:p<240?2:3;p&=n===1?31:n===2?15:7;while(n--)p=(p<<6)|(bytes[i++]&63);out+=String.fromCodePoint(p);}return out;}}
 Function("window","document","indexedDB","Blob","URL","setTimeout","clearTimeout","confirm","TextDecoder","File",req("operator/render-desk.cjs").renderDesk(bundle).split("<script>")[1].split("</script>")[0])(window,document,idb,class{}, {createObjectURL:()=>"blob:test",revokeObjectURL(){}},timersApi,clear,()=>true,Decoder,File);
 async function settle(){for(let i=0;i<20;i++)await Promise.resolve();await window.ProcurementDesk.flush();await shared.tail;for(let i=0;i<20;i++)await Promise.resolve();}
 async function click(data){handlers.click({target:{closest:()=>({dataset:data})}});await settle();}
 async function loadFile(text,name,kind){handlers.change({target:{dataset:{file:kind},files:[new File([text],name)]}});await settle();}
 function formFor(key,base,kind,values){const fields=Object.entries(values).map(([path,value])=>({dataset:{path},value,multiple:false}));const form={dataset:{key,base:JSON.stringify(base),kind,old:""},querySelectorAll:()=>fields};for(const field of fields)field.closest=()=>form;return {form,fields};}
 async function configLabel(label){const s=window.ProcurementDesk.getSession(),input={dataset:{path:"label"},value:label,multiple:false};const form={dataset:{key:"config",base:JSON.stringify(Object.fromEntries(Object.entries(s.study.config).filter(([k])=>!["procurement","selection"].includes(k)))),kind:"config",old:""},querySelectorAll:()=>[input]};input.closest=()=>form;handlers.input({target:input});handlers.submit({target:{closest:()=>form},preventDefault(){}});await settle();}
 await settle();return{window,nodes,handlers,wins,downloads,click,loadFile,configLabel,settle,formFor};
}







const a=await boot();
check(a.nodes.main.innerHTML.includes("Procurement Savings Reconciliation Study Desk"),"Generated operator starts with an empty procurement savings reconciliation study");
check(JSON.stringify(a.window.PROCUREMENT_SOURCE_FILES)===JSON.stringify(bundle.slice().sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)),"Compressed generated HTML recovers every exact source member");
for(const view of ["study","intake","selection","records","crosswalks","documents","plan","commerce","timeline","compare","reviews","recovery"]){await a.click({view});check(a.nodes.main.innerHTML.length>30,"Actual "+view+" handler renders its empty state");}
await a.click({action:"course",course:"complete"});check(a.window.ProcurementDesk.assessment().result.procurement.population.included===course.config.procurement.expected_members,"Actual authored course opens the complete initiative population");
await a.click({view:"plan"});check(a.nodes.main.innerHTML.includes("expected_counts.calculation_inputs")&&a.nodes.main.innerHTML.includes("expected_counts.authorities"),"Ordinary plan retains both calculation-input and scoped-authority source coverage");
await a.click({view:"timeline"});check(a.nodes.main.innerHTML.includes("Every observed initiative")&&a.nodes.main.innerHTML.includes(Core.rows(course,"initiatives","returned")[0].values.id),"Actual initiative view renders complete original initiative identity");
await a.click({view:"records"});await a.click({action:"record-kind",kind:"initiatives"});await a.click({action:"edit-record",index:"0"});let s=a.window.ProcurementDesk.getSession(),key="record:initiatives:returned";check(s.drafts[key].value.id===Core.rows(course,"initiatives","returned")[0].values.id,"Actual record editor opens complete original initiative observation");
await a.click({action:"new-record"});s=a.window.ProcurementDesk.getSession();check(s.backups.length>0&&s.drafts[key].row_index===null,"Starting another record preserves the preceding whole draft");
for(const[kind,field]of [["baseline_inputs","row_sha256"],["mapping_inputs","row_sha256"],["calculation_inputs","row_sha256"],["baseline_reviews","baseline_basis_sha256"],["mapping_reviews","mapping_basis_sha256"],["submissions","calculation_basis_sha256"],["finance_reviews","submission_sha256"]]){await a.click({action:"record-kind",kind});await a.click({action:"edit-record",index:"0"});const before=a.window.ProcurementDesk.getSession(),pending=before.drafts["record:"+kind+":returned"],expected=req("procurement.cjs").sourceBindings(before.study,Core.rows,Core.selected,"returned",kind,pending.value);await a.click({action:"record-procurement-bindings"});s=a.window.ProcurementDesk.getSession();check(s.drafts["record:"+kind+":returned"].value[field]===expected[field]&&/^[a-f0-9]{64}$/.test(expected[field]),"Actual "+kind+" helper retains its exact source binding in the pending form");}
await a.click({view:"reviews"});await a.click({action:"new-review"});s=a.window.ProcurementDesk.getSession();const rev=s.drafts.review,priorReviews=JSON.stringify(s.study.reviews);
await a.configLabel("Changed source-bound review");const rf=a.formFor("review",rev,"review",{reviewer:"Authored reviewer",decision:"accepted"});a.handlers.submit({target:{closest:()=>rf.form},preventDefault(){}});await a.settle();check(JSON.stringify(a.window.ProcurementDesk.getSession().study.reviews)===priorReviews,"Stale actual review is rejected after study change");
await a.click({action:"download-session"});await a.click({action:"export-zip"});await a.click({action:"export-source"});check(a.downloads.length>=4,"Complete session, maintained source and study exports execute");
const saved=a.window.ProcurementDesk.getSession(),b=await boot();check(b.window.ProcurementDesk.getSession().study.config.label===saved.study.config.label&&!!b.window.ProcurementDesk.getSession().drafts[key],"Cold instance reopens every unfinished form");
await a.configLabel("First tab later edit");await b.configLabel("Second branch");check(b.nodes["save-state"].textContent.includes("branch"),"Cross-tab save preserves competing branch");await b.click({action:"adopt-local"});check(!b.nodes["save-state"].textContent.includes("Another saved"),"Explicit branch adoption resumes normal complete saving");
return{execution:"Actual generated offline HTML handlers with injected DOM and IndexedDB services; no rendered browser claim",checks};
};
