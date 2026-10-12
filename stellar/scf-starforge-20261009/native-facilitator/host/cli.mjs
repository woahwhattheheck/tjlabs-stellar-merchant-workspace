#!/usr/bin/env node
// MIT. Explicit reviewed host operations; service and native payment execution remain original.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { stage,readBundle,publicBundle,compareBundles } from './plan.mjs';
import { begin,resume,status,drain,exportHandover } from './host.mjs';
import { need,readJSON,absolute,realDirectory,atomicFile,json,hash } from './shared.mjs';

const HELP='Native facilitator Linux host\n\n'
+'stage --selection FILE.json\n'
+'inspect --bundle DIRECTORY\n'
+'compare --before DIRECTORY --after DIRECTORY\n'
+'apply --bundle DIRECTORY --operation ID --reviewed-bundle SHA256 --expected-current SHA256|none [--wait-seconds 0..45]\n'
+'resume|rollback --host DIRECTORY --operation ID [--wait-seconds 0..45]\n'
+'drain --host DIRECTORY --operation ID --expected-current SHA256 [--wait-seconds 0..45]\n'
+'status --host DIRECTORY [--operation ID]\n'
+'export --bundle DIRECTORY --output NEW_DIRECTORY [--host DIRECTORY]\n'
+'receive --handover HOST-HANDOVER.json --selection FILE.json\n\n'
+'Stage/receive retain private config and signer-only EnvironmentFile locally. Exports contain no signer values.\n'
+'The original runtime-install must first supply a READY native profile owned by the selected service account.\n'
+'Use the exact current bundle ID for every change. A waiting drain is resumed in the same operation; no payment is replayed.\n';
function flags(args,allowed){
  const f={};while(args.length){const k=args.shift(),v=args.shift();need(allowed.includes(k)&&v&&!Object.hasOwn(f,k),'HOST_ARGUMENTS_INVALID');f[k]=v;}return f;
}
function only(f,keys){for(const k of keys)need(f[k],'HOST_ARGUMENT_REQUIRED');}
const wait=f=>f['--wait-seconds']===undefined?10:Number(f['--wait-seconds']);
export async function run(args){
  args=[...args];if(args.length===0||args[0]==='--help'){return {help:HELP};}
  const mode=args.shift();
  if(mode==='stage'){const f=flags(args,['--selection']);only(f,['--selection']);return stage((await readJSON(absolute(f['--selection']))).value);}
  if(mode==='inspect'){const f=flags(args,['--bundle']);only(f,['--bundle']);return publicBundle(await readBundle(absolute(f['--bundle'])));}
  if(mode==='compare'){const f=flags(args,['--before','--after']);only(f,['--before','--after']);
    return compareBundles(await readBundle(absolute(f['--before'])),await readBundle(absolute(f['--after'])));}
  if(mode==='apply'){
    const f=flags(args,['--bundle','--operation','--reviewed-bundle','--expected-current','--wait-seconds']);
    only(f,['--bundle','--operation','--reviewed-bundle','--expected-current']);
    return begin({bundle:absolute(f['--bundle']),operationId:f['--operation'],reviewedBundleId:f['--reviewed-bundle'],
      expectedCurrentBundleId:f['--expected-current']==='none'?null:f['--expected-current'],waitSeconds:wait(f)});
  }
  if(['resume','rollback'].includes(mode)){
    const f=flags(args,['--host','--operation','--wait-seconds']);only(f,['--host','--operation']);
    return resume({hostDirectory:absolute(f['--host']),operationId:f['--operation'],rollback:mode==='rollback',waitSeconds:wait(f)});
  }
  if(mode==='drain'){
    const f=flags(args,['--host','--operation','--expected-current','--wait-seconds']);only(f,['--host','--operation','--expected-current']);
    return drain({hostDirectory:absolute(f['--host']),operationId:f['--operation'],expectedCurrentBundleId:f['--expected-current'],waitSeconds:wait(f)});
  }
  if(mode==='status'){const f=flags(args,['--host','--operation']);only(f,['--host']);
    return status({hostDirectory:absolute(f['--host']),operationId:f['--operation']??null});}
  if(mode==='export'){
    const f=flags(args,['--bundle','--output','--host']);only(f,['--bundle','--output']);
    const output=absolute(f['--output']),files=await exportHandover({bundle:absolute(f['--bundle']),hostDirectory:f['--host']?absolute(f['--host']):null});
    await realDirectory(output,{newOnly:true,uid:process.getuid(),gid:process.getgid(),mode:0o700});
    for(const [name,bytes] of Object.entries(files))await atomicFile(join(output,name),bytes,{uid:process.getuid(),gid:process.getgid()});
    return {output,secretValuesIncluded:false,files:Object.entries(files).map(([path,bytes])=>({path,bytes:bytes.length,sha256:hash(bytes)}))};
  }
  if(mode==='receive'){
    const f=flags(args,['--handover','--selection']);only(f,['--handover','--selection']);
    const h=(await readJSON(absolute(f['--handover']))).value,selection=(await readJSON(absolute(f['--selection']))).value;
    need(h.schema==='stellar-forge.native-facilitator-host-handover.v1'&&h.secretValuesIncluded===false,'HOST_HANDOVER_INVALID');
    const config=await readJSON(absolute(selection.config));
    need(config.sha256===h.originalConfigRequired?.sha256,'HOST_ORIGINAL_RECEIVED_CONFIG_CHANGED');
    const received=await stage(selection);
    need(received.runtime.archiveSha256===h.receiving.sourceArchiveSha256&&received.runtime.profileId===h.receiving.profileId&&
      received.runtime.sourceCommit===h.receiving.sourceCommit&&received.network===h.receiving.network&&
      json([...received.review.signers.map(s=>s.address),...(received.review.feeBumpSigner?[received.review.feeBumpSigner.address]:[])].sort())===
      json(h.receiving.originalAccountAddresses),'HOST_RECEIVED_SOURCE_IDENTITY_CHANGED');
    return {status:'RECEIVED_STAGED',bundle:received,original:h.bundle.bundleId,
      activationPerformed:false,originalSigningAccountsRetained:true,
      changedHostFields:['account','ownershipDirectory','url'].filter(k=>json(received[k])!==json(h.bundle[k]))};
  }
  need(false,'HOST_COMMAND_UNKNOWN');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const result=await run(process.argv.slice(2));process.stdout.write(result.help??json(result));}
  catch(e){process.stderr.write(json({error:e.code||'HOST_OPERATION_FAILED',
    ...(e.exitCode!==undefined?{originalCommandExitCode:e.exitCode}:{} ),
    ...(e.originalCode?{originalCommandError:e.originalCode}:{})}));process.exitCode=2;}
}
