#!/usr/bin/env node
// MIT. Applications owns the process; the original Allium workspace owns its data and writer.
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unlink} from 'node:fs/promises';
import {startAlliumWorkspaceServer} from './server.mjs';
import {ALLIUM_CONNECTION_SCHEMA,ALLIUM_CONNECTION_FILENAME,ALLIUM_STARTUP_SCHEMA,
  alliumNeed,alliumAbsolute,alliumPrivateDirectory,alliumWritePrivateJson,alliumReadPrivateJson} from './connection.mjs';

export function alliumManagedOptions(argv) {
  const raw = {};
  for (let i=0;i<argv.length;i+=2) {
    const flag = argv[i];
    alliumNeed(['--workspace','--workspace-id','--port','--allow-loopback-provider'].includes(flag) &&
      !Object.hasOwn(raw,flag) && typeof argv[i+1] === 'string' && !argv[i+1].startsWith('--'),
    'ALLIUM_MANAGED_ARGUMENT_INVALID','Use each documented option once with its value.');
    raw[flag] = argv[i+1];
  }
  alliumNeed(/^\d+$/.test(raw['--port'] ?? '0') && Number(raw['--port'] ?? 0)<=65535,
    'ALLIUM_PORT_INVALID','Choose a local port from 0 to 65535.');
  alliumNeed(raw['--allow-loopback-provider'] === undefined || ['true','false'].includes(raw['--allow-loopback-provider']),
    'ALLIUM_PROVIDER_MODE_INVALID','Set allow-loopback-provider to true or false.');
  alliumNeed(raw['--workspace-id'] === undefined || /^allium-[a-f0-9-]{36}$/.test(raw['--workspace-id']),
    'ALLIUM_WORKSPACE_ID_INVALID','Use the original Allium workspace ID.');
  return {directory:alliumAbsolute(raw['--workspace']),workspaceId:raw['--workspace-id'],port:Number(raw['--port'] ?? 0),
    allowLoopback:raw['--allow-loopback-provider'] === 'true'};
}
export async function startManagedAlliumWorkspace(options) {
  const directory = alliumAbsolute(options.directory);
  await alliumPrivateDirectory(directory);
  const service = await startAlliumWorkspaceServer({...options,directory});
  let connection,closing;
  try {
    alliumNeed(!options.workspaceId || options.workspaceId === service.workspaceId,
      'ALLIUM_WORKSPACE_CHANGED','The Allium directory belongs to a different saved workspace.',409);
    const selected = await alliumPrivateDirectory(directory);
    const value = {schema:ALLIUM_CONNECTION_SCHEMA,instanceId:service.instanceId,directory,
      directoryIdentity:{dev:selected.dev,ino:selected.ino},workspaceId:service.workspaceId,
      pid:process.pid,startedAt:service.startedAt,origin:service.origin,url:service.url};
    const written = await alliumWritePrivateJson(join(directory,ALLIUM_CONNECTION_FILENAME),value,{replace:true});
    connection = {...written,value};
    return {...service,connection,close() {
      return closing || (closing = (async () => {
        let retirementError;
        try {
          const current = await alliumReadPrivateJson(connection.path,32768);
          if (current.sha256 === connection.sha256) await unlink(connection.path);
        } catch (error) { if (error.code !== 'ENOENT') retirementError = error; }
        // Retire our record before the original writer releases its lease.
        await service.close();
        if (retirementError) throw retirementError;
      })());
    }};
  } catch (error) { await service.close().catch(()=>{}); throw error; }
}
export function alliumStartup(service) {
  return {schema:ALLIUM_STARTUP_SCHEMA,status:'ALLIUM_WORKSPACE_READY',
    directory:service.directory,workspaceId:service.workspaceId,instanceId:service.instanceId,
    pid:process.pid,connectionFile:service.connection.path,connectionSha256:service.connection.sha256,
    origin:service.origin,url:service.url};
}
const HELP = 'Allium managed workspace\n\n'+
  'starforge allium-managed --workspace /private/allium [--port 0]\n'+
  'Create or receive the original workspace with starforge allium-workspace first.\n'+
  'Applications reviews, saves, starts, opens and stops this same source-owned server.\n'+
  'Typed tools use its private allium.connection.json; SIGINT/SIGTERM drains its original merchant and publisher.\n'+
  '--allow-loopback-provider true enables an explicitly selected local provider endpoint.\n';
export async function runManagedAlliumCli(argv=process.argv.slice(2),{stdout=process.stdout,waitForClose=true}={}) {
  if (!argv.length || argv.length===1 && ['help','--help'].includes(argv[0])) {
    stdout.write(HELP); return {help:true};
  }
  const service = await startManagedAlliumWorkspace(alliumManagedOptions(argv));
  stdout.write(JSON.stringify(alliumStartup(service))+'\n');
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
  runManagedAlliumCli().catch(error=>{
    process.stderr.write(JSON.stringify({error:{code:error.code||'ALLIUM_MANAGED_FAILED',
      message:'Inspect the original Allium workspace and saved Applications operation.'}})+'\n');
    process.exitCode=1;
  });
