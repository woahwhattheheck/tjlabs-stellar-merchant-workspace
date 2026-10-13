#!/usr/bin/env node
// MIT. Applications owns the process; the original Rumble workspace owns its data and writer.
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {unlink} from 'node:fs/promises';
import {startWorkbenchServer} from './server.mjs';
import {RUMBLE_CONNECTION_SCHEMA,RUMBLE_CONNECTION_FILENAME,RUMBLE_STARTUP_SCHEMA,
  rumbleNeed,rumbleAbsolute,rumblePrivateDirectory,rumbleWritePrivateJson,rumbleReadPrivateJson} from './connection.mjs';

export function rumbleManagedOptions(argv) {
  const raw = {};
  for (let i=0;i<argv.length;i+=2) {
    const flag = argv[i];
    rumbleNeed(['--workspace','--workspace-id','--port'].includes(flag) &&
      !Object.hasOwn(raw,flag) && typeof argv[i+1] === 'string' && !argv[i+1].startsWith('--'),
    'RUMBLE_MANAGED_ARGUMENT_INVALID','Use each documented option once with its value.');
    raw[flag] = argv[i+1];
  }
  rumbleNeed(/^\d+$/.test(raw['--port'] ?? '0') && Number(raw['--port'] ?? 0)<=65535,
    'RUMBLE_PORT_INVALID','Choose a local port from 0 to 65535.');
  rumbleNeed(raw['--workspace-id'] === undefined || /^workspace-[a-f0-9]{24}$/.test(raw['--workspace-id']),
    'RUMBLE_WORKSPACE_ID_INVALID','Use the original Rumble workspace ID.');
  return {directory:rumbleAbsolute(raw['--workspace']),workspaceId:raw['--workspace-id'],port:Number(raw['--port'] ?? 0)};
}
export async function startManagedRumbleWorkspace(options) {
  const directory = rumbleAbsolute(options.directory);
  await rumblePrivateDirectory(directory);
  const original = await startWorkbenchServer({...options,directory,apiKey:options.apiKey??process.env.STELLAR_PRICES_API_KEY});
  let connection,closing,service=original;
  try {
    const snapshot=await original.workbench.snapshot();
    service={...original,directory,workspaceId:snapshot.workspace.id,instanceId:randomUUID(),
      startedAt:new Date().toISOString(),url:original.operatorUrl};
    rumbleNeed(!options.workspaceId || options.workspaceId === service.workspaceId,
      'RUMBLE_WORKSPACE_CHANGED','The Rumble directory belongs to a different saved workspace.',409);
    const selected = await rumblePrivateDirectory(directory);
    const value = {schema:RUMBLE_CONNECTION_SCHEMA,instanceId:service.instanceId,directory,
      directoryIdentity:{dev:selected.dev,ino:selected.ino},workspaceId:service.workspaceId,
      pid:process.pid,startedAt:service.startedAt,origin:service.origin,url:service.url};
    const written = await rumbleWritePrivateJson(join(directory,RUMBLE_CONNECTION_FILENAME),value,{replace:true});
    connection = {...written,value};
    return {...service,connection,close() {
      return closing || (closing = (async () => {
        let retirementError;
        try {
          const current = await rumbleReadPrivateJson(connection.path,32768);
          if (current.sha256 === connection.sha256) await unlink(connection.path);
        } catch (error) { if (error.code !== 'ENOENT') retirementError = error; }
        // Retire our record before the original writer releases its lease.
        await service.close();
        if (retirementError) throw retirementError;
      })());
    }};
  } catch (error) { await service.close().catch(()=>{}); throw error; }
}
export function rumbleStartup(service) {
  return {schema:RUMBLE_STARTUP_SCHEMA,status:'RUMBLE_WORKSPACE_READY',
    directory:service.directory,workspaceId:service.workspaceId,instanceId:service.instanceId,
    pid:process.pid,connectionFile:service.connection.path,connectionSha256:service.connection.sha256,
    origin:service.origin,url:service.url};
}
const HELP = 'Rumble managed workspace\n\n'+
  'starforge rumble-managed --workspace /private/rumble [--port 0]\n'+
  'Create or receive the original workspace with starforge rumble-workspace first.\n'+
  'Applications reviews, saves, starts, opens and stops this same source-owned server.\n'+
  'Typed tools use its private rumble.connection.json; SIGINT/SIGTERM drains its original merchant and publisher.\n'+
  'STELLAR_PRICES_API_KEY supplies the original provider key through the private process environment.\n';
export async function runManagedRumbleCli(argv=process.argv.slice(2),{stdout=process.stdout,waitForClose=true}={}) {
  if (!argv.length || argv.length===1 && ['help','--help'].includes(argv[0])) {
    stdout.write(HELP); return {help:true};
  }
  const service = await startManagedRumbleWorkspace(rumbleManagedOptions(argv));
  stdout.write(JSON.stringify(rumbleStartup(service))+'\n');
  if (!waitForClose) return service;
  let stopping=false;
  await new Promise((accept,reject)=>{
    const stop=async()=>{
      if (stopping) return; stopping=true;
      try { await service.close(); accept(); } catch(error) { reject(error); }
      finally { process.off('SIGINT',stop); process.off('SIGTERM',stop); }
    };
    process.once('SIGINT',stop); process.once('SIGTERM',stop);
  });
  return {status:'CLOSED',instanceId:service.instanceId};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  runManagedRumbleCli().catch(error=>{
    process.stderr.write(JSON.stringify({error:{code:error.code||'RUMBLE_MANAGED_FAILED',
      message:'Inspect the original Rumble workspace and saved Applications operation.'}})+'\n');
    process.exitCode=1;
  });
