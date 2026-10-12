// MIT. One retained native process per client; complete exports use file streams.
import {spawn} from 'node:child_process';
import {open,readFile,link,unlink,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const CLI=fileURLToPath(new URL('./cli.py',import.meta.url));
const HASH=/^[a-f0-9]{64}$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export class BlendClientError extends Error {constructor(code,message=code){super(message);this.name='BlendClientError';this.code=code;}}
export function ensure(value,message){if(!value)throw new BlendClientError('BLEND_CLIENT_INPUT',message);}
export async function digestFile(path){const file=await open(path,'r'),hash=createHash('sha256');let bytes=0;try{const before=await file.stat();ensure(before.isFile(),'Choose a regular file.');for await(const block of file.createReadStream({autoClose:false})){hash.update(block);bytes+=block.length;}const after=await file.stat();ensure(before.dev===after.dev&&before.ino===after.ino&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&before.size===bytes&&after.size===bytes,'The selected file changed while reading.');return {bytes,sha256:hash.digest('hex'),dev:after.dev,ino:after.ino,mtimeMs:after.mtimeMs,ctimeMs:after.ctimeMs};}finally{await file.close();}}

export class BlendClient {
  #child;#pending=new Map();#buffer='';#closed=false;#failure;#ended;
  constructor({directory,python=process.env.STARFORGE_PYTHON||'python3',maxResponseBytes=20*1024*1024}={}) {
    ensure(typeof directory==='string'&&directory.length>0,'Select an initialized workspace.');
    ensure(typeof python==='string'&&python.length>0,'Select a Python executable.');
    ensure(Number.isSafeInteger(maxResponseBytes)&&maxResponseBytes>0,'Use a positive complete-response ceiling.');
    this.directory=resolve(directory);this.python=python;this.maxResponseBytes=maxResponseBytes;
  }
  #start(){
    if(this.#child)return;
    const child=this.#child=spawn(this.python,['-u',CLI,'bridge','--directory',this.directory],{stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true});
    let stderr='';
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stderr.on('data',part=>{if(stderr.length<32768)stderr+=part.slice(0,32768-stderr.length);});
    child.stdout.on('data',part=>{
      this.#buffer+=part;
      if(Buffer.byteLength(this.#buffer)>this.maxResponseBytes){this.#fail(new BlendClientError('BLEND_RESPONSE_TOO_LARGE','Read a smaller row page or receive a complete export.'));child.kill();return;}
      for(let index;(index=this.#buffer.indexOf('\n'))>=0;){
        const line=this.#buffer.slice(0,index);this.#buffer=this.#buffer.slice(index+1);
        try{const value=JSON.parse(line),waiting=this.#pending.get(value.id);if(!waiting)throw Error('Unknown native response identity.');this.#pending.delete(value.id);if(value.error)waiting.reject(Object.assign(new BlendClientError(value.error.code,value.error.message),{status:value.error.status}));else waiting.resolve(value.result);}
        catch(error){this.#fail(new BlendClientError('BLEND_RESPONSE_INVALID',error.message));child.kill();}
      }
    });
    child.stdin.on('error',error=>{if(error.code!=='EPIPE')this.#fail(error);});
    child.once('error',error=>this.#fail(new BlendClientError('BLEND_PROCESS_START',error.message)));
    this.#ended=new Promise(done=>child.once('close',(code,signal)=>{if(this.#pending.size||code!==0){let text='Native workspace process ended. Resume saved operations with their original IDs.';try{text=JSON.parse(stderr).error?.message??text;}catch{}this.#fail(new BlendClientError('BLEND_PROCESS_EXIT',text));}done({code,signal});}));
  }
  #fail(error){this.#failure??=error;for(const item of this.#pending.values())item.reject(this.#failure);this.#pending.clear();}
  invoke(action,input={}) {
    if(this.#closed)return Promise.reject(new BlendClientError('BLEND_CLIENT_CLOSED'));
    if(this.#failure)return Promise.reject(this.#failure);
    ensure(typeof action==='string'&&plain(input),'Expected an action and an input object.');
    this.#start();const id=randomUUID(),line=JSON.stringify({id,action,input})+'\n';
    ensure(Buffer.byteLength(line)<=20*1024*1024,'Control input exceeds 20 MiB. Use retained file inputs.');
    const task=new Promise((resolveTask,reject)=>{this.#pending.set(id,{resolve:resolveTask,reject});this.#child.stdin.write(line,error=>{if(error){this.#pending.delete(id);reject(error);}});});
    return task;
  }
  state(options={}){return this.invoke('state',options);}
  importCSV(file,label,{request=randomUUID(),delimiter=',',nullToken=null,expectedSha256,sourceReference=''}={}){return this.invoke('source.import',{file:resolve(file),label,request,delimiter,null_token:nullToken,source_reference:sourceReference,...(expectedSha256?{expected_sha256:expectedSha256}:{})});}
  saveRecipe(spec,{request=randomUUID(),recipe=null,expectedVersion=0}={}){return this.invoke('recipe.save',{spec,request,recipe,expected_version:expectedVersion});}
  run(recipe,version,{request=randomUUID()}={}){return this.invoke('run',{recipe,version,request});}
  rows(edition,{after=0,limit=100}={}){return this.invoke('rows',{edition,after,limit});}
  review(edition,{decision,note='',reviewer,expectedRevision=0,request=randomUUID()}={}){return this.invoke('review',{edition,decision,note,reviewer,expected_revision:expectedRevision,request});}
  export(edition,{kind='customer',request=randomUUID(),nullToken='\\N'}={}){return this.invoke('export',{edition,kind,request,null_token:nullToken});}
  backup({request=randomUUID()}={}){return this.invoke('backup',{request});}
  resume(request){return this.invoke('resume',{request});}
  async copyExport(request,destination){
    const operation=await this.invoke('operation',{request});ensure(operation.state==='complete'&&operation.result?.filename,'Select a completed export.');
    const {path}=await this.invoke('export.path',{request});const target=resolve(destination),temporary=join(dirname(target),'.blend-copy-'+randomUUID());
    const source=await open(path,'r');let sink;const hash=createHash('sha256');let bytes=0;
    try{sink=await open(temporary,'wx',0o600);for await(const block of source.createReadStream({autoClose:false})){hash.update(block);bytes+=block.length;let offset=0;while(offset<block.length){const written=await sink.write(block,offset,block.length-offset);ensure(written.bytesWritten>0,'Export copy stopped.');offset+=written.bytesWritten;}}
      ensure(bytes===operation.result.bytes&&hash.digest('hex')===operation.result.sha256,'Retained export changed.');await sink.sync();await sink.close();sink=null;await link(temporary,target);return {path:target,bytes,sha256:operation.result.sha256};
    }finally{await source.close();await sink?.close();await unlink(temporary).catch(()=>{});}
  }
  interrupt(){if(this.#child)this.#child.kill('SIGINT');}
  async close(){if(this.#closed)return this.#ended;this.#closed=true;if(!this.#child)return;this.#child.stdin.end();return this.#ended;}
}
export async function readBlendConfiguration(file){
  file=resolve(file);const info=await stat(file);ensure(info.isFile()&&info.size<=1024*1024&&(process.platform==='win32'||(info.mode&0o077)===0),'Configuration must be a private regular file, up to 1 MiB.');
  const value=JSON.parse(await readFile(file,'utf8'));ensure(value.schema==='stellar-forge.data-blends-connections.v1'&&plain(value.workspaces),'Unsupported data-blends configuration.');
  const workspaces={};
  for(const [alias,entry]of Object.entries(value.workspaces)){
    ensure(/^[a-z][a-z0-9_-]{0,63}$/.test(alias)&&plain(entry)&&typeof entry.directory==='string','Invalid configured workspace.');
    const inputs={};for(const [key,item]of Object.entries(entry.inputs??{})){ensure(/^[a-z][a-z0-9_-]{0,63}$/.test(key)&&plain(item)&&typeof item.path==='string'&&HASH.test(item.sha256),'Configured inputs need a path and exact SHA-256.');inputs[key]={...item,path:resolve(dirname(file),item.path)};}
    workspaces[alias]={...entry,directory:resolve(dirname(file),entry.directory),inputs,receiveRoot:resolve(dirname(file),entry.receiveRoot??dirname(entry.directory))};
  }
  return {workspaces};
}
