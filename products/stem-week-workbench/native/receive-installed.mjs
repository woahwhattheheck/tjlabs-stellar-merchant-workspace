#!/usr/bin/env node
// MIT. Actual private filesystem, listener, complete domain action and original request receiving.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {core,sessions,codec,workspaceHead} from '../runtime.mjs';
import {initializeStore,openStore} from '../host/store.mjs';
import {startServer} from '../host/server.mjs';
import {StemWeekClient} from '../host/client.mjs';
const directory=await mkdtemp(join(tmpdir(),'stemweek-installed-'));let service,client,success=false;
try{
 const session=sessions.fromDesk(JSON.parse(await readFile(new URL('../examples/workbench-complete-workspace.json',import.meta.url),'utf8')));session.draft.actor='Authored receiving operator';
 const initial=await initializeStore(join(directory,'workspace'),sessions.pack(session),'authored-native-stemweek');
 service=await startServer({directory:join(directory,'workspace')});client=await StemWeekClient.connect(service.directory);
 assert.equal((await client.status()).installationId,initial.installationId);await assert.rejects(openStore(service.directory));
 const next=sessions.clone(session);next.editor.sourceDraft.sources.supply.text='supply_id,variety_id\n"unfinished';next.editor.sourceDraft.notes='Retained unfinished grower review';
 const request={schema:'stellar-forge.stemweek-request.v1',installationId:initial.installationId,id:'native-editor-save',baseSha256:initial.sha256,actor:session.draft.actor,at:'2026-10-15T03:15:00Z',kind:'save',carrier:sessions.pack(next)};
 const saved=await client.apply(request);assert.equal(saved.outcome,'COMMITTED');
 const action={schema:request.schema,installationId:initial.installationId,id:'native-original-week',baseSha256:saved.state.sha256,actor:session.draft.actor,at:'2026-10-15T03:16:00Z',kind:'action',operation:{id:'native-original-week',kind:'receive',actor:session.draft.actor,at:'2026-10-15T03:16:00Z',expectedHead:workspaceHead(next.workspace),payload:{id:'authored-native-week',label:'Authored native weekly originals',sources:core.sampleSources,notes:'Complete original source receiving'}}};
 const changed=await client.apply(action);assert.equal(changed.outcome,'COMMITTED');assert.equal(changed.state.carrier.session.backups.at(-1).snapshot.editor.sourceDraft.sources.supply.text,next.editor.sourceDraft.sources.supply.text);
 const retry=await client.apply(request);assert.equal(retry.reused,true);assert.equal(retry.state.carrier.sha256,changed.state.carrier.sha256);
 const rejected=await client.apply({...request,id:'native-obsolete-save'});assert.equal(rejected.outcome,'REJECTED_NOT_COMMITTED');assert.equal(rejected.state.carrier.sha256,changed.state.carrier.sha256);
 const state=await client.state(),file=await client.export(state.sha256),parts=[];let offset=0;
 for(;;){const part=await client.file(file.fileId,offset);assert.equal(part.offset,offset);assert.equal(part.sha256,file.sha256);const b=Buffer.from(part.contentBase64,'base64');parts.push(b);offset+=b.length;if(part.nextOffset===null)break;assert.equal(part.nextOffset,offset);}
 const bytes=Buffer.concat(parts);assert.equal(bytes.length,file.bytes);assert.equal(codec.sha256Bytes(bytes),file.sha256);
 const origin=service.origin;await client.close();await service.close();service=null;service=await startServer({directory:join(directory,'workspace')});assert.equal(service.origin,origin);client=await StemWeekClient.connect(service.directory);assert.equal((await client.requestStatus(request)).outcome,'COMMITTED');
 process.stdout.write(JSON.stringify({schema:'stellar-forge.stemweek-native-receiving.v1',runtime:process.version,writer:'SINGLE_PRIVATE_WRITER',originalDraftRetained:true,requestRecovery:'ORIGINAL_COMMITTED_WITH_LATER_EDITION',reopenedListener:true,editions:(await client.state()).carrier.session.workspace.editions.length,export:{bytes:file.bytes,sha256:file.sha256}},null,2)+'\n');success=true;
}finally{await client?.close();await service?.close();if(success)await rm(directory,{recursive:true});else process.stderr.write('Complete original receiving files retained at '+directory+'\n');}
