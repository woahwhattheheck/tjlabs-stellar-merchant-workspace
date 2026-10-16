'use strict';
const runtime=require('../complete-state-read-throughput/runtime.cjs'),restore=require('../complete-state-read-throughput/restore-checkpoint.cjs');
module.exports=async function measureCompleteExport(product,files,graph,executionSource,progress=()=>{}){
 const input=restore(graph),state=input.state,records=input.records,editions=input.editions,B=runtime(files),H=B.req('sha256.cjs'),Z=B.req('src/connected_zip.cjs'),observed=[],byName=new Map();
 const profile={adds:0,copies:0,compressedInputBytes:0,reusedInputBytes:0,compressionMilliseconds:0,measurementHashMilliseconds:0};
 const digest=bytes=>{const at=Date.now(),h=H.sha256Bytes(bytes);profile.measurementHashMilliseconds+=Date.now()-at;return h.sha256;};
 const zip={createZipBuilder(options,checkpoint){let pending=null;
  const builder=Z.createZipBuilder({...options,deflateRaw(data,configuration){const at=Date.now(),packed=options.deflateRaw(data,configuration);profile.compressionMilliseconds+=Date.now()-at;profile.compressedInputBytes+=data.length;pending={input:data,packed,sha256:null};return packed;}},checkpoint);
  return{...builder,add(entry){pending=null;const result=builder.add(entry),data=typeof entry.data==='string'?Z.utf8(entry.data):entry.data;if(result.method===8&&!pending)throw Error('Missing actual compressed observation');const packedSha256=digest(result.method===8?pending.packed:data),entryRecord={...result,packedSha256};observed.push(entryRecord);byName.set(result.name,entryRecord);profile.adds++;pending=null;return result;},copy(name,priorName,mode){const prior=byName.get(priorName);if(!prior)throw Error('Missing exact reused archive payload');const result=builder.copy(name,priorName,mode);observed.push({...result,packedSha256:prior.packedSha256});byName.set(name,observed.at(-1));profile.copies++;profile.reusedInputBytes+=result.bytes;return result;}};
 }};
 const strip=s=>s.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),buildSource=files['src/build-installed.mjs'],buildName=buildSource.match(/export function (\w+)/)[1],buildDesk=Function('C','core','originalSessions','sessions',strip(buildSource)+';return '+buildName+';')(B.C,B.core,B.M,B.sessions);
 const factoryName=executionSource.match(/export function (create\w+StudyExportJob)\(/)[1],factory=Function(strip(executionSource)+';return '+factoryName+';')(),sourceIdentity=H.sha256Utf8(JSON.stringify(files)),executionIdentity=H.sha256Utf8(executionSource),inputIdentity=H.sha256Utf8(JSON.stringify(graph));
 const at=Date.now(),job=factory(files,state,records,editions,{codec:B.C,core:B.core,originalSessions:B.M,sessions:B.sessions,buildDesk,zip},{verifiedInputSha256:inputIdentity.sha256,archiveLimits:{maxBytes:1024*1024*1024,maxUncompressedBytes:0x7fffffff,maxEntries:65535}});
 let status=job.statistics(),last=Date.now();
 while(!status.done){status=job.run({maxGroups:8,maxMilliseconds:10000});if(Date.now()-last>5000||status.done){await progress({product,elapsedMilliseconds:Date.now()-at,...status,profile:{...profile}});last=Date.now();}}
 const wallMilliseconds=Date.now()-at,memberIdentity=H.sha256Utf8(JSON.stringify(observed)),receiving={stateSha256:state.sha256,requests:records.length,editions:editions.length,sequence:state.sequence};
 return{schema:'commons.complete-export-throughput-measurement.v1',product,sourceIdentity,executionIdentity,inputIdentity,receiving,wallMilliseconds,executionMilliseconds:wallMilliseconds-profile.measurementHashMilliseconds,status,profile,memberIdentity,members:observed};
};
