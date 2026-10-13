// MIT. Bounded regular-member TAR transport for complete original Support handovers.
import {SUPPORT_HANDOVER_DOCUMENT,SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES,SUPPORT_HANDOVER_MAX_ARCHIVE_BYTES,
  supportHandoverError,supportHandoverPath,supportHandoverJSON,supportHandoverMembers,
  inspectSupportOperatingHandover,verifySupportOperatingHandover,supportHandoverFileIdentity} from './support-operating-handover.mjs';
import {supportHandoverDigestFile} from './support-operating-handover-hash.mjs';
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}),ZERO=new Uint8Array(512);
const need=(ok,message)=>{if(!ok)throw supportHandoverError('SUPPORT_HANDOVER_ARCHIVE',message);};
const pad=n=>(512-n%512)%512;
const identitySame=(a,b)=>a?.path===b.path&&a?.bytes===b.bytes&&a?.sha256===b.sha256;
function octal(block,at,length,value){
  need(Number.isSafeInteger(value)&&value>=0,'Invalid TAR numeric value.');
  const word=value.toString(8);need(word.length<length,'The selected regular member exceeds the TAR size field.');
  block.set(enc.encode(word.padStart(length-1,'0')+'\0'),at);
}
function header(path,size,type='0'){
  const h=new Uint8Array(512),name=enc.encode(path);need(name.length<=100,'Internal TAR member name is too long.');
  h.set(name,0);octal(h,100,8,0o600);octal(h,108,8,0);octal(h,116,8,0);octal(h,124,12,size);octal(h,136,12,0);
  h.fill(32,148,156);h[156]=type.charCodeAt(0);h.set(enc.encode('ustar\0'),257);h.set(enc.encode('00'),263);
  const checksum=h.reduce((a,b)=>a+b,0);h.set(enc.encode(checksum.toString(8).padStart(6,'0')+'\0 '),148);return h;
}
function paxPath(path){
  const body='path='+path+'\n',bytes=enc.encode(body);let length=bytes.length+2;
  for(;;){const next=String(length).length+1+bytes.length;if(next===length)break;length=next;}
  return enc.encode(String(length)+' '+body);
}
function memberParts(path,blob,index){
  supportHandoverPath(path);const parts=[];
  if(enc.encode(path).length>100||/[^\x20-\x7e]/.test(path)){
    const pax=paxPath(path);parts.push(header('.pax/'+index,pax.length,'x'),pax,new Uint8Array(pad(pax.length)));
    parts.push(header('member-'+index,blob.size));
  }else parts.push(header(path,blob.size));
  parts.push(blob,new Uint8Array(pad(blob.size)));return parts;
}
/** Creates a Blob from original File slices and small headers, never a complete archive ArrayBuffer. */
export async function prepareSupportHandoverArchive(value,read,{signal,digestFile=supportHandoverDigestFile}={}){
  const verified=await verifySupportOperatingHandover(value,read,{signal,digestFile});
  const document=new Blob([supportHandoverJSON(verified.handover)],{type:'application/json'});
  need(document.size<=SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES,'The complete handover metadata exceeds 256 MiB.');
  const documentFile=await supportHandoverFileIdentity(SUPPORT_HANDOVER_DOCUMENT,document,{signal,digestFile});
  const selected=[{...documentFile,blob:document}];
  for(const ref of verified.files){
    signal?.throwIfAborted();const blob=await read(ref.path);need(blob&&blob.size===ref.bytes,'The selected member changed before archive creation.');
    selected.push({...ref,blob});
  }
  const parts=[];
  for(let index=0;index<selected.length;index++)parts.push(...memberParts(selected[index].path,selected[index].blob,index));
  parts.push(ZERO,ZERO);
  const byteCount=parts.reduce((n,part)=>n+(part.size??part.byteLength),0);
  need(byteCount<=SUPPORT_HANDOVER_MAX_ARCHIVE_BYTES,'The complete archive exceeds 16 GiB.');
  return {...verified,parts,documentFile,byteCount};
}
export async function createSupportHandoverArchive(value,read,options={}){
  const prepared=await prepareSupportHandoverArchive(value,read,options);
  const archive=new Blob(prepared.parts,{type:'application/x-tar'});
  // Reopen the exact constructed Blob, so a mutable reader cannot substitute different bytes after its first check.
  const reopened=await readSupportHandoverArchive(archive,options);
  need(identitySame(reopened.documentFile,prepared.documentFile),'The constructed handover document changed.');
  return reopened;
}
async function slice(blob,from,length,signal){
  signal?.throwIfAborted();need(Number.isSafeInteger(from)&&length>=0&&from+length<=blob.size,'The archive ended inside a selected member.');
  const bytes=new Uint8Array(await blob.slice(from,from+length).arrayBuffer());need(bytes.length===length,'The archive changed while reading.');return bytes;
}
function field(h,at,length){
  const end=h.indexOf(0,at),stop=end<0||end>=at+length?at+length:end;
  return dec.decode(h.subarray(at,stop));
}
function number(h,at,length){
  const value=field(h,at,length).trim();need(/^[0-7]+$/.test(value),'Unsupported TAR number encoding.');
  const n=parseInt(value,8);need(Number.isSafeInteger(n),'Unsafe TAR number.');return n;
}
function parseHeader(h){
  need(h.length===512,'Incomplete TAR header.');
  const expected=number(h,148,8),sum=h.reduce((n,b,i)=>n+(i>=148&&i<156?32:b),0);
  need(sum===expected,'TAR header checksum differs.');
  need(field(h,257,6)==='ustar'&&field(h,263,2)==='00','Use the complete regular-member POSIX handover archive.');
  need(field(h,157,100)===''&&field(h,345,155)==='','Links and prefixed headers are not part of this handover format.');
  const type=String.fromCharCode(h[156]);need(type==='0'||type==='x','Only original regular files and explicit path headers are accepted.');
  return {name:field(h,0,100),bytes:number(h,124,12),type};
}
function parsePax(bytes){
  need(bytes.length<=4096,'Path header exceeds its explicit bound.');
  let space=bytes.indexOf(32);need(space>0&&space<8,'Invalid PAX record length.');
  const count=Number(dec.decode(bytes.subarray(0,space)));need(Number.isSafeInteger(count)&&count===bytes.length,'The complete path header differs from its length.');
  const body=dec.decode(bytes.subarray(space+1));need(body.startsWith('path=')&&body.endsWith('\n')&&body.indexOf('\n')===body.length-1,'Only one original path record is accepted.');
  return supportHandoverPath(body.slice(5,-1));
}
/** Parses bounded headers, retains Blob slices, then verifies every exact original member. */
export async function readSupportHandoverArchive(archive,{expectedArchive,signal,digestFile=supportHandoverDigestFile}={}){
  need(archive&&Number.isSafeInteger(archive.size)&&archive.size>=2048&&archive.size<=SUPPORT_HANDOVER_MAX_ARCHIVE_BYTES&&archive.size%512===0,'Choose a complete handover TAR within 16 GiB.');
  if(expectedArchive)need(expectedArchive.path==='handover.tar'&&expectedArchive.bytes===archive.size,'The selected archive length differs.');
  // A bounded sequential header window avoids a separate native file open for
  // every small header/padding read in large original source inventories.
  let windowStart=-1,windowBytes=null;
  const block=async(from,length)=>{
    signal?.throwIfAborted();
    if(!windowBytes||from<windowStart||from+length>windowStart+windowBytes.length){
      windowStart=from;windowBytes=await slice(archive,from,Math.min(1048576,archive.size-from),signal);
    }
    need(from+length<=windowStart+windowBytes.length,'The archive ended inside a selected header.');
    return windowBytes.subarray(from-windowStart,from-windowStart+length);
  };
  const members=new Map();let offset=0,pending=null,ended=false;
  while(offset<archive.size){
    const bytes=await block(offset,512);offset+=512;
    if(bytes.every(b=>b===0)){
      need(pending===null&&!ended&&offset+512===archive.size,'The archive has an incomplete path or unexpected trailing members.');
      need((await block(offset,512)).every(b=>b===0),'The archive needs both complete end blocks.');
      offset+=512;ended=true;break;
    }
    const h=parseHeader(bytes);need(h.bytes>0&&h.bytes<=4*1024*1024*1024,'Invalid complete regular-member length.');
    const bodyEnd=offset+h.bytes,next=bodyEnd+pad(h.bytes);need(next<=archive.size,'The archive ended inside a member.');
    if(h.type==='x'){
      need(pending===null&&h.bytes<=4096,'Repeated or oversized path header.');
      pending=parsePax(await block(offset,h.bytes));
    }else{
      const path=supportHandoverPath(pending??h.name);pending=null;
      need(!members.has(path),'Duplicate archive member: '+path);
      need(members.size<620001,'Archive member limit exceeded.');
      if(members.size===0)need(path===SUPPORT_HANDOVER_DOCUMENT&&h.bytes<=SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES,
        'The first regular member must be the bounded complete HANDOVER.json.');
      members.set(path,archive.slice(offset,bodyEnd));
    }
    if(next>bodyEnd)need((await block(bodyEnd,next-bodyEnd)).every(b=>b===0),'Unexpected nonzero member padding.');
    offset=next;
  }
  need(ended&&offset===archive.size&&members.has(SUPPORT_HANDOVER_DOCUMENT),'The complete archive is missing its document or end marker.');
  const document=members.get(SUPPORT_HANDOVER_DOCUMENT);let raw;
  try{raw=JSON.parse(dec.decode(await document.arrayBuffer()));}catch{throw supportHandoverError('SUPPORT_HANDOVER_JSON','HANDOVER.json must be complete UTF-8 JSON.');}
  const handover=await inspectSupportOperatingHandover(raw),expected=supportHandoverMembers(handover);
  need(members.size===expected.length+1&&expected.every(f=>members.has(f.path)),'The archive must contain exactly the complete selected inventory.');
  const read=async path=>members.get(supportHandoverPath(path));
  const verified=await verifySupportOperatingHandover(handover,read,{signal,digestFile});
  const documentFile=await supportHandoverFileIdentity(SUPPORT_HANDOVER_DOCUMENT,document,{signal,digestFile});
  const archiveFile=await supportHandoverFileIdentity('handover.tar',archive,{signal,digestFile});
  if(expectedArchive)need(identitySame(archiveFile,expectedArchive),'The complete archive SHA-256 differs from its original selection.');
  return {...verified,archive,archiveFile,documentFile,read};
}
