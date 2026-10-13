// MIT — Complete receiving/editing/re-export on the original native research journey.
// First run journey.mjs; supply the returned state directory and a new output parent.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openLibrary} from '../library.mjs';
import {openContentSearch} from './engine.mjs';
import {serveContentSearch} from './server.mjs';
import {ResearchProjectClient as ResearchClient} from './project.mjs';
import {saveProject,inspectProject,receiveProject} from './project.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(!process.argv[2])throw new Error('Provide the original journey state directory');
const source=resolve(process.argv[2]),parent=resolve(process.argv[3]??'.');
await mkdir(parent,{recursive:true});const output=await mkdtemp(join(parent,'research-project-journey-'));
const started=performance.now();let original,originalSearch,received,research,host,reopened,reopenedSearch;
try{
 original=await openLibrary({state:source});originalSearch=await openContentSearch(original);
 const before=original.exportReview(),savedBefore=originalSearch.listSaved(),selected=originalSearch.status().current.id;
 const db=new DatabaseSync(join(source,'content-search.sqlite'),{readOnly:true});
 const builds=db.prepare("SELECT id FROM builds WHERE state='COMPLETE' ORDER BY created").all().map(x=>x.id);db.close();
 const expected=builds.map(build=>originalSearch.search({q:'Marketoutlook',build}).total);
 const first=await saveProject(originalSearch,join(output,'original.sfrp'));
 const inspected=await inspectProject(first.path);assert.equal(inspected.resources,before.resources.length);
 await assert.rejects(()=>saveProject(originalSearch,first.path),{code:'EEXIST'});
 const receive=await receiveProject(first.path,join(output,'received'));
 await assert.rejects(()=>receiveProject(first.path,receive.path),e=>e.message==='PROJECT_DESTINATION_EXISTS');
 received=await openLibrary({state:receive.path});research=await openContentSearch(received);
 assert.equal(received.config.kind,'research-project');assert.equal(research.status().current.id,selected);
 assert.deepEqual(research.listSaved(),savedBefore);
 assert.deepEqual(builds.map(build=>research.search({q:'Marketoutlook',build}).total),expected);
 const ids=new Set(before.resources.map(x=>x.id));
 for(const record of received.exportReview().resources){assert.ok(ids.has(record.id));if(record.deliveryStatus==='SAVED')assert.equal(hash(await readFile(record.path)),record.sha256);}
 assert.equal(research.search({q:'CAFÉ RÉSUMÉ λογική 資料'}).total,1);
 const found=research.search({q:'annual renewal'}).items[0],rid=found.resource.id;
 const tail=research.passages({q:'renewal',resourceId:rid}).items[0];assert.ok(tail.byteStart>1024*1024);
 const originalBytes=await readFile(received.resource(rid).path);
 assert.equal(originalBytes.subarray(tail.excerpt.byteStart,tail.excerpt.byteEnd).toString(),tail.excerpt.text);
 const note=received.saveAnnotation(rid,{expectedRevision:found.annotation.revision,operationId:'received-note',note:'Independent reviewer: retain the annual-renewal source.',tags:['handover'],starred:true});
 const query=research.listSaved()[0];const edited=research.saveQuery({...query,name:'Received annual renewal review',expectedRevision:query.revision,operationId:'received-query'});
 const members=received.search({limit:3}).items.map(r=>({id:r.id,sha256:r.sha256,annotationRevision:r.annotation.revision}));
 const collection=received.collections.save({id:randomUUID(),name:'Received working selection',note:'Independently editable original files',members,expectedRevision:0,operationId:'received-collection'});
 // Refresh uses the received source with the exact same original IDs and files.
 await received.scan();await research.index();assert.equal(research.status().stale,false);
 assert.equal(received.resource(rid).annotation.revision,note.revision);assert.equal(research.listSaved()[0].revision,edited.revision);
 research.close();research=null;
 host=await serveContentSearch(received);const client=new ResearchClient(host);
 assert.equal((await fetch(host.origin+'/api/content-search/project',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 const ticket=await client.project(),response=await fetch(host.origin+ticket.url),bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(bytes.length,ticket.bytes);assert.equal(hash(bytes),ticket.sha256);
 const second=join(output,'reviewed.sfrp');await writeFile(second,bytes,{flag:'wx',mode:0o600});await host.close();host=null;
 const again=await receiveProject(second,join(output,'reopened'));reopened=await openLibrary({state:again.path});reopenedSearch=await openContentSearch(reopened);
 assert.equal(reopened.resource(rid).annotation.note,note.note);assert.deepEqual(reopenedSearch.listSaved()[0],edited);
 const reopenedCollection=reopened.collections.show(collection.id);assert.equal(reopenedCollection.members.length,3);
 for(const r of reopenedCollection.members){assert.ok(r.path.startsWith(again.path));assert.equal(hash(await readFile(r.path)),r.sha256);}
 const revision=reopened.saveAnnotation(rid,{expectedRevision:note.revision,operationId:'second-receiver-note',note:'Second receiver can continue editing.'});assert.equal(revision.revision,note.revision+1);
 assert.equal(reopenedSearch.search({q:'annual renewal'}).total,1);
 assert.deepEqual(original.exportReview().resources,before.resources);assert.deepEqual(original.exportReview().annotations,before.annotations);assert.deepEqual(originalSearch.listSaved(),savedBefore);
 const result={ok:true,sourceFiles:before.resources.length,retainedCompleteBuilds:builds.length,firstArchive:first,received:receive.path,reviewedArchive:{path:second,bytes:bytes.length,sha256:hash(bytes)},reopened:again.path,annotationRevision:revision.revision,collectionMembers:3,originalUnchanged:true,milliseconds:Math.round(performance.now()-started)};
 await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await host?.close();research?.close();await received?.close();reopenedSearch?.close();await reopened?.close();originalSearch?.close();await original?.close();}
