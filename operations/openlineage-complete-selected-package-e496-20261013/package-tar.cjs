// MIT. USTAR packaging around the unchanged original SF82 tar header.
// The only extensions are declared file modes and the standard USTAR prefix field.
function packageTar(files, originalHeaderSource, {utf8,utf8Text}) {
  class Bytes extends Uint8Array {
    write(value,offset=0,length,encoding='utf8') {
      if(typeof length==='string'){encoding=length;length=undefined;}
      if(!['utf8','utf-8','ascii'].includes(encoding))throw Error('Unsupported archive encoding');
      const data=utf8(value), maximum=length??this.length-offset;
      if(data.length>maximum || offset+data.length>this.length)throw Error('Archive header field is too long');
      this.set(data,offset);return data.length;
    }
  }
  const Buffer={alloc:n=>new Bytes(n),byteLength:v=>utf8(v).length};
  const tarHeader=new Function('Buffer','failure','return ('+originalHeaderSource+');')(Buffer,
    (code,message)=>Object.assign(Error(message),{code}));
  const segments=[], names=new Set();
  let total=1024;
  for(const file of files) {
    const full='package/'+file.path;
    if(!/^[\x21-\x7e]+$/.test(full)||full.includes('\\')||full.split('/').some(x=>!x||x==='.'||x==='..')||names.has(full))
      throw Error('Invalid or duplicate package member: '+full);
    names.add(full);
    let name=full,prefix='';
    if(utf8(name).length>100) {
      const parts=full.split('/');
      while(parts.length>1 && utf8(parts.join('/')).length>100)
        prefix+=(prefix?'/':'')+parts.shift();
      name=parts.join('/');
      if(utf8(prefix).length>155 || utf8(name).length>100)throw Error('Package path exceeds USTAR fields');
    }
    const header=tarHeader(name,file.bytes.length,'2000-01-01T00:00:00.000Z');
    header.write(file.mode.toString(8).padStart(7,'0')+'\0',100,8,'ascii');
    if(prefix)header.write(prefix,345,155,'utf8');
    header.fill(32,148,156);
    header.write(header.reduce((n,x)=>n+x,0).toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');
    const padding=new Uint8Array((512-file.bytes.length%512)%512);
    segments.push(header,file.bytes,padding);total+=512+file.bytes.length+padding.length;
  }
  if(total>128*1024*1024)throw Error('Package exceeds the original source limit');
  const result=new Uint8Array(total);let offset=0;
  for(const part of segments){result.set(part,offset);offset+=part.length;}
  return result;
}
function readPackageTar(bytes,{utf8Text}) {
  if(bytes.length%512)throw Error('Truncated tar records');
  const files=[],seen=new Set();let offset=0,ended=false;
  const string=(header,start,length)=>utf8Text(header.subarray(start,start+length)).replace(/\0.*$/s,'');
  const octal=(header,start,length)=>{
    const value=string(header,start,length).trim();
    if(!/^[0-7]+$/.test(value))throw Error('Invalid tar octal field');
    const number=parseInt(value,8);if(!Number.isSafeInteger(number))throw Error('Tar number out of range');return number;
  };
  while(offset<bytes.length){
    const header=bytes.subarray(offset,offset+512);
    if(header.every(x=>x===0)){
      if(bytes.length-offset<1024 || !bytes.subarray(offset).every(x=>x===0))throw Error('Invalid tar terminator');
      ended=true;break;
    }
    const checksum=octal(header,148,8);
    if(header.reduce((n,x,i)=>n+(i>=148&&i<156?32:x),0)!==checksum)throw Error('Tar checksum changed');
    if(string(header,257,6)!=='ustar'||string(header,263,2)!=='00'||header[156]!==48)throw Error('Unexpected tar member type');
    const prefix=string(header,345,155),name=(prefix?prefix+'/':'')+string(header,0,100);
    if(!name.startsWith('package/')||name.includes('\\')||name.split('/').some(x=>!x||x==='.'||x==='..')||seen.has(name))
      throw Error('Invalid tar package path');
    seen.add(name);
    const size=octal(header,124,12),mode=octal(header,100,8);
    if(size>4*1024*1024 || ![0o644,0o755].includes(mode))throw Error('Unexpected package size or mode');
    const start=offset+512,end=start+size,next=start+Math.ceil(size/512)*512;
    if(next>bytes.length || !bytes.subarray(end,next).every(x=>x===0))throw Error('Invalid tar member padding');
    files.push({path:name.slice(8),mode,bytes:bytes.slice(start,end)});offset=next;
  }
  if(!ended||files.length>10000)throw Error('Incomplete package archive');
  return files;
}
if(typeof module==='object')module.exports={packageTar,readPackageTar};
