#!/usr/bin/env node
// MIT. Continue the existing native receiving operation; read INSTALLED_RECEIVING.md first.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {core,sessions,codec,sourceArtifact} from '../runtime.mjs';
import {initializeStore,openStore,model} from '../host/store.mjs';
import {startServer} from '../host/server.mjs';
import {OrkyoClient} from '../host/client.mjs';
import {moduleSources} from '../host/export.mjs';
import installed from './installed-course.cjs';
const files=await moduleSources(),course=installed.runInstalledCourse({core,sessions,codec,model,files});
const original=codec.fromBase64(files['examples/authored-workbook.xlsx.base64'].trim()),artifact=sourceArtifact(original,'Authored.xlsx','workbook');
assert.equal(artifact.originalFile.sha256,course.result.pendingOriginalSha256);
const directory=await mkdtemp(join(tmpdir(),'orkyo-installed-'));let service,client,success=false;
try{
 const initial=await initializeStore(join(directory,'workspace'),course.state.carrier,'authored-native-orkyo');
 service=await startServer({directory:join(directory,'workspace')});client=await OrkyoClient.connect(service.directory);
 assert.equal((await client.status()).installationId,initial.installationId);await assert.rejects(openStore(service.directory));
 const s=sessions.receive(JSON.stringify(initial.carrier));s.draft.copy.forms['outcome-reason']='Authored native retained unfinished outcome note';
 const request={schema:'stellar-forge.orkyo-request.v1',installationId:initial.installationId,id:'native-editor-save',baseSha256:initial.sha256,actor:s.draft.actor,at:'2026-10-15T06:45:00.000Z',kind:'save',carrier:sessions.pack(s)};
 const saved=await client.apply(request);assert.equal(saved.outcome,'COMMITTED');const retry=await client.apply(request);assert.equal(retry.reused,true);assert.equal(retry.state.carrier.sha256,saved.state.carrier.sha256);
 const state=await client.state(),file=await client.export(state.sha256),parts=[];let offset=0;
 for(;;){const part=await client.file(file.fileId,offset);assert.equal(part.offset,offset);assert.equal(part.sha256,file.sha256);const b=Buffer.from(part.contentBase64,'base64');parts.push(b);offset+=b.length;if(part.nextOffset===null)break;assert.equal(part.nextOffset,offset);}
 const bytes=Buffer.concat(parts);assert.equal(bytes.length,file.bytes);assert.equal(codec.sha256Bytes(bytes),file.sha256);
 const origin=service.origin;await client.close();await service.close();service=null;service=await startServer({directory:join(directory,'workspace')});assert.equal(service.origin,origin);client=await OrkyoClient.connect(service.directory);assert.equal((await client.requestStatus(request)).outcome,'COMMITTED');
 process.stdout.write(JSON.stringify({schema:'stellar-forge.orkyo-native-receiving.v1',runtime:process.version,course:course.result,writer:'SINGLE_PRIVATE_WRITER',requestRecovery:'ORIGINAL_COMMITTED',reopenedListener:true,export:{bytes:file.bytes,sha256:file.sha256}},null,2)+'\n');success=true;
}finally{await client?.close();await service?.close();if(success)await rm(directory,{recursive:true});else process.stderr.write('Complete original receiving files retained at '+directory+'\n');}
