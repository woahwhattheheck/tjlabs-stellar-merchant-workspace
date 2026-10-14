/* MIT. Explicit browser bytes adapter around complete maintained Research contracts and preparation functions. */
function createNativeResearch(options) {
 "use strict";
 const {codec}=options,structuredClone=v=>JSON.parse(JSON.stringify(v));
 function encode(value){return codec.utf8Encode(String(value).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,"\uFFFD"));}
 function decode(bytes){for(let i=0;i<bytes.length;){const b=bytes[i++];if(b<128)continue;let n;if(b>=194&&b<=223)n=1;else if(b>=224&&b<=239)n=2;else if(b>=240&&b<=244)n=3;else throw Error("OUTPUT_UTF8_INVALID");if(i+n>bytes.length)throw Error("OUTPUT_UTF8_INVALID");const second=bytes[i];if(b===224&&second<160||b===237&&second>=160||b===240&&second<144||b===244&&second>=144)throw Error("OUTPUT_UTF8_INVALID");for(let j=0;j<n;j++)if((bytes[i++]&192)!==128)throw Error("OUTPUT_UTF8_INVALID");}return codec.utf8Decode(bytes);}
 class Bytes extends Uint8Array {toString(encoding="utf8"){if(encoding==="base64")return codec.toBase64(this);if(encoding==="utf8"||encoding==="utf-8")return decode(this);throw Error("RESEARCH_BYTE_ENCODING");}equals(other){return this.length===other.length&&this.every((v,i)=>v===other[i]);}}
 const Buffer={from(value,encoding="utf8"){let b;if(typeof value==="string"){if(encoding==="base64")b=codec.fromBase64(value);else if(encoding==="utf8"||encoding==="utf-8")b=encode(value);else throw Error("RESEARCH_BYTE_ENCODING");}else if(value instanceof Uint8Array||Array.isArray(value))b=value;else throw Error("RESEARCH_BYTES_REQUIRED");return Bytes.from(b);},isBuffer(value){return value instanceof Bytes;},byteLength(value){return encode(value).length;}};
 const TextDecoder=class {constructor(encoding="utf-8",options={}){if(!["utf-8","utf8"].includes(encoding))throw Error("RESEARCH_BYTE_ENCODING");this.keepBom=Boolean(options.ignoreBOM);}decode(b){const s=decode(b);return this.keepBom?s:s.replace(/^\uFEFF/,"");}};
 function createHash(algorithm){if(algorithm!=="sha256")throw Error("RESEARCH_HASH_ALGORITHM");const chunks=[];return {update(b){chunks.push(Buffer.from(b));return this;},digest(encoding){if(encoding!=="hex")throw Error("RESEARCH_HASH_ENCODING");const bytes=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}return codec.sha256Bytes(bytes);}};}
 const digest=b=>codec.sha256Bytes(b),need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});},object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
 function jsonBytes(value){const t=JSON.stringify(value,(_key,item)=>{need(item!==undefined&&typeof item!=="function"&&typeof item!=="symbol"&&typeof item!=="bigint","JSON_VALUES_REQUIRED");need(typeof item!=="number"||Number.isFinite(item),"JSON_VALUES_REQUIRED");return item;},2);return Buffer.from(t+"\n");}
 const resolve=(base,path)=>{const raw=path===undefined?base:(String(base).replace(/\/$/,"")+"/"+path);const names=[];for(const part of raw.split("/")){if(!part||part===".")continue;if(part==="..")throw Error("RESEARCH_PATH_ESCAPE");names.push(part);}return "/"+names.join("/");};
 const original=async()=>{throw Error("RESEARCH_ORIGINAL_READER_REQUIRED");};
 const contract=(()=>{
__CONTRACTS__
return {parseRun,caseDefinition,candidateDefinition,sourceRefs,id,safePath};
 })();
 const preparing=(()=>{const {parseRun,caseDefinition,candidateDefinition,sourceRefs,id,safePath}=contract;
__HELPERS__
__PURE__
__REVIEW__
return {csvRecords,mapTable,prepareOutput,reviewHtml};
 })();
 return {...contract,...preparing,Buffer,resolve};
}
