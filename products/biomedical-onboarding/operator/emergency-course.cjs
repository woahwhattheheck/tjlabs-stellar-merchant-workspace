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
 const window={BiomedCore:Core,BiomedSession:M,StudySHA:SHA,BiomedZIP:ZIP,BiomedCSV:CSV,BIOMED_COURSES:{first:course,corrected:JSON.parse(files["examples/corrected.study.json"])},BIOMED_SOURCE_FILES:bundle,addEventListener:(k,fn)=>wins[k]=fn};
 const timersApi=(fn)=>{const n=++tid;timers.set(n,fn);return n;},clear=n=>timers.delete(n);
 class File{constructor(parts,name,options={}){this.bytes=ZIP.utf(parts.join(""));this.name=name;this.type=options.type||"";this.size=this.bytes.length;}async arrayBuffer(){return this.bytes.buffer;}}
 class Decoder{decode(buffer){const bytes=new Uint8Array(buffer);let out="";for(let i=0;i<bytes.length;){let p=bytes[i++];if(p<128){out+=String.fromCodePoint(p);continue;}let n=p<224?1:p<240?2:3;p&=n===1?31:n===2?15:7;while(n--)p=(p<<6)|(bytes[i++]&63);out+=String.fromCodePoint(p);}return out;}}
 Function("window","document","indexedDB","Blob","URL","setTimeout","clearTimeout","confirm","TextDecoder","File",req("operator/render-desk.cjs").renderDesk(bundle).split("<script>")[1].split("</script>")[0])(window,document,idb,class{}, {createObjectURL:()=>"blob:test",revokeObjectURL(){}},timersApi,clear,()=>true,Decoder,File);
 async function settle(){for(let i=0;i<20;i++)await Promise.resolve();await window.BiomedDesk.flush();await shared.tail;for(let i=0;i<20;i++)await Promise.resolve();}
 async function click(data){handlers.click({target:{closest:()=>({dataset:data})}});await settle();}
 async function loadFile(text,name,kind){handlers.change({target:{dataset:{file:kind},files:[new File([text],name)]}});await settle();}
 function formFor(key,base,kind,values){const fields=Object.entries(values).map(([path,value])=>({dataset:{path},value,multiple:false}));const form={dataset:{key,base:JSON.stringify(base),kind,old:""},querySelectorAll:()=>fields};for(const field of fields)field.closest=()=>form;return {form,fields};}
 async function configLabel(label){const s=window.BiomedDesk.getSession(),input={dataset:{path:"label"},value:label,multiple:false};const form={dataset:{key:"config",base:JSON.stringify(s.study.config),kind:"config",old:""},querySelectorAll:()=>[input]};input.closest=()=>form;handlers.input({target:input});handlers.submit({target:{closest:()=>form},preventDefault(){}});await settle();}
 await settle();return{window,nodes,handlers,wins,downloads,click,loadFile,configLabel,settle,formFor};
}


let large=M.create(course),e=large.study.extracts.find(x=>x.kind==="assets"&&x.side==="source"),o=large.study.originals.find(x=>x.id===e.original_id),key="intake:assets:source";
large.drafts[key]={kind:"assets",side:"source",name:o.name,content:o.content,mapping:M.clone(e.mapping),label:"Pending original",at:o.captured_at};large.drafts.padding={text:""};
const available=M.LIMIT-M.byteLength(JSON.stringify(large))-1200;large.drafts.padding.text="x".repeat(available);M.validate(large);
records.set("active",{key:"active",hash:M.hash(large),session:large,updated_at:"2026-10-15T04:30:00Z"});
const a=await boot(),input=a.formFor(key,{},"intake",{label:"Exact pending label "+"z".repeat(2400)});
a.handlers.input({target:input.fields[0]});await a.settle();let recovery=a.window.BiomedDesk.getRecovery();check(recovery.schema==="biomed.onboarding-emergency/v1"&&recovery.pending_forms[key].label.length>2400,"At actual 40 MiB boundary, pending complete CSV mapping moves to emergency");
const original=JSON.stringify(recovery.pending_forms[key]);await a.click({action:"edit-extract",id:e.id});recovery=a.window.BiomedDesk.getRecovery();check(JSON.stringify(recovery.pending_forms[key])===original,"Preparing an older mapping cannot erase emergency-only original");
a.handlers.submit({target:{closest:()=>input.form},preventDefault(){}});await a.settle();recovery=a.window.BiomedDesk.getRecovery();check(JSON.stringify(recovery.pending_forms[key])===original&&recovery.session.study.config.selection.source.assets===large.study.config.selection.source.assets,"Rejected combined successor keeps emergency form and applied extract unchanged");
let warned=false;a.wins.beforeunload({preventDefault(){warned=true;}});check(warned,"Memory-only pending input warns before leaving");await a.click({action:"download-session"});check(a.downloads.some(x=>x.name==="biomed-emergency-recovery.json"),"Exact emergency envelope is available through normal download");
return{schema:"biomed.emergency-boundary-course/v1",runtime:"Actual generated browser handler source with injected DOM/IndexedDB at production 40 MiB session limit",checks,valid_session_bytes:M.byteLength(JSON.stringify(large)),pending_form_preserved:true};
};
