#!/usr/bin/env node
import { tmpdir } from 'node:os';
// Exercise actual application storage and HTTP recovery; no upstream SDK substitute.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { OperationState } from './operation-state.mjs';
const source = resolve(process.argv[2]);
const root = await fs.mkdtemp(join(tmpdir(),'openlineage-native-boundaries-'));
const [{ startServer }, { LineageClient }, { verifyBundle, APPLICATION_FILES }] = await Promise.all(
  ['server.mjs','client.mjs','store.mjs'].map(name => import(pathToFileURL(join(source,name)).href)));
const token = randomBytes(32).toString('hex');
const directory = join(root,'workspace');
let host;
try {
  host = await startServer({ directory, token, port: 0 });
  const port = Number(new URL(host.url).port);
  const journal = await OperationState.open(join(root,'operation'), { operationId:'original-download-recovery', source });
  await journal.value('original-server-port', async () => port);
  const workspaceId = host.identity.workspaceId;
  const client = new LineageClient(host.url,{token,expectedWorkspaceId:workspaceId});
  const original = await fs.readFile(join(source,'fixture-event-full.json'));
  await client.importSource(original,{name:'fixture-event-full.json',operationId:'original-fixture',expectedRevision:0});
  const descriptor = await client.exportWorkspace({includeApplication:true});
  const destination=join(root,'complete-workspace.json');
  const nativeAction = client.action.bind(client); let ranges=0;
  client.action=async (...args) => {
    if(args[0]==='export.read' && ranges++===2) throw new Error('receiver interruption after two original ranges');
    return nativeAction(...args);
  };
  await assert.rejects(client.downloadExport(descriptor.id,destination,{chunkBytes:32768}), /receiver interruption/);
  assert.equal((await fs.stat(destination+'.part')).size,65536);
  const firstInstance=host.identity.instanceId;
  await host.close(); host=null;
  const reopened=await OperationState.open(join(root,'operation'),{operationId:'original-download-recovery',source});
  host=await startServer({directory,token,port:reopened.state.values['original-server-port']});
  assert.equal(host.identity.workspaceId,workspaceId);
  assert.notEqual(host.identity.instanceId,firstInstance);
  const receiving=new LineageClient(host.url,{token,expectedWorkspaceId:workspaceId});
  const result=await receiving.downloadExport(descriptor.id,destination,{chunkBytes:32768});
  const body=await fs.readFile(destination), bundle=verifyBundle(body);
  assert.equal(createHash('sha256').update(body).digest('hex'),descriptor.id);
  assert.equal(bundle.state.sources.length,1);
  assert.equal(bundle.application.size,APPLICATION_FILES.length);
  await fs.writeFile(join(root,'result.json'),JSON.stringify({state:'COMPLETE',root,workspaceId,originalPort:port,
    retainedPartialBytes:65536,finalBytes:body.length,sha256:descriptor.id,applicationFiles:bundle.application.size,
    events:bundle.state.events.length,sourceSha256:bundle.state.sources[0].id,result},null,2));
  console.log(await fs.readFile(join(root,'result.json'),'utf8'));
} finally { if(host) await host.close(); }
