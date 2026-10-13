// MIT. Private original-file custody for the installed Tourism client.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
export function need(ok,message,code='TOURISM_AGENT_INPUT'){if(!ok)throw Object.assign(new Error(message),{code});}
export const clone=value=>JSON.parse(JSON.stringify(value));
export function absolute(value,label){need(typeof value==='string'&&path.isAbsolute(value),'Select an absolute '+label+'.');return path.resolve(value);}
export function regular(file,maximum=134217728){
 const first=fs.lstatSync(file,{bigint:true});need(first.isFile()&&!first.isSymbolicLink()&&first.size<=BigInt(maximum),'Read the complete regular selected file within its declared size.');
 const bytes=fs.readFileSync(file),last=fs.lstatSync(file,{bigint:true});
 need(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>first[k]===last[k])&&BigInt(bytes.length)===first.size,'The original file changed while being read.','TOURISM_AGENT_FILE_CHANGED');return bytes;
}
export function utf8(bytes){const text=bytes.toString('utf8');need(Buffer.from(text,'utf8').equals(bytes),'Retain complete original UTF-8 text.');return text;}
export function optional(file,maximum){try{return regular(file,maximum);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export function syncDirectory(directory){let fd;try{fd=fs.openSync(directory,'r');fs.fsyncSync(fd);}catch(error){if(!['EINVAL','EPERM','EISDIR','ENOTSUP'].includes(error.code))throw error;}finally{if(fd!==undefined)fs.closeSync(fd);}}
export function directory(root){fs.mkdirSync(root,{recursive:true,mode:0o700});const stat=fs.lstatSync(root);need(stat.isDirectory()&&!stat.isSymbolicLink(),'Use an ordinary private operation directory.');return fs.realpathSync(root);}
export function publish(file,bytes){
 bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes,'utf8');need(bytes.length<=512*1024*1024,'The complete native output exceeds its 512 MiB publication ceiling.');const before=optional(file,512*1024*1024);
 if(before){need(before.equals(bytes),'Retain the exact original prepared operation or output.','TOURISM_AGENT_OPERATION_CONFLICT');return;}
 directory(path.dirname(file));const tmp=file+'.'+randomUUID()+'.pending';let fd;
 try{fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  try{fs.linkSync(tmp,file);}catch(error){if(error.code!=='EEXIST')throw error;need(regular(file,512*1024*1024).equals(bytes),'A concurrent original operation differs.','TOURISM_AGENT_OPERATION_CONFLICT');}syncDirectory(path.dirname(file));
 }finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(tmp,{force:true});}
}
export const json=value=>JSON.stringify(value,null,2)+'\n';
export function page(rows,{offset=0,limit=50}={}){
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,'Select a complete page of 1–200 rows at a nonnegative offset.');
 const items=rows.slice(offset,offset+limit),result={items,total:rows.length,offset,nextOffset:offset+items.length<rows.length?offset+items.length:null};
 need(Buffer.byteLength(JSON.stringify(result))<=512*1024,'This complete page exceeds the tool response size. Reduce the page or use file_read for the full original.','TOURISM_AGENT_USE_FILE_READ');return result;
}
