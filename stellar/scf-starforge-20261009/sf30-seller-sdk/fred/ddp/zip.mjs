// MIT. Complete Board ZIP archives: original member bytes, CRCs and names.
import { inflateRawSync } from 'node:zlib';
import { ddpFileName as safeSourceName, ddpHash as sha256 } from './files.mjs';
import { need } from '../model.mjs';
function labError(code,message,detail){ const error=new Error(message);error.code='DDP_'+code;if(detail)error.detail=detail;throw error; }
const CRC=new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let bit=0;bit<8;bit++)c=c&1?0xedb88320^(c>>>1):c>>>1;CRC[i]=c>>>0;}
export function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=CRC[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const uint=(buffer,offset,length)=>length===2?buffer.readUInt16LE(offset):buffer.readUInt32LE(offset);
const check=(condition,message,detail)=>{if(!condition)labError('ZIP',message,detail);};
function filename(bytes,utf8){
  if(!utf8&&bytes.some(byte=>byte>127))labError('ZIP_NAME_ENCODING','Use UTF-8 or ASCII original ZIP member names.');
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{labError('ZIP_NAME_ENCODING','A source member name is not valid UTF-8.');}
}
export function readFredDdpZip(input,{maxArchiveBytes=268435456,maxBytes=536870912,maxMembers=1024,signal}={}){
  check(input instanceof Uint8Array,'Supply the complete original ZIP bytes.');
  const bytes=Buffer.from(input.buffer,input.byteOffset,input.byteLength);
  check(bytes.length>=22&&bytes.length<=maxArchiveBytes,'The input archive exceeds the declared ZIP size allowance.');
  let end=-1;
  for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--){
    if(uint(bytes,offset,4)===0x06054b50&&offset+22+uint(bytes,offset+20,2)===bytes.length){end=offset;break;}
  }
  check(end>=0,'The source ZIP end record is incomplete.');
  check(uint(bytes,end+4,2)===0&&uint(bytes,end+6,2)===0,'Select a single-volume source ZIP.');
  const count=uint(bytes,end+10,2),centralSize=uint(bytes,end+12,4),centralOffset=uint(bytes,end+16,4);
  check(count===uint(bytes,end+8,2)&&count<=maxMembers&&count!==65535&&centralOffset!==0xffffffff&&centralSize!==0xffffffff,
    'ZIP64, multi-volume or excessive member inputs are outside this file profile.');
  check(centralOffset+centralSize===end,'The complete source central directory must precede its end record.');
  let offset=centralOffset,logical=0;
  const files=[],names=new Set(),ranges=[];
  for(let index=0;index<count;index++){
    signal?.throwIfAborted();
    check(offset+46<=end&&uint(bytes,offset,4)===0x02014b50,'A source ZIP central record is invalid.');
    const flags=uint(bytes,offset+8,2),method=uint(bytes,offset+10,2),crc=uint(bytes,offset+16,4);
    const compressed=uint(bytes,offset+20,4),size=uint(bytes,offset+24,4);
    const nameLength=uint(bytes,offset+28,2),extraLength=uint(bytes,offset+30,2),commentLength=uint(bytes,offset+32,2);
    const localOffset=uint(bytes,offset+42,4),next=offset+46+nameLength+extraLength+commentLength;
    check(next<=end&&nameLength>0,'A source member name or metadata is incomplete.');
    check(!(flags&1)&&!(flags&0x40)&&[0,8].includes(method),'The profile accepts unencrypted stored or deflated members.');
    check(uint(bytes,offset+34,2)===0&&size!==0xffffffff&&compressed!==0xffffffff&&localOffset!==0xffffffff,
      'ZIP64 or split member records are outside this file profile.');
    const nameBytes=bytes.subarray(offset+46,offset+46+nameLength),name=filename(nameBytes,Boolean(flags&0x800));
    const directory=name.endsWith('/');
    safeSourceName(directory?name.slice(0,-1):name);
    check(!names.has(name),'Source ZIP member names must be unique.',{filename:name});names.add(name);
    const mode=(uint(bytes,offset+38,4)>>>16)&0xf000;
    check(mode!==0xa000,'Symbolic links are not native lab source files.',{filename:name});
    check(localOffset+30<=centralOffset&&uint(bytes,localOffset,4)===0x04034b50,'A source local ZIP record is invalid.');
    const localNameLength=uint(bytes,localOffset+26,2),localExtraLength=uint(bytes,localOffset+28,2);
    const start=localOffset+30+localNameLength+localExtraLength,stop=start+compressed;
    check(stop<=centralOffset&&uint(bytes,localOffset+8,2)===method&&uint(bytes,localOffset+6,2)===flags,
      'Local and central source member definitions disagree.');
    check(localNameLength===nameLength&&bytes.subarray(localOffset+30,localOffset+30+localNameLength).equals(nameBytes),
      'Local and central original member names disagree.');
    if(!(flags&8))check(uint(bytes,localOffset+14,4)===crc&&uint(bytes,localOffset+18,4)===compressed&&uint(bytes,localOffset+22,4)===size,
      'Local and central original member hashes or sizes disagree.');
    check(size<=maxBytes-logical,'Decoded source members exceed their declared complete input allowance.');
    let rangeStop=stop;
    if(flags&8){
      const signed=stop+4<=centralOffset&&uint(bytes,stop,4)===0x08074b50,base=stop+(signed?4:0);
      check(base+12<=centralOffset&&uint(bytes,base,4)===crc&&uint(bytes,base+4,4)===compressed&&uint(bytes,base+8,4)===size,
        'The original ZIP data descriptor disagrees with its central record.');
      rangeStop=base+12;
    }
    ranges.push([localOffset,rangeStop]);
    const packed=bytes.subarray(start,stop);
    let raw;
    try{raw=method===0?Buffer.from(packed):inflateRawSync(packed,{maxOutputLength:Math.max(1,maxBytes-logical)});}
    catch{labError('ZIP_DEFLATE','An original member cannot be fully decoded within the declared allowance.',{filename:name});}
    check(raw.length===size&&crc32(raw)===crc,'A complete original member failed its ZIP size or CRC check.',{filename:name});
    logical+=raw.length;
    if(directory)check(raw.length===0,'A ZIP directory has unexpected file content.');
    else files.push({filename:name,bytes:raw,sha256:sha256(raw),mediaType:/\.(?:csv|tsv|txt)$/i.test(name)?'text/plain':'application/octet-stream'});
    offset=next;
  }
  check(offset===centralOffset+centralSize,'Unexpected bytes remain in the source central directory.');
  ranges.sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<ranges.length;i++)check(ranges[i][0]>=ranges[i-1][1],'Original ZIP file ranges overlap.');
  return files;
}
