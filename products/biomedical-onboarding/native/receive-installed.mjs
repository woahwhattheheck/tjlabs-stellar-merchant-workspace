#!/usr/bin/env node
// MIT. Actual private filesystem, listener, complete domain action and original request receiving.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {core,originalSessions,sessions,codec,workspaceHead} from '../runtime.mjs';
import {initializeStore,openStore} from '../host/store.mjs';
import {startServer} from '../host/server.mjs';
import {BiomedicalOnboardingClient} from '../host/client.mjs';
const directory=await mkdtemp(join(tmpdir(),'biomedical-installed-'));let service,client,success=false;
try{
 const session=sessions.fromSession(originalSessions.create(JSON.parse(await readFile(new URL('../examples/first.study.json',import.meta.url),'utf8'))));session.draft.actor='Authored receiving operator';
 const initial=await initializeStore(join(directory,'workspace'),sessions.pack(session),'authored-native-biomedical');
 service=await startServer({directory:join(directory,'workspace')});client=await BiomedicalOnboardingClient.connect(service.directory);
 assert.equal((await client.status()).installationId,initial.installationId);await assert.rejects(openStore(service.directory));
 const next=sessions.clone(session);next.workspace=originalSessions.draft(next.workspace,'intake:assets:returned',{content:'id,serial\n"unfinished',mapping:{id:'id'}});next.emergency.drafts.review={notes:'Retain this complete emergency-only review'};
 const request={schema:'stellar-forge.biomedical-request.v1',installationId:initial.installationId,id:'native-editor-save',baseSha256:initial.sha256,actor:session.draft.actor,at:'2026-10-15T05:35:00Z',kind:'save',carrier:sessions.pack(next)};
 const saved=await client.apply(request);assert.equal(saved.outcome,'COMMITTED');
 const operation={id:'native-source-review',kind:'review',actor:session.draft.actor,at:'2026-10-15T05:36:00Z',expectedHead:workspaceHead(next.workspace),payload:{study_sha256:core.digest(next.workspace.study),reviewer:session.draft.actor,at:'2026-10-15T05:36:00Z',decision:'revise',notes:'Named exact-source review of authored returned differences'}};
 const action={schema:request.schema,installationId:initial.installationId,id:operation.id,baseSha256:saved.state.sha256,actor:session.draft.actor,at:operation.at,kind:'action',operation};
 const changed=await client.apply(action);assert.equal(changed.outcome,'COMMITTED');assert.equal(changed.state.carrier.session.workspace.drafts['intake:assets:returned'].content,next.workspace.drafts['intake:assets:returned'].content);assert.deepEqual(changed.state.carrier.session.emergency,next.emergency);
 const retry=await client.apply(request);assert.equal(retry.reused,true);assert.equal(retry.state.carrier.sha256,changed.state.carrier.sha256);
 const rejected=await client.apply({...request,id:'native-obsolete-save'});assert.equal(rejected.outcome,'REJECTED_NOT_COMMITTED');assert.equal(rejected.state.carrier.sha256,changed.state.carrier.sha256);
 const state=await client.state(),file=await client.export(state.sha256),parts=[];let offset=0;
 for(;;){const part=await client.file(file.fileId,offset);assert.equal(part.offset,offset);assert.equal(part.sha256,file.sha256);const b=Buffer.from(part.contentBase64,'base64');parts.push(b);offset+=b.length;if(part.nextOffset===null)break;assert.equal(part.nextOffset,offset);}
 const bytes=Buffer.concat(parts);assert.equal(bytes.length,file.bytes);assert.equal(codec.sha256Bytes(bytes),file.sha256);
 const origin=service.origin;await client.close();await service.close();service=null;service=await startServer({directory:join(directory,'workspace')});assert.equal(service.origin,origin);client=await BiomedicalOnboardingClient.connect(service.directory);assert.equal((await client.requestStatus(request)).outcome,'COMMITTED');
 process.stdout.write(JSON.stringify({schema:'stellar-forge.biomedical-native-receiving.v1',runtime:process.version,writer:'SINGLE_PRIVATE_WRITER',originalDraftRetained:true,requestRecovery:'ORIGINAL_COMMITTED_WITH_LATER_EDITION',reopenedListener:true,originals:(await client.state()).carrier.session.workspace.study.originals.length,export:{bytes:file.bytes,sha256:file.sha256}},null,2)+'\n');success=true;
}finally{await client?.close();await service?.close();if(success)await rm(directory,{recursive:true});else process.stderr.write('Complete original receiving files retained at '+directory+'\n');}
