async function publishFallbackOrdinaryReceipt(name){
 const result=load(name+"_fallback_archive_result");if(!result?.ordinaryReadback)throw Error("Complete actual ordinary archive readback first");
 const started=Date.now(),un=Function("return ("+load("un")+")")(),repo=load("repo"),api=Function("return ("+load("git_archive_api_source")+")")()(un,repo),
 read=Function("un","repo","return ("+load("fetch_text")+")")(un,repo),
 req=Function("return ("+load("bank_loader")+")")()(load("publisher_ordinary_work_bank")),H=req("sha256.cjs"),
 branch=load(name+"_fallback_archive_branch"),head=result.head,
 product=name==="water"?"water-operations-study":"fleet-availability-study",
 label=name==="water"?"Water Operations":"Fleet Availability",
 fileLabel=name==="water"?"Water_Complete_Source.zip":"Fleet_Complete_Source.zip",
 directory="receiving-checkpoints/"+product+"/memory-fallback-archive/";
 const old=load(name+"_fallback_delivery");if(old){text({name,reused:true,...old});return old;}
 const receipt={...result.ordinaryReadback,archive:{head,manifest:directory+"manifest.json",bytes:result.manifest.bytes,sha256:result.manifest.sha256},
  sourceMerge:load("fallback_merged_head"),publisherMerge:"f95eb896058b91da7e6083f4d4b548f586020fe7",
  sourceDerivation:load(name+"_fallback_derivation"),originalComparison:{...result.originalComparison,updatedSourceMerge:load("fallback_merged_head"),updatedWorkingHTML:load(name+"_fallback_build_result").working},
  sourceCache:result.providerObjectCache,publicationElapsedMs:result.elapsedMs};
 const body=JSON.stringify(receipt,null,2)+"\n",identity=H.sha256Utf8(body);
 const manifestText=await read(head,directory+"manifest.json"),manifestIdentity=H.sha256Utf8(manifestText);
 const actualManifest=JSON.parse(manifestText);if(actualManifest.sha256!==result.manifest.sha256||actualManifest.bytes!==result.manifest.bytes)throw Error("Final durable manifest differs");
 const cli=load("fetch_and_assemble_source"),cliIdentity=H.sha256Utf8(cli);
 if(cliIdentity.sha256!=="5f8029af4b58ea620b158c1864b3a5b08e726545783d77c98c589e72b8d2b8be"||cliIdentity.bytes!==11035)throw Error("Expected merged standalone native fetch command");
 const command="node fetch-and-assemble.mjs \\\n  --repository "+repo+" \\\n  --commit "+head+" \\\n  --manifest "+directory+"manifest.json \\\n  --manifest-sha256 "+manifestIdentity.sha256+" \\\n  --output /absolute/existing/directory/"+fileLabel;
 const note="# Complete repaired "+label+" archive received\n\nAll "+receipt.members.length+" ordinary ZIP members were reopened from actual acknowledged immutable Git blobs. The original member CRC32/SHA-256 values, original export manifest and ordered whole ZIP identity matched. All "+result.originalComparison.matchedMembers+" expected retained source/history members were also compared directly during this same ordinary pass; the explicit source and working-file replacements are recorded in the derivation.\n\nZIP bytes: "+receipt.bytes+"\n\nSHA-256: "+receipt.sha256+"\n\nExpanded bytes: "+receipt.uncompressedBytes+"\n\nSource merge: "+load("fallback_merged_head")+"\n\nThe complete member record is [ordinary-readback.json](ordinary-readback.json). The browser recovery repair preserves the complete retained course, requests and editions.\n\n## Download and assemble directly\n\nSave the neighboring [fetch-and-assemble.mjs](fetch-and-assemble.mjs) in a local directory with Node.js and the already authenticated GitHub CLI available. Select an existing output directory, then run:\n\n```sh\n"+command+"\n```\n\nThe command verifies the pinned manifest and every immutable Git blob, retains verified local parts for interrupted-download recovery, and verifies the complete ZIP before publishing the output. Repeating the same command resumes from its local cache or reuses an already complete matching output. Existing files with different contents are preserved. The source command is the exact maintained 11,035-byte file from merged PR2196 (ce1810d1a7c62a72034751f662f2b9fa39b82bb3), SHA-256 "+cliIdentity.sha256+".\n\nThe neighboring README.md and assemble-archive.mjs also support assembly from a local checkout. The original receiving operation has the exact standalone populated HTML attachment and its inspection instructions. Current working HTML: "+JSON.stringify(load(name+"_fallback_build_result").working)+".\n";
 let pending=load(name+"_fallback_readback_pending"),current=await api.getHead(branch);
 if(pending&&(pending.parent!==head||pending.identity?.sha256!==identity.sha256||pending.manifestIdentity?.sha256!==manifestIdentity.sha256))throw Error("Retained final readback publication identity differs");
 if(!pending){
  if(current!==head)throw Error("Archive branch changed before readback publication");
  const blob=await api.createBlob(body),tree=await api.createTree(await api.treeOf(head),[
   {path:directory+"ordinary-readback.json",mode:"100644",type:"blob",sha:blob},
   {path:directory+"ORDINARY_READBACK.md",mode:"100644",type:"blob",content:note},
   {path:directory+"fetch-and-assemble.mjs",mode:"100644",type:"blob",content:cli},
   {path:directory+"publish-final-receipt.js",mode:"100644",type:"blob",content:load("publish_fallback_ordinary_receipt_source")+"\n"}
  ]),next=await api.createCommit(head,tree,"Retain complete repaired "+name+" archive readback and direct receiving command");
  pending={parent:head,next,branch,blob,identity,manifestIdentity,command,cliIdentity};store(name+"_fallback_readback_pending",pending);
 }
 if(current!==pending.next){
  if(current!==pending.parent)throw Error("Final readback publication branch diverged");
  try{if(await api.updateRef(branch,pending.parent,pending.next)!==true)throw Error("Readback ref update not acknowledged");}
  catch(error){if(await api.getHead(branch)!==pending.next)throw error;}
 }
 if(await api.getHead(branch)!==pending.next)throw Error("Final readback head differs");
 let fetched=un(await tools.mcp__codex_apps__github_fetch_blob({repository_full_name:repo,blob_sha:pending.blob}));
 if(typeof fetched.content!=="string")fetched=un(await tools.mcp__codex_apps__github_fetch_blob({repository_full_name:repo,blob_sha:pending.blob}));
 if(typeof fetched.content!=="string"||H.sha256Utf8(fetched.content).sha256!==identity.sha256)throw Error("Durable ordinary readback differs");
 const installedCli=await read(pending.next,directory+"fetch-and-assemble.mjs");
 if(H.sha256Utf8(installedCli).sha256!==cliIdentity.sha256)throw Error("Durable receiving command differs");
 const final={head:pending.next,branch,directory,manifest:directory+"manifest.json",manifestCommit:head,manifestIdentity,command,bytes:receipt.bytes,sha256:receipt.sha256,members:receipt.members.length,expandedBytes:receipt.uncompressedBytes,working:load(name+"_fallback_build_result").working,ordinaryReceipt:identity};
 store(name+"_fallback_delivery",final);store(name+"_fallback_archive_interrupted",null);text({name,...final,elapsedMs:Date.now()-started});return final;
}
