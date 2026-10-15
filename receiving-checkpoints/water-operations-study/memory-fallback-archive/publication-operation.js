async function streamFallbackArchive(name){
 const started=Date.now(),un=Function("return ("+load("un")+")")(),repo=load("repo"),readGit=Function("un","repo","return ("+load("fetch_text")+")")(un,repo),
 bank=load("publisher_ordinary_work_bank"),req=Function("return ("+load("bank_loader")+")")()(bank),
 api=Function("return ("+load("git_archive_api_source")+")")()(un,repo),
 product=name==="water"?"water-operations-study":"fleet-availability-study",
 branch=load(name+"_fallback_archive_branch"),preparedHead=load(name+"_fallback_archive_head"),
 sourceIndex="receiving-checkpoints/"+product+"/resumable-complete-export/checkpoint.json",
 directory="receiving-checkpoints/"+product+"/memory-fallback-archive/",
 index=load(name+"_fallback_index"),objects=load(name+"_fallback_objects"),
 expected=load(name+"_fallback_expected_members"),seen=new Set();
 let read,providerObjects=0,objectCacheHits=0,objectCacheCharacters=0;
 const cache=new Map(),maxCache=32*1024*1024;
 async function cachedGit(path){
  if(cache.has(path)){const content=cache.get(path);cache.delete(path);cache.set(path,content);objectCacheHits++;return content;}
  const content=await readGit(preparedHead,sourceIndex.slice(0,sourceIndex.lastIndexOf("/")+1)+path);providerObjects++;
  if(content.length<=maxCache){cache.set(path,content);objectCacheCharacters+=content.length;while(objectCacheCharacters>maxCache){const first=cache.keys().next().value;objectCacheCharacters-=cache.get(first).length;cache.delete(first);}}
  return content;
 }
 if(name==="water"&&load("water_complete_checkpoint")){
  const C=Function(load("codec_source").replace(/^export .*$/gm,"")+";return {utf8Encode,utf8Decode,sha256Bytes,hashText,toBase64,fromBase64,gzipBytes,inflateGzip};")(),
   lazy=Function("return ("+load("lazy_prepared_objects")+")")()(load("water_complete_checkpoint"),load("water_complete_index"),C),prior=load("water_closure_objects");
  read=async path=>typeof objects[path]==="string"?objects[path]:typeof prior[path]==="string"?prior[path]:lazy.read(path);
 }else read=async path=>typeof objects[path]==="string"?objects[path]:cachedGit(path);
 api.readBlob=async gitBlob=>{
  const value=un(await tools.mcp__codex_apps__github_fetch_blob({repository_full_name:repo,blob_sha:gitBlob}));
  if(typeof value.content!=="string")throw Error("Missing original immutable Git blob "+gitBlob);return value.content;
 };
 const build=load(name+"_fallback_build_result"),identity={
  schema:"commons.git-archive-publication-source.v1",publisherMerge:"f95eb896058b91da7e6083f4d4b548f586020fe7",
  publisherSource:"f33bfb1602549cc6edcbc58604b75d086de6bddc",verification:"ordinary",
  productSourceMerge:load("fallback_merged_head"),preparedIndex:sourceIndex,preparedHead,
  derivation:load(name+"_fallback_derivation"),workingHTML:build.working,
  originalComparison:name==="fleet"?{archiveHead:"4dacae9f842af7e3e6d94ffb4074832c582a3fde",archiveSha256:load("fleet_original_ordinary_receipt").sha256,expectedMembers:Object.keys(expected).length}:{
   originalPreparedHead:load("water_complete_head"),independentDirectMembers:Object.keys(load("water_fallback_direct_expected_members")).length,expectedMembers:Object.keys(expected).length}
 };
 const readme="# Complete "+(name==="fleet"?"Fleet Availability":"Water Operations")+" repaired working archive\n\nThis archive contains the complete installed source, populated editable desk, retained requests, every edition, original input bytes, managed state and working history. The browser persistence repair preserves memory-only edits and recovery guidance when IndexedDB is unavailable. It retains every historical archive member and compressed payload except the explicit source, current working HTML and export-manifest replacements recorded in PUBLICATION_SOURCE.json.\n\nFrom a checkout of this branch, assemble the ordinary ZIP:\n\nnode "+directory+"assemble-archive.mjs /absolute/path/"+(name==="fleet"?"Fleet_Availability":"Water_Operations")+"_Complete_Source.zip\n\nThe assembler verifies exact independent part bytes and the ordered whole archive hash. Extract the ZIP and open working/"+(name==="fleet"?"Fleet_Availability":"Water_Operations")+"_Study_Editable.html. Follow source/README.md and source/INSTALLED_OPERATION.md for the application, and source/receiving/RESUMABLE_EXPORT.md for native export continuation.\n\nEvery original member is reopened from actual acknowledged immutable Git blobs before this final manifest and receipt are published. The receipt carries ordinary CRC32/SHA-256, complete export-manifest and whole ZIP results. PUBLICATION_SOURCE.json binds the original prepared index, repaired installed source and exact working HTML.\n\nRepaired source merge: "+load("fallback_merged_head")+"\nPopulated HTML: "+build.working.bytes+" bytes / SHA-256 "+build.working.sha256+"\n";
 const options={head:preparedHead,branch,directory,sourceIndex,sourceIndexHead:preparedHead,verification:"ordinary",partBytes:1950000,commitParts:8,
 extraFiles:{"assemble-archive.mjs":load("assemble_archive_source"),"README.md":readme,"PUBLICATION_SOURCE.json":JSON.stringify(identity,null,2)+"\n"},
 onProgress(state){store(name+"_fallback_archive_progress",state);notify({name,phase:state.complete?"complete":"published-parts",head:state.head,parts:state.committedParts,emittedMembers:state.emittedMembers,verifiedMembers:state.verifiedMembers,elapsed:Date.now()-started});},
 onInterrupted(state,error){store(name+"_fallback_archive_interrupted",{...state,error:String(error)});},
 observeMember(member,progress){
  if(member.name!=="EXPORT_MANIFEST.json"){
   const prior=expected[member.name];if(!prior||prior.bytes!==member.bytes||prior.sha256!==member.sha256)throw Error("Exact retained source/history member differs "+member.name);seen.add(member.name);
  }
  if(progress.verifiedMembers===index.entries&&seen.size!==Object.keys(expected).length)throw Error("Original complete archive member omitted");
  if(progress.verifiedMembers%2000===0)notify({name,phase:"ordinary-readback",members:progress.verifiedMembers,expectedMatched:seen.size,elapsed:Date.now()-started});
 }};
 const retainedOptions={...options,onProgress:undefined,onInterrupted:undefined,observeMember:undefined};
 store(name+"_fallback_archive_options",retainedOptions);
 const operationEntries=[
  {path:directory+"publication-options.json",mode:"100644",type:"blob",content:JSON.stringify({...retainedOptions,head:undefined,initialPreparedHead:preparedHead},null,2)+"\n"},
  {path:directory+"publication-operation.js",mode:"100644",type:"blob",content:load("stream_fallback_archive_source")+"\n"},
  {path:directory+"git-provider-adapter.js",mode:"100644",type:"blob",content:load("git_archive_api_source")+"\n"}
 ];
 const operationTree=await api.createTree(await api.treeOf(preparedHead),operationEntries),operationHead=await api.createCommit(preparedHead,operationTree,"Retain exact "+name+" ordinary Git publication options before execution");
 store(name+"_fallback_operation_pending",{parent:preparedHead,next:operationHead,branch});
 try{if(await api.updateRef(branch,preparedHead,operationHead)!==true)throw Error("Operation publication ref was not acknowledged");}
 catch(error){if(await api.getHead(branch)!==operationHead)throw error;}
 if(await api.getHead(branch)!==operationHead)throw Error("Operation publication head differs");
 options.head=operationHead;store(name+"_fallback_operation_head",operationHead);
 store(name+"_fallback_archive_options",{...retainedOptions,head:operationHead});
 const result=await req("publish-prepared-git.cjs").publishPreparedToGit(index,read,api,options);
 if(seen.size!==Object.keys(expected).length)throw Error("Complete original archive comparison omitted members");
 const comparison={expectedMembers:Object.keys(expected).length,matchedMembers:seen.size,
  originalInput:name==="water"?load("water_expected_member_receipt"):load("fleet_original_ordinary_receipt").originalInput,
  directMembers:name==="water"?Object.keys(load("water_fallback_direct_expected_members")).length:268};
 const final={...result,originalComparison:comparison,providerObjectCache:{providerObjects,objectCacheHits,maxCharacters:maxCache,retainedCharacters:objectCacheCharacters},elapsedMs:Date.now()-started};
 store(name+"_fallback_archive_result",final);store(name+"_fallback_final_head",result.head);store(name+"_fallback_final_manifest",result.manifest);
 text({name,head:result.head,bytes:result.manifest.bytes,sha256:result.manifest.sha256,members:result.receipt.members,parts:result.manifest.parts.length,comparison,elapsedMs:final.elapsedMs});
}
