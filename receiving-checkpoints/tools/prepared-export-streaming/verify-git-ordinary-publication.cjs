'use strict';
const Z=require('./connected_zip.cjs'),H=require('./sha256.cjs'),P=require('./vendor/pako.cjs');
const Storage=require('./checkpoint-storage.cjs');
const {publishPreparedToGit}=require('./publish-prepared-git.cjs');
module.exports=async function verifyGitOrdinaryPublication(sourceBank,workingHTML,progress=()=>{}){
 const start=Date.now(),assert=(ok,message)=>{if(!ok)throw Error(message);};
 const limits={timestamp:'2026-10-15T00:00:00Z',maxBytes:512*1024*1024,maxUncompressedBytes:1024*1024*1024,maxEntries:65535,compression:'auto',deflateRaw:b=>P.deflateRaw(b,{level:1}),inflateRaw:b=>P.inflateRaw(b)};
 function prepare(items,wrongOriginal=false){
  const builder=Z.createZipBuilder(limits),entries=[],groups=[];
  for(const item of items){
   builder.add(item);groups.push({key:item.name,start:entries.length,count:1});
   entries.push({name:item.name,...H.sha256Bytes(typeof item.data==='string'?Z.utf8(item.data):item.data)});
  }
  if(wrongOriginal)entries[0].sha256='0'.repeat(64);
  const content=JSON.stringify({files:entries.map(x=>({path:x.name,bytes:x.bytes,sha256:x.sha256}))},null,2)+'\n';
  builder.add({name:'EXPORT_MANIFEST.json',data:content});entries.push({name:'EXPORT_MANIFEST.json',...H.sha256Utf8(content)});
  const checkpoint={schema:'commons.complete-export-job.v1',identity:H.sha256Utf8(JSON.stringify(entries)).sha256,done:true,groups,entries,archive:builder.snapshot()};
  return {builder,entries,...Storage.prepare(checkpoint,{hashText:t=>H.sha256Utf8(t).sha256,utf8Encode:Z.utf8},650003)};
 }
 function repository(){
  const id=(type,value)=>H.sha256Utf8(type+JSON.stringify(value)).sha256.slice(0,40);
  const blobs=new Map(),trees=new Map(),commits=new Map(),events=[];
  const empty=id('tree',{});trees.set(empty,{});
  let head=id('commit',{tree:empty});commits.set(head,{tree:empty});
  const faults={};
  const api={
   async getHead(){events.push('getHead');if(faults.nextHeadRead){faults.nextHeadRead=false;throw Error('Injected reconciliation read loss');}return head;},
   async treeOf(commit){events.push('treeOf');return commits.get(commit).tree;},
   async createBlob(text){events.push('createBlob');const sha=id('blob',text);blobs.set(sha,text);return sha;},
   async readBlob(sha){events.push('readBlob');if(faults.read){faults.read=false;throw Error('Injected immutable read failure');}const text=blobs.get(sha);if(faults.corrupt)return (text[0]==='A'?'B':'A')+text.slice(1);return text;},
   async createTree(base,entries){
    events.push('createTree');const tree={...trees.get(base)};
    for(const e of entries){if(e.content!==undefined){const sha=id('blob',e.content);blobs.set(sha,e.content);tree[e.path]=sha;}else tree[e.path]=e.sha;}
    const sha=id('tree',tree);trees.set(sha,tree);return sha;
   },
   async createCommit(parent,tree,message){events.push('createCommit');const value={parent,tree,message},sha=id('commit',value);commits.set(sha,value);return sha;},
   async updateRef(branch,expected,next){
    events.push('updateRef');assert(expected===head,'Fake provider lease mismatch');head=next;
    const tree=trees.get(commits.get(next).tree);
    if(faults.finalDualLoss&&tree['archive/manifest.json']){faults.finalDualLoss=false;faults.nextHeadRead=true;throw Error('Injected accepted final-ref response loss');}
    return true;
   }
  };
  return {api,faults,events,get head(){return head;},get final(){return Boolean(trees.get(commits.get(head).tree)['archive/manifest.json']);},
   file(path){const tree=trees.get(commits.get(head).tree);return blobs.get(tree[path]);}};
 }
 const base=repo=>({head:repo.head,branch:'course',directory:'archive/',sourceIndex:'prepared/checkpoint.json',sourceIndexHead:'1'.repeat(40),partBytes:487499,commitParts:3,extraFiles:{'OPEN.txt':'Retained exact companion\n'}});
 const run=(d,r,o={})=>publishPreparedToGit(d.manifest,p=>d.objects[p],r.api,{...base(r),...o});
 const rejected=[];
 async function rejects(name,operation,pattern){
  let error;try{await operation();}catch(e){error=e;}
  assert(error&&(!pattern||pattern.test(error.message)),'Did not reject '+name+' with the expected failure: '+error);
  rejected.push(name);return error;
 }
 const items=Object.entries(sourceBank).map(([name,data])=>({name:'source/'+name,data}));
 items.push({name:'working/Fleet_Availability_Study_Editable.html',data:workingHTML},
 {name:'original/Größe_日本語.txt',data:'UTF-8 😀\u0000\r\n'},
 {name:'original/binary.bin',data:Uint8Array.from({length:10007},(_,i)=>(i*73+19)&255)},
 {name:'original/empty.bin',data:new Uint8Array()});
 const durable=prepare(items),ordinaryRepo=repository(),seen=new Map(durable.entries.map(e=>[e.name,e]));
 progress({phase:'prepared',sourceFiles:Object.keys(sourceBank).length,members:durable.entries.length});
 const ordinary=await run(durable,ordinaryRepo,{verification:'ordinary',observeMember(member){
  const e=seen.get(member.name);assert(e&&e.bytes===member.bytes&&e.sha256===member.sha256,'Actual provider member differs '+member.name);seen.delete(member.name);
 },onProgress(state){
  assert(state.verification==='ordinary','Progress lost verification mode');
  if(!state.complete)assert(state.verifiedMembers===0,'Prepared emission counted as raw verification');
 }});
 const expected=H.sha256Bytes(durable.builder.finish());
 assert(!seen.size&&ordinary.manifest.sha256===expected.sha256&&ordinary.manifest.bytes===expected.bytes,'Full source/desk archive differs');
 assert(ordinary.ordinaryReadback.members.length===durable.entries.length&&!ordinary.receipt.requiresOrdinaryReadback,'Ordinary readback is incomplete');
 assert(ordinary.manifest.verification==='ordinary'&&JSON.parse(ordinaryRepo.file('archive/progress.json')).verification==='ordinary','Durable mode missing');
 assert(JSON.parse(ordinaryRepo.file('archive/receipt.json')).memberVerification==='ordinary-zip-crc32-sha256-and-export-manifest','Final receipt did not record raw verification');
 progress({phase:'ordinary-complete',...expected,members:ordinary.receipt.members});
 const fullRepo=repository(),full=await run(durable,fullRepo);
 assert(full.manifest.sha256===expected.sha256&&full.receipt.members===ordinary.receipt.members&&full.state.verification==='full','Default full mode changed');
 const writes=ordinaryRepo.events.filter(x=>x.startsWith('create')||x==='updateRef').length;
 const replay=await run(durable,ordinaryRepo,{verification:'ordinary',resumeState:ordinary.state});
 assert(replay.head===ordinary.head&&ordinaryRepo.events.filter(x=>x.startsWith('create')||x==='updateRef').length===writes,'Complete replay created new writes');
 const small=prepare([{name:'original.txt',data:'Retained exact original'}]);
 const events=ordinaryRepo.events.length;
 await rejects('completed ordinary mode switch',()=>run(durable,ordinaryRepo,{verification:'full',resumeState:ordinary.state}),/verification mode changed/);
 assert(ordinaryRepo.events.length===events,'Mode mismatch reached provider');
 const legacy={...full.state};delete legacy.verification;
 const before=fullRepo.events.length;
 await rejects('legacy full state adopted by ordinary mode',()=>run(durable,fullRepo,{verification:'ordinary',resumeState:legacy}),/verification mode changed/);
 assert(fullRepo.events.length===before,'Legacy mode mismatch reached provider');
 const bad=prepare([{name:'original.txt',data:'Retained exact original'}],true),badRepo=repository();
 await rejects('false raw SHA after packed emission',()=>run(bad,badRepo,{verification:'ordinary'}),/export manifest member differs/);
 assert(!badRepo.final,'False raw identity published final manifest');
 const corruptRepo=repository();corruptRepo.faults.corrupt=true;
 await rejects('changed actual Git blob',()=>run(small,corruptRepo,{verification:'ordinary'}),/part original text differs/);
 assert(!corruptRepo.final,'Changed provider bytes published final manifest');
 const retryRepo=repository();retryRepo.faults.read=true;
 const lost=await rejects('immutable read interruption',()=>run(small,retryRepo,{verification:'ordinary'}),/immutable read failure/);
 assert(!retryRepo.final&&lost.publicationState.verification==='ordinary','Interrupted read published complete result');
 const retried=await run(small,retryRepo,{verification:'ordinary',head:lost.publicationState.head,resumeState:lost.publicationState});
 assert(retried.manifest.receipt.requiresOrdinaryReadback===false,'Provider retry omitted ordinary verification');
 const pendingRepo=repository();pendingRepo.faults.finalDualLoss=true;
 const pending=await rejects('accepted final ref plus lost reconciliation',()=>run(small,pendingRepo,{verification:'ordinary'}),/reconciliation read loss/);
 const saved=pending.publicationState;
 assert(saved.pendingPublication?.complete&&saved.verification==='ordinary','Pending final commit or mode was lost');
 const pendingEvents=pendingRepo.events.length;
 await rejects('pending-final mode switch',()=>run(small,pendingRepo,{verification:'full',head:saved.head,resumeState:saved}),/verification mode changed/);
 assert(pendingRepo.events.length===pendingEvents,'Pending mode mismatch reached provider');
 const commits=pendingRepo.events.filter(x=>x==='createCommit').length;
 const settled=await run(small,pendingRepo,{verification:'ordinary',head:saved.head,resumeState:saved});
 assert(settled.head===saved.pendingPublication.nextHead&&pendingRepo.events.filter(x=>x==='createCommit').length===commits,'Known final commit was not reused');
 return {schema:'commons.git-ordinary-publication-course.v1',sourceFiles:Object.keys(sourceBank).length,
  sourceAndWorkingMembers:durable.entries.length,archive:expected,fullVerification:full.receipt,
  ordinaryVerification:ordinary.receipt,providerReads:ordinaryRepo.events.filter(x=>x==='readBlob').length,
  completeReplay:'same head, zero new writes',pendingFinalRecovery:'same acknowledged commit after response and reconciliation-read loss',
  rejected,elapsedMs:Date.now()-start};
};
