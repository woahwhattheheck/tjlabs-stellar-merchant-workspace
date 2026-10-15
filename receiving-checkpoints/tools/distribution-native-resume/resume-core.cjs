'use strict';
// Exact, compact state recovery shared by the Distribution native continuation.
const hydrate=function hydrateGraph(c){if(c?.schema!=="complete-json-checkpoint/v1"||!Array.isArray(c.nodes)||!Number.isSafeInteger(c.root))throw Error("Invalid checkpoint graph");const out=[];for(let i=0;i<c.nodes.length;i++){const [t,v]=c.nodes[i];if(t==="p"){if(v!==null&&typeof v==="object")throw Error("Nonprimitive node");out.push(v);}else if(t==="a"){out.push(v.map(id=>{if(!Number.isSafeInteger(id)||id<0||id>=i)throw Error("Forward node");return out[id]}));}else if(t==="o"){const o={};for(const [k,id]of v){if(typeof k!=="string"||Object.hasOwn(o,k)||!Number.isSafeInteger(id)||id<0||id>=i)throw Error("Invalid object node");Object.defineProperty(o,k,{value:out[id],enumerable:true,writable:true,configurable:true});}out.push(o);}else throw Error("Unknown graph node");}if(c.root<0||c.root>=out.length)throw Error("Root invalid");return out[c.root];};
const phases=['complete-imports','before-pinned-reads','after-pinned-reads','complete-course'];
function rank(phase){const m=/^imports-(\d+)$/.exec(phase);if(m){const n=Number(m[1]);if(n<0||n>39)throw Error('Import phase outside the original course');return n;}const p=phases.indexOf(phase);if(p<0)throw Error('Unknown complete-course phase');return 40+p;}
function compact(value){
 const nodes=[],seen=new Map(),objects=new WeakMap(),visiting=new WeakSet();
 function put(v){
  const object=v!==null&&typeof v==='object';
  if(object){if(objects.has(v))return objects.get(v);if(visiting.has(v))throw Error('Checkpoint contains a cycle');visiting.add(v);}
  else if(!['string','number','boolean'].includes(typeof v)&&v!==null||typeof v==='number'&&!Number.isFinite(v))throw Error('Checkpoint contains a non-JSON value');
  const n=object?(Array.isArray(v)?['a',v.map(put)]:['o',Object.entries(v).map(([k,x])=>[k,put(x)])]):['p',v];
  const key=JSON.stringify(n);let id=seen.get(key);if(id===undefined){id=nodes.length;nodes.push(n);seen.set(key,id);}
  if(object){visiting.delete(v);objects.set(v,id);}return id;
 }
 const root=put(value);return{schema:'complete-json-checkpoint/v1',nodes,root};
}
function binding(input,payload){
 if(input.schema!=='commons.complete-source-bank.v1'||input.edition!=='distribution-original-complete-merchant-course-resume-imports24')throw Error('Unexpected input envelope schema');
 if(!Number.isSafeInteger(input.bytes)||input.bytes<1||!/^[a-f0-9]{64}$/.test(input.sha256))throw Error('Input byte identity is invalid');
 if(payload.sourceVersion!=='9b2453fe855ce3ad9fa8d057a1649265809ce7ee'||payload.originalPrefixSource!=='710bfa6703031892daed620b1fd880aa6c124f81')throw Error('Original complete course sources differ');
 return{sourceVersion:payload.sourceVersion,originalPrefixSource:payload.originalPrefixSource,inputBytes:input.bytes,inputSha256:input.sha256};
}
function describe(value,identity,source){
 if(!value||!Array.isArray(value.records)||!Array.isArray(value.editions)||!Array.isArray(value.checks)||!Array.isArray(value.timings)||!value.state)throw Error('Incomplete saved course');
 rank(value.phase);if(value.editions.length!==value.records.length+1||!Number.isSafeInteger(value.state.sequence)||value.state.sequence<0)throw Error('Saved original history differs');
 if(!Number.isSafeInteger(identity.bytes)||identity.bytes<1||!/^[a-f0-9]{64}$/.test(identity.sha256)||!/^[a-f0-9]{64}$/.test(value.state.sha256))throw Error('Invalid checkpoint identity');
 return{schema:'distribution.native-course-checkpoint/v2',...source,phase:value.phase,checkpoint:{path:value.phase+'.'+identity.sha256+'.checkpoint.json',...identity},requests:value.records.length,editions:value.editions.length,checks:value.checks.length,sequence:value.state.sequence,stateSha256:value.state.sha256};
}
function restore(graph,receipt,source,identity){
 const value=hydrate(graph),observed=describe(value,identity,source);
 if(JSON.stringify(observed)!==JSON.stringify(receipt))throw Error('Saved checkpoint receipt differs from its exact input and complete state');
 return value;
}
module.exports={hydrate,compact,rank,binding,describe,restore};
