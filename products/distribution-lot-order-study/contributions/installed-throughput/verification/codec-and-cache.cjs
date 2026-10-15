'use strict';
module.exports=function verify({before,after,loadModule}){
 const codec=s=>Function(s.replace(/^export .*$/gm,'')+';return {utf8Encode,sha256Bytes,hashText};')(),A=codec(before['host/codec.mjs']),B=codec(after['host/codec.mjs']),O=loadModule(before)('sha256.cjs'),S=loadModule(after)('sha256.cjs'),checks=[],check=(name,ok)=>{if(!ok)throw Error(name);checks.push({name,passed:true});};
 const texts=['','\0','abc','\ufeffid,name\r\nO-1,café 水\r\n','😀𝄞\ud800A\udc00',Array.from({length:65536},(_,i)=>String.fromCharCode(i)).join(''),...'55,56,63,64,65'.split(',').map(n=>'x'.repeat(Number(n)))];
 for(const text of texts){const a=A.utf8Encode(text),b=B.utf8Encode(text);check('Exact Unicode/boundary transport bytes and SHA '+checks.length,a.length===b.length&&a.every((v,i)=>v===b[i])&&A.sha256Bytes(a)===B.sha256Bytes(b)&&A.hashText(text)===B.hashText(text));}
 for(const text of ['','hello','\ufeffcafé 水😀\r\n']){const a=S.sha256Utf8(text),truth=O.sha256Utf8(text);a.bytes=-1;a.sha256='changed';check('Isolated exact-text digest result '+checks.length,JSON.stringify(S.sha256Utf8(text))===JSON.stringify(truth));}
 let rejected=0;for(const value of ['\ud800','\udc00',7])try{S.sha256Utf8(value)}catch{rejected++;}check('Original invalid Unicode and type rejection',rejected===3);
 for(let i=0;i<4100;i++)S.sha256Utf8('bounded eviction '+i);check('Exact digest after bounded cache eviction',JSON.stringify(S.sha256Utf8('hello'))===JSON.stringify(O.sha256Utf8('hello')));
 const bytes=new Uint8Array([1,2,3]),first=S.sha256Bytes(bytes).sha256;bytes[0]=9;check('Mutable binary input remains uncached',first!==S.sha256Bytes(bytes).sha256&&S.sha256Bytes(bytes).sha256===O.sha256Bytes(bytes).sha256);
 check('Transport ordinary byte-array compatibility',A.sha256Bytes([0,128,255])===B.sha256Bytes([0,128,255]));
 return{execution:'Actual old/new pure-JavaScript codec and pinned SHA wrapper',checks};
};
