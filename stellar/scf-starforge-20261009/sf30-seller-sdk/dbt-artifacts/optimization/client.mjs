// MIT. One retained Python process, complete responses and original project files.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {DbtProjectClient} from '../client.mjs';
export class OptimizationError extends Error{constructor(code,message){super(message??code);this.name='OptimizationError';this.code=code;}}
export class DbtOptimizationClient{
 #child;#pending=new Map();#next=0;#parts=[];#bytes=0;#tail='';#closing=false;#ended;#resolveEnded;#rejectEnded;#failure;
 constructor({directory,python=process.env.STARFORGE_PYTHON??'python3',maxResponseBytes=256*1024**2}={}){
  if(typeof directory!=='string'||!directory||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<65536)throw new TypeError('directory and a valid response ceiling are required');
  this.directory=resolve(directory);this.python=python;this.maxResponseBytes=maxResponseBytes;
  this.#ended=new Promise(resolve=>{this.#resolveEnded=resolve;});
  this.#child=spawn(python,[fileURLToPath(new URL('./cli.py',import.meta.url)),'--project',this.directory,'stdio'],{stdio:['pipe','pipe','pipe'],shell:false});
  this.#child.stdout.on('data',chunk=>this.#receive(chunk));
  this.#child.stderr.on('data',chunk=>{this.#tail=(this.#tail+chunk.toString('utf8')).slice(-16384);});
  this.#child.on('error',error=>this.#fail(new OptimizationError('PROCESS_START_FAILED',error.message)));
  this.#child.stdin.on('error',error=>this.#fail(new OptimizationError('PROCESS_INPUT_FAILED',error.message)));
  this.#child.on('close',(code,signal)=>{if(this.#pending.size||code!==0)this.#fail(new OptimizationError('PROCESS_EXITED',`Native process exited (${code??signal}). ${this.#tail}`));this.#resolveEnded({code,signal});});
 }
 #fail(error){this.#failure??=error;for(const request of this.#pending.values())request.reject(error);this.#pending.clear();}
 #receive(chunk){
  let start=0,end;
  while((end=chunk.indexOf(10,start))!==-1){const part=chunk.subarray(start,end);this.#parts.push(part);this.#bytes+=part.length;if(this.#bytes>this.maxResponseBytes){this.#fail(new OptimizationError('RESPONSE_TOO_LARGE','Use report plus complete file receiving for this population.'));this.#child.kill('SIGTERM');return;}
   try{const result=JSON.parse(Buffer.concat(this.#parts,this.#bytes).toString('utf8'));const request=this.#pending.get(result.id);if(!request)throw new OptimizationError('UNEXPECTED_NATIVE_RESPONSE');this.#pending.delete(result.id);if(result.error)request.reject(new OptimizationError(result.error.code,result.error.message));else request.resolve(result.result);}catch(error){this.#fail(error);this.#child.kill('SIGTERM');return;}
   this.#parts=[];this.#bytes=0;start=end+1;
  }
  if(start<chunk.length){const part=chunk.subarray(start);this.#parts.push(part);this.#bytes+=part.length;if(this.#bytes>this.maxResponseBytes){this.#fail(new OptimizationError('RESPONSE_TOO_LARGE'));this.#child.kill('SIGTERM');}}
 }
 call(action,input={}){
  if(this.#failure)return Promise.reject(this.#failure);if(this.#closing)return Promise.reject(new OptimizationError('CLIENT_CLOSED'));
  if(typeof action!=='string'||!input||Array.isArray(input)||typeof input!=='object')return Promise.reject(new TypeError('action and object input are required'));
  const id=this.#next++;
  return new Promise((resolveResult,reject)=>{this.#pending.set(id,{resolve:resolveResult,reject});let body;try{body=JSON.stringify({id,action,input})+'\n';}catch(error){this.#pending.delete(id);reject(error);return;}this.#child.stdin.write(body,error=>{if(error){this.#pending.delete(id);reject(error);}});});
 }
 inventory(){return this.call('inventory');}
 profile(selection){return this.call('profile',selection);}
 compare(before,after){return this.call('compare',{before,after});}
 plans(name){return this.call('plans',name?{name}:{});}
 plan(id){return this.call('plan',{id});}
 save(input){return this.call('save',input);}
 report(input){return this.call('report',input);}
 export(output,expected_archive_sha){return this.call('export',{output:resolve(output),...(expected_archive_sha?{expected_archive_sha}:{})});}
 receive(archive_file,destination,expected_sha){return this.call('receive',{archive_file:resolve(archive_file),destination:resolve(destination),expected_sha});}
 async copyObject(sha256,output){const native=new DbtProjectClient({directory:this.directory,python:this.python});try{return await native.copyObject(sha256,output);}finally{await native.close();}}
 async close(){if(!this.#closing){this.#closing=true;this.#child.stdin.end();}return this.#ended;}
}
