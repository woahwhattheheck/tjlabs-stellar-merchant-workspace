#!/usr/bin/env node
// MIT. Original Request handoff through a selected private customer and owned foreground operation.
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preparationReadJson,preparationPrivateDirectory,preparationAbsolute} from '../connection.mjs';
import {discoverPipelineRequest,seedPreparedPipelineRequest} from './request-handoff.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function main(argv=process.argv.slice(2),{signal}={}){
 const [action,...tokens]=argv;
 if(!['catalog','seed'].includes(action))fail('PREPARATION_REQUEST_ACTION_REQUIRED');
 const names=action==='catalog'?['customer','merchant-origin']:['customer','merchant-origin','order-directory',
  'expected-order-sha256','expected-catalog-sha256','reference','label'];
 const values={};
 for(let index=0;index<tokens.length;index+=2){
  const key=tokens[index],value=tokens[index+1];
  if(typeof key!=='string'||!key.startsWith('--')||!names.includes(key.slice(2))||
   value===undefined||value.startsWith('--')||Object.hasOwn(values,key.slice(2)))fail('PREPARATION_REQUEST_ARGUMENT_INVALID');
  values[key.slice(2)]=value;
 }
 if(names.some(name=>!Object.hasOwn(values,name)))fail('PREPARATION_REQUEST_ARGUMENT_REQUIRED');
 const path=preparationAbsolute(values.customer);await preparationPrivateDirectory(dirname(path));
 const customer=(await preparationReadJson(path,{maximum:65536})).value;
 const common={customer,merchantOrigin:values['merchant-origin'],signal};
 return action==='catalog'?discoverPipelineRequest(common):seedPreparedPipelineRequest({...common,
  orderDirectory:preparationAbsolute(values['order-directory']),expectedOrderSha256:values['expected-order-sha256'],
  expectedCatalogSha256:values['expected-catalog-sha256'],reference:values.reference,label:values.label});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const controller=new AbortController();
 const stop=()=>controller.abort(Object.assign(new Error('PREPARATION_REQUEST_CANCELLED'),{code:'PREPARATION_REQUEST_CANCELLED'}));
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{const result=await main(undefined,{signal:controller.signal});process.stdout.write(JSON.stringify(result)+'\n');}
 catch(error){process.stderr.write(JSON.stringify({error:error.code??'PREPARATION_REQUEST_FAILED',
  ...(error.requestId?{requestId:error.requestId}:{}),...(Number.isInteger(error.status)?{status:error.status}:{})})+'\n');process.exitCode=1;}
 finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
