'use strict';
module.exports=function completePreparedCourse(Old,New,Pako,files){
 const checks=[],check=(condition,name)=>{if(!condition)throw Error(name);checks.push(name);},same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 const options={timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxUncompressedBytes:512*1024*1024,maxEntries:60000,compression:'auto',deflateRaw:b=>Pako.deflateRaw(b,{level:1}),inflateRaw:b=>Pako.inflateRaw(b)};
 const entries=Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,data])=>({name,data}));
 let t=Date.now();const expected=Old.packZip(entries,options),oldMs=Date.now()-t;
 t=Date.now();const builder=New.createZipBuilder(options),half=Math.floor(entries.length/2);let snapshot;
 for(let i=0;i<entries.length;i++){builder.add(entries[i]);if(i+1===half)snapshot=JSON.parse(JSON.stringify(builder.snapshot()));}
 const actual=builder.finish(),preparedMs=Date.now()-t;
 check(same(expected,actual),'Complete ordinary source archive is byte-identical through early compression');
 check(same(expected,New.packZip(entries,options)),'Existing packZip API remains byte-identical');
 t=Date.now();const resumed=New.createZipBuilder({deflateRaw:options.deflateRaw,inflateRaw:options.inflateRaw},snapshot);for(let i=half;i<entries.length;i++)resumed.add(entries[i]);
 check(same(expected,resumed.finish()),'Serialized midpoint resumes the complete archive without repeating prior inputs');
 const resumeMs=Date.now()-t,observed=[];New.readZip(actual,{...options,visitEntry:r=>{const original=files[r.name];check(typeof original==='string'&&same(r.data,New.utf8(original)),'Exact member '+r.name);observed.push(r.name);}});
 check(observed.length===entries.length,'Every complete original is recovered from the archive');
 const changed=new Uint8Array([0,1,2,255]),mutable=New.createZipBuilder(options);mutable.add({name:'before.bin',data:changed});changed[0]=255;mutable.add({name:'after.bin',data:changed});mutable.copy('copy-before.bin','before.bin');
 const mutableRead=New.readZip(mutable.finish(),options);check(mutableRead.find(r=>r.name==='before.bin').data[0]===0&&mutableRead.find(r=>r.name==='after.bin').data[0]===255&&mutableRead.find(r=>r.name==='copy-before.bin').data[0]===0,'A changed mutable input and an owned alias preserve their respective bytes');
 function rejects(fn,name){let rejected=false;try{fn();}catch{rejected=true;}check(rejected,name);}
 const damaged=JSON.parse(JSON.stringify(snapshot));damaged.entries[0].crc32=(damaged.entries[0].crc32+1)>>>0;rejects(()=>New.createZipBuilder({inflateRaw:options.inflateRaw},damaged),'Changed checkpoint original checksum is rejected');
 const malformed=JSON.parse(JSON.stringify(snapshot));malformed.entries[0].payload_index=malformed.payloads.length;rejects(()=>New.createZipBuilder({inflateRaw:options.inflateRaw},malformed),'Missing checkpoint payload is rejected');
 const limit=New.createZipBuilder({...options,maxUncompressedBytes:2});rejects(()=>limit.add({name:'large',data:new Uint8Array(3)}),'Complete raw byte budget is enforced before compression');
 const collision=New.createZipBuilder(options);collision.add({name:'A',data:'one'});collision.add({name:'a',data:'two'});rejects(()=>collision.finish(),'Case-folded path collision is rejected before output');
 const mini=[{name:'a',data:'a'.repeat(200)},{name:'binary',data:new Uint8Array([0,255])}];check(same(Old.packStoredZip(mini,options),New.packStoredZip(mini,options)),'Existing STORE-only output remains byte-identical');
 return{schema:'commons.complete-prepared-zip-course.v1',source_members:entries.length,archive_bytes:actual.length,statistics:builder.statistics(),midpoint_entries:half,midpoint_payloads:snapshot.payloads.length,checkpoint_bytes:New.utf8(JSON.stringify(snapshot)).length,elapsed_ms:{original_pack:oldMs,prepared_including_checkpoint:preparedMs,resumed_remaining:resumeMs},whole_archive_sha256:null,checks:checks.filter(x=>!x.startsWith('Exact member ')),exact_members:observed.length};
};