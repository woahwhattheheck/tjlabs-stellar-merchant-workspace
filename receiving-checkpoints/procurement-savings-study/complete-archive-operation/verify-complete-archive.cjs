'use strict';
module.exports = async function verifyPublishedProcurementArchive({tools,un,loader,bank,manifest,expectedCheckpoint,expectedSourceHead,expectedIdentity,notify,store}){
 const get=loader(bank),H=get('sha256.cjs'),R=get('ordinary-zip-range.cjs'),A=get('streamed-archive-source.cjs');
 if(manifest.sourceIndexHead!==expectedSourceHead||manifest.receipt?.identity!==expectedIdentity)throw Error('Published source identity differs');
 const expected=new Map(expectedCheckpoint.entries.map(e=>[e.name,e]));
 const prepared=new Map(expectedCheckpoint.archive.entries.map(e=>[e.name,e]));
 let visited=0,lastProgress=Date.now(),exportHeader=null;const categories={source:0,managedRequests:0,managedEditions:0,retainedBranches:0};
 const source=A.createStreamedArchiveSource(manifest,async part=>{
  if(!/^[a-f0-9]{40}$/.test(part.gitBlob))throw Error('Published part has no exact Git blob');
  const result=un(await tools.mcp__codex_apps__github_fetch_blob({repository_full_name:'woahwhattheheck/tjlabs-stellar-merchant-workspace',blob_sha:part.gitBlob}));
  if(typeof result.content!=='string')throw Error('Missing published original part '+part.path);
  return result.content;
 });
 const receipt=await R.readCompleteExportRanges(source,{
  maxBytes:512*1024*1024,maxUncompressedBytes:1024*1024*1024,maxEntries:60000,
  maxCapturedEntryBytes:16*1024*1024,expectedSha256:manifest.sha256,
  visitEntry:async entry=>{
   const wanted=expected.get(entry.name),packed=prepared.get(entry.name);
   if(!wanted||wanted.bytes!==entry.bytes||wanted.sha256!==entry.sha256||!packed||
      packed.crc32!==entry.crc32||packed.mode!==entry.mode||packed.method!==entry.method||
      packed.compressedBytes!==entry.compressedBytes)throw Error('Original prepared member differs '+entry.name);
   expected.delete(entry.name);visited++;
   if(entry.name.startsWith('source/'))categories.source++;
   if(entry.name.startsWith('managed/requests/'))categories.managedRequests++;
   if(entry.name.startsWith('managed/editions/'))categories.managedEditions++;
   if(entry.name.startsWith('working/prior/'))categories.retainedBranches++;
   if(entry.name==='EXPORT_MANIFEST.json'){
    const m=JSON.parse(get('text.cjs').decode(entry.data));
    exportHeader={schema:m.schema,installationId:m.installationId,editionSha256:m.editionSha256,sessionSha256:m.sessionSha256,sequence:m.sequence};
    if(m.schema!=='stellar-forge.procurement-savings-export.v1'||
     m.editionSha256!=='59616e996265f5ffaf811f235f91ec7818eb54f015c89cc24978265d1f1d03cb'||
     m.sessionSha256!=='9198e1142efa89feb034b3515ea7ffb64a88be300cd1b2865cee0fe2dfb21767'||m.sequence!==38)
     throw Error('Original complete working state differs');
   }
   if(Date.now()-lastProgress>45000){lastProgress=Date.now();const progress={visited,total:expectedCheckpoint.entries.length,lastMember:entry.name,parts:source.stats().fetchedParts};store('archive_readback_progress',progress);notify(progress);}
  }
 });
 if(expected.size||visited!==25391||categories.source!==664||categories.managedRequests!==39||
 categories.managedEditions!==40||categories.retainedBranches!==37||!exportHeader)throw Error('Complete archive coverage differs');
 const {members,...summary}=receipt;
 return {...summary,schema:'tjlabs.procurement-complete-ordinary-archive-readback.v1',members:members.length,
 sourceIndexHead:manifest.sourceIndexHead,identity:manifest.receipt.identity,categories,
 distinctStudies:expectedCheckpoint.metadata.studies.length,exportHeader,sourceStats:source.stats(),
 verifiedAllOriginalPreparedMembers:true};
};
