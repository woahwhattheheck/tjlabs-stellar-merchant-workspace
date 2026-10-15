'use strict';
module.exports=async function completeArchiveReadback(B,files,bank,progress=()=>{}){
 const R=require('./checkpoint-reader.cjs')(bank),state=R.read(R.field(R.root,'state')),recordNode=R.field(R.root,'records'),editionNode=R.field(R.root,'editions'),records=R.sequence(recordNode),editions=R.sequence(editionNode);
 const byId=node=>new Map(bank.nodes[node][1].map(ref=>[R.read(R.field(ref,'id')),R.field(ref,'value')]));
 const requestRefs=byId(recordNode),editionRefs=byId(editionNode),start=Date.now(),stages=[],counts={history:0,branches:0,studies:0,compression:0};
 const watch=(label,fn)=>function(...args){const at=Date.now(),index=counts[label]=(counts[label]||0)+1;progress({phase:label+'-start',index,elapsedMs:at-start});const result=fn(...args),row={phase:label,index,ms:Date.now()-at,elapsedMs:Date.now()-start};stages.push(row);progress(row);return result;};
 const M={...B.M,historyStudy:watch('history',(...a)=>B.M.historyStudy(...a)),branchSession:watch('branches',(...a)=>B.M.branchSession(...a)),exports:watch('session-export',(...a)=>B.M.exports(...a))};
 const core={...B.core,exports:watch('studies',(...a)=>B.core.exports(...a))};
 let lastEntry=Date.now();
 const observeEntry=event=>{const now=Date.now();if(event.name.startsWith('managed/')||event.name.startsWith('working/')||event.name==='EXPORT_MANIFEST.json'||event.phase==='done'&&(event.entries%1000===0||now-lastEntry>10000)){lastEntry=now;progress({...event,phase:'entry-'+event.phase,elapsedMs:now-start});}};
 const zip={...B.zip,createZipBuilder(options,checkpoint){
  const raw=options.deflateRaw;let inputBytes=0,last=Date.now();
  const builder=B.zip.createZipBuilder({...options,deflateRaw(bytes,cfg){const packed=raw(bytes,cfg);counts.compression++;inputBytes+=bytes.length;if(counts.compression%100===0||Date.now()-last>5000){last=Date.now();progress({phase:'compression',calls:counts.compression,inputBytes,elapsedMs:Date.now()-start});}return packed;}},checkpoint);
  return Object.freeze({...builder,finish(){const before=builder.statistics();progress({phase:'zip-start',...before,elapsedMs:Date.now()-start});const at=Date.now(),result=builder.finish(),row={phase:'zip',ms:Date.now()-at,...before,bytes:result.length,compressionCalls:counts.compression};stages.push(row);progress(row);return result;}});
 }};
 const exportCore=Function(B.strip(files['host/export-core.mjs'])+';return buildWaterOperationsStudyExport;')(),bytes=exportCore(files,state,records,editions,{codec:B.C,core,originalSessions:M,sessions:B.sessions,buildDesk:B.build,zip,observeEntry}),built=Date.now();
 progress({phase:'archive_built',bytes:bytes.length,buildMs:built-start});
 const inflateRaw=(packed,cfg)=>{const gzip=new Uint8Array(packed.length+18);gzip.set([31,139,8,0,0,0,0,0,0,255]);gzip.set(packed,10);const v=new DataView(gzip.buffer);v.setUint32(gzip.length-8,cfg.expected_crc32,true);v.setUint32(gzip.length-4,cfg.expected_bytes,true);return B.C.inflateGzip(gzip);};
 let manifest=null,expected=null,count=0,rawBytes=0,sources=0,requestCount=0,editionCount=0,workingCount=0,studyCount=0;
 const exact=(row,value)=>{if(JSON.stringify(JSON.parse(B.C.utf8Decode(row.data)))!==JSON.stringify(value))throw Error('Retained JSON differs '+row.name);};
 const rows=B.zip.readZip(bytes,{maxBytes:256*1024*1024,maxUncompressedBytes:512*1024*1024,maxEntries:60000,inflateRaw,visitEntry(row){
  count++;rawBytes+=row.bytes;
  if(row.name==='EXPORT_MANIFEST.json'){manifest=JSON.parse(B.C.utf8Decode(row.data));expected=new Map(manifest.files.map(x=>[x.path,x]));if(expected.size!==manifest.files.length)throw Error('Duplicate manifest paths');return;}
  const e=expected?.get(row.name);if(!e||e.bytes!==row.bytes||e.sha256!==B.C.sha256Bytes(row.data))throw Error('Member integrity differs '+row.name);expected.delete(row.name);
  if(row.name.startsWith('source/')){const p=row.name.slice(7);if(!Object.hasOwn(files,p)||B.C.utf8Decode(row.data)!==files[p])throw Error('Source differs '+p);sources++;}
  if(row.name==='working/Water_Operations_Study_Working.json'){exact(row,state.carrier);workingCount++;}
  if(row.name==='working/Managed_Edition.json'){exact(row,state);workingCount++;}
  if(row.name.startsWith('managed/requests/')){const id=row.name.slice(17,-5),ref=requestRefs.get(id);if(ref===undefined)throw Error('Unknown request');exact(row,R.read(ref));requestCount++;}
  if(row.name.startsWith('managed/editions/')){const id=row.name.slice(17,-5),ref=editionRefs.get(id);if(ref===undefined)throw Error('Unknown edition');exact(row,R.read(ref));editionCount++;}
  if(/^editions\/[a-f0-9]{64}\/study.json$/.test(row.name)){const study=JSON.parse(B.C.utf8Decode(row.data));if(B.core.hash(study)!==row.name.split('/')[1])throw Error('Historical study identity differs');studyCount++;}
  if(count%1000===0)progress({phase:'member_readback',members:count,rawBytes});
 }});
 if(!manifest||expected.size||manifest.files.length!==rows.length-1||sources!==Object.keys(files).length||requestCount!==records.length||editionCount!==editions.length||workingCount!==2)throw Error('Incomplete complete-archive population');
 const result={stages,sourceFiles:sources,requests:requestCount,editions:editionCount,historicalStudies:studyCount,members:count,uncompressedBytes:rawBytes,bytes:bytes.length,sha256:B.C.sha256Bytes(bytes),buildMs:built-start,totalMs:Date.now()-start,allMemberCRCAndSHAExact:true,allSourcesAndManagedRecordsExact:true,execution:'Actual final exporter with complete retained compact workload; one-at-a-time independent gzip/CRC/SHA and exact source/request/edition readback in V8'};
 return {bytes,result};
};