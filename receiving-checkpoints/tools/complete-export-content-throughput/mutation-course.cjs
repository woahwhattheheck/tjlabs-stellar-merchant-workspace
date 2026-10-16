'use strict';
module.exports=function runExactContentMutationCourse(factory,codec,zip,input,compression={}){
 const value=JSON.parse(JSON.stringify(input)),expected=[],prefix='whole-state/';
 function* groups(){for(let i=0;i<4;i++){yield{key:'state-'+i,create:()=>{if(i===2)value.sequence+=1;const text=JSON.stringify(value,null,2)+'\n';expected.push(codec.hashText(text));return[{name:prefix+i+'.json',value}];}}}}
 const job=factory(groups,{zip,zipOptions:{timestamp:'2026-10-15T00:00:00Z',compression:'auto',maxBytes:128*1024*1024,maxUncompressedBytes:0x7fffffff,maxEntries:100,codec,...compression},identity:'exact-full-state-mutation',manifest:entries=>({schema:'mutation-course',files:entries})});
 while(!job.run({maxGroups:1,maxMilliseconds:10000}).done){}
 const bytes=job.finish(),read=zip.readZip(bytes,{maxBytes:128*1024*1024,maxUncompressedBytes:0x7fffffff,maxEntries:100,...compression}),actual=read.filter(x=>x.name.startsWith(prefix)).map(x=>codec.sha256Bytes(x.data));
 if(actual.length!==4||actual.some((x,i)=>x!==expected[i])||actual[0]!==actual[1]||actual[1]===actual[2]||actual[2]!==actual[3])throw Error('Exact full-state mutation invalidation differs');
 return{schema:'commons.complete-export-mutation-course.v1',members:read.length,zipBytes:bytes.length,zipSha256:codec.sha256Bytes(bytes),memberHashes:actual,cache:job.statistics().contentCache||null};
};
