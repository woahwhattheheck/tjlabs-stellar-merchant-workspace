// MIT. Keeps the original native workspace lock for one administrator operation.
import {createHash,randomUUID} from 'node:crypto';
import {open,link,unlink,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
const [application,directory]=process.argv.slice(2);
if(!application||!directory||resolve(application)!==application||resolve(directory)!==directory)throw new Error('Use exact absolute application and workspace paths');
const {openDataGouvWorkspace}=await import(pathToFileURL(application+'/stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv/workspace.mjs'));
const workspace=await openDataGouvWorkspace({directory});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const summary=()=>{const s=workspace.status();return {workspace:s.workspace,selection:s.selection,captures:s.captures.length,publications:s.publications.length,providerOperations:s.providerOperations.length};};
const fingerprint=packet=>sha(JSON.stringify(packet.files.filter(x=>x.path.startsWith('workspace/')).map(x=>[x.path,x.bytes,x.sha256]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)));
let closed=false;
async function close(){if(!closed){closed=true;await workspace.close();}}
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
process.on('SIGTERM',()=>{input.close();close().then(()=>process.exit(0),()=>process.exit(1));});
process.on('SIGINT',()=>{input.close();close().then(()=>process.exit(0),()=>process.exit(1));});
try{
  send({ok:true,state:'LOCKED',summary:summary()});
  for await(const line of input){
    if(Buffer.byteLength(line)>1024*1024)throw new Error('Administration command exceeds its bound');
    const command=JSON.parse(line);
    try{
      if(command.action==='close'){send({ok:true,state:'CLOSED'});break;}
      if(command.action==='status'){send({ok:true,summary:summary()});continue;}
      if(!['fingerprint','export'].includes(command.action))throw new Error('Choose a supported local administration action');
      const result=await workspace.exportArchive({sourceRoot:application}),packet=JSON.parse(result.bytes);
      const selected={workspaceFingerprint:fingerprint(packet),workspaceId:packet.workspace.id,selection:packet.selection,bytes:result.bytes.length,sha256:sha(result.bytes),members:packet.files.length};
      if(command.action==='fingerprint'){send({ok:true,...selected});continue;}
      const target=command.output;
      if(typeof target!=='string'||resolve(target)!==target)throw new Error('Use an absolute backup path');
      const parent=dirname(target),parentStat=await lstat(parent);
      if(!parentStat.isDirectory()||parentStat.isSymbolicLink()||parentStat.mode&0o077)throw new Error('Use a private backup directory');
      const stage=parent+'/.export-'+randomUUID();
      const handle=await open(stage,'wx',0o600);
      try{await handle.writeFile(result.bytes);await handle.sync();}finally{await handle.close();}
      // Linking is create-only. Any interrupted staging derivative remains for inspection.
      await link(stage,target);await unlink(stage);
      const dir=await open(parent,'r');try{await dir.sync();}finally{await dir.close();}
      send({ok:true,path:target,...selected});
    }catch(error){send({ok:false,error:error.code??'ADMIN_WORKSPACE',message:error.message});}
  }
}finally{await close();}
