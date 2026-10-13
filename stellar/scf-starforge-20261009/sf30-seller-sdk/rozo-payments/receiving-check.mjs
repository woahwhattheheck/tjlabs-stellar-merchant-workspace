#!/usr/bin/env node
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RozoWorkspace } from './store.mjs';
import { receiveDelivery, putOriginal } from './delivery.mjs';
import { nativeInventory, compareNativeInventory } from './native-inventory.mjs';
import { canonical, assert, digest } from './model.mjs';

/** Runs from the extracted application, in a separate process. */
export async function receiveOriginal({directory,archive,sha256,requestId='native:receive:original',actor='Native receiving operator',python}){
  const root=resolve(directory),manifest=JSON.parse(readFileSync(join(root,'DELIVERY.json'))),beforeFile=join(root,'NATIVE_RECEIVE_BEFORE.json');
  let before;
  if(existsSync(beforeFile))before=JSON.parse(readFileSync(beforeFile));
  else{
    const w=new RozoWorkspace(join(root,'workspace'),{readOnly:true});try{before=nativeInventory(w);}finally{w.close();}
    assert(before.workspace.revision===manifest.workspace.revision,'NATIVE_RECEIVE_PREIMAGE','Select the original extracted checkpoint before its first activation.');
    putOriginal(beforeFile,Buffer.from(canonical(before)+'\n'));
  }
  const accepted=await receiveDelivery(archive,root,{sha256,activate:true,requestId,actor,python});
  const w=new RozoWorkspace(accepted.workspaceDirectory);let verification,after,activation;
  try{
    after=nativeInventory(w);verification=compareNativeInventory(before,after,{activation:true});
    const receipt=w.request(requestId);activation=receipt?.result;assert(receipt?.state==='accepted'&&receipt.envelope.payload.archiveSha256===sha256,'NATIVE_RECEIVE_REQUEST','The actual custody request is missing.');
    const selected=w.get('control','operator').value;assert(selected.mode==='active'&&selected.sourceDelivery===manifest.deliveryId,'NATIVE_RECEIVE_CONTROL','The receiver did not activate this exact original delivery.');
  }finally{w.close();}
  const replay=await receiveDelivery(archive,root,{sha256,activate:true,requestId,actor,python});
  assert(replay.reused===true,'NATIVE_RECEIVE_REPLAY','The original activation did not reuse its actual accepted request.');
  const result={schema:'stellar-forge.rozo-native-receiving-result.v1',dataContext:'DEVELOPMENT',applicationModule:fileURLToPath(import.meta.url),archiveSha256:sha256,manifestSha256:digest(readFileSync(join(root,'DELIVERY.json'))),...verification,activation,sourceRoot:accepted.sourceRoot,...(manifest.sourceManifest?{sourceManifest:accepted.sourceManifest}:{}),workspaceDirectory:accepted.workspaceDirectory,configuration:accepted.configuration,cli:accepted.cli,replayed:true};
  putOriginal(join(root,'NATIVE_RECEIVE_RESULT.json'),Buffer.from(canonical(result)+'\n'));return result;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(Array.from({length:Math.floor((process.argv.length-2)/2)},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
  receiveOriginal({directory:args['--directory'],archive:args['--archive'],sha256:args['--sha256'],requestId:args['--request-id']??'native:receive:original',actor:args['--actor']??'Native receiving operator',python:args['--python']}).then(v=>process.stdout.write(JSON.stringify(v)+'\n')).catch(e=>{process.stderr.write(JSON.stringify({error:{code:e.code,message:e.message,details:e.details}})+'\n');process.exitCode=1;});
}
