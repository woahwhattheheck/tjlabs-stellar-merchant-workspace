#!/usr/bin/env node
/** Standalone complete handover receiver. Node.js built-ins only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {parseArgs} from 'node:util';
const {values:a}=parseArgs({options:{input:{type:'string'},output:{type:'string'}}});
function need(ok,message){if(!ok)throw new Error(message);}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function exists(file){try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function memberBytes(m){
 if(m.encoding==='utf8'){need(typeof m.content==='string','Missing complete UTF-8 body: '+m.path);for(const c of m.content){const n=c.codePointAt(0);need(!(n>=0xd800&&n<=0xdfff),'Invalid Unicode in '+m.path);}return Buffer.from(m.content,'utf8');}
 need(m.encoding==='base64'&&typeof m.base64==='string','Unknown body encoding: '+m.path);const bytes=Buffer.from(m.base64,'base64');need(bytes.toString('base64')===m.base64,'Noncanonical or incomplete base64: '+m.path);return bytes;
}
try{
 need(a.input&&a.output,'Use --input accreditation-handover.json --output CLEAN_DIRECTORY.');
 const packet=JSON.parse(await fs.readFile(path.resolve(a.input),'utf8')),root=path.resolve(a.output),seen=new Set();
 need(packet.schema==='tjlabs.accreditation-handover.v1'&&Array.isArray(packet.members)&&Array.isArray(packet.manifest),'Choose the complete accreditation application handover.');
 need(packet.members.length===packet.manifest.length,'Every manifest member must have its complete body.');
 await fs.mkdir(root,{recursive:true});
 for(const m of packet.members){
  need(typeof m.path==='string'&&m.path.length>0&&!m.path.startsWith('/')&&!/^[A-Za-z]:/.test(m.path)&&!/[\\\x00-\x1f]/.test(m.path)&&m.path.split('/').every(p=>p&&p!=='.'&&p!=='..'),'Invalid portable path.');
  need(!seen.has(m.path),'Repeated handover path: '+m.path);seen.add(m.path);
  const bytes=memberBytes(m),identity=sha(bytes),manifest=packet.manifest.filter(e=>e.path===m.path);
  need(bytes.length===m.bytes&&identity===m.sha256,'Complete member identity differs: '+m.path);
  need(manifest.length===1&&manifest[0].bytes===m.bytes&&manifest[0].sha256===m.sha256&&manifest[0].encoding===m.encoding,'Manifest differs: '+m.path);
  let current=root;for(const part of m.path.split('/')){current=path.join(current,part);if(await exists(current)){const stat=await fs.lstat(current);need(!stat.isSymbolicLink(),'Symbolic link in destination: '+m.path);}}
  need(!await exists(path.join(root,m.path)),'Choose a clean directory; file already exists: '+m.path);
 }
 for(const m of packet.members){
  const destination=path.join(root,m.path);await fs.mkdir(path.dirname(destination),{recursive:true});
  const handle=await fs.open(destination,'wx',0o600);try{await handle.writeFile(memberBytes(m));await handle.sync();}finally{await handle.close();}
 }
 const project=JSON.parse(await fs.readFile(path.join(root,'project.json'),'utf8'));
 need(project.project_id===packet.project_id&&project.revision===packet.revision,'The saved project differs from the package identity.');
 process.stdout.write(JSON.stringify({directory:root,project_id:packet.project_id,revision:packet.revision,files:packet.members.length,open:'node '+path.join(root,'application/cli.mjs')+' serve --workspace '+root})+'\n');
}catch(error){process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1;}
