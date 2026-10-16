async function finishWaterReceiptFragments(){
 const name="water",result=load("water_fallback_archive_result"),pending=load("water_fallback_readback_pending"),un=Function("return ("+load("un")+")")(),repo=load("repo"),api=Function("return ("+load("git_archive_api_source")+")")()(un,repo),read=Function("un","repo","return ("+load("fetch_text")+")")(un,repo),req=Function("return ("+load("bank_loader")+")")()(load("publisher_ordinary_work_bank")),H=req("sha256.cjs");
 const directory="receiving-checkpoints/water-operations-study/memory-fallback-archive/",branch=pending.branch,head=result.head;
 const receipt={...result.ordinaryReadback,archive:{head,manifest:directory+"manifest.json",bytes:result.manifest.bytes,sha256:result.manifest.sha256},sourceMerge:load("fallback_merged_head"),publisherMerge:"f95eb896058b91da7e6083f4d4b548f586020fe7",sourceDerivation:load("water_fallback_derivation"),originalComparison:{...result.originalComparison,updatedSourceMerge:load("fallback_merged_head"),updatedWorkingHTML:load("water_fallback_build_result").working},sourceCache:result.providerObjectCache,publicationElapsedMs:result.elapsedMs};
 const body=JSON.stringify(receipt,null,2)+"\n",identity=H.sha256Utf8(body);
 if(identity.bytes!==pending.identity.bytes||identity.sha256!==pending.identity.sha256)throw Error("Exact retained full receipt differs");
 const chunks=[],fragments=[];for(let at=0;at<body.length;){let end=Math.min(at+650000,body.length);if(end<body.length){const last=body.charCodeAt(end-1);if(last>=0xd800&&last<=0xdbff)end--;}const content=body.slice(at,end),part=chunks.length,path="ordinary-readback-parts/part-"+String(part+1).padStart(4,"0")+".json.part";chunks.push(content);fragments.push({path,...H.sha256Utf8(content)});at=end;}
 const index={schema:"commons.ordinary-readback-text-parts.v1",encoding:"utf8-text-fragments",whole:{path:"ordinary-readback.json",gitBlob:pending.blob,...identity},fragments};
 let state=load("water_fallback_receipt_parts_pending"),current=await api.getHead(branch);
 if(!state){
  if(current!==pending.next)throw Error("Receipt branch moved before fragment publication");
  const note=await read(pending.next,directory+"ORDINARY_READBACK.md");
  const entries=fragments.map((p,i)=>({path:directory+p.path,mode:"100644",type:"blob",content:chunks[i]}));
  entries.push({path:directory+"ordinary-readback-parts.json",mode:"100644",type:"blob",content:JSON.stringify(index,null,2)+"\n"},{path:directory+"ORDINARY_READBACK.md",mode:"100644",type:"blob",content:note+"\nThe same complete member record is also retained as ordered bounded text fragments under ordinary-readback-parts/, with whole and individual byte/SHA identities in ordinary-readback-parts.json.\n"},{path:directory+"finish-receipt-fragments.js",mode:"100644",type:"blob",content:load("finish_water_receipt_fragments_source")+"\n"});
  const tree=await api.createTree(await api.treeOf(current),entries),next=await api.createCommit(current,tree,"Retain bounded exact Water full member receipt fragments");
  state={parent:current,next,branch,index};store("water_fallback_receipt_parts_pending",state);
 }
 if(state.index.whole.sha256!==identity.sha256)throw Error("Retained fragment publication identity differs");
 if(current!==state.next){if(current!==state.parent)throw Error("Receipt fragment branch diverged");try{if(await api.updateRef(branch,state.parent,state.next)!==true)throw Error("Receipt fragment ref not acknowledged");}catch(error){if(await api.getHead(branch)!==state.next)throw error;}}
 if(await api.getHead(branch)!==state.next)throw Error("Final receipt fragment head differs");
 const fetched=[];
 for(let offset=0;offset<fragments.length;offset+=3){const batch=fragments.slice(offset,offset+3),values=await Promise.all(batch.map(async p=>{let text;try{text=await read(state.next,directory+p.path);}catch{text=await read(state.next,directory+p.path);}const actual=H.sha256Utf8(text);if(actual.bytes!==p.bytes||actual.sha256!==p.sha256)throw Error("Durable receipt fragment differs "+p.path);return text;}));fetched.push(...values);}
 const actual=H.sha256Utf8(fetched.join(""));if(actual.bytes!==identity.bytes||actual.sha256!==identity.sha256)throw Error("Whole durable fragmented receipt differs");
 const manifestText=await read(state.next,directory+"manifest.json");if(H.sha256Utf8(manifestText).sha256!==pending.manifestIdentity.sha256)throw Error("Final manifest differs");
 const cli=await read(state.next,directory+"fetch-and-assemble.mjs");if(H.sha256Utf8(cli).sha256!==pending.cliIdentity.sha256)throw Error("Final native receiving command differs");
 const final={head:state.next,branch,directory,manifest:directory+"manifest.json",manifestCommit:head,manifestIdentity:pending.manifestIdentity,command:pending.command,bytes:receipt.bytes,sha256:receipt.sha256,members:receipt.members.length,expandedBytes:receipt.uncompressedBytes,working:load("water_fallback_build_result").working,ordinaryReceipt:identity,ordinaryReceiptFragments:{path:directory+"ordinary-readback-parts.json",parts:fragments.length}};
 store("water_fallback_delivery",final);store("water_fallback_archive_interrupted",null);text(final);return final;
}
