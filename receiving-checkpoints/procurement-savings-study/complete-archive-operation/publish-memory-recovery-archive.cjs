'use strict';
module.exports=async function publishProcurementMemoryRecoveryArchive({tools,un,loader,bank,index,expected,readObject,apiSource,options,store,notify}){
 const get=loader(bank),api=apiSource(tools,un,'woahwhattheheck/tjlabs-stellar-merchant-workspace',options.head,options.tree);
 api.readBlob=async gitBlob=>{const r=un(await tools.mcp__codex_apps__github_fetch_blob({repository_full_name:'woahwhattheheck/tjlabs-stellar-merchant-workspace',blob_sha:gitBlob}));if(typeof r.content!=='string')throw Error('Git blob text missing: '+gitBlob);return r.content;};
 const wanted=new Map(expected.entries.map(x=>[x.name,x])),structure=new Map(expected.archive.entries.map(x=>[x.name,x]));
 if(wanted.size!==25391||structure.size!==wanted.size)throw Error('Complete expected index differs');
 let last=Date.now(),lastMember='',counts={source:0,requests:0,editions:0,prior:0},visited=0;
 const studies=new Set();
 try{
  const result=await get('publish-prepared-git.cjs').publishPreparedToGit(index,readObject,api,{
   ...options,verification:'ordinary',
   onProgress:async state=>{store('archive_memory_output_publication_state',state);notify({head:state.head,parts:state.committedParts,emittedMembers:state.emittedMembers,verifiedMembers:state.verifiedMembers,complete:state.complete});},
   onInterrupted:async (state,error)=>{store('archive_memory_output_publication_state',state);store('archive_memory_output_publication_error',{message:String(error),stack:error?.stack});},
   observeMember:async (member,state)=>{
    const entry=wanted.get(member.name);if(!entry||member.bytes!==entry.bytes||member.sha256!==entry.sha256)throw Error('Original complete member differs: '+member.name);
    wanted.delete(member.name);visited++;lastMember=member.name;
    if(member.name.startsWith('source/'))counts.source++;
    if(member.name.startsWith('managed/requests/'))counts.requests++;
    if(member.name.startsWith('managed/editions/'))counts.editions++;
    if(member.name.startsWith('working/prior/'))counts.prior++;
    if(member.name.startsWith('editions/'))studies.add(member.name.split('/')[1]);
    if(visited===25391&&(wanted.size||counts.source!==664||counts.requests!==39||counts.editions!==40||counts.prior!==37||studies.size!==38))throw Error('Original complete category counts differ');
    if(Date.now()-last>45000){last=Date.now();notify({ordinaryMembers:visited,parts:state.parts,lastMember});}
   }
  });
  if(wanted.size||result.ordinaryReadback.members.length!==25391)throw Error('Missing complete ordinary members');
  for(const member of result.ordinaryReadback.members){const e=structure.get(member.name);if(!e||['bytes','compressedBytes','method','mode','crc32'].some(key=>e[key]!==member[key]))throw Error('Original complete ZIP metadata differs: '+member.name);structure.delete(member.name);}
  if(structure.size)throw Error('Missing original ZIP metadata');
  const summary={schema:'tjlabs.procurement-complete-ordinary-git-readback.v1',head:result.head,sourceIndex:options.sourceIndex,sourceIndexHead:options.sourceIndexHead,identity:index.identity,bytes:result.receipt.bytes,sha256:result.receipt.sha256,members:visited,uncompressedBytes:result.receipt.uncompressedBytes,parts:result.manifest.parts.length,counts:{...counts,distinctStudies:studies.size},verification:result.receipt.memberVerification,sourceStats:result.receipt.ordinaryReadback.sourceStats,allOriginalMetadataExact:true};
  store('archive_memory_output_complete',result);store('archive_memory_output_result',summary);store('archive_memory_output_publication_error',null);return summary;
 }catch(error){store('archive_memory_output_publication_error',{message:String(error),stack:error?.stack,lastMember,visited,state:error?.publicationState});throw error;}
};
