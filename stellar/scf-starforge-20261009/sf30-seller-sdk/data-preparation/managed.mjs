// MIT. Installed Node entry point for the original managed Python engine.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {preparationNeed,preparationAbsolute,PREPARATION_HASH,PREPARATION_DEFAULT_RECEIVING_BYTES} from './connection.mjs';
export function preparationManagedOptions(args){
  const selected={directory:null,port:0,label:'Data preparation'};
  const flags=new Map([['--workspace','directory'],['--workspace-sha256','workspaceSha256'],['--port','port'],['--label','label']]);
  const seen=new Set();
  for(let i=0;i<args.length;i+=2){
    const key=flags.get(args[i]),value=args[i+1];
    preparationNeed(key&&!seen.has(key)&&typeof value==='string'&&value.length>0,'PREPARATION_MANAGED_ARGUMENTS',
      'Use --workspace, optional --workspace-sha256, --label and --port once each.');
    seen.add(key);selected[key]=value;
  }
  preparationAbsolute(selected.directory);
  preparationNeed(selected.workspaceSha256===undefined||PREPARATION_HASH.test(selected.workspaceSha256),
    'PREPARATION_WORKSPACE_SHA_INVALID','Use the saved original workspace SHA-256.');
  preparationNeed(/^(0|[1-9][0-9]*)$/.test(String(selected.port))&&Number(selected.port)<=65535,
    'PREPARATION_PORT_INVALID','Use a port from 0 to 65535.');
  selected.port=Number(selected.port);
  preparationNeed(selected.label.trim().length>=1&&selected.label.length<=128&&!/[\x00-\x1f\x7f]/.test(selected.label),
    'PREPARATION_LABEL_INVALID','Use an original workspace label of 1–128 printable characters.');
  return selected;
}
const engine=fileURLToPath(new URL('./managed.py',import.meta.url));
export function preparationPython(){return process.env.STARFORGE_PYTHON||'python3';}
export function runPreparationNative(args,{signal,maxOutputBytes=2*1024*1024}={}){
  return new Promise((accept,reject)=>{
    const child=spawn(preparationPython(),[engine,...args],{stdio:['ignore','pipe','pipe'],shell:false,signal});
    const stdout=[],stderr=[];let output=0,error;
    const receive=parts=>chunk=>{
      output+=chunk.length;
      if(output>maxOutputBytes){error=Object.assign(new Error('The original receiving response exceeded its metadata allowance.'),{code:'PREPARATION_NATIVE_OUTPUT'});child.kill('SIGTERM');return;}
      parts.push(chunk);
    };
    child.stdout.on('data',receive(stdout));child.stderr.on('data',receive(stderr));
    child.once('error',reject);
    child.once('close',code=>{
      if(error)return reject(error);
      const text=Buffer.concat(stdout).toString('utf8').trim();
      if(code!==0){let detail;try{detail=JSON.parse(Buffer.concat(stderr).toString('utf8').trim()).error;}catch{}
        return reject(Object.assign(new Error(detail||'The original preparation command failed.'),{code:'PREPARATION_NATIVE_FAILED',exitCode:code}));}
      try{accept(JSON.parse(text));}catch(cause){reject(Object.assign(new Error('The original command returned invalid receiving metadata.'),{cause,code:'PREPARATION_NATIVE_RESPONSE'}));}
    });
  });
}
export async function receivePreparationWorkspace({archive,directory,expectedSha256,maxBytes=PREPARATION_DEFAULT_RECEIVING_BYTES,signal}){
  preparationAbsolute(archive);preparationAbsolute(directory);
  preparationNeed(PREPARATION_HASH.test(expectedSha256)&&Number.isSafeInteger(maxBytes)&&maxBytes>0,
    'PREPARATION_RECEIVING_ARGUMENTS','Choose the complete archive SHA-256 and positive expanded receiving allowance.');
  return runPreparationNative(['receive','--workspace',directory,'--archive',archive,'--sha256',expectedSha256,'--max-bytes',String(maxBytes)],{signal});
}
export function inspectReceivedPreparation(directory,options){
  preparationAbsolute(directory);return runPreparationNative(['received','--workspace',directory],options);
}
export async function runManagedPreparation(args=process.argv.slice(2)){
  preparationManagedOptions(args);
  const child=spawn(preparationPython(),[engine,'serve',...args],{stdio:'inherit',shell:false});
  const forward=signal=>()=>child.kill(signal),interrupt=forward('SIGINT'),terminate=forward('SIGTERM');
  process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
  try{
    return await new Promise((accept,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>accept(code??(signal==='SIGINT'?130:143)));});
  }finally{process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.exitCode=await runManagedPreparation();}
  catch(error){console.error(JSON.stringify({error:error.message,code:error.code}));process.exitCode=1;}
}
