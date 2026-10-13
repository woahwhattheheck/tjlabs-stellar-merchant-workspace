
function sha1Bytes(data){
const n=data.length,total=((n+9+63)>>6)<<6,b=new Uint8Array(total);b.set(data);b[n]=128;const bits=n*8;for(let j=0;j<8;j++)b[total-1-j]=Math.floor(bits/2**(8*j))&255;
let h=[0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0];const w=new Uint32Array(80),rot=(x,n)=>((x<<n)|(x>>>(32-n)))>>>0;
for(let o=0;o<total;o+=64){for(let j=0;j<16;j++){let q=o+4*j;w[j]=((b[q]<<24)|(b[q+1]<<16)|(b[q+2]<<8)|b[q+3])>>>0;}for(let j=16;j<80;j++)w[j]=rot(w[j-3]^w[j-8]^w[j-14]^w[j-16],1);
let[a,c,d,e,f]=h;for(let j=0;j<80;j++){let v,k;if(j<20){v=(c&d)|(~c&e);k=0x5a827999;}else if(j<40){v=c^d^e;k=0x6ed9eba1;}else if(j<60){v=(c&d)|(c&e)|(d&e);k=0x8f1bbcdc;}else{v=c^d^e;k=0xca62c1d6;}const t=(rot(a,5)+v+f+k+w[j])>>>0;f=e;e=d;d=rot(c,30);c=a;a=t;}h=h.map((x,i)=>(x+[a,c,d,e,f][i])>>>0);}
return h.map(x=>x.toString(16).padStart(8,"0")).join("");
}
function makeGrantRuntime(bank,C){
const TextEncoder=class{encode(s){return C.utf8(String(s));}},TextDecoder=class{decode(b){b=b instanceof Uint8Array?b:new Uint8Array(b);return decodeURIComponent(Array.from(b,x=>"%"+x.toString(16).padStart(2,"0")).join(""));}};
function raw64(s){const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",out=[];let value=0,bits=0;for(const ch of s.replace(/\s/g,"")){if(ch==="=")break;const n=abc.indexOf(ch);if(n<0)throw Error("invalid Base64");value=(value<<6)|n;bits+=6;if(bits>=8){bits-=8;out.push((value>>>bits)&255);}}return new Uint8Array(out);}
const btoa=s=>C.base64(Uint8Array.from(s,x=>x.charCodeAt(0))),atob=s=>{const b=raw64(s);let out="";for(let i=0;i<b.length;i+=8192)out+=String.fromCharCode(...b.subarray(i,i+8192));return out;};
const crypto={subtle:{digest:async(algorithm,bytes)=>{bytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const hex=algorithm==="SHA-1"?sha1Bytes(bytes):algorithm==="SHA-256"?C.sha256(bytes):(()=>{throw Error(algorithm);})();return Uint8Array.from(hex.match(/../g),x=>parseInt(x,16)).buffer;}}};
const globalThis={crypto,TextEncoder,TextDecoder};
const records=new Map();
function fail(message){throw Error(message);}
function resolve(base,ref){
 if(!ref.startsWith("./")&&!ref.startsWith("../"))fail("Only selected relative modules are supported: "+ref);
 const parts=base.split("/").slice(0,-1);
 for(const part of ref.split("/")){if(part===".."){if(!parts.length)fail("Module escapes selected source: "+ref);parts.pop();}else if(part!=="."){if(!part)fail("Empty module path segment");parts.push(part);}}
 return parts.join("/");
}
const identifier=/^[A-Za-z_$][\w$]*$/;
function specifiers(raw){
 return raw.split(",").map(x=>x.trim()).filter(Boolean).map(part=>{
  const pair=part.split(/\s+as\s+/);
  if(pair.length>2||!pair.every(x=>identifier.test(x)))fail("Unsupported selected specifier: "+part);
  return {original:pair[0],local:pair[1]||pair[0]};
 });
}
function parse(path,file){
 if(!file||typeof file.content!=="string")fail("Missing complete selected module: "+path);
 let code=file.content;const imports=[],stars=[],explicit=[],ordered=[];
 // Only module declarations at the beginning of a line are transformed. The
 // selected complete 25-module cohort uses named imports/declarations, one
 // named export list and one export-star forwarding module.
 const declarations=/^[ \t]*import\s+(\{[\s\S]*?\})\s+from\s+['"]([^'"]+)['"]\s*;|^[ \t]*export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;/gm;
 code=code.replace(declarations,(whole,named,ref,star,offset)=>{
  const target=resolve(path,ref||star);ordered.push({target,offset});
  if(star)stars.push(target);else for(const s of specifiers(named.slice(1,-1)))imports.push({...s,target});
  return whole.replace(/[^\r\n]/g," ");
 });
 code=code.replace(/^[ \t]*export\s+\{([^}]+)\}\s*;/gm,(whole,list)=>{
  for(const x of specifiers(list))explicit.push({name:x.local,local:x.original});
  return whole.replace(/[^\r\n]/g," ");
 });
 code=code.replace(/^([ \t]*)export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*))/gm,(whole,indent,name)=>{
  explicit.push({name,local:name});return indent+" ".repeat(whole.length-indent.length);
 });
 if(/^[ \t]*(?:import|export)\s/m.test(code))fail("Unsupported module syntax in "+path);
 if(/\bimport\.meta\b|\bimport\s*\(/.test(code))fail("Dynamic module access is outside selected runtime: "+path);
 const locals=new Set();for(const x of imports){if(locals.has(x.local))fail("Duplicate import "+x.local);locals.add(x.local);}
 const names=new Set();for(const x of explicit){if(names.has(x.name))fail("Duplicate export "+x.name);names.add(x.name);}
 return {path,code,imports,stars,explicit,dependencies:[...new Set(ordered.sort((a,b)=>a.offset-b.offset).map(x=>x.target))],
  namespace:Object.create(null),scope:Object.create(null),state:"linked",iterator:null,error:null};
}
for(const [path,file]of Object.entries(bank))records.set(path,parse(path,file));
for(const rec of records.values())for(const path of rec.dependencies)if(!records.has(path))fail("Missing complete dependency "+path+" from "+rec.path);
function exportNames(path,seen=new Set()){
 if(seen.has(path))return new Set();seen=new Set(seen);seen.add(path);
 const rec=records.get(path),names=new Set(rec.explicit.map(x=>x.name));
 for(const target of rec.stars)for(const name of exportNames(target,seen))if(name!=="default")names.add(name);
 return names;
}
function origins(path,name,seen=new Set()){
 const key=path+"\0"+name;if(seen.has(key))return new Set();seen=new Set(seen);seen.add(key);
 const rec=records.get(path),own=rec.explicit.find(x=>x.name===name);
 if(own){const imported=rec.imports.find(x=>x.local===own.local);return imported?origins(imported.target,imported.original,seen):new Set([path+"\0"+own.local]);}
 const found=new Set();for(const target of rec.stars)for(const origin of origins(target,name,seen))found.add(origin);return found;
}
function linkedExport(path,name){
 const found=origins(path,name);if(found.size!==1)fail((found.size?"Ambiguous":"Missing")+" export "+name+" from "+path);
 return records.get(path).namespace[name];
}
for(const rec of records.values()){
 for(const x of rec.imports){if(origins(x.target,x.original).size!==1)fail("Unresolved import "+x.original+" from "+x.target);
  Object.defineProperty(rec.scope,x.local,{enumerable:true,get:()=>linkedExport(x.target,x.original),set:()=>fail("Imported binding is read-only: "+x.local)});
 }
 const getterSource=rec.explicit.map(x=>JSON.stringify(x.name)+":{enumerable:true,get:()=>"+x.local+"}").join(",");
 const body="with(__grantScope){return(function*(){'use strict';Object.defineProperties(__grantExports,{"+getterSource+"});yield;\n"+rec.code+"\n})();}";
 rec.iterator=new Function("__grantScope","__grantExports","TextEncoder","TextDecoder","crypto","globalThis","btoa","atob",body)(
  rec.scope,rec.namespace,TextEncoder,TextDecoder,crypto,globalThis,btoa,atob);
 const suspended=rec.iterator.next();if(suspended.done)fail("Module instantiation did not suspend: "+rec.path);
}
for(const rec of records.values()){
 const own=new Set(rec.explicit.map(x=>x.name));
 for(const name of exportNames(rec.path)){
  if(own.has(name)||origins(rec.path,name).size!==1)continue;
  const target=rec.stars.find(p=>origins(p,name).size===1);
  Object.defineProperty(rec.namespace,name,{enumerable:true,get:()=>linkedExport(target,name)});
 }
 Object.freeze(rec.namespace);Object.preventExtensions(rec.scope);
}
function evaluate(path){
 const rec=records.get(path);if(!rec)fail("Missing selected module "+path);
 if(rec.state==="evaluated"||rec.state==="evaluating")return rec.namespace;
 if(rec.state==="failed")throw rec.error;
 rec.state="evaluating";
 try{for(const dependency of rec.dependencies)evaluate(dependency);const result=rec.iterator.next();if(!result.done)fail("Unexpected top-level yield in "+path);rec.state="evaluated";return rec.namespace;}
 catch(error){rec.state="failed";rec.error=error;throw error;}
}
return {mod:evaluate,TextEncoder,TextDecoder,crypto,sha1:sha1Bytes,
 moduleStates:()=>[...records.values()].map(r=>({path:r.path,state:r.state,exports:Object.keys(r.namespace),dependencies:r.dependencies.slice()}))};
}
