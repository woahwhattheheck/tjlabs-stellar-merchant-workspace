#!/usr/bin/env node
// MIT. Installed Starforge command forwards into its original native project.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const values=process.argv.slice(2);
function remove(name){const positions=values.flatMap((x,i)=>x===name?[i]:[]);if(!positions.length)return null;if(positions.length!==1||!values[positions[0]+1])throw Error('Use one '+name);return values.splice(positions[0],2)[1];}
try{
 const python=remove('--python')??process.env.STARFORGE_PYTHON??'python3',project=remove('--project');
 if(values[0]==='postgres'){
   const {readFile}=await import('node:fs/promises'),{DbtPostgresProject}=await import('./postgres.mjs');
   const configFile=remove('--config'),inputFile=remove('--input'),action=values[1];
   if(!configFile||!action||values.length!==2)throw Error('Use postgres ACTION --config FILE [--input FILE]');
   const config=JSON.parse(await readFile(configFile,'utf8')),input=inputFile?JSON.parse(await readFile(inputFile,'utf8')):{};
   const original=await DbtPostgresProject.open({...config,project:project??config.project,python});
   try{console.log(JSON.stringify(await original.call(action,input)));}finally{await original.close();}
 }else{
   const child=spawn(python,[fileURLToPath(new URL('./cli.py',import.meta.url)),...(project?['--project',project]:[]),...values],{stdio:'inherit',shell:false});
   const forward=signal=>()=>child.kill(signal),term=forward('SIGTERM'),interrupt=forward('SIGINT');
   process.on('SIGTERM',term);process.on('SIGINT',interrupt);
   child.on('error',error=>{console.error(JSON.stringify({error:'DBT_PROCESS_START_FAILED',message:error.message}));process.exitCode=2;});
   child.on('close',(code,signal)=>{process.removeListener('SIGTERM',term);process.removeListener('SIGINT',interrupt);process.exitCode=code??(signal==='SIGINT'?130:143);});
 }
}catch(error){console.error(JSON.stringify({error:error.code??'DBT_COMMAND_INVALID',message:error.message}));process.exitCode=2;}
