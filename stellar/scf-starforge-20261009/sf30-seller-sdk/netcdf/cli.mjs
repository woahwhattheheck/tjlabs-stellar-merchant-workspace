#!/usr/bin/env node
// MIT. Installed command retains the complete original native CLI and listener.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);let python=process.env.STARFORGE_PYTHON??'python3';
const selected=args.indexOf('--python');
if(selected>=0){
  if(!args[selected+1])throw new TypeError('--python requires the existing native executable.');
  python=args[selected+1];args.splice(selected,2);
}
const child=spawn(python,[
  '-B','-u',fileURLToPath(new URL('./cli.py',import.meta.url)),...args,
],{stdio:'inherit',shell:false,windowsHide:true});
const signals=['SIGINT','SIGTERM'];
const handlers=new Map(signals.map(signal=>[signal,()=>child.kill(signal)]));
for(const [signal,handler]of handlers)process.on(signal,handler);
child.on('error',error=>{process.stderr.write(JSON.stringify({error:'NETCDF_PROCESS_START_FAILED',message:error.message})+'\n');process.exitCode=1;});
child.on('close',(code,signal)=>{
  for(const [name,handler]of handlers)process.off(name,handler);
  process.exitCode=code??(signal==='SIGINT'?130:143);
});
