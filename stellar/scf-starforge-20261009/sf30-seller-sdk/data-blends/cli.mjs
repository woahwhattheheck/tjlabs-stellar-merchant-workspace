#!/usr/bin/env node
// MIT. The installed command delegates to the one native workspace engine.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function main(args=process.argv.slice(2)) {
  if(args[0]==='seller') {
    const {startBlendSellerWorkbench}=await import('./seller.mjs');
    const entries=new Map();
    for(let i=1;i<args.length;i+=2){if(!['--directory','--edition','--workspace','--port'].includes(args[i])||!args[i+1]||entries.has(args[i]))throw Error('Use seller --directory PROJECT --edition UUID --workspace PRIVATE_QUERY_SETUP [--port 0].');entries.set(args[i],args[i+1]);}
    const service=await startBlendSellerWorkbench({directory:entries.get('--directory'),edition:entries.get('--edition'),workspace:entries.get('--workspace'),port:Number(entries.get('--port')??0)});
    process.stdout.write('Private SQLite merchant workbench: '+service.url+'\n');
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>service.close().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;}));
    return service;
  }
  let python=process.env.STARFORGE_PYTHON||'python3';
  const positions=args.flatMap((v,i)=>v==='--python'?[i]:[]);
  if(positions.length){if(positions.length!==1||!args[positions[0]+1])throw Error('Supply one Python executable.');const index=positions[0];python=args[index+1];args=[...args.slice(0,index),...args.slice(index+2)];}
  return new Promise((done,reject)=>{
    const child=spawn(python,['-u',fileURLToPath(new URL('./cli.py',import.meta.url)),...args],{stdio:'inherit',shell:false,windowsHide:true});
    const interrupt=()=>child.kill('SIGINT'),terminate=()=>child.kill('SIGTERM');
    process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
    child.once('error',reject);child.once('close',(code,signal)=>{process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);process.exitCode=code??(signal==='SIGINT'?130:1);done({code,signal});});
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
