'use strict';
module.exports=function checkpointReader(bank){
 if(bank.schema!=="complete-json-checkpoint/v1"||!Array.isArray(bank.nodes))throw Error("checkpoint");
 const node=i=>{if(!Number.isSafeInteger(i)||i<0||i>=bank.nodes.length)throw Error("node");return bank.nodes[i]};
 function field(i,key){const n=node(i);if(n[0]!=="o")throw Error("object expected");const row=n[1].find(x=>x[0]===key);if(!row)throw Error("Missing "+key);return row[1];}
 function read(i,depth=0){if(depth>256)throw Error("depth");const n=node(i);if(n[0]==="p")return n[1];const ref=j=>{if(j>=i)throw Error("forward reference");return read(j,depth+1)};if(n[0]==="a")return n[1].map(ref);if(n[0]==="o")return Object.fromEntries(n[1].map(([k,j])=>[k,ref(j)]));throw Error("tag");}
 function sequence(i){const n=node(i);if(n[0]!=="a")throw Error("array expected");return {length:n[1].length,map(fn){return n[1].map((ref,index)=>fn(read(ref),index));},*[Symbol.iterator](){for(const ref of n[1])yield read(ref);}};}
 return {field,read,sequence,root:bank.root};
};
