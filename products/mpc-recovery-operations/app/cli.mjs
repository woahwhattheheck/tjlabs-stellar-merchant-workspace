#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import * as Model from './domain.mjs';
import * as Proposal from './proposal.mjs';
async function open(path){const value=JSON.parse(await readFile(path,'utf8'));if(value.format==='mpc-recovery-portable.v1'){if(value.sha256!==Model.sha256(Model.canonical(value.snapshot)))throw Error('Portable checksum mismatch.');return Model.receiveSnapshot(value.snapshot);}return Model.receiveSnapshot(value);}
async function save(path,value){await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
function packet(workspace){const snapshot=Model.exportSnapshot(workspace);return {format:'mpc-recovery-portable.v1',sha256:Model.sha256(Model.canonical(snapshot)),snapshot};}
const [command,input,...args]=process.argv.slice(2);
try{
 if(!command||command==='help'){console.log('proposal INPUT CASE.json OUTPUT ACTOR | summary INPUT | receive INPUT OUTPUT | review INPUT FROM TO OUTPUT | apply INPUT COMMAND.json OUTPUT | sources INPUT DIRECTORY');}
 else {
 const workspace=await open(input);
 if(command==='summary')console.log(JSON.stringify(Model.overview(workspace,workspace.updatedAt),null,2));
 else if(command==='proposal'){
 const content=await readFile(args[0],'utf8'),register={requirements:JSON.parse(await readFile(new URL('./proposal/requirements.json',import.meta.url),'utf8')),steps:JSON.parse(await readFile(new URL('./proposal/acceptance-steps.json',import.meta.url),'utf8'))};
 if(!args[2])throw Error('Supply the operating engineer as ACTOR.');
 const outcome=Proposal.importProposal(workspace,{id:'proposal-'+Model.sha256(content).slice(0,24),actor:args[2],at:new Date().toISOString(),name:'MPC-backup-planning-case.json',origin:'Operator-selected complete proposal case',content},register);await save(args[1],packet(outcome.workspace));console.log(JSON.stringify({sourceId:outcome.sourceId,reused:outcome.reused,...Model.inspectWorkspace(outcome.workspace)}));
 }
 else if(command==='receive'){await save(args[0],packet(workspace));console.log(JSON.stringify(Model.inspectWorkspace(workspace)));}
 else if(command==='review'){await save(args[2],Model.serviceReview(workspace,{from:args[0],to:args[1]}));console.log(JSON.stringify({path:args[2],revision:workspace.revision}));}
 else if(command==='apply'){const payload=JSON.parse(await readFile(args[0],'utf8')),outcome=Model.applyCommand(workspace,payload);await save(args[1],packet(outcome.workspace));console.log(JSON.stringify(outcome.result));}
 else if(command==='sources'){
  const directory=resolve(args[0]);await mkdir(directory,{recursive:true});
  for(const s of workspace.sources){const file=resolve(directory,s.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+s.name.replace(/[^a-zA-Z0-9._-]/g,'_'));await writeFile(file,s.encoding==='base64'?Buffer.from(s.content,'base64'):s.content,{flag:'wx'});}
  console.log(JSON.stringify({directory,files:workspace.sources.length}));
 }else throw Error('Unknown command. Run cli.mjs help.');
 }
}catch(error){console.error(error.stack||String(error));process.exitCode=1;}
