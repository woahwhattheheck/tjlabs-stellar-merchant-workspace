'use strict';
module.exports=function nativeCourse(bundle,utf8Encode,utf8Decode){
bundle=bundle.filter(x=>x.path!=='SOURCE_MANIFEST.json');
const files=Object.fromEntries(bundle.map(x=>[x.path,x.content])),cache={};function req(p){if(cache[p])return cache[p];const m={exports:{}};const dir=p.split("/").slice(0,-1);Function("module","exports","require",files[p])(m,m.exports,n=>{const a=[];for(const v of [...dir,...n.split("/")])if(v==="..")a.pop();else if(v&&v!==".")a.push(v);return req(a.join("/"));});return cache[p]=m.exports;}
const SHA=req("sha256.cjs"),M=req("session.cjs"),store=new Map(),dirs=new Set(["/app","/app/native"]),checks=[];let uid=0,manifestReads=0;
class B extends Uint8Array{static from(x){return new B(typeof x==="string"?utf8Encode(x):x);}equals(other){return this.length===other.length&&this.every((x,i)=>x===other[i]);}toString(){return utf8Decode(this);}}
const norm=p=>{const out=[];for(const s of p.split("/"))if(s==="..")out.pop();else if(s&&s!==".")out.push(s);return"/"+out.join("/");};
const path={sep:"/",resolve:(...xs)=>norm(xs.join("/")),join:(...xs)=>norm(xs.join("/")),dirname:p=>norm(p.split("/").slice(0,-1).join("/")),basename:p=>p.split("/").at(-1)};
for(const [p,c] of Object.entries(files))store.set("/app/"+p,B.from(c));
const manifest={members:bundle.map(f=>({path:f.path,sha256:SHA.sha256Utf8(f.content).sha256}))};store.set("/app/SOURCE_MANIFEST.json",B.from(JSON.stringify(manifest)));
const fs={readFileSync(p){p=norm(p);if(p==="/app/SOURCE_MANIFEST.json")manifestReads++;if(!store.has(p))throw Error("ENOENT "+p);return B.from(store.get(p));},existsSync:p=>store.has(norm(p))||dirs.has(norm(p)),mkdirSync:p=>dirs.add(norm(p)),writeFileSync(p,b,o){p=norm(p);if(o?.flag==="wx"&&store.has(p))throw Error("EEXIST");store.set(p,B.from(b));},linkSync(a,b){a=norm(a);b=norm(b);if(store.has(b))throw Error("EEXIST");store.set(b,B.from(store.get(a)));},unlinkSync:p=>store.delete(norm(p))};
const crypto={randomUUID:()=>String(++uid),createHash(){let value="";return{update(x){value+=String(x);return this;},digest(){return SHA.sha256Utf8(value).sha256;}};}};
class Decoder{decode(b){return utf8Decode(b);}}
function run(args){const process={argv:["node","cli",...args],exitCode:0,stdout:{write:s=>{out+=s;}},stderr:{write:s=>{err+=s;}}};let out="",err="";const require=n=>n==="node:fs"?fs:n==="node:path"?path:n==="node:crypto"?crypto:req(norm("/native/"+n).slice(1));Function("require","process","__dirname","Buffer","TextDecoder",files["native/procurement-desk.cjs"].replace(/^#!.*\n/,""))(require,process,"/app/native",B,Decoder);return{code:process.exitCode,out,err};}
const check=(x,m)=>{if(!x)throw Error(m);checks.push(m);};






let r=run(["course","--kind","complete","--out","/work/course.json"]);check(r.code===0,"Native opens the complete authored initiative session");const C=req("core.cjs"),CSV=req("csv.cjs"),initial=JSON.parse(utf8Decode(store.get("/work/course.json")));initial.drafts["record:sites:returned"]={reason:"Unfinished observed name",value:{name:"Exact pending name"}};store.set("/work/pending.json",B.from(JSON.stringify(initial)));
r=run(["set-config","--in","/work/pending.json","--field","label","--value","Actual procurement savings reconciliation review","--out","/work/edited.json"]);check(r.code===0,"Native records actual study scope");const session=M.validate(JSON.parse(utf8Decode(store.get("/work/edited.json"))));check(session.drafts["record:sites:returned"].value.name==="Exact pending name","Native retains unfinished ordinary forms");
r=run(["inspect","--in","/work/edited.json"]);check(r.code===0&&JSON.parse(r.out).comparison.procurement.population.included===initial.study.config.procurement.expected_members,"Native preserves actual procurement calculations and whole initiative denominators");
let input="/work/edited.json";for(const role of session.study.config.procurement.required_review_roles){const out="/work/review-"+role+".json";r=run(["review","--in",input,"--digest",C.digest(session.study),"--role",role,"--reviewer","Authored "+role,"--decision","accepted","--out",out]);check(r.code===0,"Native records exact "+role+" review");input=out;}
r=run(["prepare-record","--in",input,"--kind","sites","--side","returned","--index","0","--out","/work/record.json"]);check(r.code===0,"Native prepares source-edition-bound correction");const prepared=JSON.parse(utf8Decode(store.get("/work/record.json")));prepared.value.name="Authored corrected name";store.set("/work/record.json",B.from(JSON.stringify(prepared)));
r=run(["record","--in",input,"--file","/work/record.json","--reason","Actual retained name source","--at","2026-10-15T14:00:00Z","--out","/work/corrected.json"]);check(r.code===0&&C.rows(JSON.parse(utf8Decode(store.get("/work/corrected.json"))).study,"sites","returned")[0].values.name==="Authored corrected name","Native exact row correction succeeds");
r=run(["record","--in","/work/corrected.json","--file","/work/record.json","--reason","Stale request","--out","/work/stale.json"]);check(r.code===1&&!store.has("/work/stale.json"),"Native rejects stale source edition without output");
store.set("/work/evidence.bin",new B([0,255,128,13,10,27]));r=run(["add-document","--in",input,"--file","/work/evidence.bin","--available-at","2026-10-15T09:00:00Z","--out","/work/document.json"]);check(r.code===0,"Native retains exact arbitrary supporting bytes");
r=run(["export","--in","/work/document.json","--out","/work/study.zip"]);check(r.code===0&&store.has("/work/study.zip"),"Native exports complete portable session and source originals");
r=run(["export-directory","--in","/work/document.json","--out","/work/exported"]);check(r.code===0&&store.has("/work/exported/procurement/report.md"),"Native exports the readable procurement-savings report");
const before=manifestReads;r=run(["build-html","--out","/work/desk.html"]);check(r.code===0&&manifestReads===before+1,"Native builder reads one exact manifest");const canonical=[...bundle,{path:"SOURCE_MANIFEST.json",content:utf8Decode(store.get("/app/SOURCE_MANIFEST.json"))}];check(utf8Decode(store.get("/work/desk.html"))===req("operator/render-desk.cjs").renderDesk(canonical.slice().reverse()),"Native and reversed source order reproduce identical HTML");
r=run(["source-zip","--out","/work/source.zip"]);check(r.code===0&&store.has("/work/source.zip"),"Native exports whole maintained source");
return{execution:"Actual maintained Node command source with injected filesystem/path/crypto in V8",checks,output_count:[...store.keys()].filter(x=>x.startsWith("/work/")).length};
};
