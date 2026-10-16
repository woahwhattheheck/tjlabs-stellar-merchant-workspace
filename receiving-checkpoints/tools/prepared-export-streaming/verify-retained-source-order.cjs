'use strict';
const {orderSourcesForCheckpoint, compactPreparedPayloads}=require('./checkpoint-source-order.cjs');
module.exports=function verify(bank,metadata,graph,loader){
 const start=Date.now(),req=loader(bank),sha=req('sha256.cjs'),zip=req('src/connected_zip.cjs'),pako=req('vendor/pako.cjs');
 const codec=Function(bank['host/codec.mjs'].replace(/^export\s*\{[^]*?\};/gm,'')+';return {utf8Encode,utf8Decode,sha256Bytes,hashText};')();
 const sorted=Object.fromEntries(JSON.parse(bank['source-manifest.json']).files.map(row=>[row.path,bank[row.path]]));sorted['source-manifest.json']=bank['source-manifest.json'];
 const ordered=orderSourcesForCheckpoint(sorted,metadata,codec),originalText=JSON.stringify(bank),orderedText=JSON.stringify(ordered);
 if(originalText!==orderedText)throw Error('Complete975 source bytes/order changed');
 const rejected=[];
 function reject(label,fn){let failed=false;try{fn();}catch(e){failed=true;}if(!failed)throw Error('Expected rejection: '+label);rejected.push(label);}
 reject('changed native source',()=>orderSourcesForCheckpoint({...sorted,'sha256.cjs':sorted['sha256.cjs']+'\n'},metadata,codec));
 const missing={...sorted};delete missing['sha256.cjs'];reject('missing source',()=>orderSourcesForCheckpoint(missing,metadata,codec));
 reject('source group after non-source group',()=>orderSourcesForCheckpoint(sorted,{...metadata,groups:[{key:'working/carrier',start:0,count:0},...metadata.groups]},codec));
 const r=req('receiving/checkpoint-reader.cjs')(graph),stateNode=r.field(r.root,'state'),carrierNode=r.field(stateNode,'carrier');
 const state={installationId:r.read(r.field(stateNode,'installationId')),sequence:r.read(r.field(stateNode,'sequence')),sha256:r.read(r.field(stateNode,'sha256')),carrier:{sha256:r.read(r.field(carrierNode,'sha256'))}};
 const ids=name=>graph.nodes[r.field(r.root,name)][1].map(node=>({id:r.read(r.field(node,'id'))}));
 const records=ids('records'),editions=ids('editions'),source=bank['host/export-core.mjs'],begin=source.indexOf('function createDistributionLotOrderStudyExportJob('),end=source.indexOf(' const s=S.receive',begin);
 if(begin<0||end<0)throw Error('Actual identity prelude changed');
 const identity=Function('return ('+source.slice(begin,end)+' return identity;\n})')();
 const options={verifiedInputSha256:'721d2942f5162aad05b1543d73a02c1aac2b8799a3ca5472109f26ad9319394c',archiveLimits:{maxBytes:1073741824,maxUncompressedBytes:2147483647,maxEntries:65535}};
 const originalIdentity=identity(bank,state,records,editions,{codec},options),restoredIdentity=identity(ordered,state,records,editions,{codec},options),sortedIdentity=identity(sorted,state,records,editions,{codec},options);
 if(originalIdentity!==metadata.identity||restoredIdentity!==metadata.identity||sortedIdentity===metadata.identity)throw Error('Actual original identity/order boundary differs');
 const factory=Function(source.replace(/export function/g,'function')+';return createPreparedExportJob;')();
 const sourceEntries=Object.entries(ordered),historyKeys=sourceEntries.map(([p])=>'source/'+p),more=sourceEntries.slice(0,10).map(([p,v])=>({name:'continued/'+p,value:v})),archiveOptions={timestamp:'2026-10-15T00:00:00Z',compression:'auto',maxBytes:1073741824,maxUncompressedBytes:2147483647,maxEntries:65535,deflateRaw:b=>pako.deflateRaw(b,{level:1}),inflateRaw:b=>pako.inflateRaw(b),codec};
 const manifest=entries=>({schema:'verification-complete-source.v1',files:entries.map(e=>({path:e.name,bytes:e.bytes,sha256:e.sha256}))});
 function* groups(poison=false){for(const [p,t]of sourceEntries)yield{key:'source/'+p,create:()=>{if(poison)throw Error('Replayed completed source');return[{name:'source/'+p,value:t}];}};yield{key:'continued/duplicates',create:()=>more};}
 const first=factory(()=>groups(),{zip,zipOptions:archiveOptions,identity:originalIdentity,manifest});
 const prior=first.run({maxGroups:975,maxMilliseconds:86400000});if(prior.completedGroups!==975||prior.done)throw Error('Actual source prefix differs');
 const checkpoint=first.checkpoint(),compacted=compactPreparedPayloads(checkpoint),oldZip=zip.createZipBuilder(archiveOptions,checkpoint.archive).finish(),newZip=zip.createZipBuilder(archiveOptions,compacted.archive).finish();
 const oldHash=sha.sha256Bytes(oldZip),newHash=sha.sha256Bytes(newZip);if(oldHash.bytes!==newHash.bytes||oldHash.sha256!==newHash.sha256)throw Error('Compaction changed actual complete source ZIP');
 for(let i=0;i<checkpoint.archive.entries.length;i++){const a=checkpoint.archive.entries[i],b=compacted.archive.entries[i];if(checkpoint.archive.payloads[a.payload_index]!==compacted.archive.payloads[b.payload_index]||JSON.stringify({...a,payload_index:0})!==JSON.stringify({...b,payload_index:0}))throw Error('Compaction changed packed member');}
 const resumed=factory(()=>groups(true),{zip,zipOptions:archiveOptions,identity:originalIdentity,checkpoint:compacted,manifest});
 const final=resumed.run({maxGroups:1000,maxMilliseconds:86400000});if(!final.done||final.completedGroups!==976)throw Error('Actual prefix resume did not finish');
 const resultBytes=resumed.finish(),expected=new Map(sourceEntries.map(([p,t])=>['source/'+p,codec.utf8Encode(t)]));for(const x of more)expected.set(x.name,codec.utf8Encode(x.value));
 let seen=0;const reopened=zip.readZip(resultBytes,{...archiveOptions,visitEntry:entry=>{if(entry.name==='EXPORT_MANIFEST.json')return;const wanted=expected.get(entry.name);if(!wanted||sha.sha256Bytes(entry.data).sha256!==sha.sha256Bytes(wanted).sha256)throw Error('Reopened original differs '+entry.name);seen++;}});
 if(seen!==985||reopened.length!==986)throw Error('Reopened complete source count differs');
 const done=factory(()=>{throw Error('Completed input must not enumerate');},{zip,zipOptions:archiveOptions,identity:originalIdentity,checkpoint:compactPreparedPayloads(resumed.checkpoint()),manifest});
 const noOp=done.run();if(!noOp.done||noOp.completedGroups!==976)throw Error('Completed no-op state changed');
 return {schema:'commons.retained-native-source-continuation-course.v1',retainedCommit:'a7bc7e947b1ef7314ca7864854c25d2cc1503b8b',retainedCompletedGroups:metadata.groups.length,sourceFiles:sourceEntries.length,sourceBank:sha.sha256Utf8(orderedText),originalIdentity,restoredIdentity,sortedIdentity,requests:records.length,editions:editions.length,sourcePrefixGroups:prior.completedGroups,completeSourceZip:oldHash,payloadsBefore:checkpoint.archive.payloads.length,payloadsAfter:compacted.archive.payloads.length,continuedGroups:final.completedGroups,continuedMembers:reopened.length,continuedArchive:sha.sha256Bytes(resultBytes),ordinaryOriginalMembersChecked:seen,completedReplay:noOp,rejected,elapsedMs:Date.now()-start};
};