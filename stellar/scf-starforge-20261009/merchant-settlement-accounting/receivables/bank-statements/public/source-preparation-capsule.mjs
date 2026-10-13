// SPDX-License-Identifier: MIT
// Shared complete-byte receiver for the original Bank source-preparation capsule.
import {requestSha256} from './source-preparation-state.mjs';
export const PREPARATION_CAPSULE_MAX_BYTES=268435456;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function bytesSha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function encodeWholeBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
export function decodeWholeBase64(text){
 if(typeof text!=='string'||text.length%4!==0)throw new Error('A complete capsule member has invalid base64.');
 const padding=text.endsWith('==')?2:text.endsWith('=')?1:0,end=text.length-padding;
 for(let offset=0;offset<end;offset+=65536)if(/[^A-Za-z0-9+/]/.test(text.slice(offset,Math.min(end,offset+65536))))throw new Error('A complete capsule member has invalid base64.');
 if(padding&&end<2)throw new Error('A complete capsule member has invalid base64.');
 const out=new Uint8Array(text.length/4*3-padding);let position=0;
 for(let offset=0;offset<text.length;offset+=65536){const binary=atob(text.slice(offset,offset+65536));for(let i=0;i<binary.length;i++)out[position++]=binary.charCodeAt(i);}
 if(position!==out.length)throw new Error('A complete capsule member has invalid base64.');return out;
}
export async function verifyPreparationCapsuleBytes(raw){
 if(!(raw instanceof Uint8Array)||raw.byteLength>PREPARATION_CAPSULE_MAX_BYTES)throw new Error('Open a complete source-preparation capsule within the 256 MiB browser receiving limit.');
 const wholeSha=await bytesSha256(raw),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),r=value?.receipt;
 if(value?.schema!=='stellar-forge.bank-source-capsule.v1'||!r||r.state!=='COMPLETE'||r.schema!=='stellar-forge.accounting-bank-source-preparation.v1'||!/^[a-f0-9]{64}$/.test(r.workspaceId)||!Array.isArray(r.files)||r.files.length>4101||!Array.isArray(value.files)||value.files.length!==r.files.length)throw new Error('Open the complete original preparation capsule and its exact COMPLETE receipt.');
 const files=new Map(),names=new Set();
 for(let i=0;i<r.files.length;i++){
  const p=r.files[i],f=value.files[i];
  if(typeof p.name!=='string'||!p.name||p.name==='.'||p.name==='..'||/[\\/\u0000-\u001f]/.test(p.name)||names.has(p.name)||!Number.isSafeInteger(p.bytes)||p.bytes<0||p.bytes>192000000||!(/^[a-f0-9]{64}$/).test(p.sha256)||!['request','input','output','result'].includes(p.role)||f?.encoding!=='base64'||f.name!==p.name||f.bytes!==p.bytes||f.sha256!==p.sha256||f.role!==p.role)throw new Error('The capsule inventory differs from its original receipt.');
  names.add(p.name);const bytes=decodeWholeBase64(f.contentBase64);if(bytes.length!==p.bytes||await bytesSha256(bytes)!==p.sha256)throw new Error('The complete original member differs: '+p.name);files.set(p.name,{...p,bytesValue:bytes});
 }
 const read=name=>{const f=files.get(name);if(!f)throw new Error('The original capsule omits '+name);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(f.bytesValue));};
 const request=read('request.json'),intent=read('intent.json'),result=read('result.json');
 if(request.workspaceId!==r.workspaceId||request.requestId!==r.preparationId||request.actor!==r.actor||request.kind!==r.kind||await requestSha256(request)!==r.requestSha256||intent.workspaceId!==r.workspaceId||intent.preparationId!==r.preparationId||intent.sourceSha256!==r.sourceSha256||!same(intent.request,request)||intent.requestSha256!==r.requestSha256)throw new Error('The original request, intent and receipt are not one preparation.');
 const resultPin=r.files.find(x=>x.name==='result.json'),baseReceipt={...r};delete baseReceipt.workspace;baseReceipt.files=r.files.filter(x=>x.name!=='result.json');
 if(await requestSha256(baseReceipt)!==await requestSha256(result)||!resultPin)throw new Error('The frozen result differs from the complete delivered receipt.');
 if(!Array.isArray(intent.sourceFiles)||await requestSha256(intent.sourceFiles)!==intent.sourceSha256)throw new Error('The original operating-source inventory changed.');
 if(!Array.isArray(r.inputs)||r.inputs.length!==request.inputs.length||!same(r.inputs,intent.inputs))throw new Error('The complete original input inventory differs.');
 for(let i=0;i<request.inputs.length;i++){const pin=request.inputs[i],input=r.inputs[i],member=files.get('input-'+pin.key+'.bin');if(!member||input.key!==pin.key||input.name!==pin.name||input.bytes!==pin.bytes||input.sha256!==pin.sha256||input.file!==member.name||member.bytes!==pin.bytes||member.sha256!==pin.sha256)throw new Error('The capsule is missing an exact original input.');}

 return {value,receipt:r,files,sha256:wholeSha,bytes:raw.byteLength,request,intent,result};
}
