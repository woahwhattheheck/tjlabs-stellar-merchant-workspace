#!/usr/bin/env node
// MIT. Installed command preserves original Python application/process ownership.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);
function take(flag){const indexes=args.flatMap((value,i)=>value===flag?[i]:[]);if(!indexes.length)return undefined;if(indexes.length!==1||!args[indexes[0]+1])throw Error(`Use one ${flag} value`);return args.splice(indexes[0],2)[1];}
try{
 const python=take('--python')??process.env.STARFORGE_PYTHON??'python3';
 const project=take('--project');if(!project)throw Error('An original --project directory is required');
 const child=spawn(python,[fileURLToPath(new URL('./cli.py',import.meta.url)),'--project',project,...args],{stdio:'inherit',shell:false});
 const term=()=>child.kill('SIGTERM'),interrupt=()=>child.kill('SIGINT');process.on('SIGTERM',term);process.on('SIGINT',interrupt);
 child.on('error',error=>{console.error(JSON.stringify({error:'OPTIMIZATION_PROCESS_START_FAILED',message:error.message}));process.exitCode=2;});
 child.on('close',(code,signal)=>{process.off('SIGTERM',term);process.off('SIGINT',interrupt);process.exitCode=code??(signal==='SIGINT'?130:143);});
}catch(error){console.error(JSON.stringify({error:error.code??'OPTIMIZATION_COMMAND_INVALID',message:error.message}));process.exitCode=2;}
