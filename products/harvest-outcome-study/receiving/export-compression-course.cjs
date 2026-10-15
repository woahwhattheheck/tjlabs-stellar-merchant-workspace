'use strict';
module.exports=async function compareExportCompression({files,workload,zipSource=files['src/connected_zip.cjs'],pakoSource=files['vendor/pako.cjs'],sourceHead=null,progress=()=>{}}){
 const started=Date.now(),strip=s=>s.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
 const course=files["receiving/host-course.cjs"],loaderStart=course.indexOf("const B=(()=>{"),loaderEnd=course.indexOf("})(),{core",loaderStart);
 if(loaderStart<0||loaderEnd<0)throw Error("Select the maintained installed host course");
 const B=Function("files","return (()=>{"+course.slice(loaderStart+"const B=(()=>{".length,loaderEnd)+"})();")(files),Z={exports:{}},P={exports:{}};
 Function("module","exports","require",zipSource)(Z,Z.exports,()=>{throw Error("Use the declared raw codec")});
 Function("module","exports",pakoSource)(P,P.exports);
 let captured;const oldPack=B.zip.packStoredZip;
 const capture=(entries,options)=>{captured={entries,options};return new Uint8Array(0)};B.zip.packStoredZip=capture;B.zip.packZip=capture;
 B.exporter(files,workload.state,workload.records,workload.editions);
 const {entries,options}=captured,collectionMs=Date.now()-started,limits={...options,maxUncompressedBytes:256*1024*1024,compression:"auto"};
 progress({phase:"entries_collected",members:entries.length,uncompressed_bytes:entries.reduce((n,e)=>n+e.data.length,0),elapsed_ms:collectionMs});
 let start=Date.now();const stored=oldPack(entries,options),storeMs=Date.now()-start;
 const comparisons=[],archives=new Map();
 for(const level of [1,6]){
  let calls=0;start=Date.now();
  const bytes=Z.exports.packZip(entries,{...limits,deflateRaw:data=>{calls++;return P.exports.deflateRaw(data,{level})}});
  const ms=Date.now()-start;archives.set(level,bytes);
  const item={level,bytes:bytes.length,pack_ms:ms,compression_calls:calls,sha256:B.C.sha256Bytes(bytes)};
  comparisons.push(item);progress({phase:"compression_complete",...item});
 }
 const first=comparisons[0],second=comparisons[1],chosen=second.bytes<=first.bytes*.9&&second.pack_ms<=Math.max(first.pack_ms*1.6,15000)?second:first;
 const selected=archives.get(chosen.level),inflateRaw=(packed,config)=>{
  const gzip=new Uint8Array(packed.length+18);gzip.set([31,139,8,0,0,0,0,0,0,255]);gzip.set(packed,10);
  const view=new DataView(gzip.buffer);view.setUint32(gzip.length-8,config.expected_crc32,true);view.setUint32(gzip.length-4,config.expected_bytes,true);
  return B.C.inflateGzip(gzip);
 };
 start=Date.now();const decoded=Z.exports.readZip(selected,{...limits,inflateRaw}),expected=new Map(entries.map(e=>[e.name,e]));let count=0;
 for(const member of decoded){const original=expected.get(member.name);if(!original||member.data.length!==original.data.length||B.C.sha256Bytes(member.data)!==original.sha256)throw Error("Member differs: "+member.name);count++;}
 if(count!==entries.length)throw Error("Member population differs");
 const readMs=Date.now()-start;
 return {schema:"commons.complete-export-compression-comparison/v2",application:"harvest-outcome-study",source_head:sourceHead,input_files:Object.keys(files).length,requests:workload.records.length,editions:workload.editions.length,members:entries.length,uncompressed_member_bytes:entries.reduce((n,e)=>n+e.data.length,0),entry_collection_ms:collectionMs,store:{bytes:stored.length,pack_ms:storeMs,sha256:B.C.sha256Bytes(stored)},comparisons,selected_level:chosen.level,selected_bytes:chosen.bytes,reduction_fraction:1-chosen.bytes/stored.length,independent_readback_ms:readMs,all_member_hashes_exact:true,reader:"Existing independent host gzip decoder with ZIP directory CRC and SHA-256 for every member",runtime:"connected V8",codec:"Official pako 2.1.0, complete upstream distributable"};
};