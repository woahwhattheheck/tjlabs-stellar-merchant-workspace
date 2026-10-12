// MIT — Four end-to-end customer journeys on the original resource library.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {openLibrary} from '../library.mjs';import {openContentSearch} from './engine.mjs';
import {serveContentSearch} from './server.mjs';import {ResearchClient} from './client.mjs';
import {researchReport,saveReport} from './reports.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const parent=resolve(process.argv[2]??join(tmpdir(),'resource-research-journey'));
await mkdir(parent,{recursive:true});
const output=await mkdtemp(join(parent,'run-'));
const root=await mkdtemp(join(tmpdir(),'resource-research-')),files=join(root,'files'),state=join(root,'library'),source=join(root,'resources.json');await mkdir(files,{mode:0o700});
const jobs=[],originals=new Map();
async function add(name,value,contentType='text/plain'){
 const intent='research-'+hash(name).slice(0,24),content=Buffer.from(value),path=join(files,name);await writeFile(path,content,{mode:0o600});originals.set(path,hash(content));
 jobs.push({schema:'stellar-forge.sf88.buyer-inbox.v1',id:hash(intent),state:'COMPLETE',configSha256:hash(name+'-config'),createdAt:'2026-10-12T12:00:00Z',operation:{intentId:intent,method:'GET',url:'https://fixture.invalid/resources'},outcome:{intentId:intent,mode:'ORIGINAL_OPERATOR_APPROVED_BUYER_ATTEMPT',status:'COMPLETE',httpStatus:200,responseFile:{status:'SAVED',path,bytes:content.length,sha256:hash(content),contentType}}});
}
const large='Annual research archive\r\n'+('ordinary supplier information\r\n'.repeat(46000))+'Café résumé λογική 資料\r\n'+('capacity planning\n'.repeat(8000))+'renewal quarterly revenue — contract award\n';
await add('Annual procurement review.txt',large);await add('Vendor comparison.csv','name,region,status\nNorthstar,Midwest,active\nClearwater,Midwest,active\n');await add('Image attachment.bin',Buffer.from([137,80,78,71,0,255,0,1]),'application/octet-stream');
for(let i=0;i<107;i++)await add('Supplier brief '+String(i+1).padStart(3,'0')+'.txt','Supplier candidate '+i+'\nOpportunity prospect procurement\n');
await writeFile(source,JSON.stringify(jobs),{mode:0o600});let library=await openLibrary({state,kind:'snapshot',source,roots:[files]}),search;
try{
 await library.scan();search=await openContentSearch(library);const start=performance.now();const built=await search.index();
 assert.equal(built.counts.TEXT,109);assert.equal(built.counts.BINARY,1);assert.equal(built.files,110);
 assert.equal(library.search({q:'renewal'}).total,0,'Original prefix search must not contain tail');
 const result=search.search({q:'annual renewal',mode:'all'});assert.equal(result.total,1);const id=result.items[0].resource.id;
 const matches=search.passages({q:'renewal',resourceId:id});assert.equal(matches.total,1);const excerpt=matches.items[0].excerpt;
 assert.equal(Buffer.from(large).subarray(excerpt.byteStart,excerpt.byteEnd).toString(),excerpt.text);assert.ok(excerpt.byteStart>1024*1024);
 assert.equal(search.search({q:'CAFÉ RÉSUMÉ λογική 資料'}).total,1);
 let count=0,offset=0;do{const r=search.search({q:'Opportunity',offset,limit:17});count+=r.items.length;offset=r.nextOffset;}while(offset!==null);assert.equal(count,107);
 const note=library.saveAnnotation(id,{expectedRevision:0,operationId:'native-note',note:'=Literal review, not a spreadsheet formula. <script>bad()</script>',tags:['Review'],starred:true});assert.equal(note.revision,1);
 const save={name:'Procurement opportunities',q:'annual renewal',operationId:'save-once'};
 const saved=search.saveQuery(save);assert.deepEqual(search.saveQuery(save),saved);assert.throws(()=>search.saveQuery({...save,name:'Different'}),{code:'OPERATION_ID_CONFLICT'});
 const edited=search.saveQuery({...saved,name:'Complete procurement review',expectedRevision:1,operationId:'edit-once'});assert.equal(edited.revision,2);
 assert.throws(()=>search.saveQuery({...saved,expectedRevision:1,operationId:'stale'}),{code:'SAVED_QUERY_REVISION_CONFLICT'});
 for(const format of ['json','csv','html']){
   const report=researchReport(search,{q:'annual renewal',format});let text='';for await(const chunk of report.chunks())text+=chunk;
   await writeFile(join(output,'findings.'+format),text);
   if(format==='json'){const data=JSON.parse(text);assert.equal(data.matchingFiles,1);assert.ok(data.findings.every(x=>x.annotation.note===note.note));assert.ok(data.findingCount>=2);}
   if(format==='csv')assert.ok(text.includes("'=Literal review"));
   if(format==='html'){assert.ok(!text.includes('<script>bad()'));assert.ok(text.includes('&lt;script&gt;'));}
 }
 await saveReport(search,join(output,'all-suppliers.json'),{q:'Opportunity'});assert.equal(JSON.parse(await readFile(join(output,'all-suppliers.json'))).findingCount,107);
 await assert.rejects(()=>saveReport(search,join(output,'all-suppliers.json'),{q:'Opportunity'}),{code:'EEXIST'});
 // Refresh stages a new build without replacing the complete searchable version.
 await add('New research edition.txt','Marketoutlook procurement forecast\n');await writeFile(source,JSON.stringify(jobs));await library.scan();
 assert.equal(search.status().stale,true);const abort=new AbortController();let progress=0;
 await assert.rejects(()=>search.index({signal:abort.signal,onProgress:()=>{if(++progress===2)abort.abort(new Error('customer interruption'));}}));
 assert.equal(search.status().last.state,'CANCELLED');assert.equal(search.search({q:'renewal'}).total,1);assert.equal(search.search({q:'Marketoutlook'}).total,0);
 const resumed=await search.index();assert.equal(resumed.state,'COMPLETE');assert.equal(search.search({q:'Marketoutlook'}).total,1);
 assert.equal(search.search({q:'Marketoutlook',build:built.id}).total,0);search.close();search=null;await library.close();
 library=await openLibrary({state});search=await openContentSearch(library);assert.equal(search.listSaved()[0].name,'Complete procurement review');assert.equal(search.search({q:'renewal'}).items[0].annotation.revision,1);
 const deletion={id:saved.id,expectedRevision:2,operationId:'delete-once'},deleted=search.deleteQuery(deletion);assert.deepEqual(search.deleteQuery(deletion),deleted);assert.equal(search.listSaved().length,0);
 assert.throws(()=>search.saveQuery({...save,id:saved.id,operationId:'recreate-stale'}),{code:'SAVED_QUERY_REVISION_CONFLICT'});
 search.saveQuery({...save,id:saved.id,expectedRevision:3,operationId:'restore-saved'});search.close();search=null;
 // The HTTP client and page use the same original bearer session and original downloads.
 const host=await serveContentSearch(library);try{
   const client=new ResearchClient(host),headers={Authorization:'Bearer '+host.token};
   assert.equal((await fetch(host.origin+'/api/content-search/status')).status,401);
   assert.equal((await fetch(host.origin+'/api/content-search/status',{headers:{...headers,Origin:'https://untrusted.invalid'}})).status,403);
   assert.equal((await fetch(host.url.split('#')[0])).status,200);
   let n=0;for await(const item of client.allResults({q:'Opportunity'}))n++;assert.equal(n,107);
   const ticket=await client.export({q:'renewal',format:'json'}),response=await fetch(host.origin+ticket.url),content=Buffer.from(await response.arrayBuffer());assert.equal(hash(content),ticket.sha256);assert.equal(content.length,ticket.bytes);assert.equal(JSON.parse(content).matchingFiles,1);
   const original=await fetch(host.origin+'/api/resources/'+id+'/download',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());
   assert.equal(hash(Buffer.from(await fetch(host.origin+original.url).then(r=>r.arrayBuffer()))),hash(large));
 }finally{await host.close();}
 for(const [path,digest]of originals)assert.equal(hash(await readFile(path)),digest);
 const resultSummary={ok:true,journeys:['Full-file multilingual search and complete pagination','Saved-query recovery, original annotations and complete portable reports','Cancelled refresh, resumed file reuse and retained build reopening','Authenticated browser API, all-page client and verified downloads'],files:111,largestFileBytes:Buffer.byteLength(large),journeyMilliseconds:Math.round(performance.now()-start),root,state,source,output};
 await writeFile(join(output,'journey.json'),JSON.stringify(resultSummary,null,2));console.log(JSON.stringify(resultSummary));
}finally{search?.close();await library.close();}
