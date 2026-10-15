#!/usr/bin/env node
// MIT. Focused actual native writer/listener/export receiving for the complete installed product.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeStore,openStore} from '../host/store.mjs';
import {startServer} from '../host/server.mjs';
import {TelemetryClient} from '../host/client.mjs';
import {sessions,core,codec,portable} from '../runtime.mjs';
import {writeJSON} from '../host/io.mjs';
const parent=await mkdtemp(join(tmpdir(),'tjl-telemetry-')),directory=join(parent,'workspace');let service,client,success=false;const checks=[];
try{
 const session=sessions.create('Authored installed native receiving');session.draft.actor='Authored receiving operator';session.workspace=core.importWorkspace(await readFile(new URL('../examples/authored-workspace.json',import.meta.url),'utf8'));session.draft.mapping.raw='{"unfinished":"original draft"}';
 const original=await initializeStore(directory,JSON.parse(portable.serialize(session).content),'authored-native-installation');
 service=await startServer({directory});client=await TelemetryClient.connect(directory,{installationId:original.installationId});
 assert.equal((await client.status()).installationId,original.installationId);await assert.rejects(openStore(directory));checks.push('One original writer and authenticated listener');
 const next=structuredClone(session);next.draft.mapping.raw='{"unfinished":"saved native draft"}';
 const request={schema:'stellar-forge.telemetry-request.v1',installationId:original.installationId,id:'native-save-original',baseSha256:original.sha256,actor:session.draft.actor,at:'2026-10-15T00:30:00Z',kind:'save',carrier:sessions.pack(next)};
 await writeJSON(join(parent,'original-request.json'),request);const saved=await client.apply(request);assert.equal(saved.outcome,'COMMITTED');
 const later=structuredClone(next);later.draft.review.note='Later editor work must survive exact retry';
 const laterRequest={...request,id:'native-save-later',baseSha256:saved.state.sha256,carrier:sessions.pack(later)};
 await writeJSON(join(parent,'later-request.json'),laterRequest);const laterResult=await client.apply(laterRequest);
 const retried=await client.apply(request);assert.equal(retried.reused,true);assert.equal(retried.record.request.id,request.id);assert.equal(retried.state.carrier.session.draft.review.note,later.draft.review.note);checks.push('Complete drafts saved; original retry preserves later editor work');
 const rejected=await client.apply({...request,id:'native-obsolete-base'});assert.equal(rejected.outcome,'REJECTED_NOT_COMMITTED');assert.equal(rejected.state.carrier.sha256,laterResult.state.carrier.sha256);
 assert.equal((await client.requestStatus({...request,id:'native-obsolete-base'})).outcome,'REJECTED_NOT_COMMITTED');checks.push('Definitely rejected original retained without a session mutation');
 const current=await client.state(),file=await client.export(current.sha256),parts=[];let offset=0;
 for(;;){const part=await client.file(file.fileId,offset,196608);assert.equal(part.offset,offset);assert.equal(part.sha256,file.sha256);const bytes=Buffer.from(part.contentBase64,'base64');parts.push(bytes);offset+=bytes.length;if(part.nextOffset===null)break;assert.equal(part.nextOffset,offset);}
 const complete=Buffer.concat(parts);assert.equal(complete.length,file.bytes);assert.equal(codec.sha256Bytes(complete),file.sha256);checks.push('Every retained handover byte received and full SHA verified');
 const invalid=await fetch(service.origin+'/api/status',{headers:{authorization:'Bearer '+'é'.repeat(64),'x-telemetry-instance':service.instanceId}});assert.equal(invalid.status,401);checks.push('Malformed multibyte bearer is rejected without a server error');
 const firstOrigin=service.origin;await client.close();await service.close();service=null;
 service=await startServer({directory});assert.equal(service.origin,firstOrigin);client=await TelemetryClient.connect(directory);
 const recovered=await client.requestStatus(request);assert.equal(recovered.outcome,'COMMITTED');assert.equal(recovered.state.carrier.session.draft.review.note,later.draft.review.note);checks.push('Restart retains listener origin, saved session and exact original outcome');
 const displaced=join(parent,'moved-workspace');await rename(directory,displaced);await mkdir(directory,{mode:0o700});
 try{await assert.rejects(client.status());}finally{await rm(directory,{recursive:true});await rename(displaced,directory);}checks.push('Moved/replaced physical directory cannot silently select another session');
 const result={schema:'stellar-forge.telemetry-native-receiving.v1',runtime:process.version,checks,sequence:(await client.state()).sequence,export:{bytes:file.bytes,sha256:file.sha256},retainedRequestId:request.id};process.stdout.write(JSON.stringify(result,null,2)+'\n');success=true;
}finally{await client?.close();await service?.close();if(success)await rm(parent,{recursive:true});else process.stderr.write('Original native course files retained at '+parent+'\n');}
