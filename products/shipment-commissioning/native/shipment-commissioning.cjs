#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {core:K,codec:C,zipper:Z}=require('../runtime/shipment-runtime.cjs'),{runCourse}=require('../examples/course.cjs');
const LIMIT=180000000;
function absolute(p){if(!path.isAbsolute(p))throw Error('Use an absolute path');return path.normalize(p);}
async function physical(p,create=false){p=absolute(p);const root=path.parse(p).root;let at=root;for(const part of p.slice(root.length).split(path.sep).filter(Boolean)){at=path.join(at,part);try{const s=await fs.lstat(at);if(s.isSymbolicLink()||!s.isDirectory())throw Error('Physical directory required: '+at);}catch(e){if(e.code!=='ENOENT'||!create)throw e;await fs.mkdir(at,{mode:0o700});}}return p;}
async function read(p){p=absolute(p);await physical(path.dirname(p));const s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>LIMIT)throw Error('Use an ordinary file up to 180 MB');const h=await fs.open(p,require('node:fs').constants.O_RDONLY|require('node:fs').constants.O_NOFOLLOW);try{const t=await h.stat();if(t.dev!==s.dev||t.ino!==s.ino)throw Error('Input changed during open');return await h.readFile();}finally{await h.close();}}
async function json(p){return JSON.parse((await read(p)).toString('utf8'));}
async function write(p,data,{replace=false}={}){p=absolute(p);await physical(path.dirname(p),true);try{const s=await fs.lstat(p);if(s.isSymbolicLink()||!s.isFile())throw Error('Ordinary destination required');if(!replace)throw Error('Destination already exists');}catch(e){if(e.code!=='ENOENT')throw e;}const temp=p+'.partial-'+crypto.randomUUID();const h=await fs.open(temp,'wx',0o600);try{await h.writeFile(data);await h.sync();}finally{await h.close();}
 try{if(replace)await fs.rename(temp,p);else{await fs.link(temp,p);await fs.unlink(temp);}const d=await fs.open(path.dirname(p),'r');try{await d.sync();}finally{await d.close();}}catch(e){try{await fs.unlink(temp);}catch{}throw e;}
}
async function locked(file,fn){const dir=absolute(file)+'.lock',token=crypto.randomUUID();try{await fs.mkdir(dir,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw Error('Another writer or interrupted lock exists at '+dir+'. Check that writer before removing its lock.');throw e;}await fs.writeFile(path.join(dir,'owner.json'),JSON.stringify({token,pid:process.pid,at:new Date().toISOString()})+'\n',{flag:'wx',mode:0o600});try{return await fn();}finally{try{const x=JSON.parse(await fs.readFile(path.join(dir,'owner.json'),'utf8'));if(x.token===token){await fs.unlink(path.join(dir,'owner.json'));await fs.rmdir(dir);}}catch{}}}
async function readWorkspace(p){return K.validate(await json(p));}
async function exportDirectory(w,destination){
 const dir=await physical(destination,true),files=K.exportFiles(w),manifest={schema:'shipment-commissioning.export.v1',workspace_id:w.id,workspace_sha256:K.hash(w),files:Object.entries(files).map(([name,value])=>{const b=typeof value==='string'?Buffer.from(value,'utf8'):Buffer.from(value);return{path:name,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};})};
 const plan=path.join(dir,'EXPORT_PLAN.json');let prior=null;try{prior=await json(plan);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(prior&&JSON.stringify(prior)!==JSON.stringify(manifest))throw Error('Destination belongs to another workspace edition');
 if(!prior){const names=await fs.readdir(dir),expected=Buffer.from(JSON.stringify(manifest,null,2)+'\n');for(const name of names){if(!/^EXPORT_PLAN\.json\.partial-[A-Za-z0-9-]+$/.test(name)||!(await read(path.join(dir,name))).equals(expected))throw Error('Choose an empty directory, or resume only the complete identical interrupted export plan');}await write(plan,expected);}
 for(const [name,value]of Object.entries(files)){
  if(name.startsWith('/')||name.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Unsafe export path');
  const p=path.join(dir,...name.split('/')),b=typeof value==='string'?Buffer.from(value,'utf8'):Buffer.from(value);
  try{const old=await read(p);if(!old.equals(b))throw Error('Existing export member differs: '+name);}catch(e){if(e.code!=='ENOENT')throw e;await write(p,b);}
 }
 await write(path.join(dir,'EXPORT_COMPLETE.json'),JSON.stringify(manifest,null,2)+'\n',{replace:!!await fs.stat(path.join(dir,'EXPORT_COMPLETE.json')).catch(()=>null)});
 return manifest;
}
async function main(argv){
 const [cmd,a,b,c,d,e]=argv;
 if(cmd==='course'){const x=runCourse();if(a)await write(a,JSON.stringify(x.workspace,null,2)+'\n');process.stdout.write(JSON.stringify({operations:x.commands.length,checks:x.checks,reports:{a:x.reports.a.findings.length,b:x.reports.b.findings.length,effort:x.reports.effort}},null,2)+'\n');return;}
 if(cmd==='new'){await write(a,JSON.stringify(K.blank({id:b,title:c||b,created_at:new Date().toISOString()}),null,2)+'\n');return;}
 if(cmd==='inspect'){const w=await readWorkspace(a);process.stdout.write(JSON.stringify({id:w.id,revision:w.revision,sha256:K.hash(w),originals:w.originals.length,cases:w.cases.map(x=>({id:x.id,title:x.title,revision:x.revision,review:x.review})),runs:w.runs.map(x=>K.reportRun(w,x.id))},null,2)+'\n');return;}
 if(cmd==='apply'){const command=await json(b);await locked(a,async()=>{const w=await readWorkspace(a),next=K.apply(w,command),reused=next.revision===w.revision;if(!reused)await write(a,JSON.stringify(next,null,2)+'\n',{replace:true});process.stdout.write(JSON.stringify({workspace_id:next.id,revision:next.revision,sha256:K.hash(next),operation_id:command.id,reused})+'\n');});return;}
 if(cmd==='import-original'){const spec=await json(c),bytes=await read(b);if(bytes.length>20*1024*1024)throw Error('Original exceeds 20 MiB');await locked(a,async()=>{const w=await readWorkspace(a),command={...spec,kind:'add_original',value:{...spec.value,name:path.basename(b),data:C.base64Encode(bytes)}};const next=K.apply(w,command);if(next.revision!==w.revision)await write(a,JSON.stringify(next,null,2)+'\n',{replace:true});process.stdout.write(JSON.stringify({revision:next.revision,operation_id:command.id,sha256:K.hash(next)})+'\n');});return;}
 if(cmd==='export'){const w=await readWorkspace(a),m=await exportDirectory(w,b);process.stdout.write(JSON.stringify({files:m.files.length,workspace_sha256:m.workspace_sha256})+'\n');return;}
 if(cmd==='zip'){const w=await readWorkspace(a),bytes=Z.zip(K.exportFiles(w));await write(b,bytes);process.stdout.write(JSON.stringify({bytes:bytes.length,sha256:C.sha256(bytes)})+'\n');return;}
 if(cmd==='desk'){const w=await readWorkspace(a),root=path.resolve(__dirname,'..'),paths=['runtime/archive-codec.cjs','runtime/connected_zip.cjs','runtime/connected_gzip.cjs','runtime/crm-zip.cjs','runtime/shipment-review.cjs','runtime/shipment-runtime.cjs','browser/shipment-ui.cjs'],files={};for(const p of paths)files[p]=(await read(path.join(root,p))).toString('utf8');const example=K.validate(await json(path.join(root,'examples/workspace.json')));const html=require('../browser/render-desk.cjs').renderDesk(files,w,example);await write(b,html);return;}
 throw Error('Commands:\n course [/absolute/example.json]\n new /absolute/workspace.json workspace-id "Workspace title"\n inspect /absolute/workspace.json\n apply /absolute/workspace.json /absolute/command.json\n import-original /absolute/workspace.json /absolute/original.file /absolute/operation-spec.json\n export /absolute/workspace.json /absolute/empty-directory\n zip /absolute/workspace.json /absolute/work.zip\n desk /absolute/workspace.json /absolute/desk.html');
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
module.exports={main,readWorkspace,exportDirectory};
