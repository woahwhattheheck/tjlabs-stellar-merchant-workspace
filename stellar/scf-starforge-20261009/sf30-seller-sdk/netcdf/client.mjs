// MIT. One retained native process and complete digest-verified original receiving.
import {spawn} from 'node:child_process';
import {open,readFile,lstat,stat,link,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CLI=fileURLToPath(new URL('./cli.py',import.meta.url));
const SHA=/^[a-f0-9]{64}$/;
const ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
export const NETCDF_CONFIGURATION_SCHEMA='stellar-forge.netcdf-connections.v1';
export const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export class NetCDFError extends Error{
  constructor(code,message=code,details={}){super(message);this.name='NetCDFError';this.code=code;this.details=details;}
}
export function need(value,code,message){if(!value)throw new NetCDFError(code,message);}

/** Read the whole selected file through one open descriptor; changing inputs fail. */
export async function digestFile(path){
  const file=await open(path,'r');
  const hash=createHash('sha256');let bytes=0;
  try{
    const before=await file.stat();need(before.isFile(),'NETCDF_REGULAR_FILE_REQUIRED');
    for await(const chunk of file.createReadStream({autoClose:false})){hash.update(chunk);bytes+=chunk.length;}
    const after=await file.stat();
    need(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&
      before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&bytes===before.size,
      'NETCDF_INPUT_CHANGED','The complete selected input changed while it was read.');
    return {sha256:hash.digest('hex'),bytes};
  }finally{await file.close();}
}

/** Every request shares the same native workspace, libnetcdf process and journal. */
export class NetCDFWorkspaceClient{
  #child;#pending=new Map();#next=0;#parts=[];#bytes=0;#stderr='';#closing=false;#failure;
  #ended;#resolveEnded;#writeQueue=Promise.resolve();
  constructor({directory,python=process.env.STARFORGE_PYTHON??'python3',maxResponseBytes=256*1024*1024}={}){
    need(typeof directory==='string'&&directory.length>0,'NETCDF_DIRECTORY_REQUIRED');
    need(typeof python==='string'&&python.length>0&&!python.includes('\0'),'NETCDF_PYTHON_REQUIRED');
    need(Number.isSafeInteger(maxResponseBytes)&&maxResponseBytes>=65536,'NETCDF_RESPONSE_LIMIT_INVALID');
    this.directory=resolve(directory);this.python=python;this.maxResponseBytes=maxResponseBytes;
    this.#ended=new Promise(done=>{this.#resolveEnded=done;});
    this.#child=spawn(python,['-B','-u',CLI,'--workspace',this.directory,'rpc'],{
      stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true,
    });
    this.#child.stdout.on('data',chunk=>this.#receive(chunk));
    this.#child.stderr.on('data',chunk=>{this.#stderr=(this.#stderr+chunk.toString('utf8')).slice(-16384);});
    this.#child.on('error',error=>this.#fail(new NetCDFError('NETCDF_PROCESS_START_FAILED',error.message)));
    this.#child.stdin.on('error',error=>this.#fail(new NetCDFError('NETCDF_PROCESS_INPUT_FAILED',error.message)));
    this.#child.on('close',(code,signal)=>{
      if(this.#bytes!==0)this.#fail(new NetCDFError('NETCDF_RESPONSE_INCOMPLETE','The native response ended before its complete JSON line.'));
      if(this.#pending.size||code!==0)this.#fail(new NetCDFError('NETCDF_PROCESS_EXITED',
        `The native workspace process exited (${code??signal}).`,{exitCode:code,signal,stderr:this.#stderr}));
      this.#closing=true;this.#resolveEnded({code,signal});
    });
  }
  get processId(){return this.#child.pid;}
  #fail(error){
    this.#failure??=error;
    for(const pending of this.#pending.values())pending.reject(this.#failure);
    this.#pending.clear();
  }
  #receive(chunk){
    let start=0,end;
    while((end=chunk.indexOf(10,start))!==-1){
      const part=chunk.subarray(start,end);this.#parts.push(part);this.#bytes+=part.length;
      if(this.#bytes>this.maxResponseBytes){this.#overflow();return;}
      try{
        const response=JSON.parse(Buffer.concat(this.#parts,this.#bytes).toString('utf8'));
        const pending=this.#pending.get(response.id);
        need(pending&&plain(response),'NETCDF_RESPONSE_UNEXPECTED','The native response does not match an original request.');
        need(Object.hasOwn(response,'result')!==Object.hasOwn(response,'error'),'NETCDF_RESPONSE_INVALID');
        this.#pending.delete(response.id);
        if(response.error)pending.reject(new NetCDFError(response.error.code??'NETCDF_NATIVE_ERROR',
          response.error.message??'The native operation failed.',response.error.details??{}));
        else pending.resolve(response.result);
      }catch(error){this.#fail(error);this.#child.kill('SIGTERM');return;}
      this.#parts=[];this.#bytes=0;start=end+1;
    }
    if(start<chunk.length){this.#parts.push(chunk.subarray(start));this.#bytes+=chunk.length-start;}
    if(this.#bytes>this.maxResponseBytes)this.#overflow();
  }
  #overflow(){
    this.#fail(new NetCDFError('NETCDF_RESPONSE_TOO_LARGE',
      'The complete native response exceeds the configured ceiling. Read all explicit pages or receive the original complete object.'));
    this.#child.kill('SIGTERM');
  }
  call(method,params={}){
    if(this.#failure)return Promise.reject(this.#failure);
    if(this.#closing)return Promise.reject(new NetCDFError('NETCDF_CLIENT_CLOSED'));
    if(typeof method!=='string'||!method||!plain(params))return Promise.reject(new TypeError('Use a native method and object parameters.'));
    const id=this.#next++;
    let line;try{line=JSON.stringify({id,method,params})+'\n';}catch(error){return Promise.reject(error);}
    return new Promise((resolveResult,reject)=>{
      this.#pending.set(id,{resolve:resolveResult,reject});
      this.#writeQueue=this.#writeQueue.then(()=>new Promise((done,failed)=>{
        if(this.#failure){failed(this.#failure);return;}
        this.#child.stdin.write(line,error=>error?failed(error):done());
      }));
      this.#writeQueue.catch(error=>this.#fail(new NetCDFError('NETCDF_PROCESS_INPUT_FAILED',error.message)));
    });
  }
  binding(){return this.call('binding');}
  overview(){return this.call('overview');}
  sources(){return this.call('sources');}
  source(id){return this.call('source',{id});}
  importFile(path,options={}){return this.call('import',{...options,path:resolve(path)});}
  variables(source_id,options={}){return this.call('variables',{...options,source_id});}
  variable(source_id,path){return this.call('variable',{source_id,path});}
  preview(source_id,path,options={}){return this.call('preview',{...options,source_id,path});}
  saveSelection(input){return this.call('selection.save',input);}
  selections(){return this.call('selections');}
  selection(id){return this.call('selection',{id});}
  run(selection_id,options={}){return this.call('run',{...options,selection_id});}
  runs(){return this.call('runs');}
  result(id){return this.call('run.get',{id});}
  saveReview(input){return this.call('review.save',input);}
  reviews(){return this.call('reviews');}
  report(run_id){return this.call('report',{run_id});}
  objectDescribe(sha256){return this.call('object.describe',{sha256});}
  objectRead(sha256,{offset=0,limit=262144}={}){return this.call('object.read',{sha256,offset,limit});}
  exportProject(output){return this.call('export',output?{output:resolve(output)}:{});}
  receiveProject(path,destination,expected_sha){return this.call('receive',{path:resolve(path),destination:resolve(destination),expected_sha});}
  async *allVariables(source_id,{pageSize=100,query}={}){
    let offset=0;
    do{
      const page=await this.variables(source_id,{offset,limit:pageSize,...(query===undefined?{}:{query})});
      need(Array.isArray(page.items)&&(page.next_offset===null||page.next_offset>offset),'NETCDF_PAGE_INVALID');
      yield* page.items;offset=page.next_offset;
    }while(offset!==null);
  }
  async *previewRows(source_id,path,{pageSize=100,...options}={}){
    let offset=0;
    do{
      const page=await this.preview(source_id,path,{...options,offset,limit:pageSize});
      need(Array.isArray(page.items)&&(page.next_offset===null||page.next_offset>offset),'NETCDF_PAGE_INVALID');
      yield* page.items;offset=page.next_offset;
    }while(offset!==null);
  }
  /** Chunks keep their original SHA and offset and continue through the complete EOF. */
  async *objectChunks(sha256,{offset=0,pageBytes=262144}={}){
    need(SHA.test(sha256)&&Number.isSafeInteger(offset)&&offset>=0&&
      Number.isSafeInteger(pageBytes)&&pageBytes>0&&pageBytes<=4*1024*1024,'NETCDF_OBJECT_RANGE_INVALID');
    const object=await this.objectDescribe(sha256);
    need(object.sha256===sha256&&Number.isSafeInteger(object.bytes)&&offset<=object.bytes,'NETCDF_OBJECT_CHANGED');
    while(offset<object.bytes){
      const page=await this.objectRead(sha256,{offset,limit:pageBytes});
      need(page.sha256===sha256&&page.offset===offset&&page.total===object.bytes&&typeof page.base64==='string'&&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(page.base64),'NETCDF_OBJECT_CHANGED');
      const bytes=Buffer.from(page.base64,'base64'),end=offset+bytes.length;
      need(bytes.length>0&&bytes.length<=pageBytes&&end<=object.bytes&&
        page.next_offset===(end===object.bytes?null:end),'NETCDF_OBJECT_RANGE_INVALID');
      yield {sha256,offset,total:object.bytes,bytes,next_offset:page.next_offset};offset=end;
    }
  }
  /** Create-only complete receiving; exact completed copies are safe to reopen. */
  async copyObject(sha256,output,{pageBytes=262144}={}){
    need(SHA.test(sha256),'NETCDF_HASH_INVALID');const target=resolve(output),object=await this.objectDescribe(sha256);
    try{
      const existing=await lstat(target);need(existing.isFile()&&!existing.isSymbolicLink(),'NETCDF_RECEIVE_CONFLICT');
      const received=await digestFile(target);need(received.sha256===sha256&&received.bytes===object.bytes,
        'NETCDF_RECEIVE_CONFLICT','The destination belongs to different bytes.');
      return {path:target,...received};
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const temporary=join(dirname(target),'.netcdf-receiving-'+randomUUID());
    const sink=await open(temporary,'wx',0o600);const hash=createHash('sha256');let count=0;
    try{
      for await(const chunk of this.objectChunks(sha256,{pageBytes})){
        let position=0;
        while(position<chunk.bytes.length){const written=await sink.write(chunk.bytes,position,chunk.bytes.length-position);need(written.bytesWritten>0,'NETCDF_COPY_STOPPED');position+=written.bytesWritten;}
        count+=chunk.bytes.length;hash.update(chunk.bytes);
      }
      need(count===object.bytes&&hash.digest('hex')===sha256,'NETCDF_OBJECT_CHANGED','The complete received bytes differ from their native identity.');
      await sink.sync();await sink.close();
      try{await link(temporary,target);}catch(error){
        if(error.code!=='EEXIST')throw error;
        const other=await digestFile(target);need(other.sha256===sha256&&other.bytes===count,'NETCDF_RECEIVE_CONFLICT');
      }
      return {path:target,sha256,bytes:count};
    }finally{await sink.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
  }
  async close(){
    if(!this.#closing){this.#closing=true;await this.#writeQueue.catch(()=>{});this.#child.stdin.end();}
    return this.#ended;
  }
}
export {NetCDFWorkspaceClient as NetCDFClient};

export async function readNetCDFConfiguration(file){
  file=resolve(file);const mode=await lstat(file);
  need(mode.isFile()&&!mode.isSymbolicLink()&&(process.platform==='win32'||(mode.mode&0o077)===0),'NETCDF_PRIVATE_CONFIGURATION_REQUIRED');
  const value=JSON.parse(await readFile(file,'utf8'));
  need(plain(value)&&value.schema===NETCDF_CONFIGURATION_SCHEMA&&plain(value.workspaces),'NETCDF_CONFIGURATION_INVALID');
  const workspaces={};
  for(const [alias,entry]of Object.entries(value.workspaces)){
    need(ALIAS.test(alias)&&plain(entry)&&typeof entry.directory==='string'&&entry.directory,'NETCDF_CONFIGURATION_INVALID');
    const directory=resolve(dirname(file),entry.directory),inputs={};
    for(const [name,input]of Object.entries(entry.inputs??{})){
      need(ALIAS.test(name)&&plain(input)&&typeof input.path==='string'&&SHA.test(input.sha256),'NETCDF_INPUT_INVALID');
      inputs[name]={...input,path:resolve(dirname(file),input.path)};
    }
    if(entry.python!==undefined)need(typeof entry.python==='string'&&entry.python&&!entry.python.includes('\0'),'NETCDF_PYTHON_REQUIRED');
    if(entry.project_id!==undefined)need(typeof entry.project_id==='string'&&entry.project_id,'NETCDF_CONFIGURATION_INVALID');
    if(entry.sha256!==undefined)need(SHA.test(entry.sha256),'NETCDF_CONFIGURATION_INVALID');
    workspaces[alias]={...entry,directory,inputs,
      exportsDirectory:resolve(dirname(file),entry.exportsDirectory??directory+'-deliveries'),
      receiveRoot:resolve(dirname(file),entry.receiveRoot??directory+'-received')};
  }
  return {...value,workspaces};
}
export async function readConfiguredInput(entry,alias,expected){
  need(ALIAS.test(alias)&&Object.hasOwn(entry.inputs??{},alias),'NETCDF_INPUT_UNKNOWN');
  const input=entry.inputs[alias],actual=await digestFile(input.path);
  need(actual.sha256===input.sha256&&expected===actual.sha256,'NETCDF_INPUT_CHANGED','The declared whole input differs from its selected SHA-256.');
  return {...input,...actual};
}
