#!/usr/bin/env node
// MIT. Key-free inspection under the selected original service identity.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { inspectRuntimeInstall } from '../../distribution/runtime-install.mjs';
import { absolute, readJSON, regular, hash, BASE, need } from './shared.mjs';

export async function probe({runtime,config,state}) {
  absolute(runtime);absolute(config);absolute(state);
  const observed=await inspectRuntimeInstall({directory:runtime,load:true,source:true});
  need(observed.status==='READY'&&observed.ready&&observed.sourceVerified,'HOST_RUNTIME_NOT_READY');
  const profile=(await readJSON(join(runtime,'runtime-profile.json'))).value;
  need(profile.selection?.native===true,'HOST_NATIVE_PROFILE_REQUIRED');
  const installed=(await readJSON(join(runtime,'runtime-install.json'))).value;
  const module=await import(pathToFileURL(join(observed.sourceRoot,BASE+'config.mjs')).href);
  const raw=await regular(config,65536);
  const original=module.validateConfig(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw.bytes)));
  const normalized=module.validateConfig({...original,operations:{...original.operations,ownershipDirectory:state,requireReady:true}});
  return {schema:'stellar-forge.native-facilitator-host-probe.v1',ready:true,signingMaterialLoaded:false,
    uid:process.getuid(),gid:process.getgid(),node:{version:process.versions.node,modules:process.versions.modules,
      executable:process.execPath,platform:process.platform,arch:process.arch},
    runtime:{directory:runtime,sourceRoot:observed.sourceRoot,sourceCommit:observed.sourceCommit,
      installationId:observed.installationId,profileId:observed.profileId,lockSha256:observed.lockSha256,
      archiveSha256:installed.archiveSha256,packageVersion:observed.packageVersion},
    cliSha256:(await regular(join(observed.sourceRoot,BASE+'cli.mjs'))).sha256,
    configSha256:raw.sha256,review:module.reviewConfig(normalized)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {const p=process.argv.slice(2);need(p.length===6&&p[0]==='--runtime'&&p[2]==='--config'&&p[4]==='--state','HOST_PROBE_ARGUMENTS_INVALID');
    process.stdout.write(JSON.stringify(await probe({runtime:p[1],config:p[3],state:p[5]}))+'\n');
  }catch(e){process.stderr.write(JSON.stringify({error:e.code||'HOST_PROBE_FAILED'})+'\n');process.exitCode=2;}
}
