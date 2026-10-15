'use strict';
module.exports=async function completeArchiveReadback(B,files,bank,progress=()=>{}){
 const R=require('./checkpoint-reader.cjs')(bank),state=R.read(R.field(R.root,'state')),recordNode=R.field(R.root,'records'),editionNode=R.field(R.root,'editions'),records=R.sequence(recordNode),editions=R.sequence(editionNode);
 const byId=node=>new Map(bank.nodes[node][1].map(ref=>[R.read(R.field(ref,'id')),R.field(ref,'value')]));
 const requestRefs=byId(recordNode),editionRefs=byId(editionNode),start=Date.now(),bytes=B.exporter(files,state,records,editions),built=Date.now();
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
 const result={sourceFiles:sources,requests:requestCount,editions:editionCount,historicalStudies:studyCount,members:count,uncompressedBytes:rawBytes,bytes:bytes.length,sha256:B.C.sha256Bytes(bytes),buildMs:built-start,totalMs:Date.now()-start,allMemberCRCAndSHAExact:true,allSourcesAndManagedRecordsExact:true,execution:'Actual final exporter with complete retained compact workload; one-at-a-time independent gzip/CRC/SHA and exact source/request/edition readback in V8'};
 return {bytes,result};
};