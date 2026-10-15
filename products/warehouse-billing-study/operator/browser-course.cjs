'use strict';
module.exports=async function browserCourse(bundle){
const files=Object.fromEntries(bundle.map(x=>[x.path,x.content])),cache={};
function req(p){if(cache[p])return cache[p];const m={exports:{}};const dir=p.split("/").slice(0,-1);Function("module","exports","require",files[p])(m,m.exports,n=>{const a=[];for(const v of [...dir,...n.split("/")])if(v==="..")a.pop();else if(v&&v!==".")a.push(v);return req(a.join("/"));});return cache[p]=m.exports;}
const Core=req("core.cjs"),M=req("session.cjs"),SHA=req("sha256.cjs"),ZIP=req("zip.cjs"),course=JSON.parse(files["examples/first.study.json"]),CSV=req("csv.cjs");
const records=new Map(),shared={tail:Promise.resolve()},checks=[];
function check(v,l){if(!v)throw Error(l);checks.push(l);}
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function database(){return{objectStoreNames:{contains:()=>true},transaction(){let aborted=false;const tx={error:null,oncomplete:null,onerror:null,onabort:null,abort(){aborted=true;if(tx.onabort)tx.onabort();},objectStore(){return{get(key){const q={};shared.tail=shared.tail.then(async()=>{if(aborted)return;q.result=clone(records.get(key));if(q.onsuccess)q.onsuccess();await Promise.resolve();if(!aborted&&tx.oncomplete)tx.oncomplete();});return q;},put(v){records.set(v.key,clone(v));}};}};return tx;}};}
const idb={open(){const q={};Promise.resolve().then(()=>{q.result=database();q.onsuccess?.();});return q;}};
async function boot(){
 const handlers={},wins={},nodes={},downloads=[],timers=new Map();let tid=0;
 const element=id=>nodes[id]||(nodes[id]={id,innerHTML:"",textContent:"",disabled:false,value:"",setAttribute(){},querySelectorAll(){return[];}});
 const document={getElementById:element,querySelectorAll:()=>[],addEventListener:(k,fn)=>handlers[k]=fn,body:{appendChild(){}},createElement(){return{click(){downloads.push({name:this.download,url:this.href});},remove(){}};}};
 const window={BillingCore:Core,BillingSession:M,StudySHA:SHA,BillingZIP:ZIP,BillingCSV:CSV,BILLING_COURSES:{first:course,corrected:JSON.parse(files["examples/corrected.study.json"])},BILLING_SOURCE_FILES:bundle,addEventListener:(k,fn)=>wins[k]=fn};
 const timersApi=(fn)=>{const n=++tid;timers.set(n,fn);return n;},clear=n=>timers.delete(n);
 class File{constructor(parts,name,options={}){this.bytes=ZIP.utf(parts.join(""));this.name=name;this.type=options.type||"";this.size=this.bytes.length;}async arrayBuffer(){return this.bytes.buffer;}}
 class Decoder{decode(buffer){const bytes=new Uint8Array(buffer);let out="";for(let i=0;i<bytes.length;){let p=bytes[i++];if(p<128){out+=String.fromCodePoint(p);continue;}let n=p<224?1:p<240?2:3;p&=n===1?31:n===2?15:7;while(n--)p=(p<<6)|(bytes[i++]&63);out+=String.fromCodePoint(p);}return out;}}
 Function("window","document","indexedDB","Blob","URL","setTimeout","clearTimeout","confirm","TextDecoder","File",req("operator/render-desk.cjs").renderDesk(bundle).split("<script>")[1].split("</script>")[0])(window,document,idb,class{}, {createObjectURL:()=>"blob:test",revokeObjectURL(){}},timersApi,clear,()=>true,Decoder,File);
 async function settle(){for(let i=0;i<20;i++)await Promise.resolve();await window.BillingDesk.flush();await shared.tail;for(let i=0;i<20;i++)await Promise.resolve();}
 async function click(data){handlers.click({target:{closest:()=>({dataset:data})}});await settle();}
 async function loadFile(text,name,kind){handlers.change({target:{dataset:{file:kind},files:[new File([text],name)]}});await settle();}
 function formFor(key,base,kind,values){const fields=Object.entries(values).map(([path,value])=>({dataset:{path},value,multiple:false}));const form={dataset:{key,base:JSON.stringify(base),kind,old:""},querySelectorAll:()=>fields};for(const field of fields)field.closest=()=>form;return {form,fields};}
 async function configLabel(label){const s=window.BillingDesk.getSession(),input={dataset:{path:"label"},value:label,multiple:false};const form={dataset:{key:"config",base:JSON.stringify(Object.fromEntries(Object.entries(s.study.config).filter(([k])=>!["turn","selection"].includes(k)))),kind:"config",old:""},querySelectorAll:()=>[input]};input.closest=()=>form;handlers.input({target:input});handlers.submit({target:{closest:()=>form},preventDefault(){}});await settle();}
 await settle();return{window,nodes,handlers,wins,downloads,click,loadFile,configLabel,settle,formFor};
}




const a=await boot();check(a.nodes.main.innerHTML.includes("Warehouse Activity and Billing Study Desk"),"Generated operator starts empty");
await a.click({view:"intake"});check(a.nodes.main.innerHTML.includes('data-kind=\'clients\'')&&!a.nodes.main.innerHTML.includes("machine_types"),"Fresh CSV intake selects a valid current table");
await a.click({action:"course",course:"first"});check(a.window.BillingDesk.assessment().result.billing.clients[0].proposed_subtotal===null,"Missing day remains unresolved in actual generated UI");
for(const view of ["study","intake","selection","records","crosswalks","documents","activity","plan","timeline","compare","reviews","recovery"]){await a.click({view});check(a.nodes.main.innerHTML.length>60,"Generated handler renders "+view);}
await a.click({action:"course",course:"corrected"});check(a.window.BillingDesk.assessment().result.billing.clients[0].proposed_subtotal==="1075.40","Complete worked month shows calculated subtotal beside actual invoice");
await a.click({view:"records"});await a.click({action:"record-kind",kind:"clients"});await a.click({action:"edit-record",index:"0"});let s=a.window.BillingDesk.getSession(),key="record:clients:returned",old=s.drafts[key].expected_extract_id;
let form=a.formFor(key,{},"record",{"value.name":"Authored corrected client label",reason:"Supplied customer-name correction",at:"2026-10-04T10:00:00Z"});a.handlers.input({target:form.fields[0]});a.handlers.submit({target:{closest:()=>form.form},preventDefault(){}});await a.settle();s=a.window.BillingDesk.getSession();check(Core.selected(s.study,"clients","returned").derivation.source_extract_id===old,"Ordinary correction retains source preimage");
await a.click({action:"edit-record",index:"0"});await a.click({action:"new-record"});s=a.window.BillingDesk.getSession();check(s.backups.some(b=>M.branchSession(s,b).drafts[key]?.row_index===0),"Replacing a pending record retains its complete original form");
await a.click({action:"course",course:"first"});await a.loadFile(files["examples/public-activity.csv"],"complete-original.csv","activity");s=a.window.BillingDesk.getSession();check(s.drafts["activity-import"].content===files["examples/public-activity.csv"],"Activity file read preserves whole original in pending form");
form=a.formFor("activity-import",{},"activity-import",{available_at:"2026-10-03T10:00:00Z",at:"2026-10-03T10:00:00Z"});form.fields.push({dataset:{path:"complete_month",bool:"1"},value:"true",multiple:false});for(const x of form.fields)x.closest=()=>form.form;a.handlers.input({target:form.fields[0]});a.handlers.submit({target:{closest:()=>form.form},preventDefault(){}});await a.settle();check(a.window.BillingDesk.assessment().result.billing.clients[0].proposed_subtotal==="1075.40","Raw activity submission replaces source/month and recomputes complete charge trace");
await a.click({view:"plan"});await a.click({action:"add-storage"});await a.click({action:"remove-storage",index:"1"});s=a.window.BillingDesk.getSession();check(s.drafts["billing-plan"].storage_requirements.length===1,"Ordinary storage scope controls retain complete drafts");
await a.click({action:"new-review"});s=a.window.BillingDesk.getSession();const review=M.clone(s.drafts.review);form=a.formFor("review",review,"review",{reviewer:"Authored reviewer",decision:"accepted",notes:"Source comparison notes"});a.handlers.input({target:form.fields[0]});await a.configLabel("Changed complete study");a.handlers.submit({target:{closest:()=>form.form},preventDefault(){}});await a.settle();check(a.window.BillingDesk.getSession().study.reviews.length===0,"Changed study refuses stale review while retaining draft notes");
const other=await boot();await a.configLabel("Branch A");await other.configLabel("Branch B");check(other.nodes["save-state"].textContent.includes("Another saved branch"),"Two saved browser branches remain explicit");await other.click({action:"adopt-local"});await other.configLabel("Branch B continued");check(other.nodes["save-state"].textContent==="Saved in this browser","Explicit branch adoption permits subsequent ordinary save");check(other.window.BillingDesk.getSession().backups.length>0,"Both branch preimages remain recoverable");
await other.loadFile("not,csv\n1,2,3\n","bad.csv","csv:clients:source");check(Object.values(other.window.BillingDesk.getSession().drafts).some(x=>x.name==="bad.csv"&&x.text==="not,csv\n1,2,3\n"),"Rejected mapping candidate remains exact");
for(const action of ["download-session","export-zip","export-source","report"])await other.click({action});
check(other.downloads.some(x=>x.name==="billing-source-session.json")&&other.downloads.some(x=>x.name==="billing-source-complete.zip")&&other.downloads.some(x=>x.name==="billing-source-application-source.zip"),"Complete working, source and report downloads execute");
return{schema:"billing.source-browser-course/v1",runtime:"Actual generated HTML handlers with injected DOM and IndexedDB in V8; rendered-browser receiving remains separate",checks};
};
