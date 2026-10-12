// MIT. Native typed-client implementation over the single Python project engine.
import {spawn} from 'node:child_process';
import {readFile,open,mkdir,link,unlink,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const CLI=fileURLToPath(new URL('./cli.py',import.meta.url));
const hash=/^[a-f0-9]{64}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export class DbtProjectError extends Error{
  constructor(code,message=code,details={}){super(message);this.name='DbtProjectError';this.code=code;Object.assign(this,details);}
}
export function ensure(value,code,message){if(!value)throw new DbtProjectError(code,message);}
export async function digestFile(path){
  const source=await open(path,'r');const h=createHash('sha256');let bytes=0;
  try{const before=await source.stat();ensure(before.isFile(),'REGULAR_FILE_REQUIRED');for await(const chunk of source.createReadStream({autoClose:false})){h.update(chunk);bytes+=chunk.length;}const after=await source.stat();ensure(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&bytes===before.size,'INPUT_CHANGED');return {sha256:h.digest('hex'),bytes};}finally{await source.close();}
}
/** Complete native JSON responses; optional byte ceiling does not truncate output. */
export class DbtProjectClient{
  #tasks=new Set();#closed=false;
  constructor({directory,python=process.env.STARFORGE_PYTHON||'python3',maxResponseBytes=64*1024*1024}={}){
    ensure(typeof directory==='string'&&directory.length>0,'PROJECT_REQUIRED');ensure(typeof python==='string'&&python.length>0,'PYTHON_REQUIRED');
    ensure(Number.isSafeInteger(maxResponseBytes)&&maxResponseBytes>0,'INVALID_RESPONSE_LIMIT');
    this.directory=resolve(directory);this.python=python;this.maxResponseBytes=maxResponseBytes;
  }
  #execute(args,input,{signal}={}){
    ensure(!this.#closed,'DBT_CLIENT_CLOSED');ensure(!signal?.aborted,'CANCELLED');
    const task=new Promise((resolveTask,reject)=>{
      const child=spawn(this.python,[CLI,'--project',this.directory,...args],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
      const stdout=[],stderr=[];let size=0,errSize=0,failure=null;
      const cancel=()=>{failure??=new DbtProjectError('CANCELLED');child.kill('SIGTERM');};
      signal?.addEventListener('abort',cancel,{once:true});
      child.stdout.on('data',chunk=>{size+=chunk.length;if(size>this.maxResponseBytes){failure??=new DbtProjectError('DBT_RESPONSE_TOO_LARGE','Use native report/export or a smaller resource page for this complete result.');child.kill('SIGTERM');}else stdout.push(chunk);});
      child.stderr.on('data',chunk=>{errSize+=chunk.length;if(errSize<=128*1024)stderr.push(chunk);});
      child.on('error',error=>{failure??=new DbtProjectError('DBT_PROCESS_START_FAILED',error.message);});
      child.stdin.on('error',error=>{if(error.code!=='EPIPE')failure??=error;});
      child.on('close',(code,termination)=>{
        signal?.removeEventListener('abort',cancel);
        if(failure)return reject(failure);
        if(code!==0){let error;try{error=JSON.parse(Buffer.concat(stderr).toString('utf8'));}catch{error={error:'DBT_PROCESS_FAILED',message:'Native project command failed.'};}return reject(new DbtProjectError(error.error,error.message,{exitCode:code,signal:termination}));}
        try{resolveTask(JSON.parse(Buffer.concat(stdout).toString('utf8')));}catch(error){reject(new DbtProjectError('DBT_RESPONSE_INVALID',error.message));}
      });
      child.stdin.end(input===undefined?undefined:JSON.stringify(input));
    });
    this.#tasks.add(task);task.finally(()=>this.#tasks.delete(task)).catch(()=>{});return task;
  }
  create(title){return this.#execute(['create','--title',title]);}
  invoke(action,input={},options={}){ensure(typeof action==='string'&&plain(input),'INVALID_OPERATION');return this.#execute(['invoke',action,'--input','-'],input,options);}
  status(){return this.invoke('status');}
  artifacts(){return this.invoke('artifacts');}
  editions(){return this.invoke('editions');}
  import(file,expected_sha){return this.invoke('import',{file:resolve(file),...(expected_sha?{expected_sha}:{})});}
  createEdition(input){return this.invoke('edition.create',input);}
  nodes(edition,input={}){return this.invoke('nodes',{edition,...input});}
  node(edition,uid){return this.invoke('node',{edition,uid});}
  compare(before,after){return this.invoke('compare',{before,after});}
  saveReview(input){return this.invoke('review.save',input);}
  bindResult(input){return this.invoke('result.bind',input);}
  report(edition,{review,format='json',output}={}){return this.invoke('report',{edition,format,...(review?{review}:{}),...(output?{output:resolve(output)}:{})});}
  export(output,expected_archive_sha){return this.invoke('export',{output:resolve(output),...(expected_archive_sha?{expected_archive_sha}:{})});}
  receive(archive_file,destination,expected_sha){return this.invoke('receive',{archive_file:resolve(archive_file),destination:resolve(destination),expected_sha});}
  async copyObject(sha256,output){
    ensure(hash.test(sha256),'INVALID_HASH');await this.invoke('object.describe',{sha256});
    const destination=resolve(output),temporary=join(dirname(destination),'.dbt-copy-'+randomUUID());
    const source=await open(join(this.directory,'objects',sha256),'r');let sink;const h=createHash('sha256');let bytes=0;
    try{sink=await open(temporary,'wx',0o600);for await(const chunk of source.createReadStream({autoClose:false})){h.update(chunk);bytes+=chunk.length;let offset=0;while(offset<chunk.length){const result=await sink.write(chunk,offset,chunk.length-offset);ensure(result.bytesWritten>0,'COPY_STOPPED');offset+=result.bytesWritten;}}ensure(h.digest('hex')===sha256,'OBJECT_CHANGED');await sink.sync();await sink.close();sink=null;await link(temporary,destination);return {path:destination,sha256,bytes};}finally{await source.close();await sink?.close();await unlink(temporary).catch(()=>{});}
  }
  async close(){this.#closed=true;await Promise.allSettled([...this.#tasks]);}
}
export async function readDbtProjectConfiguration(file){
  file=resolve(file);const mode=await stat(file);ensure(mode.isFile()&&(process.platform==='win32'||(mode.mode&0o077)===0),'PRIVATE_CONFIGURATION_REQUIRED');
  const value=JSON.parse(await readFile(file,'utf8'));
  ensure(plain(value)&&value.schema==='stellar-forge.dbt-project-connections.v1'&&plain(value.workspaces),'DBT_CONFIGURATION_INVALID');
  const workspaces={};
  for(const [alias,entry]of Object.entries(value.workspaces)){
    ensure(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(alias)&&plain(entry)&&typeof entry.directory==='string','DBT_CONFIGURATION_INVALID');
    const inputs={};for(const [name,input]of Object.entries(entry.inputs??{})){ensure(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)&&plain(input)&&typeof input.path==='string'&&hash.test(input.sha256),'DBT_INPUT_INVALID');inputs[name]={...input,path:resolve(dirname(file),input.path)};}
    workspaces[alias]={...entry,directory:resolve(dirname(file),entry.directory),inputs,
      exportsDirectory:resolve(dirname(file),entry.exportsDirectory??join(entry.directory,'exports')),
      receiveRoot:resolve(dirname(file),entry.receiveRoot??join(entry.directory,'received'))};
  }
  return {...value,workspaces};
}
export async function readConfiguredInput(entry,alias,expected){
  const input=entry.inputs[alias];ensure(input,'DBT_INPUT_UNKNOWN');const actual=await digestFile(input.path);
  ensure(actual.sha256===input.sha256&&(!expected||expected===actual.sha256),'DBT_INPUT_CHANGED');return {...input,...actual};
}
